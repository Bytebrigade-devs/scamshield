/**
 * Regenerate the assets the mounted checker still serves as static files.
 *
 * Source of truth: `src/lib/scam-checker/ui/public/` (byte-pinned, tested).
 *
 * Until the React port this script also copied every browser module into `public/checker/*` and
 * generated `src/app/checker/shell.generated.ts`. Both are gone: the screen is a Next.js page that
 * imports the view models from `ui/public/*.js` directly, so nothing loads them from `/checker/*`
 * any more. What is left are the two files a stylesheet cannot import:
 *   - `public/fonts/*.woff2` — referenced by absolute `/fonts/...` URLs in `styles.css`
 *   - `public/checker/favicon.svg` — referenced by the checker route's metadata
 *
 * Usage:
 *   node src/lib/scam-checker/ui/scripts/sync-public.ts          # write
 *   node src/lib/scam-checker/ui/scripts/sync-public.ts --check  # verify only (used by tests/CI)
 *
 * No network, no dependencies. The mirror test runs `--check` so the served copy cannot drift.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, '..', 'public');
const repoRoot = join(here, '..', '..', '..', '..', '..');
const fontsTarget = join(repoRoot, 'public', 'fonts');
const faviconTarget = join(repoRoot, 'public', 'checker', 'favicon.svg');

/** Fonts the stylesheet loads by absolute path. */
const FONTS = ['plus-jakarta-sans-latin.woff2', 'plus-jakarta-sans-latin-ext.woff2'] as const;

interface Output { path: string; bytes: Buffer }

function build(): Output[] {
  const outputs: Output[] = FONTS.map((name) => ({
    path: join(fontsTarget, name),
    bytes: readFileSync(join(source, 'fonts', name)),
  }));
  outputs.push({ path: faviconTarget, bytes: readFileSync(join(source, 'favicon.svg')) });
  return outputs;
}

const digest = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
const outputs = build();
const check = process.argv.includes('--check');

if (check) {
  const stale: string[] = [];
  for (const output of outputs) {
    if (!existsSync(output.path) || digest(readFileSync(output.path)) !== digest(output.bytes)) {
      stale.push(output.path.slice(repoRoot.length + 1).replaceAll('\\', '/'));
    }
  }
  if (stale.length > 0) {
    console.error(`Served checker assets are out of date: ${stale.join(', ')}`);
    console.error('Run: node src/lib/scam-checker/ui/scripts/sync-public.ts');
    process.exit(1);
  }
  console.log(`Served checker assets verified (${outputs.length} files).`);
} else {
  for (const output of outputs) {
    mkdirSync(dirname(output.path), { recursive: true });
    writeFileSync(output.path, output.bytes);
  }
  console.log(`Wrote ${outputs.length} files for the served checker assets.`);
}
