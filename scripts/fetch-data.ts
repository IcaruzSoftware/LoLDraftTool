/**
 * Build-time data pipeline for LoLDraftTool.
 *
 * Fetches public League of Legends champion data (Data Dragon, Community Dragon,
 * Meraki Analytics), joins it on numeric champion id, downloads square icons, and
 * emits an offline dataset the app loads at runtime:
 *   - app/public/data/champions.json  (array of ChampionBase, sorted by name)
 *   - app/public/data/meta.json       (patch, fetchedAt, sources, counts)
 *   - app/public/champions/<alias>.png (square icons)
 *
 * Idempotent: re-running produces the same output and skips icons already present.
 * The 13 MB Meraki blob is cached per patch under scripts/.cache/ (gitignored).
 *
 * Run with: pnpm fetch-data   (Node 24, global fetch)
 */

import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CACHE_DIR = join(__dirname, '.cache');
const PUBLIC_DIR = join(ROOT, 'app', 'public');
const DATA_OUT_DIR = join(PUBLIC_DIR, 'data');
const ICON_DIR = join(PUBLIC_DIR, 'champions');
const FALLBACK_FILE = join(ROOT, 'data', 'positions-fallback.json');

const DDRAGON = 'https://ddragon.leagueoflegends.com';
const CDRAGON = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1';
const MERAKI = 'https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US/champions.json';

const CONCURRENCY = 8;

type Position = 'top' | 'jungle' | 'mid' | 'bot' | 'support';
type DamageType = 'AD' | 'AP' | 'mixed';
type AttackType = 'melee' | 'ranged';

interface ChampionBase {
  id: number;
  alias: string;
  name: string;
  riotTags: string[];
  damageType: DamageType;
  attackType: AttackType;
  range: number;
  positions: Partial<Record<Position, number>>;
  playstyle: { damage: number; durability: number; crowdControl: number; mobility: number; utility: number };
  riotPlaystylePrimary: string;
  riotPlaystyleSecondary: string;
  difficulty: number;
  merakiRoles: string[];
  adaptiveType?: string;
  resource?: string;
  releaseDate?: string;
}

const OUTPUT_POSITIONS: Position[] = ['top', 'jungle', 'mid', 'bot', 'support'];

const MERAKI_POSITION_MAP: Record<string, Position> = {
  TOP: 'top',
  JUNGLE: 'jungle',
  MIDDLE: 'mid',
  BOTTOM: 'bot',
  SUPPORT: 'support',
};

/** Accepts Meraki names (TOP/MIDDLE/...) or output keys (top/mid/...). */
function normalizePosition(raw: string): Position | null {
  const meraki = MERAKI_POSITION_MAP[raw.toUpperCase()];
  if (meraki) return meraki;
  const lower = raw.toLowerCase() as Position;
  return OUTPUT_POSITIONS.includes(lower) ? lower : null;
}

function toDamageType(raw: string | undefined): DamageType {
  switch (raw) {
    case 'kPhysical':
      return 'AD';
    case 'kMagic':
      return 'AP';
    default:
      return 'mixed'; // kMixed, kTrue, unknown
  }
}

function toAttackType(raw: string | undefined): AttackType {
  return raw && raw.toLowerCase() === 'ranged' ? 'ranged' : 'melee';
}

/** Positions -> weights: first listed 1.0, others 0.8. */
function positionsToWeights(list: string[]): Partial<Record<Position, number>> {
  const out: Partial<Record<Position, number>> = {};
  let rank = 0;
  for (const raw of list) {
    const pos = normalizePosition(raw);
    if (!pos || pos in out) continue;
    out[pos] = rank === 0 ? 1.0 : 0.8;
    rank++;
  }
  return out;
}

async function fetchWithRetry(url: string, tries = 4): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt < tries) await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }
  throw lastErr;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetchWithRetry(url);
  return (await res.json()) as T;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// ---- Source shapes (only the fields we read) ----

interface DdragonChampion {
  key: string; // numeric id as string
  id: string; // alias
  name: string;
  tags: string[];
  stats: { attackrange: number };
}
interface DdragonChampionFile {
  version: string;
  data: Record<string, DdragonChampion>;
}

interface CdragonSummaryEntry {
  id: number;
  alias: string;
}
interface CdragonChampion {
  id: number;
  tacticalInfo?: { damageType?: string; attackType?: string; difficulty?: number };
  playstyleInfo?: { damage?: number; durability?: number; crowdControl?: number; mobility?: number; utility?: number };
  championTagInfo?: { championTagPrimary?: string; championTagSecondary?: string };
  roles?: string[];
}

interface MerakiChampion {
  id: number;
  positions?: string[];
  roles?: string[];
  attackType?: string;
  adaptiveType?: string;
  resource?: string;
  releaseDate?: string;
}

