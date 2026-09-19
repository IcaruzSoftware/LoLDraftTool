import type { OpponentData } from './types';
import type { NameResolver } from './types';
import { fetchText } from '../platform/index';
import {
  parseMultisearchUrl,
  parseSummonerChampionsHtml,
  summonerChampionsUrl,
  type Summoner,
} from './opggMultilink';

export interface FetchOpponentsOptions {
  /** All valid champion ids, used to filter the parsed payload. */
  knownIds: Set<number>;
  /** Called after each summoner is fetched (or fails). */
  onProgress?: (done: number, total: number, name: string) => void;
  /** Max concurrent requests (default 2 — polite to op.gg). */
  concurrency?: number;
  /** Delay in ms between a worker's requests (default 400). */
  delayMs?: number;
}

export interface FetchOpponentsResult {
  data: OpponentData;
  warnings: string[];
}

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch and parse opponent scouting data from an op.gg multi-search link,
 * producing one opponent player per summoner. Online, opt-in, sequential-ish
 * (small concurrency + delay) to be polite; roles are left undefined for the
 * user to set. This is the app's only online feature.
 */
export async function fetchOpponentsFromMultilink(
  url: string,
  resolver: NameResolver,
  opts: FetchOpponentsOptions,
): Promise<FetchOpponentsResult> {
  const parsed = parseMultisearchUrl(url);
  if ('error' in parsed) {
    return { data: { players: [] }, warnings: [parsed.error] };
  }

  const { region, summoners } = parsed;
  const concurrency = opts.concurrency ?? 2;
  const delayMs = opts.delayMs ?? 400;
  const total = summoners.length;

  const players = new Array<OpponentData['players'][number] | null>(total).fill(null);
  const warnings: string[] = [];
  let done = 0;
  let next = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = next++;
      if (index >= total) return;
      const summoner = summoners[index]!;
      const label = `${summoner.name}#${summoner.tag}`;
      if (index >= concurrency) await delay(delayMs);
      players[index] = await fetchOne(region, summoner, resolver, opts.knownIds, warnings);
      done += 1;
      opts.onProgress?.(done, total, label);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, total) }, () => worker()),
  );

  return { data: { players: players.filter((p) => p !== null) }, warnings };
}

async function fetchOne(
  region: string,
  summoner: Summoner,
  resolver: NameResolver,
  knownIds: Set<number>,
  warnings: string[],
): Promise<OpponentData['players'][number]> {
  const name = `${summoner.name}#${summoner.tag}`;
  const url = summonerChampionsUrl(region, summoner.name, summoner.tag);
  const res = await fetchText(url);
  if (!res.ok) {
    warnings.push(`Failed to fetch ${name} (HTTP ${res.status})`);
    return { name, champions: [] };
  }
  const parsed = parseSummonerChampionsHtml(res.text, knownIds, resolver);
  for (const w of parsed.warnings) warnings.push(`${name}: ${w}`);
  return { name, champions: parsed.champions };
}
