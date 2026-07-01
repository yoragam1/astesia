---
name: "Task Waves (Parallel Execution)"
description: "Decompose implementation plans into independent, parallel task waves to accelerate execution."
---
# Skill: Task Waves (Parallel Execution)

## 1. Metadata
- **Name:** `task-waves`
- **Origin:** `Astesia Engineering (Ceobe Upgrade)`
- **Description:** Protocols for breaking down an architectural implementation plan into distinct "waves" (Foundation, Core, Integration, UI). Tasks within the same wave must be entirely independent so they can be executed concurrently by multiple subagents without file-locking conflicts.

## 2. When to Use
Invoke this skill when:
- The Engineering Agent is converting an Architecture Document into an Execution Plan.
- You are about to use `invoke_subagent` to assign tasks to Executor subagents.
- The user requests to speed up the implementation of a large feature.

## 3. Practical Guidance

### Step 1: Analyze Dependencies
Before writing code, analyze the dependency graph of the required changes.
- **Foundation:** Schemas, Configurations, Database Migrations, Base Interfaces. (Cannot depend on anything).
- **Core:** Repositories, Internal Services, Utility classes. (Depends on Foundation).
- **Integration:** API Routes, Controllers, Third-party integrations. (Depends on Core).
- **UI/Consumers:** React components, Svelte pages, CLI commands. (Depends on Integration).

### Step 2: Formulate the Waves
Group the tasks strictly by their dependency layer.

**Wave 1 (Foundation):**
- Create `src/db/schema.ts`
- Create `src/types/user.ts`
*(These tasks share no files and can be assigned to Subagent A and Subagent B concurrently).*

**Wave 2 (Core):**
- Create `src/repositories/user.repository.ts`
- Create `src/services/user.service.ts`

**Wave 3 (Integration):**
- Create `src/controllers/user.controller.ts`
- Update `src/routes/index.ts`

### Step 3: Enforce File-Lock Safety
Within a single wave, **no two tasks can modify the same file**. If Subagent A is updating `routes/index.ts`, Subagent B cannot also update `routes/index.ts` in the same wave. 
- If two tasks must modify the same file, they MUST be placed in sequential waves, or assigned to the exact same subagent sequentially.

### Step 4: Subagent Invocation
Use the `invoke_subagent` tool to spawn Executor agents for the current wave:
```json
{
  "Subagents": [
    { "TypeName": "Executor", "Role": "Schema Builder", "Prompt": "Create src/db/schema.ts..." },
    { "TypeName": "Executor", "Role": "Types Builder", "Prompt": "Create src/types/user.ts..." }
  ]
}
```
Wait for all subagents in Wave N to complete and report success before invoking Wave N+1.

### Step 5: QA Auditor Cross-Check
After all waves complete, invoke a QA Auditor subagent to perform a holistic polyglot check (`tsc --noEmit`, etc.) across the entire feature.

## 4. Anti-Patterns
- ❌ **Race Conditions:** Assigning two subagents to modify the same existing file in the same wave.
- ❌ **Premature Execution:** Spawning Wave 2 subagents before Wave 1 subagents have fully successfully completed.
- ❌ **Sequential Waste:** Putting independent tasks (like creating two different unrelated services) into different waves instead of parallelizing them.
