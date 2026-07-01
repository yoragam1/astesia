# Astesia Boot Sequence

This document defines the initialization process for AI agents orchestrating the Astesia Framework.

---

## Boot Stage 1 — Load Astesia Core
The agent must load the fundamental Astesia documents:
- `docs/astesia-persona.md`
- `docs/astesia-overview.md`
- `docs/agent-operating-guide.md`

---

## Boot Stage 1.5 — Auto Skill Classification *(NEW)*

> **This stage is MANDATORY before entering ANY layer. Do NOT skip.**

The agent MUST auto-classify which skills are relevant to the current user request:

1. **Enumerate available skills:** List all skill names from `skills/skills-index.md` (scan all subfolders if needed).
2. **Analyze the request:** Read the user's request and any existing artifacts (BRD, architecture, etc.) to identify the required technologies, patterns, and domains.
3. **Select relevant skills:** Choose only the skills that are directly applicable. Inject their content into your working context BEFORE reading layer rules.
4. **Persist selection:** Write the chosen skill names to `.astesia/astesia-state.json` → field `active_skills[]`.

**Selection Heuristics:**
- Request mentions "existing project / legacy / refactor" → always select `brownfield-entry`
- Request mentions "auth / JWT / password" → always select `security-review`
- Request mentions any database → always select the matching ORM skill
- Request mentions "resilience / retry / fault" → always select `self-healing`
- Request mentions "performance / cost" → always select `cost-reducer`
- **MANDATORY FOR ALL SESSIONS (DevOps/Safety):** `budget-circuit-breaker`
- **MANDATORY FOR ALL SESSIONS (Quality/Safety):** `anti-silent-failure`
- **IF Engineering Layer:** always select `ponytail-executor`
- **IF Quality Layer:** always select `architectural-linter`

**Output format in state:**
```json
"active_skills": ["brownfield-entry", "drizzle-orm", "security-review", "budget-circuit-breaker", "anti-silent-failure"]
```

---

## Boot Stage 2 — Read Execution State

Before performing any action, the AI agent MUST read `.astesia/astesia-state.json` and check ALL of the following fields:

| Field | Action Required |
|---|---|
| `current_layer` | Determines which rules and workflow to load |
| `layer_statuses` | Identify which layers are `done`, `in_progress`, `failed`, or `pending` |
| `blocking_issues[]` | If non-empty → shift priority to resolving these BEFORE new work |
| `retry_count` | If any layer has retries > 0, review the previous error before proceeding |
| `completed_artifacts[]` | Load these documents as context; do NOT regenerate them |
| `completed_files[]` | NEVER recreate these files; only modify if fixing a specific error |
| `active_skills[]` | Re-inject skill contents if resuming a session |

---

## Boot Stage 2.5 — Brownfield Detection

If the target project is NOT the result of `/astesia-init` (i.e., no `.astesia/` folder exists, or the project has existing source code without Astesia artifacts):
1. Initialize `.astesia/astesia-state.json` using `templates/astesia-state-template.json`.
2. Load and execute `skills/engineering/brownfield-entry.md` skill.
3. Generate `.astesia/system-map.md` using trace-by-function methodology.
4. Set `current_layer` in state to the layer matching the user's request.
5. Only then proceed to Boot Stage 3.

---

## Boot Stage 3 — Load Layer Constraint

Depending on the `current_layer` in the state, the agent loads ONLY the applicable rule file:
- If Product → `rules/product-rules.md`
- If Design → `rules/design-rules.md`
- If Engineering → `rules/engineering-rules.md` (and Astesia core)
- If Quality → `rules/quality-rules.md`
- If DevOps → `rules/devops-rules.md`

---

## Boot Stage 4 — Load Navigation Context

If `.astesia/system-map.md` exists in the target project:
- Load it as the primary navigation map for the codebase.
- Use trace-by-function for all code navigation (do NOT blind-scan).
- If the map appears stale (files referenced no longer exist), flag for regeneration but do NOT auto-regenerate without user confirmation.

---

## Boot Stage 4.5 — Error Recovery Baseline

- If `.astesia/astesia-state.json` has `blocking_issues[]` with entries OR any `layer_statuses` value is `"failed"`:
  - Load and prioritize the `skills/engineering/self-healing.md` skill.
  - The immediate goal shifts from feature development to **remediation**.
  - Focus strictly on resolving the listed blocking issues before proceeding to new work.
  - After each fix, update `blocking_issues[]` in state (remove resolved items, add new ones if discovered).

---

## Boot Stage 5 — Handoff to Specific Workflow

Jump to the specific workflow phase defined by the current layer:
- `workflows/phase1-product.md`
- `workflows/phase2-design.md`
- `workflows/phase3-engineering.md`
- `workflows/phase4-quality.md`
- `workflows/phase5-devops.md`
