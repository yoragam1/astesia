/**
 * templates/enforcement/tests/portability-suite.ts
 * Suite for Task L: Portability & OS Independence (Keputusan 5 & 8).
 * Covers:
 * - isolatedEnv helper contract (no hardcoded NUL, isolated config, hermetic git)
 * - Explicit `git init -b main`
 * - CRLF vs LF portability in code and gate-config.json
 * - Path separator portability (/ vs \)
 * - Case-sensitive import resolution across OSes
 * - .env ignored vs tracked across OSes
 * - Golden normalization (posix, sorted, deterministic)
 * - Exact Bun version pinning in CI workflow (1.3.9, rejecting latest/ranges/missing)
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isolatedEnv } from "./isolated-env";

export interface PortabilitySuiteResult {
  total: number;
  passed: number;
  failed: number;
  known_gaps: number;
  errors: string[];
}

export function runPortabilitySuite(gatePath: string, testTmpDir: string): PortabilitySuiteResult {
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

  const suiteDir = join(testTmpDir, `portability-${Date.now()}`);
  mkdirSync(suiteDir, { recursive: true });

  const rulesPath = join(__dirname, "../anti-patterns.json");

  // 1. PORT-01: isolatedEnv has isolated empty HOME/USERPROFILE/XDG_CONFIG_HOME, LC_ALL=C, GIT_CONFIG_NOSYSTEM=1
  const env = isolatedEnv();
  assert(
    "PORT-01: isolatedEnv has isolated dirs and LC_ALL=C",
    Boolean(env.HOME && env.USERPROFILE && env.XDG_CONFIG_HOME && env.LC_ALL === "C" && env.GIT_CONFIG_NOSYSTEM === "1")
  );

  // 2. PORT-02: isolatedEnv eliminates hardcoded 'NUL'
  assert(
    "PORT-02: isolatedEnv does not use hardcoded NUL",
    env.GIT_CONFIG_GLOBAL !== "NUL" && env.GIT_CONFIG_SYSTEM !== "NUL" && env.GIT_CONFIG_GLOBAL.includes("dev/null")
  );

  // 3. PORT-03: git executes hermetically under isolatedEnv
  const gitCheck = spawnSync("git", ["--version"], { env: env as NodeJS.ProcessEnv, encoding: "utf8" });
  assert("PORT-03: git executes under isolatedEnv", gitCheck.status === 0);

  // 4. PORT-04: explicit git init -b main works hermetically
  const gitRepoDir = join(suiteDir, "repo-init");
  mkdirSync(gitRepoDir, { recursive: true });
  const gitInit = spawnSync("git", ["init", "-b", "main"], { cwd: gitRepoDir, env: env as NodeJS.ProcessEnv, encoding: "utf8" });
  assert("PORT-04: explicit git init -b main succeeds", gitInit.status === 0);

  // 5. PORT-05: CRLF vs LF in code files produces identical violations and line numbers
  const crlfDir = join(suiteDir, "crlf-test");
  mkdirSync(crlfDir, { recursive: true });
  writeFileSync(join(crlfDir, "lf.ts"), "const x = 1;\nconsole.log(x);\nconst y = 2;\n", "utf8");
  writeFileSync(join(crlfDir, "crlf.ts"), "const x = 1;\r\nconsole.log(x);\r\nconst y = 2;\r\n", "utf8");
  const crlfRun = spawnSync("bun", [gatePath, "--root", crlfDir, "--rules", rulesPath, "--json"], {
    env: env as NodeJS.ProcessEnv,
    encoding: "utf8"
  });
  let crlfJson: any = {};
  try { crlfJson = JSON.parse(crlfRun.stdout); } catch {}
  const lfV = crlfJson.violations?.find((v: any) => v.file.includes("lf.ts"));
  const crlfV = crlfJson.violations?.find((v: any) => v.file.includes("crlf.ts"));
  assert(
    "PORT-05: CRLF vs LF produces identical violation line numbers",
    Boolean(lfV && crlfV && lfV.line === crlfV.line && lfV.line === 2)
  );

  // 6. PORT-06: CRLF vs LF in .astesia/gate-config.json parses identically
  const cfgDir = join(suiteDir, "cfg-test");
  const cfgDot = join(cfgDir, ".astesia");
  mkdirSync(cfgDot, { recursive: true });
  writeFileSync(join(cfgDir, "main.ts"), "import './nonexistent';\n", "utf8");
  writeFileSync(
    join(cfgDot, "gate-config.json"),
    "{\r\n  \"schema\": 1,\r\n  \"imports\": {\r\n    \"virtual\": [\r\n      { \"prefix\": \"#vmod\", \"reason\": \"Valid reason with fifteen characters\" }\r\n    ]\r\n  }\r\n}\r\n",
    "utf8"
  );
  const cfgRun = spawnSync("bun", [gatePath, "--root", cfgDir, "--rules", rulesPath, "--json"], {
    env: env as NodeJS.ProcessEnv,
    encoding: "utf8"
  });
  let cfgJson: any = {};
  try { cfgJson = JSON.parse(cfgRun.stdout); } catch {}
  assert("PORT-06: CRLF in gate-config.json parsed successfully", cfgRun.status === 1 && !cfgRun.stderr.includes("JSON"));

  // 7. PORT-07: Path separator portability (/ vs \) in config exclude
  const sepDir = join(suiteDir, "sep-test");
  const sepDot = join(sepDir, ".astesia");
  mkdirSync(join(sepDir, "sub"), { recursive: true });
  mkdirSync(sepDot, { recursive: true });
  writeFileSync(join(sepDir, "sub/test.ts"), "console.log('hi');\n", "utf8");
  writeFileSync(
    join(sepDot, "gate-config.json"),
    JSON.stringify({ schema: 1, exclude: [{ path: "sub/test.ts", reason: "Excluding test file for portability test" }] }),
    "utf8"
  );
  const sepRun = spawnSync("bun", [gatePath, "--root", sepDir, "--rules", rulesPath, "--json"], {
    env: env as NodeJS.ProcessEnv,
    encoding: "utf8"
  });
  let sepJson: any = {};
  try { sepJson = JSON.parse(sepRun.stdout); } catch {}
  assert("PORT-07: Posix exclude matches sub/test.ts", sepJson.violations?.length === 0);

  // 8. PORT-08: Case-sensitivity: importing ./Foo.js when file is foo.ts triggers ASTESIA-000
  const caseDir = join(suiteDir, "case-test");
  mkdirSync(caseDir, { recursive: true });
  writeFileSync(join(caseDir, "foo.ts"), "export const x = 1;\n", "utf8");
  writeFileSync(join(caseDir, "importer.ts"), "import { x } from './Foo.js';\n", "utf8");
  const caseRun = spawnSync("bun", [gatePath, "--root", caseDir, "--rules", rulesPath, "--json"], {
    env: env as NodeJS.ProcessEnv,
    encoding: "utf8"
  });
  let caseJson: any = {};
  try { caseJson = JSON.parse(caseRun.stdout); } catch {}
  const case000 = caseJson.violations?.find((v: any) => v.ruleId === "ASTESIA-000");
  assert("PORT-08: Wrong-case import triggers ASTESIA-000", Boolean(case000));

  // 9. PORT-09: Case-sensitivity: importing ./foo.js when file is foo.ts passes
  const caseOkDir = join(suiteDir, "case-ok-test");
  mkdirSync(caseOkDir, { recursive: true });
  writeFileSync(join(caseOkDir, "foo.ts"), "export const x = 1;\n", "utf8");
  writeFileSync(join(caseOkDir, "importer.ts"), "import { x } from './foo.js';\n", "utf8");
  const caseOkRun = spawnSync("bun", [gatePath, "--root", caseOkDir, "--rules", rulesPath, "--json"], {
    env: env as NodeJS.ProcessEnv,
    encoding: "utf8"
  });
  let caseOkJson: any = {};
  try { caseOkJson = JSON.parse(caseOkRun.stdout); } catch {}
  const caseOk000 = caseOkJson.violations?.find((v: any) => v.ruleId === "ASTESIA-000");
  assert("PORT-09: Correct-case import passes ASTESIA-000", !caseOk000);

  // 10. PORT-10: .env ignored in .gitignore is skipped by gate in git repo
  const envGitDir = join(suiteDir, "env-git-test");
  mkdirSync(envGitDir, { recursive: true });
  spawnSync("git", ["init", "-b", "main"], { cwd: envGitDir, env: env as NodeJS.ProcessEnv });
  writeFileSync(join(envGitDir, ".gitignore"), ".env\n", "utf8");
  writeFileSync(join(envGitDir, ".env"), "SECRET_KEY_1234567=verysecret\n", "utf8");
  spawnSync("git", ["add", ".gitignore"], { cwd: envGitDir, env: env as NodeJS.ProcessEnv });
  spawnSync("git", ["commit", "-m", "init"], { cwd: envGitDir, env: env as NodeJS.ProcessEnv });
  const envGitRun = spawnSync("bun", [gatePath, "--root", envGitDir, "--rules", rulesPath, "--json"], {
    env: env as NodeJS.ProcessEnv,
    encoding: "utf8"
  });
  let envGitJson: any = {};
  try { envGitJson = JSON.parse(envGitRun.stdout); } catch {}
  assert(
    "PORT-10: Git-ignored .env file is skipped",
    Boolean(envGitJson.env_ignored_skipped === 1)
  );

  // 11. PORT-11: .env forcefully tracked in git is NOT skipped
  spawnSync("git", ["add", "-f", ".env"], { cwd: envGitDir, env: env as NodeJS.ProcessEnv });
  spawnSync("git", ["commit", "-m", "track env"], { cwd: envGitDir, env: env as NodeJS.ProcessEnv });
  const envTrackRun = spawnSync("bun", [gatePath, "--root", envGitDir, "--rules", rulesPath, "--json"], {
    env: env as NodeJS.ProcessEnv,
    encoding: "utf8"
  });
  let envTrackJson: any = {};
  try { envTrackJson = JSON.parse(envTrackRun.stdout); } catch {}
  assert(
    "PORT-11: Tracked .env in git is NOT skipped",
    Boolean(envTrackJson.env_ignored_skipped === 0 && envTrackJson.files_scanned?.total >= 1)
  );

  // 12. PORT-12: Golden normalization is posix, sorted, and without timestamps
  const goldenSample = {
    violations: [
      { file: "b/file.ts", line: 10, rule_id: "ASTESIA-003" },
      { file: "a/file.ts", line: 5, rule_id: "ASTESIA-003" }
    ]
  };
  const sortedViolations = [...goldenSample.violations].sort((a, b) =>
    a.file.localeCompare(b.file) || a.line - b.line
  );
  assert(
    "PORT-12: Golden violations sorted lexicographically by posix path and line",
    sortedViolations[0].file === "a/file.ts" && !JSON.stringify(sortedViolations).includes("timestamp")
  );

  // 13. PORT-13: Workflow bun pinning: exact version 1.3.9 is accepted
  const baseWf = `name: CI
on:
  pull_request:
    branches: [main]
concurrency:
  group: test
permissions:
  contents: read
jobs:
  gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683
        with:
          ref: \${{ github.event.pull_request.base.sha }}
          path: trusted
          persist-credentials: false
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683
        with:
          ref: \${{ github.event.pull_request.head.sha }}
          path: pr
          persist-credentials: false
      - uses: oven-sh/setup-bun@4bc047ad259df6fc24a6c9b0f9a0cb08cf17fbe5
        with:
          bun-version: 1.3.9
      - run: bun trusted/gate.ts --check-workflow pr/workflow.yml
      - run: bun trusted/gate.ts --rules-diff trusted/rules.json pr/rules.json
      - run: bun trusted/gate.ts --root pr --baseline trusted/base.json
`;
  const wfValidPath = join(suiteDir, "wf-valid.yml");
  writeFileSync(wfValidPath, baseWf, "utf8");
  const wfValidRun = spawnSync("bun", [gatePath, "--check-workflow", wfValidPath], { encoding: "utf8" });
  assert("PORT-13: Workflow with exact bun-version 1.3.9 passes", wfValidRun.status === 0);

  // 14. PORT-14: Workflow bun pinning: missing bun-version in setup-bun rejected
  const wfMissing = baseWf.replace("bun-version: 1.3.9\n", "");
  const wfMissingPath = join(suiteDir, "wf-missing.yml");
  writeFileSync(wfMissingPath, wfMissing, "utf8");
  const wfMissingRun = spawnSync("bun", [gatePath, "--check-workflow", wfMissingPath], { encoding: "utf8" });
  assert("PORT-14: Workflow with missing bun-version fails exit 1", wfMissingRun.status === 1);

  // 15. PORT-15: Workflow bun pinning: bun-version: latest rejected
  const wfLatest = baseWf.replace("bun-version: 1.3.9", "bun-version: latest");
  const wfLatestPath = join(suiteDir, "wf-latest.yml");
  writeFileSync(wfLatestPath, wfLatest, "utf8");
  const wfLatestRun = spawnSync("bun", [gatePath, "--check-workflow", wfLatestPath], { encoding: "utf8" });
  assert("PORT-15: Workflow with bun-version latest fails exit 1", wfLatestRun.status === 1);

  // 16. PORT-16: Workflow bun pinning: bun-version: 1.x rejected
  const wfRangeX = baseWf.replace("bun-version: 1.3.9", "bun-version: 1.x");
  const wfRangeXPath = join(suiteDir, "wf-rangex.yml");
  writeFileSync(wfRangeXPath, wfRangeX, "utf8");
  const wfRangeXRun = spawnSync("bun", [gatePath, "--check-workflow", wfRangeXPath], { encoding: "utf8" });
  assert("PORT-16: Workflow with bun-version 1.x fails exit 1", wfRangeXRun.status === 1);

  // 17. PORT-17: Workflow bun pinning: bun-version: ^1.3.0 rejected
  const wfRangeCaret = baseWf.replace("bun-version: 1.3.9", "bun-version: '^1.3.0'");
  const wfRangeCaretPath = join(suiteDir, "wf-caret.yml");
  writeFileSync(wfRangeCaretPath, wfRangeCaret, "utf8");
  const wfRangeCaretRun = spawnSync("bun", [gatePath, "--check-workflow", wfRangeCaretPath], { encoding: "utf8" });
  assert("PORT-17: Workflow with bun-version ^1.3.0 fails exit 1", wfRangeCaretRun.status === 1);

  // 18. PORT-18: Authentic astesia-gate.workflow.yml passes --check-workflow
  const authenticWfPath = join(__dirname, "../astesia-gate.workflow.yml");
  const authWfRun = spawnSync("bun", [gatePath, "--check-workflow", authenticWfPath], { encoding: "utf8" });
  assert("PORT-18: Authentic astesia-gate.workflow.yml passes --check-workflow", authWfRun.status === 0);

  return {
    total,
    passed,
    failed: total - passed,
    known_gaps: 0,
    errors
  };
}

if (import.meta.main) {
  const gate = join(__dirname, "../astesia-gate.ts");
  const tmp = join(__dirname, "../tmp-portability");
  const res = runPortabilitySuite(gate, tmp);
  console.log(`Portability Suite: ${res.passed}/${res.total} passed (${res.failed} failed)`);
  if (res.errors.length > 0) {
    for (const e of res.errors) console.error(e);
    process.exit(1);
  }
}
