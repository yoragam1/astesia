# Astesia v3.0.0 Installation & Initialization Verification

This document provides the formal verification report, architecture overview, exit code matrix, and test evidence for the Astesia framework installation scripts (`install.ps1`, `install.sh`) and brownfield initialization tooling (`tools/astesia-init.ts`).

---

## 1. Architecture Overview

Astesia v3.0.0 provides two distinct installation mechanisms designed under the **FAIL-CLOSED**, **zero-dependency**, and **Verification-First** principles:

### A. Live Plugin Mode (`install.ps1` / `install.sh`)
- **Target**: Links the native Astesia framework directly into Antigravity user plugins directory (`~/.gemini/antigravity/plugins/astesia`).
- **Mechanism**:
  - Windows: Windows directory junction (`New-Item -ItemType Junction`) without requiring Administrator privileges; fallback to symlink.
  - POSIX: Standard directory symlinks (`ln -s`).
- **Ownership Marker**: Emits `<target>/.astesia-install.json` with repository provenance, timestamp, version, and created path list.
- **Safety**: Refuses to uninstall unowned directories; requires `-Force` to overwrite foreign folders by backing them up to `<target>.bak-<timestamp>`.

### B. Brownfield Gate Initialization (`tools/astesia-init.ts`)
- **Target**: Deploys the standalone Astesia Gate and rule engine directly into external client repositories.
- **Installed Artifacts**:
  - Enforcement Engine: `<target>/.astesia/enforcement/astesia-gate.ts`
  - Anti-Pattern Registry: `<target>/.astesia/enforcement/anti-patterns.json`
  - Gate Configuration: `<target>/.astesia/gate-config.json` (installed ONLY if not already present)
  - GitHub Actions Workflow: `<target>/.github/workflows/astesia-gate.yml`
  - Governance Templates: `<target>/.astesia/docs/CODEOWNERS.template` and `<target>/.astesia/docs/BRANCH-PROTECTION.md`
- **Installation Manifest**: Recorded at `<target>/.astesia/install-manifest.json` tracking SHA-256 hashes of all installed files.
- **Safety**: On uninstall, user-modified files are safely preserved unless `--force` is explicitly provided.

---

## 2. CLI Arguments & Exit Code Matrix

### A. Plugin Installer (`install.ps1` / `install.sh`)
| Argument | Description |
| :--- | :--- |
| `-Target <path>` / `--target <path>` | Override target directory (defaults to user plugin directory). |
| `-DryRun` / `--dry-run` | Preview actions without modifying disk. |
| `-Uninstall` / `--uninstall` | Safely remove Astesia plugin (validates ownership marker). |
| `-Force` / `--force` | Backup conflicting directory and proceed with installation. |

#### Exit Codes
| Exit Code | Constant / Meaning | Condition |
| :---: | :--- | :--- |
| `0` | `SUCCESS` | Fresh install successful, clean uninstall, or idempotent repeat. |
| `2` | `BAD_ARGUMENTS` | Unknown flags or attempting to install into Astesia repo itself. |
| `3` | `NOT_OWNED` | Uninstall requested on directory without marker or owned by another repo. |
| `4` | `CONFLICT` | Target directory exists and is unowned (requires `-Force`). |
| `5` | `VERIFY_FAILED` | Post-installation integrity check failed (automatic rollback). |

---

### B. Brownfield Initializer (`tools/astesia-init.ts`)
| Argument | Description |
| :--- | :--- |
| `--target <path>` | Target repository root (defaults to `process.cwd()`). |
| `--dry-run` | Preview files to be written or removed. |
| `--upgrade` | Upgrade gate engine & templates while preserving custom `gate-config.json`. |
| `--uninstall` | Remove unmodified gate files; preserve user-modified configurations. |
| `--force` | Overwrite existing configurations or force removal of modified files. |

