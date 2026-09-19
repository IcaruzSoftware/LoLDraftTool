import type { Position } from '../data/types';
import type { Champion, Counter, CuratedTags, Synergy, TagKey } from '../data/curatedTypes';
import type { DraftState } from './draft';
import { currentStep, isAvailable } from './draft';
import type { RoleInference } from './roles';
import type { PoolTier, TeamPool } from './pool';
import { poolTier } from './pool';
import type { OpponentData } from './opponents';
import { opponentThreat } from './opponents';
import type { Archetype, ArchetypeScores, TagWeights, TeamProfile } from './profile';
import {
  ARCHETYPE_LABEL,
  ARCHETYPE_SIGNALS,
  RPS,
  detectArchetypes,
  hygieneWarnings,
  needsWeights,
  tagVal,
  teamProfile,
} from './profile';
import type { HygieneWarning } from './profile';
import { SKIP_ID } from './draft';

/** Everything the recommender needs for one turn. */
export interface RecommendContext {
  state: DraftState;
  champions: Map<number, Champion>;
  synergies: Synergy[];
  counters: Counter[];
  pool: TeamPool;
  opponents?: OpponentData;
  /** Our picks assigned to roles (see assignOurRoles). */
  ourRoles: RoleInference;
  /** Enemy picks inferred to roles (see inferEnemyRoles). */
  enemyRoles: RoleInference;
}

/** A scored recommendation with a role, human reasons and raw components. */
export interface Recommendation {
  championId: number;
  role?: Position;
  score: number;
  reasons: string[];
  components: Record<string, number>;
}

/** Output of {@link draftSummary}. */
export interface DraftSummary {
  ourArchetypes: ArchetypeScores;
  enemyArchetypes: ArchetypeScores;
  compTargetText: string;
  warnings: HygieneWarning[];
}

const META_TIER_SCORE: Record<string, number> = { S: 1.0, A: 0.6, B: 0.2, C: -0.1, D: -0.5 };
const ROLE_SCALE: Record<Position, number> = { top: 1.0, mid: 0.7, jungle: 0.5, bot: 0.5, support: 0.5 };

/** Display names for tags that appear in reason strings. */
const TAG_DISPLAY: Partial<Record<TagKey, string>> = {
  engage: 'engage',
  dive: 'dive',
  gapClose: 'gap-close',
  disengage: 'disengage',
  counterEngage: 'counter-engage',
  peel: 'peel',
  burst: 'burst',
  sustainedDps: 'sustained DPS',
  poke: 'poke',
  aoeDamage: 'AoE damage',
  antiTank: 'anti-tank',
  antiHeal: 'anti-heal',
  hardCc: 'hard CC',
  aoeCc: 'AoE CC',
  pickCc: 'lockdown',
  global: 'global pressure',
  semiGlobal: 'map pressure',
  roam: 'roam',
  splitpush: 'split-push',
  duelist: 'duelling',
  waveclear: 'waveclear',
  siege: 'siege',
  visionControl: 'vision control',
  frontline: 'frontline',
  sustain: 'sustain',
  shieldHeal: 'shields/heals',
  spellShield: 'spell shield',
};

interface Reason {
  text: string;
  weight: number;
}

function display(key: TagKey): string {
  return TAG_DISPLAY[key] ?? key;
}

/** Resolves locked pick championIds to Champion records (skips SKIP_ID/unknown). */
function lockedChampions(picks: { championId: number }[], champions: Map<number, Champion>): Champion[] {
  const out: Champion[] = [];
  for (const p of picks) {
    if (p.championId === SKIP_ID) continue;
    const c = champions.get(p.championId);
    if (c) out.push(c);
  }
  return out;
}

/** Weighted sum of a champion's tags against a weight vector, plus the top contributor. */
function weightedTagSum(
  tags: CuratedTags,
  weights: TagWeights,
): { sum: number; top?: { key: TagKey; contribution: number } } {
  let sum = 0;
  let top: { key: TagKey; contribution: number } | undefined;
  for (const k in weights) {
    const key = k as TagKey;
    const w = weights[key];
    if (!w) continue;
    const contribution = tagVal(tags, key) * w;
    if (contribution) {
      sum += contribution;
      if (!top || contribution > top.contribution) top = { key, contribution };
    }
  }
  return { sum, top };
}

