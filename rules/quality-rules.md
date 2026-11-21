# Quality Layer Rules
**Role:** Audit, Testing, and Reliability

## 1. Independent Verification
Quality does not build features. Focus exclusively on Integration Tests, E2E Tests, and Architectural/Security Audits.

## 2. Strict Traceability
Every test written MUST map back directly to an Acceptance Criterion in `brd.md`.

## 3. Security Checkpoint Validation
Fail the audit and halt progression on any security flaw (SQLi, exposed tokens, CSRF/XSS, unvalidated inputs).

## 4. Minimum Coverage Hard-Stop
Enforce an 80% code coverage baseline. Flag hard-to-test modules as tightly coupled for refactoring.

## 5. Documentation Sync Audit
Verify `.astesia/system-map.md` and `architecture.md` match actual code. Missing or contradictory documentation fails the audit.

## 6. Database Performance Audit
Verify queries follow DBA-grade standards. Enforce batching and indexed access; reject performance anti-patterns (enforced by `ASTESIA-007` and `ASTESIA-002`).

## 7. Automated Architectural Linter
Enforce architectural boundaries: reject controller ORM imports (`ASTESIA-001`), loops with DB queries (`ASTESIA-007`), and hallucinated imports (`ASTESIA-000`).

## 8. Anti-Bloat Code Deletion (Minimalist Protocol)
Prioritize code deletion over additions (`skills/anti-bloat-review/SKILL.md`). Reject unneeded dependencies and YAGNI abstractions (`delete:`, `stdlib:`, `native:`, `yagni:`, `shrink:`).

## 9. Deterministic Gate Ownership *(NEW - Verification-First)*
- Run `bun .astesia/enforcement/astesia-gate.ts --json` on rebased head; any `error` = FAIL. Warns must not exceed `enforcement.max_warn`.
- CLI flags: `--baseline`, `--update-baseline`, `--max-warn`, `--json`, `--root`, `--rules`, `--rules-diff`, `--check-workflow`, `--allow-raise`, `--reason` (see `docs/GENERATED-INVENTORY.md`).
- Policy: `NEVER_BASELINE = [ASTESIA-000, ASTESIA-004, ASTESIA-010]`, `NEVER_INLINE_SUPPRESS = [ASTESIA-000, ASTESIA-004]`. Generated files protected.
- Limitations: elevated FP on 000/004 on some repos; gate validated on Windows; `--check-workflow` is a static PR lint.
- Quality owns `.astesia/anti-patterns.json`; Executors may not modify it.

## 10. Mistake-to-Rule Ratchet *(NEW - Verification-First)*
Every pattern-shaped FAIL triggers `lint-ratchet`: add proven rule to `.astesia/anti-patterns.json` and log in `enforcement.rules_added[]`. Rules are append-only.

## 11. Independent Verification & Evidence *(NEW - Verification-First)*
Never accept self-reported success. Verification requires a separate agent, `.astesia/verification/<id>.md` evidence, and real behavioral execution.

## 12. Property-Based Testing Requirement *(NEW - Verification-First)*
Parsers, validators, math, and state machines MUST include ≥ 1 property-based test with invariants in title (TS: `fast-check`, Python: `hypothesis`, Go: `go test -fuzz`).
