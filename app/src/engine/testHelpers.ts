import type { DamageType, AttackType, Position } from '../data/types';
import { POSITIONS } from '../data/types';
import type { Champion, CuratedTags, RoleTags, Tier } from '../data/curatedTypes';
import { neutralTags } from '../data/merge';

/** Options for {@link makeChampion}; everything but id/name/positions is optional. */
export interface MakeChampionOptions {
  id: number;
  name: string;
  positions: Partial<Record<Position, number>>;
  damageType?: DamageType;
  attackType?: AttackType;
  tags?: Partial<CuratedTags>;
  flexRoles?: Position[];
  perRole?: Partial<Record<Position, RoleTags>>;
  tierByPosition?: Partial<Record<Position, Tier>>;
  banPriority?: number;
  subclass?: string;
}

/** Builds a fully-formed {@link Champion} for tests, with sensible defaults. */
export function makeChampion(o: MakeChampionOptions): Champion {
  const perRole: Partial<Record<Position, RoleTags>> = {};
  for (const p of POSITIONS) if ((o.positions[p] ?? 0) > 0) perRole[p] = { blindSafe: 1, counterSensitivity: 1 };

  return {
    id: o.id,
    alias: o.name.replace(/[^A-Za-z]/g, ''),
    name: o.name,
    riotTags: [],
    damageType: o.damageType ?? 'AD',
    attackType: o.attackType ?? 'ranged',
    range: 500,
    positions: o.positions,
    playstyle: { damage: 2, durability: 2, crowdControl: 2, mobility: 2, utility: 2 },
    riotPlaystylePrimary: '',
    riotPlaystyleSecondary: '',
    difficulty: 1,
    merakiRoles: [],
    subclass: o.subclass ?? '',
    tags: { ...neutralTags(), ...o.tags },
    perRole: o.perRole ?? perRole,
    flexRoles: o.flexRoles ?? [],
    meta: { tierByPosition: o.tierByPosition ?? {}, banPriority: o.banPriority ?? 0 },
  };
}

/** Builds a Map keyed by championId from a list. */
export function championMap(list: Champion[]): Map<number, Champion> {
  return new Map(list.map((c) => [c.id, c]));
}
