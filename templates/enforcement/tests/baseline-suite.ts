/**
 * templates/enforcement/tests/baseline-suite.ts
 * 25 test scenarios for baseline ratchet, --baseline, --update-baseline, and --allow-raise.
 */
import { writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

export interface BaselineScenarioResult {
  id: string;
  description: string;
  passed: boolean;
  expectedExit: number;
  actualExit: number;
  message?: string;
}

export function runBaselineSuite(
  gatePath: string,
  rulesPath: string,
  workDir: string
): { total: number; passed: number; failed: number; results: BaselineScenarioResult[] } {
  const absWorkDir = resolve(workDir);
  mkdirSync(absWorkDir, { recursive: true });

  const absGate = resolve(gatePath);
  const absRules = resolve(rulesPath);
  const results: BaselineScenarioResult[] = [];
  let passedCount = 0;

  function runGate(args: string[], cwd: string = absWorkDir) {
    const res = spawnSync("bun", [absGate, ...args], {
      cwd,
      encoding: "utf8"
    });
    return { status: res.status ?? -1, stdout: res.stdout, stderr: res.stderr };
  }

  // Setup sample test environment
  const envDir = join(absWorkDir, "sample-repo");
  mkdirSync(envDir, { recursive: true });
  writeFileSync(join(envDir, "query.ts"), "const q = 'SELECT * FROM users';\n", "utf8");

  // b01: Valid baseline format
  {
    const bFile = join(absWorkDir, "b01-baseline.json");
    writeFileSync(
      bFile,
      JSON.stringify(
        {
          schema: 1,
          violations: { "ASTESIA-002": { "query.ts": 1 } },
          counters: { debt_markers: 0, suppressions: 0, files_excluded: 0, desync_files: 0 },
          coverage: { files_scanned: 1, min_ratio: 0.9 },
          history: []
        },
        null,
        2
      )
    );
    const r = runGate(["--root", envDir, "--rules", absRules, "--baseline", bFile]);
    const ok = r.status === 0;
    if (ok) passedCount++;
    results.push({ id: "b01", description: "Valid baseline JSON format", passed: ok, expectedExit: 0, actualExit: r.status });
  }

  // b02: Invalid JSON in baseline (exit 2)
  {
    const bFile = join(absWorkDir, "b02-baseline.json");
    writeFileSync(bFile, "{ invalid json", "utf8");
    const r = runGate(["--root", envDir, "--rules", absRules, "--baseline", bFile]);
    const ok = r.status === 2;
    if (ok) passedCount++;
    results.push({ id: "b02", description: "Invalid JSON in baseline (exit 2)", passed: ok, expectedExit: 2, actualExit: r.status });
  }

  // b03: Missing version/schema in baseline (exit 2)
  {
    const bFile = join(absWorkDir, "b03-baseline.json");
    writeFileSync(bFile, JSON.stringify({ violations: {} }), "utf8");
    const r = runGate(["--root", envDir, "--rules", absRules, "--baseline", bFile]);
    const ok = r.status === 2;
    if (ok) passedCount++;
    results.push({ id: "b03", description: "Missing version/schema in baseline (exit 2)", passed: ok, expectedExit: 2, actualExit: r.status });
  }

  // b04: Path outside root in baseline (exit 2)
  {
    const bFile = join(absWorkDir, "b04-baseline.json");
    writeFileSync(
      bFile,
      JSON.stringify({
        schema: 1,
        violations: { "ASTESIA-002": { "../outside.ts": 1 } },
        counters: { debt_markers: 0, suppressions: 0, files_excluded: 0, desync_files: 0 },
        coverage: { files_scanned: 1, min_ratio: 0.9 }
      }),
      "utf8"
    );
    const r = runGate(["--root", envDir, "--rules", absRules, "--baseline", bFile]);
    const ok = r.status === 2;
    if (ok) passedCount++;
    results.push({ id: "b04", description: "Path outside root in baseline (exit 2)", passed: ok, expectedExit: 2, actualExit: r.status });
  }

  // b05: Unknown rule ID in baseline (exit 2)
  {
    const bFile = join(absWorkDir, "b05-baseline.json");
    writeFileSync(
      bFile,
      JSON.stringify({
        schema: 1,
        violations: { "ASTESIA-999": { "query.ts": 1 } },
        counters: { debt_markers: 0, suppressions: 0, files_excluded: 0, desync_files: 0 },
        coverage: { files_scanned: 1, min_ratio: 0.9 }
      }),
      "utf8"
    );
    const r = runGate(["--root", envDir, "--rules", absRules, "--baseline", bFile]);
    const ok = r.status === 2;
    if (ok) passedCount++;
    results.push({ id: "b05", description: "Unknown rule ID in baseline (exit 2)", passed: ok, expectedExit: 2, actualExit: r.status });
  }

  // b06: NEVER_BASELINE ASTESIA-000 rejected in --update-baseline (exit 1)
  {
    const dir = join(absWorkDir, "b06-dir");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "bad.ts"), "import { ghost } from './phantom-module';\n", "utf8");
    const bFile = join(dir, "baseline.json");
    const r = runGate(["--root", dir, "--rules", absRules, "--update-baseline", "--baseline", bFile]);
    const ok = r.status === 1;
    if (ok) passedCount++;
    results.push({ id: "b06", description: "NEVER_BASELINE ASTESIA-000 rejected in --update-baseline (exit 1)", passed: ok, expectedExit: 1, actualExit: r.status });
  }

  // b07: NEVER_BASELINE ASTESIA-004 rejected in --update-baseline (exit 1)
  {
    const dir = join(absWorkDir, "b07-dir");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "bad.ts"), "const apiKey = 'sk_live_1234567890123456';\n", "utf8");
    const bFile = join(dir, "baseline.json");
    const r = runGate(["--root", dir, "--rules", absRules, "--update-baseline", "--baseline", bFile]);
    const ok = r.status === 1;
    if (ok) passedCount++;
    results.push({ id: "b07", description: "NEVER_BASELINE ASTESIA-004 rejected in --update-baseline (exit 1)", passed: ok, expectedExit: 1, actualExit: r.status });
  }

  // b08: NEVER_BASELINE ASTESIA-010 rejected in --update-baseline (exit 1)
  {
    const dir = join(absWorkDir, "b08-dir");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "docker-compose.yml"), "services:\n  app:\n    environment:\n      - DB_PASSWORD=secret12345678\n", "utf8");
    const bFile = join(dir, "baseline.json");
    const r = runGate(["--root", dir, "--rules", absRules, "--update-baseline", "--baseline", bFile]);
    const ok = r.status === 1;
    if (ok) passedCount++;
    results.push({ id: "b08", description: "NEVER_BASELINE ASTESIA-010 rejected in --update-baseline (exit 1)", passed: ok, expectedExit: 1, actualExit: r.status });
  }

  // b09: Code with ASTESIA-000 always fails with --baseline (exit 1)
  {
    const dir = join(absWorkDir, "b09-dir");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "bad.ts"), "import { ghost } from './phantom-module';\n", "utf8");
    const bFile = join(dir, "baseline.json");
    writeFileSync(bFile, JSON.stringify({ schema: 1, violations: {}, counters: { debt_markers: 0, suppressions: 0, files_excluded: 0, desync_files: 0 }, coverage: { files_scanned: 1, min_ratio: 0.9 } }), "utf8");
    const r = runGate(["--root", dir, "--rules", absRules, "--baseline", bFile]);
    const ok = r.status === 1;
    if (ok) passedCount++;
    results.push({ id: "b09", description: "Code with ASTESIA-000 always fails with --baseline (exit 1)", passed: ok, expectedExit: 1, actualExit: r.status });
  }

  // b10: Code with ASTESIA-004 always fails with --baseline (exit 1)
  {
    const dir = join(absWorkDir, "b10-dir");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "bad.ts"), "const apiKey = 'sk_live_1234567890123456';\n", "utf8");
    const bFile = join(dir, "baseline.json");
    writeFileSync(bFile, JSON.stringify({ schema: 1, violations: {}, counters: { debt_markers: 0, suppressions: 0, files_excluded: 0, desync_files: 0 }, coverage: { files_scanned: 1, min_ratio: 0.9 } }), "utf8");
    const r = runGate(["--root", dir, "--rules", absRules, "--baseline", bFile]);
    const ok = r.status === 1;
    if (ok) passedCount++;
    results.push({ id: "b10", description: "Code with ASTESIA-004 always fails with --baseline (exit 1)", passed: ok, expectedExit: 1, actualExit: r.status });
  }

  // b11: Baseline matches violations exactly -> exit 0
  {
    const bFile = join(absWorkDir, "b11-baseline.json");
    writeFileSync(
      bFile,
      JSON.stringify({
        schema: 1,
        violations: { "ASTESIA-002": { "query.ts": 1 } },
        counters: { debt_markers: 0, suppressions: 0, files_excluded: 0, desync_files: 0 },
        coverage: { files_scanned: 1, min_ratio: 0.9 }
      }),
      "utf8"
    );
    const r = runGate(["--root", envDir, "--rules", absRules, "--baseline", bFile]);
    const ok = r.status === 0;
    if (ok) passedCount++;
    results.push({ id: "b11", description: "Baseline matches violations exactly (exit 0)", passed: ok, expectedExit: 0, actualExit: r.status });
  }

  // b12: Baseline has violation that is now fixed -> exit 0 (ratchet allows improvement)
  {
    const dir = join(absWorkDir, "b12-dir");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "query.ts"), "const q = 'SELECT id, name FROM users';\n", "utf8");
    const bFile = join(dir, "baseline.json");
    writeFileSync(
      bFile,
      JSON.stringify({
        schema: 1,
        violations: { "ASTESIA-002": { "query.ts": 1 } },
        counters: { debt_markers: 0, suppressions: 0, files_excluded: 0, desync_files: 0 },
        coverage: { files_scanned: 1, min_ratio: 0.9 }
      }),
      "utf8"
    );
    const r = runGate(["--root", dir, "--rules", absRules, "--baseline", bFile]);
    const ok = r.status === 0;
    if (ok) passedCount++;
    results.push({ id: "b12", description: "Baseline has fixed violation -> exit 0 (tightenable)", passed: ok, expectedExit: 0, actualExit: r.status });
  }

  // b13: Baseline with 2 files, 1 file fixed -> exit 0
  {
    const dir = join(absWorkDir, "b13-dir");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "f1.ts"), "const q1 = 'SELECT id FROM users';\n", "utf8");
    writeFileSync(join(dir, "f2.ts"), "const q2 = 'SELECT * FROM orders';\n", "utf8");
    const bFile = join(dir, "baseline.json");
    writeFileSync(
      bFile,
      JSON.stringify({
        schema: 1,
        violations: { "ASTESIA-002": { "f1.ts": 1, "f2.ts": 1 } },
        counters: { debt_markers: 0, suppressions: 0, files_excluded: 0, desync_files: 0 },
        coverage: { files_scanned: 2, min_ratio: 0.9 }
      }),
      "utf8"
    );
    const r = runGate(["--root", dir, "--rules", absRules, "--baseline", bFile]);
    const ok = r.status === 0;
    if (ok) passedCount++;
    results.push({ id: "b13", description: "Baseline with 2 files, 1 fixed -> exit 0", passed: ok, expectedExit: 0, actualExit: r.status });
  }

  // b14: Coverage drop detected when scanned files drop below ratio -> exit 1
  {
    const dir = join(absWorkDir, "b14-dir");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "f1.ts"), "export const a = 1;\n", "utf8");
    const bFile = join(dir, "baseline.json");
    writeFileSync(
      bFile,
      JSON.stringify({
        schema: 1,
        violations: {},
        counters: { debt_markers: 0, suppressions: 0, files_excluded: 0, desync_files: 0 },
        coverage: { files_scanned: 10, min_ratio: 0.9 }
      }),
      "utf8"
    );
    const r = runGate(["--root", dir, "--rules", absRules, "--baseline", bFile]);
    const ok = r.status === 1;
    if (ok) passedCount++;
    results.push({ id: "b14", description: "Coverage drop below min_ratio -> regression (exit 1)", passed: ok, expectedExit: 1, actualExit: r.status });
  }

  // b15: Baseline tightenable notice reported in stdout
  {
    const dir = join(absWorkDir, "b15-dir");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "clean.ts"), "const q = 'SELECT id FROM users';\n", "utf8");
    const bFile = join(dir, "baseline.json");
    writeFileSync(
      bFile,
      JSON.stringify({
        schema: 1,
        violations: { "ASTESIA-002": { "clean.ts": 1 } },
        counters: { debt_markers: 0, suppressions: 0, files_excluded: 0, desync_files: 0 },
        coverage: { files_scanned: 1, min_ratio: 0.9 }
      }),
      "utf8"
    );
    const r = runGate(["--root", dir, "--rules", absRules, "--baseline", bFile]);
    const ok = r.status === 0 && r.stdout.includes("baseline can be tightened");
    if (ok) passedCount++;
    results.push({ id: "b15", description: "Tightenable notice in stdout when violation removed", passed: ok, expectedExit: 0, actualExit: r.status });
  }

  // b16: New violation in same file -> exit 1
  {
    const dir = join(absWorkDir, "b16-dir");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "q.ts"), "const q1 = 'SELECT * FROM users';\nconst q2 = 'SELECT * FROM orders';\n", "utf8");
    const bFile = join(dir, "baseline.json");
    writeFileSync(
      bFile,
      JSON.stringify({
        schema: 1,
        violations: { "ASTESIA-002": { "q.ts": 1 } },
        counters: { debt_markers: 0, suppressions: 0, files_excluded: 0, desync_files: 0 },
        coverage: { files_scanned: 1, min_ratio: 0.9 }
      }),
      "utf8"
    );
    const r = runGate(["--root", dir, "--rules", absRules, "--baseline", bFile]);
    const ok = r.status === 1;
    if (ok) passedCount++;
    results.push({ id: "b16", description: "New violation in same file -> exit 1", passed: ok, expectedExit: 1, actualExit: r.status });
  }

  // b17: New violation in new file -> exit 1
  {
    const dir = join(absWorkDir, "b17-dir");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "f1.ts"), "const q1 = 'SELECT * FROM users';\n", "utf8");
    writeFileSync(join(dir, "f2.ts"), "const q2 = 'SELECT * FROM orders';\n", "utf8");
    const bFile = join(dir, "baseline.json");
    writeFileSync(
      bFile,
      JSON.stringify({
        schema: 1,
        violations: { "ASTESIA-002": { "f1.ts": 1 } },
        counters: { debt_markers: 0, suppressions: 0, files_excluded: 0, desync_files: 0 },
        coverage: { files_scanned: 2, min_ratio: 0.9 }
      }),
      "utf8"
    );
    const r = runGate(["--root", dir, "--rules", absRules, "--baseline", bFile]);
    const ok = r.status === 1;
    if (ok) passedCount++;
    results.push({ id: "b17", description: "New violation in new file -> exit 1", passed: ok, expectedExit: 1, actualExit: r.status });
  }

  // b18: Violation count increases from 1 to 2 -> exit 1
  {
    const dir = join(absWorkDir, "b18-dir");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "items.ts"), "const a = 'SELECT * FROM a';\nconst b = 'SELECT * FROM b';\n", "utf8");
    const bFile = join(dir, "baseline.json");
    writeFileSync(
      bFile,
      JSON.stringify({
        schema: 1,
        violations: { "ASTESIA-002": { "items.ts": 1 } },
        counters: { debt_markers: 0, suppressions: 0, files_excluded: 0, desync_files: 0 },
        coverage: { files_scanned: 1, min_ratio: 0.9 }
      }),
      "utf8"
    );
    const r = runGate(["--root", dir, "--rules", absRules, "--baseline", bFile]);
    const ok = r.status === 1;
    if (ok) passedCount++;
    results.push({ id: "b18", description: "Violation count increases from 1 to 2 -> exit 1", passed: ok, expectedExit: 1, actualExit: r.status });
  }

  // b19: New rule violation in existing file -> exit 1
  {
    const dir = join(absWorkDir, "b19-dir");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "multi.ts"), "const q = 'SELECT * FROM users';\nconsole.log(q);\n", "utf8");
    const bFile = join(dir, "baseline.json");
    writeFileSync(
      bFile,
      JSON.stringify({
        schema: 1,
        violations: { "ASTESIA-002": { "multi.ts": 1 } },
        counters: { debt_markers: 0, suppressions: 0, files_excluded: 0, desync_files: 0 },
        coverage: { files_scanned: 1, min_ratio: 0.9 }
      }),
      "utf8"
    );
    const r = runGate(["--root", dir, "--rules", absRules, "--baseline", bFile]);
    const ok = r.status === 1;
    if (ok) passedCount++;
    results.push({ id: "b19", description: "New rule violation in existing file -> exit 1", passed: ok, expectedExit: 1, actualExit: r.status });
  }

  // b20: --update-baseline creates valid baseline file
  {
    const dir = join(absWorkDir, "b20-dir");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "query.ts"), "const q = 'SELECT * FROM users';\n", "utf8");
    const bFile = join(dir, "baseline.json");
    const r = runGate(["--root", dir, "--rules", absRules, "--update-baseline", "--baseline", bFile]);
    const exists = existsSync(bFile);
    const ok = r.status === 0 && exists;
    if (ok) passedCount++;
    results.push({ id: "b20", description: "--update-baseline creates baseline file (exit 0)", passed: ok, expectedExit: 0, actualExit: r.status });
  }

  // b21: Generated baseline has deterministically sorted keys and 2-space indentation
  {
    const dir = join(absWorkDir, "b21-dir");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "z.ts"), "console.log('z');\n", "utf8");
    writeFileSync(join(dir, "a.ts"), "console.log('a');\n", "utf8");
    const bFile = join(dir, "baseline.json");
    runGate(["--root", dir, "--rules", absRules, "--update-baseline", "--baseline", bFile]);
    const raw = readFileSync(bFile, "utf8");
    const parsed = JSON.parse(raw);
    const fileKeys = Object.keys(parsed.violations?.["ASTESIA-006"] || {});
    const isSorted = fileKeys.length === 2 && fileKeys[0] === "a.ts" && fileKeys[1] === "z.ts";
    const has2Spaces = raw.includes('  "schema": 1');
    const ok = isSorted && has2Spaces;
    if (ok) passedCount++;
    results.push({ id: "b21", description: "Generated baseline has sorted keys and 2-space indent", passed: ok, expectedExit: 0, actualExit: 0 });
  }

  // b22: File deleted from codebase is removed from updated baseline
  {
    const dir = join(absWorkDir, "b22-dir");
    mkdirSync(dir, { recursive: true });
    const f1 = join(dir, "f1.ts");
    const f2 = join(dir, "f2.ts");
    writeFileSync(f1, "console.log('f1');\n", "utf8");
    writeFileSync(f2, "console.log('f2');\n", "utf8");
    const bFile = join(dir, "baseline.json");
    runGate(["--root", dir, "--rules", absRules, "--update-baseline", "--baseline", bFile]);
    rmSync(f2);
    runGate(["--root", dir, "--rules", absRules, "--update-baseline", "--baseline", bFile]);
    const parsed = JSON.parse(readFileSync(bFile, "utf8"));
    const filesIn006 = Object.keys(parsed.violations?.["ASTESIA-006"] || {});
    const ok = filesIn006.length === 1 && filesIn006[0] === "f1.ts";
    if (ok) passedCount++;
    results.push({ id: "b22", description: "Deleted file removed from updated baseline", passed: ok, expectedExit: 0, actualExit: 0 });
  }

  // b23: --allow-raise without --reason (exit 2)
  {
    const dir = join(absWorkDir, "b23-dir");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "q.ts"), "const q = 'SELECT * FROM users';\n", "utf8");
    const bFile = join(dir, "baseline.json");
    const r = runGate(["--root", dir, "--rules", absRules, "--update-baseline", "--baseline", bFile, "--allow-raise"]);
    const ok = r.status === 2;
    if (ok) passedCount++;
    results.push({ id: "b23", description: "--allow-raise without --reason (exit 2)", passed: ok, expectedExit: 2, actualExit: r.status });
  }

  // b24: --allow-raise with --reason < 15 chars (exit 2)
  {
    const dir = join(absWorkDir, "b24-dir");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "q.ts"), "const q = 'SELECT * FROM users';\n", "utf8");
    const bFile = join(dir, "baseline.json");
    const r = runGate(["--root", dir, "--rules", absRules, "--update-baseline", "--baseline", bFile, "--allow-raise", "--reason", "too short"]);
    const ok = r.status === 2;
    if (ok) passedCount++;
    results.push({ id: "b24", description: "--allow-raise with --reason < 15 chars (exit 2)", passed: ok, expectedExit: 2, actualExit: r.status });
  }

  // b25: --allow-raise with valid reason (>= 15 chars) updates baseline and records history (exit 0)
  {
    const dir = join(absWorkDir, "b25-dir");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "q.ts"), "const q = 'SELECT * FROM users';\n", "utf8");
    const bFile = join(dir, "baseline.json");
    // Initial baseline
    runGate(["--root", dir, "--rules", absRules, "--update-baseline", "--baseline", bFile]);
    // Add second violation in same file
    writeFileSync(join(dir, "q.ts"), "const q1 = 'SELECT * FROM users';\nconst q2 = 'SELECT * FROM orders';\n", "utf8");
    const r = runGate([
      "--root",
      dir,
      "--rules",
      absRules,
      "--update-baseline",
      "--baseline",
      bFile,
      "--allow-raise",
      "--reason",
      "legitimate migration requirement for v2 release"
    ]);
    const ok = r.status === 0;
    const parsed = JSON.parse(readFileSync(bFile, "utf8"));
    const lastHist = parsed.history?.[parsed.history.length - 1];
    const histOk = lastHist?.action === "raise" && lastHist?.reason === "legitimate migration requirement for v2 release";
    const passed = ok && histOk;
    if (passed) passedCount++;
    results.push({ id: "b25", description: "--allow-raise with valid reason raises baseline (exit 0)", passed, expectedExit: 0, actualExit: r.status });
  }

  rmSync(absWorkDir, { recursive: true, force: true });

  return {
    total: results.length,
    passed: passedCount,
    failed: results.length - passedCount,
    results
  };
}
