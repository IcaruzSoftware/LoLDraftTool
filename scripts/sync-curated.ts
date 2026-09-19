/**
 * Copies the curated JSON files (data/curated/*.json) into the app's public
 * folder (app/public/data/curated/) so Vite serves them at ./data/curated/*.
 * Tolerant: creates the destination and copies whatever exists; a missing
 * source directory or file is simply skipped.
 *
 * Run with: pnpm sync-curated
 */

import { mkdir, readdir, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC_DIR = join(ROOT, 'data', 'curated');
const DEST_DIR = join(ROOT, 'app', 'public', 'data', 'curated');

async function main() {
  if (!existsSync(SRC_DIR)) {
    console.log(`sync-curated: no source dir ${SRC_DIR}; nothing to copy`);
    return;
  }

  await mkdir(DEST_DIR, { recursive: true });

  const files = (await readdir(SRC_DIR)).filter((f) => f.endsWith('.json'));
  if (files.length === 0) {
    console.log('sync-curated: no *.json files to copy');
    return;
  }

  for (const f of files) {
    await copyFile(join(SRC_DIR, f), join(DEST_DIR, f));
    console.log(`sync-curated: copied ${f}`);
  }
  console.log(`sync-curated: ${files.length} file(s) synced to ${DEST_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
