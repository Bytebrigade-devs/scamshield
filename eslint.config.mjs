import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // `(({ source: _source, ...rest }) => ...)` omits a key via destructuring, and a `_`-prefixed
      // parameter is an intentional stub slot. Both are standard options for those idioms.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { ignoreRestSiblings: true, argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["src/lib/scam-checker/**/*.test.ts"],
    rules: {
      // M4 test fixtures deliberately use `any` for untyped payloads and browser-JS modules
      // (`ui/public/*.js` has no declarations). The same set is excluded from `tsc` and its
      // real behaviour is executed by `node --test` in CI.
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    files: ["scripts/**/*.cjs"],
    rules: {
      // M2's subscription harness is intentionally CommonJS: it compiles the policy modules with
      // the TypeScript API and executes them in a fresh `vm` context, so `require()` is the point.
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  globalIgnores([".next/**", ".dependencies-incomplete/**", "next-env.d.ts", "test-results/**", "playwright-report/**"]),
]);
