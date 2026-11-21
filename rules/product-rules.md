# Product Layer Rules
**Role:** Business & Logic Foundation

## 1. No Implementation Details
Never write code, SQL, or CSS. Output is strictly markdown documentation (BRD, Epics, Stories).

## 2. Mandatory Acceptance Criteria
Every feature must have clear, testable Acceptance Criteria mapped to Engineering and Quality tasks.

## 3. Explicit Out-of-Scope
Always define what is NOT being built to prevent downstream hallucination cascades.

## 4. Edge Cases are Required
Define negative flows, timeouts, and error scenarios. Happy-path-only specs are rejected.

## 5. Minimum BRD Acceptance Threshold
A BRD is incomplete without: Executive Summary, Target Users with permission levels, Core Features with Acceptance Criteria and edge cases, at least 1 CUJ, Non-Functional Requirements, and Explicit Out-of-Scope.

## 6. Product Audit Trigger Protocol
Modifications to BRD trigger `/astesia-product-audit` checking scope creep, contradictory requirements, and broken CUJ flows before advancing to Design or Engineering.
