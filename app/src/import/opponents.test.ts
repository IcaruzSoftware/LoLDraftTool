import { describe, expect, it } from 'vitest';
import { createNameResolver } from './names';
import { parseOpponents, parseOpggPaste } from './opponents';
import { loadChampions, loadSample } from './fixtures';

const resolver = createNameResolver(loadChampions());
const id = (name: string): number => {
  const r = resolver.resolve(name);
  if ('error' in r) throw new Error(r.error);
  return r.id;
};

describe('parseOpponents JSON', () => {
  it('parses the sample file (5 players)', () => {
    const { data, warnings } = parseOpponents(loadSample('opponents.json'), resolver);
    expect(warnings).toEqual([]);
    expect(data.players).toHaveLength(5);
    const mid = data.players.find((p) => p.name === 'Midlaner#EUW')!;
    expect(mid.role).toBe('mid');
    expect(mid.champions[0]).toEqual({ championId: id('Aurora'), games: 60, wins: 35 });
  });

  it('derives wins from winrate (fraction and percent)', () => {
    const { data } = parseOpponents(
      JSON.stringify({
        players: [
          {
            name: 'P',
            role: 'mid',
            champions: [
              { name: 'Orianna', games: 42, winrate: 0.5 },
              { name: 'Ahri', games: 20, winrate: 60 },
            ],
          },
        ],
      }),
      resolver,
    );
    expect(data.players[0]!.champions[0]!.wins).toBe(21);
    expect(data.players[0]!.champions[1]!.wins).toBe(12);
  });

  it('accepts championId directly', () => {
    const { data } = parseOpponents(
      JSON.stringify({ players: [{ name: 'P', champions: [{ championId: 238, games: 10, wins: 5 }] }] }),
      resolver,
    );
    expect(data.players[0]!.champions[0]!.championId).toBe(238);
  });
});

describe('parseOpponents CSV', () => {
  it('parses the sample CSV grouping by player', () => {
    const { data } = parseOpponents(loadSample('opponents.csv'), resolver);
    expect(data.players).toHaveLength(5);
    const top = data.players.find((p) => p.name === 'Toplaner#EUW')!;
    expect(top.role).toBe('top');
    expect(top.champions).toHaveLength(2);
    expect(top.champions[0]).toEqual({ championId: id("K'Sante"), games: 48, wins: 27 });
  });

  it('derives wins from a winrate column', () => {
    const csv = 'player,role,champion,games,winrate\nP,mid,Ahri,20,60\n';
    const { data } = parseOpponents(csv, resolver);
    expect(data.players[0]!.champions[0]!.wins).toBe(12);
  });
});

describe('parseOpggPaste', () => {
  it('parses the sample paste, skipping the totals row', () => {
    const { data, warnings } = parseOpponents(loadSample('opgg-paste.txt'), resolver, {
      playerName: 'Faker#KR1',
      role: 'mid',
    });
    expect(warnings).toEqual([]);
    expect(data.players).toHaveLength(1);
    const player = data.players[0]!;
    expect(player.name).toBe('Faker#KR1');
    expect(player.role).toBe('mid');
    expect(player.champions).toHaveLength(8);
    expect(player.champions[0]).toEqual({ championId: id('Aurora'), games: 55, wins: 32 });
  });

  it('parses the split layout (name on its own line)', () => {
    const paste = 'Aurora\n32W 23L 58%\n3.13:1\nOrianna\n10 W 8 L 56%\n';
    const { data } = parseOpggPaste(paste, resolver, 'Opp', 'mid');
    expect(data.players[0]!.champions).toEqual([
      { championId: id('Aurora'), games: 55, wins: 32 },
      { championId: id('Orianna'), games: 18, wins: 10 },
    ]);
  });

  it('defaults the player name to "Opponent"', () => {
    const { data } = parseOpggPaste('1 Ahri 5W 5L 50%\n', resolver);
    expect(data.players[0]!.name).toBe('Opponent');
  });
});
