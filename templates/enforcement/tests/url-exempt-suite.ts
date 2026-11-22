import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

export interface UrlExemptTestCase {
  id: string;
  name: string;
  content: string;
  shouldTrigger: boolean;
}

export const URL_EXEMPT_CASES: UrlExemptTestCase[] = [
  // TIDAK MEMICU (Exempt safe URLs)
  {
    id: "UE-01",
    name: "process.env.DATABASE_URL || 'http://localhost:3000'",
    content: "export const u = process.env.DATABASE_URL || 'http://localhost:3000';\n",
    shouldTrigger: false
  },
  {
    id: "UE-02",
    name: "?? 'https://api.example.com/v1'",
    content: "export const u = customUrl ?? 'https://api.example.com/v1';\n",
    shouldTrigger: false
  },
  {
    id: "UE-03",
    name: "TURSO_DATABASE_URL ?? 'libsql://my-db.turso.io'",
    content: "export const u = TURSO_DATABASE_URL ?? 'libsql://my-db.turso.io';\n",
    shouldTrigger: false
  },
  {
    id: "UE-04",
    name: "endpoint: 'wss://x.example.com/socket'",
    content: "export const cfg = { endpoint: 'wss://x.example.com/socket' };\n",
    shouldTrigger: false
  },
  {
    id: "UE-05",
    name: "postgres://user:${DB_PASS}@db/app (password is ${VAR} reference)",
    content: "export const u = process.env.DATABASE_URL || 'postgres://user:${DB_PASS}@db/app';\n",
    shouldTrigger: false
  },
  {
    id: "UE-06",
    name: "postgresql://user:$DB_PASS@db/app (password is $VAR reference)",
    content: "export const u = process.env.DATABASE_URL || 'postgresql://user:$DB_PASS@db/app';\n",
    shouldTrigger: false
  },
  {
    id: "UE-07",
    name: "mysql://user:{{ .Values.dbPass }}@db:3306/app (password is {{ }} reference)",
    content: "export const u = process.env.DATABASE_URL || 'mysql://user:{{ .Values.dbPass }}@db:3306/app';\n",
    shouldTrigger: false
  },
  {
    id: "UE-08",
    name: "mongodb://mongo.internal:27017/app",
    content: "export const u = process.env.MONGO_URL || 'mongodb://mongo.internal:27017/app';\n",
    shouldTrigger: false
  },
  {
    id: "UE-09",
    name: "mongodb+srv://cluster0.example.net/prod",
    content: "export const u = process.env.MONGO_URL || 'mongodb+srv://cluster0.example.net/prod';\n",
    shouldTrigger: false
  },
  {
    id: "UE-10",
    name: "redis://cache.internal:6379/0",
    content: "export const u = process.env.REDIS_URL || 'redis://cache.internal:6379/0';\n",
    shouldTrigger: false
  },
  {
    id: "UE-11",
    name: "rediss://tls-cache.internal:6380/0",
    content: "export const u = process.env.REDIS_URL || 'rediss://tls-cache.internal:6380/0';\n",
    shouldTrigger: false
  },
  {
    id: "UE-12",
    name: "amqp://broker.internal:5672/vhost and amqps://",
    content: "export const u1 = process.env.AMQP_URL || 'amqp://broker.internal:5672/vhost';\nexport const u2 = process.env.AMQPS_URL || 'amqps://secure.internal:5671/vhost';\n",
    shouldTrigger: false
  },
  {
    id: "UE-13",
    name: "ws://localhost:8080/events with non-sensitive query param",
    content: "export const u = process.env.WS_URL || 'ws://localhost:8080/events?page=1&limit=20';\n",
    shouldTrigger: false
  },

  // MEMICU (Must trigger ASTESIA-004)
  {
    id: "UE-14",
    name: "postgres://admin:hunter2@db/app hardcoded password in userinfo",
    content: "export const u = process.env.DATABASE_URL || 'postgres://admin:hunter2@db/app';\n",
    shouldTrigger: true
  },
  {
    id: "UE-15",
    name: "libsql://x.turso.io?authToken=eyJhbGci... JWT in authToken query param",
    content: "export const u = process.env.TURSO_URL || 'libsql://x.turso.io?authToken=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.abc';\n",
    shouldTrigger: true
  },
  {
    id: "UE-16",
    name: "https://api.example.com?api_key=abcd1234 sensitive query param api_key",
    content: "export const u = process.env.API_URL || 'https://api.example.com?api_key=abcd1234';\n",
    shouldTrigger: true
  },
  {
    id: "UE-17",
    name: "https://ghp_<kuat>@github.com/org/repo strong prefix in userinfo",
    content: "export const u = process.env.GIT_URL || 'https://ghp_1234567890abcdefghijklmnopqrstuv@github.com/org/repo';\n",
    shouldTrigger: true
  },
  {
    id: "UE-18",
    name: "redis://:s3cr3tpass@host empty user with password in userinfo",
    content: "export const u = process.env.REDIS_URL || 'redis://:s3cr3tpass@host';\n",
    shouldTrigger: true
  },
  {
    id: "UE-19",
    name: "process.env.JWT_SECRET ?? 'https://x.example.com' sensitive env key",
    content: "export const s = process.env.JWT_SECRET ?? 'https://x.example.com';\n",
    shouldTrigger: true
  },
  {
    id: "UE-20",
    name: "const apiKey = 'https://x.example.com/v1' sensitive variable key",
    content: "export const apiKey = 'https://x.example.com/v1';\n",
    shouldTrigger: true
  },
  {
    id: "UE-21",
    name: "ftp://u:p@h scheme outside allowed list follows normal rule",
    content: "export const u = process.env.FTP_URL || 'ftp://u:p@h';\n",
    shouldTrigger: true
  },
  {
    id: "UE-22",
    name: "Unparseable URL https:// triggers",
    content: "export const u = process.env.API_URL || 'https://';\n",
    shouldTrigger: true
  },
  {
    id: "UE-23",
    name: "Unparseable URL http://[::1 triggers",
    content: "export const u = process.env.API_URL || 'http://[::1';\n",
    shouldTrigger: true
  },
  {
    id: "UE-24",
    name: "Strong prefix sk_live_ in URL path triggers",
    content: "export const u = process.env.WEBHOOK_URL || 'https://api.example.com/v1/sk_live_1234567890abcdef';\n",
    shouldTrigger: true
  },
  {
    id: "UE-25",
    name: "Sensitive param access_token in URL fragment triggers",
    content: "export const u = process.env.REDIRECT_URL || 'https://app.example.com/cb#access_token=secret123456';\n",
    shouldTrigger: true
  },
  {
    id: "UE-26",
    name: "Standalone credentialed URL postgres://admin:hunter2@db/app without process.env triggers",
    content: "export const dbUrl = 'postgres://admin:hunter2@db/app';\n",
    shouldTrigger: true
  }
];

