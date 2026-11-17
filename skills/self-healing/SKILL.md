---
name: self-healing
description: >-
  Application-level autonomic debugging (retry logic, circuit breakers) AND Agent-level error resolution (Token Bleed Protection, Hash Convergence, Git Auto-Rollbacks).
---

# Skill: Self-Healing & Autonomic Debugging

## 1. Metadata
- **Name:** `self-healing`
- **Origin:** `Astesia Core`
- **Description:** Application-level autonomic debugging (retry logic, circuit breakers) AND Agent-level error resolution (Token Bleed Protection, Hash Convergence, Git Auto-Rollbacks).

## 2. When to Use
Invoke this skill when:
- Building services that must stay operational under partial failure.
- Integrating with external APIs or unreliable third-party services.
- The BRD mentions "resilience," "fault tolerance," or "99.9% uptime."

## 3. Constraints (Anti-Patterns — NEVER DO)
- ❌ Never swallow errors silently (`catch (e) { /* nothing */ }`).
- ❌ Never retry indefinitely without a backoff strategy.
- ❌ Never let a single failing dependency take down the entire system.
- ❌ Never return HTTP 200 for an error — always use correct status codes.

## 4. Practical Patterns

### Retry with Exponential Backoff
```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 1000
): Promise<T> {
  let lastError: Error;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const delay = baseDelayMs * Math.pow(2, attempt);
      const jitter = Math.random() * 500;
      await new Promise(r => setTimeout(r, delay + jitter));
    }
  }
  throw lastError!;
}

// Usage:
const data = await withRetry(() => fetchFromExternalAPI(url), 3, 2000);
```

### Circuit Breaker
```typescript
class CircuitBreaker {
  private failureCount = 0;
  private lastFailure = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(
    private threshold: number = 5,
    private resetTimeMs: number = 30000
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailure > this.resetTimeMs) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is OPEN — service unavailable');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess() {
    this.failureCount = 0;
    this.state = 'closed';
  }

  private onFailure() {
    this.failureCount++;
    this.lastFailure = Date.now();
    if (this.failureCount >= this.threshold) {
      this.state = 'open';
    }
  }
}
```

### Graceful Degradation
```typescript
// If a non-critical service fails, return cached/fallback data instead of erroring
async function getUserProfile(id: string) {
  try {
    const profile = await profileService.getById(id);
    await cache.set(`profile:${id}`, profile);
    return profile;
  } catch (err) {
    console.warn('Profile service degraded, serving cached version');
    const cached = await cache.get(`profile:${id}`);
    if (cached) return cached;
    throw err; // Only throw if no fallback available
  }
}
```

## 5. Resilience Checklist
- [ ] All external API calls wrapped in retry with backoff
- [ ] Circuit breaker on critical dependencies (payment, auth providers)
- [ ] Fallback/cached responses for non-critical service failures
- [ ] Health check endpoint reports dependency status
- [ ] Graceful shutdown handler (drain connections, finish in-flight requests)

## 6. Agent Self-Healing (The Astesia Auto-Rollback Protocol)
When Astesia itself is debugging code (e.g., fixing a compile error or failing test), it must follow these constraints to prevent Token Bleed:

### Step 1: Initialize Retry State
When an error is encountered, check the `retry_count.[layer]` in `.astesia/astesia-state.json`. 
- If `retry_count >= 3`: **HALT**. See Step 4 (Token Bleed Protection).
- If `retry_count < 3`: Increment the counter and proceed to Step 2.

### Step 2: The Hash Convergence Guard
Before attempting a fix, evaluate the proposed solution against the previous failed attempt.
- If your proposed code fix is structurally identical (or logically equivalent) to a fix you already tried, you have hit a **Convergence Loop**.
- **Action:** Do NOT apply the identical fix. If you cannot find a *different* logical approach, immediately trigger Step 4 (Rollback).

### Step 3: Targeted Remediation
When applying the fix:
1. Do not rewrite the entire file; only edit the failing block.
2. If the error is a missing import, verify the file exists before adding the import.
3. If the error is a type mismatch, trace the type definition using AST signatures.

### Step 4: Token Bleed Protection & Auto-Rollback
If you hit the maximum retry limit (3), or the Hash Convergence Guard triggers:
1. **Stop execution immediately.** Do not attempt a 4th fix.
2. Execute a **Git Rollback** to the snapshot taken before the task began (`git reset --hard` or restoring from stash). This ensures the codebase is never left in an uncompilable state.
3. Update `astesia-state.json`:
   - Set `layer_statuses.engineering` to `"failed"`.
   - Append the exact error logs and failed attempts to `blocking_issues[]`.
4. Inform the user: "I attempted to fix the compilation error 3 times but failed. I have rolled back the workspace to its previous stable state to prevent codebase corruption. Here are the blocking issues..."
