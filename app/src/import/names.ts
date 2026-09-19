import type { ChampionBase } from '../data/types';
import type { NameResolver, ResolveResult } from './types';

/** Lowercase and strip everything that is not a latin letter or digit. */
export function normalizeName(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Short community nicknames that do not fall out of name/alias normalization.
 * Values are resolved against the real champion list at build time, so a typo
 * here surfaces as a missing entry rather than a silent mismatch.
 */
const NICKNAMES: Record<string, string> = {
  mf: 'Miss Fortune',
  tf: 'Twisted Fate',
  j4: 'Jarvan IV',
  asol: 'Aurelion Sol',
  kog: "Kog'Maw",
  nunu: 'Nunu & Willump',
  mundo: 'Dr. Mundo',
  tk: 'Tahm Kench',
  ww: 'Warwick',
  kass: 'Kassadin',
  cass: 'Cassiopeia',
  morg: 'Morgana',
  ori: 'Orianna',
  vlad: 'Vladimir',
  trynd: 'Tryndamere',
  yi: 'Master Yi',
  gp: 'Gangplank',
  lb: 'LeBlanc',
  ez: 'Ezreal',
  cait: 'Caitlyn',
  blitz: 'Blitzcrank',
  naut: 'Nautilus',
  malz: 'Malzahar',
  voli: 'Volibear',
  sej: 'Sejuani',
  lee: 'Lee Sin',
  renata: 'Renata Glasc',
  wukong: 'Wukong',
  monkeyking: 'Wukong',
};

type Champ = Pick<ChampionBase, 'id' | 'alias' | 'name'>;

export function createNameResolver(champions: Champ[]): NameResolver {
  const byId = new Map<number, string>();
  const exact = new Map<string, number>();
  // Normalized name/alias -> ids that carry that prefix, for prefix matching.
  const entries: Array<{ norm: string; id: number }> = [];

  const addExact = (key: string, id: number): void => {
    const norm = normalizeName(key);
    if (norm.length === 0) return;
    if (!exact.has(norm)) exact.set(norm, id);
  };

  for (const c of champions) {
    byId.set(c.id, c.name);
    addExact(c.name, c.id);
    addExact(c.alias, c.id);
    entries.push({ norm: normalizeName(c.name), id: c.id });
    const alias = normalizeName(c.alias);
    if (alias !== normalizeName(c.name)) entries.push({ norm: alias, id: c.id });
  }

  // Nicknames map onto ids already registered above; champion names win ties.
  for (const [key, target] of Object.entries(NICKNAMES)) {
    const targetId = exact.get(normalizeName(target));
    if (targetId !== undefined) addExact(key, targetId);
  }

  const resolve = (input: string): ResolveResult => {
    const norm = normalizeName(input);
    if (norm.length === 0) {
      return { error: `Empty champion name`, suggestions: [] };
    }

    const hit = exact.get(norm);
    if (hit !== undefined) return { id: hit };

    // Unique prefix match.
    const prefixIds = new Set<number>();
    for (const e of entries) {
      if (e.norm.startsWith(norm)) prefixIds.add(e.id);
    }
    if (prefixIds.size === 1) {
      const [only] = prefixIds;
      return { id: only! };
    }

    return {
      error: `Unknown champion "${input}"`,
      suggestions: suggest(norm, entries, byId),
    };
  };

  const nameOf = (id: number): string | undefined => byId.get(id);

  return { resolve, nameOf };
}

function suggest(
  norm: string,
  entries: Array<{ norm: string; id: number }>,
  byId: Map<number, string>,
): string[] {
  // Best (smallest) distance per champion id.
  const best = new Map<number, number>();
  for (const e of entries) {
    const d = e.norm.startsWith(norm) || norm.startsWith(e.norm) ? 1 : levenshtein(norm, e.norm);
    const prev = best.get(e.id);
    if (prev === undefined || d < prev) best.set(e.id, d);
  }

  const ranked = [...best.entries()].sort((a, b) => a[1] - b[1]);
  const near = ranked.filter(([, d]) => d <= 2);
  const chosen = (near.length > 0 ? near : ranked).slice(0, 3);
  return chosen
    .map(([id]) => byId.get(id))
    .filter((n): n is string => n !== undefined);
}

/** Standard Levenshtein edit distance. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j]! + 1, curr[j - 1]! + 1, prev[j - 1]! + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n]!;
}
