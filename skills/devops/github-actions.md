# GitHub Actions Pipeline

## 1. Metadata
- **Name:** `github-actions`
- **Origin:** `Astesia Core`
- **Description:** `Provides a standardized, secure CI/CD pipeline template for Astesia projects using GitHub Actions.`

## 2. When to Use
Invoke this skill in the **DevOps Layer** when generating deployment infrastructure. Use it to create the `.github/workflows/ci.yml` file.

## 3. Practical Guidance
1. **Fail-Fast Philosophy:** Workflows must run Linting and Unit Tests first. If they fail, the pipeline must halt immediately. Do not build Docker images for broken code.
2. **Caching:** Always use dependency caching (e.g., `actions/setup-node` caching or docker layer caching) to speed up pipeline execution.
3. **Secret Management:** Never hardcode deployment secrets or tokens. Always reference them via `${{ secrets.MY_SECRET }}`.
4. **Environment Separation:** Use separate jobs for CI (Testing/Building) and CD (Deployment). Require manual approval or branch protection for the CD job.

## 4. Tested Examples

### ✅ Gold Standard: Node.js CI Pipeline
```yaml
name: CI/CD Pipeline

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Run Linter
        run: npm run lint
        
      - name: Run Tests
        run: npm run test:coverage
        
  build:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      
      - name: Log in to Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_PASSWORD }}
          
      - name: Build and push Docker image
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: user/app:latest
```
