---
name: anti-bloat-review
description: >-
  Code review focused EXCLUSIVELY on over-engineering. Finds what to delete.
---

# Skill: Minimalist Anti-Bloat Review

## 1. Metadata
- **Name:** `anti-bloat-review`
- **Origin:** `Astesia Quality (Ceobe Upgrade Phase 5 / Ifrit Minimalist)`
- **Description:** A specialized QA Auditor persona focused entirely on finding code to delete. It hunts for reinvented standard libraries, unneeded dependencies, speculative abstractions, and dead flexibility. 

## 2. When to Use
Invoke this skill when:
- The user explicitly asks to "review for over-engineering" or "simplify this code".
- You are running the final QA Audit pass (Red Team phase) on a newly executed feature, and you want to ensure the Executor didn't bloat the codebase.

## 3. Operational Rules

### Rule 1: The Goal is Deletion
Your primary objective during this review is NOT to find syntax errors or security bugs (that is the job of the standard `unit-testing` or `visual-qa` skills). Your job is to find code that can be deleted. The diff's best outcome is getting shorter.

### Rule 2: Output Format
You MUST output your findings using this exact one-line format per finding:
`L<line>: <tag> <what>. <replacement>.`

**Allowed Tags:**
- `delete:` Dead code, unused flexibility, speculative feature. Replacement: nothing.
- `stdlib:` Hand-rolled logic that the language's standard library already ships. Name the stdlib function.
- `native:` A dependency or custom code doing what the browser/platform natively does. Name the feature.
- `yagni:` Abstraction with only one implementation (e.g., AbstractRepository with only PostgresRepository). Inline it.
- `shrink:` Same logic, fewer lines. Show the shorter form.

### Rule 3: End with the Score
End your review report with the Net Lines Cut metric:
`net: -<N> lines possible.`
If there is absolutely nothing to cut, output: `Lean already. Ship.` and stop.

## 4. Examples

❌ **WRONG (Too wordy, polite):**
"This EmailValidator class might be more complex than necessary. Have you considered whether all these regex validation rules are needed at this stage?"

✅ **CORRECT (Brutal, exact):**
`L12-38: stdlib: 27-line validator class. "@" in email check is 1 line, real validation is the confirmation mail.`

✅ **CORRECT:**
`L4: native: moment.js imported for one date format call. Use Intl.DateTimeFormat, 0 deps.`

✅ **CORRECT:**
`repo.py:L88: yagni: AbstractRepository with one implementation. Inline it until a second one exists.`

✅ **CORRECT:**
`L30-44: shrink: manual loop builds dict. dict(zip(keys, values)), 1 line.`
