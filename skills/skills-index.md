# Astesia Skills Index & Dependency Map

Indexes native skills across Astesia's cognitive layers (see `docs/GENERATED-INVENTORY.md`).
Each skill resides in `skills/<skill-name>/SKILL.md` with structured YAML frontmatter for progressive disclosure.

---

## 1. Product Layer Skills
- **`brd-generation`**: Draft structured Business Requirement Documents and acceptance criteria.
- **`cuj-mapping`**: Map end-to-end Critical User Journeys with edge cases.
- **`reverse-engineering`**: Extract competitor tech stacks, APIs, and design tokens via web reconnaissance.

## 2. Design Layer Skills
- **`ux-systems`**: Design user flows, visual hierarchy, wireframes, and design token structures.
- **`component-tokens`**: Define responsive breakpoints, token scales, and component state variables.

## 3. Engineering Layer Skills

### Architecture & Core
- **`layered-architecture`**: Enforce Controller → Service → Repository layering with clean domain boundaries.
- **`adr-management`**: Record architectural decisions with context, alternatives, and rationale in ADRs.
- **`minimalist-executor`**: Minimalist execution adhering to YAGNI and native platform capabilities.
- **`adversarial-review`**: Adversarial verification via Red Team and Blue Team subagent personas.
- **`worktree-isolation`**: Execute destructive tasks safely inside temporary Git worktrees.
- **`blast-radius`**: Map dependency graphs before modifying core services to prevent cascading failures.
- **`brownfield-entry`**: Map legacy codebases and generate system-map.md via trace navigation.
- **`context-navigation`**: Navigate large repositories using conceptual tags and reciprocal rank fusion.
- **`self-healing`**: Autonomic error analysis, retry loops, and circuit breakers.
- **`task-waves`**: Decompose implementation plans into independent, parallel task waves.
- **`tdd-workflow`**: Strict RED-GREEN-REFACTOR workflow for implementation.
- **`codebase-gardening`**: Refactor waves clearing rule violations, debt markers, and deprecated patterns.

### Backend Frameworks & ORM
- **`hono-rest-api`**: High-performance Edge/Node REST APIs with Hono, Zod, and middleware.
- **`elysia-rest-api`**: Bun REST APIs using Elysia with TypeBox validation and Eden treaty.
- **`golang-rest-api`**: Scalable Go REST API microservices with clean architecture and domain interfaces.
- **`python-fastapi`**: Python FastAPI REST API patterns with Pydantic validation and DI.
- **`laravel-api`**: PHP Laravel REST API patterns using Form Requests and API Resources.
- **`drizzle-orm`**: PostgreSQL schema definitions, migrations, and repository pattern with Drizzle.
- **`zero-downtime-migration`**: Safe schema migrations using expand-and-contract patterns.

### Frontend & Mobile
- **`zod-validation`**: Schema-first input validation and TypeScript type inference.
- **`sveltekit-frontend`**: SvelteKit architecture, server/client loads, runes, and superforms.
- **`vue-frontend`**: Vue 3 and Nuxt architecture with Composition API and Pinia stores.
- **`react-frontend`**: React and Next.js architecture using Server Components and hooks.
- **`react-native-mobile`**: Mobile app architecture for React Native and Expo with safe area views.
- **`frontend-integration`**: Connect frontend state to backend REST APIs using TanStack Query.

## 4. Quality Layer Skills
- **`architectural-linter`**: Programmatic validation preventing N+1 queries and controller-DB breaches.
- **`anti-silent-failure`**: Tool validation safeguard to prevent hallucination cascades.
- **`anti-bloat-review`**: Code review and codebase audit focused on deleting over-engineered code.
- **`debt-scanner`**: Automated detection and resolution of `astesia-debt:` markers.
- **`vitest-unit-testing`**: Unit and integration testing with Vitest, mocking, and coverage.
- **`e2e-testing`**: End-to-end browser testing with Playwright.
- **`security-review`**: Comprehensive security checklist preventing SQLi, XSS, and secret leaks.
- **`visual-qa`**: UI testing and visual regression auditing via headless browser inspection.
- **`trust-pyramid`**: Enforce constraints at hardest layer: types > lint/CI > prose > review.
- **`lint-ratchet`**: Convert repeated agent mistakes into permanent rules in anti-patterns.json.
- **`independent-verification`**: Separate verifier agent executing real behavior and recording evidence.
- **`property-based-testing`**: Invariant property tests for parsers, validators, math, and state machines.

## 5. DevOps Layer Skills
- **`budget-circuit-breaker`**: Enforce hard stops on token consumption during infinite loops.
- **`dynamic-plugins`**: Author and execute quarantined runtime scripts with manifest registration.
- **`auto-merge-gates`**: Deterministic PR eligibility, shadow-mode progression, and auto-merge gates.
- **`docker-optimization`**: Build lightweight multi-stage Docker containers running as non-root.
- **`docker-compose`**: Multi-service container orchestration for development and production.
- **`github-actions`**: Standardized CI/CD pipeline with base-checkout trust model and workflow guards.
- **`trigger-dev`**: Background jobs and async task queues using Trigger.dev v3.
- **`n8n-automation`**: Webhook and workflow automation patterns using self-hosted n8n.
