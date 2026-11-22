import { spawnSync } from "child_process";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

export function runAllowlistRatchetSuite(gatePath: string, rulesPath: string) {
  const tmpDir = join(tmpdir(), "astesia_verify2_allow_" + Date.now());
  mkdirSync(tmpDir, { recursive: true });

  const cases: Array<{
    id: string;
    desc: string;
    setup: (dir: string) => void;
    args: string[];
    expectedExit: number;
    isKnownGap?: boolean;
  }> = [
    // Inline suppressions
    {
      id: "AR-INLINE-004-REJECTED",
      desc: "astesia-allow ASTESIA-004 is rejected with exit 1",
      setup: (d) => writeFileSync(join(d, "src/sec.ts"), '// astesia-allow: ASTESIA-004 -- Legacy API key in client bundle\nconst apiKey = "sk_live_1234567890abcdef12345678";\n', "utf8"),
      args: ["--json"],
      expectedExit: 1
    },
    {
      id: "AR-INLINE-010-REJECTED",
      desc: "astesia-allow ASTESIA-010 is rejected with exit 1",
      setup: (d) => writeFileSync(join(d, "docker-compose.yml"), '# astesia-allow: ASTESIA-010 -- Dev container password default\nservices:\n  app:\n    environment:\n      - PASSWORD=supersecretpassword123\n', "utf8"),
      args: ["--json"],
      expectedExit: 1
    },
    {
      id: "AR-INLINE-005-ACCEPTED",
      desc: "astesia-allow ASTESIA-005 with valid reason is accepted",
      setup: (d) => writeFileSync(join(d, "src/types.ts"), '// astesia-allow: ASTESIA-005 -- Dynamic third-party payload requires any\nconst data: any = JSON.parse("{}");\n', "utf8"),
      args: ["--json"],
      expectedExit: 0
    },
    {
      id: "AR-INLINE-SHORT-REASON-REJECTED",
      desc: "astesia-allow with short reason (<15) is rejected",
      setup: (d) => writeFileSync(join(d, "src/query.ts"), '// astesia-allow: ASTESIA-002 -- short\nconst q = "SELECT * FROM users";\n', "utf8"),
      args: ["--json"],
      expectedExit: 1
    },
    // Allowlist config
    {
      id: "AR-CONFIG-ALLOW-VALID",
      desc: "Valid gate-config allow entry suppresses violation",
      setup: (d) => {
        mkdirSync(join(d, ".astesia"), { recursive: true });
        writeFileSync(join(d, ".astesia/gate-config.json"), JSON.stringify({
          schema: 1,
          allow: [{ rule: "ASTESIA-004", path: "src/key.ts", match: "sk_live_1234567890abcdef12345678", reason: "Approved test credential in fixture file" }]
        }), "utf8");
        writeFileSync(join(d, "src/key.ts"), 'const apiKey = "sk_live_1234567890abcdef12345678";\n', "utf8");
      },
      args: ["--json"],
      expectedExit: 0
    },
    {
      id: "AR-CONFIG-MATCH-TOO-SHORT",
      desc: "Allow entry match < 6 exits 2",
      setup: (d) => {
        mkdirSync(join(d, ".astesia"), { recursive: true });
        writeFileSync(join(d, ".astesia/gate-config.json"), JSON.stringify({
          schema: 1,
          allow: [{ rule: "ASTESIA-004", path: "src/key.ts", match: "short", reason: "Valid reason here with fifteen chars" }]
        }), "utf8");
        writeFileSync(join(d, "src/key.ts"), 'const apiKey = "sk_live_short";\n', "utf8");
      },
      args: ["--json"],
      expectedExit: 2
    },
    {
      id: "AR-CONFIG-REASON-TOO-SHORT",
      desc: "Allow entry reason < 15 exits 2",
      setup: (d) => {
        mkdirSync(join(d, ".astesia"), { recursive: true });
        writeFileSync(join(d, ".astesia/gate-config.json"), JSON.stringify({
          schema: 1,
          allow: [{ rule: "ASTESIA-004", path: "src/key.ts", match: "sk_live_1234567890", reason: "short" }]
        }), "utf8");
        writeFileSync(join(d, "src/key.ts"), 'const apiKey = "sk_live_1234567890abcdef";\n', "utf8");
      },
      args: ["--json"],
      expectedExit: 2
    },
    {
      id: "AR-CONFIG-DISALLOWED-RULE",
      desc: "Allow entry rule other than 004/010 exits 2",
      setup: (d) => {
        mkdirSync(join(d, ".astesia"), { recursive: true });
        writeFileSync(join(d, ".astesia/gate-config.json"), JSON.stringify({
          schema: 1,
          allow: [{ rule: "ASTESIA-005", path: "src/any.ts", match: "const x: any = 1;", reason: "Trying to allow non-secret rule" }]
        }), "utf8");
        writeFileSync(join(d, "src/any.ts"), 'const x: any = 1;\n', "utf8");
      },
      args: ["--json"],
      expectedExit: 2
    },
    {
      id: "AR-CONFIG-WILDCARD-PATH",
      desc: "Allow entry wildcard path exits 2",
      setup: (d) => {
        mkdirSync(join(d, ".astesia"), { recursive: true });
        writeFileSync(join(d, ".astesia/gate-config.json"), JSON.stringify({
          schema: 1,
          allow: [{ rule: "ASTESIA-004", path: "src/*.ts", match: "sk_live_1234567890", reason: "Valid reason here with fifteen chars" }]
        }), "utf8");
        writeFileSync(join(d, "src/key.ts"), 'const apiKey = "sk_live_1234567890";\n', "utf8");
      },
      args: ["--json"],
      expectedExit: 2
    },
    // Baseline rejection
    {
      id: "AR-BASE-REJECT-000",
      desc: "--update-baseline rejects ASTESIA-000",
      setup: (d) => writeFileSync(join(d, "src/imp.ts"), 'import { x } from "./none";\n', "utf8"),
      args: ["--update-baseline"],
      expectedExit: 1
    },
    {
      id: "AR-BASE-REJECT-004",
      desc: "--update-baseline rejects ASTESIA-004",
      setup: (d) => writeFileSync(join(d, "src/sec.ts"), 'const apiKey = "sk_live_1234567890abcdef12345678";\n', "utf8"),
      args: ["--update-baseline"],
      expectedExit: 1
    },
    {
      id: "AR-BASE-REJECT-010",
      desc: "--update-baseline rejects ASTESIA-010",
      setup: (d) => writeFileSync(join(d, "docker-compose.yml"), 'services:\n  db:\n    environment:\n      PASSWORD: secret12345678\n', "utf8"),
      args: ["--update-baseline"],
      expectedExit: 1
    }
  ];

  const results: any[] = [];
  let passedCount = 0;
  let failedCount = 0;
  let gapCount = 0;

  for (const c of cases) {
    const caseDir = join(tmpDir, c.id);
    mkdirSync(join(caseDir, "src"), { recursive: true });
    c.setup(caseDir);

    const r = spawnSync("bun", [gatePath, "--root", caseDir, "--rules", rulesPath, ...c.args], { encoding: "utf8" });
    try { rmSync(caseDir, { recursive: true }); } catch {}

    const passed = r.status === c.expectedExit;
    if (passed) {
      passedCount++;
      results.push({ id: c.id, status: "PASSED", desc: c.desc });
    } else if (c.isKnownGap) {
      gapCount++;
      results.push({ id: c.id, status: "KNOWN_GAP", desc: c.desc });
    } else {
      failedCount++;
      results.push({ id: c.id, status: "FAILED", desc: c.desc, expectedExit: c.expectedExit, got: r.status });
    }
  }

  try { rmSync(tmpDir, { recursive: true }); } catch {}

  return {
    total: cases.length,
    passed: passedCount,
    failed: failedCount,
    known_gaps: gapCount,
    results
  };
}
