/**
 * templates/enforcement/tests/allowlist-suite.ts
 * Comprehensive test suite for F3 configuration-based allowlist for ASTESIA-004 and ASTESIA-010.
 * 15 distinct scenarios: al01..al15.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

export interface AllowlistScenarioResult {
  id: string;
  name: string;
  passed: boolean;
  expectedExit: number;
  actualExit: number;
  error?: string;
}

export function runAllowlistSuite(gatePath: string, testTmpDir: string): {
  total: number;
  passed: number;
  failed: number;
  results: AllowlistScenarioResult[];
} {
  const suiteDir = join(testTmpDir, `allowlist-${Date.now()}`);
  mkdirSync(suiteDir, { recursive: true });

  const rulesPath = join(suiteDir, "rules.json");
  const rules = {
    rules: [
      {
        id: "ASTESIA-004",
        name: "Hardcoded Secrets",
        severity: "error",
        kind: "line-regex",
        description: "Hardcoded secret detected",
        fix: "Use environment variables",
        origin: "SEC-004"
      },
      {
        id: "ASTESIA-010",
        name: "Sensitive Environment Import",
        severity: "error",
        kind: "line-regex",
        pattern: "import\\s+.*from\\s+['\"].*secret.*['\"]",
        description: "Direct import of secret config",
        fix: "Inject credentials via runtime",
        origin: "SEC-010"
      }
    ]
  };
  writeFileSync(rulesPath, JSON.stringify(rules, null, 2), "utf8");

  function runCase(
    caseId: string,
    configObj: unknown,
    files: Record<string, string>,
    cliArgs: string[] = []
  ) {
    const caseDir = join(suiteDir, caseId);
    mkdirSync(join(caseDir, ".astesia"), { recursive: true });
    writeFileSync(join(caseDir, ".astesia/rules.json"), JSON.stringify(rules, null, 2), "utf8");
    if (configObj !== null) {
      writeFileSync(join(caseDir, ".astesia/gate-config.json"), JSON.stringify(configObj, null, 2), "utf8");
    }
    for (const [rel, content] of Object.entries(files)) {
      const p = join(caseDir, rel);
      mkdirSync(join(p, ".."), { recursive: true });
      writeFileSync(p, content, "utf8");
    }

    const r = spawnSync(
      "bun",
      [gatePath, "--root", caseDir, "--rules", join(caseDir, ".astesia/rules.json"), ...cliArgs],
      { encoding: "utf8" }
    );
    return {
      status: r.status ?? -1,
      stdout: r.stdout || "",
      stderr: r.stderr || ""
    };
  }

  const results: AllowlistScenarioResult[] = [];

  // al01: ASTESIA-004 valid allow entry matches -> violation suppressed
  {
    const res = runCase(
      "al01",
      {
        schema: 1,
        allow: [
          {
            rule: "ASTESIA-004",
            path: "src/creds.ts",
            match: "MOCK_SECRET_KEY_12345",
            reason: "Legacy test credentials for staging test harness"
          }
        ]
      },
      { "src/creds.ts": 'const apiKey = "MOCK_SECRET_KEY_12345";\n' },
      ["--json"]
    );
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(res.stdout); } catch {}
    const passed = res.status === 0 && parsed.errors === 0 && parsed.allowlisted === 1;
    results.push({ id: "al01", name: "ASTESIA-004 valid allow entry matches", passed, expectedExit: 0, actualExit: res.status });
  }

  // al02: ASTESIA-010 valid allow entry matches -> violation suppressed
  {
    const res = runCase(
      "al02",
      {
        schema: 1,
        allow: [
          {
            rule: "ASTESIA-010",
            path: "src/legacy.ts",
            match: "from './secret-config'",
            reason: "Legacy adapter needing direct import for backward compatibility"
          }
        ]
      },
      { "src/legacy.ts": "import { auth } from './secret-config';\n" },
      ["--json"]
    );
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(res.stdout); } catch {}
    const passed = res.status === 0 && parsed.errors === 0 && parsed.allowlisted === 1;
    results.push({ id: "al02", name: "ASTESIA-010 valid allow entry matches", passed, expectedExit: 0, actualExit: res.status });
  }

  // al03: Rule ASTESIA-000 rejected in allowlist -> exit 2
  {
    const res = runCase("al03", {
      schema: 1,
      allow: [{ rule: "ASTESIA-000", path: "src/file.ts", match: "fooBarBaz", reason: "Attempting to bypass relative import rule" }]
    }, { "src/file.ts": "const x = 1;\n" });
    const passed = res.status === 2 && res.stderr.includes("allowlist only permitted for ASTESIA-004 and ASTESIA-010");
    results.push({ id: "al03", name: "Banned rule ASTESIA-000 in allowlist rejected with exit 2", passed, expectedExit: 2, actualExit: res.status });
  }

  // al04: Rule ASTESIA-001 rejected in allowlist -> exit 2
  {
    const res = runCase("al04", {
      schema: 1,
      allow: [{ rule: "ASTESIA-001", path: "src/file.ts", match: "fooBarBaz", reason: "Attempting to bypass layer imports rule" }]
    }, { "src/file.ts": "const x = 1;\n" });
    const passed = res.status === 2 && res.stderr.includes("allowlist only permitted for ASTESIA-004 and ASTESIA-010");
    results.push({ id: "al04", name: "Rule ASTESIA-001 in allowlist rejected with exit 2", passed, expectedExit: 2, actualExit: res.status });
  }

  // al05: Rule ASTESIA-005 rejected in allowlist -> exit 2
  {
    const res = runCase("al05", {
      schema: 1,
      allow: [{ rule: "ASTESIA-005", path: "src/file.ts", match: "fooBarBaz", reason: "Attempting to bypass any keyword rule" }]
    }, { "src/file.ts": "const x = 1;\n" });
    const passed = res.status === 2 && res.stderr.includes("allowlist only permitted for ASTESIA-004 and ASTESIA-010");
    results.push({ id: "al05", name: "Rule ASTESIA-005 in allowlist rejected with exit 2", passed, expectedExit: 2, actualExit: res.status });
  }

  // al06: Wildcard in allow path rejected -> exit 2
  {
    const res = runCase("al06", {
      schema: 1,
      allow: [{ rule: "ASTESIA-004", path: "src/*.ts", match: "secretVal123", reason: "Wildcard path attempt for all files in directory" }]
    }, { "src/a.ts": "const x = 1;\n" });
    const passed = res.status === 2 && res.stderr.includes("without wildcards");
    results.push({ id: "al06", name: "Wildcard in allow path rejected with exit 2", passed, expectedExit: 2, actualExit: res.status });
  }

  // al07: Directory traversal '..' in allow path rejected -> exit 2
  {
    const res = runCase("al07", {
      schema: 1,
      allow: [{ rule: "ASTESIA-004", path: "../outside.ts", match: "secretVal123", reason: "Traversal path attempt outside workspace root" }]
    }, { "src/a.ts": "const x = 1;\n" });
    const passed = res.status === 2 && res.stderr.includes("without wildcards");
    results.push({ id: "al07", name: "Relative traversal in allow path rejected with exit 2", passed, expectedExit: 2, actualExit: res.status });
  }

  // al08: Absolute path in allow path rejected -> exit 2
  {
    const res = runCase("al08", {
      schema: 1,
      allow: [{ rule: "ASTESIA-004", path: "/etc/passwd", match: "secretVal123", reason: "Absolute path attempt in allow configuration" }]
    }, { "src/a.ts": "const x = 1;\n" });
    const passed = res.status === 2 && res.stderr.includes("without wildcards");
    results.push({ id: "al08", name: "Absolute path in allow path rejected with exit 2", passed, expectedExit: 2, actualExit: res.status });
  }

  // al09: Match string < 6 characters rejected -> exit 2
  {
    const res = runCase("al09", {
      schema: 1,
      allow: [{ rule: "ASTESIA-004", path: "src/a.ts", match: "12345", reason: "Match string is shorter than six characters requirement" }]
    }, { "src/a.ts": "const x = 1;\n" });
    const passed = res.status === 2 && res.stderr.includes("match must be at least 6 characters");
    results.push({ id: "al09", name: "Match shorter than 6 characters rejected with exit 2", passed, expectedExit: 2, actualExit: res.status });
  }

  // al10: Reason string < 15 characters rejected -> exit 2
  {
    const res = runCase("al10", {
      schema: 1,
      allow: [{ rule: "ASTESIA-004", path: "src/a.ts", match: "secretVal123", reason: "too short" }]
    }, { "src/a.ts": "const x = 1;\n" });
    const passed = res.status === 2 && res.stderr.includes("reason must be at least 15 characters");
    results.push({ id: "al10", name: "Reason shorter than 15 characters rejected with exit 2", passed, expectedExit: 2, actualExit: res.status });
  }

  // al11: Stale allow entry reported in allow_stale -> exit 0
  {
    const res = runCase("al11", {
      schema: 1,
      allow: [{ rule: "ASTESIA-004", path: "src/nonexistent.ts", match: "secretVal123", reason: "Valid reason for stale allowlist entry" }]
    }, { "src/clean.ts": "const safe = 123;\n" }, ["--json"]);
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(res.stdout); } catch {}
    const isStaleArray = Array.isArray(parsed.allow_stale) && parsed.allow_stale.length === 1;
    const passed = res.status === 0 && isStaleArray && parsed.allowlisted === 0;
    results.push({ id: "al11", name: "Stale allow entry reported in allow_stale with exit 0", passed, expectedExit: 0, actualExit: res.status });
  }

  // al12: Path matches but line does not contain match string -> violation triggers
  {
    const res = runCase("al12", {
      schema: 1,
      allow: [{ rule: "ASTESIA-004", path: "src/creds.ts", match: "DIFFERENT_MOCK_123", reason: "Valid reason for allowlist entry" }]
    }, { "src/creds.ts": 'const apiKey = "REAL_LEAKED_KEY_98765";\n' }, ["--json"]);
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(res.stdout); } catch {}
    const passed = res.status === 1 && parsed.errors === 1 && parsed.allowlisted === 0;
    results.push({ id: "al12", name: "Line mismatch does not suppress violation (exit 1)", passed, expectedExit: 1, actualExit: res.status });
  }

  // al13: Multiple allow entries: one hit and one stale
  {
    const res = runCase("al13", {
      schema: 1,
      allow: [
        { rule: "ASTESIA-004", path: "src/creds.ts", match: "MATCH_ONE_12345", reason: "Valid reason for first entry that matches" },
        { rule: "ASTESIA-010", path: "src/creds.ts", match: "MATCH_TWO_67890", reason: "Valid reason for second entry that is stale" }
      ]
    }, { "src/creds.ts": 'const apiKey = "MATCH_ONE_12345";\n' }, ["--json"]);
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(res.stdout); } catch {}
    const isStaleOne = Array.isArray(parsed.allow_stale) && parsed.allow_stale.length === 1;
    const passed = res.status === 0 && parsed.allowlisted === 1 && isStaleOne;
    results.push({ id: "al13", name: "Multiple entries: one hit, one stale", passed, expectedExit: 0, actualExit: res.status });
  }

  // al14: Baseline regression when allowlisted counter increases without --allow-raise -> exit 1
  {
    const caseDir = join(suiteDir, "al14");
    mkdirSync(join(caseDir, ".astesia"), { recursive: true });
    mkdirSync(join(caseDir, "src"), { recursive: true });
    writeFileSync(join(caseDir, ".astesia/rules.json"), JSON.stringify(rules, null, 2), "utf8");
    writeFileSync(join(caseDir, ".astesia/gate-config.json"), JSON.stringify({
      schema: 1,
      allow: [{ rule: "ASTESIA-004", path: "src/creds.ts", match: "NEW_ALLOW_12345", reason: "New allowlist entry added to config" }]
    }, null, 2), "utf8");
    writeFileSync(join(caseDir, "src/creds.ts"), 'const apiKey = "NEW_ALLOW_12345";\n', "utf8");
    // Old baseline had allowlisted: 0
    writeFileSync(join(caseDir, ".astesia/gate-baseline.json"), JSON.stringify({
      schema: 1,
      violations: {},
      counters: { debt_markers: 0, suppressions: 0, files_excluded: 0, desync_files: 0, allowlisted: 0 },
      coverage: { files_scanned: 1, min_ratio: 0.9 },
      history: []
    }, null, 2), "utf8");

    const r = spawnSync("bun", [
      gatePath,
      "--root", caseDir,
      "--rules", join(caseDir, ".astesia/rules.json"),
      "--baseline", join(caseDir, ".astesia/gate-baseline.json")
    ], { encoding: "utf8" });
    const passed = r.status === 1 && r.stderr.includes("allowlisted increased");
    results.push({ id: "al14", name: "Allowlisted increase without --allow-raise is baseline regression (exit 1)", passed, expectedExit: 1, actualExit: r.status ?? -1 });
  }

  // al15: Baseline update with allowlisted counter increase using --allow-raise -> exit 0
  {
    const caseDir = join(suiteDir, "al15");
    mkdirSync(join(caseDir, ".astesia"), { recursive: true });
    mkdirSync(join(caseDir, "src"), { recursive: true });
    writeFileSync(join(caseDir, ".astesia/rules.json"), JSON.stringify(rules, null, 2), "utf8");
    writeFileSync(join(caseDir, ".astesia/gate-config.json"), JSON.stringify({
      schema: 1,
      allow: [{ rule: "ASTESIA-004", path: "src/creds.ts", match: "NEW_ALLOW_12345", reason: "Legitimate legacy credentials allowlist" }]
    }, null, 2), "utf8");
    writeFileSync(join(caseDir, "src/creds.ts"), 'const apiKey = "NEW_ALLOW_12345";\n', "utf8");
    writeFileSync(join(caseDir, ".astesia/gate-baseline.json"), JSON.stringify({
      schema: 1,
      violations: {},
      counters: { debt_markers: 0, suppressions: 0, files_excluded: 0, desync_files: 0, allowlisted: 0 },
      coverage: { files_scanned: 1, min_ratio: 0.9 },
      history: []
    }, null, 2), "utf8");

    const r = spawnSync("bun", [
      gatePath,
      "--root", caseDir,
      "--rules", join(caseDir, ".astesia/rules.json"),
      "--update-baseline",
      "--allow-raise",
      "--reason", "Legitimate legacy credentials allowlist update"
    ], { encoding: "utf8" });
    const passed = r.status === 0;
    results.push({ id: "al15", name: "Baseline update with allowlisted increase using --allow-raise exits 0", passed, expectedExit: 0, actualExit: r.status ?? -1 });
  }

  // al16: Inline astesia-allow for ASTESIA-010 is banned -> rejected_suppressions incremented and gate exits 1 (VER3-005)
  {
    const caseDir = join(suiteDir, "al16");
    mkdirSync(join(caseDir, ".astesia"), { recursive: true });
    mkdirSync(join(caseDir, "src"), { recursive: true });
    writeFileSync(join(caseDir, ".astesia/rules.json"), JSON.stringify(rules, null, 2), "utf8");
    const code = `
// astesia-allow: ASTESIA-010 -- Valid fifteen character reason for attempt
import secret from './secret-config';
`;
    writeFileSync(join(caseDir, "src/creds.ts"), code, "utf8");

    const r = spawnSync("bun", [
      gatePath,
      "--root", caseDir,
      "--rules", join(caseDir, ".astesia/rules.json"),
      "--json"
    ], { encoding: "utf8" });
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(r.stdout); } catch {}
    const passed = r.status === 1 && parsed.rejected_suppressions === 1 && parsed.errors === 1;
    results.push({ id: "al16", name: "Inline astesia-allow for ASTESIA-010 is banned (exit 1, rejected_suppressions: 1)", passed, expectedExit: 1, actualExit: r.status ?? -1 });
  }

  const passedCount = results.filter((r) => r.passed).length;
  return {
    total: results.length,
    passed: passedCount,
    failed: results.length - passedCount,
    results
  };
}

if (import.meta.main) {
  const gate = join(__dirname, "../astesia-gate.ts");
  const tmp = join(__dirname, "../../../.astesia/audit/tmp");
  const out = runAllowlistSuite(gate, tmp);
  console.log(`Allowlist Suite: ${out.passed}/${out.total} passed`);
  if (out.failed > 0) {
    for (const r of out.results.filter((x) => !x.passed)) {
      console.error(`FAILED: ${r.id} ${r.name} (expected ${r.expectedExit}, got ${r.actualExit})`);
    }
    process.exit(1);
  }
  process.exit(0);
}
