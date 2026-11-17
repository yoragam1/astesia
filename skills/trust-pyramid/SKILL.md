---
name: trust-pyramid
description: >-
  Enforce constraints at the hardest possible layer (types/architecture > lint & CI > prose > human review) so agent output is verified by machines, not trusted or hand-reviewed.
---

# Skill: Trust Pyramid

## 1. Metadata
- **Name:** `trust-pyramid`
- **Origin:** `Astesia Quality (Verification-First Upgrade, ref: Lauren Tan, "All Code Is Slop (Except Mine)")`
- **Description:** Decision protocol for *where* a rule must live. Prose instructions are the weakest control; agents ignore them under load. Push every constraint as far down the pyramid as it can go.

## 2. When to Use
- Writing or reviewing ANY rule, directive, or "the agent must..." instruction.
- Engineering: choosing types/APIs. Quality: deciding what to automate. DevOps: deciding what blocks a merge.
- Whenever an agent repeats a mistake (hand off to `lint-ratchet`).

## 3. Practical Guidance

```
L1  Architecture & Types   - wrong code is structurally impossible (branded types, Zod-inferred types, narrow APIs, layer boundaries)
L2  Lint / Compiler / CI   - wrong code fails deterministically (.astesia/anti-patterns.json, typecheck, tests, coverage floor)
L3  Prose rules            - only for judgment that cannot be coded (rules/*.md, AGENTS.md)
L4  Human review           - sampled, post-merge, on risk (auth, money, migrations, security)
```

### Placement procedure (run for every new constraint)
1. Can the type system or module boundary make the violation impossible? → **L1**. Do it.
2. Can a regex/AST/test detect it with a low false-positive rate? → **L2**. Add a rule to `.astesia/anti-patterns.json` (see `lint-ratchet`).
3. Only if neither: write it as prose (**L3**) and justify in one line why it cannot be automated.
4. Never rely on L4 as the primary control. Humans sample; machines gate.

### Constrain the search space
- Prefer **banning** anti-patterns outright over *discouraging* them. A ban is a rule with `severity: error`.
- Fewer legal ways to write code = less slop for future agents to copy.

### Enforcement ownership
| Concern | Layer | Owner | Mechanism |
|---|---|---|---|
| Controller touches DB | L2 | Quality | `ASTESIA-001` |
| Hallucinated import | L2 | Quality | `ASTESIA-000` |
| Invalid input shape | L1 | Engineering | Zod schema → inferred type |
| "Write clean code" | — | — | ❌ Not a rule. Delete it. |

## 4. Anti-Patterns
- ❌ Adding a paragraph to `AGENTS.md` when a 3-line lint rule would do.
- ❌ "Reviewer will catch it." (At agent scale, no one reads every diff.)
- ❌ Soft `warn` rules that never ratchet to `error`.
