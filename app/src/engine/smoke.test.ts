import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { ChampionBase } from '../data/types';

declare const process: { cwd(): string };
import { mergeChampions } from '../data/merge';
import { createDraft, applyChampion, currentStep, isComplete, isAvailable, type DraftState } from './draft';
import { assignOurRoles } from './roles';
import { inferEnemyRoles } from './roles';
import { emptyPool } from './pool';
import { championMap } from './testHelpers';
import { recommendPicks, recommendBans, type RecommendContext } from './recommend';

function loadRealChampions() {
  // vitest runs with cwd at the app root
  const path = `${process.cwd()}/public/data/champions.json`;
  const base = JSON.parse(readFileSync(path, 'utf8')) as ChampionBase[];
  // merge with empty curated data -> neutral defaults for every champion
  return mergeChampions(base, { patch: '', champions: {} }, { patch: '', champions: {} });
}

describe('smoke: full auto-drafted tournament game', () => {
  it('drives both sides with recommendations to a complete draft without throwing', () => {
    const champs = loadRealChampions();
    expect(champs.length).toBeGreaterThanOrEqual(165);
    expect(champs.every((c) => c.curatedMissing)).toBe(true); // neutral defaults flagged

    const champions = championMap(champs);
    const pool = emptyPool();
    let state: DraftState = createDraft({ format: 'tournament', side: 'blue' });

    let guard = 0;
    while (!isComplete(state) && guard++ < 40) {
      const step = currentStep(state)!;
      const ctx: RecommendContext = {
        state,
        champions,
        synergies: [],
        counters: [],
        pool,
        ourRoles: assignOurRoles(state.picks.us, pool),
        enemyRoles: inferEnemyRoles(state.picks.them, champions),
      };
      const recs = step.action === 'pick' ? recommendPicks(ctx) : recommendBans(ctx);
      const chosen = recs.find((r) => isAvailable(state, r.championId))?.championId
        ?? champs.find((c) => isAvailable(state, c.id))!.id;
      state = applyChampion(state, chosen);
    }

    expect(isComplete(state)).toBe(true);
    expect(state.picks.us.length + state.picks.them.length).toBe(10);
    expect(state.bans.us.length + state.bans.them.length).toBe(10);
  });
});
