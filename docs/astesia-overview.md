# Astesia System Overview

**Version:** 3.0.0  
**Last Updated:** 2026-11-17

Astesia is a multi-layered, end-to-end software development framework designed to guide AI agents in automating the entire Product Lifecycle.

While Astesia is purely focused on Code and Engineering Architecture, **Astesia encompasses the entire software agency pipeline.**

---

## Core Principles

1. **Pipeline Execution**: Software is built in stages. A prompt flows through 5 distinct layers.
2. **State Handoff**: Each layer's output is strictly documented and passed as context to the next layer.
3. **Anti "Rush-to-Code"**: The most expensive bugs are those introduced by skipping requirements and design. No code without a BRD. No deployment without passing tests.
4. **Paper Trail Everything**: Every layer generates artifacts saved in `.astesia/`, making decisions traceable and auditable.
5. **Brownfield Awareness**: Astesia can operate on existing codebases, not only greenfield projects.
6. **Verification-First (Trust Pyramid)**: Constraints live in types and CI, not prose. Every agent claim needs independent evidence; every repeated mistake becomes a permanent lint rule. See `docs/agent-operating-guide.md` Step 8.

---

## The 5 Cognitive Layers

### 1. Product / Business Layer
**Sub-Roles:** Product Manager (PM), Business Analyst (BA)
- **Responsibility:** Menentukan *what & why*, translate kebutuhan bisnis menjadi requirement. BA mendetailkan requirement & menjembatani user dengan tech.
- **Artifacts:** `brd.md`, `epics.md`.
- **👉 Risiko Kalau Dilewati:** Dev jadi "tukang coding tanpa arah", Scope sering berubah (*hidden chaos*).

### 2. Design Layer
**Sub-Roles:** UI/UX Designer
- **Responsibility:** Wireframe, prototype, usability, dan estetika antarmuka.
- **Artifacts:** `design-system.md`, `ui-specs.md`.
- **👉 Risiko Kalau Dilewati:** Dev "nebak desain". UX jelek = produk gagal walau secara teknis bagus.

### 3. Engineering Layer
**Sub-Roles:** Software Architect, Frontend Engineer, Backend Engineer (Atau Fullstack)
- **Responsibility:**
  - **Architect:** Design system keseluruhan, tentukan monolith vs microservices, scalability, & tech stack.
  - **Frontend:** UI/UX logic, web/mobile (Next.js, React Native).
  - **Backend:** API, database, business logic (Hono, Node, Go).
- **👉 Trade-off & Risiko:** 
  - Fullstack = cepat, tapi risiko *overload* & kurang *depth*. Spesialis = lebih rapi, tapi butuh lebih banyak orang.
  - Tanpa Architect: System merosot jadi *spaghetti code*, *scaling* mahal di belakang.
- **Artifacts:** `architecture.md`, `src/`.

### 4. Quality Layer
**Sub-Roles:** QA / Software Tester
- **Responsibility:** Manual / automation testing. Memastikan kualitas sebelum release.
- **Artifacts:** `tests/`, `audit-report.md`.
- **👉 Risiko Kalau Dilewati:** Banyak startup skip ini → Hasilnya bug bocor ke user, trust turun.

### 5. DevOps / Infrastructure
**Sub-Roles:** DevOps Engineer
- **Responsibility:** CI/CD, deployment, integrasi Cloud (AWS, GCP, Cloudflare).
- **Artifacts:** `Dockerfile`, `.github/workflows/`, `docker-compose.yml`.
- **👉 Risiko Kalau Dilewati:** Deploy manual = rawan error, scaling jadi chaos.

---

## Architecture Trade-Off Framework

When the Engineering Layer must decide on architectural patterns, use this decision matrix:

### Monolith vs Microservices

| Factor | Choose Monolith | Choose Microservices |
|--------|-----------------|---------------------|
| Team size | 1–5 developers | 5+ developers, multi-team |
| Domain complexity | Single bounded context | Multiple independent domains |
| Deployment cadence | Shared release cycle | Independent deploy per service |
| Data ownership | Shared database acceptable | Strict data isolation required |
| MVP / Prototype | ✅ Always start here | ❌ Never for MVPs |

**Default Astesia stance:** Start with a well-structured **Modular Monolith** (Clean Architecture boundaries inside a single deployable). Extract to microservices only when there is a *proven scaling bottleneck* at a specific domain boundary.

### Server-Side vs Client-Side Rendering

