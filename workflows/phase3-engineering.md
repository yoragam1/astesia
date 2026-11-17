# Phase 3: ENGINEERING
**Objective:** Build the logical architecture and write source code.

---

## 1. Context Loading

- [ ] Read `.astesia/brd.md` (Product Layer output).
- [ ] Read `.astesia/design-system.md` (Design Layer output) — if applicable.
- [ ] Read `.astesia/system-map.md` (Brownfield only) — if exists.
- [ ] Load `rules/engineering-rules.md` (all 29 Directives).
- [ ] Verify `astesia-state.json` shows prerequisite layers as `done`.
- [ ] Check `blocking_issues[]` — resolve before proceeding if non-empty.
- [ ] Re-inject `active_skills[]` content from previous phase if resuming.
- [ ] Set `layer_statuses.engineering` to `in-progress`.

## 2. Architectural Blueprint

- [ ] Generate `.astesia/architecture.md` using `templates/architecture-template.md`.
- [ ] Decide on tech stack (consult `docs/astesia-overview.md` for defaults):
  - [ ] Runtime & HTTP framework
  - [ ] Database & ORM
  - [ ] Frontend framework (if applicable)
  - [ ] Validation library
- [ ] Choose architecture pattern (Modular Monolith by default — justify if different).
- [ ] Document any Architecture Decision Records (ADRs).
- [ ] Define the folder structure following `skills/layered-architecture/SKILL.md`.
- [ ] Update `astesia-state.json` `metadata.tech_stack` with chosen stack.

## 3. Implementation (Multi-Agent Orchestration — Task Waves)

The Engineering Agent MUST act as a **Planner** and delegate execution to subagents. Do NOT implement features sequentially yourself.

- [ ] **Decompose into Task Waves:** Use `skills/task-waves/SKILL.md` to break the BRD features into Waves (e.g., Wave 1: DB Schema, Wave 2: Services, Wave 3: API/UI).
- [ ] **Invoke Subagents:** For each task in a Wave, use the `invoke_subagent` tool to spawn Executor subagents in parallel.
  - Assign each subagent a clear, bounded task.
  - Wait for all subagents in the current Wave to complete.
- [ ] **Internal QA Audit (The Third Brain):** Before advancing to the next Wave, use `invoke_subagent` to spawn a **QA Auditor** subagent.
  - The QA Auditor must cross-check the Executors' output against the Engineering Rules (Directive #24) and the BRD.
  - If the Auditor flags errors, spawn Executors to fix them. DO NOT move to the next Wave until the QA Auditor approves the current Wave.
- [ ] **Deterministic Gate (Directive #29):** Before each Auditor run, execute `bun .astesia/enforcement/astesia-gate.ts`. Non-zero exit = wave rejected automatically; pass the output to the Executor. Never edit `.astesia/anti-patterns.json` or the gate to pass.
- [ ] **Independent Verification:** The Auditor is a fresh-context Verifier (`skills/independent-verification/SKILL.md`). It must write `.astesia/verification/wave-N.md` with real commands/output and a behavioral run. No evidence file = wave not done.
- [ ] **Gardening Wave:** If the gate reports legacy `error` violations or `astesia-debt:` markers, schedule a separate behavior-preserving wave (`skills/codebase-gardening/SKILL.md`) — never mix it into feature waves.
- [ ] **Enforce Minimalist Protocol on Subagents:** Instruct every Executor subagent to run the "Minimalist Ladder" (Can this be 1 line? Can native/stdlib do this?) before writing boilerplate.
- [ ] **Enforce TDD on Subagents:** Subagents must follow the RED-GREEN-REFACTOR cycle (`skills/vitest-unit-testing/SKILL.md`).

Implementation Wave Order Guidelines:
- Wave 1: Database schema (`src/db/schema.ts`) — Drizzle ORM
- Wave 2: Repository layer (data access) & Service layer (business logic)
- Wave 3: Controller/Route layer (HTTP handling — THIN!) & Middleware
- Wave 4: Frontend (if applicable — consult `skills/skills-index.md`)

Per-file requirements:
- [ ] Every file has a **Header Doc** (Directive #19).
- [ ] Every edit is preceded by a **Pre-Edit Trace Note** (Directive #22).
- [ ] Input validation uses Zod schemas (Directive #17, `skills/zod-validation/SKILL.md`).
- [ ] No hardcoded secrets (Directive #17).
- [ ] Database queries follow DBA-Grade standards (Directive #21).

## 4. Quality Self-Check (Before Handoff)

- [ ] All unit tests pass: `npm run test`.
- [ ] Code coverage ≥ 80% on new modules: `npm run test:coverage`.
- [ ] No TypeScript/lint errors.
- [ ] Verify layered architecture: no business logic in controllers, no DB calls outside repositories.
- [ ] Header Docs present on all new/modified files.
- [ ] `.astesia/system-map.md` updated if new files/flows were added (Directive #20).

## 4.5. Pre-Handoff Self-Correction Audit *(Directive #24 — MANDATORY)*

Run BEFORE presenting any artifact to user:
- [ ] Architecture answers ALL BRD features (no missing implementations)?
- [ ] No circular dependency in the proposed module structure?
- [ ] Architecture consistent with design-system.md constraints?
- [ ] All data flows (HTTP → Controller → Service → Repository) clearly defined?
- [ ] No ambiguous "TBD" left in the implementation plan?
- [ ] Next layer (Quality) can begin testing without further clarification?

If any fails → fix internally, document in `history[]`, then hand off.
Maximum **2 internal correction cycles** before escalating to user.

## 5. Handoff

- [ ] All source code committed following Conventional Commits (Directive #18).
- [ ] Update `astesia-state.json`:
  - Set `layer_statuses.engineering` to `done`.
  - Set `current_layer` to `quality`.
  - Add architecture artifacts to `completed_artifacts[]`: `["architecture.md", "system-map.md"]`.
  - Add all created source files to `completed_files[]`.
  - Add history entry with summary of what was built.
  - Record any ADRs in `decisions[]`.
- [ ] Inform the user of the transition to Quality.

## Fail Conditions (HALT Pipeline)

- ❌ BRD or Design System not found / incomplete → **HALT**, return to the missing layer (bypassed when `mode === "surgical"` or `mode === "gardening"`).
- ❌ Unit test coverage < 80% → **DO NOT hand off** to Quality. Fix first.
- ❌ Hardcoded secrets detected → **Fix immediately** (Directive #17).
- ❌ Business logic in controllers → **Refactor** before handoff.

## Expected Output

```
src/                           # Application source code
.astesia/
├── architecture.md            # Technical blueprint with ADRs
├── system-map.md              # Updated navigation map
└── astesia-state.json         # Updated: current_layer = "quality"
```
