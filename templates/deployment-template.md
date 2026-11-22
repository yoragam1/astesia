# DevOps Infrastructure Plan
**Project Name:** [Nama Sistem]

## 1. Containerization (Docker)
* **Base Image:** [e.g., node:20-alpine]
* **Multi-stage build:** Yes/No
* **User Permission:** `appuser` (Non-Root)

## 2. CI/CD Pipeline
* **Trigger:** Push to `main`
* **Steps:** 
  1. Setup Runtime
  2. Run Linter
  3. Run Tests (Inherited from Quality Layer)
  4. Docker Build & Push

## 3. Observability & Monitoring
* **Logging Config:** [e.g., JSON to stdout via Pino]
* **Metrics:** [e.g., Prometheus / Datadog]
* **Alerting:** [e.g., Slack notifications on 5xx errors]

## 4. Rollback Strategy
* **Method:** [e.g., Revert Git commit & auto-deploy / Switch container image tag]
* **Data Migration Reversal:** [Manual / Automated script]

## 5. Merge Policy & Verification-First Gates
* **Auto-Merge Enabled:** false (default; user opt-in required)
* **Gate Enforcement:** Must pass `astesia-gate` on rebased-head with 0 errors and `warn` <= ratchet
* **Protected Paths (Human Review Required):** `auth/`, `payment/`, `migrations/`, `infra/`, `.github/`, `.astesia/anti-patterns.json`
* **Max Auto-Merge LOC:** 400 lines
* **Revert Circuit Breaker:** Auto-disable auto-merge if 30-day revert rate > 2%
