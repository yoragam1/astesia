# Skill: Zod Schema Validation

## 1. Metadata
- **Name:** `zod-validation`
- **Origin:** `Astesia Core`
- **Description:** Input validation strategy using Zod for schema-first boundary validation. Enforces Engineering Directive #17 (Security-First Boundary Validation).

## 2. When to Use
Invoke this skill when:
- Building API endpoints that accept user input (request body, query params, route params).
- Creating form validation logic in frontend applications.
- Defining data contracts between layers (Service ↔ Controller, Service ↔ Repository).
- Generating TypeScript types from runtime schemas.

## 3. Practical Guidance

### Principle: Schema-First, Types-Second
Define the Zod schema first, then infer the TypeScript type from it. NEVER define the type manually and then create a separate schema.

```typescript
// ✅ CORRECT: Schema-first
import { z } from 'zod';

export const createUserSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['admin', 'user']).default('user'),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

// ❌ WRONG: Manual type + separate schema
interface CreateUserInput { name: string; email: string; }
const schema = z.object({ name: z.string(), email: z.string() }); // duplication!
```

### Schema Organization
- Store schemas in a dedicated `schemas/` directory per domain module.
- Name convention: `{entity}.schema.ts` (e.g., `user.schema.ts`).
- Export both the schema object AND the inferred type.

```
src/
├── modules/
│   └── user/
│       ├── user.schema.ts      # Zod schemas + inferred types
│       ├── user.controller.ts
│       ├── user.service.ts
│       └── user.repository.ts
```

### Controller Integration (Hono)
Parse and validate in the controller before calling service:

```typescript
// src/modules/user/user.controller.ts
import { Hono } from 'hono';
import { createUserSchema } from './user.schema';
import { userService } from './user.service';

const app = new Hono();

app.post('/users', async (c) => {
  const body = await c.req.json();
  const parsed = createUserSchema.safeParse(body);
  
  if (!parsed.success) {
    return c.json({ 
      success: false, 
      error_code: 'VALIDATION_ERROR',
      message: parsed.error.issues 
    }, 400);
  }
  
  const user = await userService.create(parsed.data);
  return c.json({ success: true, data: user }, 201);
});
```

### Reusable Patterns
```typescript
// Common reusable schemas
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});
```

## 4. Tested Examples

### Complete validation flow:
```typescript
// Route params + query params + body — all validated
app.get('/users/:id/posts', async (c) => {
  const { id } = idParamSchema.parse({ id: c.req.param('id') });
  const { page, limit } = paginationSchema.parse(c.req.query());
  
  const posts = await postService.findByUserId(id, { page, limit });
  return c.json({ success: true, data: posts });
});
```
