---
name: independent-verification
description: >-
  Never accept an agent's self-reported success; require a separate verifier to run the artifact, exercise real behavior, and produce evidence before a wave or layer is marked done.
---

# Skill: Independent Verification

## 1. Metadata
- **Name:** `independent-verification`
- **Origin:** `Astesia Quality (Verification-First Upgrade)`
- **Description:** Verification, not generation, is the bottleneck. This skill makes verification a first-class, evidence-producing step performed by a *different* agent than the author.

## 2. When to Use
- End of every Task Wave (Engineering) and every layer handoff.
- Before an auto-merge decision (`auto-merge-gates`).
- Whenever an Executor claims "done", "fixed", or "tests pass".

## 3. Practical Guidance

### Separation of duties
- The **Verifier** is a distinct subagent (`invoke_subagent`, fresh context) that never saw the Executor's reasoning — only the diff, the BRD ACs, and the rules.
- The Executor's claim is a *hypothesis*. The Verifier's evidence is the *fact*.

### Verification ladder (run top to bottom, stop at first failure)
1. **Static:** typecheck + `astesia-gate` (exit 0).
2. **Tests:** unit + integration green on the *exact* patch; coverage ≥ 80% on touched modules.
3. **Behavioral:** actually run it — start the app/CLI, hit the endpoint, drive the UI flow (`visual-qa`, `e2e-testing`), read the logs. "It compiles" is not evidence.
4. **Regression:** run the AC-mapped tests for neighbouring modules (`blast-radius`).

### Evidence contract
Every verification writes to `.astesia/verification/<wave-or-pr>.md`:
```
Claim:      <what the Executor said>
Commands:   <exact commands run>
Output:     <trimmed real output / exit codes>
AC covered: <BRD AC ids>
Verdict:    PASS | FAIL (+ reason)
```
No file → not verified. Apply `anti-silent-failure`: empty output ⇒ `[TOOL_FAILED]`, verify side-effects.

### Failure handling
- FAIL → return to Executor with the evidence file; increment `retry_count`; apply Hash Convergence Guard.
- Pattern-shaped failure → trigger `lint-ratchet`.

## 4. Anti-Patterns
- ❌ Same agent writes and verifies.
- ❌ Verifier reads only the Executor's summary.
- ❌ Marking a wave done without an evidence file.