/** Combines primary (×1) and secondary (×0.5) RPS entries for the enemy archetype. */
function combineRps(arch: ArchetypeScores): { desired: TagWeights; undesired: TagWeights; label: string } {
  const desired: TagWeights = {};
  const undesired: TagWeights = {};
  const merge = (src: TagWeights, dst: TagWeights, mult: number) => {
    for (const k in src) {
      const key = k as TagKey;
      dst[key] = (dst[key] ?? 0) + (src[key] ?? 0) * mult;
    }
  };
  let label = '';
  if (arch.primary) {
    merge(RPS[arch.primary].desired, desired, 1);
    merge(RPS[arch.primary].undesired, undesired, 1);
    label = RPS[arch.primary].label;
  }
  if (arch.secondary) {
    merge(RPS[arch.secondary].desired, desired, 0.5);
    merge(RPS[arch.secondary].undesired, undesired, 0.5);
  }
  return { desired, undesired, label };
}

/** Selects the top positive reasons (max 4), appending a fallback if none qualify. */
function topReasons(reasons: Reason[], fallback: string): string[] {
  const positive = reasons.filter((r) => r.weight > 0.15).sort((a, b) => b.weight - a.weight);
  const picked = positive.slice(0, 4).map((r) => r.text);
  return picked.length > 0 ? picked : [fallback];
}

/** Meta-ban weight when there is no opponent scouting: bp 3->2.5, 2->1.5, 1->0.5. */
function metaBanNoScouting(banPriority: number): number {
  if (banPriority >= 3) return 2.5;
  if (banPriority >= 2) return 1.5;
  if (banPriority >= 1) return 0.5;
  return 0;
}

/** All champion ids in our pool for a role (any tier). */
function poolIds(pool: TeamPool, role: Position): number[] {
  const rp = pool[role];
  return [...rp.comfort, ...rp.good, ...rp.okay];
}

/**
 * Recommends picks for the current turn. Candidates come from our pool for each
 * open role (a champion in several role pools is scored per role, best kept); if
 * a role's pool is empty, all available champions playable in that role are used.
 * Deterministic: sorted by score desc, then champion name asc.
 */
