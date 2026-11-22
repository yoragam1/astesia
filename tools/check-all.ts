/**
 * tools/check-all.ts
 * Sequential runner for all Astesia framework validation checks:
 * 1. Framework Linter (FL-001..FL-020)
 * 2. Unified Tool Tests & Mutations
 * 3. Token Budget Limits
 * 4. Manifest Integrity Verification
 *
 * Exits with code 0 if all checks succeed, or code 1 if any check fails.
 */

import { execSync } from "child_process";
import * as path from "path";

interface Step {
  name: string;
  command: string;
}

const STEPS: Step[] = [
  { name: "Framework Linter", command: "bun tools/framework-lint.ts" },
  { name: "Unified Tools Test Suite", command: "bun tools/tests/run.ts" },
  { name: "Token Budget Verification", command: "bun tools/token-budget.ts --check" },
  { name: "Manifest Integrity Verification", command: "bun tools/verify-manifest.ts" },
];

async function runCheckAll() {
  console.log("=================================================");
  console.log("       ASTESIA COMPREHENSIVE HEALTH CHECK        ");
  console.log("=================================================\n");

  const results: Array<{ name: string; success: boolean; durationMs: number; error?: string }> = [];
  let allPassed = true;

  for (const step of STEPS) {
    const start = Date.now();
    console.log(`>>> Running [${step.name}]...`);
    try {
      execSync(step.command, {
        cwd: path.resolve(__dirname, ".."),
        stdio: "inherit",
        env: process.env,
      });
      const durationMs = Date.now() - start;
      console.log(`[PASS] ${step.name} completed in ${(durationMs / 1000).toFixed(2)}s\n`);
      results.push({ name: step.name, success: true, durationMs });
    } catch (err: any) {
      const durationMs = Date.now() - start;
      console.error(`[FAIL] ${step.name} failed after ${(durationMs / 1000).toFixed(2)}s\n`);
      results.push({ name: step.name, success: false, durationMs, error: err.message });
      allPassed = false;
      // Continue to run all checks or fail fast? Requirement says:
      // "menjalankan keempat pemeriksaan di atas secara sekuensial dan keluar dengan kode gabungan (0 jika semua sukses, 1 jika salah satu gagal)"
    }
  }

  console.log("=================================================");
  console.log("                 HEALTH SUMMARY                  ");
  console.log("=================================================");
  for (const r of results) {
    console.log(`  ${r.success ? "[PASS]" : "[FAIL]"} ${r.name.padEnd(35)} (${(r.durationMs / 1000).toFixed(2)}s)`);
  }
  console.log("-------------------------------------------------");
  console.log(`Final Status: ${allPassed ? "ALL CHECKS PASSED (0)" : "ONE OR MORE CHECKS FAILED (1)"}\n`);

  process.exit(allPassed ? 0 : 1);
}

runCheckAll().catch((err) => {
  console.error("[FATAL] Check runner error:", err);
  process.exit(1);
});
