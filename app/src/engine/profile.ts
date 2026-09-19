import type { Champion, CuratedTags, TagKey } from '../data/curatedTypes';
import { neutralTags } from '../data/merge';

/** A sparse weighting over tags, used for dot products. */
export type TagWeights = Partial<Record<TagKey, number>>;

/** The ten team-composition archetypes the engine scores. */
export type Archetype =
  | 'engage'
  | 'protect'
  | 'poke'
  | 'pick'
  | 'dive'
  | 'split'
  | 'counterEngage'
  | 'global'
  | 'earlySnowball'
  | 'lateScaling';

/** All archetypes, in a stable order. */
export const ARCHETYPES: Archetype[] = [
  'engage',
  'protect',
  'poke',
  'pick',
  'dive',
  'split',
  'counterEngage',
  'global',
  'earlySnowball',
  'lateScaling',
];

/** Reads a tag as a number (booleans count as 1). */
export function tagVal(tags: CuratedTags, key: TagKey): number {
  const v = tags[key];
  return typeof v === 'boolean' ? (v ? 1 : 0) : v;
}

/** Dot product of tag sums with a sparse weight vector. */
export function dotTags(tags: Record<TagKey, number>, weights: TagWeights): number {
  let sum = 0;
  for (const key in weights) {
    const w = weights[key as TagKey];
    if (w) sum += (tags[key as TagKey] ?? 0) * w;
  }
  return sum;
}

/** Aggregate description of a team's champions. */
export interface TeamProfile {
  /** Per-tag sums across the team (booleans summed as 1). */
  tags: Record<TagKey, number>;
  adCount: number;
  apCount: number;
  frontlineCount: number;
  /** global + semiGlobal tag sum. */
  globalCount: number;
  /** Number of champions that are global OR semi-global (each counted once). */
  globalPieces: number;
  /** Sum of hardCc. */
  cc: number;
  sustain: number;
  early: number;
  mid: number;
  late: number;
  pickCount: number;
}

/** Zeroed tag-sum record with every key present. */
function zeroTags(): Record<TagKey, number> {
  const out = {} as Record<TagKey, number>;
  const template = neutralTags();
  for (const key in template) out[key as TagKey] = 0;
  return out;
}

/** Builds a {@link TeamProfile} from a list of champions. */
export function teamProfile(champions: Champion[]): TeamProfile {
  const tags = zeroTags();
  let adCount = 0;
  let apCount = 0;
  let globalPieces = 0;
  for (const c of champions) {
    for (const key in tags) tags[key as TagKey] += tagVal(c.tags, key as TagKey);
    if (c.damageType === 'AD') adCount += 1;
    else if (c.damageType === 'AP') apCount += 1;
    else {
      adCount += 0.5;
      apCount += 0.5;
    }
    if (c.tags.global || c.tags.semiGlobal) globalPieces += 1;
  }
  return {
    tags,
    adCount,
    apCount,
    frontlineCount: tags.frontline,
    globalCount: tags.global + tags.semiGlobal,
    globalPieces,
    cc: tags.hardCc,
    sustain: tags.sustain,
    early: tags.early,
    mid: tags.mid,
    late: tags.late,
    pickCount: champions.length,
  };
}

/**
 * Defining tag weights per archetype and the numerator a *complete* comp of that
 * type reaches. Used both to detect archetypes and to score "completes the enemy
 * archetype" bans.
 */
export const ARCHETYPE_SIGNALS: Record<Archetype, { weights: TagWeights; fullTarget: number }> = {
  engage: { weights: { engage: 1, aoeCc: 1, aoeDamage: 0.5 }, fullTarget: 5 },
  protect: { weights: { hypercarry: 2, peel: 1, disengage: 1, shieldHeal: 0.7 }, fullTarget: 6 },
  poke: { weights: { poke: 1, siege: 0.5 }, fullTarget: 6 },
  pick: { weights: { pickCc: 1, burst: 1, visionControl: 0.5 }, fullTarget: 6 },
  dive: { weights: { dive: 1, gapClose: 1 }, fullTarget: 6 },
  split: { weights: { splitpush: 1, duelist: 1 }, fullTarget: 4 },
  counterEngage: { weights: { counterEngage: 1, disengage: 1 }, fullTarget: 5 },
  // A true global ult (teleport/map-wide) is what completes a global comp; a merely
  // semi-global ult (e.g. a marksman R) counts far less, and roam is excluded here so
  // ban scoring surfaces the real global pieces rather than every roaming assassin.
  global: { weights: { global: 1, semiGlobal: 0.35 }, fullTarget: 3 },
  earlySnowball: { weights: { early: 1 }, fullTarget: 9 },
  lateScaling: { weights: { late: 1, hypercarry: 0.5 }, fullTarget: 9 },
};

