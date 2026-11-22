# Astesia Coding Standards

All generated code must adhere strictly to these formatting and structural standards.

## 1. Formatting and Syntax
- **Indentation:** 2 spaces (never tabs).
- **Line Length:** Under 80-100 characters.
- **Semicolons:** Semicolons required in JavaScript/TypeScript.
- **Quotes:** Prefer single quotes (`'`) unless escaping or in JSX attributes.

## 2. Type Safety (TypeScript)
- **Strict Mode:** `strict: true` assumed.
- **No `any`:** `any` is strictly prohibited (enforced by `ASTESIA-005`); use `unknown` with narrowing.
- **Explicit Returns:** Explicit return types required on exported functions.
- **Interfaces:** Prefer `interface` for object shapes; `type` for unions/primitives.

## 3. Imports and File Structure
- **Order:** (1) Built-in modules → (2) External packages → (3) Absolute internal (`@/...`) → (4) Relative (`./...`).
- **Exports:** Prefer named exports (`export const ...`); avoid `export default` unless required by framework.

## 4. Housekeeping
- **No Debug Artifacts:** Leftover `console.log()` and `debugger;` are forbidden (enforced by `ASTESIA-006`).
- **TODOs:** TODO/FIXME comments MUST be resolved before merge to main.
- **Comments:** Explain WHY, not obvious WHAT. Avoid dead code comments.

## 5. Error Handling Consistency
- Avoid generic `throw new Error()`; NEVER throw bare strings; developers MUST throw typed error classes and handle them at controller boundaries.
