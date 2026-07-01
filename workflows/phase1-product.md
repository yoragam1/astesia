# Phase 1: PRODUCT
**Objective:** Translate user ideas into structured Business Requirements (BRD).

---

## 1. Input Analysis & State Init

- [ ] Read the raw user prompt and identify the core problem to solve.
- [ ] Determine project type: **Greenfield** or **Brownfield**.
- [ ] **CRITICAL:** Ensure `.astesia/astesia-state.json` exists in the target directory.
  - If missing, create using `templates/astesia-state-template.json`.
  - Set `entry_type` to `greenfield` or `brownfield`.
  - Set `current_layer` to `product`.
  - Set `layer_statuses.product` to `in-progress`.
- [ ] **Auto Skill Classification (Stage 1.5):** Read `skills/skills-index.md` and select relevant skills.
  - **CRITICAL:** You MUST unconditionally include `budget-circuit-breaker` and `anti-silent-failure` in your selection. Never omit them.
  - Record the final selected skills in `active_skills[]`.

## 2. Requirement Gathering

- [ ] Fill out the BRD using `templates/brd-template.md`.
- [ ] Ensure ALL sections are complete (see Product Rule #5 — Minimum BRD Acceptance Threshold):
  - [ ] Executive Summary with Problem Statement
  - [ ] Target Users & Stakeholders with Permission Levels
  - [ ] Core Features with Business Rules AND Acceptance Criteria
  - [ ] Edge Cases & Negative Flows for EACH feature
  - [ ] At least 1 Critical User Journey (CUJ)
  - [ ] Non-Functional Requirements (Performance & Security)
  - [ ] Explicit Out-of-Scope section
- [ ] **Do NOT proceed** if any of the above are missing.

## 3. Quality Self-Check

Before handoff, verify:
- [ ] Every feature has measurable Acceptance Criteria (testable by Quality Layer).
- [ ] Negative flows are documented (not just happy paths).
- [ ] No implementation details leaked into the BRD (no code, SQL, or CSS).
- [ ] Out-of-Scope section prevents Engineering from hallucinating features.

## 4. Pre-Handoff Internal Audit *(NEW)*

Before presenting the BRD, run this self-check:
- [ ] Every feature has measurable Acceptance Criteria (not just descriptions)?
- [ ] All negative flows documented (not just happy paths)?
- [ ] No implementation details in BRD (no code, SQL, CSS)?
- [ ] Out-of-Scope section present and explicit?
- [ ] BRD would allow Design and Engineering to proceed without clarification?

If any item fails → fix internally, then hand off.

## 5. Handoff

- [ ] Save BRD as `.astesia/brd.md` in the target project.
- [ ] Update `astesia-state.json`:
  - Set `layer_statuses.product` to `done`.
  - Set `current_layer` to `design` (if UI needed) or `engineering` (if backend only).
  - Add `"brd.md"` to `completed_artifacts[]`.
  - Append to `history[]` with timestamp and action summary.
- [ ] Inform the user of the transition.

## Fail Conditions (HALT Pipeline)

- ❌ User provides a vague request without defining the core problem → **HALT**, ask clarifying questions.
- ❌ BRD is missing Acceptance Criteria → **DO NOT hand off**, complete them first.
- ❌ User asks to skip Product Layer → **REFUSE**, explain why BRD is mandatory.

## Expected Output

```
.astesia/
├── brd.md                 # Complete Business Requirement Document
└── astesia-state.json     # Updated: current_layer = "design"/"engineering",
                           #           completed_artifacts = ["brd.md"]
```
