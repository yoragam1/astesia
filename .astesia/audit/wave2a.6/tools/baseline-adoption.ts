/**
 * .astesia/audit/wave2a.6/tools/baseline-adoption.ts
 * Tests baseline adoption lifecycle on 2 projects:
 * 1. flora-smk (Design Set)
 * 2. eduNEXA (Hold-out Set)
 *
 * Sequence:
 * - Init baseline with --update-baseline (with validated allow/exclude/imports) -> exit 0
 * - Verify --baseline -> exit 0
 * - Add violation -> exit 1
 * - Restore violation -> exit 0
 * - Add new unbaselined generated file -> exit 1
 * - Restore generated file -> exit 0
 * - Add new imports entry in config -> exit 1 (imports_declared increased)
 * - Restore config -> exit 0
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import os from "node:os";
import { isolatedEnv } from "../../../../templates/enforcement/tests/isolated-env";

const REPO_ROOT = resolve(__dirname, "../../../..");
const GATE_PATH = join(REPO_ROOT, "templates/enforcement/astesia-gate.ts");
const RULES_PATH = join(REPO_ROOT, "templates/enforcement/anti-patterns.json");

interface AdoptionStepResult {
  step: string;
  expectedExit: number;
  actualExit: number;
  passed: boolean;
  stderr: string;
}

interface ProjectAdoptionResult {
  projectName: string;
  passed: boolean;
  steps: AdoptionStepResult[];
}

function copyClean(src: string, dest: string) {
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, {
    recursive: true,
    filter: (source) => {
      const b = basename(source);
      if (b === ".git" || b === "node_modules" || b === "vendor" || b === ".next" || b === "dist" || b === ".turbo") {
        return false;
      }
      return true;
    }
  });
}

function testProjectAdoption(
  projectName: string,
  srcDir: string,
  initialConfig: Record<string, unknown>
): ProjectAdoptionResult {
  const env = isolatedEnv();
  const tmpDir = join(os.tmpdir(), `astesia-adopt-${projectName}-${Date.now()}`);
  copyClean(srcDir, tmpDir);

  const steps: AdoptionStepResult[] = [];
  const baseFile = join(tmpDir, ".astesia/gate-baseline.json");
  const cfgFile = join(tmpDir, ".astesia/gate-config.json");
  mkdirSync(join(tmpDir, ".astesia"), { recursive: true });

  // Seed initial validated config
  const initialConfigStr = JSON.stringify(initialConfig, null, 2);
  writeFileSync(cfgFile, initialConfigStr, "utf8");

  function runGate(args: string[]): { status: number; stdout: string; stderr: string } {
    const r = spawnSync(process.execPath, [GATE_PATH, "--root", tmpDir, "--rules", RULES_PATH, ...args], {
      env: env as NodeJS.ProcessEnv,
      encoding: "utf8"
    });
    return { status: r.status ?? 1, stdout: r.stdout || "", stderr: r.stderr || "" };
  }

  // 1. Initial baseline generation
  const rInit = runGate(["--update-baseline", baseFile, "--allow-raise", "--reason", "Initial baseline adoption for wave2a.6"]);
  steps.push({
    step: "1. init_baseline",
    expectedExit: 0,
    actualExit: rInit.status,
    passed: rInit.status === 0,
    stderr: rInit.stderr
  });

  // 2. Verify baseline passes cleanly
  const rCheck1 = runGate(["--baseline", baseFile]);
  steps.push({
    step: "2. check_baseline_clean",
    expectedExit: 0,
    actualExit: rCheck1.status,
    passed: rCheck1.status === 0,
    stderr: rCheck1.stderr
  });

  // 3. Add new violation
  const badFilePath = join(tmpDir, "new_violation.ts");
  writeFileSync(badFilePath, "export const x: any = 1;\nconsole.log(x);\n", "utf8");
  const rBadV = runGate(["--baseline", baseFile]);
  steps.push({
    step: "3. add_violation_triggers_exit_1",
    expectedExit: 1,
    actualExit: rBadV.status,
    passed: rBadV.status === 1,
    stderr: rBadV.stderr
  });

  // 4. Revert violation
  unlinkSync(badFilePath);
  const rRevertV = runGate(["--baseline", baseFile]);
  steps.push({
    step: "4. revert_violation_returns_exit_0",
    expectedExit: 0,
    actualExit: rRevertV.status,
    passed: rRevertV.status === 0,
    stderr: rRevertV.stderr
  });

  // 5. Add new unbaselined generated file
  const genFilePath = join(tmpDir, "new_bundle.min.js");
  writeFileSync(genFilePath, "var a=1;\n", "utf8");
  const rBadGen = runGate(["--baseline", baseFile]);
  steps.push({
    step: "5. add_unbaselined_generated_triggers_exit_1",
    expectedExit: 1,
    actualExit: rBadGen.status,
    passed: rBadGen.status === 1,
    stderr: rBadGen.stderr
  });

  // 6. Revert generated file
  unlinkSync(genFilePath);
  const rRevertGen = runGate(["--baseline", baseFile]);
  steps.push({
    step: "6. revert_generated_returns_exit_0",
    expectedExit: 0,
    actualExit: rRevertGen.status,
    passed: rRevertGen.status === 0,
    stderr: rRevertGen.stderr
  });

  // 7. Add imports alias to config (triggers imports_declared ratchet regression)
  const modifiedConfig = JSON.parse(initialConfigStr);
  if (!modifiedConfig.imports) modifiedConfig.imports = {};
  if (!modifiedConfig.imports.alias) modifiedConfig.imports.alias = [];
  modifiedConfig.imports.alias.push({
    prefix: "@custom_extra_alias/",
    target: "src",
    reason: "Adding custom extra import alias mapping"
  });
  writeFileSync(cfgFile, JSON.stringify(modifiedConfig, null, 2), "utf8");
  const rBadImport = runGate(["--baseline", baseFile]);
  steps.push({
    step: "7. add_imports_declared_triggers_exit_1",
    expectedExit: 1,
    actualExit: rBadImport.status,
    passed: rBadImport.status === 1,
    stderr: rBadImport.stderr
  });

  // 8. Revert config
  writeFileSync(cfgFile, initialConfigStr, "utf8");
  const rRevertImport = runGate(["--baseline", baseFile]);
  steps.push({
    step: "8. revert_imports_returns_exit_0",
    expectedExit: 0,
    actualExit: rRevertImport.status,
    passed: rRevertImport.status === 0,
    stderr: rRevertImport.stderr
  });

  try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}

  const passed = steps.every((s) => s.passed);
  return { projectName, passed, steps };
}

export function runBaselineAdoptionAll(): {
  date: string;
  results: ProjectAdoptionResult[];
  allPassed: boolean;
} {
  console.log("=== RUNNING BASELINE ADOPTION ON 2 PROJECTS ===");

  const floraConfig = {
    schema: 1,
    exclude: [
      {
        path: ".vercel/output",
        reason: "Exclude Vercel deployment build output directory and bundled chunks"
      }
    ],
    allow: [
      {
        rule: "ASTESIA-004",
        path: "src/lib/repositories/auth.repository.ts",
        match: "OFFLINE_AUTH_KEY",
        reason: "Local storage key identifier for offline authentication cache, not a secret"
      }
    ],
    imports: {
      alias: [
        {
          prefix: "@components/",
          target: "src/lib/components",
          reason: "Alias to components directory for Svelte components"
        }
      ]
    }
  };

  const edunexaConfig = {
    schema: 1,
    allow: [
      {
        rule: "ASTESIA-010",
        path: "docker-compose.yml",
        match: "POSTGRES_PASSWORD: nexa_password",
        reason: "Local development postgres password placeholder in compose file"
      },
      {
        rule: "ASTESIA-004",
        path: "internal/platform/config/config.go",
        match: "postgres://nexa_user:nexa_password@localhost:5432/edunexa?sslmode=disable",
        reason: "Local dev postgres connection fallback string for database connection"
      }
    ],
    imports: {
      alias: [
        {
          prefix: "$lib/",
          target: "web/src/lib",
          reason: "Monorepo web subfolder SvelteKit lib directory"
        }
      ]
    }
  };

  const resFlora = testProjectAdoption("flora-smk", "D:/Workspaces/flora-smk", floraConfig);
  console.log(`flora-smk adoption: ${resFlora.passed ? "PASSED (8/8 steps)" : "FAILED"}`);
  for (const s of resFlora.steps) {
    console.log(`  - ${s.step}: exit ${s.actualExit} (expected ${s.expectedExit}) -> ${s.passed ? "OK" : "FAIL"}`);
  }

  const resEdu = testProjectAdoption("eduNEXA", "D:/Workspaces/eduNEXA", edunexaConfig);
  console.log(`eduNEXA adoption: ${resEdu.passed ? "PASSED (8/8 steps)" : "FAILED"}`);
  for (const s of resEdu.steps) {
    console.log(`  - ${s.step}: exit ${s.actualExit} (expected ${s.expectedExit}) -> ${s.passed ? "OK" : "FAIL"}`);
  }

  const allPassed = resFlora.passed && resEdu.passed;
  const out = {
    date: new Date().toISOString(),
    results: [resFlora, resEdu],
    allPassed
  };

  writeFileSync(
    join(REPO_ROOT, ".astesia/audit/wave2a.6/phase3-baseline-adoption.json"),
    JSON.stringify(out, null, 2),
    "utf8"
  );

  return out;
}

if (import.meta.main) {
  const out = runBaselineAdoptionAll();
  if (!out.allPassed) {
    console.error("Baseline adoption failed!");
    process.exit(1);
  }
}
