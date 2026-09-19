import { describe, it, expect } from 'vitest';
import { createDraft, type DraftState } from './draft';
import { inferEnemyRoles, assignOurRoles } from './roles';
import { emptyPool } from './pool';
import { makeChampion, championMap } from './testHelpers';
import { recommendPicks, recommendBans, draftSummary, type RecommendContext } from './recommend';

// --- Enemy (locked): Nocturne, Galio, Shen -> Global comp ---
const nocturne = makeChampion({
  id: 56, name: 'Nocturne', positions: { jungle: 1 }, damageType: 'AD',
  tags: { semiGlobal: true, dive: 2, pickCc: 1, spellShield: true, early: 2, mid: 2 },
});
const galio = makeChampion({
  id: 3, name: 'Galio', positions: { mid: 1, support: 0.6 }, damageType: 'AP',
  tags: { semiGlobal: true, engage: 1, frontline: true, counterEngage: 1, mid: 2 },
});
const shen = makeChampion({
  id: 98, name: 'Shen', positions: { top: 1, support: 0.6 }, damageType: 'mixed',
  tags: { global: true, frontline: true, peel: 2, splitpush: 1, late: 2 },
});

// --- Our pool candidates ---
const poppy = makeChampion({
  id: 78, name: 'Poppy', positions: { top: 1, jungle: 0.6, support: 0.4 }, damageType: 'AD',
  tags: { peel: 3, disengage: 1, knockup: true, frontline: true, hardCc: 2 },
  flexRoles: ['top', 'jungle', 'support'], tierByPosition: { top: 'A' },
});
const fiora = makeChampion({
  id: 114, name: 'Fiora', positions: { top: 1 }, damageType: 'AD',
  tags: { duelist: 3, splitpush: 3, antiTank: 2, early: 1 }, flexRoles: ['top'],
});
const sejuani = makeChampion({
  id: 113, name: 'Sejuani', positions: { jungle: 1 }, damageType: 'mixed',
  tags: { engage: 2, aoeCc: 3, frontline: true, hardCc: 3, antiTank: 1 },
});
const orianna = makeChampion({
  id: 61, name: 'Orianna', positions: { mid: 1 }, damageType: 'AP',
  tags: { aoeDamage: 2, aoeCc: 2, peel: 1, disengage: 1, shieldHeal: 1 },
});
const yasuo = makeChampion({
  id: 157, name: 'Yasuo', positions: { mid: 1 }, damageType: 'AD',
  tags: { sustainedDps: 2, duelist: 1 },
});
const jinx = makeChampion({
  id: 222, name: 'Jinx', positions: { bot: 1 }, damageType: 'AD',
  tags: { hypercarry: true, sustainedDps: 3, late: 3, waveclear: 2 },
});
const kaisa = makeChampion({
  id: 145, name: "Kai'Sa", positions: { bot: 1 }, damageType: 'mixed',
  tags: { hypercarry: true, sustainedDps: 2, late: 2 },
});
const janna = makeChampion({
  id: 40, name: 'Janna', positions: { support: 1 }, damageType: 'AP',
  tags: { disengage: 3, peel: 3, shieldHeal: 3, counterEngage: 2, waveclear: 1 },
});
const morgana = makeChampion({
  id: 25, name: 'Morgana', positions: { support: 1 }, damageType: 'AP',
  tags: { spellShield: true, pickCc: 2, peel: 1 },
});

// --- Ban-phase-2 candidates: remaining globals + non-global filler ---
const twistedFate = makeChampion({ id: 4, name: 'Twisted Fate', positions: { mid: 1 }, damageType: 'AP', tags: { global: true, roam: 2 } });
const pantheon = makeChampion({ id: 80, name: 'Pantheon', positions: { mid: 0.6, top: 1, support: 0.6 }, damageType: 'AD', tags: { semiGlobal: true, early: 2 } });
const karthus = makeChampion({ id: 30, name: 'Karthus', positions: { mid: 0.7, jungle: 1 }, damageType: 'AP', tags: { global: true, late: 2, waveclear: 2 } });
const ryze = makeChampion({ id: 13, name: 'Ryze', positions: { mid: 1 }, damageType: 'AP', tags: { semiGlobal: true, late: 2 } });
const garen = makeChampion({ id: 86, name: 'Garen', positions: { top: 1 }, damageType: 'AD', tags: { splitpush: 2, duelist: 1 } });
const ashe = makeChampion({ id: 22, name: 'Ashe', positions: { bot: 1 }, damageType: 'AD', tags: { sustainedDps: 2, pickCc: 1 } });

