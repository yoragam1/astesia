# Astesia Skills Index & Dependency Map

This document indexes all 53 native skills available across Astesia's 5 cognitive layers.
In accordance with Google Antigravity Native Standards, every skill resides in its dedicated directory:
`skills/<skill-name>/SKILL.md` with structured YAML frontmatter for automatic progressive disclosure.

> **Auto Skill Classification & Progressive Disclosure:** 
> When Astesia runs as an Antigravity plugin, Antigravity automatically indexes all skills by their frontmatter description. For explicit pipeline state tracking, selected skills are recorded in `.astesia/astesia-state.json → active_skills[]`.

---

## 1. Product Layer Skills
- **`brd-generation`**: Draft scalable business requirements, business rules, and acceptance criteria.
- **`cuj-mapping`**: Map end-to-end Critical User Journeys (CUJ) with edge cases.
- **`reverse-engineering`**: Extract competitor tech stacks, APIs, and design tokens via web reconnaissance.
- **`template-caching`**: Zero-shot execution by reusing cached architectural templates.

## 2. Design Layer Skills
- **`ux-systems`**: Building abstract design systems, token structures, and typography scales.
- **`component-tokens`**: Defining responsive breakpoints, component states, and theme variables.

## 3. Engineering Layer Skills

### Architecture
- **`layered-architecture`**: Strict Controller → Service → Repository enforcement with clean domain boundaries.
- **`adr-management`**: Capture architectural decisions as structured ADRs to maintain historical context.

### Backend Frameworks & ORM
- **`hono-rest-api`**: Hono REST API patterns — route design, thin controllers, middleware chains.
- **`elysia-rest-api`**: Elysia REST API patterns — plugins, TypeBox validation, Eden treaty.
- **`golang-rest-api`**: Golang REST API patterns — standard layout, dependency injection, domain interfaces.
- **`python-fastapi`**: Python FastAPI REST API patterns — Pydantic, Dependency Injection.
- **`laravel-api`**: PHP Laravel REST API patterns — Form Requests, API Resources.
- **`drizzle-orm`**: Drizzle ORM + PostgreSQL — schema definition, migrations, repository pattern.

### Engineering Core & Execution
- **`minimalist-executor`**: Minimalist execution. YAGNI, codebase reuse, stdlib, native APIs over 3rd party bloat.
- **`multi-model-routing`**: Emulate multi-model verification via Red Team / Blue Team subagent personas.
- **`worktree-isolation`**: Execute destructive tasks safely inside temporary Git worktrees.
- **`blast-radius`**: Map dependency graphs before modifying core services to prevent cascading failures.
- **`hybrid-search`**: Reciprocal Rank Fusion (RRF) combining keyword and semantic search.
- **`brownfield-entry`**: Protocol for entering existing codebases, including Threat Assessment, Scope Declaration, and Conceptual Tags generation.
- **`zod-validation`**: Schema-first input validation with Zod.
- **`sveltekit-frontend`**: SvelteKit architecture — server/client loads, runes, superforms.
- **`vue-frontend`**: Vue/Nuxt architecture — Composition API, Pinia, useFetch.
- **`react-frontend`**: React/Next.js architecture — RSC, Client Components.
- **`react-native-mobile`**: React Native/Expo architecture — Expo Router, SafeArea.
- **`frontend-integration`**: Connecting Design Tokens to React/Vue/Svelte logic.
- **`self-healing`**: Autonomic debugging, retry logic, and circuit breakers.
- **`context-navigation`**: Tag-based semantic navigation hierarchy, conceptual query patterns, token budget enforcement.
- **`tdd-workflow`**: Strict RED-GREEN-REFACTOR workflow for implementation.
- **`cost-reducer`**: LLM token cost optimization — temperature discipline, prompt compression, chunked retrieval.
- **`zero-downtime-migration`**: Expand and Contract pattern for live database schema changes without downtime.
- **`codebase-gardening`**: Behavior-preserving refactor waves that delete deprecated patterns and clear new rule violations so agents don't copy slop.
- **`task-waves`**: Decompose implementation plans into independent, parallel task waves.

## 4. Quality Layer Skills
- **`architectural-linter`**: Programmatic architectural validation to prevent N+1 queries and Layered Architecture breaches.
- **`anti-silent-failure`**: Tool validation safeguard to prevent hallucination cascades from failed shell commands.
- **`anti-bloat-review`**: Anti-bloat code review focusing exclusively on deleting over-engineered code.
- **`anti-bloat-audit`**: Repository-wide audit for dead flexibility and YAGNI violations.
- **`debt-scanner`**: Automated detection and resolution of `// astesia-debt:` markers.
- **`vitest-unit-testing`**: Vitest setup, TDD workflow, service layer mocking.
- **`e2e-testing`**: Setting up Playwright tests.
- **`security-review`**: Comprehensive security checklist preventing SQLi, XSS, CSRF, and secret leaks.
- **`visual-qa`**: UI testing protocol and Automated Visual Auditing via Headless Browser.
- **`trust-pyramid`**: Place every constraint at the hardest layer (types > lint/CI > prose > human). Decision protocol for rule placement.
- **`lint-ratchet`**: Convert repeated agent mistakes into permanent machine-enforced rules in `.astesia/anti-patterns.json`.
- **`independent-verification`**: Separate Verifier agent + evidence files; never trust self-reported success.

## 5. DevOps Layer Skills
- **`budget-circuit-breaker`**: Enforce hard stops on token consumption during infinite loops to prevent financial waste.
- **`dynamic-plugins`**: Author and execute custom runtime scripts to extend Astesia's capabilities.
- **`auto-merge-gates`**: Deterministic eligibility, shadow-mode trust progression, post-merge sampling, and auto-disable for agent PRs.
- **`docker-optimization`**: Building multi-stage non-root containers.
- **`docker-compose`**: Multi-service Docker Compose orchestration.
- **`github-actions`**: Setting up CI/CD pipelines.
- **`trigger-dev`**: Background jobs and async task queues using Trigger.dev v3 — scheduled tasks, retry logic, multi-step pipelines.
- **`n8n-automation`**: n8n workflow automation patterns — webhook integration, self-hosted setup, HMAC authentication.
