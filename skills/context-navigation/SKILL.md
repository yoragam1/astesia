---
name: context-navigation
description: >-
  Astesia operates as an IDE Agent with finite token limits per conversation. This skill defines the protocols for navigating large enterprise codebases efficiently without exhausting the context window or resorting to blind codebase scans.
---

# Skill: Token Efficiency & Context Navigation

## 1. Metadata
- **Name:** `context-navigation`
- **Origin:** `Astesia Core`
- **Description:** Astesia operates as an IDE Agent with finite token limits per conversation. This skill defines the protocols for navigating large enterprise codebases efficiently without exhausting the context window or resorting to blind codebase scans.

## 2. Trigger
Whenever Astesia is asked to modify, debug, or understand a feature within an existing large repository.

## 3. Rules & Execution

### Rule 1: Navigation Priority Hierarchy
Before writing a single line of code, always follow this search order:

```
1. system-map.md conceptual_tags → find the right file by concept
2. grep_search (precise function/class name) → confirm the exact location
3. view_file (targeted function block only) → read the minimum needed
4. NEVER: list_dir recursive scan as primary navigation method
```

### Rule 2: Tag-Based Semantic Navigation
`system-map.md` MUST include `conceptual_tags` per module. Use these tags to navigate:

| Task | Search Query (Conceptual) |
|------|--------------------------|
| Add email feature | Look for tags: `[email, notification, queue]` |
| Fix auth bug | Look for tags: `[auth, jwt, session, middleware]` |
| Optimize DB query | Look for tags: `[database, query, orm, repository]` |
| Add payment | Look for tags: `[payment, billing, stripe, webhook]` |

**Good queries** (specific, conceptual): `"email sending logic"`, `"JWT validation middleware"`, `"database connection pool"`, `"password hashing"`  
**Bad queries** (too vague, low recall): `"email"`, `"auth"`, `"db"`

### Rule 3: Token Budget Enforcement & AST Compression
- **AST Context Compression:** For TypeScript/JavaScript files >500 lines, extract and read only the AST signatures (types, interfaces, class definitions, function signatures) to compress token usage by ~80% before loading the full file.
- Read files >500 lines **per function block only**, never full-read.
- Pull a maximum of **5 files** per investigation cycle before formulating an action.
- If a file is referenced in `system-map.md` and matches the required conceptual tag → read it. If not → skip.
- Do not open files outside the trace path (Entrypoint → Handler → Service → Repository → DB).

### Rule 4: System Map First
Before diving into specific files, always locate and read `.astesia/system-map.md` (if it exists) to grasp the architecture without reading code.

### Rule 5: Context Injection Constraint
Only pull the minimum viable context into your workspace. Do not open 10 files if only 2 are relevant to the actual code modification.

## 4. Anti-Patterns
- ❌ Never run global string replacements without first verifying the impact via semantic search.
- ❌ Never load full files just to find a single variable definition — use `grep_search` with specific lines.
- ❌ Never start writing code if you do not understand how it fits into the `system-map.md` architecture.
- ❌ Never use keyword-only search when you need semantic understanding — use conceptual tag navigation first.
- ❌ Never embed an entire module's content into context "just in case" — specificity is a performance metric.

## 5. Example Navigation Session

**Request:** "Add rate limiting to the auth endpoints"

```
Step 1: Read system-map.md → find files tagged [auth, middleware, routing]
  → Found: src/middleware/auth.ts [auth, jwt], src/modules/auth/auth.routes.ts [routing, auth]

Step 2: grep_search → search for "rate" or "limiter" to check if it already exists
  → Not found → need to implement

Step 3: view_file(auth.routes.ts) → read ONLY the route definitions, not the whole file

Step 4: Write implementation plan → add rate limiter middleware before auth routes
  → Only touch 2 files: auth.routes.ts (edit) + src/middleware/rateLimiter.ts (create)
```
