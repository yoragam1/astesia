/**
 * templates/enforcement/tests/rules-diff-suite.ts
 * 10 test scenarios for --rules-diff CLI flag.
 */
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

export interface RulesDiffScenarioResult {
  id: string;
  description: string;
  passed: boolean;
  expectedExit: number;
  actualExit: number;
  message?: string;
}

export function runRulesDiffSuite(
  gatePath: string,
  workDir: string
): { total: number; passed: number; failed: number; results: RulesDiffScenarioResult[] } {
  const absWorkDir = resolve(workDir);
  const absGate = resolve(gatePath);
  mkdirSync(absWorkDir, { recursive: true });

  const sampleBaseRule = {
    id: "ASTESIA-002",
    severity: "error",
    kind: "line-regex",
    scope: "code",
    pattern: "SELECT\\s+\\*",
    message: "Avoid SELECT *",
    fix: "List explicit columns",
    origin: "Rule 002"
  };

  const sampleWarnRule = {
    id: "ASTESIA-008",
    severity: "warn",
    kind: "line-regex",
    scope: "comment",
    pattern: "workaround",
    message: "Workaround detected",
    fix: "Use astesia-debt",
    origin: "Rule 008"
  };

  const scenarios = [
    {
      id: "rd01",
      description: "JSON valid: base and compatible head with added rule",
      base: { rules: [sampleBaseRule] },
      head: { rules: [sampleBaseRule, sampleWarnRule] },
      expectedExit: 0
    },
    {
      id: "rd02",
      description: "Invalid base JSON syntax (exit 2)",
      rawBase: "{ invalid json syntax",
      head: { rules: [sampleBaseRule] },
      expectedExit: 2
    },
    {
      id: "rd03",
      description: "Invalid head JSON syntax (exit 2)",
      base: { rules: [sampleBaseRule] },
      rawHead: "{ invalid json syntax",
      expectedExit: 2
    },
    {
      id: "rd04",
      description: "Rule added in head -> allowed (exit 0)",
      base: { rules: [sampleBaseRule] },
      head: { rules: [sampleBaseRule, sampleWarnRule] },
      expectedExit: 0
    },
    {
      id: "rd05",
      description: "Rule removed in head -> rejected (exit 1)",
      base: { rules: [sampleBaseRule, sampleWarnRule] },
      head: { rules: [sampleBaseRule] },
      expectedExit: 1
    },
    {
      id: "rd06",
      description: "Rule severity downgraded (error -> warn) -> rejected (exit 1)",
      base: { rules: [sampleBaseRule] },
      head: { rules: [{ ...sampleBaseRule, severity: "warn" }] },
      expectedExit: 1
    },
    {
      id: "rd07",
      description: "Rule severity upgraded (warn -> error) -> allowed (exit 0)",
      base: { rules: [sampleWarnRule] },
      head: { rules: [{ ...sampleWarnRule, severity: "error" }] },
      expectedExit: 0
    },
    {
      id: "rd08",
      description: "Pattern changed in head -> diff reported (exit 0)",
      base: { rules: [sampleBaseRule] },
      head: { rules: [{ ...sampleBaseRule, pattern: "SELECT\\s+[\\*]" }] },
      expectedExit: 0,
      expectStderr: "pattern for rule"
    },
    {
      id: "rd09",
      description: "Base and head rules identical -> info rules identical (exit 0)",
      base: { rules: [sampleBaseRule, sampleWarnRule] },
      head: { rules: [sampleBaseRule, sampleWarnRule] },
      expectedExit: 0,
      expectStdout: "rules identical"
    },
    {
      id: "rd10",
      description: "Rule extensions changed in head -> notice reported (exit 0)",
      base: { rules: [{ ...sampleBaseRule, extensions: [".ts", ".js"] }] },
      head: { rules: [{ ...sampleBaseRule, extensions: [".ts", ".js", ".tsx"] }] },
      expectedExit: 0,
      expectStderr: "extensions for rule"
    }
  ];

  const results: RulesDiffScenarioResult[] = [];
  let passedCount = 0;

  for (const sc of scenarios) {
    const basePath = join(absWorkDir, `${sc.id}-base.json`);
    const headPath = join(absWorkDir, `${sc.id}-head.json`);

    if (sc.rawBase !== undefined) {
      writeFileSync(basePath, sc.rawBase, "utf8");
    } else {
      writeFileSync(basePath, JSON.stringify(sc.base, null, 2), "utf8");
    }

    if (sc.rawHead !== undefined) {
      writeFileSync(headPath, sc.rawHead, "utf8");
    } else {
      writeFileSync(headPath, JSON.stringify(sc.head, null, 2), "utf8");
    }

    const run = spawnSync("bun", [absGate, "--rules-diff", basePath, headPath], {
      encoding: "utf8"
    });

    const actualExit = run.status ?? -1;
    let ok = actualExit === sc.expectedExit;

    if (ok && sc.expectStdout) {
      ok = run.stdout.includes(sc.expectStdout);
    }
    if (ok && sc.expectStderr) {
      ok = run.stderr.includes(sc.expectStderr);
    }

    if (ok) passedCount++;

    results.push({
      id: sc.id,
      description: sc.description,
      passed: ok,
      expectedExit: sc.expectedExit,
      actualExit,
      message: ok ? undefined : `stdout: ${run.stdout.trim()} | stderr: ${run.stderr.trim()}`
    });
  }

  rmSync(workDir, { recursive: true, force: true });

  return {
    total: scenarios.length,
    passed: passedCount,
    failed: scenarios.length - passedCount,
    results
  };
}