#### Exit Codes
| Exit Code | Meaning | Condition |
| :---: | :--- | :--- |
| `0` | `SUCCESS` | Initialization, upgrade, or clean uninstall completed. |
| `2` | `TARGET_ERROR` | Target does not exist, is a file, is Astesia repo itself, or invalid CLI flag. |
| `3` | `UNMANAGED_ERROR` | Uninstall target missing manifest or corrupted (requires `--force`). |
| `5` | `TEMPLATE_ERROR` | Source template missing in framework distribution. |

---

## 3. Test Suites & Mutation Killing Results

All installers are covered by automated test suites executed via `bun tools/tests/run.ts`:

### A. PowerShell 5.1 & Bash Suite (`tools/tests/installer-ps1.test.ts`)
- **Total Test Cases**: 57 (39 functional tests + 10 mutation tests + 4 Git Bash tests + 4 assertions)
- **PowerShell Version**: Tested and verified on Windows PowerShell 5.1 (`5.1.26100.9818`) with `Set-StrictMode -Version Latest`.
- **Bash Version**: Tested and verified on GNU Bash 5.2.37 (Git Bash for Windows).
- **Mutants Killed (10/10)**:
  1. `MUT-INST-01`: Conflict exit code 4 -> 0 (Killed)
  2. `MUT-INST-02`: Unowned uninstall exit code 3 -> 0 (Killed)
  3. `MUT-INST-03`: Omit ownership marker validation on uninstall (Killed)
  4. `MUT-INST-04`: Ignore `-Force` check on conflicting target (Killed)
  5. `MUT-INST-05`: Ignore `-DryRun` check during install (Killed)
  6. `MUT-INST-06`: Corrupt marker creation omitting `repo_path` (Killed)
  7. `MUT-INST-07`: Omit post-install verification check (Killed)
  8. `MUT-INST-08`: Bad arguments exit code 2 -> 0 (Killed)
  9. `MUT-INST-09`: Omit safety check against installing into source repo (Killed)
  10. `MUT-INST-10`: Invert idempotency check (Killed)

### B. Brownfield Initializer Suite (`tools/tests/init-suite.ts`)
- **Total Test Cases**: 57 (45 functional tests + 12 mutation tests)
- **Synthetic Project Smoke Test**: Initialized into a synthetic git repository, executed `bun .astesia/enforcement/astesia-gate.ts`, and verified clean exit 0.
- **Mutants Killed (12/12)**:
  1. `MUT-INIT-01`: Overwrite existing `gate-config.json` without `--force` (Killed)
  2. `MUT-INIT-02`: Create `CODEOWNERS` in root instead of `.astesia/docs/` (Killed)
  3. `MUT-INIT-03`: Omit manifest writing during init (Killed)
  4. `MUT-INIT-04`: Delete modified files during normal uninstall (Killed)
  5. `MUT-INIT-05`: Ignore `--dry-run` flag during init (Killed)
  6. `MUT-INIT-06`: Omit Astesia repository safety check (Killed)
  7. `MUT-INIT-07`: Non-existent target exit code 2 -> 0 (Killed)
  8. `MUT-INIT-08`: File target exit code 2 -> 0 (Killed)
  9. `MUT-INIT-09`: Invert idempotency check (Killed)
  10. `MUT-INIT-10`: Corrupt manifest schema by omitting `source_sha256` (Killed)
  11. `MUT-INIT-11`: Omit empty directory cleanup on uninstall (Killed)
  12. `MUT-INIT-12`: Invalid CLI argument exit code 2 -> 0 (Killed)

---

## 4. Verification Check

To run the complete verification suite across all tools and linters:
```bash
bun run check:all
```
Expected output:
```
=================================================
                 HEALTH SUMMARY                  
=================================================
  [PASS] Framework Linter                    (0.25s)
  [PASS] Unified Tools Test Suite            (31.13s)
  [PASS] Token Budget Verification           (0.17s)
  [PASS] Manifest Integrity Verification     (0.12s)
-------------------------------------------------
Final Status: ALL CHECKS PASSED (0)
```
