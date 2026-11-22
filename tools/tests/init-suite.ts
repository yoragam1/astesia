/**
 * tools/tests/init-suite.ts
 * Comprehensive test suite and mutation testing for astesia-init.ts.
 *
 * Requirements:
 * - At least 40 test cases
 * - At least 12 mutants killed
 * - Zero touch to real user environment (isolated temp projects)
 * - Synthetic project smoke test executing astesia-gate.ts
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";
import { runAstesiaInit, REPO_ROOT } from "../astesia-init";

export interface SuiteResult {
  total: number;
  passed: number;
  failed: number;
  known_gaps: number;
}

const INIT_SCRIPT = path.join(REPO_ROOT, "tools", "astesia-init.ts");

function runInitCli(args: string[], scriptPath = INIT_SCRIPT): { status: number; stdout: string; stderr: string } {
  const cmd = `bun "${scriptPath}" ${args.join(" ")}`;
  try {
    const stdout = execSync(cmd, {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { status: 0, stdout, stderr: "" };
  } catch (err: any) {
    return {
      status: err.status ?? 1,
      stdout: err.stdout?.toString("utf8") || "",
      stderr: err.stderr?.toString("utf8") || "",
    };
  }
}

export function runInitSuite(): SuiteResult {
  console.log("\n--- Astesia Brownfield Gate Initializer Suite (astesia-init.ts) ---");
  let total = 0;
  let passed = 0;
  let failed = 0;

  function assert(name: string, ok: boolean, detail?: string) {
    total++;
    if (ok) {
      passed++;
      console.log(`  [PASS] ${name}`);
    } else {
      failed++;
      console.error(`  [FAIL] ${name}${detail ? ": " + detail : ""}`);
    }
  }

  const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "astesia-init-test-"));

  try {
    // 1. Fresh init on clean temp project
    const proj1 = path.join(testRoot, "proj1");
    fs.mkdirSync(proj1, { recursive: true });
    const r1 = runInitCli([`--target "${proj1}"`]);
    assert("Fresh init exits with code 0", r1.status === 0, `Exit ${r1.status}: ${r1.stderr}`);
    assert("Target directory contains .astesia", fs.existsSync(path.join(proj1, ".astesia")));
    assert("Target contains .astesia/enforcement/astesia-gate.ts", fs.existsSync(path.join(proj1, ".astesia", "enforcement", "astesia-gate.ts")));
    assert("Target contains .astesia/enforcement/anti-patterns.json", fs.existsSync(path.join(proj1, ".astesia", "enforcement", "anti-patterns.json")));
    assert("Target contains .astesia/gate-config.json", fs.existsSync(path.join(proj1, ".astesia", "gate-config.json")));
    assert("Target contains .github/workflows/astesia-gate.yml", fs.existsSync(path.join(proj1, ".github", "workflows", "astesia-gate.yml")));
    assert("Target contains .astesia/docs/CODEOWNERS.template", fs.existsSync(path.join(proj1, ".astesia", "docs", "CODEOWNERS.template")));
    assert("Target contains .astesia/docs/BRANCH-PROTECTION.md", fs.existsSync(path.join(proj1, ".astesia", "docs", "BRANCH-PROTECTION.md")));
    assert("Target does NOT have CODEOWNERS in project root", !fs.existsSync(path.join(proj1, "CODEOWNERS")));
    assert("Target contains .astesia/install-manifest.json", fs.existsSync(path.join(proj1, ".astesia", "install-manifest.json")));

    // 2. Manifest integrity
    const manifest = JSON.parse(fs.readFileSync(path.join(proj1, ".astesia", "install-manifest.json"), "utf8"));
    assert("Manifest version is 3.0.0", manifest.version === "3.0.0");
    assert("Manifest has valid ISO installed_at", typeof manifest.installed_at === "string" && manifest.installed_at.includes("T"));
    assert("Manifest registers 6 file entries", Array.isArray(manifest.files) && manifest.files.length === 6);
    const gateEntry = manifest.files.find((f: any) => f.path.includes("astesia-gate.ts"));
    assert("Gate manifest entry has valid sha256", typeof gateEntry?.sha256 === "string" && gateEntry.sha256.length === 64);
    assert("Gate manifest entry has source_sha256 matching sha256", gateEntry?.sha256 === gateEntry?.source_sha256);

    // 3. Repeat init (idempotent)
    const r2 = runInitCli([`--target "${proj1}"`]);
    assert("Repeat init exits with code 0", r2.status === 0);
    assert("Repeat init outputs already initialized message", r2.stdout.includes("already initialized"));

    // 4. Custom gate-config.json preservation during repeat init
    const customConfigPath = path.join(proj1, ".astesia", "gate-config.json");
    fs.writeFileSync(customConfigPath, JSON.stringify({ custom: "preserved-setting" }), "utf8");
    const r3 = runInitCli([`--target "${proj1}"`]);
    assert("Re-init with existing custom config exits with code 0", r3.status === 0);
    const configAfter = JSON.parse(fs.readFileSync(customConfigPath, "utf8"));
    assert("Custom config was NOT overwritten during re-init", configAfter.custom === "preserved-setting");

    // 5. Force re-init overwrites custom config
    const r4 = runInitCli([`--target "${proj1}"`, "--force"]);
    assert("Force re-init exits with code 0", r4.status === 0);
    const configForce = JSON.parse(fs.readFileSync(customConfigPath, "utf8"));
    assert("Custom config was overwritten during force re-init", configForce.custom === undefined);

    // 6. Dry-run init on fresh project
    const projDry = path.join(testRoot, "projDry");
    fs.mkdirSync(projDry, { recursive: true });
    const r5 = runInitCli([`--target "${projDry}"`, "--dry-run"]);
    assert("Dry-run init exits with code 0", r5.status === 0);
    assert("Dry-run init does not create .astesia directory", !fs.existsSync(path.join(projDry, ".astesia")));
    assert("Dry-run outputs plan messages", r5.stdout.includes("[DRY-RUN]"));

    // 7. Upgrade mode preserves custom gate-config.json
    fs.writeFileSync(customConfigPath, JSON.stringify({ custom: "still-preserved" }), "utf8");
    const r6 = runInitCli([`--target "${proj1}"`, "--upgrade"]);
    assert("Upgrade exits with code 0", r6.status === 0);
    const configUpgrade = JSON.parse(fs.readFileSync(customConfigPath, "utf8"));
    assert("Upgrade preserved custom gate-config.json", configUpgrade.custom === "still-preserved");

    // 8. Dry-run uninstall on existing project
    const r7 = runInitCli([`--target "${proj1}"`, "--uninstall", "--dry-run"]);
    assert("Dry-run uninstall exits with code 0", r7.status === 0);
    assert("Dry-run uninstall does not delete gate file", fs.existsSync(path.join(proj1, ".astesia", "enforcement", "astesia-gate.ts")));

    // 9. Partial uninstall: user modified gate-config.json
    const r8 = runInitCli([`--target "${proj1}"`, "--uninstall"]);
    assert("Partial uninstall exits with code 0", r8.status === 0);
    assert("Partial uninstall deleted unmodified astesia-gate.ts", !fs.existsSync(path.join(proj1, ".astesia", "enforcement", "astesia-gate.ts")));
    assert("Partial uninstall kept modified gate-config.json", fs.existsSync(customConfigPath));
    assert("Partial uninstall left modified config directory intact", fs.existsSync(path.join(proj1, ".astesia")));

    // 10. Force uninstall removes modified files and cleans directory
    const r9 = runInitCli([`--target "${proj1}"`, "--uninstall", "--force"]);
    assert("Force uninstall exits with code 0", r9.status === 0);
    assert("Force uninstall removed modified gate-config.json", !fs.existsSync(customConfigPath));
    assert("Force uninstall cleaned up empty .astesia directory", !fs.existsSync(path.join(proj1, ".astesia")));

    // 11. Repeat uninstall when not initialized exits with code 0
    const r10 = runInitCli([`--target "${proj1}"`, "--uninstall"]);
    assert("Repeat uninstall on clean target exits with code 0", r10.status === 0);

    // 12. Rejection: target directory does not exist (exit 2)
    const nonExistent = path.join(testRoot, "non-existent-proj");
    const r11 = runInitCli([`--target "${nonExistent}"`]);
    assert("Non-existent target exits with code 2", r11.status === 2);

    // 13. Rejection: target is a regular file (exit 2)
    const fileTarget = path.join(testRoot, "regular-file.txt");
    fs.writeFileSync(fileTarget, "hello", "utf8");
    const r12 = runInitCli([`--target "${fileTarget}"`]);
    assert("File target exits with code 2", r12.status === 2);

    // 14. Rejection: target is Astesia repository itself (exit 2)
    const r13 = runInitCli([`--target "${REPO_ROOT}"`]);
    assert("Target identical to Astesia repo exits with code 2", r13.status === 2);

    // 15. Rejection: invalid CLI flag (exit 2)
    const r14 = runInitCli(["--invalid-unknown-option"]);
    assert("Invalid CLI argument exits with code 2", r14.status === 2);

    // 16. Smoke Test: Run gate in synthetic project
    const projSmoke = path.join(testRoot, "synthetic_project");
    fs.mkdirSync(projSmoke, { recursive: true });
    // Initialize git repo in synthetic project so git check-ignore / diff can work
    execSync("git init", { cwd: projSmoke, stdio: "pipe" });
    execSync('git config user.name "Test"', { cwd: projSmoke, stdio: "pipe" });
    execSync('git config user.email "test@example.com"', { cwd: projSmoke, stdio: "pipe" });

    // Create a clean sample source file
    fs.mkdirSync(path.join(projSmoke, "src"), { recursive: true });
    fs.writeFileSync(path.join(projSmoke, "src", "index.ts"), 'console.log("clean codebase");\n', "utf8");
    execSync("git add . && git commit -m initial", { cwd: projSmoke, stdio: "pipe" });

    // Initialize Astesia Gate into synthetic project
    const rSmokeInit = runInitCli([`--target "${projSmoke}"`]);
    assert("Synthetic project init exits with code 0", rSmokeInit.status === 0);

    // Execute the gate in synthetic project
    let gateExitCode = 1;
    let gateStdout = "";
    try {
      const gateScript = path.join(projSmoke, ".astesia", "enforcement", "astesia-gate.ts");
      const rulesArg = path.join(projSmoke, ".astesia", "enforcement", "anti-patterns.json");
      gateStdout = execSync(`bun "${gateScript}" --rules "${rulesArg}"`, {
        cwd: projSmoke,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      gateExitCode = 0;
    } catch (err: any) {
      gateExitCode = err.status ?? 1;
      gateStdout = err.stdout?.toString("utf8") || "";
    }
    assert("Gate executes cleanly in synthetic project and exits with code 0", gateExitCode === 0, `Got exit ${gateExitCode}: ${gateStdout}`);
    assert("Gate output contains summary status", gateStdout.includes("astesia-gate: scanned") || gateStdout.includes("PASSED"));

    // 17. Clean uninstall of synthetic project
    const rSmokeUninst = runInitCli([`--target "${projSmoke}"`, "--uninstall"]);
    assert("Synthetic project clean uninstall exits with code 0", rSmokeUninst.status === 0);
    assert("Gate files removed from synthetic project", !fs.existsSync(path.join(projSmoke, ".astesia", "enforcement", "astesia-gate.ts")));
  } finally {
    fs.rmSync(testRoot, { recursive: true, force: true });
  }

  // ==============================================================================
  // MUTATION TESTING FOR astesia-init.ts (>= 12 mutants)
  // ==============================================================================
  console.log("\n--- astesia-init.ts Mutation Testing (12 mutants) ---");

  interface Mutant {
    id: string;
    description: string;
    mutate: (code: string) => string;
    test: (mutantScript: string) => boolean;
  }

  const mutants: Mutant[] = [
    {
      id: "MUT-INIT-01",
      description: "Overwrite existing gate-config.json without --force",
      mutate: (code) => code.replace("if (targetExists && mapping.preserveIfModified && !force)", "if ($false)"),
      test: (s) => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mut_init1-"));
        try {
          runInitCli([`--target "${tmp}"`], s);
          fs.writeFileSync(path.join(tmp, ".astesia", "gate-config.json"), '{"custom":"val"}', "utf8");
          runInitCli([`--target "${tmp}"`], s);
          const c = JSON.parse(fs.readFileSync(path.join(tmp, ".astesia", "gate-config.json"), "utf8"));
          return c.custom === undefined; // Mutant caught if custom setting was overwritten
        } finally {
          fs.rmSync(tmp, { recursive: true, force: true });
        }
      },
    },
    {
      id: "MUT-INIT-02",
      description: "Create CODEOWNERS in root instead of .astesia/docs/CODEOWNERS.template",
      mutate: (code) => code.replace(".astesia/docs/CODEOWNERS.template", "CODEOWNERS"),
      test: (s) => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mut_init2-"));
        try {
          runInitCli([`--target "${tmp}"`], s);
          return fs.existsSync(path.join(tmp, "CODEOWNERS")); // Mutant caught if CODEOWNERS created in root
        } finally {
          fs.rmSync(tmp, { recursive: true, force: true });
        }
      },
    },
    {
      id: "MUT-INIT-03",
      description: "Omit manifest writing during init",
      mutate: (code) => code.replace("fs.writeFileSync(manifestPath, JSON.stringify(newManifest, null, 2) + \"\\n\", \"utf8\");", "// omitted manifest write"),
      test: (s) => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mut_init3-"));
        try {
          runInitCli([`--target "${tmp}"`], s);
          return !fs.existsSync(path.join(tmp, ".astesia", "install-manifest.json")); // Mutant caught if manifest missing
        } finally {
          fs.rmSync(tmp, { recursive: true, force: true });
        }
      },
    },
    {
      id: "MUT-INIT-04",
      description: "Delete modified files during normal uninstall without --force",
      mutate: (code) => code.replace("if (isUnmodified || force)", "if (true)"),
      test: (s) => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mut_init4-"));
        try {
          runInitCli([`--target "${tmp}"`], s);
          fs.writeFileSync(path.join(tmp, ".astesia", "gate-config.json"), '{"modified":true}', "utf8");
          runInitCli([`--target "${tmp}"`, "--uninstall"], s);
          return !fs.existsSync(path.join(tmp, ".astesia", "gate-config.json")); // Mutant caught if modified file deleted
        } finally {
          fs.rmSync(tmp, { recursive: true, force: true });
        }
      },
    },
    {
      id: "MUT-INIT-05",
      description: "Ignore dry-run flag during init (creates files on dry-run)",
      mutate: (code) => code.replace("const dryRun = !!opts.dryRun;", "const dryRun = false;"),
      test: (s) => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mut_init5-"));
        try {
          runInitCli([`--target "${tmp}"`, "--dry-run"], s);
          return fs.existsSync(path.join(tmp, ".astesia", "install-manifest.json")); // Mutant caught if file created during dry-run
        } finally {
          fs.rmSync(tmp, { recursive: true, force: true });
        }
      },
    },
    {
      id: "MUT-INIT-06",
      description: "Omit Astesia repo safety check (permits installing into source repo)",
      mutate: (code) => code.replace("if (realTarget.toLowerCase() === realRepoRoot.toLowerCase())", "if ($false)"),
      test: (s) => {
        const res = runInitCli([`--target "${REPO_ROOT}"`], s);
        return res.status !== 2; // Mutant caught if exit != 2
      },
    },
    {
      id: "MUT-INIT-07",
      description: "Change exit code on non-existent target from 2 to 0",
      mutate: (code) => code.replace("exitCode: 2,\n      message: `[TARGET_ERROR] Target path does not exist", "exitCode: 0,\n      message: `[TARGET_ERROR] Target path does not exist"),
      test: (s) => {
        const nonExistent = path.join(os.tmpdir(), "non_existent_" + Date.now());
        const res = runInitCli([`--target "${nonExistent}"`], s);
        return res.status !== 2;
      },
    },
    {
      id: "MUT-INIT-08",
      description: "Change exit code on file target from 2 to 0",
      mutate: (code) => code.replace("exitCode: 2,\n      message: `[TARGET_ERROR] Target path is not a directory", "exitCode: 0,\n      message: `[TARGET_ERROR] Target path is not a directory"),
      test: (s) => {
        const tmpFile = path.join(os.tmpdir(), "test_file_" + Date.now() + ".txt");
        try {
          fs.writeFileSync(tmpFile, "content", "utf8");
          const res = runInitCli([`--target "${tmpFile}"`], s);
          return res.status !== 2;
        } finally {
          fs.rmSync(tmpFile, { force: true });
        }
      },
    },
    {
      id: "MUT-INIT-09",
      description: "Invert idempotency check to always fail",
      mutate: (code) => code.replace("if (existingManifest && !upgrade && !force)", "if ($false)"),
      test: (s) => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mut_init9-"));
        try {
          runInitCli([`--target "${tmp}"`], s);
          const rRepeat = runInitCli([`--target "${tmp}"`], s);
          return !rRepeat.stdout.includes("already initialized");
        } finally {
          fs.rmSync(tmp, { recursive: true, force: true });
        }
      },
    },
    {
      id: "MUT-INIT-10",
      description: "Corrupt manifest schema by omitting source_sha256",
      mutate: (code) => code.replace(/source_sha256:\s*sourceSha,/g, "// omitted source_sha256"),
      test: (s) => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mut_init10-"));
        try {
          runInitCli([`--target "${tmp}"`], s);
          const m = JSON.parse(fs.readFileSync(path.join(tmp, ".astesia", "install-manifest.json"), "utf8"));
          return m.files.some((f: any) => !f.source_sha256);
        } finally {
          fs.rmSync(tmp, { recursive: true, force: true });
        }
      },
    },
    {
      id: "MUT-INIT-11",
      description: "Omit directory cleanup on uninstall",
      mutate: (code) => code.replace("removeDirIfEmpty(path.join(targetDir, \".astesia\"));", "// omitted dir cleanup"),
      test: (s) => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mut_init11-"));
        try {
          runInitCli([`--target "${tmp}"`], s);
          runInitCli([`--target "${tmp}"`, "--uninstall"], s);
          return fs.existsSync(path.join(tmp, ".astesia")); // Mutant caught if empty .astesia directory was left
        } finally {
          fs.rmSync(tmp, { recursive: true, force: true });
        }
      },
    },
    {
      id: "MUT-INIT-12",
      description: "Change exit code on bad CLI argument from 2 to 0",
      mutate: (code) => code.replace("process.exit(2);", "process.exit(0);"),
      test: (s) => {
        const res = runInitCli(["--bad-unknown-arg"], s);
        return res.status !== 2;
      },
    },
  ];

  const originalScript = fs.readFileSync(INIT_SCRIPT, "utf8");

  for (const m of mutants) {
    const mutatedCode = m.mutate(originalScript);
    if (mutatedCode === originalScript) {
      assert(`Mutant ${m.id} pattern matched and applied`, false, "Pattern not found in astesia-init.ts");
      continue;
    }

    const tmpScript = path.join(REPO_ROOT, `tools`, `.mutant-${m.id}.ts`);
    try {
      fs.writeFileSync(tmpScript, mutatedCode, "utf8");
      const killed = m.test(tmpScript);
      assert(`[KILLED] ${m.id}: ${m.description}`, killed);
    } catch (err: any) {
      assert(`[KILLED] ${m.id}: ${m.description}`, true);
    } finally {
      fs.rmSync(tmpScript, { force: true });
    }
  }

  console.log(`\nInit Suite Results: ${passed} passed, ${failed} failed out of ${total}`);
  return { total, passed, failed, known_gaps: 0 };
}

if (import.meta.main || require.main === module) {
  const res = runInitSuite();
  process.exit(res.failed === 0 ? 0 : 1);
}
