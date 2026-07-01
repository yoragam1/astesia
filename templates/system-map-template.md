# System Map — `.astesia/system-map.md`
**Project Name:** [Nama Proyek]  
**Generated:** [ISO_DATE]  
**Entry Type:** Brownfield

---

## 1. Project Summary
- **Tujuan aplikasi:** [1-2 kalimat tujuan utama]
- **Tech stack utama:**
  - Runtime: [Node.js/Bun/Python/Go]
  - Framework: [Hono/Express/Next.js/etc]
  - Database: [PostgreSQL/MySQL/SQLite/etc]
  - Queue/Integration: [Redis/RabbitMQ/etc — atau "None"]
- **Pola arsitektur:** [Layered Monolith / Modular Monolith / Microservices / Event-Driven]

---

## 2. Core Logic Flow (Function-Level)

Trace alur kritikal utama sistem:

```
[Route/Trigger] → [Controller/Handler][function] → [Service][function] → [Repository/Query][function] → [DB/API]
```

### Flow 1: [Nama Flow, e.g., User Registration]
```
POST /auth/register → authRoutes → authService.register() → userRepository.create() → DB:users
                                  → emailService.sendVerification() → External:SendGrid
```

### Flow 2: [Nama Flow]
```
[Trace flow berikutnya]
```

---

## 3. Clean Tree (Source Code Only)

```
src/
├── index.ts
├── middleware/
│   └── ...
├── modules/
│   ├── [module-name]/
│   │   ├── *.routes.ts
│   │   ├── *.service.ts
│   │   ├── *.repository.ts
│   │   └── *.schema.ts
│   └── ...
├── db/
│   ├── schema.ts
│   └── connection.ts
└── lib/
    └── ...
```

> **Exclusions:** `node_modules`, `.venv`, `dist`, `build`, `.git`, `.vscode`, `__pycache__`, `coverage`, `.next`, `.cache`, `*.log`, `*.lock`, `*.min.*`, `*.map`

---

## 4. Module Map (The Chapters)

> Each entry includes `conceptual_tags` — domain labels for semantic navigation. Use these to find the right file without scanning the entire codebase.

### `src/index.ts`
- **Functions:** App initialization, route mounting
- **Role:** Application entrypoint — creates server, registers middleware and routes.
- **Conceptual Tags:** `[entrypoint, initialization, routing, middleware]`

### `src/modules/[module]/[module].routes.ts`
- **Functions:** [list exported route handlers]
- **Role:** [1 kalimat peran modul]
- **Conceptual Tags:** `[routing, http, api, [domain]]`

### `src/modules/[module]/[module].service.ts`
- **Functions:** [list exported functions]
- **Role:** [1 kalimat peran modul]
- **Conceptual Tags:** `[business-logic, [domain], validation]`

### `src/modules/[module]/[module].repository.ts`
- **Functions:** [list exported functions]
- **Role:** [1 kalimat peran modul]
- **Conceptual Tags:** `[database, query, orm, [domain]]`

*(Ulangi untuk setiap file penting. Gunakan tag yang spesifik: `auth`, `payment`, `email`, `caching`, `queue`, `file-upload`, dsb)*

---

## 5. Data & Config

### Environment
- **Config utama:** `.env` (root), `.env.example`
- **Env vars kritis:** `DATABASE_URL`, `JWT_SECRET`, `PORT`

### Database Schema
| Table | Kolom Inti | Relasi |
|-------|-----------|--------|
| [table_name] | [kolom penting] | [FK → table lain] |

### Migration & Seed
- **Migration location:** `drizzle/` atau `prisma/migrations/`
- **Seed location:** `src/db/seed.ts`

### Runtime Artifacts
- **Build output:** `dist/`
- **Coverage:** `coverage/`

---

## 6. External Integrations

| Service/API | Tujuan | Modul Pemanggil |
|-------------|--------|-----------------|
| [e.g., SendGrid] | [Email transaksional] | `src/modules/email/email.service.ts` |
| [e.g., Stripe] | [Payment processing] | `src/modules/payment/payment.service.ts` |

---

## 7. Risks / Blind Spots

- [ ] [Area yang tidak bisa dipetakan pasti — e.g., dynamic imports, generated code]
- [ ] [Config yang hilang atau tidak ditemukan]
- [ ] [Modul tanpa test coverage]
