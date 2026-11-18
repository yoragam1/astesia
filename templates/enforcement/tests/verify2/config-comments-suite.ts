import { spawnSync } from "child_process";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { preprocessSource } from "../../astesia-gate";

export function runConfigCommentsSuite(gatePath: string, rulesPath: string) {
  const tmpDir = join(tmpdir(), "astesia_verify2_cfg_" + Date.now());
  mkdirSync(tmpDir, { recursive: true });

  const cases: Array<{
    id: string;
    desc: string;
    test: () => boolean;
    isKnownGap?: boolean;
  }> = [
    {
      id: "CFG-HASH-IN-DOUBLE-QUOTES-YAML",
      desc: "Hash inside double quotes in YAML preserved in codeLines and not cut to comments",
      test: () => {
        const prep = preprocessSource('SECRET: "my # secret # token123456"\n', "docker-compose.yml");
        return prep.codeLines[0].includes('"my # secret # token123456"') && !prep.commentLines[0].includes("secret");
      }
    },
    {
      id: "CFG-HASH-IN-SINGLE-QUOTES-YAML",
      desc: "Hash inside single quotes in YAML preserved in codeLines and not cut to comments",
      test: () => {
        const prep = preprocessSource("PASSWORD: 'my # secret # pass99'\n", "docker-compose.yml");
        return prep.codeLines[0].includes("'my # secret # pass99'") && !prep.commentLines[0].includes("secret");
      }
    },
    {
      id: "CFG-COMMENT-AT-END-OF-LINE-YAML",
      desc: "Unquoted comment at end of line in YAML is placed into commentLines and stripped from codeLines",
      test: () => {
        const prep = preprocessSource("TIMEOUT: 30 # this is a comment\n", "docker-compose.yml");
        return !prep.codeLines[0].includes("this is a comment") && prep.commentLines[0].includes("this is a comment");
      }
    },
    {
      id: "CFG-DOCKERFILE-HASH-IN-QUOTES",
      desc: "Hash inside quotes in Dockerfile preserved in codeLines",
      test: () => {
        const prep = preprocessSource('RUN echo "password # 123" > /tmp/pwd\n', "Dockerfile");
        return prep.codeLines[0].includes('"password # 123"') && !prep.commentLines[0].includes("password");
      }
    },
    {
      id: "CFG-ENV-COMMENTED-SECRET-IN-SCAN",
      desc: "Commented secret in .env during directory scan (VER4-001 GAP: lowerName.startsWith('.env') fails on absolute path)",
      test: () => {
        const caseDir = join(tmpDir, "cfg_env_gap");
        mkdirSync(caseDir, { recursive: true });
        writeFileSync(join(caseDir, ".env"), "# PASSWORD=secretpassword123456\nAPP=1\n", "utf8");
        spawnSync("git", ["init"], { cwd: caseDir });
        spawnSync("git", ["add", "."], { cwd: caseDir });
        const r = spawnSync("bun", [gatePath, "--root", caseDir, "--rules", rulesPath, "--json"], { encoding: "utf8" });
        try { rmSync(caseDir, { recursive: true }); } catch {}
        let json: any = {};
        try { json = JSON.parse(r.stdout); } catch {}
        // If config profile worked on .env, commented secret would NOT trigger ASTESIA-010.
        // Due to VER4-001, it triggers ASTESIA-010.
        const has010 = (json.violations || []).some((v: any) => v.ruleId === "ASTESIA-010");
        return !has010; // Must NOT trigger if working correctly
      },
      isKnownGap: true // VER4-001
    }
  ];

  const results: any[] = [];
  let passedCount = 0;
  let failedCount = 0;
  let gapCount = 0;

  for (const c of cases) {
    const passed = c.test();
    if (passed) {
      passedCount++;
      results.push({ id: c.id, status: "PASSED", desc: c.desc });
    } else if (c.isKnownGap) {
      gapCount++;
      results.push({ id: c.id, status: "KNOWN_GAP", desc: c.desc });
    } else {
      failedCount++;
      results.push({ id: c.id, status: "FAILED", desc: c.desc });
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
