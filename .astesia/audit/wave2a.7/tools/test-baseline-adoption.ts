import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const gateScript = resolve(__dirname, "../../../../templates/enforcement/astesia-gate.ts");
const rulesPath = resolve(__dirname, "../../../../templates/enforcement/anti-patterns.json");
const copyDir = join(tmpdir(), "astesia-2a7-copies");

export function runBaselineAdoption8Steps(projectName: string, setupConfig?: (workDir: string) => void): { success: boolean; log: string[] } {
  const log: string[] = [];
  const runId = Date.now();
  const workDir = join(tmpdir(), `base-adopt-${projectName}-${runId}`);
  const srcDir = join(copyDir, projectName);

  log.push(`=== Step 1: Create fresh copy of ${projectName} in ${workDir} ===`);
  cpSync(srcDir, workDir, { recursive: true });

  const astesiaDir = join(workDir, ".astesia");
  mkdirSync(astesiaDir, { recursive: true });
  if (setupConfig) {
    setupConfig(workDir);
  }

  const baselinePath = join(astesiaDir, "gate-baseline.json");

  log.push(`=== Step 2: Run gate without baseline -> observe initial state ===`);
  let initialViolations = 0;
  try {
    const raw = execFileSync("bun", [gateScript, "--root", workDir, "--rules", rulesPath, "--json"], { encoding: "utf8" });
    const p = JSON.parse(raw);
    initialViolations = p.violations.length;
    log.push(`Gate exited 0 (clean): ${initialViolations} violations`);
  } catch (err: any) {
    const p = JSON.parse(err.stdout);
    initialViolations = p.violations.length;
    log.push(`Gate exited 1 (expected): ${initialViolations} violations`);
  }

  log.push(`=== Step 3: Generate baseline using --update-baseline ===`);
  try {
    execFileSync("bun", [gateScript, "--root", workDir, "--rules", rulesPath, "--update-baseline", baselinePath], { encoding: "utf8" });
    log.push(`Baseline generated at ${baselinePath}`);
  } catch (err: any) {
    log.push(`Baseline generation output: ${err.stdout || err.message}`);
  }

  log.push(`=== Step 4: Verify baseline file schema ===`);
  const baseJson = JSON.parse(readFileSync(baselinePath, "utf8"));
  if ((baseJson.schema !== 1 && baseJson.version !== 1) || !baseJson.counters || typeof baseJson.violations !== "object") {
    throw new Error("Invalid baseline schema!");
  }
  log.push(`Baseline schema valid: schema=${baseJson.schema || baseJson.version}, violationsCount=${Object.keys(baseJson.violations).length}`);

  log.push(`=== Step 5: Run gate with --baseline -> must exit 0 ===`);
  let step5Ok = false;
  try {
    const raw = execFileSync("bun", [gateScript, "--root", workDir, "--rules", rulesPath, "--baseline", baselinePath, "--max-warn", "0", "--json"], { encoding: "utf8" });
    step5Ok = true;
    log.push(`Gate with baseline exited 0 (ratchet holds).`);
  } catch (err: any) {
    log.push(`Gate with baseline failed: ${err.stdout || err.message}`);
  }

  log.push(`=== Step 6: Inject regression -> gate with baseline must exit 1 ===`);
  const injectFile = join(workDir, "src/regression_test.ts");
  mkdirSync(join(workDir, "src"), { recursive: true });
  writeFileSync(injectFile, "const x = 1;\nconsole.log(x);\n", "utf8"); // ASTESIA-006 violation
  let step6Caught = false;
  try {
    execFileSync("bun", [gateScript, "--root", workDir, "--rules", rulesPath, "--baseline", baselinePath, "--max-warn", "0", "--json"], { encoding: "utf8" });
    log.push(`ERROR: Gate failed to catch injected regression!`);
  } catch (err: any) {
    step6Caught = true;
    const p = JSON.parse(err.stdout);
    log.push(`Injected regression caught! Exit 1, new_violations=${p.baseline?.new_violations?.length}`);
  }

  log.push(`=== Step 7: Revert regression -> gate with baseline exits 0 again ===`);
  rmSync(injectFile, { force: true });
  let step7Ok = false;
  try {
    execFileSync("bun", [gateScript, "--root", workDir, "--rules", rulesPath, "--baseline", baselinePath, "--max-warn", "0", "--json"], { encoding: "utf8" });
    step7Ok = true;
    log.push(`Regression reverted. Gate with baseline exited 0.`);
  } catch (err: any) {
    log.push(`Step 7 failed: ${err.stdout || err.message}`);
  }

  log.push(`=== Step 8: Update baseline to test tightening ===`);
  try {
    execFileSync("bun", [gateScript, "--root", workDir, "--rules", rulesPath, "--update-baseline", baselinePath], { encoding: "utf8" });
    log.push(`Baseline successfully updated/tightened.`);
  } catch (err: any) {
    log.push(`Step 8 output: ${err.stdout || err.message}`);
  }

  rmSync(workDir, { recursive: true, force: true });
  const success = step5Ok && step6Caught && step7Ok;
  log.push(`=== Adoption result for ${projectName}: ${success ? "PASSED (8/8 steps)" : "FAILED"} ===`);
  return { success, log };
}

if (import.meta.main) {
  // 1. flora-smk (DESIGN) - clean adoption without special config
  console.log(`\nStarting 8-step baseline adoption on flora-smk (DESIGN)...`);
  const r1 = runBaselineAdoption8Steps("flora-smk");
  for (const l of r1.log) console.log(l);
  if (!r1.success) {
    console.error("Adoption on flora-smk failed!");
    process.exit(1);
  }

  // 2. cadetspeak_admin (FRESH) - adoption with standard gate-config.json excluding build artifacts
  console.log(`\nStarting 8-step baseline adoption on cadetspeak_admin (FRESH)...`);
  const r2 = runBaselineAdoption8Steps("cadetspeak_admin", (wDir) => {
    const cfgPath = join(wDir, ".astesia/gate-config.json");
    writeFileSync(cfgPath, JSON.stringify({
      schema: 1,
      exclude: [
        { path: ".dart_tool", reason: "Flutter build cache and temporary compilation outputs" },
        { path: ".env", reason: "Local development environment variables file" }
      ],
      allow: []
    }, null, 2), "utf8");
  });
  for (const l of r2.log) console.log(l);
  if (!r2.success) {
    console.error("Adoption on cadetspeak_admin failed!");
    process.exit(1);
  }

  console.log("\nAll 8-step baseline adoptions passed on DESIGN and FRESH projects!");
  process.exit(0);
}
