/**
 * M4 checker — stylesheet isolation guard.
 *
 * The checker ships M4's own stylesheet, and that sheet defines `.btn`, `.card`, `.field`,
 * `.field-label`, `.field-error` and `.skip-link` — names the shared `globals.css` also defines,
 * with different values (M4's button is 48px and primary-filled; the shared one is 44px and
 * transparent). Losing that isolation would restyle M2's login and M3's vault without any test
 * failing elsewhere.
 *
 * `next dev` injects every stylesheet into every page, so a browser test cannot see the
 * difference. This guard reads the build output instead: it finds the CSS chunk that carries M4's
 * button sizing and asserts that only checker route manifests reference it.
 *
 * Skips cleanly when no build is present, so it never fails a test run that only intends to
 * exercise the libraries.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

const root = process.cwd();
const cssDir = path.join(root, ".next", "static", "css");
const appDir = path.join(root, ".next", "server", "app");

/** The chunk that carries M4's 48px button rule, or null when the build is absent. */
function checkerChunk(): string | null {
  if (!fs.existsSync(cssDir)) return null;
  for (const name of fs.readdirSync(cssDir)) {
    if (!name.endsWith(".css")) continue;
    const text = fs.readFileSync(path.join(cssDir, name), "utf8");
    // 48px plus the primary fill is M4's base `.btn`; nothing in globals.css produces both.
    if (text.includes("min-height:48px") && text.includes("border-radius:var(--radius-control)")) return name;
  }
  return null;
}

/** Every route directory under `.next/server/app` that references the chunk. */
function routesReferencing(chunk: string): string[] {
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.name.includes("manifest") && !entry.name.endsWith(".js")) continue;
      if (fs.readFileSync(full, "utf8").includes(chunk)) {
        hits.push(path.relative(appDir, dir) || ".");
      }
    }
  };
  walk(appDir);
  return hits;
}

test("M4's stylesheet reaches the checker route and no other", (t) => {
  const chunk = checkerChunk();
  if (chunk === null) {
    t.skip("no production build found — run `next build` to exercise this guard");
    return;
  }

  const routes = [...new Set(routesReferencing(chunk))].sort();
  assert.ok(routes.length > 0, "expected the checker route to reference its own stylesheet chunk");

  const foreign = routes.filter((route) => !route.split(path.sep).includes("checker"));
  assert.deepEqual(
    foreign,
    [],
    `M4's stylesheet leaked into other routes: ${foreign.join(", ")} — it defines .btn/.card/.field and would restyle them`,
  );
});
