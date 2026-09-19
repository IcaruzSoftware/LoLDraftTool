import type { Position } from '../data/types';
import { parseCsv } from './csv';
import { normalizeRole } from './roles';
import type { NameResolver, OpponentData } from './types';

export interface OpponentsResult {
  data: OpponentData;
  warnings: string[];
}

export interface OpponentsOptions {
  /** Player name for op.gg paste input (defaults to "Opponent"). */
  playerName?: string;
  /** Role for op.gg paste input. */
  role?: string;
}

type ChampStat = { championId: number; games: number; wins: number };

/**
 * Compute wins from an explicit `wins` value, or from a win rate (0-1 fraction
 * or 0-100 percent) combined with `games`.
 */
function winsFrom(entry: Record<string, unknown>, games: number): number | undefined {
  if (typeof entry.wins === 'number') return entry.wins;
  const wr = entry.winrate ?? entry.winRate ?? entry.wr;
  if (typeof wr === 'number') {
    const frac = wr > 1 ? wr / 100 : wr;
    return Math.round(games * frac);
  }
  return undefined;
}

/**
 * Parse opponent scouting data. Detects JSON (`{`/`[`), a CSV table with a
 * recognizable header, otherwise falls back to op.gg paste parsing.
 */
export function parseOpponents(
  text: string,
  resolver: NameResolver,
  options: OpponentsOptions = {},
): OpponentsResult {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { data: { players: [] }, warnings: ['Empty input'] };
  }
  if (trimmed[0] === '{' || trimmed[0] === '[') {
    return parseJson(trimmed, resolver);
  }
  if (looksLikeCsv(text)) {
    return parseOpponentsCsv(text, resolver);
  }
  return parseOpggPaste(text, resolver, options.playerName, options.role);
}

function looksLikeCsv(text: string): boolean {
  const firstLine = text.split(/\r?\n/, 1)[0]?.toLowerCase() ?? '';
  if (!firstLine.includes(',') && !firstLine.includes(';')) return false;
  return (
    firstLine.includes('champion') &&
    (firstLine.includes('games') || firstLine.includes('wins') || firstLine.includes('winrate'))
  );
}

function resolveChamp(
  entry: Record<string, unknown>,
  resolver: NameResolver,
  warnings: string[],
): number | undefined {
  if (typeof entry.championId === 'number') return entry.championId;
  const name = entry.champion ?? entry.name;
  if (typeof name !== 'string') return undefined;
  const result = resolver.resolve(name);
  if ('error' in result) {
    const hint = result.suggestions.length > 0 ? ` (did you mean: ${result.suggestions.join(', ')}?)` : '';
    warnings.push(`Unknown champion "${name}", skipped${hint}`);
    return undefined;
  }
  return result.id;
}

function parseJson(trimmed: string, resolver: NameResolver): OpponentsResult {
  const warnings: string[] = [];
  let data: unknown;
  try {
    data = JSON.parse(trimmed);
  } catch {
    return { data: { players: [] }, warnings: ['Invalid JSON'] };
  }

  const rawPlayers = Array.isArray(data)
    ? data
    : typeof data === 'object' && data !== null && Array.isArray((data as { players?: unknown }).players)
      ? (data as { players: unknown[] }).players
      : undefined;

  if (!rawPlayers) {
    return { data: { players: [] }, warnings: ['Unrecognized JSON shape'] };
  }

  const players: OpponentData['players'] = [];
  for (const rawPlayer of rawPlayers) {
    if (typeof rawPlayer !== 'object' || rawPlayer === null) continue;
    const p = rawPlayer as Record<string, unknown>;
    const name = typeof p.name === 'string' ? p.name : 'Opponent';
    const role = typeof p.role === 'string' ? normalizeRole(p.role) : undefined;
    const champions: ChampStat[] = [];
    const rawChamps = Array.isArray(p.champions) ? p.champions : [];
    for (const rawChamp of rawChamps) {
      if (typeof rawChamp !== 'object' || rawChamp === null) continue;
      const c = rawChamp as Record<string, unknown>;
      const championId = resolveChamp(c, resolver, warnings);
      if (championId === undefined) continue;
      const games = typeof c.games === 'number' ? c.games : 0;
      const wins = winsFrom(c, games) ?? 0;
      champions.push({ championId, games, wins });
    }
    players.push(role ? { name, role, champions } : { name, champions });
  }
  return { data: { players }, warnings };
}

