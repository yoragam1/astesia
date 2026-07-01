---
name: "Blast Radius (Dependency Impact Analysis)"
description: "Trace file dependencies to map the blast radius before modifying core services."
---
# Skill: Blast Radius (Dependency Impact Analysis)

## 1. Metadata
- **Name:** `blast-radius`
- **Origin:** `Astesia Engineering (Ceobe Upgrade Phase 3)`
- **Description:** Protocol for tracing the dependency graph (what files import the file you are about to edit) to ensure that a localized fix doesn't cause a cascade of compilation errors in dependent services.

## 2. When to Use
Invoke this skill when:
- You are modifying an interface, type definition, or function signature in the Core layer.
- You are refactoring a widely-used utility function or database repository.
- A test fails because of a type mismatch on an imported function.

## 3. Practical Guidance

### Step 1: Identify the Core Target
Suppose you need to add a `role: string` parameter to `UserService.createUser()`.

### Step 2: Search for Dependent Files
Before editing `UserService`, you must find every file that currently calls `createUser()`.
- Use the `grep_codebase` tool to search for the exact import path or function usage.
- E.g., `grep_search("UserService")` or `grep_search("createUser")`.

### Step 3: Analyze the Blast Radius
List the dependent files. (e.g., `AuthController.ts`, `AdminController.ts`, `seed.ts`).
- **Small Radius (1-3 files):** Group them into a single Task Wave. You (or a subagent) will modify `UserService` AND the 3 dependent files in one fell swoop.
- **Large Radius (4+ files):** STOP. A breaking change to this function will cause massive churn. Consider creating a *new* function (e.g., `createUserWithRole()`) or making the new parameter optional (`role?: string`) to avoid breaking the existing graph.

### Step 4: Coordinated Execution
If you proceed with a breaking change, you must pass the exact list of dependent files to the Executor subagents so they know exactly what needs to be updated. Do not assume the compiler will guide them; the compiler output might get truncated if there are too many errors.

## 4. Anti-Patterns
- ❌ **Blind Refactoring:** Changing a core signature and hitting "Save" without checking what else uses it.
- ❌ **Ignoring Optionality:** Breaking 20 files by adding a required parameter when an optional parameter (with a default fallback) would have achieved the same goal safely.
