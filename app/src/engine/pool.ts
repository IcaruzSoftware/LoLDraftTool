import type { Position } from '../data/types';

/** A single role's champion pool, split by comfort tier, plus an optional player. */
export interface RolePool {
  comfort: number[];
  good: number[];
  okay: number[];
  player?: string;
}

/** Our team's champion pool, one entry per role. */
export type TeamPool = Record<Position, RolePool>;

/** Comfort tier of a champion in a role, or `null` if not in that pool. */
export type PoolTier = 'comfort' | 'good' | 'okay';

/** Returns the pool tier of `id` in `role`, or `null` when absent. */
export function poolTier(pool: TeamPool, role: Position, id: number): PoolTier | null {
  const rp = pool[role];
  if (!rp) return null;
  if (rp.comfort.includes(id)) return 'comfort';
  if (rp.good.includes(id)) return 'good';
  if (rp.okay.includes(id)) return 'okay';
  return null;
}

/** An empty pool for every role (useful as a default / for tests). */
export function emptyPool(): TeamPool {
  return {
    top: { comfort: [], good: [], okay: [] },
    jungle: { comfort: [], good: [], okay: [] },
    mid: { comfort: [], good: [], okay: [] },
    bot: { comfort: [], good: [], okay: [] },
    support: { comfort: [], good: [], okay: [] },
  };
}
