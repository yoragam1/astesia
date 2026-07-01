# Astesia Agent Operating Guide

This document defines how AI agents should operate when orchestrating an Astesia Pipeline.

---

## Step 1: Request Interception (Antigravity Hooks)

Astesia operates interactively via **Google Antigravity Slash Commands**.
When a User makes a request, the agent must identify the Entry Point via the slash command invoked:

- `/astesia-init` → MASTER COMMAND. Starts a fresh project from scratch and initializes memory state.
- `/astesia-product` → Generates the initial BRD based on a raw idea.
- `/astesia-product-audit` → Audits the BRD after human modification to catch scope creep/anomalies.
- `/astesia-design` → Start here for UI redesign.
- `/astesia-engineering` → Start here for code building.
- `/astesia-quality` → Start here for testing/auditing.
- `/astesia-devops` → Start here for deployment setup.

---

## Step 1.5: Auto Skill Classification *(NEW — MANDATORY)*

**Before doing anything else**, the agent MUST classify and load relevant skills:

1. List all available skills from `skills/skills-index.md`.
2. Analyze the user request against the skill list.
3. Load the content of ONLY the relevant skills into context.
4. Persist selected skills to `.astesia/astesia-state.json → active_skills[]`.

> This prevents the agent from ignoring critical domain-specific rules (security, ORM patterns, brownfield protocol) simply because the user didn't explicitly mention them.

---

## Step 2: Layer Context Loading

Before executing any layer, the agent MUST load the specific rules for that layer:
- Product → Read `rules/product-rules.md`
- Design → Read `rules/design-rules.md`
- Engineering → Read `rules/engineering-rules.md`
- Quality → Read `rules/quality-rules.md`
- DevOps → Read `rules/devops-rules.md`

You MUST ALSO check `skills/skills-index.md` for specific contextual capabilities.

**State Verification (mandatory):** Read `.astesia/astesia-state.json` and check:
- `blocking_issues[]` — resolve these FIRST if non-empty
- `completed_artifacts[]` — load, do NOT regenerate
- `retry_count` — understand what failed in prior attempts before proceeding

---

## Step 2.5: RAG Memory & Semantic Context

For enterprise codebases (>50 files):
- **Never load the entire codebase into context.** Token budgets are finite.
- Use **Semantic Search / RAG** to retrieve only the top relevant chunks instead of brute-force scanning.
- If entering a large Brownfield project, prioritize generating a `system-map.md` before proceeding.

---

## Step 3: Three Brains Orchestration & Autonomous Supervisor Loop *(UPGRADED)*

Unlike standard coding assistants, Astesia agents **must leave a paper trail** and manage transitions seamlessly using the **Three Brains** pattern to prevent hallucination and bias.

**The Supervisor Loop Sequence:**
`Product (BRD) → Design → Engineering (Architecture & Execute) → Quality Audit → DevOps`

Within the Engineering Layer, execution is orchestrated via Antigravity Subagents (`invoke_subagent`):
1. **The Planner (Architect):** Decomposes the architectural plan into **Task Waves** (Foundation → Core → Integration). See `skills/engineering/task-waves.md`.
2. **The Executors:** Multiple subagents are invoked in parallel to execute independent tasks within a wave.
3. **The QA Auditor:** A separate subagent cross-checks the executor's output against the BRD and Engineering Rules.

At the end of a layer's overall task:
1. Generate the markdown artifact for that layer (e.g., BRD, Architecture, Test Spec).
2. **Auto-Transition:** Once a layer completes its artifact and validates it via the pre-handoff checklist, the system should automatically trigger the next phase in the loop without waiting for human manual prompts.
3. Update `.astesia/astesia-state.json`:
   - Set `layer_statuses.[current_layer]` → `"done"`
   - Add the artifact name to `completed_artifacts[]`
   - Add new file paths to `completed_files[]`
   - Append to `history[]` with a clear `agent_note`
4. Explicitly inform the user of the auto-transition or "halt" the pipeline if an error occurs.

---

## Step 4: Strict Separation of Concerns (SoC)

- **Do not** write Python code while in the Product Layer.
- **Do not** write CSS while in the Quality Layer.
- Stay completely inside the persona of the current active layer.

---

## Step 5: Pre-Handoff Self-Correction Audit *(NEW — MANDATORY)*

Before presenting ANY artifact to the user, run the internal audit checklist from `rules/engineering-rules.md` Directive #24:

```
✅ Does this answer ALL requirements from the prior layer?
✅ No contradictions between this artifact and the BRD?
✅ Can the next layer work from this without asking clarification?
✅ No circular dependencies or unresolved assumptions?
```

- If all pass → proceed to handoff.
- If any fail → fix internally, document in state, then hand off.
- Maximum 2 internal correction cycles before escalating to user.

---

## Step 6: Error Recovery & Infinite Loop Protection

To prevent AI hallucination loops, max_tokens burn, and broken codebases:
1. **Git Auto-Snapshot (Safety Net)**: Before modifying any source code, the agent MUST take a snapshot (e.g., `git commit` or `git stash`).
2. **Hash Convergence Guard**: Before re-running an internal correction cycle, check if the document/artifact content has actually changed. If the content hash (or exact text) is identical to the previous attempt, ABORT the loop immediately to prevent infinite loops.
3. **Token Bleed Protection**: Never exceed 3 internal retries for the same task. If `retry_count` hits 3, halt execution gracefully.
4. **Auto-Rollback**: If execution halts due to Token Bleed (3 failures) and the code is left in a broken/uncompilable state, the agent MUST automatically execute a Git Rollback to the snapshot taken in step 1, ensuring the user is never left with broken code.
5. If a blocking error occurs that cannot be resolved autonomously:
   - Update `astesia-state.json → blocking_issues[]` with a clear, specific description.
   - Set `layer_statuses.[failing_layer]` → `"failed"`.
   - Increment `retry_count.[failing_layer]`.
   - Inform the user with the exact issue and a proposed remediation path.
   - Do NOT silently skip the issue and continue.
6. **Anti-Silent Failure Protocol (Phase 6):** If a terminal command or tool execution returns an empty output or exits suspiciously without a clear `Error:`, you MUST manually verify the side-effects (e.g., check if the file was actually generated). If it failed silently, you MUST inject `[TOOL_FAILED: reason]` into your context to prevent hallucination cascades.

---

## Step 7: Extreme Token Efficiency (Global Rule)

To prevent massive API bills and token bloat, Astesia agents MUST adhere to these absolute constraints:
1. **Dynamic Skill Pruning:** NEVER inject/load all skills at once. Load ONLY the specific skills mandated by the current task (from `skills-index.md`).
2. **Output Scope Control:**
   - Output ONLY the necessary markdown document, artifact, or code.
   - Do NOT include conversational filler, greetings, or self-narrations of what you are about to do.
   - Do NOT rewrite or re-summarize unchanged parts of massive artifacts.
3. **Targeted Reading:** Never use `read_file` on files > 500 lines unless you explicitly plan to rewrite the entire file. Use surgical `grep_search` or extract only specific function blocks to save input context.
