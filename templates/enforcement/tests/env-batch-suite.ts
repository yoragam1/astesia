/**
 * templates/enforcement/tests/env-batch-suite.ts
 * Tests for F-B batching of git calls (VER3-007b):
 * - Max 3 spawns per run regardless of env count
 * - 0 spawns when no env candidates exist
 * - Tracked .env in git that matches .gitignore is NOT skipped (closing mutant M6)
 * - Paths with spaces
 * - Fail-closed on git error
 */
import { classifyEnvFiles, SpawnSyncFn } from "../astesia-gate";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

export function runEnvBatchSuite(testTmpDir: string): { total: number; passed: number; failed: number; errors: string[] } {
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

  // 1. Mock spawn tracking test for 0, 1, 5, 100 files
  {
    let recordedSpawns = 0;
    const mockSpawn: SpawnSyncFn = (cmd, args, opts) => {
      recordedSpawns++;
      if (args.includes("rev-parse")) {
        return { status: 0, stdout: "true\n", stderr: "" };
      }
      if (args.includes("ls-files")) {
        return { status: 0, stdout: "", stderr: "" };
      }
      if (args.includes("check-ignore")) {
        return { status: 0, stdout: opts.input || "", stderr: "" };
      }
      return { status: 0, stdout: "", stderr: "" };
    };

    // 0 candidates
    recordedSpawns = 0;
    const res0 = classifyEnvFiles("D:/dummy", ["src/index.ts", "package.json"], mockSpawn);
    assert("0 env files -> 0 spawns", res0.spawnCount === 0 && recordedSpawns === 0);

    // 1 candidate
    recordedSpawns = 0;
    const res1 = classifyEnvFiles("D:/dummy", [".env"], mockSpawn);
    assert("1 env file -> <= 3 spawns", res1.spawnCount <= 3 && recordedSpawns <= 3);

    // 5 candidates
    recordedSpawns = 0;
    const files5 = [".env", ".env.local", "pkg/.env", "pkg/.env.test", "app/.env.prod"];
    const res5 = classifyEnvFiles("D:/dummy", files5, mockSpawn);
    assert("5 env files -> <= 3 spawns", res5.spawnCount <= 3 && recordedSpawns <= 3);

    // 100 candidates
    recordedSpawns = 0;
    const files100: string[] = [];
    for (let i = 0; i < 100; i++) files100.push(`pkg_${i}/.env`);
    const res100 = classifyEnvFiles("D:/dummy", files100, mockSpawn);
    assert("100 env files -> <= 3 spawns", res100.spawnCount <= 3 && recordedSpawns <= 3);
  }

  // 2. Real git repo test: tracked .env in git that matches .gitignore is NOT skipped (Mutant M6)
  {
    const suiteDir = join(testTmpDir, `env-batch-${Date.now()}`);
    mkdirSync(suiteDir, { recursive: true });

    writeFileSync(join(suiteDir, ".gitignore"), ".env\n", "utf8");
    writeFileSync(join(suiteDir, ".env"), "SECRET=sk_live_1234567890abcdef\n", "utf8");
    writeFileSync(join(suiteDir, ".env.untracked"), "SECRET=sk_live_1234567890abcdef\n", "utf8");

    spawnSync("git", ["init"], { cwd: suiteDir });
    spawnSync("git", ["config", "user.email", "audit@astesia.dev"], { cwd: suiteDir });
    spawnSync("git", ["config", "user.name", "Auditor"], { cwd: suiteDir });
    // Intentionally commit .env into git index (using -f since .gitignore already has .env)
    spawnSync("git", ["add", "-f", ".env"], { cwd: suiteDir });
    spawnSync("git", ["add", ".gitignore"], { cwd: suiteDir });
    spawnSync("git", ["commit", "-m", "tracked env"], { cwd: suiteDir });

    // .env is tracked in git index, even though .gitignore matches .env
    // .env.untracked is NOT tracked
    writeFileSync(join(suiteDir, ".gitignore"), ".env\n.env.untracked\n", "utf8");

    const classification = classifyEnvFiles(suiteDir, [".env", ".env.untracked"]);
    assert(
      "Tracked .env is NOT in ignoredUntracked (Mutant M6)",
      !classification.ignoredUntracked.has(".env")
    );
    assert(
      "Untracked .env is in ignoredUntracked",
      classification.ignoredUntracked.has(".env.untracked")
    );
    assert("Spawn count is <= 3", classification.spawnCount <= 3);

    try { rmSync(suiteDir, { recursive: true, force: true }); } catch {}
  }

  // 3. Path with spaces
  {
    const suiteDir = join(testTmpDir, `env-spaces-${Date.now()}`);
    mkdirSync(suiteDir, { recursive: true });
    const nestedDir = join(suiteDir, "nested folder with spaces");
    mkdirSync(nestedDir, { recursive: true });

    writeFileSync(join(suiteDir, ".gitignore"), "nested*/**/.env*\n", "utf8");
    writeFileSync(join(nestedDir, ".env.local"), "SECRET=val\n", "utf8");

    spawnSync("git", ["init"], { cwd: suiteDir });
    spawnSync("git", ["config", "user.email", "audit@astesia.dev"], { cwd: suiteDir });
    spawnSync("git", ["config", "user.name", "Auditor"], { cwd: suiteDir });
    spawnSync("git", ["add", ".gitignore"], { cwd: suiteDir });
    spawnSync("git", ["commit", "-m", "init"], { cwd: suiteDir });

    const relPath = "nested folder with spaces/.env.local";
    const classification = classifyEnvFiles(suiteDir, [relPath]);
    assert(
      "Path with spaces correctly classified as ignoredUntracked",
      classification.ignoredUntracked.has(relPath)
    );

    try { rmSync(suiteDir, { recursive: true, force: true }); } catch {}
  }

  // 4. Fail-closed on git error / non-git directory
  {
    const classification = classifyEnvFiles("D:/non-existent-directory-abc", [".env"]);
    assert(
      "Non-git dir returns empty set (fail-closed)",
      classification.ignoredUntracked.size === 0
    );
  }

  return { total, passed, failed: total - passed, errors };
}

if (import.meta.main) {
  const tmp = join(__dirname, "../../../.astesia/audit/tmp");
  const res = runEnvBatchSuite(tmp);
  console.log(`Env Batch Suite: ${res.passed}/${res.total} passed`);
  if (res.errors.length > 0) {
    for (const e of res.errors) console.error(e);
    process.exit(1);
  }
  process.exit(0);
}
