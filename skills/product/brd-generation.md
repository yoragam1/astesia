# BRD Generation

## 1. Metadata
- **Name:** `brd-generation`
- **Origin:** `Astesia Core`
- **Description:** `Guides the PM/BA agent in drafting comprehensive Business Requirement Documents (BRD) to prevent scope creep and ensure testable requirements.`

## 2. When to Use
Invoke this skill whenever operating in the **Product Layer** and tasked with translating user ideas or vague prompts into structured business requirements. This is the mandatory first step for any Greenfield project.

## 3. Practical Guidance
1. **Identify Core Value:** Do not assume technical boundaries or implementation details (e.g., do not specify "use a SQL database" or "build in React"). Focus purely on the "What" and the "Why".
2. **Define the MVP:** Be ruthless in scoping down. If a feature is not essential for the core value proposition, move it to "Out of Scope".
3. **Structured Acceptance Criteria:** Every feature MUST have Acceptance Criteria written in a testable format (e.g., Given/When/Then or clear bullet points). The Quality Layer relies entirely on these criteria to build tests.
4. **Mandate Edge Cases:** Never write a "happy path only" BRD. For every feature, define what happens on failure (e.g., network error, invalid input, timeout).
5. **Format:** Use the `templates/brd-template.md`. Save the final output to `.astesia/brd.md`.

## 4. Tested Examples

### ❌ Anti-Pattern: Vague Requirements
```markdown
* **Feature:** User Login
* **Description:** Users should be able to log in to the system.
* **Acceptance Criteria:** Login works.
```

### ✅ Gold Standard: Testable Requirements
```markdown
* **Feature:** User Authentication (Email/Password)
* **Description:** Allows registered users to securely access their accounts.
* **Business Rules:** Passwords must be hashed. Sessions expire after 24h.
* **Acceptance Criteria:**
    * 1. Given a valid email and correct password, the user is redirected to the dashboard.
    * 2. Given an unregistered email, the system displays "Invalid credentials".
    * 3. Given a valid email but incorrect password, the system displays "Invalid credentials".
    * 4. After 5 failed attempts, the account is locked for 15 minutes.
* **Edge Cases & Negative Flow:**
    * If the database connection times out during login, return a 503 error with a user-friendly "Service unavailable" message.
```
