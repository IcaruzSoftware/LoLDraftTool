import { describe, expect, it } from 'vitest';
import { createNameResolver } from './names';
import { parseTeamPool } from './teamPool';
import { loadChampions, loadSample } from './fixtures';

const resolver = createNameResolver(loadChampions());
const id = (name: string): number => {
  const r = resolver.resolve(name);
  if ('error' in r) throw new Error(r.error);
  return r.id;
};

describe('parseTeamPool JSON', () => {
  it('parses the nested per-role format with tolerant keys and player', () => {
    const { pool, warnings } = parseTeamPool(
      JSON.stringify({
        Toplane: { comfy: ['Aatrox'], secondary: ['Gnar'], fill: ['Ornn'], player: 'Alex' },
        Midlane: { main: ['Ahri'], good: ['Syndra'], okay: ['Zed'] },
      }),
      resolver,
    );
    expect(pool.top.comfort).toEqual([id('Aatrox')]);
    expect(pool.top.good).toEqual([id('Gnar')]);
    expect(pool.top.okay).toEqual([id('Ornn')]);
    expect(pool.top.player).toBe('Alex');
    expect(pool.mid.comfort).toEqual([id('Ahri')]);
    // roles not present are still returned empty and warned about.
    expect(pool.jungle.comfort).toEqual([]);
    expect(warnings.some((w) => w.includes('No champions for jungle'))).toBe(true);
  });

  it('parses numeric tier keys', () => {
    const { pool } = parseTeamPool(
      JSON.stringify({ top: { '1': ['Aatrox'], '2': ['Gnar'], '3': ['Ornn'] } }),
      resolver,
    );
    expect(pool.top.comfort).toEqual([id('Aatrox')]);
    expect(pool.top.good).toEqual([id('Gnar')]);
    expect(pool.top.okay).toEqual([id('Ornn')]);
  });

  it('parses the array-of-arrays format', () => {
    const { pool } = parseTeamPool(
      JSON.stringify({ top: [['Aatrox', 'Camille'], ['Gnar'], ['Ornn']] }),
      resolver,
    );
    expect(pool.top.comfort).toEqual([id('Aatrox'), id('Camille')]);
    expect(pool.top.good).toEqual([id('Gnar')]);
    expect(pool.top.okay).toEqual([id('Ornn')]);
  });

  it('parses the flat { role, tier, champion } format', () => {
    const { pool } = parseTeamPool(
      JSON.stringify([
        { role: 'mid', tier: 'comfort', champion: 'Ahri' },
        { role: 'mid', tier: 'good', champion: 'Syndra' },
      ]),
      resolver,
    );
    expect(pool.mid.comfort).toEqual([id('Ahri')]);
    expect(pool.mid.good).toEqual([id('Syndra')]);
  });

  it('warns and skips unknown champions', () => {
    const { pool, warnings } = parseTeamPool(
      JSON.stringify({ top: { comfort: ['Aatrox', 'Notachampion'] } }),
      resolver,
    );
    expect(pool.top.comfort).toEqual([id('Aatrox')]);
    expect(warnings.some((w) => w.includes('Notachampion'))).toBe(true);
  });

  it('keeps the highest tier for duplicates and warns', () => {
    const { pool, warnings } = parseTeamPool(
      JSON.stringify({ top: { comfort: ['Aatrox'], good: ['Aatrox'] } }),
      resolver,
    );
    expect(pool.top.comfort).toEqual([id('Aatrox')]);
    expect(pool.top.good).toEqual([]);
    expect(warnings.some((w) => w.includes('Duplicate'))).toBe(true);
  });

  it('parses the user sample file with loose spellings', () => {
    const { pool } = parseTeamPool(loadSample('team-pool.json'), resolver);
    expect(pool.bot.comfort).toContain(id('Kaisa'));
    expect(pool.bot.comfort).toContain(id('Miss Fortune'));
    expect(pool.support.good).toEqual([id('Renata Glasc')]);
    expect(pool.top.player).toBe('Alex');
  });
});

describe('parseTeamPool CSV', () => {
  it('parses the sample CSV file', () => {
    const { pool } = parseTeamPool(loadSample('team-pool.csv'), resolver);
    expect(pool.top.comfort).toEqual([id('Aatrox'), id('Camille')]);
    expect(pool.bot.comfort).toContain(id('Miss Fortune'));
    expect(pool.jungle.player).toBe('Sam');
  });

  it('handles BOM, CRLF, semicolons and quotes', () => {
    const csv =
      '﻿role;tier;champion;player\r\n' +
      'top;comfort;"Aatrox";Alex\r\n' +
      'bot;comfort;"Kai\'Sa";Leo\r\n';
    const { pool } = parseTeamPool(csv, resolver);
    expect(pool.top.comfort).toEqual([id('Aatrox')]);
    expect(pool.bot.comfort).toEqual([id("Kai'Sa")]);
    expect(pool.top.player).toBe('Alex');
  });
});
