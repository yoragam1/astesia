import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

export function runConfigImportsSuite(
  customGatePath?: string,
  customTmpDir?: string
): { total: number; passed: number; failed: number; known_gaps: number; errors: string[] } {
  const gatePath = customGatePath || resolve(__dirname, "../astesia-gate.ts");
  const rulesPath = resolve(__dirname, "../anti-patterns.json");
  const baseTmp = customTmpDir || resolve(__dirname, "../../../.astesia/audit/tmp/config-imp-" + Date.now());
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
    // CI-01: Valid imports.alias resolves import successfully
    {
      const d = join(baseTmp, "ci01");
      mkdirSync(join(d, "src/features"), { recursive: true });
      writeFileSync(join(d, "src/features/auth.ts"), "export const auth = 1;\n", "utf8");
      writeFileSync(join(d, "main.ts"), "import { auth } from '@features/auth';\n", "utf8");
      mkdirSync(join(d, ".astesia"), { recursive: true });
      writeFileSync(
        join(d, ".astesia/gate-config.json"),
        JSON.stringify({
          schema: 1,
          imports: {
            alias: [
              {
                prefix: "@features/",
                target: "src/features",
                reason: "Internal feature modules alias mapping for mono"
              }
            ]
          }
        }),
        "utf8"
      );
      const r = runGate(d, ["--json"]);
      const viols = r.json?.violations || [];
      const ok = r.status === 0 && viols.length === 0;
      record("CI-01", "Valid imports.alias resolves module import", ok, JSON.stringify(viols));
    }

    // CI-02: Valid imports.virtual skips virtual module without violation
    {
      const d = join(baseTmp, "ci02");
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "main.ts"), "import manifest from 'my-plugin:manifest';\n", "utf8");
      mkdirSync(join(d, ".astesia"), { recursive: true });
      writeFileSync(
        join(d, ".astesia/gate-config.json"),
        JSON.stringify({
          schema: 1,
          imports: {
            virtual: [
              {
                prefix: "my-plugin:",
                reason: "Vite custom plugin injected virtual module manifest"
              }
            ]
          }
        }),
        "utf8"
      );
      const r = runGate(d, ["--json"]);
      const viols = r.json?.violations || [];
      const ok = r.status === 0 && viols.length === 0;
      record("CI-02", "Valid imports.virtual skips virtual module", ok, JSON.stringify(viols));
    }

    // CI-03: Prefix starts with ./ -> exit 2
    {
      const d = join(baseTmp, "ci03");
      mkdirSync(d, { recursive: true });
      mkdirSync(join(d, ".astesia"), { recursive: true });
      writeFileSync(
        join(d, ".astesia/gate-config.json"),
        JSON.stringify({
          schema: 1,
          imports: {
            alias: [{ prefix: "./relative", target: "src", reason: "Attempting disable rule relative" }]
          }
        }),
        "utf8"
      );
      const r = runGate(d);
      const ok = r.status === 2;
      record("CI-03", "Prefix starting with ./ exits 2", ok, `status=${r.status}, stderr=${r.stderr}`);
    }

    // CI-04: Prefix starts with ../ -> exit 2
    {
      const d = join(baseTmp, "ci04");
      mkdirSync(d, { recursive: true });
      mkdirSync(join(d, ".astesia"), { recursive: true });
      writeFileSync(
        join(d, ".astesia/gate-config.json"),
        JSON.stringify({
          schema: 1,
          imports: {
            alias: [{ prefix: "../parent", target: "src", reason: "Attempting disable rule parent" }]
          }
        }),
        "utf8"
      );
      const r = runGate(d);
      const ok = r.status === 2;
      record("CI-04", "Prefix starting with ../ exits 2", ok, `status=${r.status}`);
    }

    // CI-05: Prefix starts with / -> exit 2
    {
      const d = join(baseTmp, "ci05");
      mkdirSync(d, { recursive: true });
      mkdirSync(join(d, ".astesia"), { recursive: true });
      writeFileSync(
        join(d, ".astesia/gate-config.json"),
        JSON.stringify({
          schema: 1,
          imports: {
            virtual: [{ prefix: "/root", reason: "Attempting disable rule slash prefix" }]
          }
        }),
        "utf8"
      );
      const r = runGate(d);
      const ok = r.status === 2;
      record("CI-05", "Prefix starting with / exits 2", ok, `status=${r.status}`);
    }

    // CI-06: Prefix starts with .. -> exit 2
    {
      const d = join(baseTmp, "ci06");
      mkdirSync(d, { recursive: true });
      mkdirSync(join(d, ".astesia"), { recursive: true });
      writeFileSync(
        join(d, ".astesia/gate-config.json"),
        JSON.stringify({
          schema: 1,
          imports: {
            alias: [{ prefix: "..dotdot", target: "src", reason: "Attempting disable rule dotdot prefix" }]
          }
        }),
        "utf8"
      );
      const r = runGate(d);
      const ok = r.status === 2;
      record("CI-06", "Prefix starting with .. exits 2", ok, `status=${r.status}`);
    }

    // CI-07: Prefix is single dot '.' -> exit 2
    {
      const d = join(baseTmp, "ci07");
      mkdirSync(d, { recursive: true });
      mkdirSync(join(d, ".astesia"), { recursive: true });
      writeFileSync(
        join(d, ".astesia/gate-config.json"),
        JSON.stringify({
          schema: 1,
          imports: {
            virtual: [{ prefix: ".", reason: "Attempting disable rule single dot prefix" }]
          }
        }),
        "utf8"
      );
      const r = runGate(d);
      const ok = r.status === 2;
      record("CI-07", "Prefix '.' exits 2", ok, `status=${r.status}`);
    }

    // CI-08: Prefix length < 3 chars -> exit 2
    {
      const d = join(baseTmp, "ci08");
      mkdirSync(d, { recursive: true });
      mkdirSync(join(d, ".astesia"), { recursive: true });
      writeFileSync(
        join(d, ".astesia/gate-config.json"),
        JSON.stringify({
          schema: 1,
          imports: {
            alias: [{ prefix: "ab", target: "src", reason: "Short prefix under 3 chars testing" }]
          }
        }),
        "utf8"
      );
      const r = runGate(d);
      const ok = r.status === 2;
      record("CI-08", "Prefix < 3 characters exits 2", ok, `status=${r.status}`);
    }

    // CI-09: Reason < 15 chars -> exit 2
    {
      const d = join(baseTmp, "ci09");
      mkdirSync(d, { recursive: true });
      mkdirSync(join(d, ".astesia"), { recursive: true });
      writeFileSync(
        join(d, ".astesia/gate-config.json"),
        JSON.stringify({
          schema: 1,
          imports: {
            alias: [{ prefix: "@foo/", target: "src/foo", reason: "too short" }]
          }
        }),
        "utf8"
      );
      const r = runGate(d);
      const ok = r.status === 2;
      record("CI-09", "Reason < 15 characters exits 2", ok, `status=${r.status}`);
    }

    // CI-10: Target contains .. -> exit 2
    {
      const d = join(baseTmp, "ci10");
      mkdirSync(d, { recursive: true });
      mkdirSync(join(d, ".astesia"), { recursive: true });
      writeFileSync(
        join(d, ".astesia/gate-config.json"),
        JSON.stringify({
          schema: 1,
          imports: {
            alias: [{ prefix: "@out/", target: "../outside", reason: "Target escaping repository root boundary" }]
          }
        }),
        "utf8"
      );
      const r = runGate(d);
      const ok = r.status === 2;
      record("CI-10", "Target containing .. exits 2", ok, `status=${r.status}`);
    }

    // CI-11: Target is absolute path -> exit 2
    {
      const d = join(baseTmp, "ci11");
      mkdirSync(d, { recursive: true });
      mkdirSync(join(d, ".astesia"), { recursive: true });
      writeFileSync(
        join(d, ".astesia/gate-config.json"),
        JSON.stringify({
          schema: 1,
          imports: {
            alias: [{ prefix: "@abs/", target: "/etc/passwd", reason: "Target pointing to absolute filesystem path" }]
          }
        }),
        "utf8"
      );
      const r = runGate(d);
      const ok = r.status === 2;
      record("CI-11", "Absolute target path exits 2", ok, `status=${r.status}`);
    }

    // CI-12: Target missing from alias entry -> exit 2
    {
      const d = join(baseTmp, "ci12");
      mkdirSync(d, { recursive: true });
      mkdirSync(join(d, ".astesia"), { recursive: true });
      writeFileSync(
        join(d, ".astesia/gate-config.json"),
        JSON.stringify({
          schema: 1,
          imports: {
            alias: [{ prefix: "@foo/", reason: "Missing target attribute in alias definition" }]
          }
        }),
        "utf8"
      );
      const r = runGate(d);
      const ok = r.status === 2;
      record("CI-12", "Alias missing target exits 2", ok, `status=${r.status}`);
    }

    // CI-13: imports.alias not an array -> exit 2
    {
      const d = join(baseTmp, "ci13");
      mkdirSync(d, { recursive: true });
      mkdirSync(join(d, ".astesia"), { recursive: true });
      writeFileSync(
        join(d, ".astesia/gate-config.json"),
        JSON.stringify({
          schema: 1,
          imports: {
            alias: "not-an-array"
          }
        }),
        "utf8"
      );
      const r = runGate(d);
      const ok = r.status === 2;
      record("CI-13", "imports.alias non-array exits 2", ok, `status=${r.status}`);
    }

    // CI-14: imports.virtual not an array -> exit 2
    {
      const d = join(baseTmp, "ci14");
      mkdirSync(d, { recursive: true });
      mkdirSync(join(d, ".astesia"), { recursive: true });
      writeFileSync(
        join(d, ".astesia/gate-config.json"),
        JSON.stringify({
          schema: 1,
          imports: {
            virtual: 123
          }
        }),
        "utf8"
      );
      const r = runGate(d);
      const ok = r.status === 2;
      record("CI-14", "imports.virtual non-array exits 2", ok, `status=${r.status}`);
    }

    // CI-15: Baseline ratchet: imports_declared increases -> exit 1
    {
      const d = join(baseTmp, "ci15");
      mkdirSync(d, { recursive: true });
      mkdirSync(join(d, ".astesia"), { recursive: true });
      writeFileSync(
        join(d, ".astesia/gate-config.json"),
        JSON.stringify({
          schema: 1,
          imports: {
            alias: [{ prefix: "@pkg/", target: "src/pkg", reason: "Valid package mapping for internal tools" }]
          }
        }),
        "utf8"
      );
      const baseline = {
        schema: 1,
        generated_at: new Date().toISOString(),
        counters: {
          debt_markers: 0,
          suppressions: 0,
          files_excluded: 0,
          desync_files: 0,
          imports_declared: 0
        },
        violations: {}
      };
      writeFileSync(join(d, ".astesia-baseline.json"), JSON.stringify(baseline, null, 2), "utf8");
      const r = runGate(d, ["--baseline", join(d, ".astesia-baseline.json")]);
      const ok = r.status === 1;
      record("CI-15", "Baseline ratchet: imports_declared increase exits 1", ok, `status=${r.status}`);
    }

    // CI-16: Updating baseline with new declared import requires --allow-raise
    {
      const d = join(baseTmp, "ci16");
      mkdirSync(d, { recursive: true });
      mkdirSync(join(d, ".astesia"), { recursive: true });
      writeFileSync(
        join(d, ".astesia/gate-config.json"),
        JSON.stringify({
          schema: 1,
          imports: {
            alias: [{ prefix: "@pkg/", target: "src/pkg", reason: "Valid package mapping for internal tools" }]
          }
        }),
        "utf8"
      );
      const baseline = {
        schema: 1,
        generated_at: new Date().toISOString(),
        counters: {
          debt_markers: 0,
          suppressions: 0,
          files_excluded: 0,
          desync_files: 0,
          imports_declared: 0
        },
        violations: {}
      };
      writeFileSync(join(d, ".astesia-baseline.json"), JSON.stringify(baseline, null, 2), "utf8");
      const r = runGate(d, ["--update-baseline", join(d, ".astesia-baseline.json")]);
      const ok = r.status === 1;
      record("CI-16", "--update-baseline with imports_declared increase without --allow-raise exits 1", ok, `status=${r.status}`);
    }

    // CI-17: --update-baseline with --allow-raise raises imports_declared
    {
      const d = join(baseTmp, "ci17");
      mkdirSync(d, { recursive: true });
      mkdirSync(join(d, ".astesia"), { recursive: true });
      writeFileSync(
        join(d, ".astesia/gate-config.json"),
        JSON.stringify({
          schema: 1,
          imports: {
            alias: [{ prefix: "@pkg/", target: "src/pkg", reason: "Valid package mapping for internal tools" }]
          }
        }),
        "utf8"
      );
      const baseline = {
        schema: 1,
        generated_at: new Date().toISOString(),
        counters: {
          debt_markers: 0,
          suppressions: 0,
          files_excluded: 0,
          desync_files: 0,
          imports_declared: 0
        },
        violations: {}
      };
      writeFileSync(join(d, ".astesia-baseline.json"), JSON.stringify(baseline, null, 2), "utf8");
      const r = runGate(d, [
        "--update-baseline", join(d, ".astesia-baseline.json"),
        "--allow-raise",
        "--reason", "Adding legitimate module alias mapping in config"
      ]);
      let saved: any = null;
      try {
        saved = JSON.parse(require("node:fs").readFileSync(join(d, ".astesia-baseline.json"), "utf8"));
      } catch {}
      const ok = r.status === 0 && saved?.counters?.imports_declared === 1;
      record("CI-17", "--allow-raise raises imports_declared in baseline", ok, `status=${r.status}, saved=${JSON.stringify(saved?.counters)}`);
    }

    // CI-18: Legacy baseline without imports_declared treated as 0
    {
      const d = join(baseTmp, "ci18");
      mkdirSync(d, { recursive: true });
      mkdirSync(join(d, ".astesia"), { recursive: true });
      writeFileSync(
        join(d, ".astesia/gate-config.json"),
        JSON.stringify({
          schema: 1,
          imports: {
            virtual: [{ prefix: "custom-v:", reason: "Custom framework virtual module provider" }]
          }
        }),
        "utf8"
      );
      const legacyBaseline = {
        schema: 1,
        generated_at: new Date().toISOString(),
        counters: {
          debt_markers: 0,
          suppressions: 0,
          files_excluded: 0,
          desync_files: 0
        },
        violations: {}
      };
      writeFileSync(join(d, ".astesia-baseline.json"), JSON.stringify(legacyBaseline, null, 2), "utf8");
      const r = runGate(d, ["--baseline", join(d, ".astesia-baseline.json")]);
      const ok = r.status === 1;
      record("CI-18", "Legacy baseline without imports_declared defaults to 0 and regresses on new imports", ok, `status=${r.status}`);
    }
  } finally {
    try {
      rmSync(baseTmp, { recursive: true, force: true });
    } catch {}
  }

  return { total: passed + failed, passed, failed, known_gaps: 0, errors };
}

if (import.meta.main) {
  const result = runConfigImportsSuite();
  console.log(`Config Imports Suite: ${result.passed}/${result.total} passed (${result.failed} failed)`);
  if (result.errors.length > 0) {
    console.error(result.errors.join("\n"));
    process.exit(1);
  }
}