function parseOpponentsCsv(text: string, resolver: NameResolver): OpponentsResult {
  const warnings: string[] = [];
  const rows = parseCsv(text);
  if (rows.length === 0) return { data: { players: [] }, warnings };

  const header = rows[0]!.map((h) => h.toLowerCase());
  const col = (...names: string[]): number => {
    for (const n of names) {
      const i = header.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };
  const idx = {
    player: col('player', 'name'),
    role: col('role', 'position'),
    champion: col('champion', 'champ'),
    games: col('games', 'played'),
    wins: col('wins', 'w'),
    winrate: col('winrate', 'wr', 'win%'),
  };

  // Group rows by player, preserving first-seen order.
  const order: string[] = [];
  const grouped = new Map<string, { role?: Position; champions: ChampStat[] }>();

  for (const row of rows.slice(1)) {
    const championRaw = idx.champion >= 0 ? (row[idx.champion] ?? '') : '';
    if (championRaw.length === 0) continue;
    const result = resolver.resolve(championRaw);
    if ('error' in result) {
      const hint = result.suggestions.length > 0 ? ` (did you mean: ${result.suggestions.join(', ')}?)` : '';
      warnings.push(`Unknown champion "${championRaw}", skipped${hint}`);
      continue;
    }
    const playerName = (idx.player >= 0 ? row[idx.player] : '') || 'Opponent';
    const games = Number(idx.games >= 0 ? row[idx.games] : '') || 0;
    let wins = Number(idx.wins >= 0 ? row[idx.wins] : '');
    if (!Number.isFinite(wins) || (idx.wins < 0 && idx.winrate >= 0)) {
      const wr = Number(row[idx.winrate]);
      wins = Number.isFinite(wr) ? Math.round(games * (wr > 1 ? wr / 100 : wr)) : 0;
    }

    if (!grouped.has(playerName)) {
      order.push(playerName);
      const role = idx.role >= 0 ? normalizeRole(row[idx.role] ?? '') : undefined;
      grouped.set(playerName, { role, champions: [] });
    }
    grouped.get(playerName)!.champions.push({ championId: result.id, games, wins });
  }

  const players: OpponentData['players'] = order.map((name) => {
    const g = grouped.get(name)!;
    return g.role ? { name, role: g.role, champions: g.champions } : { name, champions: g.champions };
  });
  return { data: { players }, warnings };
}

const WL_RE = /(\d+)\s*W\s*(\d+)\s*L/i;

/**
 * Tolerant parser for text copied from the op.gg "Champions" tab. Handles both
 * the single-line layout (`1 Aurora 32W 23L 58% 3.13:1`) and the split layout
 * where the champion name is on its own line followed by a stats line. Games =
 * W + L, wins = W. Requires the player name/role to be supplied separately
 * (op.gg does not include them in the champion table).
 */
export function parseOpggPaste(
  text: string,
  resolver: NameResolver,
  playerName?: string,
  role?: string,
): OpponentsResult {
  const warnings: string[] = [];
  const champions: ChampStat[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);

  let pendingName = '';
  for (const line of lines) {
    const wl = line.match(WL_RE);
    if (!wl) {
      // Candidate champion-name line; drop any leading rank number.
      pendingName = line.replace(/^\d+[.)]?\s+/, '').trim();
      continue;
    }
    const wins = Number(wl[1]);
    const losses = Number(wl[2]);
    const before = line.slice(0, wl.index).replace(/^\d+[.)]?\s+/, '').trim();
    const candidate = before.length > 0 ? before : pendingName;
    pendingName = '';

    const norm = candidate.toLowerCase().replace(/[^a-z]/g, '');
    if (norm.length === 0 || norm === 'total') continue; // op.gg totals row

    const result = resolver.resolve(candidate);
    if ('error' in result) {
      const hint = result.suggestions.length > 0 ? ` (did you mean: ${result.suggestions.join(', ')}?)` : '';
      warnings.push(`Unknown champion "${candidate}", skipped${hint}`);
      continue;
    }
    champions.push({ championId: result.id, games: wins + losses, wins });
  }

  const name = playerName && playerName.length > 0 ? playerName : 'Opponent';
  const normalizedRole = role ? normalizeRole(role) : undefined;
  const player = normalizedRole
    ? { name, role: normalizedRole, champions }
    : { name, champions };
  return { data: { players: [player] }, warnings };
}