export function recommendPicks(ctx: RecommendContext): Recommendation[] {
  const { state, champions, synergies, counters, pool, ourRoles, enemyRoles } = ctx;
  const ourChamps = lockedChampions(state.picks.us, champions);
  const enemyChamps = lockedChampions(state.picks.them, champions);
  const ourProfile = teamProfile(ourChamps);
  const enemyProfile = teamProfile(enemyChamps);
  const enemyArch = detectArchetypes(enemyProfile, enemyChamps.length);
  const needs = needsWeights(ourProfile, enemyProfile, ourRoles.openRoles.length);
  const rps = combineRps(enemyArch);

  const enemyRoleMap = new Map<Position, number>();
  for (const a of enemyRoles.assignments) enemyRoleMap.set(a.role, a.championId);

  const best = new Map<number, Recommendation>();

  const evaluate = (id: number, role: Position): void => {
    if (!isAvailable(state, id)) return;
    const champ = champions.get(id);
    if (!champ) return;

    const components: Record<string, number> = {};
    const reasons: Reason[] = [];
    const tier = poolTier(pool, role, id);
    let notInPool = false;

    // poolTier — comfort is strongly preferred.
    const poolScore = tier === 'comfort' ? 3.0 : tier === 'good' ? 1.8 : tier === 'okay' ? 0.8 : 0;
    components.poolTier = poolScore;
    if (tier === 'comfort') reasons.push({ text: `Comfort pick (${role})`, weight: poolScore });
    else if (tier === 'good') reasons.push({ text: `Good pool pick (${role})`, weight: poolScore });
    else if (tier === 'okay') reasons.push({ text: `Playable pool pick (${role})`, weight: poolScore });
    else notInPool = true;

    // meta
    const grade = champ.meta.tierByPosition[role];
    const metaScore = grade ? (META_TIER_SCORE[grade] ?? 0) : 0;
    components.meta = metaScore;
    if (grade && (grade === 'S' || grade === 'A'))
      reasons.push({ text: `Strong meta (${grade} tier ${role})`, weight: metaScore });

    // needs — fills what our comp lacks
    const needsRes = weightedTagSum(champ.tags, needs);
    components.needs = needsRes.sum * 0.4;
    if (needsRes.top && needsRes.top.contribution * 0.4 >= 0.25)
      reasons.push({ text: `Fills team need: ${display(needsRes.top.key)}`, weight: needsRes.top.contribution * 0.4 });

    // counterComp — RPS vs the enemy archetype
    const desiredRes = weightedTagSum(champ.tags, rps.desired);
    const undesiredRes = weightedTagSum(champ.tags, rps.undesired);
    components.counterComp = (desiredRes.sum - undesiredRes.sum) * 0.4;
    if (enemyArch.primary && desiredRes.top && desiredRes.top.contribution * 0.4 >= 0.25)
      reasons.push({
        text: `Adds ${display(desiredRes.top.key)} vs their ${ARCHETYPE_LABEL[enemyArch.primary]} comp`,
        weight: desiredRes.top.contribution * 0.4,
      });

    // laneMatchup — known enemy counterpart in this role
    let laneScore = 0;
    const enemyInRole = enemyRoleMap.get(role);
    if (enemyInRole !== undefined) {
      const scale = ROLE_SCALE[role];
      const weCounter = counters.find((c) => c.champion === id && c.counters === enemyInRole && c.role === role);
      const theyCounter = counters.find((c) => c.champion === enemyInRole && c.counters === id && c.role === role);
      const enemyName = champions.get(enemyInRole)?.name ?? 'enemy';
      if (weCounter) {
        const w = 1.5 * weCounter.strength * scale;
        laneScore += w;
        reasons.push({ text: `Counters ${enemyName} ${role} (strength ${weCounter.strength}): ${weCounter.reason}`, weight: w });
      }
      if (theyCounter) laneScore -= 1.5 * theyCounter.strength * scale;
    }
    components.laneMatchup = laneScore;

    // blindRisk — enemy counterpart still unknown; heavier when many roles are open
    let blindScore = 0;
    if (enemyRoles.openRoles.includes(role)) {
      const rt = champ.perRole[role];
      const blindSafe = rt?.blindSafe ?? 1;
      const counterSens = rt?.counterSensitivity ?? 1;
      const earlyFactor = 0.5 + ourRoles.openRoles.length / 5;
      blindScore = (blindSafe * 0.3 - counterSens * 0.5) * earlyFactor;
      if (blindSafe >= 2 && blindScore > 0.2) reasons.push({ text: 'Blind-safe here', weight: blindScore });
    }
    components.blindRisk = blindScore;

    // synergy — with our locked picks
    let synScore = 0;
    for (const oc of ourChamps) {
      const edge = synergies.find((s) => (s.a === id && s.b === oc.id) || (s.a === oc.id && s.b === id));
      if (edge) {
        const w = 0.7 * edge.strength;
        synScore += w;
        reasons.push({ text: `Synergy with ${oc.name}: ${edge.reason}`, weight: w });
      }
    }
    components.synergy = synScore;

    // flexValue — for our first two picks, reward information-hiding flexes
    let flexScore = 0;
    if (ourChamps.length < 2 && champ.flexRoles.length >= 2) {
      flexScore = 0.4;
      reasons.push({ text: 'Flex pick (hides your plan)', weight: flexScore });
    }
    components.flexValue = flexScore;

    // damageProfile — avoid overstacking one damage type; reward filling a gap
    let dmgScore = 0;
    const t = champ.damageType;
    const adAfter = ourProfile.adCount + (t === 'AD' ? 1 : t === 'mixed' ? 0.5 : 0);
    const apAfter = ourProfile.apCount + (t === 'AP' ? 1 : t === 'mixed' ? 0.5 : 0);
    const sameAfter = t === 'AD' ? adAfter : t === 'AP' ? apAfter : Math.max(adAfter, apAfter);
    if (sameAfter >= 4) dmgScore -= 0.6;
    if (ourChamps.length >= 2) {
      if (t === 'AP' && ourProfile.apCount < 2) {
        dmgScore += 0.4;
        reasons.push({ text: 'Fills missing AP damage', weight: 0.4 });
      } else if (t === 'AD' && ourProfile.adCount < 2) {
        dmgScore += 0.4;
        reasons.push({ text: 'Fills missing AD damage', weight: 0.4 });
      }
    }
    components.damageProfile = dmgScore;

    const score = Object.values(components).reduce((s, v) => s + v, 0);
    const reasonList = topReasons(reasons, notInPool ? 'Not in your pool' : `Playable ${role}`);
    if (notInPool && !reasonList.includes('Not in your pool') && reasonList.length < 4)
      reasonList.push('Not in your pool');

    const rec: Recommendation = { championId: id, role, score, reasons: reasonList, components };
    const prev = best.get(id);
    if (!prev || rec.score > prev.score) best.set(id, rec);
  };

  for (const role of ourRoles.openRoles) {
    const ids = poolIds(pool, role);
    if (ids.length > 0) {
      for (const id of ids) evaluate(id, role);
    } else {
      // fallback: all available champions playable in this role
      for (const champ of champions.values()) {
        if ((champ.positions[role] ?? 0) > 0) evaluate(champ.id, role);
      }
    }
  }

  return sortRecommendations([...best.values()], champions);
}

