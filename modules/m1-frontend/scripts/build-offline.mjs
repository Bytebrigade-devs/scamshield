import { build } from "esbuild";
import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const shim = path.join(root, "scripts/offline/router-shim.tsx");
const result = await build({
  entryPoints: [path.join(root, "scripts/offline/entry.tsx")],
  bundle: true,
  write: false,
  minify: true,
  format: "iife",
  platform: "browser",
  jsx: "automatic",
  tsconfig: path.join(root, "tsconfig.json"),
  alias: { "next/link": shim, "next/navigation": shim },
  define: {
    "process.env.NODE_ENV": '"production"',
    "process.env.NEXT_PUBLIC_ANALYTICS_ENABLED": '"false"',
    "process.env.NEXT_PUBLIC_AB_ENABLED": '"false"',
    "process.env.NEXT_PUBLIC_SITE_URL": '""',
    "process.env.NEXT_PUBLIC_SIGNUP_PATH": '"/signup/"',
  },
});
async function cssFiles(dir) {
  let result = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) result.push(...(await cssFiles(p)));
    else if (e.name.endsWith(".css")) result.push(p);
  }
  return result;
}
let css = (
  await Promise.all(
    (await cssFiles(path.join(root, "out/_next/static"))).map((p) =>
      readFile(p, "utf8"),
    ),
  )
).join("\n");
// Keep the self-hosted team font available in the direct-open HTML preview too.
const fontData = (
  await readFile(path.join(root, "public/fonts/plus-jakarta-sans.ttf"))
).toString("base64");
css = css.replace(
  /url\(["']?\/fonts\/plus-jakarta-sans\.ttf["']?\)/g,
  `url("data:font/ttf;base64,${fontData}")`,
);
const js = result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
await writeFile(
  path.join(root, "OPEN-PREVIEW.html"),
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ScamShield | Module 01 preview</title><style>${css}</style></head><body><div id="root"></div><script>${js}</script></body></html>`,
);
console.log(
  "Created OPEN-PREVIEW.html: self-contained preview, no installation required.",
);