/** Human-readable archetype names. */
export const ARCHETYPE_LABEL: Record<Archetype, string> = {
  engage: 'Engage',
  protect: 'Protect',
  poke: 'Poke',
  pick: 'Pick',
  dive: 'Dive',
  split: 'Split-push',
  counterEngage: 'Counter-engage',
  global: 'Global',
  earlySnowball: 'Early-snowball',
  lateScaling: 'Late-scaling',
};

/** Scores for every archetype plus the detected primary/secondary. */
export interface ArchetypeScores {
  scores: Record<Archetype, number>;
  primary?: Archetype;
  secondary?: Archetype;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/**
 * Scores each archetype 0..1 for a profile. Thresholds scale with the number of
 * picks, so a partial comp yields partial confidence. Primary = argmax if >=0.5;
 * secondary = next best if >=0.35.
 */
export function detectArchetypes(profile: TeamProfile, pickCount: number): ArchetypeScores {
  const scores = {} as Record<Archetype, number>;
  if (pickCount <= 0) {
    for (const a of ARCHETYPES) scores[a] = 0;
    return { scores };
  }
  const scale = pickCount / 5;
  for (const a of ARCHETYPES) {
    const sig = ARCHETYPE_SIGNALS[a];
    const num = dotTags(profile.tags, sig.weights);
    scores[a] = clamp01(num / (sig.fullTarget * scale));
  }
  // Global is a *count of pieces*, not a tag-weight sum: 3 global/semi-global
  // champions is the domain threshold and scores a full 1.0 (docs §5.2).
  scores.global = clamp01(profile.globalPieces / 3);

  // Confidence must grow with the number of picks: a single champion can't define
  // a comp. Cap every score at pickCount/3 so 1 pick <= 0.33 (no primary), 2 picks
  // <= 0.67, and only 3+ picks can reach a full 1.0.
  const cap = Math.min(1, pickCount / 3);
  for (const a of ARCHETYPES) scores[a] = Math.min(scores[a], cap);

  // Rank for primary/secondary; ties broken by ARCHETYPES order (stable).
  const ranked = [...ARCHETYPES].sort((x, y) => scores[y] - scores[x]);
  let primary = ranked[0] !== undefined && scores[ranked[0]] >= 0.5 ? ranked[0] : undefined;

  // Global is a more specific classification: once at least 3 pieces are present
  // (score >= 0.6) it takes the primary slot unless another archetype is markedly
  // higher (>= +0.25) — a genuinely different plan.
  if (scores.global >= 0.6 && primary !== 'global') {
    const topScore = primary ? scores[primary] : 0;
    if (topScore - scores.global < 0.25) primary = 'global';
  }

  const secondary = ranked.find((a) => a !== primary && scores[a] >= 0.35);
  return { scores, primary, secondary };
}

/** RPS response: what our comp should want (and avoid) against an enemy archetype. */
export interface RpsEntry {
  desired: TagWeights;
  undesired: TagWeights;
  label: string;
}

/**
 * Rock-paper-scissors table (docs/research/domain.md §2.1): maps the enemy's
 * detected archetype to the tags our comp should favour and avoid, plus a
 * human-readable comp-target label.
 */
export const RPS: Record<Archetype, RpsEntry> = {
  engage: {
    desired: { disengage: 1, counterEngage: 1, poke: 0.5, splitpush: 0.5 },
    undesired: {},
    label: 'Disengage & poke vs their Engage comp',
  },
  protect: {
    desired: { poke: 1, siege: 0.7, splitpush: 0.7, dive: 0.7, burst: 0.5, early: 0.3 },
    undesired: {},
    label: 'Poke & split vs their Protect comp',
  },
  poke: {
    desired: { engage: 1, dive: 0.8, gapClose: 0.8, frontline: 0.5, sustain: 0.3 },
    undesired: { poke: 0.3 },
    label: 'Hard engage vs their Poke comp',
  },
  pick: {
    desired: { frontline: 0.8, disengage: 0.6, spellShield: 0.8, engage: 0.5, aoeDamage: 0.5 },
    undesired: {},
    label: 'Group & teamfight vs their Pick comp',
  },
  dive: {
    desired: { peel: 1, disengage: 0.8, counterEngage: 0.8, spellShield: 0.6, late: 0.3 },
    undesired: {},
    label: 'Peel & disengage vs their Dive comp',
  },
  split: {
    desired: { pickCc: 1, burst: 0.7, engage: 0.7, splitpush: 0.5, duelist: 0.5 },
    undesired: {},
    label: 'Pick & catch vs their Split-push comp',
  },
  counterEngage: {
    desired: { poke: 1, splitpush: 0.8, siege: 0.5 },
    undesired: { engage: 0.3 },
    label: 'Poke & split vs their Counter-engage comp',
  },
  global: {
    desired: {
      disengage: 1,
      peel: 1,
      visionControl: 1,
      spellShield: 0.8,
      waveclear: 0.5,
      frontline: 0.5,
      sustainedDps: 0.5,
      antiTank: 0.5,
    },
    undesired: { splitpush: 1 },
    label: 'Protect-the-carry vs their Global comp',
  },
  earlySnowball: {
    desired: { late: 1, disengage: 0.6, frontline: 0.5, waveclear: 0.4 },
    undesired: {},
    label: 'Scale safely vs their Early-snowball comp',
  },
  lateScaling: {
    desired: { early: 1, dive: 0.6, poke: 0.5, pickCc: 0.5 },
    undesired: {},
    label: 'Early tempo vs their Late-scaling comp',
  },
};

/** A hygiene warning: a machine code plus human-readable text. */
export interface HygieneWarning {
  code: string;
  text: string;
}

/**
 * Comp-hygiene checks (docs/research/domain.md §2.3). Structural gaps (damage
 * balance, frontline, start/stop, CC) only fire once the comp is taking shape
 * (>=3 picks); reactive gaps (anti-tank/anti-heal, power curve) fire earlier.
 */
export function hygieneWarnings(
  profile: TeamProfile,
  enemy: TeamProfile,
  openRoleCount: number,
): HygieneWarning[] {
  const out: HygieneWarning[] = [];
  const pickCount = profile.pickCount;
  const shaped = pickCount >= 3 && openRoleCount <= 2;

  if (shaped && profile.adCount < 1.5) out.push({ code: 'damageAd', text: 'Low physical damage — enemy can stack armor' });
  if (shaped && profile.apCount < 1.5) out.push({ code: 'damageAp', text: 'Low magic damage — enemy can stack MR' });
  if (shaped && profile.frontlineCount < 1) out.push({ code: 'noFrontline', text: 'No frontline' });
  if (shaped && profile.tags.engage < 1 && profile.tags.disengage < 1)
    out.push({ code: 'noStartStop', text: 'No reliable way to start or stop fights' });
  if (shaped && profile.cc < 2) out.push({ code: 'lowCc', text: 'Low hard CC' });

  if (enemy.frontlineCount >= 2 && profile.tags.antiTank < 1)
    out.push({ code: 'needAntiTank', text: 'Enemy has 2+ tanks — bring anti-tank' });
  if (enemy.sustain >= 2 && profile.tags.antiHeal < 1)
    out.push({ code: 'needAntiHeal', text: 'Enemy has heavy sustain — bring anti-heal (Grievous Wounds)' });

  if (pickCount >= 2 && enemy.early - profile.early >= 4)
    out.push({ code: 'earlyDeficit', text: 'Enemy is stronger early — draft safe lanes / disengage' });
  if (pickCount >= 2 && enemy.late - profile.late >= 4)
    out.push({ code: 'lateDeficit', text: 'Enemy scales harder — draft tempo / objective tools' });

  return out;
}

/**
 * The "needs" weight vector: what our comp currently lacks. Feeds the `needs`
 * pick-scoring component so recommendations fill genuine gaps.
 */
export function needsWeights(
  profile: TeamProfile,
  enemy: TeamProfile,
  openRoleCount: number,
): TagWeights {
  const needs: TagWeights = {};
  if (openRoleCount <= 0) return needs; // no slots left to fill a need

  const add = (k: TagKey, w: number) => {
    needs[k] = (needs[k] ?? 0) + w;
  };

  if (profile.frontlineCount < 1) add('frontline', 1.0);
  if (profile.tags.engage < 1 && profile.tags.disengage < 1) {
    add('engage', 0.8);
    add('disengage', 0.8);
  }
  if (profile.cc < 2) add('hardCc', 0.7);
  if (profile.tags.waveclear < 2) add('waveclear', 0.4);
  if (enemy.frontlineCount >= 2) add('antiTank', 1.0);
  if (enemy.sustain >= 2) add('antiHeal', 1.0);

  return needs;
}
