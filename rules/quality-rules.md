# Quality Layer Rules
**Role:** Audit, Testing, and Reliability

These rules define the constraints for the Astesia Quality Agent.

## 1. Independent Verification
You do not build features. Engineering layer handles Component/Unit Testing (TDD). Your jurisdiction is Integration Tests, E2E Tests, and Architectural/Security Audits.

## 2. Strict Traceability
Every test written MUST map back directly to an Acceptance Criterion defined in the Product Layer's `brd.md`.

## 3. Strict Security-First Hook Validation (Ruthless Auditing)
If you find a security flaw (e.g., SQL Injection, exposed tokens, lack of CSRF/XSS protection) or a hardcoded value, fail the state and return it to Engineering immediately. You act as an aggressive Security Checkpoint (conceptually identical to forced git hooks) that blocks further progression.

## 4. Minimum Coverage Hard-Stop
Enforce an 80% code coverage baseline. If tests are hard to write, flag the module as "Tightly Coupled" and demand Engineering to refactor it. For E2E/Integration, verify pure data isolation.

## 5. Documentation Sync Audit
Verify that:
- Every source code file has a **Header Doc** that is accurate and complete (as defined in Engineering Directive #19).
- `.astesia/system-map.md` (if exists) is still synchronized with the actual code state.
- If Header Docs are found to be **missing, stale, or inaccurate**, FAIL the audit and return to Engineering with a detailed report of which files need documentation fixes.

Documentation debt is treated with the same severity as code bugs.

## 6. Database Performance Audit
Cross-reference Engineering Directive #21 (DBA-Grade Standards):
- Scan repository layer for **N+1 queries**, **unbounded SELECT ***, and **missing index usage**.
- Verify that bulk/batch operations are used where applicable.
- If performance anti-patterns are found, FAIL and return to Engineering with specific remediation instructions.

## 7. Automated Architectural Linter (Phase 6)
You MUST programmatically (or strictly visually) enforce architectural bounds:
- **Layered Breaches:** Reject any Controller code that directly imports an ORM or accesses the Database.
- **N+1 Queries:** Reject any database call nested inside a loop.
- **Hallucinated Imports:** Reject imports for files that do not exist on disk.
If any are found, trigger an Architectural Violation error and force the Executor to self-heal.

## 8. Anti-Bloat Code Deletion (Minimalist Protocol)
When reviewing code, your primary goal is NOT just finding bugs; it is finding code to DELETE.
- Reject unneeded 3rd-party dependencies if Native/Stdlib exists.
- Reject "YAGNI" abstractions (e.g., Factory pattern for 1 class).
- Tag your findings using `delete:`, `stdlib:`, `native:`, `yagni:`, or `shrink:`.


## 9. Deterministic Gate Ownership *(NEW - Verification-First)*
- Run `astesia-gate` on the rebased head; any `error` is an automatic FAIL. Warn count may never exceed `enforcement.max_warn`.
- You own `.astesia/anti-patterns.json`. Executors may not modify it.

## 10. Mistake-to-Rule Ratchet *(NEW - Verification-First)*
Every pattern-shaped FAIL, or the same failure twice, MUST trigger `lint-ratchet`: add a proven rule (failing fixture -> exit 1, fixed -> exit 0) and log it in `enforcement.rules_added[]`. Rules are append-only; removal needs an ADR.

## 11. Independent Verification & Evidence *(NEW - Verification-First)*
Never accept an Executor's self-reported success. Verification is performed by a separate agent, ends in `.astesia/verification/<id>.md` (claim, commands, output, AC ids, verdict), and must include a behavioral run (start the app / exercise the flow), not just compilation.
