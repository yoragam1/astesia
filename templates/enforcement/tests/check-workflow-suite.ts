/**
 * templates/enforcement/tests/check-workflow-suite.ts
 * Tests for F-E: CLI subcommand --check-workflow (VER3-006).
 * Verifies that --check-workflow evaluates workflows fail-closed:
 * - Authentic workflow -> exit 0
 * - 12 mutations (including removal of guard step) -> exit 1
 * - Non-existent file -> exit 2
 * - Missing argument -> exit 2
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkWorkflow } from "../astesia-gate";

export function runCheckWorkflowSuite(testTmpDir: string, gatePath: string): {
  total: number;
  passed: number;
  failed: number;
  errors: string[];
} {
  const errors: string[] = [];
  let passed = 0;
  let total = 0;

  function assert(name: string, cond: boolean, msg?: string) {
    total++;
    if (cond) {
      passed++;
    } else {
      errors.push(`FAIL: ${name}${msg ? " - " + msg : ""}`);
    }
  }

  const workflowPath = join(__dirname, "../astesia-gate.workflow.yml");
  const authenticYaml = readFileSync(workflowPath, "utf8");

  // 1. Direct function test on authentic
  const fnRes = checkWorkflow(authenticYaml);
  assert("Function checkWorkflow valid on authentic", fnRes.valid && fnRes.errors.length === 0);

  // 2. CLI test on authentic workflow -> exit 0
  const cliAuth = spawnSync("bun", [gatePath, "--check-workflow", workflowPath], { encoding: "utf8" });
  assert("CLI --check-workflow on authentic exits 0", cliAuth.status === 0, `Got exit ${cliAuth.status}, stderr: ${cliAuth.stderr}`);

  // 3. CLI test on non-existent workflow -> exit 2
  const cliNonExist = spawnSync("bun", [gatePath, "--check-workflow", "non/existent/workflow.yml"], { encoding: "utf8" });
  assert("CLI --check-workflow non-existent file exits 2", cliNonExist.status === 2, `Got exit ${cliNonExist.status}`);

  // 4. CLI test with missing argument -> exit 2
  const cliMissingArg = spawnSync("bun", [gatePath, "--check-workflow"], { encoding: "utf8" });
  assert("CLI --check-workflow missing argument exits 2", cliMissingArg.status === 2, `Got exit ${cliMissingArg.status}`);

  // 5. 12 Mutations tested via CLI -> each must exit 1
  const mutations = [
    {
      name: "m01_pull_request_target",
      mutate: (y: string) => y.replace(/pull_request:/g, "pull_request_target:")
    },
    {
      name: "m02_write_permissions",
      mutate: (y: string) => y.replace(/contents:\s*read/g, "contents: write")
    },
    {
      name: "m03_missing_permissions",
      mutate: (y: string) => y.replace(/permissions:\s*\n\s+contents:\s*read/g, "# permissions removed")
    },
    {
      name: "m04_unpinned_action",
      mutate: (y: string) => y.replace(/actions\/checkout@[0-9a-f]{40}/g, "actions/checkout@v4")
    },
    {
      name: "m05_missing_trusted_checkout",
      mutate: (y: string) => y.replace(/path:\s*trusted/g, "path: other")
    },
    {
      name: "m06_missing_pr_checkout",
      mutate: (y: string) => y.replace(/path:\s*pr/g, "path: incoming")
    },
    {
      name: "m07_persist_credentials_false_removed",
      mutate: (y: string) => y.replace(/persist-credentials:\s*false/g, "persist-credentials: true")
    },
    {
      name: "m08_continue_on_error_added",
      mutate: (y: string) => y + "\n      continue-on-error: true\n"
    },
    {
      name: "m09_paths_filter_added",
      mutate: (y: string) => y.replace(/pull_request:\n    branches: \[main\]/, "pull_request:\n    branches: [main]\n    paths:\n      - 'src/**'")
    },
    {
      name: "m10_missing_rules_diff",
      mutate: (y: string) => y.replace(/--rules-diff[^\n]+/g, "echo skipped")
    },
    {
      name: "m11_update_baseline_added",
      mutate: (y: string) => y.replace(/--baseline/g, "--update-baseline")
    },
    {
      name: "m12_missing_guard_step",
      mutate: (y: string) => y.replace(/--check-workflow/g, "--ignore-check")
    }
  ];

  const tmpSuiteDir = join(testTmpDir, `wf-suite-${Date.now()}`);
  mkdirSync(tmpSuiteDir, { recursive: true });

  for (const m of mutations) {
    const mutated = m.mutate(authenticYaml);
    const mPath = join(tmpSuiteDir, `${m.name}.yml`);
    writeFileSync(mPath, mutated, "utf8");

    const r = spawnSync("bun", [gatePath, "--check-workflow", mPath], { encoding: "utf8" });
    assert(`CLI catches mutation: ${m.name} (exit 1)`, r.status === 1, `Got exit ${r.status}`);
  }

  // 6. Bun version pinning tests (Task W1)
  // Positive 1: missing bun-version -> exit 1
  {
    const wfMissing = authenticYaml.replace(/bun-version:\s*1\.3\.9/, "# bun-version removed");
    const mPath = join(tmpSuiteDir, "bun_missing.yml");
    writeFileSync(mPath, wfMissing, "utf8");
    const r = spawnSync("bun", [gatePath, "--check-workflow", mPath], { encoding: "utf8" });
    assert("Bun version missing is rejected (exit 1)", r.status === 1, `Got exit ${r.status}`);
  }

  // Positive 2: floating bun-version ('latest' or '1.x') -> exit 1
  {
    const wfFloating = authenticYaml.replace(/bun-version:\s*1\.3\.9/, "bun-version: latest");
    const mPath = join(tmpSuiteDir, "bun_floating.yml");
    writeFileSync(mPath, wfFloating, "utf8");
    const r = spawnSync("bun", [gatePath, "--check-workflow", mPath], { encoding: "utf8" });
    assert("Bun version floating 'latest' is rejected (exit 1)", r.status === 1, `Got exit ${r.status}`);
  }

  // Negative 1: exact unquoted bun-version ('1.3.9') -> exit 0
  {
    const wfExact = authenticYaml.replace(/bun-version:\s*1\.3\.9/, "bun-version: 1.3.9");
    const mPath = join(tmpSuiteDir, "bun_exact_unquoted.yml");
    writeFileSync(mPath, wfExact, "utf8");
    const r = spawnSync("bun", [gatePath, "--check-workflow", mPath], { encoding: "utf8" });
    assert("Bun version exact unquoted '1.3.9' passes (exit 0)", r.status === 0, `Got exit ${r.status}`);
  }

  // Negative 2: exact quoted bun-version ('"1.3.9"') -> exit 0
  {
    const wfQuoted = authenticYaml.replace(/bun-version:\s*1\.3\.9/, 'bun-version: "1.3.9"');
    const mPath = join(tmpSuiteDir, "bun_exact_quoted.yml");
    writeFileSync(mPath, wfQuoted, "utf8");
    const r = spawnSync("bun", [gatePath, "--check-workflow", mPath], { encoding: "utf8" });
    assert("Bun version exact quoted '\"1.3.9\"' passes (exit 0)", r.status === 0, `Got exit ${r.status}`);
  }

  // 7. CLI --rules-diff tests (Task W2)
  const baseRulesObj = {
    version: 1,
    rules: [
      { id: "TEST-001", kind: "line-regex", severity: "error", description: "d", fix: "f", pattern: "foo", origin: "unit-test" },
      { id: "TEST-002", kind: "line-regex", severity: "warn", description: "d", fix: "f", pattern: "bar", origin: "unit-test" }
    ]
  };
  const baseRulesPath = join(tmpSuiteDir, "base-rules.json");
  writeFileSync(baseRulesPath, JSON.stringify(baseRulesObj), "utf8");

  // Rules-diff case 1: identical -> exit 0
  {
    const r = spawnSync("bun", [gatePath, "--rules-diff", baseRulesPath, baseRulesPath], { encoding: "utf8" });
    assert("rules-diff: identical rules exits 0", r.status === 0, `Got exit ${r.status}`);
  }

  // Rules-diff case 2: rule added in head -> exit 0
  {
    const headObj = {
      version: 1,
      rules: [
        ...baseRulesObj.rules,
        { id: "TEST-003", kind: "line-regex", severity: "error", description: "d", fix: "f", pattern: "baz", origin: "unit-test" }
      ]
    };
    const headPath = join(tmpSuiteDir, "head-added.json");
    writeFileSync(headPath, JSON.stringify(headObj), "utf8");
    const r = spawnSync("bun", [gatePath, "--rules-diff", baseRulesPath, headPath], { encoding: "utf8" });
    assert("rules-diff: rule added in head exits 0", r.status === 0, `Got exit ${r.status}`);
  }

  // Rules-diff case 3: rule deleted in head -> exit 1
  {
    const headObj = {
      version: 1,
      rules: [baseRulesObj.rules[0]]
    };
    const headPath = join(tmpSuiteDir, "head-deleted.json");
    writeFileSync(headPath, JSON.stringify(headObj), "utf8");
    const r = spawnSync("bun", [gatePath, "--rules-diff", baseRulesPath, headPath], { encoding: "utf8" });
    assert("rules-diff: rule deleted in head exits 1", r.status === 1, `Got exit ${r.status}`);
  }

  // Rules-diff case 4: rule severity lowered (error -> warn) -> exit 1
  {
    const headObj = {
      version: 1,
      rules: [
        { ...baseRulesObj.rules[0], severity: "warn" },
        baseRulesObj.rules[1]
      ]
    };
    const headPath = join(tmpSuiteDir, "head-lowered.json");
    writeFileSync(headPath, JSON.stringify(headObj), "utf8");
    const r = spawnSync("bun", [gatePath, "--rules-diff", baseRulesPath, headPath], { encoding: "utf8" });
    assert("rules-diff: rule severity lowered exits 1", r.status === 1, `Got exit ${r.status}`);
  }

  try { rmSync(tmpSuiteDir, { recursive: true, force: true }); } catch {}

  return { total, passed, failed: total - passed, errors };
}

if (import.meta.main) {
  const gate = join(__dirname, "../astesia-gate.ts");
  const tmp = join(__dirname, "../../../.astesia/audit/tmp");
  const res = runCheckWorkflowSuite(tmp, gate);
  console.log(`Check Workflow Suite: ${res.passed}/${res.total} passed`);
  if (res.errors.length > 0) {
    for (const e of res.errors) console.error(e);
    process.exit(1);
  }
  process.exit(0);
}
