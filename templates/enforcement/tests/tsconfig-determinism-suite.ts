import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

export function runTsconfigDeterminismSuite(
  customGatePath?: string,
  customTmpDir?: string
): { total: number; passed: number; failed: number; known_gaps: number; errors: string[] } {
  const gatePath = customGatePath || resolve(__dirname, "../astesia-gate.ts");
  const rulesPath = resolve(__dirname, "../anti-patterns.json");
  const baseTmp = customTmpDir || resolve(__dirname, "../../../.astesia/audit/tmp/td-" + Date.now());
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
    const res = spawnSync(process.execPath, [gatePath, "--root", dir, "--rules", rulesPath, ...extraArgs], {
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
    // TD-01: extends to package with node_modules present vs absent -> identical JSON
    {
      const d1 = join(baseTmp, "td01_with_nm");
      const d2 = join(baseTmp, "td01_without_nm");
      mkdirSync(d1, { recursive: true });
      mkdirSync(d2, { recursive: true });

      // create node_modules in d1
      mkdirSync(join(d1, "node_modules/@tsconfig/node18"), { recursive: true });
      writeFileSync(join(d1, "node_modules/@tsconfig/node18/tsconfig.json"), JSON.stringify({ compilerOptions: { paths: { "@pkg/*": ["./src/*"] } } }), "utf8");

      const tsconfig = JSON.stringify({ extends: "@tsconfig/node18/tsconfig.json", compilerOptions: { paths: { "@local/*": ["./local/*"] } } });
      writeFileSync(join(d1, "tsconfig.json"), tsconfig, "utf8");
      writeFileSync(join(d2, "tsconfig.json"), tsconfig, "utf8");

      mkdirSync(join(d1, "local"), { recursive: true });
      mkdirSync(join(d2, "local"), { recursive: true });
      writeFileSync(join(d1, "local/util.ts"), "export const u = 1;\n", "utf8");
      writeFileSync(join(d2, "local/util.ts"), "export const u = 1;\n", "utf8");

      writeFileSync(join(d1, "index.ts"), 'import { u } from "@local/util";\n', "utf8");
      writeFileSync(join(d2, "index.ts"), 'import { u } from "@local/util";\n', "utf8");

      const r1 = runGate(d1, ["--json"]);
      const r2 = runGate(d2, ["--json"]);

      const ok =
        r1.status === r2.status &&
        JSON.stringify(r1.json?.violations) === JSON.stringify(r2.json?.violations) &&
        r1.json?.notices?.tsconfig_unresolved_extends?.length === 1 &&
        r2.json?.notices?.tsconfig_unresolved_extends?.length === 1;
      record("TD-01", "extends to package with node_modules present vs absent is identical", ok, `status1=${r1.status}, status2=${r2.status}`);
    }

    // TD-02: notice tsconfig_unresolved_extends present on package extends
    {
      const d = join(baseTmp, "td02");
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "tsconfig.json"), JSON.stringify({ extends: "@scope/pkg/tsconfig.json" }), "utf8");
      writeFileSync(join(d, "app.ts"), "export const x = 1;\n", "utf8");
      const r = runGate(d, ["--json"]);
      const list = r.json?.notices?.tsconfig_unresolved_extends || [];
      const ok = list.some((item: string) => item.includes("@scope/pkg/tsconfig.json"));
      record("TD-02", "notice tsconfig_unresolved_extends emitted on package extends", ok, JSON.stringify(list));
    }

    // TD-03: alias from unverified package extends emits notice alias_unverified and NO violation
    {
      const d = join(baseTmp, "td03");
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "tsconfig.json"), JSON.stringify({ extends: "@pkg/base" }), "utf8");
      writeFileSync(join(d, "main.ts"), 'import { foo } from "@pkg/components/button";\n', "utf8");
      const r = runGate(d, ["--json"]);
      const viols = r.json?.violations || [];
      const unverified = r.json?.notices?.alias_unverified || [];
      const ok =
        !viols.some((v: any) => v.ruleId === "ASTESIA-000") &&
        unverified.length > 0 &&
        unverified.some((item: string) => item.includes("@pkg/components/button"));
      record("TD-03", "alias from unverified package extends emits alias_unverified notice without violation", ok, JSON.stringify(r.json));
    }

    // TD-04: Relative extends depth 1 works
    {
      const d = join(baseTmp, "td04");
      mkdirSync(join(d, "src"), { recursive: true });
      writeFileSync(join(d, "base.json"), JSON.stringify({ compilerOptions: { paths: { "@rel/*": ["./src/*"] } } }), "utf8");
      writeFileSync(join(d, "tsconfig.json"), JSON.stringify({ extends: "./base.json" }), "utf8");
      writeFileSync(join(d, "src/button.ts"), "export const Btn = 1;\n", "utf8");
      writeFileSync(join(d, "main.ts"), 'import { Btn } from "@rel/button";\n', "utf8");
      const r = runGate(d, ["--json"]);
      const viols = r.json?.violations || [];
      const ok = !viols.some((v: any) => v.ruleId === "ASTESIA-000");
      record("TD-04", "Relative extends depth 1 resolves aliases correctly", ok, JSON.stringify(viols));
    }

    // TD-05: Relative extends depth 2 works
    {
      const d = join(baseTmp, "td05");
      mkdirSync(join(d, "src"), { recursive: true });
      writeFileSync(join(d, "grandparent.json"), JSON.stringify({ compilerOptions: { paths: { "@deep/*": ["./src/*"] } } }), "utf8");
      writeFileSync(join(d, "parent.json"), JSON.stringify({ extends: "./grandparent.json" }), "utf8");
      writeFileSync(join(d, "tsconfig.json"), JSON.stringify({ extends: "./parent.json" }), "utf8");
      writeFileSync(join(d, "src/mod.ts"), "export const M = 1;\n", "utf8");
      writeFileSync(join(d, "main.ts"), 'import { M } from "@deep/mod";\n', "utf8");
      const r = runGate(d, ["--json"]);
      const viols = r.json?.violations || [];
      const ok = !viols.some((v: any) => v.ruleId === "ASTESIA-000");
      record("TD-05", "Relative extends depth 2 resolves aliases correctly", ok, JSON.stringify(viols));
    }

    // TD-06: Relative extends depth 3 works
    {
      const d = join(baseTmp, "td06");
      mkdirSync(join(d, "src"), { recursive: true });
      writeFileSync(join(d, "l1.json"), JSON.stringify({ compilerOptions: { paths: { "@l1/*": ["./src/*"] } } }), "utf8");
      writeFileSync(join(d, "l2.json"), JSON.stringify({ extends: "./l1.json" }), "utf8");
      writeFileSync(join(d, "l3.json"), JSON.stringify({ extends: "./l2.json" }), "utf8");
      writeFileSync(join(d, "tsconfig.json"), JSON.stringify({ extends: "./l3.json" }), "utf8");
      writeFileSync(join(d, "src/l1.ts"), "export const L = 1;\n", "utf8");
      writeFileSync(join(d, "main.ts"), 'import { L } from "@l1/l1";\n', "utf8");
      const r = runGate(d, ["--json"]);
      const viols = r.json?.violations || [];
      const ok = !viols.some((v: any) => v.ruleId === "ASTESIA-000");
      record("TD-06", "Relative extends depth 3 resolves aliases correctly", ok, JSON.stringify(viols));
    }

    // TD-07: Depth limit 3 prevents infinite loop on circular extends
    {
      const d = join(baseTmp, "td07");
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "circA.json"), JSON.stringify({ extends: "./circB.json" }), "utf8");
      writeFileSync(join(d, "circB.json"), JSON.stringify({ extends: "./circA.json" }), "utf8");
      writeFileSync(join(d, "tsconfig.json"), JSON.stringify({ extends: "./circA.json" }), "utf8");
      writeFileSync(join(d, "main.ts"), "export const ok = 1;\n", "utf8");
      const r = runGate(d, ["--json"]);
      const ok = r.status === 0;
      record("TD-07", "Circular extends does not hang and terminates cleanly", ok, `status=${r.status}`);
    }

    // TD-08: Local compilerOptions.paths work correctly
    {
      const d = join(baseTmp, "td08");
      mkdirSync(join(d, "src/components"), { recursive: true });
      writeFileSync(join(d, "tsconfig.json"), JSON.stringify({ compilerOptions: { paths: { "~ui/*": ["./src/components/*"] } } }), "utf8");
      writeFileSync(join(d, "src/components/Card.tsx"), "export const Card = () => null;\n", "utf8");
      writeFileSync(join(d, "app.tsx"), 'import { Card } from "~ui/Card";\n', "utf8");
      const r = runGate(d, ["--json"]);
      const viols = r.json?.violations || [];
      const ok = !viols.some((v: any) => v.ruleId === "ASTESIA-000");
      record("TD-08", "Local paths alias resolves to existing file without violation", ok, JSON.stringify(viols));
    }

    // TD-09: Bogus alias with local paths pointing to non-existent file triggers violation
    {
      const d = join(baseTmp, "td09");
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "tsconfig.json"), JSON.stringify({ compilerOptions: { paths: { "@lib/*": ["./src/lib/*"] } } }), "utf8");
      writeFileSync(join(d, "app.ts"), 'import { Missing } from "@lib/ghost";\n', "utf8");
      const r = runGate(d, ["--json"]);
      const viols = r.json?.violations || [];
      const ok = viols.some((v: any) => v.ruleId === "ASTESIA-000" && v.file.includes("app.ts"));
      record("TD-09", "Bogus alias pointing to missing file triggers ASTESIA-000", ok, JSON.stringify(viols));
    }

    // TD-10: JSONC support (comments, trailing commas)
    {
      const d = join(baseTmp, "td10");
      mkdirSync(join(d, "src/utils"), { recursive: true });
      const jsoncContent = `
      // Root configuration file
      {
        /* Compiler options section */
        "compilerOptions": {
          "baseUrl": ".",
          "paths": {
            "@utils/*": ["./src/utils/*"], // Utility functions
          }, // Trailing comma
        },
      }
      `;
      writeFileSync(join(d, "tsconfig.json"), jsoncContent, "utf8");
      writeFileSync(join(d, "src/utils/math.ts"), "export const add = (a: number, b: number) => a + b;\n", "utf8");
      writeFileSync(join(d, "calc.ts"), 'import { add } from "@utils/math";\n', "utf8");
      const r = runGate(d, ["--json"]);
      const viols = r.json?.violations || [];
      const ok = !viols.some((v: any) => v.ruleId === "ASTESIA-000");
      record("TD-10", "JSONC tsconfig with comments and trailing commas parses cleanly", ok, JSON.stringify(viols));
    }

    // TD-11: Broken tsconfig emits alias_unverified on alias import and NO crash
    {
      const d = join(baseTmp, "td11");
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "tsconfig.json"), '{ "broken": true,, ', "utf8"); // Syntax error
      writeFileSync(join(d, "app.ts"), 'import { X } from "@/services/api";\n', "utf8");
      const r = runGate(d, ["--json"]);
      const unverified = r.json?.notices?.alias_unverified || [];
      const viols = r.json?.violations || [];
      const ok =
        r.status === 0 &&
        !viols.some((v: any) => v.ruleId === "ASTESIA-000") &&
        unverified.some((item: string) => item.includes("@/services/api"));
      record("TD-11", "Broken tsconfig emits alias_unverified and no violation", ok, JSON.stringify(r.json));
    }

    // TD-12: Missing tsconfig handled gracefully with fallback
    {
      const d = join(baseTmp, "td12");
      mkdirSync(join(d, "src"), { recursive: true });
      writeFileSync(join(d, "src/helper.ts"), "export const h = 1;\n", "utf8");
      writeFileSync(join(d, "index.ts"), 'import { h } from "./src/helper";\n', "utf8");
      const r = runGate(d, ["--json"]);
      const viols = r.json?.violations || [];
      const ok = r.status === 0 && !viols.some((v: any) => v.ruleId === "ASTESIA-000");
      record("TD-12", "Missing tsconfig handles standard relative imports without error", ok, JSON.stringify(viols));
    }
  } finally {
    try {
      rmSync(baseTmp, { recursive: true, force: true });
    } catch {}
  }

  return { total: passed + failed, passed, failed, known_gaps: 0, errors };
}

if (import.meta.main) {
  const result = runTsconfigDeterminismSuite();
  console.log(`Tsconfig Determinism Suite: ${result.passed}/${result.total} passed (${result.failed} failed)`);
  if (result.errors.length > 0) {
    console.error(result.errors.join("\n"));
    process.exit(1);
  }
}