| Factor | SSR / Server Components | SPA / CSR |
|--------|------------------------|-----------|
| SEO requirement | ✅ Critical pages | Not needed |
| Time-to-interactive | Faster initial load | Faster subsequent navigation |
| Data sensitivity | Server-only data stays safe | All data ships to client |
| Complexity | Higher infra cost | Simpler deployment |

**Default Astesia stance:** Use **SvelteKit** as default, leveraging its native SSR and seamless server-to-client hydration. Fall back to pure SPA only for internal tools or dashboards with no SEO needs.

---

## Default Tech Stack Recommendations

These are Astesia's **opinionated defaults**. They can be overridden by explicit decisions in the Engineering Layer's `architecture.md`, but must be justified with ADRs.

### Backend
| Concern | Default | Alternative |
|---------|---------|-------------|
| Runtime | Bun (for Elysia/Hono) / Go compiler | Node.js |
| HTTP Framework | Elysia (Bun) / Hono / Go Standard Mux/Fiber | Express, Fastify |
| ORM | Drizzle ORM (TS) / GORM/sqlc (Go) | Prisma |
| Database | PostgreSQL | SQLite (dev), MySQL |
| Validation | TypeBox (Elysia) / Zod (Hono) / Validator (Go) | Joi |
| Auth | JWT + httpOnly cookies | Session-based |

### Frontend
| Concern | Default | Alternative |
|---------|---------|-------------|
| Framework | SvelteKit / Vue (Nuxt) | React (Next.js) |
| Styling | Tailwind CSS | CSS Modules, Vanilla CSS |
| State | Svelte Stores (runes) / Pinia (Vue) | Zustand (if React) |
| Forms | Superforms (Svelte) / VeeValidate (Vue) | Standard forms |

### Infrastructure
| Concern | Default | Alternative |
|---------|---------|-------------|
| Container | Docker (multi-stage, non-root) | Podman |
| CI/CD | GitHub Actions | GitLab CI |
| Hosting | VPS + Docker Compose | Vercel (frontend), Railway |
| Observability | Pino (logging) + Prometheus | Datadog, OpenTelemetry |

---

## Scaling Strategy

### Phase 1: Single Server (0–1K users)
- Monolith + PostgreSQL on a single VPS
- Nginx reverse proxy
- Docker Compose for orchestration

### Phase 2: Horizontal Split (1K–50K users)
- Separate frontend (CDN/Vercel) from backend (VPS)
- Database connection pooling (PgBouncer)
- Redis for session/cache

### Phase 3: Service Extraction (50K+ users)
- Extract high-traffic bounded contexts into independent services
- Message queue (NATS/RabbitMQ) for async operations
- Database per service with event-driven sync

---

## Brownfield vs Greenfield

### Greenfield (New Project)
Use `/astesia-init` → Follow full pipeline: Product → Design → Engineering → Quality → DevOps.

### Brownfield (Existing Project)
Use the **Brownfield Entry Protocol** (see `skills/brownfield-entry/SKILL.md`):
1. Generate `.astesia/system-map.md` via trace-by-function analysis
2. Initialize `.astesia/astesia-state.json` with current project state
3. Enter the appropriate layer based on the user's request

---

## The `.astesia/` Contract

Every project managed by Astesia MUST have an `.astesia/` directory containing:

```
.astesia/
├── astesia-state.json     # Pipeline state tracker
├── brd.md                 # Business requirements (Product Layer output)
├── design-system.md       # Design tokens (Design Layer output)
├── architecture.md        # Technical blueprint (Engineering Layer output)
├── qa-test-plan.md        # Test specifications (Quality Layer output)
├── deployment.md          # Infrastructure declarations (DevOps Layer output)
├── system-map.md          # Codebase navigation map (Brownfield only)
├── anti-patterns.json     # Rule registry (Trust Pyramid L2) - append-only
├── enforcement/
│   └── astesia-gate.ts    # Deterministic gate, exit 1 on violation
└── verification/          # Independent Verifier evidence files per wave/PR
```

This is not optional. This is the paper trail that makes Astesia an *agency*, not just an AI that writes code.

---

## How AI Agents Use Astesia

When executing an Astesia workflow, the Agent MUST:
1. Initialize the `astesia-state.json`.
2. Determine which layer is currently active.
3. Use the relevant Layer Rules.
4. Output the artifact required for the next layer.
5. If brownfield: generate `system-map.md` before any engineering work.
