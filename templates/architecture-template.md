# System Architecture
**Project Name:** [Nama Sistem]

## 1. Overview & Pattern
* **Core Pattern:** [Clean Architecture / Layered / Event-Driven]
* **Monolith vs Microservices:** [PILIHAN BESERTA ALASANNYA]
* **Scaling Strategy:** [Penjelasan Trade-off sesuai Astesia Overview]

## 2. Tech Stack
| Layer | Tech |
| :--- | :--- |
| Frontend | |
| Backend | |
| Database | |
| Infra/Cloud | |

## 3. Data Flow
* [Flow Diagram Detail / Mermaid]

## 4. API Specification
### `METHOD /path`
* **Request:** `{}`
* **Response:** `{}`

## 5. Security Architecture
* **Authentication:** [JWT / Session / OAuth]
* **Authorization:** [RBAC / ABAC]
* **Data Protection:** [Hashing / Encryption / Masking]

## 6. Error Handling Strategy
* **Global Error Format:** `{ "error": true, "code": "...", "message": "..." }`
* **Logging:** [Pino / Winston / Standard Out]

## 7. Minimalist Execution Strategy (Anti-Bloat)
* **Dependencies Rejected:** [List of 3rd-party libs that were evaluated but rejected in favor of native code]
* **Native / Stdlib Used:** [List of native features used (e.g., URLSearchParams instead of qs)]
* **Abstractions Avoided:** [e.g., Avoided Factory pattern for simple instantiation]

## 8. Architecture Decision Records (ADR)
* **ADR 001:** [Decision title]
  * **Context:** [Why we need to make this decision]
  * **Decision:** [What we decided to do]
  * **Consequences:** [Trade-offs, what becomes harder/easier]
