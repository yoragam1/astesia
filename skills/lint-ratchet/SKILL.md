---
name: lint-ratchet
description: >-
  Convert every repeated or reviewer-caught agent mistake into a permanent, machine-enforced rule in the anti-pattern registry so it can never recur.
---

# Skill: Lint Ratchet (Mistake → Rule)

## 1. Metadata
- **Name:** `lint-ratchet`
- **Origin:** `Astesia Quality (Verification-First Upgrade)`
- **Description:** The learning loop of the framework. The system gets stricter after each failure and never loosens silently.

## 2. When to Use
- Quality audit FAILS for a pattern-shaped reason.
- A human review comment or post-merge sample finds a defect class.
- The same correction is issued to an agent twice (`retry_count` ≥ 2 for a similar reason).
- `blocking_issues[]` contains a recurring cause.

## 3. Practical Guidance

### The loop
1. **Name the pattern** (not the instance): "controller imports ORM", not "bug in user.route.ts".
2. **Place it** using `trust-pyramid`. Prefer L1 (types); else L2 (rule).
3. **Write the rule** in `.astesia/anti-patterns.json`:
   - `id`: next `ASTESIA-NNN`; `origin`: incident (date + layer + one-line cause); `fix`: the exact remedy the agent must apply.
   - Start at `severity: error` if false positives are near-zero; otherwise `warn` with a ratchet date.
4. **Prove it** (mandatory): create a failing fixture, run `bun .astesia/enforcement/astesia-gate.ts`, confirm exit 1; fix the fixture, confirm exit 0. No proof = no rule.
5. **Clear existing violations** via a gardening wave (`codebase-gardening`) — never merge a rule that turns the main branch red.
6. **Record**: append to `astesia-state.json → enforcement.rules_added[]` and `history[]`.

### Ratchet rules
- Rules are **append-only**. Removal requires an ADR (`adr-management`).
- `warn` → `error` promotion when warn count reaches 0, or set `--max-warn` to the current count and lower it each wave. The warn budget may only decrease.
- Suppression requires `astesia-allow: <rule-id> -- <reason>`; a missing reason is itself a violation.
- Cap: if a rule needs > 10 suppressions, it is the wrong rule — redesign it.

## 4. Anti-Patterns
- ❌ Fixing the instance without adding the rule.
- ❌ Writing a rule you never ran.
- ❌ Blanket-disabling a rule to get a green build.
