/**
 * templates/enforcement/tests/env-git-suite.ts
 * Hermetic test suite for F4 git-ignored .env file handling (N4).
 * 5 distinct scenarios: eg01..eg05.
 * Strictly uses -c user.name -c user.email -c commit.gpgsign=false -c core.autocrlf=false
 * Asserts all git prerequisites before running gate.
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, delimiter } from "node:path";
import { spawnSync } from "node:child_process";

export interface EnvGitScenarioResult {
  id: string;
  name: string;
  passed: boolean;
  expectedSkipped: number;
  actualSkipped: number;
  exitCode: number;
}

function gitHermetic(args: string[], cwd: string, envOverrides?: Record<string, string>): { status: number | null; stdout: string; stderr: string } {
  const flags = [
    "-c", "user.name=Auditor",
    "-c", "user.email=audit@astesia.dev",
    "-c", "commit.gpgsign=false",
    "-c", "core.autocrlf=false"
  ];
  const res = spawnSync("git", [...flags, ...args], {
    cwd,
    encoding: "utf8",
    env: envOverrides ? { ...process.env, ...envOverrides } : process.env
  });
  return { status: res.status, stdout: res.stdout || "", stderr: res.stderr || "" };
}

export function runEnvGitSuite(gatePath: string, testTmpDir: string): {
  total: number;
  passed: number;
  failed: number;
  results: EnvGitScenarioResult[];
} {
  const suiteDir = join(testTmpDir, `env-git-${Date.now()}`);
  mkdirSync(suiteDir, { recursive: true });

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

  const results: EnvGitScenarioResult[] = [];

  // eg01: Git repo with .env in .gitignore (untracked) -> skipped
  {
    const caseDir = join(suiteDir, "eg01");
    mkdirSync(join(caseDir, ".astesia"), { recursive: true });
    writeFileSync(join(caseDir, ".astesia/rules.json"), JSON.stringify(rules, null, 2), "utf8");
    writeFileSync(join(caseDir, ".gitignore"), ".env\n", "utf8");
    writeFileSync(join(caseDir, ".env"), 'SECRET_KEY="sk_live_1234567890abcdef"\n', "utf8");
    writeFileSync(join(caseDir, "index.ts"), "const ok = 1;\n", "utf8");

    gitHermetic(["init"], caseDir);
    gitHermetic(["add", ".gitignore", "index.ts", ".astesia"], caseDir);
    const cRes = gitHermetic(["commit", "-m", "init"], caseDir);
    if (cRes.status !== 0) {
      throw new Error(`Git commit failed in eg01: ${cRes.stderr}`);
    }
    const ignoreCheck = gitHermetic(["check-ignore", "-q", ".env"], caseDir);
    if (ignoreCheck.status !== 0) {
      throw new Error(`Prerequisite failed in eg01: .env must match .gitignore`);
    }

    const r = spawnSync("bun", [gatePath, "--root", caseDir, "--rules", join(caseDir, ".astesia/rules.json"), "--json"], { encoding: "utf8" });
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(r.stdout); } catch {}
    const skipped = Number(parsed.env_ignored_skipped) || 0;
    const errors = Number(parsed.errors) || 0;
    const passed = r.status === 0 && skipped === 1 && errors === 0;
    results.push({ id: "eg01", name: "Ignored untracked .env is skipped", passed, expectedSkipped: 1, actualSkipped: skipped, exitCode: r.status ?? -1 });
  }

  // eg02: Git repo with .env NOT in .gitignore -> scanned and triggers
  {
    const caseDir = join(suiteDir, "eg02");
    mkdirSync(join(caseDir, ".astesia"), { recursive: true });
    writeFileSync(join(caseDir, ".astesia/rules.json"), JSON.stringify(rules, null, 2), "utf8");
    writeFileSync(join(caseDir, ".env"), 'SECRET_KEY="sk_live_1234567890abcdef"\n', "utf8");

    gitHermetic(["init"], caseDir);
    gitHermetic(["add", ".astesia"], caseDir);
    const cRes = gitHermetic(["commit", "-m", "init"], caseDir);
    if (cRes.status !== 0) {
      throw new Error(`Git commit failed in eg02: ${cRes.stderr}`);
    }
    const ignoreCheck = gitHermetic(["check-ignore", "-q", ".env"], caseDir);
    if (ignoreCheck.status === 0) {
      throw new Error(`Prerequisite failed in eg02: .env must NOT be ignored`);
    }

    const r = spawnSync("bun", [gatePath, "--root", caseDir, "--rules", join(caseDir, ".astesia/rules.json"), "--json"], { encoding: "utf8" });
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(r.stdout); } catch {}
    const skipped = Number(parsed.env_ignored_skipped) || 0;
    const errors = Number(parsed.errors) || 0;
    const passed = r.status === 1 && skipped === 0 && errors >= 1;
    results.push({ id: "eg02", name: "Un-ignored .env is scanned and triggers ASTESIA-004", passed, expectedSkipped: 0, actualSkipped: skipped, exitCode: r.status ?? -1 });
  }

  // eg03: .env is in .gitignore but ALREADY COMMITTED (tracked in git) -> NOT skipped (fail-closed)
  {
    const caseDir = join(suiteDir, "eg03");
    mkdirSync(join(caseDir, ".astesia"), { recursive: true });
    writeFileSync(join(caseDir, ".astesia/rules.json"), JSON.stringify(rules, null, 2), "utf8");
    writeFileSync(join(caseDir, ".env"), 'SECRET_KEY="sk_live_1234567890abcdef"\n', "utf8");

    gitHermetic(["init"], caseDir);
    gitHermetic(["add", "-f", ".astesia", ".env"], caseDir);
    const cRes = gitHermetic(["commit", "-m", "leaked env in index"], caseDir);
    if (cRes.status !== 0) {
      throw new Error(`Git commit failed in eg03: ${cRes.stderr}`);
    }
    // Now add to .gitignore after already tracked
    writeFileSync(join(caseDir, ".gitignore"), ".env\n", "utf8");

    const trackCheck = gitHermetic(["ls-files", "--error-unmatch", ".env"], caseDir);
    if (trackCheck.status !== 0) {
      throw new Error(`Prerequisite failed in eg03: .env must be tracked (status=${trackCheck.status})`);
    }
    const ignoreCheck = gitHermetic(["check-ignore", "-q", "--no-index", ".env"], caseDir);
    if (ignoreCheck.status !== 0) {
      throw new Error(`Prerequisite failed in eg03: .env must match .gitignore`);
    }

    const r = spawnSync("bun", [gatePath, "--root", caseDir, "--rules", join(caseDir, ".astesia/rules.json"), "--json"], { encoding: "utf8" });
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(r.stdout); } catch {}
    const skipped = Number(parsed.env_ignored_skipped) || 0;
    const errors = Number(parsed.errors) || 0;
    const passed = r.status === 1 && skipped === 0 && errors >= 1;
    results.push({ id: "eg03", name: "Tracked .env in git is NOT skipped even if in .gitignore", passed, expectedSkipped: 0, actualSkipped: skipped, exitCode: r.status ?? -1 });
  }

  // eg04: Non-git directory with explicitly missing git on PATH -> NOT skipped (fail-closed fallback)
  {
    const caseDir = join(suiteDir, "eg04");
    mkdirSync(join(caseDir, ".astesia"), { recursive: true });
    writeFileSync(join(caseDir, ".astesia/rules.json"), JSON.stringify(rules, null, 2), "utf8");
    writeFileSync(join(caseDir, ".env"), 'SECRET_KEY="sk_live_1234567890abcdef"\n', "utf8");

    const pathWithoutGit = (process.env.PATH || "")
      .split(delimiter)
      .filter((p) => !p.toLowerCase().includes("git"))
      .join(delimiter);

    const r = spawnSync(process.execPath, [gatePath, "--root", caseDir, "--rules", join(caseDir, ".astesia/rules.json"), "--json"], {
      encoding: "utf8",
      env: { ...process.env, PATH: pathWithoutGit }
    });
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(r.stdout); } catch {}
    const skipped = Number(parsed.env_ignored_skipped) || 0;
    const errors = Number(parsed.errors) || 0;
    const passed = r.status === 1 && skipped === 0 && errors >= 1;
    results.push({ id: "eg04", name: "Non-git directory does not skip .env (fail-closed)", passed, expectedSkipped: 0, actualSkipped: skipped, exitCode: r.status ?? -1 });
  }

  // eg05: Subfolder .env file ignored in nested path
  {
    const caseDir = join(suiteDir, "eg05");
    mkdirSync(join(caseDir, ".astesia"), { recursive: true });
    mkdirSync(join(caseDir, "packages/api"), { recursive: true });
    writeFileSync(join(caseDir, ".astesia/rules.json"), JSON.stringify(rules, null, 2), "utf8");
    writeFileSync(join(caseDir, ".gitignore"), "packages/*/.env*\n", "utf8");
    writeFileSync(join(caseDir, "packages/api/.env.local"), 'SECRET_KEY="sk_live_1234567890abcdef"\n', "utf8");
    writeFileSync(join(caseDir, "index.ts"), "const ok = 1;\n", "utf8");

    gitHermetic(["init"], caseDir);
    gitHermetic(["add", ".gitignore", "index.ts", ".astesia"], caseDir);
    const cRes = gitHermetic(["commit", "-m", "init"], caseDir);
    if (cRes.status !== 0) {
      throw new Error(`Git commit failed in eg05: ${cRes.stderr}`);
    }
    const ignoreCheck = gitHermetic(["check-ignore", "-q", "packages/api/.env.local"], caseDir);
    if (ignoreCheck.status !== 0) {
      throw new Error(`Prerequisite failed in eg05: packages/api/.env.local must be ignored`);
    }

    const r = spawnSync("bun", [gatePath, "--root", caseDir, "--rules", join(caseDir, ".astesia/rules.json"), "--json"], { encoding: "utf8" });
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(r.stdout); } catch {}
    const skipped = Number(parsed.env_ignored_skipped) || 0;
    const errors = Number(parsed.errors) || 0;
    const passed = r.status === 0 && skipped === 1 && errors === 0;
    results.push({ id: "eg05", name: "Nested ignored .env is skipped", passed, expectedSkipped: 1, actualSkipped: skipped, exitCode: r.status ?? -1 });
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
  const gate = process.env.GATE_PATH || join(__dirname, "../astesia-gate.ts");
  const tmp = join(__dirname, "../../../.astesia/audit/tmp");
  const out = runEnvGitSuite(gate, tmp);
  console.log(`Env Git Suite: ${out.passed}/${out.total} passed`);
  if (out.failed > 0) {
    for (const r of out.results.filter((x) => !x.passed)) {
      console.error(`FAILED: ${r.id} ${r.name}`);
    }
    process.exit(1);
  }
  process.exit(0);
}
