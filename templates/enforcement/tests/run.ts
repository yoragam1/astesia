/**
 * templates/enforcement/tests/run.ts — Reproducible test harness for Astesia Gate.
 * Runs:
 * - 72 baseline matrix test cases
 * - 15 original regression test cases
 * - Multi-violation per-line expectations (002-EC1, 004-EC1, 004-EC2, 005-EC1, 006-EC1, 007-EC2)
 * - T1 Tokenizer adversarial & language cases (ADV-02 variants, ADV-05 line count, ADV-07 desync, PHP, Vue/Svelte, Python, Go)
 * - T2 ASTESIA-004 decision table cases (SEC-01..15 + 10 new security cases)
 * - T4 Block comment astesia-allow suppression cases
 * - T5 ASTESIA-008 'for now' / 'temporary fix' + negative cases
 * - T6 CLI resilience & exit code tests (non-existent --root exit 2, --max-warn=0 with desync exit 1)
 * - T7 Seeded property fuzzing (2,000 files: invariant check on lines & lengths)
 *
 * Usage:
 *   bun templates/enforcement/tests/run.ts
 *   bun templates/enforcement/tests/run.ts --json
 */
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { independentCases } from "./independent/corpus";
import { runGroundTruthFuzz } from "./fuzz-truth";
import { runWorkflowGuardSuite } from "./workflow-guard";
import { runBaselineSuite } from "./baseline-suite";
import { runRulesDiffSuite } from "./rules-diff-suite";
import { runAllowlistSuite } from "./allowlist-suite";
import { runEnvGitSuite } from "./env-git-suite";
import { runProfileDispatchSuite } from "./profile-dispatch-suite";
import { runKeyContractSuite } from "./key-contract-suite";
import { runConfigSecretsSuite } from "./config-secrets-suite";
import { runRule010ScopeSuite } from "./rule010-scope-suite";
import { preprocessSource } from "../astesia-gate";

const REPO_ROOT = resolve(__dirname, "../../..");
const GATE_PATH = join(REPO_ROOT, "templates/enforcement/astesia-gate.ts");
const RULES_PATH = join(REPO_ROOT, "templates/enforcement/anti-patterns.json");
const TEST_DIR = join(REPO_ROOT, `.astesia/verification/harness-run-${Date.now()}`);
mkdirSync(TEST_DIR, { recursive: true });

const FIXTURES_DIR = join(TEST_DIR, "fixtures");
mkdirSync(FIXTURES_DIR, { recursive: true });

// Setup shared modules for ASTESIA-000 resolution tests
mkdirSync(join(FIXTURES_DIR, "shared"), { recursive: true });
writeFileSync(join(FIXTURES_DIR, "shared", "real.ts"), "export const real = 1;\n");
writeFileSync(join(FIXTURES_DIR, "shared", "index.ts"), "export const idx = 1;\n");
writeFileSync(join(FIXTURES_DIR, "shared", "only-dts.d.ts"), "export interface OnlyDts { id: string; }\n");

export interface ViolationExpectation {
  ruleId: string;
  line: number;
  isKnownGap?: boolean;
  gapReason?: string;
}

export interface TestCase {
  id: string;
  ruleId: string;
  category:
    | "baseline72"
    | "regressions"
    | "adversarial"
    | "security"
    | "new"
    | "independent"
    | "fuzz_truth"
    | "baseline"
    | "ci_guard"
    | "rules_diff";
  relPath: string;
  content: string;
  expectedShouldTrigger: boolean;
  expectedViolations?: ViolationExpectation[];
  isKnownGap?: boolean;
  gapReason?: string;
  description: string;
}

