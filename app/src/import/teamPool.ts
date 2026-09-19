import { POSITIONS } from '../data/types';
import type { Position } from '../data/types';
import { parseCsv } from './csv';
import { normalizeRole } from './roles';
import type { NameResolver, TeamPool } from './types';

type Tier = 'comfort' | 'good' | 'okay';
const TIERS: Tier[] = ['comfort', 'good', 'okay'];

export interface TeamPoolResult {
  pool: TeamPool;
  warnings: string[];
}

/** Normalized tier key -> canonical tier. */
const TIER_ALIASES: Record<string, Tier> = {
  comfort: 'comfort',
  comfy: 'comfort',
  main: 'comfort',
  '1': 'comfort',
  good: 'good',
  secondary: 'good',
  '2': 'good',
  okay: 'okay',
  ok: 'okay',
  fill: 'okay',
  tertiary: 'okay',
  '3': 'okay',
};

function normalizeTier(input: string): Tier | undefined {
  return TIER_ALIASES[input.toLowerCase().replace(/[^a-z0-9]/g, '')];
}

function emptyPool(): TeamPool {
  const pool = {} as TeamPool;
  for (const role of POSITIONS) {
    pool[role] = { comfort: [], good: [], okay: [] };
  }
  return pool;
}

/**
 * Parse a team champion pool from JSON or CSV text. Detects the format by the
 * first non-whitespace character (`{`/`[` -> JSON, otherwise CSV). Always
 * returns all five roles; unknown champions/roles are skipped with a warning.
 */
export function parseTeamPool(text: string, resolver: NameResolver): TeamPoolResult {
  const pool = emptyPool();
  const warnings: string[] = [];
  const trimmed = text.trim();

  if (trimmed.length === 0) {
    warnings.push('Empty input');
    return finalize(pool, warnings, resolver);
  }

  if (trimmed[0] === '{' || trimmed[0] === '[') {
    parseJson(trimmed, pool, warnings, resolver);
  } else {
    parseTeamPoolCsv(text, pool, warnings, resolver);
  }

  return finalize(pool, warnings, resolver);
}

function addChampion(
  pool: TeamPool,
  role: Position,
  tier: Tier,
  champion: string,
  resolver: NameResolver,
  warnings: string[],
): void {
  const result = resolver.resolve(champion);
  if ('error' in result) {
    const hint = result.suggestions.length > 0 ? ` (did you mean: ${result.suggestions.join(', ')}?)` : '';
    warnings.push(`Unknown champion "${champion}" in ${role}/${tier}, skipped${hint}`);
    return;
  }
  pool[role][tier].push(result.id);
}

