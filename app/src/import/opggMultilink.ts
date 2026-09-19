import type { NameResolver } from './types';

/** A single summoner parsed from a multi-search link: Riot game name + tag. */
export interface Summoner {
  name: string;
  tag: string;
}

export interface MultisearchResult {
  region: string;
  summoners: Summoner[];
}

const REGION_FALLBACK = 'euw';

/**
 * Parse an op.gg multi-search link into a region and a list of summoners.
 *
 * Tolerant of: `op.gg` / `www.op.gg` / any `*.op.gg` host, an optional locale
 * prefix in the path (`/de/lol/multisearch/euw`), `+` or `%20` for spaces and
 * `%23` for `#` in the `summoners` query. Also accepts a bare comma-separated
 * list (`Name#TAG, Name#TAG`) with the region defaulting to `euw`.
 */
export function parseMultisearchUrl(input: string): MultisearchResult | { error: string } {
  const trimmed = input.trim();
  if (trimmed.length === 0) return { error: 'Empty input' };

  // URL form.
  if (/^https?:\/\//i.test(trimmed) || /(^|\.)op\.gg\//i.test(trimmed)) {
    let url: URL;
    try {
      url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    } catch {
      return { error: 'Not a valid URL' };
    }
    const host = url.hostname.toLowerCase();
    if (host !== 'op.gg' && !host.endsWith('.op.gg')) {
      return { error: 'Not an op.gg link' };
    }
    const pathMatch = url.pathname.match(/\/multisearch\/([a-z0-9]+)/i);
    if (!pathMatch) return { error: 'Not an op.gg multi-search link' };
    const region = pathMatch[1]!.toLowerCase();
    // URLSearchParams decodes `+`, `%20`, `%23` and `%2C` for us.
    const raw = url.searchParams.get('summoners');
    if (!raw) return { error: 'No summoners in link' };
    const summoners = parseSummonerList(raw);
    if (summoners.length === 0) return { error: 'No valid summoners in link' };
    return { region, summoners };
  }

  // Bare list form.
  const summoners = parseSummonerList(trimmed);
  if (summoners.length === 0) return { error: 'No valid summoners found' };
  return { region: REGION_FALLBACK, summoners };
}

/** Split a decoded, comma-separated `Name#TAG` list into summoners. */
function parseSummonerList(decoded: string): Summoner[] {
  const out: Summoner[] = [];
  for (const part of decoded.split(',')) {
    const entry = part.trim();
    if (entry.length === 0) continue;
    const hash = entry.indexOf('#');
    if (hash < 0) continue; // needs a #TAG
    const name = entry.slice(0, hash).trim();
    const tag = entry.slice(hash + 1).trim();
    if (name.length === 0 || tag.length === 0) continue;
    out.push({ name, tag });
  }
  return out;
}

/**
 * The server-rendered per-summoner champions page:
 * `https://op.gg/lol/summoners/{region}/{Name}-{TAG}/champions`.
 * Spaces in the name work as `%20` (verified against real profiles), which is
 * what `encodeURIComponent` produces.
 */
export function summonerChampionsUrl(region: string, name: string, tag: string): string {
  return `https://op.gg/lol/summoners/${region.toLowerCase()}/${encodeURIComponent(
    name,
  )}-${encodeURIComponent(tag)}/champions`;
}

export interface ParsedChampion {
  championId: number;
  games: number;
  wins: number;
}

export interface ChampionsParseResult {
  champions: ParsedChampion[];
  source: 'json' | 'table';
  warnings: string[];
}

const MAX_CHAMPIONS = 30;

/**
 * Parse the op.gg per-summoner "champions" page. JSON-first, table fallback.
 *
 * JSON: the page embeds a React Server Components payload (quotes escaped as
 * `\"`). It contains one `my_champion_stats` array per rendered dataset; we
 * select the current-season ranked one (`game_type:"RANKED"`, largest
 * `season_id`) — that is the default view and the most relevant for scouting.
 * Each entry carries `champion_id`, `play` (games), `win`, `lose`, `win_rate`;
 * `my_champion_stats[0]` is the "All champions" total row (no `champion_id`)
 * and is skipped. `championIdsKnown` filters out non-champion ids (event
 * variants, the id:0 total row).
 *
 * Table: the `<table>` rows carry the champion name in `<strong>`/`<img alt>`
 * and wins/losses as `<span>NNW</span>` / `<span>NNL</span>` cells; names are
 * resolved with the passed-in resolver.
 */
