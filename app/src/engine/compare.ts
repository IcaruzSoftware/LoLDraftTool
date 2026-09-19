import type { Position } from '../data/types';
import { POSITIONS } from '../data/types';
import type { Champion } from '../data/curatedTypes';
import { SKIP_ID } from './draft';
import type { Archetype, ArchetypeScores } from './profile';
import { detectArchetypes, hygieneWarnings, teamProfile } from './profile';
import type { RecommendContext } from './recommend';

/** One comparable dimension of team strength (raw sums, plus a bar scale). */
export interface Dimension {
  key: string;
  label: string;
  us: number;
  them: number;
  /** Full-bar value: our/their value over this fills a 0..100% bar. */
  scale: number;
  note?: string;
}

/** A per-role lane comparison with an edge and its strength. */
export interface LaneMatchup {
  role: Position;
  us?: number;
  them?: number;
  edge: 'us' | 'them' | 'even';
  strength: 0 | 1 | 2 | 3;
  reason?: string;
}

/** Full end-of-draft comparison between our comp and the enemy comp. */
export interface TeamComparison {
  dimensions: Dimension[];
  archetypes: { us: ArchetypeScores; them: ArchetypeScores };
  lanes: LaneMatchup[];
  strengths: { us: string[]; them: string[] };
  weaknesses: { us: string[]; them: string[] };
  plan: { headline: string; bullets: string[] };
}

// Bar scales: a numeric tag is 0..3 and sums over five picks to 15; a per-pick
// count (damage type, frontline, global piece) tops out at five.
const TAG_SCALE = 5 * 3;
const COUNT_SCALE = 5;

/** Per-champion numeric contribution to each dimension. */
interface DimSpec {
  key: string;
  label: string;
  scale: number;
  val: (c: Champion) => number;
}

const DIMENSIONS: DimSpec[] = [
  { key: 'early', label: 'Early game', scale: TAG_SCALE, val: (c) => c.tags.early },
  { key: 'mid', label: 'Mid game', scale: TAG_SCALE, val: (c) => c.tags.mid },
  { key: 'late', label: 'Late game', scale: TAG_SCALE, val: (c) => c.tags.late },
  {
    key: 'physical',
    label: 'Physical dmg',
    scale: COUNT_SCALE,
    val: (c) => (c.damageType === 'AD' ? 1 : c.damageType === 'mixed' ? 0.5 : 0),
  },
  {
    key: 'magic',
    label: 'Magic dmg',
    scale: COUNT_SCALE,
    val: (c) => (c.damageType === 'AP' ? 1 : c.damageType === 'mixed' ? 0.5 : 0),
  },
  { key: 'hardCc', label: 'Hard CC', scale: TAG_SCALE, val: (c) => c.tags.hardCc },
  { key: 'engage', label: 'Engage', scale: TAG_SCALE, val: (c) => c.tags.engage },
  {
    key: 'disengagePeel',
    label: 'Disengage / peel',
    scale: TAG_SCALE,
    val: (c) => c.tags.disengage + c.tags.peel,
  },
  { key: 'frontline', label: 'Frontline', scale: COUNT_SCALE, val: (c) => (c.tags.frontline ? 1 : 0) },
  { key: 'poke', label: 'Poke', scale: TAG_SCALE, val: (c) => c.tags.poke },
  { key: 'dive', label: 'Dive', scale: TAG_SCALE, val: (c) => c.tags.dive },
  { key: 'waveclear', label: 'Waveclear', scale: TAG_SCALE, val: (c) => c.tags.waveclear },
  { key: 'sustain', label: 'Sustain', scale: TAG_SCALE, val: (c) => c.tags.sustain },
  {
    key: 'global',
    label: 'Global presence',
    scale: COUNT_SCALE,
    val: (c) => (c.tags.global || c.tags.semiGlobal ? 1 : 0),
  },
];

/** Human phrasing for a positive gap on each dimension. */
const STRENGTH_PHRASE: Record<string, string> = {
  early: 'Stronger early game',
  mid: 'Stronger mid game',
  late: 'Stronger late game',
  physical: 'Heavier physical damage',
  magic: 'Heavier magic damage',
  hardCc: 'More hard CC',
  engage: 'More reliable engage',
  disengagePeel: 'Better disengage & peel',
  frontline: 'More frontline',
  poke: 'Stronger poke',
  dive: 'Stronger dive threat',
  waveclear: 'Better waveclear',
  sustain: 'More sustain',
  global: 'More global presence',
};

/** Human phrasing for a losing gap on each dimension. */
const WEAKNESS_PHRASE: Record<string, string> = {
  early: 'Weaker early game',
  mid: 'Weaker mid game',
  late: 'Weaker late game',
  physical: 'Light on physical damage',
  magic: 'Light on magic damage',
  hardCc: 'Short on hard CC',
  engage: 'Little reliable engage',
  disengagePeel: 'Little disengage / peel',
  frontline: 'Thin frontline',
  poke: 'Little poke',
  dive: 'Little dive threat',
  waveclear: 'Weak waveclear',
  sustain: 'Little sustain',
  global: 'Little global presence',
};

