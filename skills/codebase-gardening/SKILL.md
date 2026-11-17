---
name: codebase-gardening
description: >-
  Run dedicated refactor waves that delete deprecated patterns, pay down debt markers, and clear new lint-rule violations so future agents copy good habits instead of slop.
---

# Skill: Codebase Gardening

## 1. Metadata
- **Name:** `codebase-gardening`
- **Origin:** `Astesia Engineering (Verification-First Upgrade)`
- **Description:** Agents imitate the code around them. A messy codebase breeds more mess. Gardening waves keep the training signal clean.

## 2. When to Use
- After `lint-ratchet` adds a rule (clear existing violations).
- `debt-scanner` reports `astesia-debt:` markers or `astesia-gate` warn budget > 0.
- Before a feature wave in a legacy area (brownfield) to remove the patterns agents would otherwise copy.
- Periodically (e.g., once per release).

## 3. Practical Guidance

### Gardening wave (a Task Wave of its own)
1. **Inventory:** `bun .astesia/enforcement/astesia-gate.ts --json` + `grep_search("astesia-debt:")` + `anti-bloat-audit`.
2. **Prioritize by copy-risk:** patterns most likely to be imitated (hot paths, templates, examples) first.
3. **Slice:** one pattern per PR, mechanical and small; never mix gardening with feature work.
4. **Execute:** parallel Executors via `worktree-isolation`; `blast-radius` before touching shared modules.
5. **Verify:** `independent-verification` — behavior unchanged, tests green, violation count strictly decreased.
6. **Ratchet:** lower `--max-warn` to the new count; promote cleared `warn` rules to `error`.

### Rules of engagement
- Behavior-preserving only. A gardening PR that changes behavior is rejected.
- Delete over rewrite (`minimalist-executor`).
- Brownfield: respect the existing architecture; garden *toward* it, not toward an idealized one.

## 4. Anti-Patterns
- ❌ Big-bang rewrite PRs.
- ❌ Adding a rule without gardening the violations it exposes.
- ❌ Leaving deprecated patterns "for reference" — agents will copy them.