export function parseSummonerChampionsHtml(
  html: string,
  championIdsKnown: Set<number>,
  resolver: NameResolver,
): ChampionsParseResult {
  const warnings: string[] = [];

  const jsonChamps = parseFromJson(html, championIdsKnown, warnings);
  if (jsonChamps.length > 0) {
    return { champions: finalize(jsonChamps), source: 'json', warnings };
  }

  const tableChamps = parseFromTable(html, resolver, warnings);
  if (tableChamps.length === 0) {
    warnings.push('No champion data found on the page');
  }
  return { champions: finalize(tableChamps), source: 'table', warnings };
}

function finalize(champs: ParsedChampion[]): ParsedChampion[] {
  return champs
    .filter((c) => c.games >= 1)
    .sort((a, b) => b.games - a.games)
    .slice(0, MAX_CHAMPIONS);
}

interface RawStat {
  champion_id?: number;
  play?: number;
  win?: number;
  win_rate?: number;
}

function parseFromJson(
  html: string,
  known: Set<number>,
  warnings: string[],
): ParsedChampion[] {
  // Unescape the RSC quote escaping so the embedded JSON becomes parseable.
  const text = html.replace(/\\"/g, '"');
  const marker = '"my_champion_stats":[';

  let best: { stats: RawStat[]; season: number } | null = null;
  let anyFound = false;
  for (let from = text.indexOf(marker); from >= 0; from = text.indexOf(marker, from + 1)) {
    const arrStart = from + marker.length - 1; // at the '['
    const arr = extractBracketed(text, arrStart);
    if (!arr) continue;
    let stats: RawStat[];
    try {
      stats = JSON.parse(arr) as RawStat[];
    } catch {
      continue;
    }
    anyFound = true;
    // Look back a short window for the dataset's game_type / season_id.
    const head = text.slice(Math.max(0, from - 200), from);
    const isRanked = /"game_type":"RANKED"/.test(head);
    const season = Number(head.match(/"season_id":(\d+)/)?.[1] ?? '0');
    if (best === null || (isRanked && season > best.season)) {
      best = { stats, season };
    }
  }

  if (!best) {
    if (anyFound) warnings.push('Could not read champion JSON payload');
    return [];
  }

  const out: ParsedChampion[] = [];
  for (const s of best.stats) {
    if (typeof s.champion_id !== 'number' || !known.has(s.champion_id)) continue;
    const games = typeof s.play === 'number' ? s.play : 0;
    let wins = typeof s.win === 'number' ? s.win : NaN;
    if (!Number.isFinite(wins) && typeof s.win_rate === 'number') {
      wins = Math.round((games * s.win_rate) / 100);
    }
    out.push({ championId: s.champion_id, games, wins: Number.isFinite(wins) ? wins : 0 });
  }
  return out;
}

/** Return the substring from an opening `[`/`{` to its matching close, inclusive. */
function extractBracketed(text: string, start: number): string | null {
  const open = text[start];
  const close = open === '[' ? ']' : '}';
  let depth = 0;
  let inStr = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (ch === '\\') i++; // skip escaped char
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function parseFromTable(
  html: string,
  resolver: NameResolver,
  warnings: string[],
): ParsedChampion[] {
  const out: ParsedChampion[] = [];
  const seen = new Set<number>();
  const rows = html.match(/<tr\b[\s\S]*?<\/tr>/gi) ?? [];
  for (const row of rows) {
    const name =
      row.match(/<strong[^>]*>([^<]+)<\/strong>/i)?.[1] ??
      row.match(/alt="([^"]+)"/i)?.[1];
    if (!name) continue;
    const wins = Number(row.match(/>(\d+)<!--[^>]*-->W</)?.[1] ?? NaN);
    const losses = Number(row.match(/>(\d+)<!--[^>]*-->L</)?.[1] ?? NaN);
    if (!Number.isFinite(wins) || !Number.isFinite(losses)) continue;
    const res = resolver.resolve(name);
    if ('error' in res) {
      warnings.push(`Unknown champion "${name}", skipped`);
      continue;
    }
    if (seen.has(res.id)) continue;
    seen.add(res.id);
    out.push({ championId: res.id, games: wins + losses, wins });
  }
  return out;
}
