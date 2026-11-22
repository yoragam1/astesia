---
name: property-based-testing
description: >-
  Define invariant property tests for parsers, validators, math, and state machines with randomized shrinking.
---

# Skill: Property-Based Testing (Invariant Verification)

## 1. Metadata
- **Name:** `property-based-testing`
- **Origin:** `Astesia Quality (Framework Hygiene Upgrade)`
- **Description:** Rigorous automated testing methodology validating high-risk algorithms against mathematical invariants across thousands of randomized inputs with automated counterexample shrinking.

## 2. When to Use
Mandatory for the following modules:
1. **Parsers & Serializers:** (e.g. JSON/YAML parsers, protocol decoders, AST transformers).
2. **Input Validators:** (e.g. Zod schemas, regex evaluators, authorization token parsers).
3. **Financial & Temporal Calculations:** (e.g. currency conversion, tax computations, date/time spans).
4. **State Machines & Transitions:** (e.g. order lifecycle, authentication states, lock-free queues).

## 3. Practical Guidance

### Rule 1: Invariants in Test Titles
Every property test must explicitly name the mathematical invariant in its title:
- Round-trip Invariant: `decode(encode(x)) === x`
- Idempotency Invariant: `f(f(x)) === f(x)`
- Boundedness Invariant: `0 <= calculateDiscount(x) <= maxDiscount`
- Monotonicity Invariant: `x <= y implies f(x) <= f(y)`

### Rule 2: Polyglot Framework Standards
- **TypeScript / JavaScript:** Use `fast-check` (e.g. `fc.assert(fc.property(...))`).
- **Python:** Use `hypothesis` (e.g. `@given(...)`).
- **Go:** Use native fuzzing (`go test -fuzz=Fuzz...`).
- **Optional Complement:** Mutation testing (e.g. Stryker) is recommended as a supplementary verification mechanism to detect surviving mutant edge cases.

### Rule 3: Minimal TypeScript Example
```typescript
import { test } from 'vitest';
import fc from 'fast-check';
import { serializePayload, deserializePayload } from './serializer';

test('Invariant: roundtrip serialization preserves structure', () => {
  fc.assert(
    fc.property(
      fc.record({ id: fc.uuid(), amount: fc.nat(), tags: fc.array(fc.string()) }),
      (payload) => {
        const serialized = serializePayload(payload);
        const restored = deserializePayload(serialized);
        return JSON.stringify(restored) === JSON.stringify(payload);
      }
    )
  );
});
```

## 4. Anti-Patterns
- ❌ **Example-Only Illusion:** Testing complex encoders with only 2 hardcoded string samples.
- ❌ **Vague Assertions:** Writing property checks that merely assert `result !== null` without asserting invariants.
- ❌ **Ignored Shrinking:** Dismissing minimal failure cases found by property shrinkers as "unrealistic edge cases".
