import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ChampionBase } from '../data/types';

// Directory of this file (…/app/src/import). Built with plain string ops so
// Vite's `new URL(literal, import.meta.url)` asset transform does not intercept
// the paths below.
const dir = fileURLToPath(import.meta.url).replace(/[\\/][^\\/]*$/, '');

/** Load the real bundled champion list for tests. */
export function loadChampions(): ChampionBase[] {
  return JSON.parse(
    readFileSync(`${dir}/../../public/data/champions.json`, 'utf8'),
  ) as ChampionBase[];
}

/** Read a file from `data/samples/` at the repo root. */
export function loadSample(name: string): string {
  return readFileSync(`${dir}/../../../data/samples/${name}`, 'utf8');
}
