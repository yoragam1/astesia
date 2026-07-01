# Astesia Skills Index & Dependency Map

This document indexes the skills available to Astesia's 5 layers. Agents MUST use this index before attempting to execute a layer's objective.

> **Auto Skill Classification (Stage 1.5):** At the start of every session, scan this index and select the skills relevant to the user request. Inject the skill content into context BEFORE reading layer rules. Persist selection to `astesia-state.json → active_skills[]`.

> **Format Standardization:** All new skills added to this directory MUST strictly follow the structure defined in `SKILL-TEMPLATE.md`, which includes Metadata (Name, Origin), When to Use, Practical Guidance, and Tested Examples.

---

## 1. Product Layer Skills (`skills/product/`)
- **`brd-generation`**: How to draft scalable business requirements and CTJs.
- **`cuj-mapping`**: How to map Critical User Journeys.
- **`reverse-engineering`** *(NEW)*: Extract competitor tech stacks, APIs, and design tokens via web reconnaissance.
- **`template-caching`** *(NEW)*: Zero-shot execution by reusing cached architectural templates.

## 2. Design Layer Skills (`skills/design/`)
- **`ux-systems`**: Building abstract design systems.
- **`component-tokens`**: Defining responsive breakpoints and component states.

## 3. Engineering Layer Skills

### Architecture (`skills/architecture/`)
- **`layered-architecture`**: Strict Controller → Service → Repository enforcement with folder structure patterns for backend and frontend.
- **`adr-management`** *(NEW)*: Capture architectural decisions as structured ADRs to maintain historical context.

### Backend (`skills/backend/`)
- **`hono-rest-api`**: Hono REST API patterns — route design, thin controllers, middleware chains.
- **`elysia-rest-api`** *(NEW)*: Elysia REST API patterns — plugins, TypeBox validation, Eden treaty.
- **`golang-rest-api`** *(NEW)*: Golang REST API patterns — standard layout, dependency injection, domain interfaces.
- **`python-fastapi`** *(NEW)*: Python FastAPI REST API patterns — Pydantic, Dependency Injection.
- **`laravel-api`** *(NEW)*: PHP Laravel REST API patterns — Form Requests, API Resources.
- **`drizzle-orm`**: Drizzle ORM + PostgreSQL — schema definition, migrations, repository pattern.

### Engineering Core (`skills/engineering/`)
- **`ponytail-executor`** *(NEW)*: Minimalist execution. YAGNI, codebase reuse, stdlib, native APIs over 3rd party bloat.
- **`multi-model-routing`** *(NEW)*: Emulate multi-model verification via Red Team / Blue Team subagent personas.
- **`worktree-isolation`** *(NEW)*: Execute destructive tasks safely inside temporary Git worktrees.
- **`blast-radius`** *(NEW)*: Map dependency graphs before modifying core services to prevent cascading failures.
- **`hybrid-search`** *(NEW)*: Reciprocal Rank Fusion (RRF) combining keyword and semantic search.
- **`brownfield-entry`**: Protocol for entering existing codebases, including Threat Assessment, Scope Declaration, and Conceptual Tags generation.
- **`zod-validation`**: Schema-first input validation with Zod.
- **`sveltekit-frontend`** *(NEW)*: SvelteKit architecture — server/client loads, runes, superforms.
- **`vue-frontend`** *(NEW)*: Vue/Nuxt architecture — Composition API, Pinia, useFetch.
- **`react-frontend`** *(NEW)*: React/Next.js architecture — RSC, Client Components.
- **`react-native-mobile`** *(NEW)*: React Native/Expo architecture — Expo Router, SafeArea.
- **`frontend-integration`**: Connecting Design Tokens to React/Vue/Svelte logic.
- **`self-healing`** *(NEW)*: Autonomic debugging, retry logic, and circuit breakers.
- **`context-navigation`** *(UPGRADED)*: Tag-based semantic navigation hierarchy, conceptual query patterns, token budget enforcement.
- **`tdd-workflow`** *(NEW)*: Strict RED-GREEN-REFACTOR workflow for implementation.
- **`cost-reducer`** *(NEW)*: LLM token cost optimization — temperature discipline, prompt compression, chunked retrieval.
- **`zero-downtime-migration`** *(NEW)*: Expand and Contract pattern for live database schema changes without downtime.

## 4. Quality Layer Skills (`skills/quality/`)
- **`architectural-linter`** *(NEW)*: Programmatic architectural validation to prevent N+1 queries and Layered Architecture breaches.
- **`anti-silent-failure`** *(NEW)*: Tool validation safeguard to prevent hallucination cascades from failed shell commands.
- **`ponytail-review`** *(NEW)*: Anti-bloat code review focusing exclusively on deleting over-engineered code.
- **`ponytail-audit`** *(NEW)*: Repository-wide audit for dead flexibility and YAGNI violations.
- **`debt-scanner`** *(NEW)*: Automated detection and resolution of `// astesia-debt:` markers.
- **`vitest-unit-testing`**: Vitest setup, TDD workflow, service layer mocking.
- **`e2e-testing`**: Setting up Playwright tests.
- **`security-review`** *(NEW)*: Comprehensive security checklist preventing SQLi, XSS, CSRF, and secret leaks.
- **`visual-qa`** *(UPGRADED)*: UI testing protocol and Automated Visual Auditing via Headless Browser.

## 5. DevOps Layer Skills (`skills/devops/`)
- **`budget-circuit-breaker`** *(NEW)*: Enforce hard stops on token consumption during infinite loops to prevent financial waste.
- **`dynamic-plugins`** *(NEW)*: Author and execute custom runtime scripts to extend Astesia's capabilities.
- **`docker-optimization`**: Building multi-stage non-root containers.
- **`docker-compose`**: Multi-service Docker Compose orchestration.
- **`github-actions`**: Setting up CI/CD pipelines.
- **`trigger-dev`** *(NEW)*: Background jobs and async task queues using Trigger.dev v3 — scheduled tasks, retry logic, multi-step pipelines.
- **`n8n-automation`** *(NEW)*: n8n workflow automation patterns — webhook integration, self-hosted setup, HMAC authentication.
