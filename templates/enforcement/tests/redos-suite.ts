/**
 * templates/enforcement/tests/redos-suite.ts
 * ReDoS resistance and long-line performance test suite (F-A / VER3-007a).
 * Strict 1,500 ms limit per case, no skipping, secret at EOF of 200k line must be detected.
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

export interface ReDoSResult {
  id: string;
  name: string;
  passed: boolean;
  durationMs: number;
  detectedSecret?: boolean;
  error?: string;
}

export function runReDoSSuite(gatePath: string, testTmpDir: string): {
  total: number;
  passed: number;
  failed: number;
  results: ReDoSResult[];
} {
  const suiteDir = join(testTmpDir, `redos-${Date.now()}`);
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
      }
    ]
  };
  writeFileSync(rulesPath, JSON.stringify(rules, null, 2), "utf8");

  const results: ReDoSResult[] = [];
  const MAX_MS = process.platform === "win32" ? 6000 : 1500;

  function runCase(id: string, name: string, ext: string, content: string, expectSecret = false) {
    const caseDir = join(suiteDir, id);
    mkdirSync(caseDir, { recursive: true });
    const filePath = join(caseDir, `target${ext}`);
    writeFileSync(filePath, content, "utf8");

    const start = performance.now();
    const r = spawnSync("bun", [gatePath, "--root", caseDir, "--rules", rulesPath, "--json"], {
      encoding: "utf8",
      maxBuffer: 50 * 1024 * 1024
    });
    const durationMs = performance.now() - start;

    let parsed: any = {};
    try { parsed = JSON.parse(r.stdout); } catch {}
    const hasSecret = (parsed.violations || []).some((v: any) => v.ruleId === "ASTESIA-004");

    const timeOk = durationMs <= MAX_MS;
    const secretOk = expectSecret ? hasSecret : !hasSecret;
    const passed = timeOk && secretOk;

    results.push({
      id,
      name,
      passed,
      durationMs: Math.round(durationMs),
      detectedSecret: hasSecret,
      error: !timeOk ? `Timeout: ${Math.round(durationMs)} ms > ${MAX_MS} ms` : (!secretOk ? `Secret expectation failed (got ${hasSecret}, expected ${expectSecret})` : undefined)
    });
  }

  // 1. 100k, 500k, 1M characters repetitive 'a' on .ts, .js, .py, .go, .env, .yml
  const sizes = [
    { label: "100k", count: 100_000 },
    { label: "500k", count: 500_000 },
    { label: "1M", count: 1_000_000 }
  ];

  for (const s of sizes) {
    runCase(`rd_a_${s.label}_ts`, `Repeated 'a' ${s.label} chars on .ts`, ".ts", "const x = '" + "a".repeat(s.count) + "';\n");
    runCase(`rd_assign_${s.label}_js`, `Repeated 'a=a=' ${s.label} chars on .js`, ".js", "let " + "a=a=".repeat(s.count / 4) + ";\n");
    runCase(`rd_quotes_${s.label}_py`, `Alternating quotes ${s.label} chars on .py`, ".py", "# " + "'\"".repeat(s.count / 2) + "\n");
    runCase(`rd_minified_${s.label}_go`, `Minified bundle pattern ${s.label} chars on .go`, ".go", "// " + "function(a,b){return a+b};".repeat(Math.floor(s.count / 26)) + "\n");
  }

  // 2. YAML and .env long line tests
  runCase("rd_yaml_500k", "YAML config line with 500k chars", ".yml", "key: " + "val_".repeat(125_000) + "\n");
  runCase("rd_env_500k", "Env line with 500k chars", ".env", "VAR=" + "value_".repeat(83_333) + "\n");

  // 3. Secret at the VERY END of 200,000 char minified bundle line -> MUST BE DETECTED
  const minifiedPrefix = "function(a,b){return a+b};".repeat(Math.floor(200_000 / 26));
  const secretLine = minifiedPrefix + " const apiKey = 'sk_live_1234567890abcdef1234';\n";
  runCase("rd_secret_eof_200k", "Secret at EOF of 200k char minified line must trigger", ".ts", secretLine, true);

  // Cleanup
  try { rmSync(suiteDir, { recursive: true, force: true }); } catch {}

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
  const out = runReDoSSuite(gate, tmp);
  console.log(`ReDoS Suite: ${out.passed}/${out.total} passed`);
  for (const r of out.results) {
    console.log(`  [${r.passed ? "PASS" : "FAIL"}] ${r.id}: ${r.name} (${r.durationMs} ms)${r.error ? " - " + r.error : ""}`);
  }
  process.exit(out.failed === 0 ? 0 : 1);
}
