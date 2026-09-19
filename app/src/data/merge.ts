import type { ChampionBase, Position } from './types';
import { POSITIONS } from './types';
import type {
  Champion,
  CuratedTags,
  MetaFile,
  RoleTags,
  TagsFile,
  Tier,
} from './curatedTypes';

/** Neutral tag row for champions without a curated entry (all off). */
export function neutralTags(): CuratedTags {
  return {
    engage: 0,
    dive: 0,
    gapClose: 0,
    disengage: 0,
    counterEngage: 0,
    peel: 0,
    burst: 0,
    sustainedDps: 0,
    poke: 0,
    aoeDamage: 0,
    hypercarry: false,
    antiTank: 0,
    antiHeal: false,
    antiShield: false,
    hardCc: 0,
    aoeCc: 0,
    pickCc: 0,
    knockup: false,
    global: false,
    semiGlobal: false,
    roam: 0,
    splitpush: 0,
    duelist: 0,
    waveclear: 0,
    siege: 0,
    visionControl: 0,
    frontline: false,
    tank: false,
    sustain: 0,
    shieldHeal: 0,
    spellShield: false,
    ccImmunity: false,
    stealthUntargetable: false,
    early: 0,
    mid: 0,
    late: 0,
  };
}

/** Roles the champion can play, given a (possibly overridden) positions map. */
function playablePositions(positions: Partial<Record<Position, number>>): Position[] {
  return POSITIONS.filter((p) => (positions[p] ?? 0) > 0);
}

/** Neutral per-role ratings (blindSafe 1 / counterSensitivity 1) for each playable role. */
function neutralPerRole(
  positions: Partial<Record<Position, number>>,
): Partial<Record<Position, RoleTags>> {
  const out: Partial<Record<Position, RoleTags>> = {};
  for (const p of playablePositions(positions)) out[p] = { blindSafe: 1, counterSensitivity: 1 };
  return out;
}

/** Neutral tier map ('B') for each playable role. */
function neutralTiers(
  positions: Partial<Record<Position, number>>,
): Partial<Record<Position, Tier>> {
  const out: Partial<Record<Position, Tier>> = {};
  for (const p of playablePositions(positions)) out[p] = 'B';
  return out;
}

/**
 * Merges generated base champions with curated tags and meta into runtime
 * {@link Champion} records. Applies meta.positions overrides; champions without
 * a curated tag entry receive neutral defaults and are flagged `curatedMissing`.
 */
export function mergeChampions(
  base: ChampionBase[],
  tags: TagsFile,
  meta: MetaFile,
): Champion[] {
  return base.map((c): Champion => {
    const key = String(c.id);
    const tagEntry = tags.champions[key];
    const metaEntry = meta.champions[key];

    // meta.positions overrides individual role weights, keeping the rest of base.
    const positions = metaEntry?.positions
      ? { ...c.positions, ...metaEntry.positions }
      : c.positions;

    const curatedMissing = !tagEntry;

    return {
      ...c,
      positions,
      subclass: tagEntry?.subclass ?? '',
      tags: tagEntry?.tags ?? neutralTags(),
      perRole: tagEntry?.perRole ?? neutralPerRole(positions),
      flexRoles: tagEntry?.flexRoles ?? [],
      meta: {
        tierByPosition: metaEntry?.tierByPosition ?? neutralTiers(positions),
        banPriority: metaEntry?.banPriority ?? 0,
      },
      ...(curatedMissing ? { curatedMissing: true } : {}),
    };
  });
}
