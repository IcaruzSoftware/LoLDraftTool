import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createNameResolver } from './names';
import { loadChampions } from './fixtures';
import {
  parseMultisearchUrl,
  parseSummonerChampionsHtml,
  summonerChampionsUrl,
} from './opggMultilink';

const champions = loadChampions();
const resolver = createNameResolver(champions);
const knownIds = new Set(champions.map((c) => c.id));

const dir = fileURLToPath(import.meta.url).replace(/[\\/][^\\/]*$/, '');
const fixture = readFileSync(`${dir}/__fixtures__/opgg-champions.html`, 'utf8');

const SAMPLE =
  'https://op.gg/lol/multisearch/euw?summoners=' +
  'ECO+Freyja%23ECO%2CChronos11%231111%2CKama+D+Bembel%23Sett%2CHideki+Sensei%234564%2CIkaruz%23187';

describe('parseMultisearchUrl', () => {
  it('parses the sample multi-search link', () => {
    const result = parseMultisearchUrl(SAMPLE);
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.region).toBe('euw');
    expect(result.summoners).toEqual([
      { name: 'ECO Freyja', tag: 'ECO' },
      { name: 'Chronos11', tag: '1111' },
      { name: 'Kama D Bembel', tag: 'Sett' },
      { name: 'Hideki Sensei', tag: '4564' },
      { name: 'Ikaruz', tag: '187' },
    ]);
  });

  it('tolerates www, a locale prefix and %20 spaces', () => {
    const result = parseMultisearchUrl(
      'https://www.op.gg/de/lol/multisearch/kr?summoners=Hide%20on%20bush%23KR1',
    );
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.region).toBe('kr');
    expect(result.summoners).toEqual([{ name: 'Hide on bush', tag: 'KR1' }]);
  });

  it('accepts a bare Name#TAG list defaulting to euw', () => {
    const result = parseMultisearchUrl('Ikaruz#187, Chronos11#1111');
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.region).toBe('euw');
    expect(result.summoners).toEqual([
      { name: 'Ikaruz', tag: '187' },
      { name: 'Chronos11', tag: '1111' },
    ]);
  });

  it('rejects non-op.gg links', () => {
    const result = parseMultisearchUrl('https://example.com/lol/multisearch/euw?summoners=A%23B');
    expect('error' in result).toBe(true);
  });
});

describe('summonerChampionsUrl', () => {
  it('encodes spaces as %20 and joins name-tag with a dash', () => {
    expect(summonerChampionsUrl('euw', 'Kama D Bembel', 'Sett')).toBe(
      'https://op.gg/lol/summoners/euw/Kama%20D%20Bembel-Sett/champions',
    );
    expect(summonerChampionsUrl('EUW', 'Ikaruz', '187')).toBe(
      'https://op.gg/lol/summoners/euw/Ikaruz-187/champions',
    );
  });
});

describe('parseSummonerChampionsHtml', () => {
  const cassiopeia = resolver.resolve('Cassiopeia');
  const cassId = 'error' in cassiopeia ? -1 : cassiopeia.id;

  it('reads champion stats from the JSON payload', () => {
    const result = parseSummonerChampionsHtml(fixture, knownIds, resolver);
    expect(result.source).toBe('json');
    const cass = result.champions.find((c) => c.championId === cassId);
    expect(cass).toBeDefined();
    // Cassiopeia: 53 games (26W/27L) — most played, so first after sorting.
    expect(result.champions[0]!.championId).toBe(cassId);
    expect(cass!.games).toBe(53);
    expect(cass!.wins).toBe(26);
    // The id:0 "All champions" total row must not leak in.
    expect(result.champions.some((c) => c.championId === 0)).toBe(false);
    expect(result.champions.length).toBeLessThanOrEqual(30);
  });

  it('falls back to the HTML table when the script payload is absent', () => {
    const tableOnly = fixture.replace(/<script[\s\S]*?<\/script>/gi, '');
    const result = parseSummonerChampionsHtml(tableOnly, knownIds, resolver);
    expect(result.source).toBe('table');
    const cass = result.champions.find((c) => c.championId === cassId);
    expect(cass).toBeDefined();
    expect(cass!.games).toBe(53);
    expect(cass!.wins).toBe(26);
  });
});
