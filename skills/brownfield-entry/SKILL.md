---
name: brownfield-entry
description: >-
  Protocol for entering and mapping an existing codebase that was NOT initialized by Astesia. Generates a `.astesia/system-map.md` navigation map using trace-by-function methodology.
---

# Skill: Brownfield Entry Protocol

## 1. Metadata
- **Name:** `brownfield-entry`
- **Origin:** `Astesia Core`
- **Description:** Protocol for entering and mapping an existing codebase that was NOT initialized by Astesia. Generates a `.astesia/system-map.md` navigation map using trace-by-function methodology.

## 2. When to Use
Invoke this skill when:
- The user asks Astesia to work on a **pre-existing project** (not created via `/astesia-init`).
- The `.astesia/` directory does not exist, or exists but has no `system-map.md`.
- The agent needs to understand an unfamiliar codebase before making changes.

**Do NOT use** for greenfield projects initialized by Astesia — those already have full pipeline artifacts.

## 3. Practical Guidance

### Step 1: Identify Entrypoints
Find the main entry file(s) of the project. Common patterns:
- **Node.js:** `src/index.ts`, `src/app.ts`, `src/server.ts`, `package.json` → `main`/`scripts.start`
- **Python:** `main.py`, `app.py`, `manage.py`
- **Go:** `cmd/main.go`, `main.go`
- **Next.js:** `src/app/layout.tsx`, `src/app/page.tsx`, `next.config.js`

### Step 2: Threat Assessment — Identify Minefields FIRST
Before touching any code, identify the "minefields" that must NOT be modified without explicit user confirmation:

| File Pattern | Risk Level | Action |
|---|---|---|
| `.env`, `.env.*`, `*.pem`, `*.key` | 🔴 Critical | Never modify. Read only for context. |
| `docker-compose.prod.yml`, `nginx.conf` | 🔴 Critical | Flag to user before any edit. |
| `prisma/migrations/`, `drizzle/` (existing files) | 🔴 Critical | Never modify existing migrations. Only add new ones. |
| `package-lock.json`, `yarn.lock`, `go.sum` | 🟡 Caution | Never manually edit; only via CLI commands. |
| `README.md`, `CHANGELOG.md` | 🟢 Safe | Update after implementation is done. |

**Before proceeding:** Document identified minefields in a note to the user.

### Step 3: Trace-by-Flow (NOT Full Scan)
Starting from the entrypoint, trace the execution flow layer by layer:

```
Trigger/Entry Point (UI/CLI/API/Event)
  → Handler/Controller
    → Business Logic/Service
      → Data Access/Repository
        → Database/Storage/External API
```

**Rules:**
- Read only the **relevant function blocks**, not entire files.
- For files >500 lines, read **per function/class**, not full-read.
- Use targeted search (grep/ripgrep) ONLY for finding specific function names.
- **NEVER** scan `node_modules`, `.venv`, `dist`, `build`, `.git`, `__pycache__`, `coverage`, `.next`, `.cache`.

### Step 4: Map Universal Layers
If the project doesn't use standard Controller/Service/Repository naming:
- Map to the nearest equivalent: `Handler`, `Usecase`, `Domain`, `Adapter`, `DAO`, `Gateway`, etc.
- Do NOT force Astesia's naming conventions onto the existing codebase.

### Step 5: Generate `.astesia/system-map.md`
Use the template at `templates/system-map-template.md`. The output MUST contain:

1. **Project Summary** — Purpose, tech stack, architecture pattern
2. **Core Logic Flow** — Function-level flowchart of critical paths
3. **Clean Tree** — Source code tree only (no deps/build/cache)
4. **Module Map** — Per-file: path, public functions/classes, 1-sentence role, **conceptual_tags** (MANDATORY)
5. **Data & Config** — DB schema summary, .env location, migration paths
6. **External Integrations** — APIs, queues, third-party services
7. **Risks / Blind Spots** — Dynamic imports, generated code, missing configs

> **Conceptual Tags are MANDATORY** for each module entry. They enable tag-based semantic navigation (see `skills/context-navigation/SKILL.md`). Example: `[auth, jwt, middleware]`, `[payment, webhook, stripe]`.

### Step 6: Scope Declaration — Before Writing Any Code *(NEW)*
Before modifying a single file, explicitly declare to the user:

```markdown
## 📋 Scope Declaration

### Files I will MODIFY:
- `src/routes/auth.ts` — Add rate limiting middleware
- `src/middleware/index.ts` — Register new limiter

### Files I will CREATE:
- `src/middleware/rateLimiter.ts` — New rate limiting module

### Files I will NOT touch:
- `src/db/migrations/` — Existing migrations are read-only
- `.env` — Will only read, never modify
- `prisma/schema.prisma` — No schema changes required for this task

Do you approve this scope? (y/n)
```

This prevents the "ghost file" problem where the AI recreates already-correct files, and mirrors the `completed_files` array constraint in the Astesia State.

### Step 7: Initialize Astesia State
Create `.astesia/astesia-state.json` using `templates/astesia-state-template.json`:
- Set `project_name` from `package.json` name or folder name.
- Set `current_layer` based on the user's request type.
- Set `entry_type` to `"brownfield"`.
- **CRITICAL:** Set `active_skills` to `["brownfield-entry", "budget-circuit-breaker", "anti-silent-failure"]` (append any other skills you deem necessary, but NEVER omit these three).
- Add initial history entry: `"Brownfield entry — system-map generated"`.
- Add `"system-map.md"` to `completed_artifacts[]`.

## 4. Tested Examples

### Example: Tracing a Hono REST API

```
Entrypoint: src/index.ts
  → app.route('/users', userRoutes)
    → Route: src/routes/user.routes.ts
      → GET / → userController.getAll()
        → Controller: src/controllers/user.controller.ts
          → userService.findAll()
            → Service: src/services/user.service.ts
              → userRepository.findMany()
                → Repository: src/repositories/user.repository.ts
                  → db.select().from(users)
                    → DB: PostgreSQL (schema: src/db/schema.ts)
```

### Example: Module Map Entry (with Conceptual Tags)

```markdown
### `src/services/user.service.ts`
- **Functions:** `findAll()`, `findById(id)`, `create(data)`, `update(id, data)`, `delete(id)`
- **Role:** Business logic for user CRUD operations, enforces validation rules and authorization checks.
- **Conceptual Tags:** `[user-management, crud, business-logic, validation, authorization]`
```

### Example: Scope Declaration
```markdown
## 📋 Scope Declaration for "Add email verification to signup"

### Files I will MODIFY:
- `src/modules/auth/auth.service.ts` — Add email sending call after user creation

### Files I will CREATE:
- `src/modules/email/email.service.ts` — New email service module
- `src/modules/email/email.types.ts` — Types for email payloads

### Files I will NOT touch:
- `src/db/migrations/` — Read-only
- `src/modules/user/user.repository.ts` — No data model changes
```

## 5. Anti-Patterns
- ❌ Never start coding before completing the Scope Declaration.
- ❌ Never modify `.env` or migration files without explicit user confirmation.
- ❌ Never generate `system-map.md` without `conceptual_tags` — this defeats semantic navigation.
- ❌ Never recreate files that are listed in `completed_files[]` from state — only modify if fixing a bug.
- ❌ Never assume the existing codebase follows Astesia conventions — map what's there, not what you expect.
