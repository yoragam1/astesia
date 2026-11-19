import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

export function runImportResolutionSuite(
  customGatePath?: string,
  customTmpDir?: string
): { total: number; passed: number; failed: number; known_gaps: number; errors: string[] } {
  const gatePath = customGatePath || resolve(__dirname, "../astesia-gate.ts");
  const rulesPath = resolve(__dirname, "../anti-patterns.json");
  const baseTmp = customTmpDir || resolve(__dirname, "../../../.astesia/audit/tmp/import-res-" + Date.now());
  mkdirSync(baseTmp, { recursive: true });

  let passed = 0;
  let failed = 0;
  const errors: string[] = [];

  function record(id: string, name: string, ok: boolean, detail: string) {
    if (ok) {
      passed++;
    } else {
      failed++;
      errors.push(`FAIL: ${id} (${name}) - ${detail}`);
    }
  }

  function runGate(dir: string, extraArgs: string[] = []) {
    const res = spawnSync(process.execPath, [gatePath, "--root", dir, "--rules", rulesPath, "--json", ...extraArgs], {
      encoding: "utf8",
      maxBuffer: 50 * 1024 * 1024
    });
    let json: any = null;
    try {
      json = JSON.parse(res.stdout);
    } catch {}
    return { status: res.status, stdout: res.stdout, stderr: res.stderr, json };
  }

  try {
    // -------------------------------------------------------------
    // Group 1: Case Sensitivity (Windows & Linux) (IR-01 .. IR-06)
    // -------------------------------------------------------------
    {
      // IR-01: Wrong file casing (import ./foo when actual file is Foo.ts) -> ASTESIA-000 violation
      const d = join(baseTmp, "ir01");
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "Foo.ts"), "export const Foo = 1;\n", "utf8");
      writeFileSync(join(d, "main.ts"), "import { Foo } from './foo';\n", "utf8");
      const r = runGate(d);
      const viols = r.json?.violations || [];
      const ok = r.status === 1 && viols.some((v: any) => v.ruleId === "ASTESIA-000");
      record("IR-01", "Wrong file casing triggers ASTESIA-000", ok, JSON.stringify(viols));
    }

    {
      // IR-02: Correct file casing (import ./Foo when file is Foo.ts) -> PASS
      const d = join(baseTmp, "ir02");
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "Foo.ts"), "export const Foo = 1;\n", "utf8");
      writeFileSync(join(d, "main.ts"), "import { Foo } from './Foo';\n", "utf8");
      const r = runGate(d);
      const viols = r.json?.violations || [];
      const ok = r.status === 0 && viols.length === 0;
      record("IR-02", "Correct file casing passes", ok, JSON.stringify(viols));
    }

    {
      // IR-03: Wrong directory casing (import ./components/Button when dir is Components) -> ASTESIA-000
      const d = join(baseTmp, "ir03");
      mkdirSync(join(d, "Components"), { recursive: true });
      writeFileSync(join(d, "Components/Button.ts"), "export const Button = 1;\n", "utf8");
      writeFileSync(join(d, "main.ts"), "import { Button } from './components/Button';\n", "utf8");
      const r = runGate(d);
      const viols = r.json?.violations || [];
      const ok = r.status === 1 && viols.some((v: any) => v.ruleId === "ASTESIA-000");
      record("IR-03", "Wrong directory casing triggers ASTESIA-000", ok, JSON.stringify(viols));
    }

    {
      // IR-04: Correct directory casing -> PASS
      const d = join(baseTmp, "ir04");
      mkdirSync(join(d, "Components"), { recursive: true });
      writeFileSync(join(d, "Components/Button.ts"), "export const Button = 1;\n", "utf8");
      writeFileSync(join(d, "main.ts"), "import { Button } from './Components/Button';\n", "utf8");
      const r = runGate(d);
      const viols = r.json?.violations || [];
      const ok = r.status === 0 && viols.length === 0;
      record("IR-04", "Correct directory casing passes", ok, JSON.stringify(viols));
    }

    {
      // IR-05: Multi-segment wrong casing in the middle: ./a/b/c where B is uppercase
      const d = join(baseTmp, "ir05");
      mkdirSync(join(d, "a/B"), { recursive: true });
      writeFileSync(join(d, "a/B/c.ts"), "export const C = 1;\n", "utf8");
      writeFileSync(join(d, "main.ts"), "import { C } from './a/b/c';\n", "utf8");
      const r = runGate(d);
      const viols = r.json?.violations || [];
      const ok = r.status === 1 && viols.some((v: any) => v.ruleId === "ASTESIA-000");
      record("IR-05", "Mid-path wrong casing triggers ASTESIA-000", ok, JSON.stringify(viols));
    }

    {
      // IR-06: Parent directory traversal with wrong casing: ../Components/Button
      const d = join(baseTmp, "ir06");
      mkdirSync(join(d, "Components"), { recursive: true });
      mkdirSync(join(d, "sub"), { recursive: true });
      writeFileSync(join(d, "Components/Button.ts"), "export const Button = 1;\n", "utf8");
      writeFileSync(join(d, "sub/main.ts"), "import { Button } from '../components/Button';\n", "utf8");
      const r = runGate(d);
      const viols = r.json?.violations || [];
      const ok = r.status === 1 && viols.some((v: any) => v.ruleId === "ASTESIA-000");
      record("IR-06", "Parent-traversal wrong casing triggers ASTESIA-000", ok, JSON.stringify(viols));
    }

    // -------------------------------------------------------------
    // Group 2: ESM TypeScript Extensions Mapping (IR-07 .. IR-14)
    // -------------------------------------------------------------
    {
      // IR-07: ./x.js resolves to x.ts
      const d = join(baseTmp, "ir07");
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "x.ts"), "export const x = 1;\n", "utf8");
      writeFileSync(join(d, "main.ts"), "import { x } from './x.js';\n", "utf8");
      const r = runGate(d);
      const viols = r.json?.violations || [];
      const ok = r.status === 0 && viols.length === 0;
      record("IR-07", "./x.js resolves to x.ts", ok, JSON.stringify(viols));
    }

    {
      // IR-08: ./x.js resolves to x.tsx
      const d = join(baseTmp, "ir08");
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "x.tsx"), "export const x = 1;\n", "utf8");
      writeFileSync(join(d, "main.ts"), "import { x } from './x.js';\n", "utf8");
      const r = runGate(d);
      const viols = r.json?.violations || [];
      const ok = r.status === 0 && viols.length === 0;
      record("IR-08", "./x.js resolves to x.tsx", ok, JSON.stringify(viols));
    }

    {
      // IR-09: ./x.js resolves to x.mts
      const d = join(baseTmp, "ir09");
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "x.mts"), "export const x = 1;\n", "utf8");
      writeFileSync(join(d, "main.ts"), "import { x } from './x.js';\n", "utf8");
      const r = runGate(d);
      const viols = r.json?.violations || [];
      const ok = r.status === 0 && viols.length === 0;
      record("IR-09", "./x.js resolves to x.mts", ok, JSON.stringify(viols));
    }

    {
      // IR-10: ./x.js resolves to x.cts
      const d = join(baseTmp, "ir10");
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "x.cts"), "export const x = 1;\n", "utf8");
      writeFileSync(join(d, "main.ts"), "import { x } from './x.js';\n", "utf8");
      const r = runGate(d);
      const viols = r.json?.violations || [];
      const ok = r.status === 0 && viols.length === 0;
      record("IR-10", "./x.js resolves to x.cts", ok, JSON.stringify(viols));
    }

    {
      // IR-11: ./x.mjs resolves to x.mts
      const d = join(baseTmp, "ir11");
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "x.mts"), "export const x = 1;\n", "utf8");
      writeFileSync(join(d, "main.ts"), "import { x } from './x.mjs';\n", "utf8");
      const r = runGate(d);
      const viols = r.json?.violations || [];
      const ok = r.status === 0 && viols.length === 0;
      record("IR-11", "./x.mjs resolves to x.mts", ok, JSON.stringify(viols));
    }

    {
      // IR-12: ./x.cjs resolves to x.cts
      const d = join(baseTmp, "ir12");
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "x.cts"), "export const x = 1;\n", "utf8");
      writeFileSync(join(d, "main.ts"), "import { x } from './x.cjs';\n", "utf8");
      const r = runGate(d);
      const viols = r.json?.violations || [];
      const ok = r.status === 0 && viols.length === 0;
      record("IR-12", "./x.cjs resolves to x.cts", ok, JSON.stringify(viols));
    }

    {
      // IR-13: ./x.jsx resolves to x.tsx
      const d = join(baseTmp, "ir13");
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "x.tsx"), "export const x = 1;\n", "utf8");
      writeFileSync(join(d, "main.ts"), "import { x } from './x.jsx';\n", "utf8");
      const r = runGate(d);
      const viols = r.json?.violations || [];
      const ok = r.status === 0 && viols.length === 0;
      record("IR-13", "./x.jsx resolves to x.tsx", ok, JSON.stringify(viols));
    }

    {
      // IR-14: ./x.js when x does not exist -> ASTESIA-000 violation
      const d = join(baseTmp, "ir14");
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "main.ts"), "import { x } from './x.js';\n", "utf8");
      const r = runGate(d);
      const viols = r.json?.violations || [];
      const ok = r.status === 1 && viols.some((v: any) => v.ruleId === "ASTESIA-000");
      record("IR-14", "./x.js when file not found triggers ASTESIA-000", ok, JSON.stringify(viols));
    }

    // -------------------------------------------------------------
    // Group 3: Index Resolution (IR-15 .. IR-18)
    // -------------------------------------------------------------
    {
      // IR-15: ./utils resolves to ./utils/index.ts
      const d = join(baseTmp, "ir15");
      mkdirSync(join(d, "utils"), { recursive: true });
      writeFileSync(join(d, "utils/index.ts"), "export const u = 1;\n", "utf8");
      writeFileSync(join(d, "main.ts"), "import { u } from './utils';\n", "utf8");
      const r = runGate(d);
      const viols = r.json?.violations || [];
      const ok = r.status === 0 && viols.length === 0;
      record("IR-15", "./utils resolves to ./utils/index.ts", ok, JSON.stringify(viols));
    }

    {
      // IR-16: ./utils resolves to ./utils/index.js
      const d = join(baseTmp, "ir16");
      mkdirSync(join(d, "utils"), { recursive: true });
      writeFileSync(join(d, "utils/index.js"), "module.exports = { u: 1 };\n", "utf8");
      writeFileSync(join(d, "main.ts"), "import { u } from './utils';\n", "utf8");
      const r = runGate(d);
      const viols = r.json?.violations || [];
      const ok = r.status === 0 && viols.length === 0;
      record("IR-16", "./utils resolves to ./utils/index.js", ok, JSON.stringify(viols));
    }

    {
      // IR-17: ./utils resolves to ./utils/index.tsx
      const d = join(baseTmp, "ir17");
      mkdirSync(join(d, "utils"), { recursive: true });
      writeFileSync(join(d, "utils/index.tsx"), "export const u = 1;\n", "utf8");
      writeFileSync(join(d, "main.ts"), "import { u } from './utils';\n", "utf8");
      const r = runGate(d);
      const viols = r.json?.violations || [];
      const ok = r.status === 0 && viols.length === 0;
      record("IR-17", "./utils resolves to ./utils/index.tsx", ok, JSON.stringify(viols));
    }

    {
      // IR-18: ./utils resolves to ./utils/index.mts
      const d = join(baseTmp, "ir18");
      mkdirSync(join(d, "utils"), { recursive: true });
      writeFileSync(join(d, "utils/index.mts"), "export const u = 1;\n", "utf8");
      writeFileSync(join(d, "main.ts"), "import { u } from './utils';\n", "utf8");
      const r = runGate(d);
      const viols = r.json?.violations || [];
      const ok = r.status === 0 && viols.length === 0;
      record("IR-18", "./utils resolves to ./utils/index.mts", ok, JSON.stringify(viols));
    }

    // -------------------------------------------------------------
    // Group 4: Virtual Modules Whitelist (IR-19 .. IR-26)
    // -------------------------------------------------------------
    {
      // IR-19: $app/navigation and $app/stores skipped
      const d = join(baseTmp, "ir19");
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "page.svelte.ts"), "import { goto } from '$app/navigation';\nimport { page } from '$app/stores';\n", "utf8");
      const r = runGate(d);
      const viols = r.json?.violations || [];
      const ok = r.status === 0 && viols.length === 0;
      record("IR-19", "$app/ virtual modules skipped", ok, JSON.stringify(viols));
    }

    {
      // IR-20: $env/ dynamic & static skipped
      const d = join(baseTmp, "ir20");
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "api.ts"), "import { env } from '$env/dynamic/public';\nimport { SECRET } from '$env/static/private';\n", "utf8");
      const r = runGate(d);
      const viols = r.json?.violations || [];
      const ok = r.status === 0 && viols.length === 0;
      record("IR-20", "$env/ virtual modules skipped", ok, JSON.stringify(viols));
    }

    {
      // IR-21: $service-worker skipped
      const d = join(baseTmp, "ir21");
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "sw.ts"), "import { build, files, version } from '$service-worker';\n", "utf8");
      const r = runGate(d);
      const viols = r.json?.violations || [];
      const ok = r.status === 0 && viols.length === 0;
      record("IR-21", "$service-worker skipped", ok, JSON.stringify(viols));
    }

    {
      // IR-22: virtual: prefix skipped
      const d = join(baseTmp, "ir22");
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "pwa.ts"), "import { registerSW } from 'virtual:pwa-register';\n", "utf8");
      const r = runGate(d);
      const viols = r.json?.violations || [];
      const ok = r.status === 0 && viols.length === 0;
      record("IR-22", "virtual: prefix skipped", ok, JSON.stringify(viols));
    }

    {
      // IR-23: #imports and #app skipped (Nuxt)
      const d = join(baseTmp, "ir23");
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "comp.ts"), "import { useRoute } from '#imports';\nimport { defineNuxtPlugin } from '#app';\n", "utf8");
      const r = runGate(d);
      const viols = r.json?.violations || [];
      const ok = r.status === 0 && viols.length === 0;
      record("IR-23", "#imports and #app skipped", ok, JSON.stringify(viols));
    }

    {
      // IR-24: astro: prefix skipped
      const d = join(baseTmp, "ir24");
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "blog.ts"), "import { getCollection } from 'astro:content';\nimport { Image } from 'astro:assets';\n", "utf8");
      const r = runGate(d);
      const viols = r.json?.violations || [];
      const ok = r.status === 0 && viols.length === 0;
      record("IR-24", "astro: prefix skipped", ok, JSON.stringify(viols));
    }

    {
      // IR-25: ./$types and $types skipped (SvelteKit generated)
      const d = join(baseTmp, "ir25");
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "+page.server.ts"), "import type { PageServerLoad } from './$types';\nimport type { LayoutLoad } from './sub/$types';\n", "utf8");
      const r = runGate(d);
      const viols = r.json?.violations || [];
      const ok = r.status === 0 && viols.length === 0;
      record("IR-25", "./$types and /$types suffix skipped", ok, JSON.stringify(viols));
    }

    {
      // IR-26: $lib/ mapped to src/lib/
      const d = join(baseTmp, "ir26");
      mkdirSync(join(d, "src/lib"), { recursive: true });
      writeFileSync(join(d, "src/lib/button.svelte"), "<button>Click</button>\n", "utf8");
      writeFileSync(join(d, "src/lib/utils.ts"), "export const u = 1;\n", "utf8");
      writeFileSync(join(d, "app.ts"), "import { u } from '$lib/utils';\n", "utf8");
      const r = runGate(d);
      const viols = r.json?.violations || [];
      const ok = r.status === 0 && viols.length === 0;
      record("IR-26", "$lib/ maps to src/lib/ and resolves existing file", ok, JSON.stringify(viols));
    }

    {
      // IR-27: $lib/ with missing target triggers ASTESIA-000
      const d = join(baseTmp, "ir27");
      mkdirSync(join(d, "src/lib"), { recursive: true });
      writeFileSync(join(d, "app.ts"), "import { missing } from '$lib/nonexistent';\n", "utf8");
      const r = runGate(d);
      const viols = r.json?.violations || [];
      const ok = r.status === 1 && viols.some((v: any) => v.ruleId === "ASTESIA-000");
      record("IR-27", "$lib/ with missing target triggers ASTESIA-000", ok, JSON.stringify(viols));
    }

    // -------------------------------------------------------------
    // Group 5: Query Specifiers Stripping (IR-28 .. IR-32)
    // -------------------------------------------------------------
    {
      // IR-28: ./file.svg?raw resolves to ./file.svg
      const d = join(baseTmp, "ir28");
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "logo.svg"), "<svg></svg>\n", "utf8");
      writeFileSync(join(d, "main.ts"), "import logo from './logo.svg?raw';\n", "utf8");
      const r = runGate(d);
      const viols = r.json?.violations || [];
      const ok = r.status === 0 && viols.length === 0;
      record("IR-28", "?raw query stripped and file resolved", ok, JSON.stringify(viols));
    }

    {
      // IR-29: ./worker.ts?worker resolves
      const d = join(baseTmp, "ir29");
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "worker.ts"), "export const worker = 1;\n", "utf8");
      writeFileSync(join(d, "main.ts"), "import MyWorker from './worker.ts?worker';\n", "utf8");
      const r = runGate(d);
      const viols = r.json?.violations || [];
      const ok = r.status === 0 && viols.length === 0;
      record("IR-29", "?worker query stripped and file resolved", ok, JSON.stringify(viols));
    }

    {
      // IR-30: ./style.css?inline resolves
      const d = join(baseTmp, "ir30");
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "style.css"), "body {}\n", "utf8");
      writeFileSync(join(d, "main.ts"), "import styles from './style.css?inline';\n", "utf8");
      const r = runGate(d);
      const viols = r.json?.violations || [];
      const ok = r.status === 0 && viols.length === 0;
      record("IR-30", "?inline query stripped and file resolved", ok, JSON.stringify(viols));
    }

    {
      // IR-31: ./img.png?url resolves
      const d = join(baseTmp, "ir31");
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "img.png"), "data\n", "utf8");
      writeFileSync(join(d, "main.ts"), "import imgUrl from './img.png?url';\n", "utf8");
      const r = runGate(d);
      const viols = r.json?.violations || [];
      const ok = r.status === 0 && viols.length === 0;
      record("IR-31", "?url query stripped and file resolved", ok, JSON.stringify(viols));
    }

    {
      // IR-32: ./missing.svg?raw triggers ASTESIA-000
      const d = join(baseTmp, "ir32");
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "main.ts"), "import logo from './missing.svg?raw';\n", "utf8");
      const r = runGate(d);
      const viols = r.json?.violations || [];
      const ok = r.status === 1 && viols.some((v: any) => v.ruleId === "ASTESIA-000");
      record("IR-32", "?raw query with missing target triggers ASTESIA-000", ok, JSON.stringify(viols));
    }

    // -------------------------------------------------------------
    // Group 6: tsconfig / jsconfig paths & baseUrl (IR-33 .. IR-42)
    // -------------------------------------------------------------
    {
      // IR-33: Basic tsconfig paths: @components/* -> components/*
      const d = join(baseTmp, "ir33");
      mkdirSync(join(d, "components"), { recursive: true });
      writeFileSync(join(d, "components/Button.tsx"), "export const Button = 1;\n", "utf8");
      writeFileSync(
        join(d, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: {
            paths: {
              "@components/*": ["components/*"]
            }
          }
        }),
        "utf8"
      );
      writeFileSync(join(d, "main.ts"), "import { Button } from '@components/Button';\n", "utf8");
      const r = runGate(d);
      const viols = r.json?.violations || [];
      const ok = r.status === 0 && viols.length === 0;
      record("IR-33", "tsconfig paths alias @components/* resolves", ok, JSON.stringify(viols));
    }

    {
      // IR-34: tsconfig paths with baseUrl
      const d = join(baseTmp, "ir34");
      mkdirSync(join(d, "src/utils"), { recursive: true });
      writeFileSync(join(d, "src/utils/format.ts"), "export const format = 1;\n", "utf8");
      writeFileSync(
        join(d, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: {
            baseUrl: "./src",
            paths: {
              "~/*": ["*"]
            }
          }
        }),
        "utf8"
      );
      writeFileSync(join(d, "main.ts"), "import { format } from '~/utils/format';\n", "utf8");
      const r = runGate(d);
      const viols = r.json?.violations || [];
      const ok = r.status === 0 && viols.length === 0;
      record("IR-34", "tsconfig baseUrl + paths resolves", ok, JSON.stringify(viols));
    }

    {
      // IR-35: Nested monorepo subpackage tsconfig closest upward
      const d = join(baseTmp, "ir35");
      mkdirSync(join(d, "packages/web/src/components"), { recursive: true });
      writeFileSync(join(d, "packages/web/src/components/Card.tsx"), "export const Card = 1;\n", "utf8");
      writeFileSync(
        join(d, "packages/web/tsconfig.json"),
        JSON.stringify({
          compilerOptions: {
            paths: {
              "@/*": ["./src/*"]
            }
          }
        }),
        "utf8"
      );
      writeFileSync(join(d, "packages/web/src/page.tsx"), "import { Card } from '@/components/Card';\n", "utf8");
      const r = runGate(d);
      const viols = r.json?.violations || [];
      const ok = r.status === 0 && viols.length === 0;
      record("IR-35", "Closest upward tsconfig in monorepo package resolves", ok, JSON.stringify(viols));
    }

    {
      // IR-36: JSONC with line & block comments and trailing commas
      const d = join(baseTmp, "ir36");
      mkdirSync(join(d, "src/lib"), { recursive: true });
      writeFileSync(join(d, "src/lib/calc.ts"), "export const c = 1;\n", "utf8");
      const jsoncContent = `
        {
          // TypeScript configuration
          "compilerOptions": {
            /* Path mappings */
            "baseUrl": ".",
            "paths": {
              "@lib/*": ["src/lib/*",], // trailing comma
            },
          },
        }
      `;
      writeFileSync(join(d, "tsconfig.json"), jsoncContent, "utf8");
      writeFileSync(join(d, "main.ts"), "import { c } from '@lib/calc';\n", "utf8");
      const r = runGate(d);
      const viols = r.json?.violations || [];
      const ok = r.status === 0 && viols.length === 0;
      record("IR-36", "JSONC parser handles comments and trailing commas", ok, JSON.stringify(viols));
    }

    {
      // IR-37: tsconfig relative extends (depth 1)
      const d = join(baseTmp, "ir37");
      mkdirSync(join(d, "src"), { recursive: true });
      writeFileSync(join(d, "src/util.ts"), "export const u = 1;\n", "utf8");
      writeFileSync(
        join(d, "tsconfig.base.json"),
        JSON.stringify({
          compilerOptions: {
            paths: {
              "@src/*": ["src/*"]
            }
          }
        }),
        "utf8"
      );
      writeFileSync(join(d, "tsconfig.json"), JSON.stringify({ extends: "./tsconfig.base.json" }), "utf8");
      writeFileSync(join(d, "main.ts"), "import { u } from '@src/util';\n", "utf8");
      const r = runGate(d);
      const viols = r.json?.violations || [];
      const ok = r.status === 0 && viols.length === 0;
      record("IR-37", "tsconfig relative extends (depth 1) resolves paths", ok, JSON.stringify(viols));
    }

    {
      // IR-38: tsconfig relative extends (depth 3)
      const d = join(baseTmp, "ir38");
      mkdirSync(join(d, "src"), { recursive: true });
      writeFileSync(join(d, "src/deep.ts"), "export const d = 1;\n", "utf8");
      writeFileSync(join(d, "tsconfig.root.json"), JSON.stringify({ compilerOptions: { paths: { "@deep/*": ["src/*"] } } }), "utf8");
      writeFileSync(join(d, "tsconfig.mid.json"), JSON.stringify({ extends: "./tsconfig.root.json" }), "utf8");
      writeFileSync(join(d, "tsconfig.sub.json"), JSON.stringify({ extends: "./tsconfig.mid.json" }), "utf8");
      writeFileSync(join(d, "tsconfig.json"), JSON.stringify({ extends: "./tsconfig.sub.json" }), "utf8");
      writeFileSync(join(d, "main.ts"), "import { d } from '@deep/deep';\n", "utf8");
      const r = runGate(d);
      const viols = r.json?.violations || [];
      const ok = r.status === 0 && viols.length === 0;
      record("IR-38", "tsconfig relative extends up to depth 3 resolves", ok, JSON.stringify(viols));
    }

    {
      // IR-39: tsconfig package extends ignored with notice tsconfig_unresolved_extends
      const d = join(baseTmp, "ir39");
      mkdirSync(join(d, "src"), { recursive: true });
      writeFileSync(join(d, "src/local.ts"), "export const l = 1;\n", "utf8");
      writeFileSync(
        join(d, "tsconfig.json"),
        JSON.stringify({
          extends: "@tsconfig/node18/tsconfig.json",
          compilerOptions: {
            paths: {
              "@local/*": ["src/*"]
            }
          }
        }),
        "utf8"
      );
      writeFileSync(join(d, "main.ts"), "import { l } from '@local/local';\n", "utf8");
      const r = runGate(d);
      const viols = r.json?.violations || [];
      const notices = r.json?.notices?.tsconfig_unresolved_extends || [];
      const ok = r.status === 0 && viols.length === 0 && notices.length > 0;
      record("IR-39", "Package extends ignored and notice emitted", ok, JSON.stringify(r.json));
    }

    {
      // IR-40: Broken tsconfig json -> alias_unverified notice and NO ASTESIA-000 violation
      const d = join(baseTmp, "ir40");
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "tsconfig.json"), "{ broken json syntax !!! ", "utf8");
      writeFileSync(join(d, "main.ts"), "import { something } from '@/broken/alias';\n", "utf8");
      const r = runGate(d);
      const viols = r.json?.violations || [];
      const notices = r.json?.notices?.alias_unverified || [];
      const ok = viols.filter((v: any) => v.ruleId === "ASTESIA-000").length === 0 && notices.length > 0;
      record("IR-40", "Broken tsconfig emits alias_unverified and skips 000 violation", ok, JSON.stringify(r.json));
    }

    {
      // IR-41: Fallback @/ -> src/ only applies when paths has no @/
      const d = join(baseTmp, "ir41");
      mkdirSync(join(d, "src/fallback"), { recursive: true });
      writeFileSync(join(d, "src/fallback/helper.ts"), "export const h = 1;\n", "utf8");
      // No tsconfig in project!
      writeFileSync(join(d, "main.ts"), "import { h } from '@/fallback/helper';\n", "utf8");
      const r = runGate(d);
      const viols = r.json?.violations || [];
      const ok = r.status === 0 && viols.length === 0;
      record("IR-41", "Legacy fallback @/ -> src/ works when no paths defined", ok, JSON.stringify(viols));
    }

    {
      // IR-42: @/ defined in tsconfig paths to non-existent location -> violation (fallback does NOT hide it)
      const d = join(baseTmp, "ir42");
      mkdirSync(join(d, "src"), { recursive: true });
      writeFileSync(join(d, "src/file.ts"), "export const f = 1;\n", "utf8");
      writeFileSync(
        join(d, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: {
            paths: {
              "@/*": ["other/*"] // points to other, which does not exist
            }
          }
        }),
        "utf8"
      );
      writeFileSync(join(d, "main.ts"), "import { f } from '@/file';\n", "utf8");
      const r = runGate(d);
      const viols = r.json?.violations || [];
      const ok = r.status === 1 && viols.some((v: any) => v.ruleId === "ASTESIA-000");
      record("IR-42", "Explicit @/ in paths overrides src/ fallback and triggers 000 on missing", ok, JSON.stringify(viols));
    }
  } finally {
    try {
      rmSync(baseTmp, { recursive: true, force: true });
    } catch {}
  }

  return { total: passed + failed, passed, failed, known_gaps: 0, errors };
}

if (import.meta.main) {
  const result = runImportResolutionSuite();
  console.log(`Import Resolution Suite: ${result.passed}/${result.total} passed (${result.failed} failed)`);
  if (result.errors.length > 0) {
    console.error(result.errors.join("\n"));
    process.exit(1);
  }
}
