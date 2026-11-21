---
name: worktree-isolation
description: >-
  Isolate experimental task execution in a dedicated Git Worktree to protect the primary workspace.
---

# Skill: Worktree Isolation (Git Worktrees)

## 1. Metadata
- **Name:** `worktree-isolation`
- **Origin:** `Astesia Engineering (Ceobe Upgrade Phase 3)`
- **Description:** Protocol for creating temporary Git Worktrees before executing highly destructive, complex, or experimental Task Waves. Prevents the active development workspace from being polluted by unverified AI code generation.

## 2. When to Use
Invoke this skill when:
- The implementation plan modifies core infrastructure (e.g., migrating a database schema, changing the global authentication provider).
- You are about to spawn a massive multi-agent Task Wave.
- You need to perform a major refactoring (e.g., converting JavaScript to TypeScript).

## 3. Practical Guidance

### Step 1: Create the Worktree
Instead of checking out a local branch in the current directory, create a sibling directory using Git Worktree.
```bash
# Create a new branch and worktree directory outside the main src
git worktree add ../astesia-worktree-feature-x -b astesia/feature-x
```

### Step 2: Relocate the Execution Context
Once the worktree is created, any subagents or commands you run MUST target that new directory (`../astesia-worktree-feature-x`).
- Execute commands targeting the worktree directory (e.g., using `git -C ../astesia-worktree-feature-x` or `cd ../astesia-worktree-feature-x && ...` in `run_command`).
- Pass the absolute path to the worktree when assigning files to subagents.

### Step 3: Execute and Verify
Run all Task Waves, `npm run build`, and `npm run test` inside the worktree.
- If it fails beyond the 3-retry auto-rollback limit, **Abort**.

### Step 4: Merge and Cleanup
If (and only if) the Quality Auditor approves the changes in the worktree:
1. Commit the changes in the worktree.
2. Return to the main directory.
3. Merge the worktree branch into the main branch.
4. Remove the worktree.

```bash
# Inside worktree
git add .
git commit -m "feat: implement feature x via astesia"

# Return to main repo
cd ../main-repo
git merge astesia/feature-x
git worktree remove ../astesia-worktree-feature-x
git branch -d astesia/feature-x
```

## 4. Anti-Patterns
- ❌ **Main Branch Execution:** Running destructive refactoring scripts directly on the `main` branch without isolation.
- ❌ **Dangling Worktrees:** Failing to run `git worktree remove` after a task finishes or fails, leaving disk space occupied.