export const testCases: TestCase[] = [
  // ================= 72 BASELINE MATRIX =================
  // ASTESIA-000
  { id: "000-TP1", ruleId: "ASTESIA-000", category: "baseline72", relPath: "r000/tp1.ts", content: `import { ghost } from './does-not-exist';\n`, expectedShouldTrigger: true, description: "Standard ESM relative import to non-existent file" },
  { id: "000-TP2", ruleId: "ASTESIA-000", category: "baseline72", relPath: "r000/tp2.ts", content: `const x = require('../shared/missing-module');\n`, expectedShouldTrigger: true, description: "CommonJS require() to non-existent relative path" },
  { id: "000-TP3", ruleId: "ASTESIA-000", category: "baseline72", relPath: "r000/tp3.ts", content: `export { something } from './phantom.js';\n`, expectedShouldTrigger: true, description: "ESM re-export with .js specifier where neither .js nor .ts exists" },
  { id: "000-TN1", ruleId: "ASTESIA-000", category: "baseline72", relPath: "r000/tn1.ts", content: `import { real } from '../shared/real';\n`, expectedShouldTrigger: false, description: "Valid relative import resolved to ../shared/real.ts" },
  { id: "000-TN2", ruleId: "ASTESIA-000", category: "baseline72", relPath: "r000/tn2.ts", content: `import { real } from '../shared/real.js';\n`, expectedShouldTrigger: false, description: "Valid NodeNext .js specifier resolving to ../shared/real.ts" },
  { id: "000-TN3", ruleId: "ASTESIA-000", category: "baseline72", relPath: "r000/tn3.ts", content: `import { idx } from '../shared';\n`, expectedShouldTrigger: false, description: "Valid directory import resolving to ../shared/index.ts" },
  { id: "000-EC1", ruleId: "ASTESIA-000", category: "baseline72", relPath: "r000/ec1_alias.ts", content: `import { ghostService } from '@/services/non-existent-service';\n`, expectedShouldTrigger: true, description: "Path alias import (@/services/...) to non-existent file" },
  { id: "000-EC2", ruleId: "ASTESIA-000", category: "baseline72", relPath: "r000/ec2_comment_and_dts.ts", content: `// Example of bad import: import './fake-module'\nimport type { OnlyDts } from '../shared/only-dts';\n`, expectedShouldTrigger: false, description: "Comment import + valid import of ../shared/only-dts.d.ts" },
  { id: "000-EC3", ruleId: "ASTESIA-000", category: "baseline72", relPath: "r000/ec3_svelte.svelte", content: `<script lang="ts">\nimport { missing } from './non-existent-component.svelte';\n</script>\n`, expectedShouldTrigger: true, description: "Hallucinated relative import inside .svelte" },

  // ASTESIA-001
  { id: "001-TP1", ruleId: "ASTESIA-001", category: "baseline72", relPath: "r001/tp1.controller.ts", content: `import { eq } from 'drizzle-orm';\n`, expectedShouldTrigger: true, description: "Controller importing drizzle-orm directly" },
  { id: "001-TP2", ruleId: "ASTESIA-001", category: "baseline72", relPath: "r001/routes/order.ts", content: `import { PrismaClient } from '@prisma/client';\n`, expectedShouldTrigger: true, description: "File inside routes/ importing @prisma/client" },
  { id: "001-TP3", ruleId: "ASTESIA-001", category: "baseline72", relPath: "r001/handlers/auth.ts", content: `const pg = require('pg');\n`, expectedShouldTrigger: true, description: "Handler requiring pg client directly" },
  { id: "001-TN1", ruleId: "ASTESIA-001", category: "baseline72", relPath: "r001/user.repository.ts", content: `import { eq } from 'drizzle-orm';\n`, expectedShouldTrigger: false, description: "Repository importing drizzle-orm" },
  { id: "001-TN2", ruleId: "ASTESIA-001", category: "baseline72", relPath: "r001/user.controller.test.ts", content: `import { eq } from 'drizzle-orm';\n`, expectedShouldTrigger: false, description: "Controller test file importing drizzle-orm" },
  { id: "001-TN3", ruleId: "ASTESIA-001", category: "baseline72", relPath: "r001/tn3.controller.ts", content: `import { real } from '../shared/real';\n`, expectedShouldTrigger: false, description: "Controller importing normal service module" },
  { id: "001-EC1", ruleId: "ASTESIA-001", category: "baseline72", relPath: "r001/ec1.routes.ts", content: `import { real as db } from '../shared/real';\n`, expectedShouldTrigger: true, description: "Controller importing local db connection as db" },
  { id: "001-EC2", ruleId: "ASTESIA-001", category: "baseline72", relPath: "r001/userController.ts", content: `import { eq } from 'drizzle-orm';\n`, expectedShouldTrigger: true, description: "camelCase filename userController.ts importing drizzle-orm" },
  { id: "001-EC3", ruleId: "ASTESIA-001", category: "baseline72", relPath: "r001/ec3.controller.ts", content: `const orm = await import('drizzle-orm');\nimport { Database } from 'bun:sqlite';\n`, expectedShouldTrigger: true, description: "Dynamic import('drizzle-orm') and bun:sqlite in controller" },

  // ASTESIA-002
  { id: "002-TP1", ruleId: "ASTESIA-002", category: "baseline72", relPath: "r002/tp1.ts", content: `const q = "SELECT * FROM users";\n`, expectedShouldTrigger: true, description: "Direct uppercase SELECT * in SQL string" },
  { id: "002-TP2", ruleId: "ASTESIA-002", category: "baseline72", relPath: "r002/tp2.py", content: `cursor.execute("SELECT   * FROM orders WHERE id = %s", (order_id,))\n`, expectedShouldTrigger: true, description: "Python raw SQL with multiple spaces in SELECT   *" },
  { id: "002-TP3", ruleId: "ASTESIA-002", category: "baseline72", relPath: "r002/tp3.go", content: `rows, err := db.Query("SELECT * FROM products")\n`, expectedShouldTrigger: true, description: "Go raw SQL SELECT *" },
  { id: "002-TN1", ruleId: "ASTESIA-002", category: "baseline72", relPath: "r002/tn1.ts", content: `const q = "SELECT id, email FROM users";\n`, expectedShouldTrigger: false, description: "Explicit column selection in SQL" },
  { id: "002-TN2", ruleId: "ASTESIA-002", category: "baseline72", relPath: "r002/migrations/001_init.ts", content: `const q = "SELECT * FROM schema_migrations";\n`, expectedShouldTrigger: false, description: "SELECT * inside migrations/ folder (excluded)" },
  { id: "002-TN3", ruleId: "ASTESIA-002", category: "baseline72", relPath: "r002/tn3.test.ts", content: `const q = "SELECT * FROM users";\n`, expectedShouldTrigger: false, description: "SELECT * inside .test.ts file (excluded)" },
  {
    id: "002-EC1",
    ruleId: "ASTESIA-002",
    category: "baseline72",
    relPath: "r002/ec1_lowercase_and_table_star.ts",
    content: `const q1 = "select * from users";\nconst q2 = "SELECT users.* FROM users";\n`,
    expectedShouldTrigger: true,
    expectedViolations: [
      { ruleId: "ASTESIA-002", line: 1 },
      { ruleId: "ASTESIA-002", line: 2 }
    ],
    description: "Lowercase 'select *' and table-qualified 'SELECT users.*' (both lines must trigger)"
  },
  { id: "002-EC2", ruleId: "ASTESIA-002", category: "baseline72", relPath: "r002/ec2_multiline.ts", content: "const q = `\n  SELECT\n    *\n  FROM users\n`;\n", expectedShouldTrigger: true, description: "Multi-line template literal with SELECT and * on separate lines" },
  { id: "002-EC3", ruleId: "ASTESIA-002", category: "baseline72", relPath: "r002/ec3_comment.ts", content: `// DBA Note: We explicitly avoid SELECT * here by choosing id, name.\nexport const cols = ['id', 'name'];\n`, expectedShouldTrigger: false, description: "Code comment explaining why SELECT * is avoided" },

  // ASTESIA-003
  { id: "003-TP1", ruleId: "ASTESIA-003", category: "baseline72", relPath: "r003/tp1.ts", content: `// astesia-debt: quick workaround for demo\n`, expectedShouldTrigger: true, description: "astesia-debt comment missing upgrade: clause" },
  { id: "003-TP2", ruleId: "ASTESIA-003", category: "baseline72", relPath: "r003/tp2.py", content: `# astesia-debt: hardcoded timeout\n`, expectedShouldTrigger: true, description: "Python astesia-debt comment without upgrade:" },
  { id: "003-TP3", ruleId: "ASTESIA-003", category: "baseline72", relPath: "r003/tp3.go", content: `// astesia-debt: upgrade later without colon\n`, expectedShouldTrigger: true, description: "astesia-debt with word 'upgrade' but no 'upgrade:' clause" },
  { id: "003-TN1", ruleId: "ASTESIA-003", category: "baseline72", relPath: "r003/tn1.ts", content: `// astesia-debt: in-memory cache for MVP, upgrade: move to Redis in Wave 3\n`, expectedShouldTrigger: false, description: "Properly formatted astesia-debt with reason and upgrade: clause" },
  { id: "003-TN2", ruleId: "ASTESIA-003", category: "baseline72", relPath: "r003/tn2.ts", content: `export const normalCode = 42;\n`, expectedShouldTrigger: false, description: "Normal file without debt markers" },
  { id: "003-TN3", ruleId: "ASTESIA-003", category: "baseline72", relPath: "r003/tn3.py", content: `# astesia-debt: sync I/O in worker, upgrade: switch to httpx.AsyncClient\n`, expectedShouldTrigger: false, description: "Valid Python astesia-debt marker" },
  { id: "003-EC1", ruleId: "ASTESIA-003", category: "baseline72", relPath: "r003/ec1_empty_clause.ts", content: `// astesia-debt: , upgrade: \n`, expectedShouldTrigger: true, description: "Empty reason and empty upgrade action" },
  { id: "003-EC2", ruleId: "ASTESIA-003", category: "baseline72", relPath: "r003/ec2_multiline_block.ts", content: `/*\n * astesia-debt: polling interval is fixed\n * upgrade: replace with WebSocket push\n */\n`, expectedShouldTrigger: false, description: "Multi-line block comment with upgrade: on subsequent line" },
  { id: "003-EC3", ruleId: "ASTESIA-008", category: "baseline72", relPath: "r003/ec3_todo_hack.ts", content: `// TODO: temporary hack workaround for race condition\n`, expectedShouldTrigger: true, description: "Untracked workaround comment (reclassified to ASTESIA-008)" },

  // ASTESIA-004
  { id: "004-TP1", ruleId: "ASTESIA-004", category: "baseline72", relPath: "r004/tp1.ts", content: `const apiKey = "sk_live_9876543210abcdef";\n`, expectedShouldTrigger: true, description: "Hardcoded apiKey string >= 12 chars" },
  { id: "004-TP2", ruleId: "ASTESIA-004", category: "baseline72", relPath: "r004/tp2.py", content: `JWT_SECRET = 'my_super_secret_signing_key_2026'\n`, expectedShouldTrigger: true, description: "Hardcoded Python JWT_SECRET" },
  { id: "004-TP3", ruleId: "ASTESIA-004", category: "baseline72", relPath: "r004/tp3.ts", content: `const cfg = { password: "PlaintextPassword1234" };\n`, expectedShouldTrigger: true, description: "Object property password with literal string" },
  { id: "004-TN1", ruleId: "ASTESIA-004", category: "baseline72", relPath: "r004/tn1.ts", content: `const apiKey = process.env.API_KEY;\n`, expectedShouldTrigger: false, description: "Reading secret from process.env" },
  { id: "004-TN2", ruleId: "ASTESIA-004", category: "baseline72", relPath: "r004/tn2.test.ts", content: `const apiKey = "test_only_fake_key_123456";\n`, expectedShouldTrigger: false, description: "Fake secret in .test.ts" },
  { id: "004-TN3", ruleId: "ASTESIA-004", category: "baseline72", relPath: "r004/tn3.ts", content: `const token = "short";\n`, expectedShouldTrigger: false, description: "Short non-secret identifier (< 12 chars)" },
  {
    id: "004-EC1",
    ruleId: "ASTESIA-004",
    category: "baseline72",
    relPath: "r004/ec1_env_fallback_and_backtick.ts",
    content: "const secret = process.env.JWT_SECRET ?? 'hardcoded_fallback_secret_12345';\nconst token = `ghp_1234567890abcdefghijklmnopqrstuv`;\n",
    expectedShouldTrigger: true,
    expectedViolations: [
      { ruleId: "ASTESIA-004", line: 1 },
      { ruleId: "ASTESIA-004", line: 2 }
    ],
    description: "Secret in nullish coalescing fallback and template literal (both lines must trigger)"
  },
  {
    id: "004-EC2",
    ruleId: "ASTESIA-004",
    category: "baseline72",
    relPath: "r004/ec2_jwt_and_special_chars.ts",
    content: `const token = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";\nconst password = "SuperSecret!Password#2026";\n`,
    expectedShouldTrigger: true,
    expectedViolations: [
      { ruleId: "ASTESIA-004", line: 1 },
      { ruleId: "ASTESIA-004", line: 2 }
    ],
    description: "Hardcoded JWT and password with special chars (both lines must trigger)"
  },
  { id: "004-EC3", ruleId: "ASTESIA-004", category: "baseline72", relPath: "r004/ec3_ui_label_false_positive.ts", content: `const formLabels = { password: "EnterYourNewPassword" };\nconst passwordField = "user_password_confirmation";\n`, expectedShouldTrigger: false, description: "Non-secret UI label and form field name" },

  // ASTESIA-005
  { id: "005-TP1", ruleId: "ASTESIA-005", category: "baseline72", relPath: "r005/tp1.ts", content: `export function parse(input: any): string { return String(input); }\n`, expectedShouldTrigger: true, description: "Parameter typed as : any" },
  { id: "005-TP2", ruleId: "ASTESIA-005", category: "baseline72", relPath: "r005/tp2.tsx", content: `const payload = ({} as any).foo;\n`, expectedShouldTrigger: true, description: "Type assertion as any in .tsx" },
  { id: "005-TP3", ruleId: "ASTESIA-005", category: "baseline72", relPath: "r005/tp3.ts", content: `const list: any[] = [];\n`, expectedShouldTrigger: true, description: "Array typed as : any[]" },
  { id: "005-TN1", ruleId: "ASTESIA-005", category: "baseline72", relPath: "r005/tn1.ts", content: `export function parse(input: unknown): string { return String(input); }\n`, expectedShouldTrigger: false, description: "Proper use of : unknown" },
  { id: "005-TN2", ruleId: "ASTESIA-005", category: "baseline72", relPath: "r005/tn2.d.ts", content: `export type LegacyCallback = (x: any) => any;\n`, expectedShouldTrigger: false, description: "Declaration file .d.ts" },
  { id: "005-TN3", ruleId: "ASTESIA-005", category: "baseline72", relPath: "r005/tn3.ts", content: `const company: string = "Tiffany";\n`, expectedShouldTrigger: false, description: "Word containing any suffix ('Tiffany')" },
  {
    id: "005-EC1",
    ruleId: "ASTESIA-005",
    category: "baseline72",
    relPath: "r005/ec1_generics_and_type_alias.ts",
    content: `type Anything = any;\nconst map: Record<string, any> = {};\nasync function f(): Promise<any> { return 1; }\n`,
    expectedShouldTrigger: true,
    expectedViolations: [
      { ruleId: "ASTESIA-005", line: 1 },
      { ruleId: "ASTESIA-005", line: 2 },
      { ruleId: "ASTESIA-005", line: 3 }
    ],
    description: "Explicit any in type alias, Record, Promise (all 3 lines must trigger)"
  },
  { id: "005-EC2", ruleId: "ASTESIA-005", category: "baseline72", relPath: "r005/ec2_comment_and_string.ts", content: `// Rule: as any developer knows, avoid shortcuts.\nconst msg = "Warning: any unsaved changes will be lost";\n`, expectedShouldTrigger: false, description: "English words as any in comment and string" },
  { id: "005-EC3", ruleId: "ASTESIA-005", category: "baseline72", relPath: "r005/ec3_svelte_lang_ts.svelte", content: `<script lang="ts">\n  let data: any = null;\n</script>\n`, expectedShouldTrigger: true, description: "Explicit : any inside Svelte <script lang='ts'>" },

  // ASTESIA-006
  { id: "006-TP1", ruleId: "ASTESIA-006", category: "baseline72", relPath: "r006/tp1.ts", content: `console.log("debug user", userId);\n`, expectedShouldTrigger: true, description: "Direct console.log() in TS source" },
  { id: "006-TP2", ruleId: "ASTESIA-006", category: "baseline72", relPath: "r006/tp2.js", content: `  console.log(result);\n`, expectedShouldTrigger: true, description: "Indented console.log() in JS source" },
  { id: "006-TP3", ruleId: "ASTESIA-006", category: "baseline72", relPath: "r006/tp3.svelte", content: `<script>\nconsole.log("mounted");\n</script>\n`, expectedShouldTrigger: true, description: "console.log() in Svelte component" },
  { id: "006-TN1", ruleId: "ASTESIA-006", category: "baseline72", relPath: "r006/tn1.ts", content: `logger.info({ userId }, "user created");\n`, expectedShouldTrigger: false, description: "Structured logger.info()" },
  { id: "006-TN2", ruleId: "ASTESIA-006", category: "baseline72", relPath: "r006/scripts/seed.ts", content: `console.log("Seeding database...");\n`, expectedShouldTrigger: false, description: "console.log() in scripts/ dir" },
  { id: "006-TN3", ruleId: "ASTESIA-006", category: "baseline72", relPath: "r006/tn3.spec.ts", content: `console.log("test output");\n`, expectedShouldTrigger: false, description: "console.log() in .spec.ts" },
  {
    id: "006-EC1",
    ruleId: "ASTESIA-006",
    category: "baseline72",
    relPath: "r006/ec1_debug_info_debugger.ts",
    content: `console.debug("debug");\nconsole.info("info");\ndebugger;\n`,
    expectedShouldTrigger: true,
    expectedViolations: [
      { ruleId: "ASTESIA-006", line: 1 },
      { ruleId: "ASTESIA-006", line: 2 },
      { ruleId: "ASTESIA-006", line: 3 }
    ],
    description: "console.debug, console.info, and debugger; (all 3 lines must trigger)"
  },
  { id: "006-EC2", ruleId: "ASTESIA-006", category: "baseline72", relPath: "r006/ec2_comment.ts", content: `// Never use console.log(secret) in production\n`, expectedShouldTrigger: false, description: "Comment mentioning console.log()" },
  { id: "006-EC3", ruleId: "ASTESIA-006", category: "baseline72", relPath: "r006/ec3_optional_chain_or_space.ts", content: `console.log ("spaced");\nglobalThis.console?.log("optional");\n`, expectedShouldTrigger: true, description: "console.log with space and console?.log" },

  // ASTESIA-007
  { id: "007-TP1", ruleId: "ASTESIA-007", category: "baseline72", relPath: "r007/tp1.ts", content: `for (const id of ids) {\n  await db.select().from(users);\n}\n`, expectedShouldTrigger: true, description: "for-of loop with await db.select()" },
  { id: "007-TP2", ruleId: "ASTESIA-007", category: "baseline72", relPath: "r007/tp2.ts", content: `await Promise.all(ids.map(async (id) => {\n  return prisma.user.findFirst({ where: { id } });\n}));\n`, expectedShouldTrigger: true, description: ".map() with braces calling prisma" },
  { id: "007-TP3", ruleId: "ASTESIA-007", category: "baseline72", relPath: "r007/tp3.ts", content: `while (hasMore) {\n  const row = await repo.getNext();\n}\n`, expectedShouldTrigger: true, description: "while loop calling repo.getNext()" },
  { id: "007-TN1", ruleId: "ASTESIA-007", category: "baseline72", relPath: "r007/tn1.ts", content: `const rows = await db.select({ id: users.id }).from(users);\nfor (const r of rows) {\n  processRow(r);\n}\n`, expectedShouldTrigger: false, description: "Batch query before the loop" },
  { id: "007-TN2", ruleId: "ASTESIA-007", category: "baseline72", relPath: "r007/tn2.ts", content: `const names = users.map((u) => {\n  return u.name.trim();\n});\n`, expectedShouldTrigger: false, description: "Pure in-memory .map() with braces" },
  { id: "007-TN3", ruleId: "ASTESIA-007", category: "baseline72", relPath: "r007/tn3.test.ts", content: `for (const id of ids) {\n  await repo.create(id);\n}\n`, expectedShouldTrigger: false, description: "Loop DB call in .test.ts" },
  { id: "007-EC1", ruleId: "ASTESIA-007", category: "baseline72", relPath: "r007/ec1_braceless_map_then_query.ts", content: `const userIds = users.map((u) => u.id);\nconst orders = await db.query(userIds);\n`, expectedShouldTrigger: false, description: "Braceless .map() followed by batch query outside loop" },
  {
    id: "007-EC2a",
    ruleId: "ASTESIA-007",
    category: "baseline72",
    relPath: "r007/ec2a_camel_repo.ts",
    content: `for (const u of users) {\n  await userRepository.findById(u.id);\n}\n`,
    expectedShouldTrigger: true,
    expectedViolations: [
      { ruleId: "ASTESIA-007", line: 2 }
    ],
    description: "camelCase userRepository.findById() in loop (expected pass)"
  },
  {
    id: "007-EC2b",
    ruleId: "ASTESIA-007",
    category: "baseline72",
    relPath: "r007/ec2b_helper.ts",
    content: `for (const u of users) {\n  await fetchUserOrdersHelper(u.id);\n}\n`,
    expectedShouldTrigger: true,
    isKnownGap: true,
    gapReason: "Cross-function helper call fetchUserOrdersHelper inside loop cannot be statically resolved to database query without call-graph analysis",
    description: "Cross-function helper call in loop (documented known-gap)"
  },
  { id: "007-EC3", ruleId: "ASTESIA-007", category: "baseline72", relPath: "r007/ec3_python_go_loops.py", content: `for user_id in user_ids:\n    repo.get_user(user_id)\n`, expectedShouldTrigger: true, description: "Python for loop calling repo.get_user()" },

  // ================= 15 ORIGINAL REGRESSIONS =================
  { id: "REG-CRLF", ruleId: "ASTESIA-002", category: "regressions", relPath: "reg/crlf.ts", content: "const a = 1;\r\nconst q = 'SELECT * FROM users';\r\n", expectedShouldTrigger: true, description: "CRLF line endings" },
  { id: "REG-BOM", ruleId: "ASTESIA-002", category: "regressions", relPath: "reg/bom.ts", content: "\uFEFFconst q = 'SELECT * FROM users';\n", expectedShouldTrigger: true, description: "Source file with UTF-8 BOM" },
  { id: "REG-WINPATH", ruleId: "ASTESIA-001", category: "regressions", relPath: "controllers/nested/auth.handler.ts", content: "import { eq } from 'drizzle-orm';\n", expectedShouldTrigger: true, description: "Nested Windows-style controller/handler path" },
  { id: "REG-BLOCK-COMMENT", ruleId: "ASTESIA-003", category: "regressions", relPath: "reg/block_comment.ts", content: "/*\n * astesia-debt: polling interval is fixed\n * upgrade: replace with WebSocket push\n */\n", expectedShouldTrigger: false, description: "Multiline block comment with upgrade:" },
  { id: "REG-ALLOW-SHORT", ruleId: "ASTESIA-002", category: "regressions", relPath: "reg/allow_short.ts", content: "// astesia-allow: ASTESIA-002 -- short\nconst q = 'SELECT * FROM users';\n", expectedShouldTrigger: true, description: "Short (<15 char) reason must not suppress" },
  { id: "REG-ALLOW-STRING", ruleId: "ASTESIA-002", category: "regressions", relPath: "reg/allow_string.ts", content: "const s = '// astesia-allow: ASTESIA-002 -- valid fifteen character reason';\nconst q = 'SELECT * FROM users';\n", expectedShouldTrigger: true, description: "Allow inside string must not suppress" },
  { id: "REG-ALLOW-000", ruleId: "ASTESIA-000", category: "regressions", relPath: "reg/allow_000.ts", content: "// astesia-allow: ASTESIA-000 -- valid fifteen character reason\nimport { ghost } from './phantom-module';\n", expectedShouldTrigger: true, description: "Banned allow for ASTESIA-000" },
  { id: "REG-ALLOW-004", ruleId: "ASTESIA-004", category: "regressions", relPath: "reg/allow_004.ts", content: "// astesia-allow: ASTESIA-004 -- valid fifteen character reason\nconst apiKey = \"sk_live_9876543210abcdef\";\n", expectedShouldTrigger: true, description: "Banned allow for ASTESIA-004" },
  { id: "REG-MAP-NOBRACE", ruleId: "ASTESIA-007", category: "regressions", relPath: "reg/map_nobrace.ts", content: "const ids = items.map(x => x.id);\nconst batch = await db.query(ids);\n", expectedShouldTrigger: false, description: "Braceless map must not leak inLoop" },
  { id: "REG-008-TP", ruleId: "ASTESIA-008", category: "regressions", relPath: "reg/r008_tp.ts", content: "// FIXME: temporary workaround for database lock\n", expectedShouldTrigger: true, description: "ASTESIA-008 workaround comment" },
  { id: "REG-008-TN", ruleId: "ASTESIA-008", category: "regressions", relPath: "reg/r008_tn.ts", content: "// astesia-debt: temporary workaround for lock, upgrade: implement optimistic lock in Wave 2\n", expectedShouldTrigger: false, description: "ASTESIA-008 accompanied by astesia-debt" },
  { id: "REG-009-TP", ruleId: "ASTESIA-009", category: "regressions", relPath: "reg/r009_tp.ts", content: "setTimeout(() => { refresh(); }, 100);\n", expectedShouldTrigger: true, description: "ASTESIA-009 setTimeout outside test" },
  { id: "REG-009-TN", ruleId: "ASTESIA-009", category: "regressions", relPath: "utils/debounce.ts", content: "export function debounce(fn: Function) { setTimeout(fn, 50); }\n", expectedShouldTrigger: false, description: "ASTESIA-009 setTimeout in debounce" },
  { id: "REG-010-TP", ruleId: "ASTESIA-010", category: "regressions", relPath: "reg/docker-compose.yml", content: "services:\n  web:\n    environment:\n      - DB_PASSWORD=my_super_secret_password_123\n", expectedShouldTrigger: true, description: "ASTESIA-010 hardcoded secret in compose" },
  { id: "REG-010-TN", ruleId: "ASTESIA-010", category: "regressions", relPath: "reg/docker-compose.prod.yml", content: "services:\n  web:\n    environment:\n      - DB_PASSWORD=${DB_PASSWORD}\n", expectedShouldTrigger: false, description: "ASTESIA-010 env var reference in compose" },

  // ================= T1 TOKENIZER ADVERSARIAL CASES =================
  {
    id: "ADV-02-QUOTE-DOUBLE",
    ruleId: "ASTESIA-005",
    category: "adversarial",
    relPath: "adv/quote-double.ts",
    content: 'const quoteRegex = /"([^"]+)"/g;\nconst val: any = "real violation";\n',
    expectedShouldTrigger: true,
    expectedViolations: [{ ruleId: "ASTESIA-005", line: 2 }],
    description: "Regex literal with double quotes must not blind next line (ASTESIA-005)"
  },
  {
    id: "ADV-02-QUOTE-SINGLE",
    ruleId: "ASTESIA-005",
    category: "adversarial",
    relPath: "adv/quote-single.ts",
    content: "const singleRegex = /'([^']+)'/g;\nconst val: any = 'real violation';\n",
    expectedShouldTrigger: true,
    expectedViolations: [{ ruleId: "ASTESIA-005", line: 2 }],
    description: "Regex literal with single quotes must not blind next line (ASTESIA-005)"
  },
  {
    id: "ADV-02-SLASH-ESCAPED",
    ruleId: "ASTESIA-005",
    category: "adversarial",
    relPath: "adv/slash-escaped.ts",
    content: "const slashRegex = /\\/\\//;\nconst val: any = 'real violation';\n",
    expectedShouldTrigger: true,
    expectedViolations: [{ ruleId: "ASTESIA-005", line: 2 }],
    description: "Regex literal with escaped slashes must not enter line comment"
  },
  {
    id: "ADV-02-DIVISION",
    ruleId: "ASTESIA-005",
    category: "adversarial",
    relPath: "adv/division.ts",
    content: "const x = a / b / c;\nconst val: any = 'real violation';\n",
    expectedShouldTrigger: true,
    expectedViolations: [{ ruleId: "ASTESIA-005", line: 2 }],
    description: "Division operators on same line must not confuse regex or strings"
  },
  {
    id: "ADV-05-ESCAPES-LINE",
    ruleId: "ASTESIA-006",
    category: "adversarial",
    relPath: "adv/escapes-line.ts",
    content: "const c = \"multi\\\nline\\\nstring\";\nconsole.log(\"shifted line violation\");\n",
    expectedShouldTrigger: true,
    expectedViolations: [{ ruleId: "ASTESIA-006", line: 4 }],
    description: "Trailing backslash escape must preserve accurate line count (console.log on line 4)"
  },
  {
    id: "ADV-07-DESYNC-WARN",
    ruleId: "TOKENIZER_DESYNC",
    category: "adversarial",
    relPath: "adv/unclosed.ts",
    content: "const unclosed = `this template is never closed;\n",
    expectedShouldTrigger: true,
    description: "Unclosed literal at EOF must emit synthetic TOKENIZER_DESYNC warning"
  },
  {
    id: "ADV-07-DOUBLE-QUOTE",
    ruleId: "TOKENIZER_DESYNC",
    category: "adversarial",
    relPath: "adv/unclosed_double_quote.ts",
    content: 'const unclosed = "this string is unclosed;\nconst val: any = 1;\n',
    expectedShouldTrigger: false,
    description: "Single-line double-quoted string terminated at newline does not cause TOKENIZER_DESYNC"
  },
  {
    id: "ADV-PHP-MULTILINE",
    ruleId: "ASTESIA-002",
    category: "adversarial",
    relPath: "adv/sample.php",
    content: "<?php\n$msg = 'hello\nworld';\n$q = \"SELECT * FROM users\";\n",
    expectedShouldTrigger: true,
    description: "PHP multiline single-quoted string followed by SQL SELECT * violation"
  },
  {
    id: "ADV-HTML-ATTR-MULTILINE",
    ruleId: "ASTESIA-005",
    category: "adversarial",
    relPath: "adv/Component.svelte",
    content: "<div class=\"btn\n  btn-primary\">\n</div>\n<script lang=\"ts\">\n  let x: any = 1;\n</script>\n",
    expectedShouldTrigger: true,
    description: "Svelte markup multiline attribute followed by script with : any"
  },
  {
    id: "ADV-PY-TRIPLE-QUOTE",
    ruleId: "ASTESIA-002",
    category: "adversarial",
    relPath: "adv/query.py",
    content: "doc = \"\"\"multiline\npython\ndocstring\"\"\"\ncursor.execute('SELECT * FROM users')\n",
    expectedShouldTrigger: true,
    description: "Python triple quote docstring followed by SELECT *"
  },
  {
    id: "ADV-GO-RAW-STRING",
    ruleId: "ASTESIA-002",
    category: "adversarial",
    relPath: "adv/query.go",
    content: "package main\nvar doc = `multiline\ngo raw string`\nfunc f() { db.Query(\"SELECT * FROM users\") }\n",
    expectedShouldTrigger: true,
    description: "Go raw backtick string followed by SELECT *"
  },
  {
    id: "ADV-BACKTICK-IN-REGEX-GAP",
    ruleId: "ASTESIA-005",
    category: "adversarial",
    relPath: "adv/backtick-in-regex.ts",
    content: "const r = /`/;\nconst val: any = 1;\n",
    expectedShouldTrigger: true,
    description: "Adversarial closed-gap (gap -> pass): backtick inside regex literal"
  },

  // ================= T2 ASTESIA-004 SECURITY TEST CASES =================
  // SEC-01..15
  { id: "SEC-01", ruleId: "ASTESIA-004", category: "security", relPath: "sec/sec01.ts", content: 'const password = "correcthorsebatterystaple";\n', expectedShouldTrigger: true, description: "Diceware passphrase: pure alphabetic letters without digits" },
  { id: "SEC-02", ruleId: "ASTESIA-004", category: "security", relPath: "sec/sec02.ts", content: 'const apiKey = "abcdefghijklmnop";\n', expectedShouldTrigger: true, description: "API key: pure alphabetic letters (length 16)" },
  { id: "SEC-03", ruleId: "ASTESIA-004", category: "security", relPath: "sec/sec03.ts", content: 'const secret = "mysecretpassword";\n', expectedShouldTrigger: true, description: "Secret: pure alphabetic letters (length 16)" },
  { id: "SEC-04", ruleId: "ASTESIA-004", category: "security", relPath: "sec/sec04.ts", content: 'const token = "Sup3rSecret!Value";\n', expectedShouldTrigger: true, description: "Token with digits and symbol '!'" },
  { id: "SEC-05", ruleId: "ASTESIA-004", category: "security", relPath: "sec/sec05.ts", content: 'const token = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";\n', expectedShouldTrigger: true, description: "Real JWT token with dots" },
  { id: "SEC-06", ruleId: "ASTESIA-004", category: "security", relPath: "sec/sec06.ts", content: 'const secret = process.env.API_SECRET ?? "literal_panjang_12345";\n', expectedShouldTrigger: true, description: "process.env ?? fallback literal with digits" },
  { id: "SEC-07", ruleId: "ASTESIA-004", category: "security", relPath: "sec/sec07.ts", content: 'const token = `ghp_1234567890abcdefghijklmnopqrstuv`;\n', expectedShouldTrigger: true, description: "GitHub PAT in backticks" },
  { id: "SEC-08", ruleId: "ASTESIA-004", category: "security", relPath: "sec/sec08.ts", content: 'const labels = { password: "EnterYourNewPassword" };\n', expectedShouldTrigger: false, description: "UI label: PascalCase with >= 2 capital segments" },
  { id: "SEC-09", ruleId: "ASTESIA-004", category: "security", relPath: "sec/sec09.ts", content: 'const passwordField = "user_password_confirmation";\n', expectedShouldTrigger: false, description: "Form field name ending with Field" },
  { id: "SEC-10", ruleId: "ASTESIA-004", category: "security", relPath: "sec/sec10.ts", content: 'const passwordLabel = "Please enter your password";\n', expectedShouldTrigger: false, description: "Ending with Label and spaced string" },
  { id: "SEC-11", ruleId: "ASTESIA-004", category: "security", relPath: "sec/sec11.ts", content: 'const tokenType = "Bearer";\n', expectedShouldTrigger: false, description: "Short value + ending with Type" },
  { id: "SEC-12", ruleId: "ASTESIA-004", category: "security", relPath: "sec/sec12.ts", content: 'const msg = "Please enter your password";\n', expectedShouldTrigger: false, description: "Spaced user message" },
  { id: "SEC-13", ruleId: "ASTESIA-004", category: "security", relPath: "sec/sec13.ts", content: 'const apiKeyText = "sk_live_9876543210abcdef";\n', expectedShouldTrigger: true, description: "Real secret assigned to key ending with Text (apiKeyText)" },
  { id: "SEC-14", ruleId: "ASTESIA-004", category: "security", relPath: "sec/sec14.ts", content: 'const passwordField = "SuperSecretP@ssw0rd1234!";\n', expectedShouldTrigger: true, description: "Real password assigned to key ending with Field (passwordField)" },
  { id: "SEC-15", ruleId: "ASTESIA-004", category: "security", relPath: "sec/sec15.ts", content: 'const secretName = "sk_live_9876543210abcdef";\n', expectedShouldTrigger: true, description: "Real secret assigned to key ending with Name (secretName)" },

  // SEC-16..25 (10 New Security Cases)
  { id: "SEC-16", ruleId: "ASTESIA-004", category: "security", relPath: "sec/sec16.ts", content: 'const token = "xoxb-123456789012-1234567890123-4j3k2l1m";\n', expectedShouldTrigger: true, description: "Slack bot token xoxb-" },
  { id: "SEC-17", ruleId: "ASTESIA-004", category: "security", relPath: "sec/sec17.ts", content: 'const awsKey = "AKIAIOSFODNN7EXAMPLE";\n', expectedShouldTrigger: true, description: "AWS Access Key AKIA..." },
  { id: "SEC-18", ruleId: "ASTESIA-004", category: "security", relPath: "sec/sec18.ts", content: 'const tokenField = "sk_test_51Mz0123456789abcdef";\n', expectedShouldTrigger: true, description: "Stripe test key under key ending with Field" },
  { id: "SEC-19", ruleId: "ASTESIA-004", category: "security", relPath: "sec/sec19.ts", content: 'const passwordName = "sk_live_1234567890abcdef";\n', expectedShouldTrigger: true, description: "Stripe live key under key ending with Name" },
  { id: "SEC-20", ruleId: "ASTESIA-004", category: "security", relPath: "sec/sec20.ts", content: 'const passwordPlaceholder = "your-account-password";\n', expectedShouldTrigger: false, description: "Hyphenated UI placeholder under Placeholder" },
  { id: "SEC-21", ruleId: "ASTESIA-004", category: "security", relPath: "sec/sec21.ts", content: 'const tokenType = "Bearer-Token-Type";\n', expectedShouldTrigger: false, description: "Hyphenated identifier string ending in Type" },
  { id: "SEC-22", ruleId: "ASTESIA-004", category: "security", relPath: "sec/sec22.ts", content: 'const apiKeyLabel = "API Key:";\n', expectedShouldTrigger: false, description: "Short UI label with colon ending in Label" },
  {
    id: "SEC-23-GAP",
    ruleId: "ASTESIA-004",
    category: "security",
    relPath: "sec/sec23.ts",
    content: 'const passwordField = "my_secret_token_words";\n',
    expectedShouldTrigger: false,
    isKnownGap: true,
    gapReason: "Secret in snake_case lowercase under key ending with label/field/text/name passes heuristic",
    description: "Documented known-gap: snake_case lowercase secret under key ending in Field"
  },
  { id: "SEC-24", ruleId: "ASTESIA-004", category: "security", relPath: "sec/sec24.ts", content: 'const secret = "a1b2c3d4e5f6g7h8";\n', expectedShouldTrigger: true, description: "Alphanumeric secret without spaces" },
  { id: "SEC-25", ruleId: "ASTESIA-004", category: "security", relPath: "sec/sec25.ts", content: 'const authToken = "dXNlcm5hbWU6cGFzc3dvcmQ=";\n', expectedShouldTrigger: true, description: "Base64 credential string with =" },
  { id: "SEC-21-orig", ruleId: "ASTESIA-004", category: "security", relPath: "sec/sec21-orig.ts", content: 'const tokenType = "application/json";\n', expectedShouldTrigger: false, description: "Original SEC-21: MIME type under *Type key must not trigger" },
  { id: "SEC-25-orig", ruleId: "ASTESIA-004", category: "security", relPath: "sec/sec25-orig.ts", content: 'const authHeader = "Basic dXNlcm5hbWU6cGFzc3dvcmQ=";\n', expectedShouldTrigger: true, description: "Original SEC-25: Basic auth header credentials with space must trigger ASTESIA-004" },
  { id: "SEC-F1-STORAGE-KEY", ruleId: "ASTESIA-004", category: "security", relPath: "sec/sec_f1_storage.ts", content: 'const cache_key = "user_profile_cache_v1";\n', expectedShouldTrigger: false, description: "F1: cache_key is non-sensitive and must not trigger" },
  { id: "SEC-F1-AUTH-BEARER", ruleId: "ASTESIA-004", category: "security", relPath: "sec/sec_f1_bearer.ts", content: 'const authHeader = "Bearer eyJhbGciOiJIUzI1NiJ9";\n', expectedShouldTrigger: true, description: "F1: Bearer token in authHeader must trigger" },

  // ================= T4 BLOCK COMMENT ASTESIA-ALLOW =================
  {
    id: "ALLOW-BLOCK-VALID",
    ruleId: "ASTESIA-002",
    category: "new",
    relPath: "new/allow_block_valid.ts",
    content: "/*\n * astesia-allow: ASTESIA-002 -- valid fifteen character reason\n */\nconst q = 'SELECT * FROM users';\n",
    expectedShouldTrigger: false,
    description: "Valid astesia-allow inside block comment suppresses trailing code line"
  },
  {
    id: "ALLOW-BLOCK-BANNED",
    ruleId: "ASTESIA-000",
    category: "new",
    relPath: "new/allow_block_banned.ts",
    content: "/*\n * astesia-allow: ASTESIA-000 -- valid fifteen character reason\n */\nimport { ghost } from './phantom-module';\n",
    expectedShouldTrigger: true,
    description: "Banned ASTESIA-000 inside block comment must reject suppression and report violation"
  },
  {
    id: "ALLOW-BLOCK-SHORT",
    ruleId: "ASTESIA-002",
    category: "new",
    relPath: "new/allow_block_short.ts",
    content: "/*\n * astesia-allow: ASTESIA-002 -- short\n */\nconst q = 'SELECT * FROM users';\n",
    expectedShouldTrigger: true,
    description: "Short reason (< 15 chars) inside block comment must not suppress"
  },

  // ================= T5 ASTESIA-008 EXPANSIONS =================
  { id: "008-FOR-NOW", ruleId: "ASTESIA-008", category: "new", relPath: "new/for_now.ts", content: "// We use this implementation for now\nexport const x = 1;\n", expectedShouldTrigger: true, description: "ASTESIA-008: for now comment" },
  { id: "008-TEMP-FIX", ruleId: "ASTESIA-008", category: "new", relPath: "new/temp_fix.ts", content: "// temporary fix for deadlock\nexport const y = 2;\n", expectedShouldTrigger: true, description: "ASTESIA-008: temporary fix comment" },
  { id: "008-NEG-HACKATHON", ruleId: "ASTESIA-008", category: "new", relPath: "new/hackathon.ts", content: "// Created during company hackathon event\nexport const z = 3;\n", expectedShouldTrigger: false, description: "ASTESIA-008 negative: hackathon must not trigger" },
  { id: "008-NEG-SHACK", ruleId: "ASTESIA-008", category: "new", relPath: "new/shack.ts", content: "// Radio shack controller\nexport const a = 4;\n", expectedShouldTrigger: false, description: "ASTESIA-008 negative: shack must not trigger" },
  { id: "008-NEG-TEMP-DIR", ruleId: "ASTESIA-008", category: "new", relPath: "new/temp_dir.ts", content: "// Temporary directory helper for cleanup\nexport const b = 5;\n", expectedShouldTrigger: false, description: "ASTESIA-008 negative: Temporary directory helper must not trigger" },

  // ================= REAL WORLD & CONFIG PROFILE TEST CASES =================
  { id: "RW-THEME-KEY", ruleId: "ASTESIA-004", category: "new", relPath: "new/theme_key.ts", content: 'export const THEME_STORAGE_KEY = "terminal_portfolio_theme";\n', expectedShouldTrigger: false, description: "Real-world terminal-portfolio THEME_STORAGE_KEY must not trigger ASTESIA-004" },
  { id: "RW-DOCKERFILE", ruleId: "TOKENIZER_DESYNC", category: "new", relPath: "new/Dockerfile", content: 'RUN set -eux; \\\n    apt-get update; \\\n    echo "test \'$var\' \\"done\\"";\n', expectedShouldTrigger: false, description: "Real-world Dockerfile multiline command must not desync tokenizer" },
  { id: "CFG-DOCKER-COMMENT", ruleId: "TOKENIZER_DESYNC", category: "new", relPath: "new/Dockerfile.test", content: '# Dockerfile comment\nFROM alpine:latest\n# Second comment\n', expectedShouldTrigger: false, description: "Dockerfile comments handled by config profile" },
  { id: "CFG-YAML-MULTILINE", ruleId: "TOKENIZER_DESYNC", category: "new", relPath: "new/config.yml", content: 'key: "value"\n# comment\nanother: \'quoted string\'\n', expectedShouldTrigger: false, description: "YAML config file handled by config profile" },
  { id: "CFG-ENV-COMMENTS", ruleId: "TOKENIZER_DESYNC", category: "new", relPath: "new/.env.test", content: '# Env comment\nFOO=bar\n# Baz comment\n', expectedShouldTrigger: false, description: "Env file comments handled by config profile" }
];