/** What to avoid, keyed by the enemy's primary archetype. */
const AVOID_VS: Record<Archetype, string> = {
  engage: 'Do not group in chokes or face-check vs their Engage comp',
  protect: 'Do not tunnel the frontline — reach the protected carry vs their Protect comp',
  poke: 'Do not siege into their Poke comp — commit to the fight',
  pick: 'Do not send a lone splitpusher or wander vs their Pick comp',
  dive: 'Do not leave carries exposed vs their Dive comp',
  split: 'Do not ignore the sidelane vs their Split-push comp',
  counterEngage: 'Do not force bad engages into their Counter-engage comp',
  global: 'Do not overextend — respect map pressure vs their Global comp',
  earlySnowball: 'Do not give early kills vs their Early-snowball comp',
  lateScaling: 'Do not let the game drag out vs their Late-scaling comp',
};

/** Non-SKIP locked champions resolved to records. */
function lockedChampions(picks: { championId: number }[], champions: Map<number, Champion>): Champion[] {
  const out: Champion[] = [];
  for (const p of picks) {
    if (p.championId === SKIP_ID) continue;
    const c = champions.get(p.championId);
    if (c) out.push(c);
  }
  return out;
}

/** Names of the champions contributing most to a dimension (value > 0). */
function topContributors(champs: Champion[], val: (c: Champion) => number, n = 2): string[] {
  return champs
    .map((c) => ({ name: c.name, v: val(c) }))
    .filter((x) => x.v > 0)
    .sort((a, b) => b.v - a.v)
    .slice(0, n)
    .map((x) => x.name);
}

/** Appends "(A, B)" when contributors exist. */
function withChamps(phrase: string, champs: string[]): string {
  return champs.length > 0 ? `${phrase} (${champs.join(', ')})` : phrase;
}

/** Builds up to four strength bullets for one side from the biggest gaps. */
function sideStrengths(
  dims: Dimension[],
  specs: Map<string, DimSpec>,
  side: 'us' | 'them',
  champs: Champion[],
): string[] {
  const gaps = dims
    .map((d) => ({ d, gap: side === 'us' ? d.us - d.them : d.them - d.us }))
    .filter(({ d, gap }) => gap >= (d.scale >= TAG_SCALE ? 2 : 1))
    .sort((a, b) => b.gap - a.gap);
  const out: string[] = [];
  for (const { d } of gaps.slice(0, 4)) {
    const spec = specs.get(d.key)!;
    out.push(withChamps(STRENGTH_PHRASE[d.key] ?? d.label, topContributors(champs, spec.val)));
  }
  return out;
}

/** Builds weakness bullets: hygiene warnings plus the biggest deficits. */
function sideWeaknesses(
  dims: Dimension[],
  side: 'us' | 'them',
  warnings: string[],
): string[] {
  const gaps = dims
    .map((d) => ({ d, gap: side === 'us' ? d.them - d.us : d.us - d.them }))
    .filter(({ d, gap }) => gap >= (d.scale >= TAG_SCALE ? 3 : 1.5))
    .sort((a, b) => b.gap - a.gap)
    .map(({ d }) => WEAKNESS_PHRASE[d.key] ?? d.label);
  return [...warnings, ...gaps].slice(0, 4);
}

const LANE_SIDE: Record<Position, string> = {
  top: 'top side',
  jungle: 'jungle tempo',
  mid: 'mid priority',
  bot: 'bot side',
  support: 'bot side',
};

/**
 * Deterministic end-of-draft (or mid-draft) comparison of the two comps: power
 * curve and role sums as comparable bars, archetypes, per-lane matchups from the
 * counters table, and a data-derived strengths / weaknesses / game-plan summary.
 */
