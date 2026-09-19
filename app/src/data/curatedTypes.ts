import type { ChampionBase, Position } from './types';

/** Meta tier grade for a champion in a position. */
export type Tier = 'S' | 'A' | 'B' | 'C' | 'D';

/** Confidence a curator had when filling a champion's tag row. */
export type CuratedConfidence = 'high' | 'medium' | 'low';

/**
 * Hand-curated behavioural tags (data/curated/tags.json).
 * Numeric fields are 0..3 strength; boolean fields are presence flags.
 * Mirrors docs/data-schema.md exactly.
 */
export interface CuratedTags {
  // fight initiation
  engage: number;
  dive: number;
  gapClose: number;
  disengage: number;
  counterEngage: number;
  peel: number;
  // damage pattern
  burst: number;
  sustainedDps: number;
  poke: number;
  aoeDamage: number;
  hypercarry: boolean;
  antiTank: number;
  antiHeal: boolean;
  antiShield: boolean;
  // control
  hardCc: number;
  aoeCc: number;
  pickCc: number;
  knockup: boolean;
  // map
  global: boolean;
  semiGlobal: boolean;
  roam: number;
  splitpush: number;
  duelist: number;
  waveclear: number;
  siege: number;
  visionControl: number;
  // durability / utility
  frontline: boolean;
  tank: boolean;
  sustain: number;
  shieldHeal: number;
  spellShield: boolean;
  ccImmunity: boolean;
  stealthUntargetable: boolean;
  // power curve
  early: number;
  mid: number;
  late: number;
}

/** All tag keys, for iteration and dot products. */
export type TagKey = keyof CuratedTags;

/** Per-role draft-meta ratings for a champion. */
export interface RoleTags {
  /** Safe to reveal early (few hard counters); 0..3. */
  blindSafe: number;
  /** How badly a bad matchup hurts; 0..3. */
  counterSensitivity: number;
}

/** One champion entry inside tags.json. */
export interface CuratedTagEntry {
  name: string;
  subclass: string;
  tags: CuratedTags;
  perRole: Partial<Record<Position, RoleTags>>;
  flexRoles: Position[];
  confidence?: CuratedConfidence;
}

/** On-disk shape of data/curated/tags.json. */
export interface TagsFile {
  patch: string;
  /** Keyed by Riot numeric id (as a string). */
  champions: Record<string, CuratedTagEntry>;
}

/** One champion entry inside meta.json. */
export interface CuratedMetaEntry {
  tierByPosition: Partial<Record<Position, Tier>>;
  banPriority: number;
  /** Optional per-role position-weight overrides applied during merge. */
  positions?: Partial<Record<Position, number>>;
}

/** On-disk shape of data/curated/meta.json. */
export interface MetaFile {
  patch: string;
  /** Keyed by Riot numeric id (as a string). */
  champions: Record<string, CuratedMetaEntry>;
}

/** A synergy edge (data/curated/synergies.json). */
export interface Synergy {
  a: number;
  b: number;
  strength: 1 | 2 | 3;
  reason: string;
}

/** A lane/role matchup edge: `champion` beats `counters` in `role`. */
export interface Counter {
  champion: number;
  counters: number;
  role: Position;
  strength: 1 | 2 | 3;
  reason: string;
}

/** Runtime champion: generated base merged with curated tags and meta. */
export type Champion = ChampionBase & {
  subclass: string;
  tags: CuratedTags;
  perRole: Partial<Record<Position, RoleTags>>;
  flexRoles: Position[];
  meta: {
    tierByPosition: Partial<Record<Position, Tier>>;
    banPriority: number;
  };
  /** True when no curated tag entry existed and neutral defaults were used. */
  curatedMissing?: boolean;
};
