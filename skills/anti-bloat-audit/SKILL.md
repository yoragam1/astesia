---
name: anti-bloat-audit
description: >-
  Audit an entire codebase for over-engineering and provide a deletion roadmap.
---

# Skill: Minimalist Anti-Bloat Audit

## 1. Metadata
- **Name:** `anti-bloat-audit`
- **Origin:** `Astesia Quality (Ceobe Upgrade Phase 5 / Ifrit Minimalist)`
- **Description:** A system-wide scanning protocol used when entering a bloated legacy codebase (Brownfield). The auditor scans the repository not to find bugs, but to find over-engineered patterns (dead code, excessive dependencies, YAGNI violations) and generates a deletion roadmap.

## 2. When to Use
Invoke this skill when:
- The user says "Audit this repo for bloat", "Cleanup this project", or invokes the `brownfield-entry` protocol on a legacy project.
- You notice the project is full of massive classes or dependencies that could be replaced by a few lines of modern native features.

## 3. Operational Rules

### Step 1: Scan for Heavy Dependencies
Check `package.json` (or equivalent). Flag any library that is infamous for being replaceable by modern native APIs or standard libraries.
- e.g., `moment.js` (replace with `Intl` or `Date`).
- e.g., `lodash` (replace with native array methods).
- e.g., Heavy UI component libraries used only for 1 trivial component.

### Step 2: Scan for Structural Bloat (YAGNI)
Use `list_dir` and AST parsing (if necessary) to find:
- Folders like `interfaces/` containing `IUserService` that only has one implementation (`UserServiceImpl`).
- Folders like `factories/` or `strategies/` for features that do not actually have multiple variations.

### Step 3: Scan for Dead Code
Find functions or files that are never imported anywhere.

### Step 4: The Audit Report
Compile your findings into a single Markdown artifact (e.g., `anti_bloat_audit.md`).
Format each finding strictly following the `anti-bloat-review` format:
`<file>:L<line>: <tag> <what>. <replacement>.`

**Allowed Tags:**
- `delete:`
- `stdlib:`
- `native:`
- `yagni:`
- `shrink:`

At the bottom of the artifact, provide the grand total:
`Total net lines cut possible: -<N> lines.`

### Step 5: Deletion Task Wave
Ask the user if they want you to spawn Executor subagents to carry out the deletion roadmap.
*"Audit complete. I found 450 lines of code that can be deleted without affecting functionality. Shall I spawn the Executors to trim the fat?"*