/**
 * Recommends bans for the current turn over every available champion. In ban
 * phase 2 (tournament) it also weighs "would complete the enemy's archetype".
 * Deterministic: sorted by score desc, then champion name asc.
 */
export function recommendBans(ctx: RecommendContext): Recommendation[] {
  const { state, champions, counters, pool, opponents, ourRoles, enemyRoles } = ctx;
  const ourChamps = lockedChampions(state.picks.us, champions);
  const enemyChamps = lockedChampions(state.picks.them, champions);
  const ourProfile = teamProfile(ourChamps);
  const enemyProfile = teamProfile(enemyChamps);
  const enemyArch = detectArchetypes(enemyProfile, enemyChamps.length);
  const step = currentStep(state);
  const inPhase2 = state.format === 'tournament' && step?.phase === 2;
  const noPicksShown = ourChamps.length === 0; // ban phase 1 (nothing revealed yet)
  const hasOpponentData = !!opponents && opponents.players.some((p) => p.champions.some((c) => c.games > 0));

  // Our locked picks (with roles) and comfort picks in open roles: things to protect.
  const protectTargets: { id: number; role: Position; name: string }[] = [];
  for (const a of ourRoles.assignments) {
    const c = champions.get(a.championId);
    if (c) protectTargets.push({ id: a.championId, role: a.role, name: c.name });
  }
  for (const role of ourRoles.openRoles) {
    for (const id of pool[role].comfort) {
      const c = champions.get(id);
      if (c) protectTargets.push({ id, role, name: c.name });
    }
  }

  // Per-champion self-pick penalty info, for an explanatory reason after ranking.
  const ownWantInfo = new Map<number, { tier: PoolTier; role: Position }>();

  const recs: Recommendation[] = [];

  for (const champ of champions.values()) {
    const id = champ.id;
    if (!isAvailable(state, id)) continue;

    const components: Record<string, number> = {};
    const reasons: Reason[] = [];

    // targetBan — opponent scouting
    const threat = hasOpponentData ? opponentThreat(opponents!, id, enemyRoles.openRoles) : 0;
    components.targetBan = threat * 3.0;
    if (threat > 0.3) reasons.push({ text: 'Target ban: opponent comfort/OTP', weight: threat * 3.0 });

    // metaBan — patch ban priority. Without scouting, meta bans carry the phase,
    // so bp 3 -> 2.5, 2 -> 1.5, 1 -> 0.5; with scouting the signal is gentler.
    const metaBan = hasOpponentData ? (champ.meta.banPriority / 3) * 1.5 : metaBanNoScouting(champ.meta.banPriority);
    components.metaBan = metaBan;
    if (champ.meta.banPriority >= 2) reasons.push({ text: 'High meta ban priority', weight: metaBan });

    // protectBan — removes a counter to our (planned) picks
    let protect = 0;
    for (const t of protectTargets) {
      const edge = counters.find((c) => c.champion === id && c.counters === t.id && c.role === t.role);
      if (edge) {
        const w = 1.2 * edge.strength;
        protect += w;
        reasons.push({ text: `Removes counter to our ${t.name} (${t.role})`, weight: w });
      }
    }
    // if our plan is Protect, also shave hard engage/dive threats
    const ourArch = detectArchetypes(ourProfile, ourChamps.length);
    if (ourArch.primary === 'protect') {
      const engageDive = Math.min(0.6, (tagVal(champ.tags, 'dive') + tagVal(champ.tags, 'engage')) * 0.12);
      if (engageDive > 0.2) {
        protect += engageDive;
        reasons.push({ text: 'Removes hard engage/dive vs our protect comp', weight: engageDive });
      }
    }
    // Cap so stacked matchup edges can't dominate; damp before we've shown a pick.
    protect = Math.min(protect, 2.4);
    if (noPicksShown) protect *= 0.6;
    components.protectBan = protect;

    // denyArchetype — ban phase 2: would this complete the enemy's comp? A piece
    // that rounds out an already-visible archetype is the phase-2 priority (§6),
    // so it outweighs a generic meta ban.
    let deny = 0;
    if (inPhase2 && enemyArch.primary) {
      const sig = ARCHETYPE_SIGNALS[enemyArch.primary];
      const { sum } = weightedTagSum(champ.tags, sig.weights);
      deny = Math.min(2.5, sum * 2.5);
      if (deny > 0.4)
        reasons.push({ text: `Would complete their ${ARCHETYPE_LABEL[enemyArch.primary]} comp`, weight: deny });
    }
    components.denyArchetype = deny;

    // ownWant — never ban a champion we plan to pick ourselves: banning it removes
    // it for us too. Always a penalty for champions in our pool for a still-open role.
    let ownWant = 0;
    let ownTier: PoolTier | null = null;
    let ownRole: Position | undefined;
    for (const role of ourRoles.openRoles) {
      const tier = poolTier(pool, role, id);
      if (!tier) continue;
      const pen = tier === 'comfort' ? -1.5 : tier === 'good' ? -0.8 : -0.3;
      if (pen < ownWant) {
        ownWant = pen;
        ownTier = tier;
        ownRole = role;
      }
    }
    components.ownWant = ownWant;
    if (ownTier && ownRole) ownWantInfo.set(id, { tier: ownTier, role: ownRole });

    const score = Object.values(components).reduce((s, v) => s + v, 0);
    recs.push({ championId: id, score, reasons: topReasons(reasons, 'Available to ban'), components });
  }

  const sorted = sortRecommendations(recs, champions);

  // Add the "we want this ourselves" note only to champions that would otherwise
  // (without the penalty) have ranked in the top 5 — i.e. tempting-but-wrong bans.
  const byPre = [...recs].sort((a, b) => {
    const pa = a.score - (a.components.ownWant ?? 0);
    const pb = b.score - (b.components.ownWant ?? 0);
    if (pb !== pa) return pb - pa;
    const na = champions.get(a.championId)?.name ?? '';
    const nb = champions.get(b.championId)?.name ?? '';
    return na.localeCompare(nb);
  });
  const top5Pre = new Set(byPre.slice(0, 5).map((r) => r.championId));
  for (const rec of sorted) {
    const info = ownWantInfo.get(rec.championId);
    if (info && top5Pre.has(rec.championId)) {
      rec.reasons = [`We want to pick this ourselves (${info.tier} ${info.role})`, ...rec.reasons].slice(0, 4);
    }
  }

  return sorted;
}

