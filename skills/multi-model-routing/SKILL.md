---
name: multi-model-routing
description: >-
  Simulate multi-model governance by enforcing strict antagonistic personas between Planner/Executor and QA subagents.
---

# Skill: Multi-Model Routing (Red Team / Blue Team)

## 1. Metadata
- **Name:** `multi-model-routing`
- **Origin:** `Astesia Engineering (Ceobe Upgrade Phase 4)`
- **Description:** Protocol to prevent "Confirmation Bias" (hallucination cascades) in single-engine AI environments. By giving Executor subagents a "Blue Team" persona and QA Auditor subagents a "Red Team" persona, Astesia forces the underlying AI to evaluate code through fundamentally opposed logical pathways.

## 2. When to Use
Invoke this skill when:
- You are using the `invoke_subagent` tool to orchestrate a complex feature.
- You are assigning a task to the QA Auditor to verify the Executor's work.

## 3. Practical Guidance

### Step 1: The Blue Team (Executor Persona)
When spawning subagents for execution (writing code, generating BRDs, etc.), give them a constructive, optimistic prompt.

**Example Executor Prompt:**
> "You are an elite Software Engineer. Your goal is to write clean, efficient, and functional code to implement [Feature]. Focus on speed and fulfilling the business requirements."

### Step 2: The Red Team (QA Auditor Persona)
When spawning the QA subagent to review the Executor's work, you MUST apply the Red Team psychological constraints. Do not ask it to just "review the code".

**Example QA Auditor Prompt (MANDATORY TEMPLATE):**
> "You are a Paranoid Security Auditor (Red Team). You must assume the code provided to you is fundamentally flawed, insecure, and buggy. 
> 1. Search aggressively for edge cases, unhandled exceptions, SQL injections, or state mutations.
> 2. You are FORBIDDEN from approving the code unless you have cross-checked every line against the Architecture Spec.
> 3. Do not be polite. Be brutal and exact in your feedback."

### Step 3: Resolving Conflicts
If the Red Team QA rejects the Blue Team's code, pass the exact unedited brutal feedback back to a *new* Blue Team Executor.
- Let them iterate up to a maximum of 3 times (see `self-healing.md`).
- If they cannot agree after 3 tries, trigger the Auto-Rollback.

## 4. Anti-Patterns
- ❌ **Shared Context Bias:** Giving the QA Auditor the exact same system prompt or context as the Executor. They must have different perspectives.
- ❌ **Rubber Stamping:** A QA Auditor that says "Looks good to me!" without proving it ran `tsc` or checked edge cases. Red Team *always* suspects failure first.
