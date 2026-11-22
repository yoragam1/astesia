---
name: architectural-linter
description: >-
  Programmatically enforce architectural patterns and prevent structural bad practices (like N+1 queries) during execution.
---

# Skill: Automated Architectural Linter

## 1. Metadata
- **Name:** `architectural-linter`
- **Origin:** `Astesia Quality (Ceobe Upgrade Phase 6)`
- **Description:** A severe programmatic linter protocol that goes beyond syntax checking. It enforces macro-level architecture rules (Layered Architecture, Query Optimization) and forces a self-healing rollback if violated.

## 2. When to Use
Invoke this skill (or mentally enforce this protocol) whenever you are acting as the QA Auditor or reviewing newly written back-end/full-stack code.

## 3. Operational Rules

### Rule 1: Enforce Layered Architecture (`ASTESIA-001`)
Controllers/Routers are for HTTP parsing. Services are for business logic. Repositories are for DB queries.
- **Check:** Search the codebase or inspect Controller files to ensure separation.
- **Violation:** If a Controller file imports an ORM (Prisma, Drizzle, TypeORM) directly or calls `.find()` directly, **REJECT IT**.
- **Fix:** Force the Executor to move the DB access to a Service/Repository layer.

### Rule 2: Prevent N+1 Database Queries (`ASTESIA-007`)
Database calls inside a loop will destroy application performance at scale.
- **Check:** Scan for database queries nested inside `for`, `while`, or `.map()` loops.
- **Violation:** If a DB query is executed inside a loop, **REJECT IT**.
- **Fix:** Force the Executor to use `IN` clauses (batch loading), joins, or eager loading.

### Rule 3: Ban "SELECT *" in Production (`ASTESIA-002`)
Fetching all columns wastes memory and network bandwidth.
- **Check:** Scan for `SELECT *` in raw SQL strings, or `.findMany()` calls without a `select: {}` projection in ORMs.
- **Violation:** If unbounded fetching is detected, **WARN / REJECT IT**.
- **Fix:** Force the Executor to explicitly select only the required columns.

### Rule 4: Ban Hallucinated Imports (`ASTESIA-000`)
AI models can hallucinate file paths that do not exist.
- **Check:** Verify all local relative imports (`import x from './file'`).
- **Violation:** If the imported file does not exist on disk, **REJECT IT** (NEVER_BASELINE / NEVER_INLINE_SUPPRESS).

## 4. Execution Protocol
If ANY of these rules are violated, you MUST NOT manually fix it yourself by guessing. You must trigger a `Self-Healing` cycle.
1. Throw a formal error block (e.g., `[ARCHITECTURAL_VIOLATION] Controller directly imports database.`).
2. Pass the error back to the Executor subagent to rewrite the code.
