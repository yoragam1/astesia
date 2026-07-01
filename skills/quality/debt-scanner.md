---
name: "Tech Debt Management (Debt Scanner)"
description: "Automatically identify, track, and resolve marked technical debt across the codebase."
---
# Skill: Tech Debt Management (Debt Scanner)

## 1. Metadata
- **Name:** `debt-scanner`
- **Origin:** `Astesia Quality (Ceobe Upgrade Phase 3)`
- **Description:** Protocol for embedding and resolving machine-readable Technical Debt comments. Ensures that quick-and-dirty fixes are systematically cleaned up rather than forgotten.

## 2. When to Use
Invoke this skill when:
- **Engineering Layer:** You are forced to write a hacky workaround to meet a deadline or pass a failing test.
- **Quality Layer:** You are performing a holistic code audit and need to identify what areas of the codebase require refactoring.

## 3. Practical Guidance

### Step 1: Marking Debt (Engineering)
If you write code that you know is suboptimal, you MUST leave a standardized comment block right above the code.

**Format:** `// astesia-debt: [Reason], upgrade: [Action Required]`

**Example:**
```typescript
// astesia-debt: Using any here to bypass complex generic inference error, upgrade: Define proper recursive TypeScript generic
const data: any = JSON.parse(raw);
```

### Step 2: Scanning for Debt (Quality)
During a system-wide audit, the Quality Agent should use the `grep_codebase` tool to scan for these exact markers.
```javascript
grep_search("astesia-debt:")
```

### Step 3: Resolving Debt
When the Quality Agent detects debt, it should formulate a targeted Task Wave to resolve it.
1. Read the file containing the debt.
2. Formulate a solution based on the `upgrade: [Action Required]` instruction.
3. Spawn an Executor Subagent to implement the fix.
4. If the fix passes tests, **delete the `astesia-debt` comment**.

## 4. Anti-Patterns
- ❌ **Silent Hacks:** Writing bad code without leaving an `astesia-debt:` marker.
- ❌ **Vague Debt:** Leaving `// astesia-debt: fix this` without an `upgrade:` clause explaining *how* to fix it.
- ❌ **Ignoring the Scanner:** The Quality Agent failing to run `grep_search("astesia-debt:")` during a major release cycle.
