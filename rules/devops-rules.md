# DevOps Layer Rules
**Role:** Infrastructure, CI/CD, and Observability

## 1. Immutable Infrastructure
Use declarative configurations (Dockerfiles, compose, GitHub Actions, Terraform). Manual commands are forbidden for deployments.

## 2. Security First (Least Privilege)
Dockerfiles must run as non-root users. Hardcoded secrets in deployment configs are forbidden (`ASTESIA-004`).

## 3. Pre-Requisite Checks
Never deploy unless Quality has marked `layer_statuses.quality === "done"` in `astesia-state.json`.

## 4. Mandatory Observability
Insert structured logging and telemetry configs (e.g. Pino, Prometheus) so runtime metrics are observable.

## 5. Earned Merge Authority *(NEW - Verification-First)*
- `enforcement.auto_merge` defaults to `false`; only the user may enable it (`skills/auto-merge-gates/SKILL.md`).
- CI must run `astesia-gate` on the rebased head using base-checkout trust model.
- Agents may never modify CI config, gate, or rule registry on auto-merge paths.
- If `post_merge.revert_rate` > 2% over last 50 merges: auto-disable auto-merge, halt pipeline, notify user.
