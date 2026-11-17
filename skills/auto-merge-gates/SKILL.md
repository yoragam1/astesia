---
name: auto-merge-gates
description: >-
  Define the deterministic conditions under which agent PRs may merge without pre-merge human review, plus post-merge sampling and instant rollback.
---

# Skill: Auto-Merge Gates

## 1. Metadata
- **Name:** `auto-merge-gates`
- **Origin:** `Astesia DevOps (Verification-First Upgrade)`
- **Description:** Moves human oversight from *pre-merge review* to *post-merge sampling*, but only after the machine gates are strong enough to deserve that trust.

## 2. When to Use
- Setting up CI/CD (Phase 5) for a project where agents open PRs.
- Deciding whether a given change may auto-merge or needs a human.

## 3. Practical Guidance

### Eligibility (ALL must hold, else human review)
1. `.astesia/enforcement/astesia-gate.ts` exit 0 on the **rebased** head (`templates/enforcement/astesia-gate.workflow.yml`).
2. Typecheck, unit, integration/E2E green; coverage floor met.
3. `.astesia/verification/<pr>.md` exists with `Verdict: PASS` from an independent Verifier.
4. Diff touches **no high-risk path** (declare in `astesia-state.json → enforcement.human_review_paths[]`; default: auth, payments, migrations, infra/IaC, secrets, CI config, `.astesia/anti-patterns.json`).
5. Diff size ≤ `enforcement.max_auto_merge_loc` (default 400) and a Git auto-snapshot tag exists.
6. Project `enforcement.auto_merge` is `true` — **default `false`; the user opts in explicitly.**

### Trust progression (earn auto-merge)
`manual` → `shadow` (gates run, human still merges, track agreement) → `auto-merge` once ≥ 20 consecutive shadow PRs matched human verdicts with 0 post-merge reverts.

### Post-merge sampling
- Human audits a risk-weighted sample (default 10%, 100% of any path near `human_review_paths`).
- Each defect found → `lint-ratchet`.
- Track `revert_rate`; if > 2% over the last 50 merges, **auto-disable** auto-merge, set `status: halted`, notify the user.

### Rollback
Every auto-merge is one revertable commit. Revert first, diagnose second.

## 4. Anti-Patterns
- ❌ Auto-merge before the gates have a track record.
- ❌ Letting agents edit the gate, the rule registry, or CI config on the auto-merge path.
- ❌ Treating green CI on a stale (non-rebased) branch as proof.
