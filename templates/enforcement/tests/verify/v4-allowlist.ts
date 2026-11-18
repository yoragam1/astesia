import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";

export function runV4Suite(gatePath: string, rulesPath: string): { total: number; passed: number; failed: number; knownGaps: number; cases: any[] } {
  const tmpDir = join(os.tmpdir(), `astesia-verify-v4-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });

  const cases = [
    {
      id: "V4-01-MATCH-LEN-5-REJECTED",
      config: { schema: 1, allow: [{ rule: "ASTESIA-004", path: "src/secret.ts", match: "12345", reason: "Valid reason text >= 15" }] },
      file: "src/secret.ts",
      content: 'const apiKey = "sk_live_1234567890abcdef1234";\n',
      expectedExit: 2
    },
    {
      id: "V4-02-MATCH-LEN-6-ACCEPTED",
      config: { schema: 1, allow: [{ rule: "ASTESIA-004", path: "src/secret.ts", match: "123456", reason: "Valid reason text >= 15" }] },
      file: "src/secret.ts",
      content: 'const apiKey = "sk_live_1234567890abcdef1234";\n',
      expectedExit: 0
    },
    {
      id: "V4-03-REASON-LEN-14-REJECTED",
      config: { schema: 1, allow: [{ rule: "ASTESIA-004", path: "src/secret.ts", match: "123456", reason: "Short reason!!" }] },
      file: "src/secret.ts",
      content: 'const apiKey = "sk_live_1234567890abcdef1234";\n',
      expectedExit: 2
    },
    {
      id: "V4-04-RULE-000-REJECTED",
      config: { schema: 1, allow: [{ rule: "ASTESIA-000", path: "src/secret.ts", match: "123456", reason: "Valid reason text >= 15" }] },
      file: "src/secret.ts",
      content: 'const apiKey = "sk_live_1234567890abcdef1234";\n',
      expectedExit: 2
    },
    {
      id: "V4-05-WILDCARD-PATH-REJECTED",
      config: { schema: 1, allow: [{ rule: "ASTESIA-004", path: "src/*.ts", match: "123456", reason: "Valid reason text >= 15" }] },
      file: "src/secret.ts",
      content: 'const apiKey = "sk_live_1234567890abcdef1234";\n',
      expectedExit: 2
    },
    {
      id: "V4-06-INLINE-ALLOW-010-BANNED",
      config: { schema: 1 },
      file: "src/db.yml",
      content: 'PASSWORD: supersecret123 # astesia-allow: ASTESIA-010 -- intentional test credential\n',
      expectedExit: 1, // Contract: inline allow MUST be rejected for 010 -> exit 1
      isKnownGap: true,
      gapId: "VER3-005-SPEC-ALLOW-INLINE-010"
    }
  ];

  let passed = 0;
  let failed = 0;
  let knownGaps = 0;
  const evaluatedCases: any[] = [];

  for (const c of cases) {
    const caseDir = join(tmpDir, c.id);
    mkdirSync(join(caseDir, ".astesia"), { recursive: true });
    mkdirSync(join(caseDir, "src"), { recursive: true });

    writeFileSync(join(caseDir, ".astesia/gate-config.json"), JSON.stringify(c.config, null, 2), "utf8");
    writeFileSync(join(caseDir, c.file), c.content, "utf8");

    const r = spawnSync("bun", [
      gatePath,
      "--root", caseDir,
      "--rules", rulesPath,
      "--json"
    ], { encoding: "utf8" });

    const matchesExpectation = r.status === c.expectedExit;
    if (matchesExpectation) {
      passed++;
      evaluatedCases.push({ id: c.id, status: "PASSED", exitCode: r.status, expectedExit: c.expectedExit });
    } else if (c.isKnownGap) {
      knownGaps++;
      evaluatedCases.push({ id: c.id, status: "KNOWN_GAP", gapId: c.gapId, exitCode: r.status, expectedExit: c.expectedExit });
    } else {
      failed++;
      evaluatedCases.push({ id: c.id, status: "FAILED", exitCode: r.status, expectedExit: c.expectedExit });
    }

    try { rmSync(caseDir, { recursive: true, force: true }); } catch {}
  }

  try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  return { total: cases.length, passed, failed, knownGaps, cases: evaluatedCases };
}
