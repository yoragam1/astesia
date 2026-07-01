# Skill: n8n Workflow Automation

## 1. Metadata
- **Name:** `n8n-automation`
- **Origin:** `Astesia Core`
- **Description:** Patterns for integrating n8n (self-hosted workflow automation) into a software architecture. Used for business process automation, webhook orchestration, and third-party service integration without custom code.

## 2. When to Use
Invoke this skill when:
- The BRD mentions "automation", "notifications", "integrations", or "webhooks."
- The user needs to connect multiple third-party services (Slack, Google Sheets, HubSpot, etc.).
- A business process involves conditional logic across multiple systems without building custom microservices.

## 3. Architecture Integration Pattern

### When to Use n8n vs Custom Code
| Scenario | Use n8n | Use Custom Code |
|---|---|---|
| Notify Slack when new user registers | ✅ | ❌ |
| Complex business logic with DB transactions | ❌ | ✅ |
| Sync data between two SaaS tools | ✅ | ❌ |
| Real-time, low-latency operations (<100ms) | ❌ | ✅ |
| Business user needs to edit the workflow | ✅ | ❌ |

### Webhook Integration with Backend
```typescript
// Backend: Emit a webhook event to n8n
// src/services/webhook.service.ts

export class WebhookService {
  private readonly n8nWebhookUrl = process.env.N8N_WEBHOOK_URL!;
  
  async emit(event: string, payload: Record<string, unknown>): Promise<void> {
    try {
      await fetch(this.n8nWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event, payload, timestamp: new Date().toISOString() })
      });
    } catch (err) {
      // Non-blocking: webhook failures should never crash the main app
      console.warn(`[Webhook] Failed to emit event '${event}':`, err);
    }
  }
}

// Usage in service layer:
// After user registration:
await webhookService.emit("user.registered", { userId, email, plan });
```

### n8n Receiving Webhooks from Backend
```
n8n Workflow: "New User Onboarding"
  Trigger: Webhook (POST /webhook/user-registered)
  → IF plan === "pro":
      → Add to HubSpot CRM
      → Send Slack notification to sales channel
      → Send personalized welcome email via Resend
  → ELSE:
      → Add to Mailchimp free tier list
      → Send basic welcome email
```

## 4. Security Rules

### Webhook Authentication
Always validate incoming webhook signatures to prevent unauthorized calls:

```typescript
// Verify n8n webhook origin using HMAC
function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const hmac = crypto.createHmac("sha256", secret);
  const expectedSig = "sha256=" + hmac.update(payload).digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSig)
  );
}

// In route handler:
app.post("/webhook/n8n-callback", async (c) => {
  const sig = c.req.header("X-N8N-Signature");
  const body = await c.req.text();
  
  if (!verifyWebhookSignature(body, sig!, process.env.N8N_WEBHOOK_SECRET!)) {
    return c.json({ error: "Invalid signature" }, 401);
  }
  // Process safely...
});
```

### Environment Variables
```env
N8N_WEBHOOK_URL=https://n8n.yourdomain.com/webhook/xxxxx
N8N_WEBHOOK_SECRET=your_hmac_secret_key
```

## 5. Self-Hosted n8n Docker Setup
```yaml
# docker-compose.yml
services:
  n8n:
    image: n8nio/n8n:latest
    ports:
      - "5678:5678"
    environment:
      - N8N_BASIC_AUTH_ACTIVE=true
      - N8N_BASIC_AUTH_USER=${N8N_USER}
      - N8N_BASIC_AUTH_PASSWORD=${N8N_PASSWORD}
      - WEBHOOK_URL=https://n8n.yourdomain.com
      - N8N_ENCRYPTION_KEY=${N8N_ENCRYPTION_KEY}
    volumes:
      - n8n_data:/home/node/.n8n
    restart: unless-stopped

volumes:
  n8n_data:
```

## 6. Anti-Patterns
- ❌ Never put critical transactional business logic in n8n — use your backend service layer.
- ❌ Never expose n8n without authentication in production.
- ❌ Never hardcode webhook URLs — use environment variables.
- ❌ Never let n8n webhook failures crash the main application — always use fire-and-forget pattern.
- ❌ Never use n8n for real-time, low-latency operations — it adds network hops.