async function main() {
  const startedAt = new Date();
  await mkdir(CACHE_DIR, { recursive: true });
  await mkdir(DATA_OUT_DIR, { recursive: true });
  await mkdir(ICON_DIR, { recursive: true });

  // 1. Latest patch version.
  const versions = await fetchJson<string[]>(`${DDRAGON}/api/versions.json`);
  const V = versions[0];
  console.log(`Latest Data Dragon version: ${V}`);

  // 2. Data Dragon champion master data.
  const champFileUrl = `${DDRAGON}/cdn/${V}/data/en_US/champion.json`;
  const champFile = await fetchJson<DdragonChampionFile>(champFileUrl);
  const ddragonChamps = Object.values(champFile.data);
  console.log(`Data Dragon champions: ${ddragonChamps.length}`);
  const ddragonIds = new Set(ddragonChamps.map((c) => Number(c.key)));

  // 3. Community Dragon per-champion metadata.
  const summaryUrl = `${CDRAGON}/champion-summary.json`;
  const summary = await fetchJson<CdragonSummaryEntry[]>(summaryUrl);
  const cdragonTargets = summary.filter(
    (e) => e.id > 0 && !e.alias.startsWith('Jade_') && ddragonIds.has(e.id),
  );
  console.log(`Community Dragon champions to fetch: ${cdragonTargets.length}`);
  const cdragonById = new Map<number, CdragonChampion>();
  await mapLimit(cdragonTargets, CONCURRENCY, async (e) => {
    const c = await fetchJson<CdragonChampion>(`${CDRAGON}/champions/${e.id}.json`);
    cdragonById.set(e.id, c);
  });

  // 4. Meraki positions / roles (cached per patch).
  const merakiCache = join(CACHE_DIR, `meraki-${V}.json`);
  let merakiText: string;
  if (existsSync(merakiCache)) {
    console.log('Using cached Meraki data');
    merakiText = await readFile(merakiCache, 'utf8');
  } else {
    console.log('Downloading Meraki data (~13 MB)...');
    const res = await fetchWithRetry(MERAKI);
    merakiText = await res.text();
    await writeFile(merakiCache, merakiText);
  }
  const merakiRaw = JSON.parse(merakiText) as Record<string, MerakiChampion>;
  const merakiById = new Map<number, MerakiChampion>();
  for (const m of Object.values(merakiRaw)) merakiById.set(m.id, m);

  // Fallback positions for champions Meraki has not published yet.
  const fallbackRaw = JSON.parse(await readFile(FALLBACK_FILE, 'utf8')) as Record<string, string[]>;

  // 5. Build merged records.
  const records: ChampionBase[] = [];
  const missingFromMeraki: string[] = [];
  const missingPositions: string[] = [];

  for (const dd of ddragonChamps) {
    const id = Number(dd.key);
    const cd = cdragonById.get(id);
    const mk = merakiById.get(id);

    let positionsList = mk?.positions;
    if (!positionsList || positionsList.length === 0) {
      missingFromMeraki.push(`${dd.id} (${id})`);
      positionsList = fallbackRaw[dd.id] ?? [];
    }
    const positions = positionsToWeights(positionsList);
    if (Object.keys(positions).length === 0) missingPositions.push(`${dd.id} (${id})`);

    records.push({
      id,
      alias: dd.id,
      name: dd.name,
      riotTags: dd.tags ?? [],
      damageType: toDamageType(cd?.tacticalInfo?.damageType),
      attackType: toAttackType(cd?.tacticalInfo?.attackType ?? mk?.attackType),
      range: dd.stats.attackrange,
      positions,
      playstyle: {
        damage: cd?.playstyleInfo?.damage ?? 0,
        durability: cd?.playstyleInfo?.durability ?? 0,
        crowdControl: cd?.playstyleInfo?.crowdControl ?? 0,
        mobility: cd?.playstyleInfo?.mobility ?? 0,
        utility: cd?.playstyleInfo?.utility ?? 0,
      },
      riotPlaystylePrimary: cd?.championTagInfo?.championTagPrimary ?? '',
      riotPlaystyleSecondary: cd?.championTagInfo?.championTagSecondary ?? '',
      difficulty: cd?.tacticalInfo?.difficulty ?? 0,
      merakiRoles: mk?.roles ?? [],
      adaptiveType: mk?.adaptiveType,
      resource: mk?.resource,
      releaseDate: mk?.releaseDate,
    });
  }

  records.sort((a, b) => a.name.localeCompare(b.name));

  if (missingFromMeraki.length) {
    console.warn(`WARN: ${missingFromMeraki.length} champion(s) missing from Meraki: ${missingFromMeraki.join(', ')}`);
  }
  if (missingPositions.length) {
    console.warn(
      `WARN: ${missingPositions.length} champion(s) have NO positions (add them to data/positions-fallback.json, e.g. {"Alias":["top"]}): ${missingPositions.join(', ')}`,
    );
  }

  // 6. Download icons (skip existing).
  let iconsDownloaded = 0;
  await mapLimit(ddragonChamps, CONCURRENCY, async (dd) => {
    const dest = join(ICON_DIR, `${dd.id}.png`);
    if (existsSync(dest)) return;
    const res = await fetchWithRetry(`${DDRAGON}/cdn/${V}/img/champion/${dd.id}.png`);
    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(dest, buf);
    iconsDownloaded++;
  });

  // 7. Emit outputs.
  await writeFile(join(DATA_OUT_DIR, 'champions.json'), JSON.stringify(records, null, 2) + '\n');

  const iconFiles = (await readdir(ICON_DIR)).filter((f) => f.endsWith('.png'));
  const meta = {
    patch: V,
    fetchedAt: startedAt.toISOString(),
    sources: [
      `${DDRAGON}/api/versions.json`,
      champFileUrl,
      summaryUrl,
      `${CDRAGON}/champions/{id}.json`,
      MERAKI,
      `${DDRAGON}/cdn/${V}/img/champion/{alias}.png`,
    ],
    counts: { champions: records.length, icons: iconFiles.length },
  };
  await writeFile(join(DATA_OUT_DIR, 'meta.json'), JSON.stringify(meta, null, 2) + '\n');

  // 8. Summary.
  console.log('--- Summary ---');
  console.log(`patch:        ${V}`);
  console.log(`champions:    ${records.length}`);
  console.log(`icons total:  ${iconFiles.length} (downloaded ${iconsDownloaded} this run)`);
  console.log(`missing Meraki: ${missingFromMeraki.length ? missingFromMeraki.join(', ') : 'none'}`);
  console.log(`no positions:   ${missingPositions.length ? missingPositions.join(', ') : 'none'}`);
  console.log(`wrote ${join('app', 'public', 'data', 'champions.json')} and meta.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
