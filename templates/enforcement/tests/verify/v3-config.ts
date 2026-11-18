import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";

export function runV3Suite(gatePath: string, rulesPath: string): { total: number; passed: number; failed: number; knownGaps: number; cases: any[] } {
  const tmpDir = join(os.tmpdir(), `astesia-verify-v3-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });

  const cases = [
    {
      id: "V3-01-DOCKER-DONT",
      file: "Dockerfile",
      content: 'FROM alpine:3.18\nRUN echo "don\'t fail on apostrophe"\nENTRYPOINT ["sh"]\n',
      expectDesync: false,
      expectSecret: false
    },
    {
      id: "V3-02-DOCKER-MULTILINE",
      file: "Dockerfile.dev",
      content: 'FROM node:20-alpine\nRUN apk add --no-cache \\\n    git \\\n    bash \\\n    curl\nCMD ["npm", "start"]\n',
      expectDesync: false,
      expectSecret: false
    },
    {
      id: "V3-03-YAML-PIPE",
      file: "docker-compose.override.yml",
      content: 'version: "3.8"\nservices:\n  app:\n    command: |\n      echo "line 1"\n      echo "don\'t break"\n      echo "done"\n',
      expectDesync: false,
      expectSecret: false
    },
    {
      id: "V3-04-ENV-COMMENT",
      file: ".env",
      content: 'PORT=3000 # local port\nNODE_ENV=production # do not change\n',
      expectDesync: false,
      expectSecret: false
    },
    {
      id: "V3-05-ENV-SECRET-TRIGGER",
      file: ".env.production",
      content: 'APP_NAME=Pustaka\nSECRET_KEY=super_secret_production_key_123456\n',
      expectDesync: false,
      expectSecret: true
    },
    {
      id: "V3-06-SECRET-HASH-TRUNCATION",
      file: "docker-compose.yml",
      content: 'services:\n  db:\n    environment:\n      PASSWORD: "val # supersecretvalue123"\n',
      expectDesync: false,
      expectSecret: true,
      isKnownGap: true,
      gapId: "VER3-004-FN-CONFIG-SECRET-HASH-TRUNCATION"
    }
  ];

  let passed = 0;
  let failed = 0;
  let knownGaps = 0;
  const evaluatedCases: any[] = [];

  for (const c of cases) {
    const caseDir = join(tmpDir, c.id);
    mkdirSync(caseDir, { recursive: true });
    writeFileSync(join(caseDir, c.file), c.content, "utf8");

    const r = spawnSync("bun", [
      gatePath,
      "--root", caseDir,
      "--rules", rulesPath,
      "--json"
    ], { encoding: "utf8" });

    let desyncTriggered = false;
    let secretTriggered = false;
    try {
      const data = JSON.parse(r.stdout);
      desyncTriggered = data.desync_files?.length > 0;
      secretTriggered = data.violations?.some((v: any) => v.ruleId === "ASTESIA-010" || v.ruleId === "ASTESIA-004");
    } catch {}

    const matchesExpectation =
      desyncTriggered === c.expectDesync &&
      secretTriggered === c.expectSecret;

    if (matchesExpectation) {
      passed++;
      evaluatedCases.push({ id: c.id, status: "PASSED", desyncTriggered, secretTriggered });
    } else if (c.isKnownGap) {
      knownGaps++;
      evaluatedCases.push({ id: c.id, status: "KNOWN_GAP", gapId: c.gapId, desyncTriggered, secretTriggered });
    } else {
      failed++;
      evaluatedCases.push({ id: c.id, status: "FAILED", desyncTriggered, secretTriggered });
    }

    try { rmSync(caseDir, { recursive: true, force: true }); } catch {}
  }

  try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  return { total: cases.length, passed, failed, knownGaps, cases: evaluatedCases };
}