function parseJson(
  trimmed: string,
  pool: TeamPool,
  warnings: string[],
  resolver: NameResolver,
): void {
  let data: unknown;
  try {
    data = JSON.parse(trimmed);
  } catch {
    warnings.push('Invalid JSON');
    return;
  }

  if (Array.isArray(data)) {
    // Flat format: { role, tier, champion }[]
    for (const raw of data) {
      if (typeof raw !== 'object' || raw === null) continue;
      const entry = raw as Record<string, unknown>;
      const role = typeof entry.role === 'string' ? normalizeRole(entry.role) : undefined;
      const tier = typeof entry.tier === 'string' ? normalizeTier(entry.tier) : undefined;
      const champion = typeof entry.champion === 'string' ? entry.champion : undefined;
      if (!role) {
        warnings.push(`Unknown role "${String(entry.role)}", skipped`);
        continue;
      }
      if (!tier) {
        warnings.push(`Unknown tier "${String(entry.tier)}" for ${role}, skipped`);
        continue;
      }
      if (!champion) continue;
      addChampion(pool, role, tier, champion, resolver, warnings);
      if (typeof entry.player === 'string') pool[role].player = entry.player;
    }
    return;
  }

  if (typeof data !== 'object' || data === null) {
    warnings.push('Unrecognized JSON shape');
    return;
  }

  // Nested per-role format.
  for (const [roleKey, value] of Object.entries(data as Record<string, unknown>)) {
    const role = normalizeRole(roleKey);
    if (!role) {
      warnings.push(`Unknown role "${roleKey}", skipped`);
      continue;
    }
    if (Array.isArray(value)) {
      // Array-of-arrays: [ [comfort], [good], [okay] ]
      value.forEach((sub, i) => {
        const tier = TIERS[i];
        if (!tier || !Array.isArray(sub)) return;
        for (const champion of sub) {
          if (typeof champion === 'string') addChampion(pool, role, tier, champion, resolver, warnings);
        }
      });
      continue;
    }
    if (typeof value !== 'object' || value === null) continue;

    for (const [tierKey, champions] of Object.entries(value as Record<string, unknown>)) {
      const normKey = tierKey.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (normKey === 'player' || normKey === 'name') {
        if (typeof champions === 'string') pool[role].player = champions;
        continue;
      }
      const tier = normalizeTier(tierKey);
      if (!tier) {
        warnings.push(`Unknown tier "${tierKey}" for ${role}, skipped`);
        continue;
      }
      if (!Array.isArray(champions)) continue;
      for (const champion of champions) {
        if (typeof champion === 'string') addChampion(pool, role, tier, champion, resolver, warnings);
      }
    }
  }
}

function parseTeamPoolCsv(
  text: string,
  pool: TeamPool,
  warnings: string[],
  resolver: NameResolver,
): void {
  const rows = parseCsv(text);
  if (rows.length === 0) return;

  const header = rows[0]!.map((h) => h.toLowerCase());
  const findCol = (...names: string[]): number => {
    for (const n of names) {
      const i = header.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };

  let idx = {
    role: findCol('role', 'position'),
    tier: findCol('tier'),
    champion: findCol('champion', 'champ'),
    player: findCol('player'),
  };
  let dataRows: string[][];
  if (idx.role >= 0 && idx.tier >= 0 && idx.champion >= 0) {
    dataRows = rows.slice(1);
  } else {
    // No recognizable header: assume positional role,tier,champion,player.
    idx = { role: 0, tier: 1, champion: 2, player: 3 };
    dataRows = rows;
  }

  for (const row of dataRows) {
    const roleRaw = row[idx.role] ?? '';
    const tierRaw = row[idx.tier] ?? '';
    const champion = row[idx.champion] ?? '';
    const role = normalizeRole(roleRaw);
    const tier = normalizeTier(tierRaw);
    if (!role) {
      warnings.push(`Unknown role "${roleRaw}", skipped`);
      continue;
    }
    if (!tier) {
      warnings.push(`Unknown tier "${tierRaw}" for ${role}, skipped`);
      continue;
    }
    if (champion.length === 0) continue;
    addChampion(pool, role, tier, champion, resolver, warnings);
    const player = idx.player >= 0 ? row[idx.player] : undefined;
    if (player && player.length > 0) pool[role].player = player;
  }
}

/** Deduplicate within/across tiers (keep highest) and warn about empty roles. */
function finalize(pool: TeamPool, warnings: string[], resolver: NameResolver): TeamPoolResult {
  for (const role of POSITIONS) {
    const slot = pool[role];
    const seen = new Set<number>();
    for (const tier of TIERS) {
      const kept: number[] = [];
      for (const id of slot[tier]) {
        if (seen.has(id)) {
          const name = resolver.nameOf(id) ?? `#${id}`;
          warnings.push(`Duplicate champion "${name}" in ${role}, kept highest tier`);
          continue;
        }
        seen.add(id);
        kept.push(id);
      }
      slot[tier] = kept;
    }
    if (slot.comfort.length === 0 && slot.good.length === 0 && slot.okay.length === 0) {
      warnings.push(`No champions for ${role}`);
    }
  }
  return { pool, warnings };
}
