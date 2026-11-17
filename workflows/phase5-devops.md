# Phase 5: DEVOPS
**Objective:** Package the application securely and set up orchestration.

---

## 1. Safety Check

- [ ] Verify `astesia-state.json` shows `layer_statuses.quality` = `done`.
- [ ] If Quality layer did NOT pass → **ABORT. Do not deploy broken code.**
- [ ] Set `layer_statuses.devops` to `in-progress`.
- [ ] Read `.astesia/architecture.md` for tech stack and scaling requirements.

## 2. Dockerization

- [ ] Create a **multi-stage Dockerfile** (see `skills/docker-compose/SKILL.md`):
  - [ ] Stage: `base` — minimal base image (Alpine preferred).
  - [ ] Stage: `deps` — install dependencies only.
  - [ ] Stage: `build` — compile/bundle application.
  - [ ] Stage: `production` — final slim image with built artifacts only.
- [ ] **Security (DevOps Rule #2):**
  - [ ] Runs as non-root user (`appuser`).
  - [ ] No secrets in Dockerfile or docker-compose (use `.env` files).
  - [ ] `.dockerignore` excludes: `node_modules`, `.git`, `.env`, `coverage`, `dist`.
- [ ] Add **health check** endpoint verification in container config.

## 3. Docker Compose Setup

- [ ] Create `docker-compose.dev.yml` for local development:
  - [ ] App service with volume mounts for hot reload.
  - [ ] Database service (PostgreSQL) with health check.
  - [ ] Redis (if needed) with health check.
  - [ ] Shared network for inter-service communication.
- [ ] Create `docker-compose.prod.yml` for production:
  - [ ] Resource limits (memory, CPU).
  - [ ] Restart policies (`unless-stopped`).
  - [ ] Nginx reverse proxy (if applicable).
  - [ ] Named volumes for data persistence.

## 4. CI/CD Orchestration

- [ ] Generate `.github/workflows/ci.yml`:
  - [ ] **Trigger:** On push to `main` and pull requests.
  - [ ] **Steps:**
    1. Checkout code
    2. Setup Node.js / runtime
    3. Install dependencies (`npm ci`)
    4. Run linter
    5. Run tests with coverage (`npm run test:coverage`)
    6. Build application
    7. (Optional) Deploy on main branch push
- [ ] Ensure pipeline **includes** the test suites generated in Phase 4.
- [ ] **Hard Gate (DevOps Rule #5):** Install `templates/enforcement/astesia-gate.workflow.yml` as `.github/workflows/astesia-gate.yml` (rebased-head verification: typecheck, `astesia-gate`, coverage, E2E). Make it a **required status check**.
- [ ] **Merge Policy:** Keep `enforcement.auto_merge = false` / `merge_mode = "manual"`. Document the path to `shadow` -> `auto-merge` (`skills/auto-merge-gates/SKILL.md`) in `.astesia/deployment.md`; only the user may enable it.
- [ ] Add branch protection rules recommendation.

## 5. Observability Setup (DevOps Rule #4)

- [ ] Configure structured logging (Pino recommended):
  - [ ] Log level configurable via ENV (`LOG_LEVEL`).
  - [ ] JSON format for production, pretty print for development.
- [ ] Add environment variable documentation:
  - [ ] Create `.env.example` with ALL required variables (no secret values).
  - [ ] Document each variable's purpose.

## 6. Quality Self-Check

Before final handoff:
- [ ] `docker compose -f docker-compose.dev.yml up` works without errors.
- [ ] Health check endpoint responds with `200 OK`.
- [ ] CI pipeline YAML is valid syntax.
- [ ] No secrets committed to version control.
- [ ] `.env.example` is complete and committed.

## 7. Final Handoff

- [ ] Save deployment documentation as `.astesia/deployment.md`.
- [ ] Update `astesia-state.json`:
  - Set `layer_statuses.devops` to `done`.
  - Set `status` to `completed`.
  - Add final history entry: "Astesia pipeline completed. Application ready for deployment."
- [ ] **Astesia cycle ends.** Inform the user that the full pipeline is complete.

## Fail Conditions (HALT)

- ❌ Quality Layer not passed → **ABORT.** Never deploy untested code.
- ❌ Docker build fails → Fix Dockerfile, do NOT skip containerization.
- ❌ Health check endpoint not responding → Fix application before deployment config.
- ❌ Secrets found in committed files → **Remove immediately**, rotate compromised credentials.

## Expected Output

```
Dockerfile                     # Multi-stage, non-root, production-ready
docker-compose.dev.yml         # Local development orchestration
docker-compose.prod.yml        # Production orchestration
.github/workflows/ci.yml       # CI/CD pipeline
.env.example                   # Environment variable documentation
.astesia/
├── deployment.md              # Deployment documentation
└── astesia-state.json         # Updated: status = "completed"
```
