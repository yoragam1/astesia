---
name: "Budget Circuit Breaker (Financial Governance)"
description: "Halt autonomous loops if token consumption exceeds safe thresholds to prevent runaway API billing."
---
# Skill: Budget Circuit Breaker (Financial Governance)

## 1. Metadata
- **Name:** `budget-circuit-breaker`
- **Origin:** `Astesia DevOps (Ceobe Upgrade Phase 4)`
- **Description:** A financial safety protocol. AI agents in autonomous loops (especially during Self-Healing or QA Audits) can occasionally enter infinite loops, burning massive amounts of tokens (context window). This skill enforces a hard stop if excessive consumption is detected.

## 2. When to Use
This protocol is ALWAYS active whenever Astesia is operating in an autonomous Task Wave or Self-Healing loop that involves multiple `invoke_subagent` calls or reading large codebase files repeatedly.

## 3. Practical Guidance

### Step 1: Context Awareness
Before invoking a subagent, estimate the size of the context you are passing to it.
- If you are passing an entire 5000-line architecture spec and 10 large source files, the input token count will be huge.
- In Antigravity, we don't have explicit USD billing trackers per request, but we DO know when a conversation is getting bloated.

### Step 2: The Circuit Breaker Threshold
If a task has failed and triggered the `self-healing` protocol **3 times in a row**, you MUST assume the context window has grown too large and the model is stuck in a hallucination loop.

**Immediate Action:**
1. **TRIP THE BREAKER**: Do NOT spawn another subagent. Do NOT try "one more time".
2. **ROLLBACK**: Trigger the `git reset --hard` or Worktree removal protocol immediately to restore the codebase to the last safe state.
3. **NOTIFY USER**: Send an explicit financial safety warning to the user:
   *"BUDGET CIRCUIT BREAKER TRIPPED: I have halted execution. The self-healing loop failed 3 times and is consuming too much context/tokens. I have rolled back the workspace to prevent further errors and token waste."*

### Step 3: Context Minimization (AST Compression)
To prevent tripping the breaker in the first place, always use **AST Context Compression** (Directive #20 in `engineering-rules.md`).
- Never pass full files to subagents if they only need a specific function signature.
- Use `grep_search` to extract exactly the 20 lines needed, rather than reading a 2000-line file.

## 4. Anti-Patterns
- ❌ **The "One More Try" Fallacy:** Thinking "I almost got it, let me spawn one more subagent to fix this syntax error" after already failing 3 times.
- ❌ **Context Dumping:** Reading 10 entire files and dumping their raw text into a subagent's prompt when only 3 functions were actually relevant.
