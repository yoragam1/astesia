/**
 * tools/tests/retention-suite.ts
 * Unit tests for retention-check.ts in fixture mode and CLI execution.
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";
import { evaluateRetention } from "../retention-check";

export interface SuiteResult {
  total: number;
  passed: number;
  failed: number;
  known_gaps: number;
}

export function runRetentionSuite(): SuiteResult {
  console.log("\n--- Retention Check Suite ---");
  let total = 0;
  let passed = 0;
  let failed = 0;

  function assert(name: string, ok: boolean, msg?: string) {
    total++;
    if (ok) {
      passed++;
      console.log(`  [PASS] ${name}`);
    } else {
      failed++;
      console.log(`  [FAIL] ${name}${msg ? ": " + msg : ""}`);
    }
  }

  // Fixture tests
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "retention-test-"));
  const dirA = path.join(tempDir, "base");
  const dirB = path.join(tempDir, "head");
  fs.mkdirSync(dirA, { recursive: true });
  fs.mkdirSync(dirB, { recursive: true });

  try {
    // 1. Clean retention: Head retains same or more normative keywords
    fs.writeFileSync(
      path.join(dirA, "sample.md"),
      "# Section 1\nEngineers MUST test everything.\nAgents MUST verify output.\n"
    );
    fs.writeFileSync(
      path.join(dirB, "sample.md"),
      "# Section 1\nEngineers MUST test everything thoroughly.\nAgents MUST verify output before commit.\n"
    );

    const report1 = evaluateRetention(
      (f) => fs.readFileSync(path.join(dirA, f), "utf8"),
      (f) => fs.readFileSync(path.join(dirB, f), "utf8"),
      ["sample.md"]
    );
    assert("Clean retention exits 0 uncompensated losses", report1.uncompensated_losses === 0);
    assert("Clean retention has 0 fractional headings", report1.fractional_headings.length === 0);

    // 2. Uncompensated loss: Head drops 50% without gate ref
    fs.writeFileSync(
      path.join(dirB, "sample.md"),
      "# Section 1\nEngineers MUST test everything.\nAgents can verify output.\n"
    );
    const report2 = evaluateRetention(
      (f) => fs.readFileSync(path.join(dirA, f), "utf8"),
      (f) => fs.readFileSync(path.join(dirB, f), "utf8"),
      ["sample.md"]
    );
    assert("Uncompensated loss detected when >=30% dropped without gate ref", report2.uncompensated_losses === 1);

    // 3. Compensated loss: Head drops 50% WITH gate ref (ASTESIA-001)
    fs.writeFileSync(
      path.join(dirB, "sample.md"),
      "# Section 1\nEngineers MUST test everything (enforced by ASTESIA-001).\nAgents can verify output.\n"
    );
    const report3 = evaluateRetention(
      (f) => fs.readFileSync(path.join(dirA, f), "utf8"),
      (f) => fs.readFileSync(path.join(dirB, f), "utf8"),
      ["sample.md"]
    );
    assert("Compensated loss with gate ref ASTESIA-001 is permitted", report3.uncompensated_losses === 0);

    // 4. Fractional heading: Head introduces new fractional heading # 29.5
    fs.writeFileSync(
      path.join(dirB, "sample.md"),
      "# Section 1\nEngineers MUST test everything.\nAgents MUST verify output.\n\n# 29.5 New Heading\nMust follow rule.\n"
    );
    const report4 = evaluateRetention(
      (f) => fs.readFileSync(path.join(dirA, f), "utf8"),
      (f) => fs.readFileSync(path.join(dirB, f), "utf8"),
      ["sample.md"]
    );
    assert("New fractional heading # 29.5 is flagged", report4.fractional_headings.length > 0);

    // 5. CLI Execution test via child_process
    let cliCleanOk = false;
    try {
      // Revert sample.md in dirB to clean
      fs.writeFileSync(
        path.join(dirB, "sample.md"),
        "# Section 1\nEngineers MUST test everything.\nAgents MUST verify output.\n"
      );
      execSync(`bun tools/retention-check.ts --fixture "${dirA}" "${dirB}"`, { stdio: "pipe" });
      cliCleanOk = true;
    } catch {}
    assert("CLI execution returns exit code 0 on clean fixture", cliCleanOk);

    let cliFailOk = false;
    try {
      fs.writeFileSync(
        path.join(dirB, "sample.md"),
        "# Section 1\nEngineers can test everything.\nAgents can verify output.\n"
      );
      execSync(`bun tools/retention-check.ts --fixture "${dirA}" "${dirB}"`, { stdio: "pipe" });
    } catch (err: any) {
      if (err.status === 1) cliFailOk = true;
    }
    assert("CLI execution returns exit code 1 on uncompensated loss fixture", cliFailOk);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  return { total, passed, failed, known_gaps: 0 };
}

if (import.meta.main || require.main === module) {
  const res = runRetentionSuite();
  if (res.failed > 0) process.exit(1);
}