testCases.push(...independentCases);

// Write all fixtures to disk
for (const tc of testCases) {
  const full = join(FIXTURES_DIR, tc.relPath);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, tc.content, "utf8");
}

const isJsonMode = process.argv.includes("--json");

if (!isJsonMode) {
  console.log("=== ASTESIA ENFORCEMENT TEST RUNNER ===");
  console.log(`Running Gate: ${GATE_PATH}`);
  console.log(`Rules: ${RULES_PATH}`);
  console.log(`Fixtures: ${testCases.length} cases\n`);
}

const res = spawnSync("bun", [GATE_PATH, "--root", FIXTURES_DIR, "--rules", RULES_PATH, "--json"], {
  encoding: "utf8",
  maxBuffer: 30 * 1024 * 1024
});

let parsedOutput: {
  errors?: number;
  warnings?: number;
  suppressions?: number;
  rejected_suppressions?: number;
  debt_markers?: number;
  desync_files?: string[];
  files_scanned?: { total: number; by_extension: Record<string, number> };
  violations?: Array<{ ruleId: string; file: string; line: number; message: string }>;
} = {};

try {
  parsedOutput = JSON.parse(res.stdout);
} catch (err) {
  if (!isJsonMode) {
    console.error("Failed to parse gate stdout as JSON:", res.stdout, res.stderr);
  }
}