export function compareTeams(ctx: RecommendContext): TeamComparison {
  const { state, champions, counters, ourRoles, enemyRoles } = ctx;
  const ourChamps = lockedChampions(state.picks.us, champions);
  const enemyChamps = lockedChampions(state.picks.them, champions);
  const ourProfile = teamProfile(ourChamps);
  const enemyProfile = teamProfile(enemyChamps);

  const specs = new Map(DIMENSIONS.map((s) => [s.key, s]));
  const dimensions: Dimension[] = DIMENSIONS.map((s) => ({
    key: s.key,
    label: s.label,
    us: ourChamps.reduce((sum, c) => sum + s.val(c), 0),
    them: enemyChamps.reduce((sum, c) => sum + s.val(c), 0),
    scale: s.scale,
  }));

  const archetypes = {
    us: detectArchetypes(ourProfile, ourChamps.length),
    them: detectArchetypes(enemyProfile, enemyChamps.length),
  };

  // Per-lane matchups from the counters table; blindSafe/counterSensitivity as a
  // tie-break when no counter edge exists (usually 'even').
  const ourByRole = new Map<Position, number>(ourRoles.assignments.map((a) => [a.role, a.championId]));
  const enemyByRole = new Map<Position, number>(enemyRoles.assignments.map((a) => [a.role, a.championId]));
  const lanes: LaneMatchup[] = POSITIONS.map((role) => {
    const us = ourByRole.get(role);
    const them = enemyByRole.get(role);
    const lane: LaneMatchup = { role, us, them, edge: 'even', strength: 0 };
    if (us === undefined || them === undefined) return lane;

    const we = counters.find((c) => c.champion === us && c.counters === them && c.role === role);
    const they = counters.find((c) => c.champion === them && c.counters === us && c.role === role);
    if (we && (!they || we.strength >= they.strength)) {
      if (!(they && they.strength === we.strength)) {
        lane.edge = 'us';
        lane.strength = we.strength;
        lane.reason = we.reason;
        return lane;
      }
    } else if (they) {
      lane.edge = 'them';
      lane.strength = they.strength;
      lane.reason = they.reason;
      return lane;
    }

    // No counter edge: lean on blind-safety only when the gap is clear.
    const usC = champions.get(us)?.perRole[role];
    const themC = champions.get(them)?.perRole[role];
    const usH = (usC?.blindSafe ?? 1) - (usC?.counterSensitivity ?? 1);
    const themH = (themC?.blindSafe ?? 1) - (themC?.counterSensitivity ?? 1);
    if (usH - themH >= 2) lane.edge = 'us';
    else if (themH - usH >= 2) lane.edge = 'them';
    lane.strength = lane.edge === 'even' ? 0 : 1;
    return lane;
  });

  const strengths = {
    us: sideStrengths(dimensions, specs, 'us', ourChamps),
    them: sideStrengths(dimensions, specs, 'them', enemyChamps),
  };
  const weaknesses = {
    us: sideWeaknesses(
      dimensions,
      'us',
      hygieneWarnings(ourProfile, enemyProfile, ourRoles.openRoles.length).map((w) => w.text),
    ),
    them: sideWeaknesses(
      dimensions,
      'them',
      hygieneWarnings(enemyProfile, ourProfile, enemyRoles.openRoles.length).map((w) => w.text),
    ),
  };

  const plan = buildPlan(dimensions, lanes, archetypes, ourChamps);

  return { dimensions, archetypes, lanes, strengths, weaknesses, plan };
}

/** Derives the headline and bullets from the power curve, lanes and archetypes. */
function buildPlan(
  dims: Dimension[],
  lanes: LaneMatchup[],
  archetypes: { us: ArchetypeScores; them: ArchetypeScores },
  ourChamps: Champion[],
): { headline: string; bullets: string[] } {
  const dim = (key: string): Dimension => dims.find((d) => d.key === key)!;
  const early = dim('early');
  const late = dim('late');
  const earlyGap = early.us - early.them;
  const lateGap = late.us - late.them;

  const scaleWord =
    lateGap >= 3 ? 'scale' : earlyGap >= 3 ? 'snowball your early lead' : 'control tempo';

  // Strongest lane we win, for a side to play toward.
  const ourEdges = lanes
    .filter((l) => l.edge === 'us')
    .sort((a, b) => b.strength - a.strength);
  const best = ourEdges[0];
  const headline = best
    ? `Play for ${LANE_SIDE[best.role]} and ${scaleWord}`
    : `Draft is even — ${scaleWord} and play the objectives`;

  const bullets: string[] = [];

  if (ourEdges.length > 0) {
    const roles = ourEdges.slice(0, 2).map((l) => l.role.toUpperCase()).join(' & ');
    bullets.push(`Press your lane edge in ${roles}`);
  } else {
    bullets.push('No clear lane counters — respect matchups and play for scaling');
  }

  if (earlyGap >= 3) bullets.push("Force fights before 20 min while you're stronger");
  else if (earlyGap <= -3) bullets.push('Avoid early skirmishes — scale to 3 items');
  else bullets.push('Fight around mid-game objective spikes');

  const theirPrimary = archetypes.them.primary;
  bullets.push(theirPrimary ? AVOID_VS[theirPrimary] : 'Scout their win condition as picks fill in');

  if (lateGap >= 2) bullets.push('Trade early objectives for farm; take Soul / Baron fights late');
  else if (earlyGap >= 2) bullets.push('Convert early leads into towers and dragons before they scale');
  else bullets.push('Contest neutral objectives on even footing');

  // Reference the leading scaling carry when we out-scale, if one exists.
  if (lateGap >= 2) {
    const carry = topContributors(ourChamps, (c) => c.tags.late, 1)[0];
    if (carry) bullets[bullets.length - 1] += ` around ${carry}`;
  }

  return { headline, bullets };
}
