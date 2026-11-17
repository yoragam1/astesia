---
name: layered-architecture
description: >-
  Strict software architecture enforcement for applications managed by Astesia. Defines layer responsibilities, dependency direction, and folder structure patterns.
---

# Skill: Layered Architecture

## 1. Metadata
- **Name:** `layered-architecture`
- **Origin:** `Astesia Core`
- **Description:** Strict software architecture enforcement for applications managed by Astesia. Defines layer responsibilities, dependency direction, and folder structure patterns.

## 2. When to Use
Invoke this skill when:
- Generating the initial `architecture.md` in Phase 3 (Engineering).
- Creating the folder structure for a new project.
- Reviewing existing code for architecture violations (Quality Layer).
- Deciding where to place new logic in an existing codebase.

## 3. Practical Guidance

### The Three Layers

```
┌─────────────────────────────────────────┐
│           API / Controller Layer         │  ← HTTP concerns ONLY
│  Routes, Request parsing, Response format │
├─────────────────────────────────────────┤
│           Service / Business Layer       │  ← ALL business logic
│  Orchestration, Validation, Rules        │
├─────────────────────────────────────────┤
│        Repository / Data Access Layer    │  ← Database ONLY
│  SQL/ORM queries, External API calls     │
└─────────────────────────────────────────┘
        ↑ Dependency flows DOWNWARD only
```

### Strict Rules

1. **Controller Layer:** Only parses HTTP requests and returns JSON. Never accesses the database. Never contains business logic.
2. **Service Layer:** Contains ALL business logic. Receives typed data (not raw HTTP requests). Calls repositories. Returns domain objects.
3. **Repository Layer:** The ONLY layer allowed to execute SQL/ORM queries or call external APIs/services.
4. **Dependency Direction:** Controller → Service → Repository. NEVER reverse. Repository must NOT import from Controller.
5. **Quality Gate:** If an Agent violates this by putting business logic in a route handler, Quality Layer MUST reject the code.

### Folder Structure — Backend

```
src/
├── index.ts                    # App entrypoint (mounts routes + middleware)
├── middleware/                  # Cross-cutting concerns
│   ├── auth.middleware.ts
│   ├── error.middleware.ts
│   └── logger.middleware.ts
├── modules/                    # Domain modules (Directive #6: Modular)
│   ├── user/
│   │   ├── user.routes.ts      # Controller layer
│   │   ├── user.schema.ts      # Input validation schemas (Zod)
│   │   ├── user.service.ts     # Service layer
│   │   ├── user.repository.ts  # Repository layer
│   │   └── user.service.test.ts
│   └── product/
│       ├── product.routes.ts
│       ├── product.schema.ts
│       ├── product.service.ts
│       ├── product.repository.ts
│       └── product.service.test.ts
├── db/
│   ├── schema.ts               # Database schema (Drizzle)
│   ├── connection.ts           # Connection pool
│   └── seed.ts                 # Seed data (dev only)
├── lib/                        # Shared utilities
│   ├── errors.ts               # Custom error classes
│   └── hash.ts                 # Password hashing
└── types/                      # Shared TypeScript types
    └── index.ts
```

### Folder Structure — Frontend (Next.js)

```
src/
├── app/                        # Next.js App Router (Page layer)
│   ├── layout.tsx
│   ├── page.tsx
│   └── dashboard/
│       └── page.tsx
├── components/                 # UI Components (View layer)
│   ├── ui/                     # Primitive components
│   └── features/               # Feature-specific components
├── lib/                        # Business Logic (Service equivalent)
│   ├── api.ts                  # API client
│   ├── auth.ts                 # Auth utilities
│   └── validators.ts           # Shared Zod schemas
├── hooks/                      # Custom hooks (Client-side logic)
├── stores/                     # State management (Zustand)
└── types/                      # Shared types
```

### Anti-Patterns to REJECT

```typescript
// ❌ REJECTED: Business logic in controller
app.post('/orders', async (c) => {
  const body = await c.req.json();
  // Business logic DIRECTLY in route handler!
  const stock = await db.select().from(products).where(eq(products.id, body.productId));
  if (stock[0].quantity < body.quantity) {
    return c.json({ error: 'Insufficient stock' }, 400);
  }
  await db.insert(orders).values(body);
  await db.update(products).set({ quantity: stock[0].quantity - body.quantity });
  return c.json({ success: true }, 201);
});

// ✅ CORRECT: Thin controller → Service → Repository
app.post('/orders', async (c) => {
  const data = createOrderSchema.parse(await c.req.json());
  const order = await orderService.create(data);
  return c.json({ success: true, data: order }, 201);
});
```

## 4. Tested Examples

### Dependency Flow Verification
```
userRoutes.post('/') 
  → calls userService.create(data)
    → calls userRepository.create(userData)
      → executes db.insert(users).values(userData)
    → calls emailService.sendWelcome(user.email)  // Optional cross-service
  → returns { success: true, data: user }
```

Each layer only knows about the layer directly below it. The controller never touches the database. The repository never formats HTTP responses.
