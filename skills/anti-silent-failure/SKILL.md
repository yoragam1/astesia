---
name: anti-silent-failure
description: >-
  Prevents hallucination cascades by validating tool outputs and explicitly marking silent tool failures.
---

# Skill: Anti-Silent Failure Protocol

## 1. Metadata
- **Name:** `anti-silent-failure`
- **Origin:** `Astesia Quality (Ceobe Upgrade Phase 6)`
- **Description:** A tool-integrity safeguard. AI models often hallucinate that a command succeeded if the tool output is empty or lacks an explicit error, leading to cascading failures (e.g., trying to run a built binary when the build silently failed). This protocol forces verification.

## 2. When to Use
Invoke this protocol constantly during the execution phase, specifically immediately after executing shell commands or modifying files.

## 3. The Core Threat Model
- AI runs `npm run build`.
- Terminal returns an empty string or generic output without `Error:`.
- AI assumes build succeeded.
- AI runs `node dist/index.js`.
- Crash occurs because `dist` was never generated.
- *Result:* Hallucination Cascade.

## 4. Operational Rules

### Rule 1: Always Verify Mutating Tools
If you use a tool to write, edit, or move a file, DO NOT assume it succeeded just because the tool didn't throw a JSON exception. Verify the file exists and its contents are correct (reading file contents or running a verification command) before proceeding to the next step.

### Rule 2: Intercept Empty Outputs
If you run a shell command and the output is completely empty, you MUST verify the exit code or check the side-effects of the command. Do not blindly assume success.
- Example: If you run a build command, verify the `dist/` folder was created.

### Rule 3: Explicit Failure Injection
If you detect that a tool or command failed (even if it didn't explicitly shout "ERROR"), you must mentally inject `[TOOL_FAILED: Reason]` into your context.
*Do not gloss over it.*
If a step fails, STOP. Do not proceed to the next step on your task list. Trigger the Self-Healing process (Phase 1) to resolve the `[TOOL_FAILED]` state before moving forward.

### Rule 4: Trust but Verify
The AI Orchestrator must operate with a paranoid mindset regarding its own tools.
- Did the file actually get written?
- Did the server actually start, or did it immediately exit?
- Did the tests actually run, or did the test runner fail to find the test files?
