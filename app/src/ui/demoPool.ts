import type { Position } from '../data/types';
import type { NameResolver } from '../import/types';
import type { TeamPool } from '../engine/pool';
import { emptyPool } from '../engine/pool';

/** A believable demo pool by role and tier, as champion names. */
const DEMO: Record<Position, { comfort: string[]; good: string[]; okay: string[] }> = {
  top: { comfort: ['Aatrox', 'Ornn'], good: ['Jax'], okay: ['Sion'] },
  jungle: { comfort: ['Lee Sin', 'Sejuani'], good: ['Vi'], okay: ['Nunu'] },
  mid: { comfort: ['Ahri', 'Orianna'], good: ['Syndra'], okay: ['Malzahar'] },
  bot: { comfort: ['Jinx', 'Kaisa'], good: ['Caitlyn'], okay: ['Ezreal'] },
  support: { comfort: ['Nautilus', 'Lulu'], good: ['Thresh'], okay: ['Karma'] },
};

/**
 * Builds a demo {@link TeamPool} from a hardcoded champion list, resolving names
 * against the loaded dataset. Names that do not resolve are silently skipped, so
 * the demo stays usable with any champion set (including test fixtures).
 */
export function buildDemoPool(resolver: NameResolver): TeamPool {
  const pool = emptyPool();
  const roles = Object.keys(DEMO) as Position[];
  for (const role of roles) {
    const tiers = DEMO[role];
    (['comfort', 'good', 'okay'] as const).forEach((tier) => {
      for (const name of tiers[tier]) {
        const res = resolver.resolve(name);
        if (!('error' in res)) pool[role][tier].push(res.id);
      }
    });
    pool[role].player = `Demo ${role}`;
  }
  return pool;
}
