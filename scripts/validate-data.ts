/**
 * Validates the emitted offline dataset (app/public/data/champions.json).
 * Exits non-zero with a clear list of problems on failure.
 *
 * Run with: pnpm validate-data
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CHAMPIONS_FILE = join(ROOT, 'app', 'public', 'data', 'champions.json');
const ICON_DIR = join(ROOT, 'app', 'public', 'champions');
const CURATED_DIR = join(ROOT, 'data', 'curated');
const CURATED_TAGS_FILE = join(CURATED_DIR, 'tags.json');
const CURATED_META_FILE = join(CURATED_DIR, 'meta.json');
const CURATED_SYNERGIES_FILE = join(CURATED_DIR, 'synergies.json');
const CURATED_COUNTERS_FILE = join(CURATED_DIR, 'counters.json');

const MIN_CHAMPIONS = 165;
const VALID_DAMAGE = new Set(['AD', 'AP', 'mixed']);
const VALID_ATTACK = new Set(['melee', 'ranged']);
const PLAYSTYLE_KEYS = ['damage', 'durability', 'crowdControl', 'mobility', 'utility'] as const;

// Curated tag schema (see docs/data-schema.md).
const TAG_INT_KEYS = [
  'engage', 'dive', 'gapClose', 'disengage', 'counterEngage', 'peel',
  'burst', 'sustainedDps', 'poke', 'aoeDamage', 'antiTank',
  'hardCc', 'aoeCc', 'pickCc',
  'roam', 'splitpush', 'duelist', 'waveclear', 'siege', 'visionControl',
  'sustain', 'shieldHeal', 'early', 'mid', 'late',
] as const;
const TAG_BOOL_KEYS = [
  'hypercarry', 'antiHeal', 'antiShield', 'knockup',
  'global', 'semiGlobal', 'frontline', 'tank', 'spellShield', 'ccImmunity', 'stealthUntargetable',
] as const;
const VALID_SUBCLASS = new Set([
  'Vanguard', 'Warden', 'Juggernaut', 'Diver', 'Assassin', 'Skirmisher',
  'Burst', 'Battlemage', 'Artillery', 'Enchanter', 'Catcher', 'Marksman', 'Specialist',
]);
const VALID_POSITIONS = new Set(['top', 'jungle', 'mid', 'bot', 'support']);
const VALID_TIERS = new Set(['S', 'A', 'B', 'C', 'D']);

function isInt03(v: unknown): boolean {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 3;
}
function isStrength(v: unknown): boolean {
  return v === 1 || v === 2 || v === 3;
}

interface ChampionBase {
  id: number;
  alias: string;
  name: string;
  damageType: string;
  attackType: string;
  positions: Record<string, number>;
  playstyle: Record<string, number>;
}

async function main() {
  const errors: string[] = [];

  if (!existsSync(CHAMPIONS_FILE)) {
    console.error(`FAIL: ${CHAMPIONS_FILE} not found. Run pnpm fetch-data first.`);
    process.exit(1);
  }

  const champions = JSON.parse(await readFile(CHAMPIONS_FILE, 'utf8')) as ChampionBase[];

  if (!Array.isArray(champions)) {
    console.error('FAIL: champions.json is not an array');
    process.exit(1);
  }

  if (champions.length < MIN_CHAMPIONS) {
    errors.push(`champion count ${champions.length} < ${MIN_CHAMPIONS}`);
  }

  const seenIds = new Set<number>();
  const seenAliases = new Set<string>();

  for (const c of champions) {
    const label = c.alias ?? c.name ?? `id:${c.id}`;

    if (typeof c.id !== 'number') errors.push(`${label}: missing/invalid numeric id`);
    else if (seenIds.has(c.id)) errors.push(`${label}: duplicate id ${c.id}`);
    else seenIds.add(c.id);

    if (!c.alias) errors.push(`${label}: missing alias`);
    else if (seenAliases.has(c.alias)) errors.push(`${label}: duplicate alias ${c.alias}`);
    else seenAliases.add(c.alias);

    if (!c.name) errors.push(`${label}: missing name`);

    if (!VALID_DAMAGE.has(c.damageType)) errors.push(`${label}: invalid damageType "${c.damageType}"`);
    if (!VALID_ATTACK.has(c.attackType)) errors.push(`${label}: invalid attackType "${c.attackType}"`);

    const posWeights = Object.values(c.positions ?? {});
    if (!posWeights.some((w) => typeof w === 'number' && w > 0)) {
      errors.push(`${label}: no position with weight > 0`);
    }

    // Riot's client playstyle ratings run 0..3 (0 = none, e.g. Kai'Sa crowdControl).
    for (const k of PLAYSTYLE_KEYS) {
      const v = c.playstyle?.[k];
      if (typeof v !== 'number' || v < 0 || v > 3) {
        errors.push(`${label}: playstyle.${k} = ${v} not in 0..3`);
      }
    }

    if (c.alias && !existsSync(join(ICON_DIR, `${c.alias}.png`))) {
      errors.push(`${label}: icon file ${c.alias}.png missing`);
    }
  }

  // Curated tags (optional; hand-maintained). When present, validate fully.
  const perRoleByChampion = new Map<string, Set<string>>(); // id -> flexRoles, for meta cross-check
  if (existsSync(CURATED_TAGS_FILE)) {
    const tagsDoc = JSON.parse(await readFile(CURATED_TAGS_FILE, 'utf8')) as {
      champions?: Record<string, any>;
    };
    const curated = tagsDoc.champions ?? {};

    for (const c of champions) {
      if (!(String(c.id) in curated)) errors.push(`curated tags: missing entry for id ${c.id} (${c.alias})`);
    }
    for (const [key, entry] of Object.entries(curated)) {
      if (!seenIds.has(Number(key))) {
        errors.push(`curated tags: entry for unknown id ${key}`);
        continue;
      }
      const label = `curated tags ${key} (${(entry as any)?.name ?? '?'})`;

      if (!VALID_SUBCLASS.has((entry as any)?.subclass)) {
        errors.push(`${label}: invalid subclass "${(entry as any)?.subclass}"`);
      }
      if ((entry as any)?.confidence && !['high', 'low'].includes((entry as any).confidence)) {
        errors.push(`${label}: invalid confidence "${(entry as any).confidence}"`);
      }

      const tags = (entry as any)?.tags ?? {};
      for (const k of TAG_INT_KEYS) {
        if (!isInt03(tags[k])) errors.push(`${label}: tag ${k} = ${tags[k]} not an int 0..3`);
      }
      for (const k of TAG_BOOL_KEYS) {
        if (typeof tags[k] !== 'boolean') errors.push(`${label}: tag ${k} = ${tags[k]} not a boolean`);
      }
      const extraTagKeys = Object.keys(tags).filter(
        (k) => !TAG_INT_KEYS.includes(k as any) && !TAG_BOOL_KEYS.includes(k as any),
      );
      if (extraTagKeys.length) errors.push(`${label}: unknown tag key(s) ${extraTagKeys.join(', ')}`);

      const perRole = (entry as any)?.perRole ?? {};
      const flexRoles: string[] = Array.isArray((entry as any)?.flexRoles) ? (entry as any).flexRoles : [];
      const perRolePositions = new Set(Object.keys(perRole));
      perRoleByChampion.set(key, perRolePositions as Set<string>);
      if (perRolePositions.size === 0) errors.push(`${label}: perRole has no positions`);
      for (const [pos, v] of Object.entries(perRole)) {
        if (!VALID_POSITIONS.has(pos)) errors.push(`${label}: invalid perRole position "${pos}"`);
        if (!isInt03((v as any)?.blindSafe)) errors.push(`${label}: ${pos}.blindSafe not an int 0..3`);
        if (!isInt03((v as any)?.counterSensitivity)) errors.push(`${label}: ${pos}.counterSensitivity not an int 0..3`);
      }
      // flexRoles must equal perRole positions
      if (flexRoles.length !== perRolePositions.size || !flexRoles.every((r) => perRolePositions.has(r))) {
        errors.push(`${label}: flexRoles [${flexRoles.join(',')}] must match perRole positions`);
      }
    }
    console.log('curated tags present: cross-checked');
  } else {
    console.log('curated tags not present yet');
  }

  // Curated meta.
  if (existsSync(CURATED_META_FILE)) {
    const metaDoc = JSON.parse(await readFile(CURATED_META_FILE, 'utf8')) as { champions?: Record<string, any> };
    const meta = metaDoc.champions ?? {};
    for (const c of champions) {
      if (!(String(c.id) in meta)) errors.push(`curated meta: missing entry for id ${c.id} (${c.alias})`);
    }
    for (const [key, entry] of Object.entries(meta)) {
      if (!seenIds.has(Number(key))) {
        errors.push(`curated meta: entry for unknown id ${key}`);
        continue;
      }
      const label = `curated meta ${key}`;
      const tby = (entry as any)?.tierByPosition ?? {};
      const bp = (entry as any)?.banPriority;
      if (!isInt03(bp)) errors.push(`${label}: banPriority ${bp} not an int 0..3`);
      for (const [pos, tier] of Object.entries(tby)) {
        if (!VALID_POSITIONS.has(pos)) errors.push(`${label}: invalid tier position "${pos}"`);
        if (!VALID_TIERS.has(tier as string)) errors.push(`${label}: invalid tier "${tier}" at ${pos}`);
      }
      // every perRole position must have a tier
      const expected = perRoleByChampion.get(key);
      if (expected) {
        for (const pos of expected) {
          if (!(pos in tby)) errors.push(`${label}: missing tierByPosition for perRole "${pos}"`);
        }
      }
      const posOv = (entry as any)?.positions;
      if (posOv) {
        for (const [pos, w] of Object.entries(posOv)) {
          if (!VALID_POSITIONS.has(pos)) errors.push(`${label}: invalid positions override key "${pos}"`);
          if (typeof w !== 'number' || w < 0 || w > 1) errors.push(`${label}: positions override ${pos}=${w} not in 0..1`);
        }
      }
    }
    console.log('curated meta present: cross-checked');
  }

  // Curated synergies.
  if (existsSync(CURATED_SYNERGIES_FILE)) {
    const synergies = JSON.parse(await readFile(CURATED_SYNERGIES_FILE, 'utf8')) as any[];
    if (!Array.isArray(synergies)) {
      errors.push('curated synergies: not an array');
    } else {
      const seenPairs = new Set<string>();
      for (const s of synergies) {
        const tag = `curated synergy ${s?.a}-${s?.b}`;
        if (!seenIds.has(s?.a)) errors.push(`${tag}: unknown id a=${s?.a}`);
        if (!seenIds.has(s?.b)) errors.push(`${tag}: unknown id b=${s?.b}`);
        if (s?.a === s?.b) errors.push(`${tag}: self-pair`);
        if (typeof s?.a === 'number' && typeof s?.b === 'number' && s.a >= s.b) errors.push(`${tag}: not normalized (a<b)`);
        if (!isStrength(s?.strength)) errors.push(`${tag}: strength ${s?.strength} not 1..3`);
        if (typeof s?.reason !== 'string' || !s.reason.length) errors.push(`${tag}: missing reason`);
        const key = `${s?.a}:${s?.b}`;
        if (seenPairs.has(key)) errors.push(`${tag}: duplicate pair`);
        seenPairs.add(key);
      }
      console.log(`curated synergies present: ${synergies.length} edges cross-checked`);
    }
  }

  // Curated counters.
  if (existsSync(CURATED_COUNTERS_FILE)) {
    const counters = JSON.parse(await readFile(CURATED_COUNTERS_FILE, 'utf8')) as any[];
    if (!Array.isArray(counters)) {
      errors.push('curated counters: not an array');
    } else {
      const seenEdges = new Set<string>();
      for (const c of counters) {
        const tag = `curated counter ${c?.champion}>${c?.counters} (${c?.role})`;
        if (!seenIds.has(c?.champion)) errors.push(`${tag}: unknown champion id ${c?.champion}`);
        if (!seenIds.has(c?.counters)) errors.push(`${tag}: unknown counters id ${c?.counters}`);
        if (c?.champion === c?.counters) errors.push(`${tag}: self-edge`);
        if (!VALID_POSITIONS.has(c?.role)) errors.push(`${tag}: invalid role "${c?.role}"`);
        if (!isStrength(c?.strength)) errors.push(`${tag}: strength ${c?.strength} not 1..3`);
        if (typeof c?.reason !== 'string' || !c.reason.length) errors.push(`${tag}: missing reason`);
        const key = `${c?.champion}:${c?.counters}:${c?.role}`;
        if (seenEdges.has(key)) errors.push(`${tag}: duplicate edge`);
        seenEdges.add(key);
      }
      console.log(`curated counters present: ${counters.length} edges cross-checked`);
    }
  }

  if (errors.length) {
    console.error(`FAIL: ${errors.length} problem(s):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  console.log(`OK: ${champions.length} champions validated, all checks passed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
