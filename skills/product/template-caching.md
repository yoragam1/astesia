---
name: "Template Caching (Zero-Shot Execution)"
description: "Cache and reuse proven architectural plans to skip redundant planning phases."
---
# Skill: Template Caching (Zero-Shot Execution)

## 1. Metadata
- **Name:** `template-caching`
- **Origin:** `Astesia Product (Ceobe Upgrade Phase 3)`
- **Description:** Protocol for detecting if a requested feature perfectly matches a previously implemented feature in Astesia's memory. If a match is found, Astesia skips the BRD, Design, and Architecture planning phases and jumps straight to Execution using the cached blueprints.

## 2. When to Use
Invoke this skill when:
- You are at the absolute beginning of a session (Product Layer).
- The user requests a standard, well-known feature (e.g., "Add JWT Auth", "Build a Stripe Checkout flow", "Create a CRUD interface for Users").

## 3. Practical Guidance

### Step 1: Scan the Cache Directory
Before writing a new BRD, check if a template already exists for the user's request.
- Use `list_dir` on `.astesia/templates/`.
- If a relevant template folder exists (e.g., `.astesia/templates/jwt-auth/`), use `view_file` to read its contents.

### Step 2: Validate the Match
Confirm with the user if they want to use the cached template:
*"I see we have a cached Architecture Plan for JWT Auth. Would you like me to reuse this proven template and skip the planning phase to save time?"*

### Step 3: Zero-Shot Execution
If the user agrees:
1. Copy the cached `brd.md`, `design.md`, and `architecture.md` into the current working session context.
2. Immediately invoke the Engineering Subagents to execute the plan.

### Step 4: Cache New Successes
If you complete a brand new, highly complex feature that passes QA and is merged into `main`, ask the user if they want to cache it:
*"This Stripe Integration was quite complex. Should I save this architecture to `.astesia/templates/stripe-integration` so we can reuse it zero-shot in the future?"*

## 4. Anti-Patterns
- ❌ **Forced Caching:** Blindly applying a cached template without asking the user. The user might want a slightly different flavor of Auth this time.
- ❌ **Caching Failures:** Never cache an implementation plan that resulted in a rollback or failed QA audit.