const violations = parsedOutput.violations || [];
const desyncFiles = new Set(parsedOutput.desync_files || []);

interface CategoryStats {
  total: number;
  passed: number;
  failed: number;
  known_gaps: number;
}

const categoryStats: Record<string, CategoryStats> = {
  baseline72: { total: 0, passed: 0, failed: 0, known_gaps: 0 },
  regressions: { total: 0, passed: 0, failed: 0, known_gaps: 0 },
  adversarial: { total: 0, passed: 0, failed: 0, known_gaps: 0 },
  security: { total: 0, passed: 0, failed: 0, known_gaps: 0 },
  new: { total: 0, passed: 0, failed: 0, known_gaps: 0 },
  independent: { total: 0, passed: 0, failed: 0, known_gaps: 0 },
  baseline: { total: 0, passed: 0, failed: 0, known_gaps: 0 },
  rules_diff: { total: 0, passed: 0, failed: 0, known_gaps: 0 },
  ci_guard: { total: 0, passed: 0, failed: 0, known_gaps: 0 },
  fuzz_truth: { total: 0, passed: 0, failed: 0, known_gaps: 0 },
  allowlist: { total: 0, passed: 0, failed: 0, known_gaps: 0 },
  env_git: { total: 0, passed: 0, failed: 0, known_gaps: 0 },
  profile_dispatch: { total: 0, passed: 0, failed: 0, known_gaps: 0 },
  key_contract: { total: 0, passed: 0, failed: 0, known_gaps: 0 },
  config_secrets: { total: 0, passed: 0, failed: 0, known_gaps: 0 },
  rule010_scope: { total: 0, passed: 0, failed: 0, known_gaps: 0 }
};

