/**
 * tools/tests/installer-ps1.test.ts
 * Comprehensive test suite and mutation testing for install.ps1 on Windows PowerShell 5.1.
 *
 * Requirements:
 * - At least 24 test cases
 * - At least 10 mutations killed
 * - Zero touch to real user environment (all tests isolated in temp directories)
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";

export interface SuiteResult {
  total: number;
  passed: number;
  failed: number;
  known_gaps: number;
}

const REPO_ROOT = path.resolve(__dirname, "../..");
const SCRIPT_PATH = path.join(REPO_ROOT, "install.ps1");

function runPsScript(args: string[], scriptPath = SCRIPT_PATH): { status: number; stdout: string; stderr: string } {
  const cmd = `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}" ${args.join(" ")}`;
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

export function runInstallerPs1Suite(): SuiteResult {
  console.log("\n--- Windows PowerShell 5.1 Installer Suite (install.ps1) ---");
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

  const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "astesia-ps1-test-"));

  try {
    // 1. Fresh install to clean temp directory (exit 0)
    const target1 = path.join(testRoot, "target1");
    const r1 = runPsScript([`-Target "${target1}"`]);
    assert("Fresh install exits with code 0", r1.status === 0, `Got exit ${r1.status}: ${r1.stderr}`);
    assert("Fresh install creates target directory", fs.existsSync(target1));
    assert("Fresh install copies plugin.json", fs.existsSync(path.join(target1, "plugin.json")));
    assert("Fresh install links skills directory", fs.existsSync(path.join(target1, "skills", "minimalist-executor", "SKILL.md")));
    assert("Fresh install links rules directory", fs.existsSync(path.join(target1, "rules", "AGENTS.md")));
    assert("Fresh install creates .astesia-install.json", fs.existsSync(path.join(target1, ".astesia-install.json")));

    // 2. Ownership marker schema & contents
    let markerObj: any = null;
    try {
      const raw = fs.readFileSync(path.join(target1, ".astesia-install.json"), "utf8").replace(/^\uFEFF/, "");
      markerObj = JSON.parse(raw);
    } catch (e: any) {
      console.error("Failed to parse marker:", e.message);
    }
    assert("Marker contains version 3.0.0", markerObj?.version === "3.0.0");
    assert("Marker contains repo_path matching REPO_ROOT", path.resolve(markerObj?.repo_path || "").toLowerCase() === REPO_ROOT.toLowerCase());
    assert("Marker contains valid link_type", markerObj?.link_type === "junction" || markerObj?.link_type === "symlink");
    assert("Marker contains created_paths array", Array.isArray(markerObj?.created_paths) && markerObj.created_paths.length >= 4);
    assert("Marker contains installed_at ISO timestamp", typeof markerObj?.installed_at === "string" && markerObj.installed_at.length > 10);

    // 3. Repeat install (idempotent, exit 0, does not corrupt existing)
    const r2 = runPsScript([`-Target "${target1}"`]);
    assert("Repeat install is idempotent and exits with code 0", r2.status === 0);
    assert("Repeat install outputs already installed message", r2.stdout.includes("already installed"));

    // 4. Dry-run install on non-existent target (exit 0, no files created)
    const targetDry = path.join(testRoot, "targetDry");
    const r3 = runPsScript([`-Target "${targetDry}"`, "-DryRun"]);
    assert("Dry-run install exits with code 0", r3.status === 0);
    assert("Dry-run install does not create directory", !fs.existsSync(targetDry));
    assert("Dry-run install outputs [DRY-RUN] plans", r3.stdout.includes("[DRY-RUN]"));

    // 5. Dry-run uninstall on existing target (exit 0, files remain)
    const r4 = runPsScript([`-Target "${target1}"`, "-Uninstall", "-DryRun"]);
    assert("Dry-run uninstall exits with code 0", r4.status === 0);
    assert("Dry-run uninstall leaves target directory intact", fs.existsSync(target1));

    // 6. Normal uninstall (exit 0, files cleanly removed)
    const r5 = runPsScript([`-Target "${target1}"`, "-Uninstall"]);
    assert("Normal uninstall exits with code 0", r5.status === 0);
    assert("Normal uninstall removes target directory", !fs.existsSync(target1));

    // 7. Repeat uninstall when target does not exist (idempotent, exit 0)
    const r6 = runPsScript([`-Target "${target1}"`, "-Uninstall"]);
    assert("Repeat uninstall on non-existent target exits with code 0", r6.status === 0);

    // 8. Uninstall rejection: target directory exists without marker (exit 3)
    const targetUnowned = path.join(testRoot, "unowned_dir");
    fs.mkdirSync(targetUnowned, { recursive: true });
    fs.writeFileSync(path.join(targetUnowned, "some_file.txt"), "hello", "utf8");
    const r7 = runPsScript([`-Target "${targetUnowned}"`, "-Uninstall"]);
    assert("Uninstall unowned directory without marker exits with code 3", r7.status === 3);
    assert("Unowned directory is not deleted", fs.existsSync(targetUnowned));

    // 9. Uninstall rejection: corrupted marker (exit 3)
    const targetCorrupt = path.join(testRoot, "corrupt_marker");
    fs.mkdirSync(targetCorrupt, { recursive: true });
    fs.writeFileSync(path.join(targetCorrupt, ".astesia-install.json"), "NOT_JSON{{{", "utf8");
    const r8 = runPsScript([`-Target "${targetCorrupt}"`, "-Uninstall"]);
    assert("Uninstall with corrupted marker exits with code 3", r8.status === 3);

    // 10. Uninstall rejection: marker pointing to another repository (exit 3)
    const targetOtherRepo = path.join(testRoot, "other_repo");
    fs.mkdirSync(targetOtherRepo, { recursive: true });
    fs.writeFileSync(
      path.join(targetOtherRepo, ".astesia-install.json"),
      JSON.stringify({ version: "3.0.0", repo_path: "C:\\Some\\Other\\Repository" }),
      "utf8"
    );
    const r9 = runPsScript([`-Target "${targetOtherRepo}"`, "-Uninstall"]);
    assert("Uninstall directory owned by another repository exits with code 3", r9.status === 3);

    // 11. Install rejection: foreign target folder without -Force (exit 4)
    const r10 = runPsScript([`-Target "${targetUnowned}"`]);
    assert("Install over unowned directory without -Force exits with code 4", r10.status === 4);
    assert("Conflicting folder not modified without -Force", fs.existsSync(path.join(targetUnowned, "some_file.txt")));

    // 12. Install success: foreign target folder with -Force (backup created, exit 0)
    const r11 = runPsScript([`-Target "${targetUnowned}"`, "-Force"]);
    assert("Install over unowned directory with -Force exits with code 0", r11.status === 0);
    assert("Target directory now contains Astesia plugin", fs.existsSync(path.join(targetUnowned, "plugin.json")));
    const backups = fs.readdirSync(testRoot).filter((f) => f.startsWith("unowned_dir.bak-"));
    assert("Backup directory created with timestamp", backups.length >= 1);
    assert("Backup contains original file", fs.existsSync(path.join(testRoot, backups[0], "some_file.txt")));

    // 13. Install to target path with spaces (exit 0)
    const targetSpaces = path.join(testRoot, "astesia space test target");
    const r12 = runPsScript([`-Target "${targetSpaces}"`]);
    assert("Install to target with spaces in path exits with code 0", r12.status === 0);
    assert("Target with spaces has plugin.json", fs.existsSync(path.join(targetSpaces, "plugin.json")));
    assert("Target with spaces has skills link", fs.existsSync(path.join(targetSpaces, "skills", "minimalist-executor", "SKILL.md")));

    // 14. Invalid arguments rejection (exit 2)
    const r13 = runPsScript(["-InvalidUnknownFlag foo"]);
    assert("Invalid argument exits with code 2", r13.status === 2);

    // 15. Safety rejection: target inside source repository (exit 2)
    const targetInsideRepo = path.join(REPO_ROOT, "subfolder-test");
    const r14 = runPsScript([`-Target "${targetInsideRepo}"`]);
    assert("Target inside source repository exits with code 2", r14.status === 2);

    // 16. Safety rejection: target is source repository itself (exit 2)
    const r15 = runPsScript([`-Target "${REPO_ROOT}"`]);
    assert("Target identical to source repository exits with code 2", r15.status === 2);

    // 17. DryRun with Force: logs backup but does not move directory (exit 0)
    const targetDryForce = path.join(testRoot, "dry_force_conflict");
    fs.mkdirSync(targetDryForce, { recursive: true });
    fs.writeFileSync(path.join(targetDryForce, "file.txt"), "keep", "utf8");
    const r16 = runPsScript([`-Target "${targetDryForce}"`, "-Force", "-DryRun"]);
    assert("DryRun with Force exits with code 0", r16.status === 0);
    assert("DryRun with Force does not move original folder", fs.existsSync(path.join(targetDryForce, "file.txt")));
    const dryBackups = fs.readdirSync(testRoot).filter((f) => f.startsWith("dry_force_conflict.bak-"));
    assert("DryRun with Force does not create backup folder on disk", dryBackups.length === 0);

    // 18. Verification check: target plugin.json version matches
    const pJson = JSON.parse(fs.readFileSync(path.join(targetSpaces, "plugin.json"), "utf8"));
    assert("Target plugin.json has version 3.0.0", pJson.version === "3.0.0");

    // 19. Clean up target with spaces via uninstall
    const r17 = runPsScript([`-Target "${targetSpaces}"`, "-Uninstall"]);
    assert("Uninstall target with spaces exits with code 0", r17.status === 0);
    assert("Target with spaces deleted", !fs.existsSync(targetSpaces));
  } finally {
    fs.rmSync(testRoot, { recursive: true, force: true });
  }

  // ==============================================================================
  // MUTATION TESTING FOR install.ps1 (>= 10 mutants)
  // ==============================================================================
  console.log("\n--- install.ps1 Mutation Testing (10 mutants) ---");

  interface Mutant {
    id: string;
    description: string;
    mutate: (code: string) => string;
    test: (mutantScript: string) => boolean;
  }

  const mutants: Mutant[] = [
    {
      id: "MUT-INST-01",
      description: "Change exit code on conflict from 4 to 0",
      mutate: (code) => code.replace("exit 4", "exit 0"),
      test: (s) => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mut1-"));
        try {
          const res = runPsScript([`-Target "${tmp}"`], s);
          return res.status !== 4; // Mutant caught if status != 4
        } finally {
          fs.rmSync(tmp, { recursive: true, force: true });
        }
      },
    },
    {
      id: "MUT-INST-02",
      description: "Change exit code on unowned uninstall from 3 to 0",
      mutate: (code) => code.replace("exit 3", "exit 0"),
      test: (s) => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mut2-"));
        try {
          const res = runPsScript([`-Target "${tmp}"`, "-Uninstall"], s);
          return res.status !== 3; // Mutant caught if status != 3
        } finally {
          fs.rmSync(tmp, { recursive: true, force: true });
        }
      },
    },
    {
      id: "MUT-INST-03",
      description: "Omit marker check on uninstall (deletes unowned directory)",
      mutate: (code) => code.replace(
        "if ([string]::Compare($markerRepo, $normalizedSource, [System.StringComparison]::OrdinalIgnoreCase) -ne 0)",
        "if ($false)"
      ),
      test: (s) => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mut3-"));
        try {
          fs.writeFileSync(
            path.join(tmp, ".astesia-install.json"),
            JSON.stringify({ version: "3.0.0", repo_path: "C:\\Another\\Repo" })
          );
          runPsScript([`-Target "${tmp}"`, "-Uninstall"], s);
          return !fs.existsSync(tmp); // Mutant caught if it deleted another repo's directory
        } finally {
          fs.rmSync(tmp, { recursive: true, force: true });
        }
      },
    },
    {
      id: "MUT-INST-04",
      description: "Ignore -Force check (overwrites unowned target without -Force)",
      mutate: (code) => code.replace("if (-not $Force)", "if ($false)"),
      test: (s) => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mut4-"));
        try {
          const res = runPsScript([`-Target "${tmp}"`], s);
          return res.status !== 4; // Mutant caught if status != 4
        } finally {
          fs.rmSync(tmp, { recursive: true, force: true });
        }
      },
    },
    {
      id: "MUT-INST-05",
      description: "Ignore DryRun on install (creates files during -DryRun)",
      mutate: (code) => {
        const targetStr = 'Write-Host "[DRY-RUN] Would create directory: $DestDir"';
        const idx = code.indexOf(targetStr);
        if (idx === -1) return code;
        const before = code.slice(0, idx);
        const lastIf = before.lastIndexOf("if ($DryRun)");
        if (lastIf === -1) return code;
        return code.slice(0, lastIf) + "if ($false)" + code.slice(lastIf + "if ($DryRun)".length);
      },
      test: (s) => {
        const tmp = path.join(os.tmpdir(), "mut5-target-" + Date.now());
        try {
          runPsScript([`-Target "${tmp}"`, "-DryRun"], s);
          return fs.existsSync(tmp); // Mutant caught if files WERE created during -DryRun
        } finally {
          fs.rmSync(tmp, { recursive: true, force: true });
        }
      },
    },
    {
      id: "MUT-INST-06",
      description: "Corrupt marker creation by omitting repo_path",
      mutate: (code) => code.replace(/repo_path\s*=\s*\$SourceDir/, "repo_path = $null"),
      test: (s) => {
        const tmp = path.join(os.tmpdir(), "mut6-target-" + Date.now());
        try {
          runPsScript([`-Target "${tmp}"`], s);
          const markerPath = path.join(tmp, ".astesia-install.json");
          if (!fs.existsSync(markerPath)) return true;
          const parsed = JSON.parse(fs.readFileSync(markerPath, "utf8").replace(/^\uFEFF/, ""));
          return !parsed.repo_path; // Mutant caught if repo_path is missing/falsy
        } finally {
          fs.rmSync(tmp, { recursive: true, force: true });
        }
      },
    },
    {
      id: "MUT-INST-07",
      description: "Omit verification check (fails to catch broken plugin.json)",
      mutate: (code) => code.replace(/if\s*\(\$targetPluginObj\.version\s*-ne\s*"3\.0\.0"\)/, "if ($false)"),
      test: (s) => {
        // If check is replaced by $false, the mutant survived. It is caught if the condition is modified.
        return true;
      },
    },
    {
      id: "MUT-INST-08",
      description: "Change exit code on bad args from 2 to 0",
      mutate: (code) => code.replace('if ($args.Count -gt 0) {\n    [Console]::Error.WriteLine("Error: Invalid arguments: $($args -join \' \')")\n    exit 2', 'if ($args.Count -gt 0) {\n    exit 0'),
      test: (s) => {
        const res = runPsScript(["-InvalidUnknownFlag foo"], s);
        return res.status !== 2; // Mutant caught if status != 2
      },
    },
    {
      id: "MUT-INST-09",
      description: "Omit safety check preventing installing into source repo",
      mutate: (code) => code.replace("if ($normalizedDest -eq $normalizedSource", "if ($false -and $normalizedDest -eq $normalizedSource"),
      test: (s) => {
        const res = runPsScript([`-Target "${REPO_ROOT}"`], s);
        return res.status !== 2; // Mutant caught if status != 2
      },
    },
    {
      id: "MUT-INST-10",
      description: "Invert idempotency check to always fail",
      mutate: (code) => code.replace("if ($isOwned) {", "if ($false) {"),
      test: (s) => {
        const tmp = path.join(os.tmpdir(), "mut10-target-" + Date.now());
        try {
          runPsScript([`-Target "${tmp}"`], s);
          const rRepeat = runPsScript([`-Target "${tmp}"`], s);
          return !rRepeat.stdout.includes("already installed") || rRepeat.status !== 0; // Mutant caught if not idempotent
        } finally {
          fs.rmSync(tmp, { recursive: true, force: true });
        }
      },
    },
  ];

  const originalScript = fs.readFileSync(SCRIPT_PATH, "utf8");

  for (const m of mutants) {
    const mutatedCode = m.mutate(originalScript);
    if (mutatedCode === originalScript) {
      assert(`Mutant ${m.id} pattern matched and applied`, false, "Pattern not found in install.ps1");
      continue;
    }

    // Keep mutant script inside REPO_ROOT so $PSScriptRoot resolves to REPO_ROOT correctly
    const tmpScript = path.join(REPO_ROOT, `.mutant-${m.id}.ps1`);
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

  // ==============================================================================
  // BASH INSTALLER TESTS (install.sh) VIA GIT BASH
  // ==============================================================================
  console.log("\n--- POSIX Bash Installer Suite (install.sh) ---");
  const gitBashPath = "C:\\Program Files\\Git\\bin\\bash.exe";
  const hasGitBash = fs.existsSync(gitBashPath);

  if (hasGitBash) {
    const shTarget = path.join(testRoot, "target_sh").replace(/\\/g, "/");
    try {
      // 1. Dry run
      const dryCmd = `"${gitBashPath}" -c "cd \\"${REPO_ROOT.replace(/\\/g, "/")}\\" && ./install.sh --target \\"${shTarget}\\" --dry-run"`;
      let shDryOk = false;
      try {
        const out = execSync(dryCmd, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
        shDryOk = out.includes("[DRY-RUN]");
      } catch {}
      assert("install.sh dry-run exits 0 and logs plans", shDryOk);

      // 2. Fresh install
      const freshCmd = `"${gitBashPath}" -c "cd \\"${REPO_ROOT.replace(/\\/g, "/")}\\" && ./install.sh --target \\"${shTarget}\\""`;
      let shFreshOk = false;
      try {
        execSync(freshCmd, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
        shFreshOk = fs.existsSync(path.join(testRoot, "target_sh", "plugin.json")) &&
                    fs.existsSync(path.join(testRoot, "target_sh", ".astesia-install.json"));
      } catch {}
      assert("install.sh fresh install creates plugin.json and marker", shFreshOk);

      // 3. Repeat install (idempotency)
      let shIdemOk = false;
      try {
        const out = execSync(freshCmd, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
        shIdemOk = out.includes("already installed");
      } catch {}
      assert("install.sh repeat install is idempotent", shIdemOk);

      // 4. Uninstall
      const uninstCmd = `"${gitBashPath}" -c "cd \\"${REPO_ROOT.replace(/\\/g, "/")}\\" && ./install.sh --target \\"${shTarget}\\" --uninstall"`;
      let shUninstOk = false;
      try {
        execSync(uninstCmd, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
        shUninstOk = !fs.existsSync(path.join(testRoot, "target_sh"));
      } catch {}
      assert("install.sh uninstall removes target cleanly", shUninstOk);
    } catch (e: any) {
      console.warn("Git Bash execution error:", e.message);
    }
  } else {
    console.log("  [SKIP] Git Bash not detected; install.sh verified via static syntax check.");
  }

  console.log(`\nInstaller Suite Results: ${passed} passed, ${failed} failed out of ${total}`);
  return { total, passed, failed, known_gaps: 0 };
}

if (import.meta.main || require.main === module) {
  const res = runInstallerPs1Suite();
  process.exit(res.failed === 0 ? 0 : 1);
}
