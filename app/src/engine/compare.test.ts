import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { ChampionBase } from '../data/types';
import type { Champion, Counter, MetaFile, Synergy, TagsFile } from '../data/curatedTypes';
import { mergeChampions } from '../data/merge';
import { createDraft, type DraftState } from './draft';
import { emptyPool, type TeamPool } from './pool';
import { assignOurRoles, inferEnemyRoles, type RoleInference } from './roles';
import { makeChampion, championMap } from './testHelpers';
import { compareTeams } from './compare';
import type { RecommendContext } from './recommend';

declare const process: { cwd(): string };

function ctxOf(opts: {
  us: number[];
  them: number[];
  champions: Map<number, Champion>;
  counters?: Counter[];
  ourRoles: RoleInference;
  enemyRoles: RoleInference;
}): RecommendContext {
  const base = createDraft({ format: 'tournament', side: 'blue' });
  const state: DraftState = {
    ...base,
    cursor: base.steps.length,
    picks: {
      us: opts.us.map((championId) => ({ championId })),
      them: opts.them.map((championId) => ({ championId })),
    },
  };
  return {
    state,
    champions: opts.champions,
    synergies: [],
    counters: opts.counters ?? [],
    pool: emptyPool(),
    ourRoles: opts.ourRoles,
    enemyRoles: opts.enemyRoles,
  };
}

describe('compareTeams (fixtures)', () => {
  const aatrox = makeChampion({ id: 1, name: 'Aatrox', positions: { top: 1 }, damageType: 'AD', tags: { early: 3, engage: 1, frontline: true, hardCc: 1 } });
  const orianna = makeChampion({ id: 2, name: 'Orianna', positions: { mid: 1 }, damageType: 'AP', tags: { late: 3, poke: 2, disengage: 1 } });
  const malphite = makeChampion({ id: 3, name: 'Malphite', positions: { top: 1 }, damageType: 'AP', tags: { engage: 3, hardCc: 3, frontline: true } });
  const jinx = makeChampion({ id: 4, name: 'Jinx', positions: { bot: 1 }, damageType: 'AD', tags: { late: 3 } });
  const champions = championMap([aatrox, orianna, malphite, jinx]);

  const ourRoles: RoleInference = {
    assignments: [
      { championId: 1, role: 'top', confidence: 1 },
      { championId: 2, role: 'mid', confidence: 1 },
    ],
    openRoles: ['jungle', 'bot', 'support'],
  };
  const enemyRoles: RoleInference = {
    assignments: [
      { championId: 3, role: 'top', confidence: 1 },
      { championId: 4, role: 'bot', confidence: 1 },
    ],
    openRoles: ['jungle', 'mid', 'support'],
  };

  it('sums each dimension across both sides with no NaN', () => {
    const cmp = compareTeams(ctxOf({ us: [1, 2], them: [3, 4], champions, ourRoles, enemyRoles }));
    expect(cmp.dimensions.length).toBeGreaterThanOrEqual(10);
    for (const d of cmp.dimensions) {
      expect(Number.isFinite(d.us)).toBe(true);
      expect(Number.isFinite(d.them)).toBe(true);
      expect(d.scale).toBeGreaterThan(0);
    }
    const early = cmp.dimensions.find((d) => d.key === 'early')!;
    expect(early.us).toBe(3);
    expect(early.them).toBe(0);
    const late = cmp.dimensions.find((d) => d.key === 'late')!;
    expect(late.us).toBe(3);
    expect(late.them).toBe(3);
    const physical = cmp.dimensions.find((d) => d.key === 'physical')!;
    expect(physical.us).toBe(1); // Aatrox AD
    expect(physical.them).toBe(1); // Jinx AD
  });

  it('reads a lane edge from the counters table', () => {
    const counters: Counter[] = [
      { champion: 1, counters: 3, role: 'top', strength: 2, reason: 'Aatrox out-trades Malphite' },
    ];
    const cmp = compareTeams(ctxOf({ us: [1, 2], them: [3, 4], champions, counters, ourRoles, enemyRoles }));
    expect(cmp.lanes.length).toBe(5);
    const top = cmp.lanes.find((l) => l.role === 'top')!;
    expect(top.edge).toBe('us');
    expect(top.strength).toBe(2);
    expect(top.reason).toBe('Aatrox out-trades Malphite');
    // A lane with only one champion stays even.
    const jungle = cmp.lanes.find((l) => l.role === 'jungle')!;
    expect(jungle.edge).toBe('even');
  });

  it('derives strengths, weaknesses and a game plan', () => {
    const cmp = compareTeams(ctxOf({ us: [1, 2], them: [3, 4], champions, ourRoles, enemyRoles }));
    expect(cmp.plan.headline.length).toBeGreaterThan(0);
    expect(cmp.plan.bullets.length).toBeGreaterThanOrEqual(3);
    // Us has the early edge; them has more hard CC / frontline.
    expect(cmp.strengths.us.join(' ')).toMatch(/early/i);
  });
});

