import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";

export function runV9Suite(gatePath: string): { total: number; passed: number; failed: number; knownGaps: number; cases: any[] } {
  const tmpDir = join(os.tmpdir(), `astesia-verify-v9-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });

  const validBase = {
    version: 1,
    rules: [
      {
        id: "TEST-001",
        kind: "line-regex",
        severity: "error",
        description: "Test rule description",
        fix: "Test rule fix",
        scope: "code",
        pattern: "test",
        extensions: [".ts", ".js"],
        origin: "Origin 1"
      }
    ]
  };

  const cases = [
    {
      id: "V9-01-RULE-DELETED",
      base: validBase,
      head: { version: 1, rules: [] },
      expectedExit: 1
    },
    {
      id: "V9-02-SEVERITY-LOWERED",
      base: validBase,
      head: {
        version: 1,
        rules: [{ ...validBase.rules[0], severity: "warn" }]
      },
      expectedExit: 1
    },
    {
      id: "V9-03-EXTENSIONS-NARROWED",
      base: validBase,
      head: {
        version: 1,
        rules: [{ ...validBase.rules[0], extensions: [".ts"] }]
      },
      expectedExit: 1
    },
    {
      id: "V9-04-EXTENSIONS-WIDENED",
      base: validBase,
      head: {
        version: 1,
        rules: [{ ...validBase.rules[0], extensions: [".ts", ".js", ".tsx"] }]
      },
      expectedExit: 0
    },
    {
      id: "V9-05-CORRUPT-JSON",
      base: validBase,
      rawHead: "{ invalid json ...",
      expectedExit: 2
    }
  ];

  let passed = 0;
  let failed = 0;
  let knownGaps = 0;
  const evaluatedCases: any[] = [];

  for (const c of cases) {
    const basePath = join(tmpDir, `${c.id}-base.json`);
    const headPath = join(tmpDir, `${c.id}-head.json`);

    writeFileSync(basePath, JSON.stringify(c.base, null, 2), "utf8");
    if (c.rawHead) {
      writeFileSync(headPath, c.rawHead, "utf8");
    } else {
      writeFileSync(headPath, JSON.stringify(c.head, null, 2), "utf8");
    }

    const r = spawnSync("bun", [
      gatePath,
      "--rules-diff",
      basePath,
      headPath
    ], { encoding: "utf8" });

    const matchesExpectation = r.status === c.expectedExit;
    if (matchesExpectation) {
      passed++;
      evaluatedCases.push({ id: c.id, status: "PASSED", exitCode: r.status, expectedExit: c.expectedExit });
    } else {
      failed++;
      evaluatedCases.push({ id: c.id, status: "FAILED", exitCode: r.status, expectedExit: c.expectedExit });
    }

    try {
      rmSync(basePath, { force: true });
      rmSync(headPath, { force: true });
    } catch {}
  }

  try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  return { total: cases.length, passed, failed, knownGaps, cases: evaluatedCases };
}
