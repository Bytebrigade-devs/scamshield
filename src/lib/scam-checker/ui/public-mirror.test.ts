/**
 * Drift guard: the static checker assets must match the tested source in `ui/public/`.
 *
 * Since the React port, the screen imports the view models from `ui/public/*.js` directly, so the
 * only files still copied out are the woff2 fonts and the favicon — both referenced by absolute
 * URL and therefore impossible to import. A source change without regeneration fails here, so the
 * files users' browsers fetch cannot silently diverge from the tested source.
 *
 * Runner: Node built-in `node --test` (zero dependencies), same as the rest of the M4 suite.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('the served checker assets are byte-identical to their tested source', () => {
  const script = fileURLToPath(new URL('./scripts/sync-public.ts', import.meta.url));
  const output = execFileSync(process.execPath, [script, '--check'], { encoding: 'utf8' });
  assert.match(output, /Served checker assets verified/);
});