const knownGapList: Array<{ id: string; ruleId: string; file: string; line?: number; reason: string }> = [];
const failedCases: Array<{ id: string; category: string; reason: string }> = [];

for (const tc of testCases) {
  const cat = categoryStats[tc.category] || (categoryStats[tc.category] = { total: 0, passed: 0, failed: 0, known_gaps: 0 });
  cat.total++;

  // Handle synthetic TOKENIZER_DESYNC rule check
  let matched: Array<{ ruleId: string; file: string; line: number; message: string }>;
  if (tc.ruleId === "TOKENIZER_DESYNC") {
    const isDesynced = desyncFiles.has(tc.relPath) || violations.some((v) => v.file === tc.relPath && v.ruleId === "TOKENIZER_DESYNC");
    matched = isDesynced ? [{ ruleId: "TOKENIZER_DESYNC", file: tc.relPath, line: 1, message: "desync" }] : [];
  } else {
    matched = violations.filter((v) => v.file === tc.relPath && v.ruleId === tc.ruleId);
  }

  const didTrigger = matched.length > 0;

  // Check if case is known-gap at testcase level
  if (tc.isKnownGap) {
    cat.known_gaps++;
    knownGapList.push({ id: tc.id, ruleId: tc.ruleId, file: tc.relPath, reason: tc.gapReason || "" });
    if (!isJsonMode) {
      console.log(`[KNOWN-GAP] ${tc.id}: ${tc.description} -> Reason: ${tc.gapReason}`);
    }
    continue;
  }

  // Multi-violation expectation checks (T7)
  if (tc.expectedViolations && tc.expectedViolations.length > 0) {
    let allViolationsMatch = true;
    for (const exp of tc.expectedViolations) {
      if (exp.isKnownGap) {
        cat.known_gaps++;
        knownGapList.push({ id: `${tc.id}:L${exp.line}`, ruleId: exp.ruleId, file: tc.relPath, line: exp.line, reason: exp.gapReason || "" });
        continue;
      }
      const matchOnLine = matched.some((v) => v.line === exp.line && v.ruleId === exp.ruleId);
      if (!matchOnLine) {
        allViolationsMatch = false;
        failedCases.push({ id: `${tc.id}:L${exp.line}`, category: tc.category, reason: `Expected violation for ${exp.ruleId} on line ${exp.line}` });
      }
    }
    if (allViolationsMatch) {
      cat.passed++;
    } else {
      cat.failed++;
    }
    continue;
  }

  // Single violation check
  const passed = didTrigger === tc.expectedShouldTrigger;
  if (passed) {
    cat.passed++;
  } else {
    cat.failed++;
    failedCases.push({
      id: tc.id,
      category: tc.category,
      reason: `Expected triggered=${tc.expectedShouldTrigger}, but got ${didTrigger}`
    });
    if (!isJsonMode) {
      console.log(`[FAIL] ${tc.id} (${tc.category}): triggered=${didTrigger}, expected=${tc.expectedShouldTrigger} | ${tc.description}`);
    }
  }
}