/** Stable sort: score desc, then champion name asc. */
function sortRecommendations(recs: Recommendation[], champions: Map<number, Champion>): Recommendation[] {
  return recs.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const na = champions.get(a.championId)?.name ?? '';
    const nb = champions.get(b.championId)?.name ?? '';
    return na.localeCompare(nb);
  });
}

/** High-level draft summary for the center panel. */
export function draftSummary(ctx: RecommendContext): DraftSummary {
  const { state, champions, ourRoles } = ctx;
  const ourChamps = lockedChampions(state.picks.us, champions);
  const enemyChamps = lockedChampions(state.picks.them, champions);
  const ourProfile = teamProfile(ourChamps);
  const enemyProfile = teamProfile(enemyChamps);
  const enemyArchetypes = detectArchetypes(enemyProfile, enemyChamps.length);
  const compTargetText = enemyArchetypes.primary
    ? RPS[enemyArchetypes.primary].label
    : 'No clear enemy archetype yet — draft for flexibility';
  return {
    ourArchetypes: detectArchetypes(ourProfile, ourChamps.length),
    enemyArchetypes,
    compTargetText,
    warnings: hygieneWarnings(ourProfile, enemyProfile, ourRoles.openRoles.length),
  };
}

export type { Archetype, TeamProfile };
