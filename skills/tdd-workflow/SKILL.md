---
name: tdd-workflow
description: >-
  Enforces strict test-driven development. This skill supersedes standard development practices by requiring tests to be written and proven to fail (RED) before any implementation code is written.
---

# Skill: Strict TDD Workflow (RED-GREEN-REFACTOR)

## 1. Metadata
- **Name:** `tdd-workflow`
- **Origin:** `Arene (Adapted for Astesia IDE Agent)`
- **Description:** Enforces strict test-driven development. This skill supersedes standard development practices by requiring tests to be written and proven to fail (RED) before any implementation code is written.

## 2. When to Activate
- Writing new features or functionality
- Fixing bugs or issues
- Refactoring existing code
- Adding API endpoints

## 3. Core Principles
1. **Tests BEFORE Code:** ALWAYS write tests first, then implement code to make tests pass.
2. **Coverage Requirements:** Minimum 80% coverage on new modules.

## 4. TDD Workflow Steps

### Step 1: Write Test Cases
Based on the BRD or specs, write unit/integration tests for the intended feature or bug fix.

### Step 2: Run Tests (They Should Fail / RED)
Run the test. It MUST fail. This proves the test is actually evaluating the missing logic or the bug, and not just passing by default.
- **Do not edit production code until this RED state is confirmed.**

### Step 3: Implement Code
Write minimal code to make tests pass. Do not over-engineer.

### Step 4: Run Tests Again (They Should Pass / GREEN)
Rerun the test and confirm it passes.

### Step 5: Refactor
Improve code quality while keeping tests green:
- Remove duplication
- Improve naming
- Enhance readability
- Ensure it aligns with Astesia's `engineering-rules.md`.

## 5. Testing Patterns (Vitest / Jest)
```typescript
import { describe, it, expect } from 'vitest'
import { searchMarkets } from './service'

describe('Semantic Search Service', () => {
  it('returns relevant markets for query', async () => {
    // Arrange
    const query = 'election'
    
    // Act
    const result = await searchMarkets(query)
    
    // Assert
    expect(result).toHaveLength(5)
    expect(result[0].name).toContain('election')
  })

  it('handles empty query gracefully', async () => {
    const result = await searchMarkets('')
    expect(result).toEqual([])
  })
})
```

## 6. Common Mistakes to Avoid
- ❌ **Testing Implementation Details:** Don't test internal state, test user-visible behavior or function outputs.
- ❌ **No Test Isolation:** Ensure each test sets up its own data and doesn't rely on previous tests.
- ❌ **Skipping the RED Phase:** Writing the code and the test at the same time is NOT Test-Driven Development. You must see the test fail first.
