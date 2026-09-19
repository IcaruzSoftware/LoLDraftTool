import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { ChampionBase } from '../data/types';
import type { Champion, Counter, MetaFile, Synergy, TagsFile } from '../data/curatedTypes';
import { mergeChampions } from '../data/merge';
import { createDraft, type DraftState } from './draft';
import { assignOurRoles, inferEnemyRoles } from './roles';
import { emptyPool, type TeamPool } from './pool';
import { championMap } from './testHelpers';
import { recommendPicks, recommendBans, draftSummary, type RecommendContext } from './recommend';

declare const process: { cwd(): string };

/** Loads real generated + curated data straight from the repo via fs. */
function loadReal(): { champions: Champion[]; synergies: Synergy[]; counters: Counter[] } {
  const cwd = process.cwd(); // app root under vitest
  const read = (p: string) => readFileSync(`${cwd}/${p}`, 'utf8');
  const base = JSON.parse(read('public/data/champions.json')) as ChampionBase[];
  const tags = JSON.parse(read('../data/curated/tags.json')) as TagsFile;
  const meta = JSON.parse(read('../data/curated/meta.json')) as MetaFile;
  const synergies = JSON.parse(read('../data/curated/synergies.json')) as Synergy[];
  const counters = JSON.parse(read('../data/curated/counters.json')) as Counter[];
  return { champions: mergeChampions(base, tags, meta), synergies, counters };
}

/** Resolves a champion name to its id via name/alias (with a couple of aliases). */
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

/** Builds the sample team pool plus the extra Poppy / Janna / Morgana entries. */
function buildPool(r: (name: string) => number): TeamPool {
  const pool = emptyPool();
  pool.top = { player: 'Alex', comfort: [r('Aatrox'), r('Camille')], good: [r('Gnar'), r('Jax')], okay: [r('Ornn')] };
  pool.jungle = { player: 'Sam', comfort: [r('Lee Sin'), r('Viego')], good: [r('Sejuani')], okay: [r('Warwick')] };
  pool.mid = { player: 'Max', comfort: [r('Ahri'), r('Orianna')], good: [r('Syndra')], okay: [r('Zed')] };
  pool.bot = { player: 'Leo', comfort: [r('Kaisa'), r('MF')], good: [r('Jinx')], okay: [r('Ezreal')] };
  pool.support = { player: 'Kai', comfort: [r('Thresh'), r('Nautilus')], good: [r('Renata Glasc')], okay: [r('Lulu')] };
  // repro additions
  pool.top.good.push(78); // Poppy
  pool.jungle.good.push(78);
  pool.support.good.push(40, 25); // Janna, Morgana
  return pool;
}

const NOCTURNE = 56;
const GALIO = 3;
const SHEN = 98;

describe('smoke (real curated data): Global-comp scenario', () => {
  const { champions: champs, synergies, counters } = loadReal();
  const champions = championMap(champs);
  const r = makeResolver(champs);
  const pool = buildPool(r);

  const ctxFor = (cursor: number, us: number[], them: number[]): RecommendContext => {
    const base = createDraft({ format: 'tournament', side: 'blue' });
    const state: DraftState = {
      ...base,
      cursor,
      picks: { us: us.map((championId) => ({ championId })), them: them.map((championId) => ({ championId })) },
    };
    return {
      state,
      champions,
      synergies,
      counters,
      pool,
      ourRoles: assignOurRoles(state.picks.us, pool),
      enemyRoles: inferEnemyRoles(state.picks.them, champions),
    };
  };

  it('detects the enemy Global comp once Nocturne/Galio/Shen are locked', () => {
    const summary = draftSummary(ctxFor(11, [], [NOCTURNE, GALIO, SHEN]));
    expect(summary.enemyArchetypes.primary).toBe('global');
    expect(summary.compTargetText).toContain('Global');
  });

  it('recommends Poppy in the top 3 at B2 with a Nocturne reason', () => {
    // B2 (step index 9): enemy has R1 Nocturne, R2 Galio; our B1 was Kai'Sa (bot)
    const recs = recommendPicks(ctxFor(9, [145], [NOCTURNE, GALIO]));
    const top3 = recs.slice(0, 3).map((x) => x.championId);
    expect(top3).toContain(78);
    const poppy = recs.find((x) => x.championId === 78)!;
    expect(poppy.reasons.join(' ')).toMatch(/Nocturne/);
  });

  it('surfaces remaining global champions among the top phase-2 bans', () => {
    // cursor 13 = phase-2 us ban; three picks each on the board
    const bans = recommendBans(ctxFor(13, [145, 61, 412], [NOCTURNE, GALIO, SHEN]));
    const top5 = bans.slice(0, 5).map((b) => b.championId);
    const remainingGlobals = [4, 80, 30, 13, 41]; // TF, Pantheon, Karthus, Ryze, Gangplank
    const hits = top5.filter((id) => remainingGlobals.includes(id));
    expect(hits.length).toBeGreaterThanOrEqual(2);
  });
});