export function runUrlExemptSuite(
  customGatePath?: string,
  customTmpDir?: string
): { total: number; passed: number; failed: number; known_gaps: number; errors: string[] } {
  const gatePath = customGatePath || resolve(__dirname, "../astesia-gate.ts");
  const rulesPath = resolve(__dirname, "../anti-patterns.json");
  const baseTmp = customTmpDir || resolve(__dirname, "../../../.astesia/audit/tmp/url-exempt-" + Date.now());
  mkdirSync(baseTmp, { recursive: true });

  let passed = 0;
  let failed = 0;
  const errors: string[] = [];

  try {
    for (const tc of URL_EXEMPT_CASES) {
      const file = `${tc.id.toLowerCase()}.ts`;
      writeFileSync(join(baseTmp, file), tc.content, "utf8");
    }

    const res = spawnSync(process.execPath, [gatePath, "--root", baseTmp, "--rules", rulesPath, "--json"], {
      encoding: "utf8",
      maxBuffer: 30 * 1024 * 1024
    });

    const parsed = JSON.parse(res.stdout || "{}");
    const violations: Array<{ ruleId: string; file: string; line: number }> = parsed.violations || [];

    for (const tc of URL_EXEMPT_CASES) {
      const file = `${tc.id.toLowerCase()}.ts`;
      const has004 = violations.some((v) => v.file === file && v.ruleId === "ASTESIA-004");
      if (has004 === tc.shouldTrigger) {
        passed++;
      } else {
        failed++;
        errors.push(`FAIL: ${tc.id} (${tc.name}) - expected trigger=${tc.shouldTrigger}, got ${has004}`);
      }
    }
  } finally {
    try {
      rmSync(baseTmp, { recursive: true, force: true });
    } catch {}
  }

  return { total: passed + failed, passed, failed, known_gaps: 0, errors };
}

if (import.meta.main) {
  const r = runUrlExemptSuite();
  console.log(`URL Exempt Suite: ${r.passed}/${r.total} passed (${r.failed} failed)`);
  if (r.errors.length > 0) {
    console.error(r.errors.join("\n"));
    process.exit(1);
  }
}