const ALL = [
  nocturne, galio, shen, poppy, fiora, sejuani, orianna, yasuo, jinx, kaisa, janna, morgana,
  twistedFate, pantheon, karthus, ryze, garen, ashe,
];
const champions = championMap(ALL);

function buildPool() {
  const pool = emptyPool();
  pool.top.comfort = [78, 114];
  pool.jungle.comfort = [113];
  pool.mid.comfort = [61];
  pool.mid.good = [157];
  pool.bot.comfort = [222];
  pool.bot.good = [145];
  pool.support.comfort = [40, 25];
  return pool;
}

function ctxAt(cursor: number): RecommendContext {
  const base = createDraft({ format: 'tournament', side: 'blue' });
  const state: DraftState = {
    ...base,
    cursor,
    picks: { us: [], them: [{ championId: 56 }, { championId: 3 }, { championId: 98 }] },
  };
  const pool = buildPool();
  return {
    state,
    champions,
    synergies: [],
    counters: [],
    pool,
    ourRoles: assignOurRoles(state.picks.us, pool),
    enemyRoles: inferEnemyRoles(state.picks.them, champions),
  };
}

describe('scenario: enemy Nocturne + Galio + Shen (Global comp)', () => {
  it('detects the enemy Global archetype and targets Protect-the-carry', () => {
    const summary = draftSummary(ctxAt(6));
    expect(summary.enemyArchetypes.primary).toBe('global');
    expect(summary.compTargetText).toContain('Global');
  });

  it('ranks Poppy top and Janna/Morgana support with global-answer reasons', () => {
    const recs = recommendPicks(ctxAt(6));
    const answerRe = /disengage|peel|spell shield|Global comp/i;

    const topRecs = recs.filter((r) => r.role === 'top');
    expect(topRecs[0]!.championId).toBe(78); // Poppy is the top top-laner

    const supRecs = recs.filter((r) => r.role === 'support');
    expect(supRecs[0]!.championId).toBe(40); // Janna leads support
    expect(supRecs.map((r) => r.championId)).toContain(25); // Morgana present

    for (const id of [78, 40, 25]) {
      const r = recs.find((x) => x.championId === id)!;
      expect(r.reasons.join(' ')).toMatch(answerRe);
    }
  });

  it('recommends banning remaining global champions in ban phase 2', () => {
    // cursor 13 is a phase-2 us ban in tournament/blue
    const bans = recommendBans(ctxAt(13));
    const score = new Map(bans.map((b) => [b.championId, b.score]));
    const globals = [4, 80, 30, 13];

    for (const g of globals) {
      expect(score.get(g)!).toBeGreaterThan(score.get(86)!); // above Garen
      expect(score.get(g)!).toBeGreaterThan(score.get(22)!); // above Ashe
      const r = bans.find((b) => b.championId === g)!;
      expect(r.reasons.join(' ')).toMatch(/comp/i);
    }
  });
});

describe('ban ownWant: never ban our own planned picks', () => {
  it('ranks a comfort-pool champion below a comparable non-pool champion of equal meta priority', () => {
    // Five champions, all ban priority 3; one (P) sits in our comfort pool for an open role.
    const nonPool = [10, 11, 12, 13].map((id, i) =>
      makeChampion({ id, name: `Zzz${String.fromCharCode(65 + i)}`, positions: { mid: 1 }, banPriority: 3 }),
    );
    const poolChamp = makeChampion({ id: 20, name: 'Aatrox', positions: { top: 1 }, banPriority: 3 });
    const champions = championMap([...nonPool, poolChamp]);

    const pool = emptyPool();
    pool.top.comfort = [20]; // we want Aatrox top

    const base = createDraft({ format: 'tournament', side: 'blue' });
    const state: DraftState = { ...base, cursor: 0, picks: { us: [], them: [] } }; // ban phase 1
    const ctx: RecommendContext = {
      state,
      champions,
      synergies: [],
      counters: [],
      pool,
      ourRoles: assignOurRoles([], pool),
      enemyRoles: inferEnemyRoles([], champions),
    };

    const bans = recommendBans(ctx);
    const top3 = bans.slice(0, 3).map((b) => b.championId);
    expect(top3).not.toContain(20); // we must not be told to ban our own comfort pick
    const rankPool = bans.findIndex((b) => b.championId === 20);
    const rankNon = bans.findIndex((b) => b.championId === 10);
    expect(rankPool).toBeGreaterThan(rankNon); // penalised below the comparable non-pool ban
  });
});
