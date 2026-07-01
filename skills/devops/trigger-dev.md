# Skill: Trigger.dev Background Jobs

## 1. Metadata
- **Name:** `trigger-dev`
- **Origin:** `Astesia Core`
- **Description:** Patterns for building reliable background jobs and async task queues using Trigger.dev v3. Used when operations are too slow for synchronous HTTP responses (emails, reports, data sync, AI pipelines).

## 2. When to Use
Invoke this skill when:
- A feature requires an operation that takes >500ms (async email, PDF generation, AI processing).
- The BRD mentions "background processing", "scheduled tasks", "queues", or "webhooks."
- You need reliable retry logic for external API calls.

## 3. Core Patterns

### Pattern 1: Define a Task
```typescript
// src/jobs/sendWelcomeEmail.ts
import { task } from "@trigger.dev/sdk/v3";

export const sendWelcomeEmailTask = task({
  id: "send-welcome-email",
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
    factor: 2, // Exponential backoff
  },
  run: async (payload: { userId: string; email: string }) => {
    // This runs in the background — never blocks HTTP response
    await emailService.send({
      to: payload.email,
      template: "welcome",
      data: { userId: payload.userId }
    });
    return { sent: true, userId: payload.userId };
  }
});
```

### Pattern 2: Trigger from API Route (Fire and Forget)
```typescript
// src/routes/auth.route.ts (Hono example)
import { sendWelcomeEmailTask } from "../jobs/sendWelcomeEmail";

app.post("/register", async (c) => {
  const user = await userService.create(c.req.valid("json"));
  
  // Fire-and-forget: don't await this
  await sendWelcomeEmailTask.trigger({ 
    userId: user.id, 
    email: user.email 
  });
  
  // Respond immediately — don't block for the email
  return c.json({ success: true, userId: user.id }, 201);
});
```

### Pattern 3: Scheduled Task (Cron)
```typescript
// src/jobs/dailyReport.ts
import { schedules } from "@trigger.dev/sdk/v3";

export const dailyReportJob = schedules.task({
  id: "daily-sales-report",
  cron: "0 8 * * *", // Every day at 8AM UTC
  run: async (payload) => {
    const report = await reportService.generateDaily(payload.timestamp);
    await emailService.sendToAdmins(report);
  }
});
```

### Pattern 4: Multi-Step Pipeline (Sequences)
```typescript
// src/jobs/onboardingPipeline.ts
import { task } from "@trigger.dev/sdk/v3";

export const onboardingPipelineTask = task({
  id: "user-onboarding-pipeline",
  run: async (payload: { userId: string }) => {
    // Step 1: Send welcome email
    await sendWelcomeEmailTask.triggerAndWait({ userId: payload.userId, email: "..." });
    
    // Step 2: Create default workspace
    await createDefaultWorkspaceTask.triggerAndWait({ userId: payload.userId });
    
    // Step 3: Notify sales team
    await notifySalesTask.trigger({ userId: payload.userId });
    
    return { pipeline: "complete" };
  }
});
```

## 4. Architecture Rules

### Service Layer Integration
Background jobs MUST go through the Service layer — not call databases or external APIs directly:
```typescript
// ✅ Correct: Job calls service
run: async (payload) => {
  await emailService.sendWelcome(payload.userId); // Service handles DB + API
}

// ❌ Wrong: Job calls DB directly
run: async (payload) => {
  const user = await db.select().from(users).where(eq(users.id, payload.userId));
  // ... raw DB call in job body
}
```

### Error Handling
```typescript
run: async (payload) => {
  try {
    await criticalOperation(payload);
  } catch (error) {
    // Throw to trigger automatic retry based on retry config
    throw error;
    
    // OR: handle gracefully if retries shouldn't happen
    logger.error("Non-retryable error", { error, payload });
    return { success: false, reason: "non-retryable" };
  }
}
```

## 5. Environment Setup
```env
TRIGGER_SECRET_KEY=tr_dev_xxxxx
TRIGGER_PROJECT_ID=proj_xxxxx
```

```typescript
// src/config/trigger.ts
import { configure } from "@trigger.dev/sdk/v3";

configure({
  secretKey: process.env.TRIGGER_SECRET_KEY!,
});
```

## 6. Anti-Patterns
- ❌ Never use `setTimeout` or `setInterval` for background jobs — they die with the server process.
- ❌ Never call external APIs directly from route handlers if the operation can fail — always queue it.
- ❌ Never put DB calls directly in job bodies — route through the Service layer.
- ❌ Never use unlimited retries (`maxAttempts: Infinity`) — always set a cap.
