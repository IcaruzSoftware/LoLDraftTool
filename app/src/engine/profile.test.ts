import { describe, it, expect } from 'vitest';
import {
  detectArchetypes,
  hygieneWarnings,
  needsWeights,
  teamProfile,
  RPS,
} from './profile';
import { makeChampion } from './testHelpers';

describe('teamProfile', () => {
  it('counts damage types with mixed as 0.5 each', () => {
    const p = teamProfile([
      makeChampion({ id: 1, name: 'A', positions: { top: 1 }, damageType: 'AD' }),
      makeChampion({ id: 2, name: 'B', positions: { mid: 1 }, damageType: 'AP' }),
      makeChampion({ id: 3, name: 'C', positions: { bot: 1 }, damageType: 'mixed' }),
    ]);
    expect(p.adCount).toBe(1.5);
    expect(p.apCount).toBe(1.5);
    expect(p.pickCount).toBe(3);
  });
});

describe('detectArchetypes', () => {
  it('detects a global comp from three global/semi-global champions', () => {
    const champs = [
      makeChampion({ id: 98, name: 'Shen', positions: { top: 1 }, tags: { global: true, frontline: true } }),
      makeChampion({ id: 4, name: 'TwistedFate', positions: { mid: 1 }, tags: { global: true, roam: 2 } }),
      makeChampion({ id: 56, name: 'Nocturne', positions: { jungle: 1 }, tags: { semiGlobal: true, dive: 2 } }),
    ];
    const arch = detectArchetypes(teamProfile(champs), champs.length);
    expect(arch.primary).toBe('global');
    expect(arch.scores.global).toBeGreaterThanOrEqual(0.5);
  });

  it('detects an engage comp', () => {
    const champs = [
      makeChampion({ id: 54, name: 'Malphite', positions: { top: 1 }, tags: { engage: 3, aoeCc: 2, aoeDamage: 2, frontline: true } }),
      makeChampion({ id: 61, name: 'Orianna', positions: { mid: 1 }, tags: { engage: 1, aoeCc: 2, aoeDamage: 2 } }),
      makeChampion({ id: 32, name: 'Amumu', positions: { jungle: 1 }, tags: { engage: 3, aoeCc: 3, aoeDamage: 2, frontline: true } }),
    ];
    expect(detectArchetypes(teamProfile(champs), champs.length).primary).toBe('engage');
  });

  it('detects a protect comp', () => {
    const champs = [
      makeChampion({ id: 222, name: 'Jinx', positions: { bot: 1 }, tags: { hypercarry: true, sustainedDps: 3, late: 3 } }),
      makeChampion({ id: 117, name: 'Lulu', positions: { support: 1 }, tags: { peel: 3, shieldHeal: 3, disengage: 1 } }),
      makeChampion({ id: 40, name: 'Janna', positions: { support: 1 }, tags: { disengage: 3, peel: 3, shieldHeal: 2 } }),
    ];
    expect(detectArchetypes(teamProfile(champs), champs.length).primary).toBe('protect');
  });

  it('returns no primary for an empty comp', () => {
    const arch = detectArchetypes(teamProfile([]), 0);
    expect(arch.primary).toBeUndefined();
    expect(arch.scores.engage).toBe(0);
  });

  it('caps confidence by pick count so one pick cannot define a comp', () => {
    // A single strong engage/global champion must not read as 100%.
    const one = [
      makeChampion({ id: 54, name: 'Malphite', positions: { top: 1 }, tags: { engage: 3, aoeCc: 3, aoeDamage: 3, global: true } }),
    ];
    const arch1 = detectArchetypes(teamProfile(one), 1);
    for (const a of Object.values(arch1.scores)) expect(a).toBeLessThanOrEqual(1 / 3 + 1e-9);
    expect(arch1.primary).toBeUndefined(); // < 0.5, so "draft for flexibility"

    const two = [...one, makeChampion({ id: 32, name: 'Amumu', positions: { jungle: 1 }, tags: { engage: 3, aoeCc: 3, semiGlobal: true } })];
    const arch2 = detectArchetypes(teamProfile(two), 2);
    for (const a of Object.values(arch2.scores)) expect(a).toBeLessThanOrEqual(2 / 3 + 1e-9);
    expect(arch2.primary).toBeDefined(); // 2 picks may declare a primary
  });
});

describe('RPS / needs / hygiene', () => {
  it('maps a global enemy to a protect-the-carry target', () => {
    expect(RPS.global.label).toContain('Global');
    expect(RPS.global.desired.disengage).toBeGreaterThan(0);
  });

  it('flags a missing frontline in needs', () => {
    const ours = teamProfile([
      makeChampion({ id: 1, name: 'A', positions: { mid: 1 } }),
      makeChampion({ id: 2, name: 'B', positions: { bot: 1 } }),
    ]);
    const enemy = teamProfile([]);
    expect(needsWeights(ours, enemy, 3).frontline).toBeGreaterThan(0);
  });

  it('warns to bring anti-heal against heavy enemy sustain', () => {
    const ours = teamProfile([makeChampion({ id: 1, name: 'A', positions: { mid: 1 } })]);
    const enemy = teamProfile([
      makeChampion({ id: 2, name: 'S1', positions: { support: 1 }, tags: { sustain: 2 } }),
      makeChampion({ id: 3, name: 'S2', positions: { top: 1 }, tags: { sustain: 2 } }),
    ]);
    expect(hygieneWarnings(ours, enemy, 4).some((w) => w.code === 'needAntiHeal')).toBe(true);
  });
});
