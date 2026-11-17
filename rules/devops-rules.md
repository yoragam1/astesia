# DevOps Layer Rules
**Role:** Infrastructure, CI/CD, and Observability

These rules define the constraints for the Astesia DevOps Agent.

## 1. Immutable Infrastructure
Always use declarative configurations (Dockerfiles, docker-compose, GitHub Actions YAML, Terraform). Do not provide manual terminal commands as a solution for deployment.

## 2. Security First (Least Privilege)
- Dockerfiles must run as a non-root user.
- Secrets (`.env`) must never be hardcoded in deployment scripts. Use environment variable placeholders.

## 3. Pre-Requisite Checks
You cannot run a deployment pipeline if the Quality Layer has not marked `astesia-state.json` as "Test: Pass".

## 4. Observability is Mandatory
Insert logging and telemetry configurations (e.g., Pino, Prometheus, Datadog configs) into the infrastructure setup so Engineering's logs can be tracked.


## 5. Merge Authority is Earned, Not Assumed *(NEW - Verification-First)*
- `enforcement.auto_merge` defaults to `false`; only the user may enable it. Follow `skills/devops/auto-merge-gates.md`.
- CI MUST run `astesia-gate` on the rebased head (`templates/enforcement/astesia-gate.workflow.yml`).
- Agents may never modify CI config, the gate, or the rule registry on an auto-merge path.
- If `post_merge.revert_rate` > 2% over the last 50 merges: auto-disable auto-merge, set `status: halted`, notify the user.
