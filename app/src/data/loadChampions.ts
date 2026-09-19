import type { ChampionBase } from './types';
import type { Champion, Counter, MetaFile, Synergy, TagsFile } from './curatedTypes';
import { mergeChampions } from './merge';

/**
 * Loads the bundled offline champion dataset emitted by `pnpm fetch-data`.
 * Uses a relative URL so it works under Vite's `base: './'`.
 */
export async function loadChampions(): Promise<ChampionBase[]> {
  const res = await fetch('./data/champions.json');
  if (!res.ok) throw new Error(`Failed to load champions.json: HTTP ${res.status}`);
  return (await res.json()) as ChampionBase[];
}

/** URL of a champion's square icon (relative, works under Vite base './'). */
export function championIconUrl(alias: string): string {
  return `./champions/${alias}.png`;
}

/** Fetches JSON at a relative URL, returning `fallback` on any 404/parse error. */
async function fetchOptional<T>(url: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(url);
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

/** Result of {@link loadAll}: everything the engine needs at runtime. */
export interface LoadedData {
  champions: Champion[];
  synergies: Synergy[];
  counters: Counter[];
  patch: string;
}

const EMPTY_TAGS: TagsFile = { patch: '', champions: {} };
const EMPTY_META: MetaFile = { patch: '', champions: {} };

/**
 * Loads the base dataset plus curated tags/meta/synergies/counters and merges
 * them. Curated files are optional: a missing file (404) yields neutral
 * defaults so the app runs before the curated data has been synced.
 */
export async function loadAll(): Promise<LoadedData> {
  const [base, tags, meta, synergies, counters] = await Promise.all([
    loadChampions(),
    fetchOptional<TagsFile>('./data/curated/tags.json', EMPTY_TAGS),
    fetchOptional<MetaFile>('./data/curated/meta.json', EMPTY_META),
    fetchOptional<Synergy[]>('./data/curated/synergies.json', []),
    fetchOptional<Counter[]>('./data/curated/counters.json', []),
  ]);

  return {
    champions: mergeChampions(base, tags, meta),
    synergies,
    counters,
    patch: tags.patch || meta.patch || '',
  };
}
