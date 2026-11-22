# Astesia Framework v3.0.0

Astesia is a multi-layered autonomous orchestrator and software agency framework designed for AI-driven software development. It enforces strict SDLC governance through deterministic code constraints, verification-first pipelines, and automated gating.

---

## 1. Installation

### A. Live Plugin Mode (Antigravity Editor)
To link the Astesia framework directly into your Antigravity user plugins directory (`~/.gemini/antigravity/plugins/astesia`):

- **Windows (PowerShell 5.1+)**:
  ```powershell
  .\install.ps1
  ```
  Options:
  - `-Target <path>`: Override destination directory.
  - `-DryRun`: Preview actions without disk modification.
  - `-Uninstall`: Safely remove the linked plugin.
  - `-Force`: Backup any foreign conflicting folder to `.bak-<timestamp>` and install.

- **POSIX (Linux / macOS / WSL)**:
  ```bash
  ./install.sh
  ```
  Options: `--target <path>`, `--dry-run`, `--uninstall`, `--force`.

For technical verification, exit code definitions, and test results, see [docs/INSTALL-VERIFICATION.md](file:///D:/Workspaces/Astesia/docs/INSTALL-VERIFICATION.md).

---

## 2. Brownfield Project Initialization

To equip any existing repository with the Astesia Gate, anti-pattern rules, and GitHub Actions workflow:

```bash
bun tools/astesia-init.ts --target /path/to/project
```

Options:
- `--dry-run`: Preview files to be written.
- `--upgrade`: Refresh gate script, anti-patterns, and workflow templates while strictly preserving your local `gate-config.json`.
- `--uninstall`: Safely remove unmodified gate files while preserving any user-customized configurations.
- `--force`: Force overwrite of existing configuration or complete removal of modified files.

---

## 3. Machine Enforcement & Gate Reference

The deterministic enforcement engine is governed by `astesia-gate.ts` and `.astesia/anti-patterns.json`.

- Full CLI documentation, rule catalog, and known limitations: [docs/GATE-REFERENCE.md](file:///D:/Workspaces/Astesia/docs/GATE-REFERENCE.md)
- Complete skill and rule inventory: [docs/GENERATED-INVENTORY.md](file:///D:/Workspaces/Astesia/docs/GENERATED-INVENTORY.md)
- Tool capability mapping and runtime verification: [docs/TOOL-VERIFICATION.md](file:///D:/Workspaces/Astesia/docs/TOOL-VERIFICATION.md)

---

## 4. Verification & Health Checks

Astesia provides a unified command to run all framework linters, property tests, mutation suites, and manifest integrity checks:

```bash
bun run check:all
```

Individual checks:
- `bun run lint:framework`: Framework linter (FL-001 through FL-020).
- `bun run test:tools`: Unified tool test runner (200 test cases & mutations).
- `bun run check:budget`: Boot set token budget verification.
- `bun run check:manifest`: Audit manifest cryptographic verification.
