import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
const root = path.resolve("out");
const routes = [
  "/",
  "/onboarding/",
  "/benefits/",
  "/share/",
  "/signup/",
  "/privacy/",
];
let references = 0;
for (const route of routes) {
  const html = await readFile(path.join(root, route, "index.html"), "utf8");
  assert.match(html, /<title>ScamShield/);
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const url = new URL(
      match[1].replaceAll("&amp;", "&"),
      "http://preview.test" + route,
    );
    if (url.origin !== "http://preview.test") continue;
    let target = path.join(root, decodeURIComponent(url.pathname));
    const info = await stat(target);
    if (info.isDirectory()) target = path.join(target, "index.html");
    assert.ok((await stat(target)).isFile(), target);
    references++;
  }
}
const portable = await readFile("OPEN-PREVIEW.html", "utf8");
assert.match(portable, /<div id="root"><\/div><script>/);
assert.doesNotMatch(portable, /<script\s+src=/i);
assert.doesNotMatch(portable, /<link[^>]+(?:href|src)=/i);
assert.match(portable, /data:font\/ttf;base64,/);
console.log(
  `PASS: ${routes.length} exported routes, ${references} local asset/navigation references, self-contained HTML preview.`,
);