/** Loads real generated + curated data straight from the repo via fs. */
function loadReal(): { champions: Champion[]; counters: Counter[] } {
  const cwd = process.cwd();
  const read = (p: string) => readFileSync(`${cwd}/${p}`, 'utf8');
  const base = JSON.parse(read('public/data/champions.json')) as ChampionBase[];
  const tags = JSON.parse(read('../data/curated/tags.json')) as TagsFile;
  const meta = JSON.parse(read('../data/curated/meta.json')) as MetaFile;
  const synergies = JSON.parse(read('../data/curated/synergies.json')) as Synergy[];
  const counters = JSON.parse(read('../data/curated/counters.json')) as Counter[];
  void synergies;
  return { champions: mergeChampions(base, tags, meta), counters };
}

function makeResolver(champs: Champion[]): (name: string) => number {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const byNorm = new Map<string, number>();
  for (const c of champs) {
    byNorm.set(norm(c.name), c.id);
    byNorm.set(norm(c.alias), c.id);
  }
  const aliases: Record<string, string> = { mf: 'missfortune' };
  return (name: string) => {
    const k = norm(name);
    const id = byNorm.get(k) ?? (aliases[k] ? byNorm.get(aliases[k]) : undefined);
    if (id === undefined) throw new Error(`unresolved champion: ${name}`);
    return id;
  };
}

describe('compareTeams (real curated data)', () => {
  const { champions: champs, counters } = loadReal();
  const champions = championMap(champs);
  const r = makeResolver(champs);

  it('produces sane output for a real comp vs comp', () => {
    const us = [r('Ornn'), r('Nocturne'), r('Galio'), r('Miss Fortune'), r('Leona')];
    const them = [r('Rell'), r('Graves'), r('Ahri'), r('Ashe'), r('Alistar')];

    const pool: TeamPool = emptyPool();
    pool.top.okay = [us[0]!];
    pool.jungle.okay = [us[1]!];
    pool.mid.okay = [us[2]!];
    pool.bot.okay = [us[3]!];
    pool.support.okay = [us[4]!];

    const base = createDraft({ format: 'tournament', side: 'blue' });
    const state: DraftState = {
      ...base,
      cursor: base.steps.length,
      picks: { us: us.map((championId) => ({ championId })), them: them.map((championId) => ({ championId })) },
    };
    const ctx: RecommendContext = {
      state,
      champions,
      synergies: [],
      counters,
      pool,
      ourRoles: assignOurRoles(state.picks.us, pool),
      enemyRoles: inferEnemyRoles(state.picks.them, champions),
    };

    const cmp = compareTeams(ctx);
    expect(cmp.lanes.length).toBe(5);
    expect(cmp.plan.headline.length).toBeGreaterThan(0);
    expect(cmp.dimensions.length).toBeGreaterThanOrEqual(10);
    for (const d of cmp.dimensions) {
      expect(Number.isNaN(d.us)).toBe(false);
      expect(Number.isNaN(d.them)).toBe(false);
      expect(Number.isNaN(d.scale)).toBe(false);
    }
    expect(cmp.archetypes.us.scores).toBeDefined();
    expect(cmp.archetypes.them.scores).toBeDefined();
  });
});
