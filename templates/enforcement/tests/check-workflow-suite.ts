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