// ================= CLI RESILIENCE TESTS =================
const cliDir = join(TEST_DIR, "cli-tests");
mkdirSync(cliDir, { recursive: true });
writeFileSync(join(cliDir, "warn.ts"), "console.log('warn');\n", "utf8");

const desyncDir = join(TEST_DIR, "cli-desync");
mkdirSync(desyncDir, { recursive: true });
writeFileSync(join(desyncDir, "unclosed.ts"), "const bad = `unclosed;\n", "utf8");

function runCLI(args: string[]) {
  const r = spawnSync("bun", [GATE_PATH, ...args], { encoding: "utf8" });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

const nonExistentDir = join(TEST_DIR, "non-existent-directory-path-xyz");
const cliNonExistent = runCLI(["--root", nonExistentDir, "--rules", RULES_PATH]);
const cliNonExistentPass = cliNonExistent.status === 2 && cliNonExistent.stderr.includes("[TOOL_FAILED:");

const cliDesyncMaxWarn0 = runCLI(["--root", desyncDir, "--rules", RULES_PATH, "--max-warn=0"]);
const cliDesyncPass = cliDesyncMaxWarn0.status === 1;

const c1 = runCLI(["--root", cliDir, "--rules", RULES_PATH, "--max-warn=0"]).status === 1;
const c2 = runCLI(["--root", cliDir, "--rules", RULES_PATH, "--max-warn", "abc"]).status === 2;
const c3 = runCLI(["--root", cliDir, "--rules", RULES_PATH, "--max-warn"]).status === 2;
const c4 = runCLI(["--root", cliDir, "--rules", RULES_PATH, "--max-warn", "-1"]).status === 2;

const cliTotal = 6;
const cliPassed = [cliNonExistentPass, cliDesyncPass, c1, c2, c3, c4].filter(Boolean).length;
const cliFailed = cliTotal - cliPassed;

// ================= SEEDED PROPERTY FUZZING (T7) =================
function mulberry32(seed: number) {
  return function() {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED = 1337;
const rng = mulberry32(SEED);

const preprocessFn = preprocessSource;

const extensions = [".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".php", ".svelte", ".vue"];
const snippetPool = [
  'const a = "hello world";\n',
  "let b = 'single quote string';\n",
  "const c = `multiline\ntemplate\nliteral`;\n",
  '// single line comment\n',
  '/* block comment on one line */\n',
  '/*\n * multiline block comment\n */\n',
  '# python comment\n',
  '"""python docstring\nmultiline"""\n',
  'const regex = /"([a-z]+)"/g;\n',
  'const division = x / y / z;\n',
  'const escaped = "line 1\\\nline 2\\\nline 3";\n',
  '<script lang="ts">\nlet count: any = 0;\n</script>\n',
  '<div class="header\n  footer">\n</div>\n',
  '<?php $str = "multiline\nphp string"; ?>\n'
];

let propertyInvariantPassed = true;
let propertyInvariantErrors: string[] = [];

for (let i = 0; i < 2000; i++) {
  const ext = extensions[Math.floor(rng() * extensions.length)];
  const filename = `fuzz_${i}${ext}`;
  const numSnippets = 1 + Math.floor(rng() * 5);
  let content = "";
  for (let s = 0; s < numSnippets; s++) {
    content += snippetPool[Math.floor(rng() * snippetPool.length)];
  }

  // Random CRLF insertion
  if (rng() > 0.5) {
    content = content.replace(/\n/g, "\r\n");
  }

  try {
    const prep = preprocessFn(content, filename);
    const norm = content.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const rawLines = norm.split("\n");

    if (
      prep.rawLines.length !== rawLines.length ||
      prep.codeLines.length !== rawLines.length ||
      prep.codeNoStringsLines.length !== rawLines.length ||
      prep.commentLines.length !== rawLines.length
    ) {
      propertyInvariantPassed = false;
      propertyInvariantErrors.push(`File ${filename}: Line count mismatch (raw: ${rawLines.length}, code: ${prep.codeLines.length})`);
      break;
    }

    for (let l = 0; l < rawLines.length; l++) {
      const expLen = rawLines[l].length;
      if (
        prep.codeLines[l].length !== expLen ||
        prep.codeNoStringsLines[l].length !== expLen ||
        prep.commentLines[l].length !== expLen
      ) {
        propertyInvariantPassed = false;
        propertyInvariantErrors.push(`File ${filename} line ${l + 1}: length mismatch (exp: ${expLen}, got code: ${prep.codeLines[l].length})`);
        break;
      }
    }
    if (!propertyInvariantPassed) break;
  } catch (err: any) {
    propertyInvariantPassed = false;
    propertyInvariantErrors.push(`File ${filename} threw exception: ${err.message}`);
    break;
  }
}

// ================= BASELINE RATCHET SUITE (B1: 25 Scenarios) =================
const baselineTmpDir = join(TEST_DIR, "suite-baseline");
const baselineRes = runBaselineSuite(GATE_PATH, RULES_PATH, baselineTmpDir);
categoryStats.baseline.total = baselineRes.total;
categoryStats.baseline.passed = baselineRes.passed;
categoryStats.baseline.failed = baselineRes.failed;
for (const sc of baselineRes.results) {
  if (!sc.passed) {
    failedCases.push({ id: sc.id, category: "baseline", reason: sc.message || "Scenario failed" });
  }
}

// ================= RULES DIFF SUITE (B2: 10 Scenarios) =================
const rulesDiffTmpDir = join(TEST_DIR, "suite-rules-diff");
const rulesDiffRes = runRulesDiffSuite(GATE_PATH, rulesDiffTmpDir);
categoryStats.rules_diff.total = rulesDiffRes.total;
categoryStats.rules_diff.passed = rulesDiffRes.passed;
categoryStats.rules_diff.failed = rulesDiffRes.failed;
for (const sc of rulesDiffRes.results) {
  if (!sc.passed) {
    failedCases.push({ id: sc.id, category: "rules_diff", reason: sc.message || "Scenario failed" });
  }
}

// ================= CI WORKFLOW GUARD SUITE (B4: Authentic + 8 Mutations) =================
const guardRes = runWorkflowGuardSuite();
categoryStats.ci_guard.total = 1 + guardRes.mutationResults.length;
const guardPassedMutations = guardRes.mutationResults.filter((m) => m.failedAsExpected).length;
categoryStats.ci_guard.passed = (guardRes.passed ? 1 : 0) + guardPassedMutations;
categoryStats.ci_guard.failed = categoryStats.ci_guard.total - categoryStats.ci_guard.passed;
if (!guardRes.passed) {
  failedCases.push({ id: "workflow-guard", category: "ci_guard", reason: "Workflow guard failed on authentic or mutations" });
}

// ================= GROUND TRUTH FUZZING (C6: Seeds 7001, 7002, 7003, 7101, 7102 & 7103, 2,000 files each) =================
const fuzzSeeds = [7001, 7002, 7003, 7101, 7102, 7103];
categoryStats.fuzz_truth.total = fuzzSeeds.length;
categoryStats.fuzz_truth.passed = 0;
for (const fSeed of fuzzSeeds) {
  const fDir = join(TEST_DIR, `fuzz-${fSeed}-ce`);
  const fRes = runGroundTruthFuzz(fSeed, 2000, fDir);
  if (fRes.passed) {
    categoryStats.fuzz_truth.passed++;
  } else {
    failedCases.push({ id: `fuzz-${fSeed}`, category: "fuzz_truth", reason: fRes.errors.slice(0, 3).join("; ") });
  }
}
categoryStats.fuzz_truth.failed = categoryStats.fuzz_truth.total - categoryStats.fuzz_truth.passed;

// ================= ALLOWLIST SUITE (F3: 15 Scenarios) =================
const allowlistTmpDir = join(TEST_DIR, "suite-allowlist");
const allowlistRes = runAllowlistSuite(GATE_PATH, allowlistTmpDir);
categoryStats.allowlist.total = allowlistRes.total;
categoryStats.allowlist.passed = allowlistRes.passed;
categoryStats.allowlist.failed = allowlistRes.failed;
for (const sc of allowlistRes.results) {
  if (!sc.passed) {
    failedCases.push({ id: sc.id, category: "allowlist", reason: sc.error || `Expected exit ${sc.expectedExit}, got ${sc.actualExit}` });
  }
}

// ================= ENV GIT SUITE (F4: 5 Scenarios) =================
const envGitTmpDir = join(TEST_DIR, "suite-env-git");
const envGitRes = runEnvGitSuite(GATE_PATH, envGitTmpDir);
categoryStats.env_git.total = envGitRes.total;
categoryStats.env_git.passed = envGitRes.passed;
categoryStats.env_git.failed = envGitRes.failed;
for (const sc of envGitRes.results) {
  if (!sc.passed) {
    failedCases.push({ id: sc.id, category: "env_git", reason: `Expected skipped ${sc.expectedSkipped}, got ${sc.actualSkipped}` });
  }
}

// ================= PROFILE DISPATCH SUITE (T1: 11 Scenarios) =================
const profileDispatchTmpDir = join(TEST_DIR, "suite-profile-dispatch");
const profileDispatchRes = runProfileDispatchSuite(GATE_PATH, RULES_PATH, profileDispatchTmpDir);
categoryStats.profile_dispatch.total = profileDispatchRes.total;
categoryStats.profile_dispatch.passed = profileDispatchRes.passed;
categoryStats.profile_dispatch.failed = profileDispatchRes.failed;
for (const err of profileDispatchRes.errors) {
  failedCases.push({ id: "profile-dispatch", category: "profile_dispatch", reason: err });
}

// ================= KEY CONTRACT SUITE (T2: 17 Scenarios) =================
const keyContractTmpDir = join(TEST_DIR, "suite-key-contract");
const keyContractRes = runKeyContractSuite(GATE_PATH, RULES_PATH, keyContractTmpDir);
categoryStats.key_contract.total = keyContractRes.total;
categoryStats.key_contract.passed = keyContractRes.passed;
categoryStats.key_contract.failed = keyContractRes.failed;
for (const err of keyContractRes.errors) {
  failedCases.push({ id: "key-contract", category: "key_contract", reason: err });
}

// ================= CONFIG SECRETS SUITE (T3: 26 Scenarios) =================
const configSecretsTmpDir = join(TEST_DIR, "suite-config-secrets");
const configSecretsRes = runConfigSecretsSuite(GATE_PATH, RULES_PATH, configSecretsTmpDir);
categoryStats.config_secrets.total = configSecretsRes.total;
categoryStats.config_secrets.passed = configSecretsRes.passed;
categoryStats.config_secrets.failed = configSecretsRes.failed;
for (const err of configSecretsRes.errors) {
  failedCases.push({ id: "config-secrets", category: "config_secrets", reason: err });
}

// ================= RULE 010 SCOPE SUITE (T4: 17 Scenarios) =================
const rule010ScopeTmpDir = join(TEST_DIR, "suite-rule010-scope");
const rule010ScopeRes = runRule010ScopeSuite(GATE_PATH, RULES_PATH, rule010ScopeTmpDir);
categoryStats.rule010_scope.total = rule010ScopeRes.total;
categoryStats.rule010_scope.passed = rule010ScopeRes.passed;
categoryStats.rule010_scope.failed = rule010ScopeRes.failed;
for (const err of rule010ScopeRes.errors) {
  failedCases.push({ id: "rule010-scope", category: "rule010_scope", reason: err });
}

// ================= BIDIRECTIONAL KNOWN-GAPS VALIDATION =================
const knownGapsRegistryPath = join(__dirname, "known-gaps.json");
const registryContent = JSON.parse(readFileSync(knownGapsRegistryPath, "utf8")) as Array<{
  id: string;
  rule: string;
  fixture: string;
  reason: string;
}>;

const registryIds = new Set(registryContent.map((k) => k.id));
const executionIds = new Set(knownGapList.map((k) => k.id));

for (const reg of registryContent) {
  if (!executionIds.has(reg.id)) {
    console.error(`FATAL: known-gaps.json entry '${reg.id}' was NOT executed in harness!`);
    process.exit(2);
  }
}
for (const exec of knownGapList) {
  if (!registryIds.has(exec.id)) {
    console.error(`FATAL: executed known gap '${exec.id}' is NOT registered in known-gaps.json!`);
    process.exit(2);
  }
}

// Invariant assertions: total === passed + failed + known_gaps
for (const [k, v] of Object.entries(categoryStats)) {
  if (v.total !== v.passed + v.failed + v.known_gaps) {
    console.error(`FATAL: Invariant violated in category '${k}': total (${v.total}) !== passed (${v.passed}) + failed (${v.failed}) + known_gaps (${v.known_gaps})`);
    process.exit(2);
  }
}

// Clean up fixtures from disk so repo stays clean (best effort on Windows)
try {
  rmSync(TEST_DIR, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
} catch {}

// Build Total Stats
const totalStats = {
  total: 0,
  passed: 0,
  failed: 0,
  known_gaps: 0
};

for (const k of Object.keys(categoryStats)) {
  totalStats.total += categoryStats[k].total;
  totalStats.passed += categoryStats[k].passed;
  totalStats.failed += categoryStats[k].failed;
  totalStats.known_gaps += categoryStats[k].known_gaps;
}

if (totalStats.total !== totalStats.passed + totalStats.failed + totalStats.known_gaps) {
  console.error(`FATAL: Invariant violated in totalStats: total (${totalStats.total}) !== passed (${totalStats.passed}) + failed (${totalStats.failed}) + known_gaps (${totalStats.known_gaps})`);
  process.exit(2);
}

const summaryJson = {
  summary: {
    total: totalStats.total,
    passed: totalStats.passed,
    failed: totalStats.failed,
    known_gaps: totalStats.known_gaps,
    by_category: categoryStats
  },
  known_gaps: knownGapList,
  failed_cases: failedCases,
  cli_tests: {
    total: cliTotal,
    passed: cliPassed,
    failed: cliFailed,
    non_existent_root_exit_2: cliNonExistentPass,
    desync_max_warn_0_exit_1: cliDesyncPass
  },
  property_test: {
    seed: SEED,
    files_tested: 2000,
    invariant_passed: propertyInvariantPassed,
    errors: propertyInvariantErrors
  }
};

if (isJsonMode) {
  console.log(JSON.stringify(summaryJson, null, 2));
} else {
  console.log("\n--- TEST MATRIX SUMMARY ---");
  for (const [k, v] of Object.entries(categoryStats)) {
    console.log(`Category '${k}': ${v.passed}/${v.total} passed (${v.failed} failed, ${v.known_gaps} known-gaps)`);
  }
  console.log(`TOTAL: ${totalStats.passed}/${totalStats.total} passed (${totalStats.failed} failed, ${totalStats.known_gaps} known-gaps)`);

  console.log("\n--- DOCUMENTED KNOWN GAPS ---");
  for (const kg of knownGapList) {
    console.log(`- [${kg.id}] ${kg.ruleId} (${kg.file}): ${kg.reason}`);
  }

  console.log("\n--- CLI RESILIENCE TESTS ---");
  console.log(`CLI Non-existent --root (exit 2): ${cliNonExistentPass ? "PASS" : "FAIL"}`);
  console.log(`CLI Desync with --max-warn=0 (exit 1): ${cliDesyncPass ? "PASS" : "FAIL"}`);
  console.log(`CLI --max-warn=0: ${c1 ? "PASS" : "FAIL"}`);
  console.log(`CLI --max-warn abc: ${c2 ? "PASS" : "FAIL"}`);
  console.log(`CLI --max-warn (empty): ${c3 ? "PASS" : "FAIL"}`);
  console.log(`CLI --max-warn -1: ${c4 ? "PASS" : "FAIL"}`);

  console.log("\n--- PROPERTY TEST (FUZZ 2,000 FILES) ---");
  console.log(`Seed: ${SEED}, Files: 2000, Invariant Passed: ${propertyInvariantPassed}`);
  if (!propertyInvariantPassed) {
    console.log("Property Errors:", propertyInvariantErrors);
  }

  console.log("\nTest fixtures cleaned up. Harness completed.");
}

process.exit(totalStats.failed === 0 && cliFailed === 0 && propertyInvariantPassed ? 0 : 1);
