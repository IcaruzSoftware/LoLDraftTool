import { describe, it, expect } from 'vitest';
import { inferEnemyRoles, assignOurRoles } from './roles';
import { makeChampion, championMap } from './testHelpers';
import { emptyPool } from './pool';
import type { PickSlot } from './draft';

const nocturne = makeChampion({ id: 56, name: 'Nocturne', positions: { jungle: 1 } });
const galio = makeChampion({ id: 3, name: 'Galio', positions: { mid: 1, support: 0.6 } });
const shen = makeChampion({ id: 98, name: 'Shen', positions: { top: 1, support: 0.6 } });

describe('inferEnemyRoles', () => {
  it('assigns the product-maximizing distinct roles', () => {
    const champs = championMap([nocturne, galio, shen]);
    const picks: PickSlot[] = [{ championId: 56 }, { championId: 3 }, { championId: 98 }];
    const { assignments, openRoles } = inferEnemyRoles(picks, champs);

    const byId = new Map(assignments.map((a) => [a.championId, a.role]));
    expect(byId.get(56)).toBe('jungle');
    expect(byId.get(3)).toBe('mid');
    expect(byId.get(98)).toBe('top');
    expect(openRoles).toEqual(['bot', 'support']);
  });

  it('is more confident about a single-role champion than a flex', () => {
    const champs = championMap([nocturne, galio, shen]);
    const picks: PickSlot[] = [{ championId: 56 }, { championId: 3 }, { championId: 98 }];
    const { assignments } = inferEnemyRoles(picks, champs);
    const conf = new Map(assignments.map((a) => [a.championId, a.confidence]));
    expect(conf.get(56)!).toBeGreaterThan(conf.get(3)!);
    expect(conf.get(56)!).toBeGreaterThan(0.9);
    expect(conf.get(3)!).toBeLessThan(0.8);
  });

  it('respects a user-set role', () => {
    const champs = championMap([nocturne, galio, shen]);
    // force Galio to support; Shen must then take top, Nocturne jungle
    const picks: PickSlot[] = [{ championId: 56 }, { championId: 3, role: 'support' }, { championId: 98 }];
    const { assignments } = inferEnemyRoles(picks, champs);
    const byId = new Map(assignments.map((a) => [a.championId, a.role]));
    expect(byId.get(3)).toBe('support');
    expect(byId.get(98)).toBe('top');
    expect(byId.get(56)).toBe('jungle');
  });
});

describe('assignOurRoles', () => {
  it('assigns by pool membership and reports open roles', () => {
    const pool = emptyPool();
    pool.top.comfort = [78];
    pool.support.comfort = [40];
    const picks: PickSlot[] = [{ championId: 78 }, { championId: 40 }];
    const { assignments, openRoles } = assignOurRoles(picks, pool);
    const byId = new Map(assignments.map((a) => [a.championId, a.role]));
    expect(byId.get(78)).toBe('top');
    expect(byId.get(40)).toBe('support');
    expect(openRoles).toEqual(['jungle', 'mid', 'bot']);
  });

  it('resolves an ambiguous pool pick against the open roles', () => {
    const pool = emptyPool();
    pool.top.comfort = [78]; // Poppy in top
    pool.jungle.good = [78]; // and jungle
    pool.support.comfort = [40];
    // Poppy fixed to jungle via override leaves top open
    const picks: PickSlot[] = [{ championId: 78, role: 'jungle' }, { championId: 40 }];
    const { assignments, openRoles } = assignOurRoles(picks, pool);
    const byId = new Map(assignments.map((a) => [a.championId, a.role]));
    expect(byId.get(78)).toBe('jungle');
    expect(openRoles).toContain('top');
  });
});
