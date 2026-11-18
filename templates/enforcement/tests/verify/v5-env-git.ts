import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";

export function runV5Suite(gatePath: string, rulesPath: string): { total: number; passed: number; failed: number; knownGaps: number; cases: any[] } {
  const tmpDir = join(os.tmpdir(), `astesia-verify-v5-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });

  const cases = [
    {
      id: "V5-01-IGNORED-UNTRACKED-SKIPPED",
      setup: (dir: string) => {
        spawnSync("git", ["init"], { cwd: dir });
        writeFileSync(join(dir, ".gitignore"), ".env\n", "utf8");
        writeFileSync(join(dir, ".env"), "SECRET_KEY=supersecret123456\n", "utf8");
      },
      expectedExit: 0,
      expectSkipped: 1
    },
    {
      id: "V5-02-TRACKED-VIOLATION",
      setup: (dir: string) => {
        spawnSync("git", ["init"], { cwd: dir });
        spawnSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
        spawnSync("git", ["config", "user.name", "Test"], { cwd: dir });
        writeFileSync(join(dir, ".env"), "SECRET_KEY=supersecret123456\n", "utf8");
        spawnSync("git", ["add", ".env"], { cwd: dir });
        spawnSync("git", ["commit", "-m", "add env"], { cwd: dir });
      },
      expectedExit: 1,
      expectSkipped: 0
    },
    {
      id: "V5-03-UNTRACKED-NOT-IGNORED-VIOLATION",
      setup: (dir: string) => {
        spawnSync("git", ["init"], { cwd: dir });
        writeFileSync(join(dir, ".env"), "SECRET_KEY=supersecret123456\n", "utf8");
      },
      expectedExit: 1,
      expectSkipped: 0
    },
    {
      id: "V5-04-NO-GIT-VIOLATION",
      setup: (dir: string) => {
        writeFileSync(join(dir, ".env"), "SECRET_KEY=supersecret123456\n", "utf8");
      },
      expectedExit: 1,
      expectSkipped: 0
    },
    {
      id: "V5-05-ENV-EXAMPLE-EXEMPT",
      setup: (dir: string) => {
        writeFileSync(join(dir, ".env.example"), "SECRET_KEY=placeholder_secret_key\n", "utf8");
      },
      expectedExit: 0,
      expectSkipped: 0
    }
  ];

  let passed = 0;
  let failed = 0;
  let knownGaps = 0;
  const evaluatedCases: any[] = [];

  for (const c of cases) {
    const caseDir = join(tmpDir, c.id);
    mkdirSync(caseDir, { recursive: true });
    c.setup(caseDir);

    const r = spawnSync("bun", [
      gatePath,
      "--root", caseDir,
      "--rules", rulesPath,
      "--json"
    ], { encoding: "utf8" });

    let skippedCount = 0;
    try {
      const data = JSON.parse(r.stdout);
      skippedCount = data.env_ignored_skipped || 0;
    } catch {}

    const matchesExpectation = r.status === c.expectedExit && skippedCount === c.expectSkipped;
    if (matchesExpectation) {
      passed++;
      evaluatedCases.push({ id: c.id, status: "PASSED", exitCode: r.status, skippedCount });
    } else {
      failed++;
      evaluatedCases.push({ id: c.id, status: "FAILED", exitCode: r.status, skippedCount, expectedExit: c.expectedExit, expectSkipped: c.expectSkipped });
    }

    try { rmSync(caseDir, { recursive: true, force: true }); } catch {}
  }

  try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  return { total: cases.length, passed, failed, knownGaps, cases: evaluatedCases };
}
