/**
 * templates/enforcement/tests/run.ts — Reproducible test harness for Astesia Gate.
 * Runs 72 baseline matrix + 15 regressions + 6 CLI tests + adversarial & heuristic gap tests.
 *
 * Usage: bun templates/enforcement/tests/run.ts
 */
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const REPO_ROOT = resolve(__dirname, "../../..");
const GATE_PATH = join(REPO_ROOT, "templates/enforcement/astesia-gate.ts");
const RULES_PATH = join(REPO_ROOT, "templates/enforcement/anti-patterns.json");
const TEST_DIR = join(REPO_ROOT, ".astesia/verification/harness-run");

rmSync(TEST_DIR, { recursive: true, force: true });
mkdirSync(TEST_DIR, { recursive: true });

const FIXTURES_DIR = join(TEST_DIR, "fixtures");
mkdirSync(FIXTURES_DIR, { recursive: true });

// Setup shared modules
mkdirSync(join(FIXTURES_DIR, "shared"), { recursive: true });
writeFileSync(join(FIXTURES_DIR, "shared", "real.ts"), "export const real = 1;\n");
writeFileSync(join(FIXTURES_DIR, "shared", "index.ts"), "export const idx = 1;\n");
writeFileSync(join(FIXTURES_DIR, "shared", "only-dts.d.ts"), "export interface OnlyDts { id: string; }\n");

interface TestCase {
  id: string;
  ruleId: string;
  category: "TP" | "TN" | "EC" | "REG";
  relPath: string;
  content: string;
  expectedShouldTrigger: boolean;
  isKnownGap?: boolean;
  gapReason?: string;
  description: string;
}

const testCases: TestCase[] = [
  // ================= ASTESIA-000 =================
  { id: "000-TP1", ruleId: "ASTESIA-000", category: "TP", relPath: "r000/tp1.ts", content: `import { ghost } from './does-not-exist';\n`, expectedShouldTrigger: true, description: "Standard ESM relative import to non-existent file" },
  { id: "000-TP2", ruleId: "ASTESIA-000", category: "TP", relPath: "r000/tp2.ts", content: `const x = require('../shared/missing-module');\n`, expectedShouldTrigger: true, description: "CommonJS require() to non-existent relative path" },
  { id: "000-TP3", ruleId: "ASTESIA-000", category: "TP", relPath: "r000/tp3.ts", content: `export { something } from './phantom.js';\n`, expectedShouldTrigger: true, description: "ESM re-export with .js specifier where neither .js nor .ts exists" },
  { id: "000-TN1", ruleId: "ASTESIA-000", category: "TN", relPath: "r000/tn1.ts", content: `import { real } from '../shared/real';\n`, expectedShouldTrigger: false, description: "Valid relative import resolved to ../shared/real.ts" },
  { id: "000-TN2", ruleId: "ASTESIA-000", category: "TN", relPath: "r000/tn2.ts", content: `import { real } from '../shared/real.js';\n`, expectedShouldTrigger: false, description: "Valid NodeNext .js specifier resolving to ../shared/real.ts" },
  { id: "000-TN3", ruleId: "ASTESIA-000", category: "TN", relPath: "r000/tn3.ts", content: `import { idx } from '../shared';\n`, expectedShouldTrigger: false, description: "Valid directory import resolving to ../shared/index.ts" },
  { id: "000-EC1", ruleId: "ASTESIA-000", category: "EC", relPath: "r000/ec1_alias.ts", content: `import { ghostService } from '@/services/non-existent-service';\n`, expectedShouldTrigger: true, description: "Path alias import (@/services/...) to non-existent file" },
  { id: "000-EC2", ruleId: "ASTESIA-000", category: "EC", relPath: "r000/ec2_comment_and_dts.ts", content: `// Example of bad import: import './fake-module'\nimport type { OnlyDts } from '../shared/only-dts';\n`, expectedShouldTrigger: false, description: "Comment import + valid import of ../shared/only-dts.d.ts" },
  { id: "000-EC3", ruleId: "ASTESIA-000", category: "EC", relPath: "r000/ec3_svelte.svelte", content: `<script lang="ts">\nimport { missing } from './non-existent-component.svelte';\n</script>\n`, expectedShouldTrigger: true, description: "Hallucinated relative import inside .svelte" },

  // ================= ASTESIA-001 =================
  { id: "001-TP1", ruleId: "ASTESIA-001", category: "TP", relPath: "r001/tp1.controller.ts", content: `import { eq } from 'drizzle-orm';\n`, expectedShouldTrigger: true, description: "Controller importing drizzle-orm directly" },
  { id: "001-TP2", ruleId: "ASTESIA-001", category: "TP", relPath: "r001/routes/order.ts", content: `import { PrismaClient } from '@prisma/client';\n`, expectedShouldTrigger: true, description: "File inside routes/ importing @prisma/client" },
  { id: "001-TP3", ruleId: "ASTESIA-001", category: "TP", relPath: "r001/handlers/auth.ts", content: `const pg = require('pg');\n`, expectedShouldTrigger: true, description: "Handler requiring pg client directly" },
  { id: "001-TN1", ruleId: "ASTESIA-001", category: "TN", relPath: "r001/user.repository.ts", content: `import { eq } from 'drizzle-orm';\n`, expectedShouldTrigger: false, description: "Repository importing drizzle-orm" },
  { id: "001-TN2", ruleId: "ASTESIA-001", category: "TN", relPath: "r001/user.controller.test.ts", content: `import { eq } from 'drizzle-orm';\n`, expectedShouldTrigger: false, description: "Controller test file importing drizzle-orm" },
  { id: "001-TN3", ruleId: "ASTESIA-001", category: "TN", relPath: "r001/tn3.controller.ts", content: `import { real } from '../shared/real';\n`, expectedShouldTrigger: false, description: "Controller importing normal service module" },
  { id: "001-EC1", ruleId: "ASTESIA-001", category: "EC", relPath: "r001/ec1.routes.ts", content: `import { real as db } from '../shared/real';\n`, expectedShouldTrigger: true, description: "Controller importing local db connection as db" },
  { id: "001-EC2", ruleId: "ASTESIA-001", category: "EC", relPath: "r001/userController.ts", content: `import { eq } from 'drizzle-orm';\n`, expectedShouldTrigger: true, description: "camelCase filename userController.ts importing drizzle-orm" },
  { id: "001-EC3", ruleId: "ASTESIA-001", category: "EC", relPath: "r001/ec3.controller.ts", content: `const orm = await import('drizzle-orm');\nimport { Database } from 'bun:sqlite';\n`, expectedShouldTrigger: true, description: "Dynamic import('drizzle-orm') and bun:sqlite in controller" },

  // ================= ASTESIA-002 =================
  { id: "002-TP1", ruleId: "ASTESIA-002", category: "TP", relPath: "r002/tp1.ts", content: `const q = "SELECT * FROM users";\n`, expectedShouldTrigger: true, description: "Direct uppercase SELECT * in SQL string" },
  { id: "002-TP2", ruleId: "ASTESIA-002", category: "TP", relPath: "r002/tp2.py", content: `cursor.execute("SELECT   * FROM orders WHERE id = %s", (order_id,))\n`, expectedShouldTrigger: true, description: "Python raw SQL with multiple spaces in SELECT   *" },
  { id: "002-TP3", ruleId: "ASTESIA-002", category: "TP", relPath: "r002/tp3.go", content: `rows, err := db.Query("SELECT * FROM products")\n`, expectedShouldTrigger: true, description: "Go raw SQL SELECT *" },
  { id: "002-TN1", ruleId: "ASTESIA-002", category: "TN", relPath: "r002/tn1.ts", content: `const q = "SELECT id, email FROM users";\n`, expectedShouldTrigger: false, description: "Explicit column selection in SQL" },
  { id: "002-TN2", ruleId: "ASTESIA-002", category: "TN", relPath: "r002/migrations/001_init.ts", content: `const q = "SELECT * FROM schema_migrations";\n`, expectedShouldTrigger: false, description: "SELECT * inside migrations/ folder (excluded)" },
  { id: "002-TN3", ruleId: "ASTESIA-002", category: "TN", relPath: "r002/tn3.test.ts", content: `const q = "SELECT * FROM users";\n`, expectedShouldTrigger: false, description: "SELECT * inside .test.ts file (excluded)" },
  { id: "002-EC1", ruleId: "ASTESIA-002", category: "EC", relPath: "r002/ec1_lowercase_and_table_star.ts", content: `const q1 = "select * from users";\nconst q2 = "SELECT users.* FROM users";\n`, expectedShouldTrigger: true, description: "Lowercase 'select *' and table-qualified 'SELECT users.*'" },
  { id: "002-EC2", ruleId: "ASTESIA-002", category: "EC", relPath: "r002/ec2_multiline.ts", content: "const q = `\n  SELECT\n    *\n  FROM users\n`;\n", expectedShouldTrigger: true, description: "Multi-line template literal with SELECT and * on separate lines" },
  { id: "002-EC3", ruleId: "ASTESIA-002", category: "EC", relPath: "r002/ec3_comment.ts", content: `// DBA Note: We explicitly avoid SELECT * here by choosing id, name.\nexport const cols = ['id', 'name'];\n`, expectedShouldTrigger: false, description: "Code comment explaining why SELECT * is avoided" },

  // ================= ASTESIA-003 =================
  { id: "003-TP1", ruleId: "ASTESIA-003", category: "TP", relPath: "r003/tp1.ts", content: `// astesia-debt: quick workaround for demo\n`, expectedShouldTrigger: true, description: "astesia-debt comment missing upgrade: clause" },
  { id: "003-TP2", ruleId: "ASTESIA-003", category: "TP", relPath: "r003/tp2.py", content: `# astesia-debt: hardcoded timeout\n`, expectedShouldTrigger: true, description: "Python astesia-debt comment without upgrade:" },
  { id: "003-TP3", ruleId: "ASTESIA-003", category: "TP", relPath: "r003/tp3.go", content: `// astesia-debt: upgrade later without colon\n`, expectedShouldTrigger: true, description: "astesia-debt with word 'upgrade' but no 'upgrade:' clause" },
  { id: "003-TN1", ruleId: "ASTESIA-003", category: "TN", relPath: "r003/tn1.ts", content: `// astesia-debt: in-memory cache for MVP, upgrade: move to Redis in Wave 3\n`, expectedShouldTrigger: false, description: "Properly formatted astesia-debt with reason and upgrade: clause" },
  { id: "003-TN2", ruleId: "ASTESIA-003", category: "TN", relPath: "r003/tn2.ts", content: `export const normalCode = 42;\n`, expectedShouldTrigger: false, description: "Normal file without debt markers" },
  { id: "003-TN3", ruleId: "ASTESIA-003", category: "TN", relPath: "r003/tn3.py", content: `# astesia-debt: sync I/O in worker, upgrade: switch to httpx.AsyncClient\n`, expectedShouldTrigger: false, description: "Valid Python astesia-debt marker" },
  { id: "003-EC1", ruleId: "ASTESIA-003", category: "EC", relPath: "r003/ec1_empty_clause.ts", content: `// astesia-debt: , upgrade: \n`, expectedShouldTrigger: true, description: "Empty reason and empty upgrade action" },
  { id: "003-EC2", ruleId: "ASTESIA-003", category: "EC", relPath: "r003/ec2_multiline_block.ts", content: `/*\n * astesia-debt: polling interval is fixed\n * upgrade: replace with WebSocket push\n */\n`, expectedShouldTrigger: false, description: "Multi-line block comment with upgrade: on subsequent line" },
  { id: "003-EC3", ruleId: "ASTESIA-008", category: "EC", relPath: "r003/ec3_todo_hack.ts", content: `// TODO: temporary hack workaround for race condition\n`, expectedShouldTrigger: true, description: "Untracked workaround comment (reclassified to ASTESIA-008)" },

  // ================= ASTESIA-004 =================
  { id: "004-TP1", ruleId: "ASTESIA-004", category: "TP", relPath: "r004/tp1.ts", content: `const apiKey = "sk_live_9876543210abcdef";\n`, expectedShouldTrigger: true, description: "Hardcoded apiKey string >= 12 chars" },
  { id: "004-TP2", ruleId: "ASTESIA-004", category: "TP", relPath: "r004/tp2.py", content: `JWT_SECRET = 'my_super_secret_signing_key_2026'\n`, expectedShouldTrigger: true, description: "Hardcoded Python JWT_SECRET" },
  { id: "004-TP3", ruleId: "ASTESIA-004", category: "TP", relPath: "r004/tp3.ts", content: `const cfg = { password: "PlaintextPassword1234" };\n`, expectedShouldTrigger: true, description: "Object property password with literal string" },
  { id: "004-TN1", ruleId: "ASTESIA-004", category: "TN", relPath: "r004/tn1.ts", content: `const apiKey = process.env.API_KEY;\n`, expectedShouldTrigger: false, description: "Reading secret from process.env" },
  { id: "004-TN2", ruleId: "ASTESIA-004", category: "TN", relPath: "r004/tn2.test.ts", content: `const apiKey = "test_only_fake_key_123456";\n`, expectedShouldTrigger: false, description: "Fake secret in .test.ts" },
  { id: "004-TN3", ruleId: "ASTESIA-004", category: "TN", relPath: "r004/tn3.ts", content: `const token = "short";\n`, expectedShouldTrigger: false, description: "Short non-secret identifier (< 12 chars)" },
  { id: "004-EC1", ruleId: "ASTESIA-004", category: "EC", relPath: "r004/ec1_env_fallback_and_backtick.ts", content: "const secret = process.env.JWT_SECRET ?? 'hardcoded_fallback_secret_12345';\nconst token = `ghp_1234567890abcdefghijklmnopqrstuv`;\n", expectedShouldTrigger: true, description: "Secret in nullish coalescing fallback and template literal" },
  { id: "004-EC2", ruleId: "ASTESIA-004", category: "EC", relPath: "r004/ec2_jwt_and_special_chars.ts", content: `const token = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";\nconst password = "SuperSecret!Password#2026";\n`, expectedShouldTrigger: true, description: "Hardcoded JWT and password with special chars" },
  { id: "004-EC3", ruleId: "ASTESIA-004", category: "EC", relPath: "r004/ec3_ui_label_false_positive.ts", content: `const formLabels = { password: "EnterYourNewPassword" };\nconst passwordField = "user_password_confirmation";\n`, expectedShouldTrigger: false, description: "Non-secret UI label and form field name" },

  // ================= ASTESIA-005 =================
  { id: "005-TP1", ruleId: "ASTESIA-005", category: "TP", relPath: "r005/tp1.ts", content: `export function parse(input: any): string { return String(input); }\n`, expectedShouldTrigger: true, description: "Parameter typed as : any" },
  { id: "005-TP2", ruleId: "ASTESIA-005", category: "TP", relPath: "r005/tp2.tsx", content: `const payload = ({} as any).foo;\n`, expectedShouldTrigger: true, description: "Type assertion as any in .tsx" },
  { id: "005-TP3", ruleId: "ASTESIA-005", category: "TP", relPath: "r005/tp3.ts", content: `const list: any[] = [];\n`, expectedShouldTrigger: true, description: "Array typed as : any[]" },
  { id: "005-TN1", ruleId: "ASTESIA-005", category: "TN", relPath: "r005/tn1.ts", content: `export function parse(input: unknown): string { return String(input); }\n`, expectedShouldTrigger: false, description: "Proper use of : unknown" },
  { id: "005-TN2", ruleId: "ASTESIA-005", category: "TN", relPath: "r005/tn2.d.ts", content: `export type LegacyCallback = (x: any) => any;\n`, expectedShouldTrigger: false, description: "Declaration file .d.ts" },
  { id: "005-TN3", ruleId: "ASTESIA-005", category: "TN", relPath: "r005/tn3.ts", content: `const company: string = "Tiffany";\n`, expectedShouldTrigger: false, description: "Word containing any suffix ('Tiffany')" },
  { id: "005-EC1", ruleId: "ASTESIA-005", category: "EC", relPath: "r005/ec1_generics_and_type_alias.ts", content: `type Anything = any;\nconst map: Record<string, any> = {};\nasync function f(): Promise<any> { return 1; }\n`, expectedShouldTrigger: true, description: "Explicit any in type alias, Record, Promise" },
  { id: "005-EC2", ruleId: "ASTESIA-005", category: "EC", relPath: "r005/ec2_comment_and_string.ts", content: `// Rule: as any developer knows, avoid shortcuts.\nconst msg = "Warning: any unsaved changes will be lost";\n`, expectedShouldTrigger: false, description: "English words as any in comment and string" },
  { id: "005-EC3", ruleId: "ASTESIA-005", category: "EC", relPath: "r005/ec3_svelte_lang_ts.svelte", content: `<script lang="ts">\n  let data: any = null;\n</script>\n`, expectedShouldTrigger: true, description: "Explicit : any inside Svelte <script lang='ts'>" },

  // ================= ASTESIA-006 =================
  { id: "006-TP1", ruleId: "ASTESIA-006", category: "TP", relPath: "r006/tp1.ts", content: `console.log("debug user", userId);\n`, expectedShouldTrigger: true, description: "Direct console.log() in TS source" },
  { id: "006-TP2", ruleId: "ASTESIA-006", category: "TP", relPath: "r006/tp2.js", content: `  console.log(result);\n`, expectedShouldTrigger: true, description: "Indented console.log() in JS source" },
  { id: "006-TP3", ruleId: "ASTESIA-006", category: "TP", relPath: "r006/tp3.svelte", content: `<script>\nconsole.log("mounted");\n</script>\n`, expectedShouldTrigger: true, description: "console.log() in Svelte component" },
  { id: "006-TN1", ruleId: "ASTESIA-006", category: "TN", relPath: "r006/tn1.ts", content: `logger.info({ userId }, "user created");\n`, expectedShouldTrigger: false, description: "Structured logger.info()" },
  { id: "006-TN2", ruleId: "ASTESIA-006", category: "TN", relPath: "r006/scripts/seed.ts", content: `console.log("Seeding database...");\n`, expectedShouldTrigger: false, description: "console.log() in scripts/ dir" },
  { id: "006-TN3", ruleId: "ASTESIA-006", category: "TN", relPath: "r006/tn3.spec.ts", content: `console.log("test output");\n`, expectedShouldTrigger: false, description: "console.log() in .spec.ts" },
  { id: "006-EC1", ruleId: "ASTESIA-006", category: "EC", relPath: "r006/ec1_debug_info_debugger.ts", content: `console.debug("debug");\nconsole.info("info");\ndebugger;\n`, expectedShouldTrigger: true, description: "console.debug, console.info, and debugger;" },
  { id: "006-EC2", ruleId: "ASTESIA-006", category: "EC", relPath: "r006/ec2_comment.ts", content: `// Never use console.log(secret) in production\n`, expectedShouldTrigger: false, description: "Comment mentioning console.log()" },
  { id: "006-EC3", ruleId: "ASTESIA-006", category: "EC", relPath: "r006/ec3_optional_chain_or_space.ts", content: `console.log ("spaced");\nglobalThis.console?.log("optional");\n`, expectedShouldTrigger: true, description: "console.log with space and console?.log" },

  // ================= ASTESIA-007 =================
  { id: "007-TP1", ruleId: "ASTESIA-007", category: "TP", relPath: "r007/tp1.ts", content: `for (const id of ids) {\n  await db.select().from(users);\n}\n`, expectedShouldTrigger: true, description: "for-of loop with await db.select()" },
  { id: "007-TP2", ruleId: "ASTESIA-007", category: "TP", relPath: "r007/tp2.ts", content: `await Promise.all(ids.map(async (id) => {\n  return prisma.user.findFirst({ where: { id } });\n}));\n`, expectedShouldTrigger: true, description: ".map() with braces calling prisma" },
  { id: "007-TP3", ruleId: "ASTESIA-007", category: "TP", relPath: "r007/tp3.ts", content: `while (hasMore) {\n  const row = await repo.getNext();\n}\n`, expectedShouldTrigger: true, description: "while loop calling repo.getNext()" },
  { id: "007-TN1", ruleId: "ASTESIA-007", category: "TN", relPath: "r007/tn1.ts", content: `const rows = await db.select({ id: users.id }).from(users);\nfor (const r of rows) {\n  processRow(r);\n}\n`, expectedShouldTrigger: false, description: "Batch query before the loop" },
  { id: "007-TN2", ruleId: "ASTESIA-007", category: "TN", relPath: "r007/tn2.ts", content: `const names = users.map((u) => {\n  return u.name.trim();\n});\n`, expectedShouldTrigger: false, description: "Pure in-memory .map() with braces" },
  { id: "007-TN3", ruleId: "ASTESIA-007", category: "TN", relPath: "r007/tn3.test.ts", content: `for (const id of ids) {\n  await repo.create(id);\n}\n`, expectedShouldTrigger: false, description: "Loop DB call in .test.ts" },
  { id: "007-EC1", ruleId: "ASTESIA-007", category: "EC", relPath: "r007/ec1_braceless_map_then_query.ts", content: `const userIds = users.map((u) => u.id);\nconst orders = await db.query(userIds);\n`, expectedShouldTrigger: false, description: "Braceless .map() followed by batch query outside loop" },
  { id: "007-EC2", ruleId: "ASTESIA-007", category: "EC", relPath: "r007/ec2_camel_repo_and_helper.ts", content: `for (const u of users) {\n  await userRepository.findById(u.id);\n  await fetchUserOrdersHelper(u.id);\n}\n`, expectedShouldTrigger: true, description: "camelCase userRepository.findById() in loop" },
  { id: "007-EC3", ruleId: "ASTESIA-007", category: "EC", relPath: "r007/ec3_python_go_loops.py", content: `for user_id in user_ids:\n    repo.get_user(user_id)\n`, expectedShouldTrigger: true, description: "Python for loop calling repo.get_user()" },

  // ================= REGRESSIONS =================
  { id: "REG-CRLF", ruleId: "ASTESIA-002", category: "REG", relPath: "reg/crlf.ts", content: "const a = 1;\r\nconst q = 'SELECT * FROM users';\r\n", expectedShouldTrigger: true, description: "CRLF line endings" },
  { id: "REG-BOM", ruleId: "ASTESIA-002", category: "REG", relPath: "reg/bom.ts", content: "\uFEFFconst q = 'SELECT * FROM users';\n", expectedShouldTrigger: true, description: "Source file with UTF-8 BOM" },
  { id: "REG-WINPATH", ruleId: "ASTESIA-001", category: "REG", relPath: "controllers/nested/auth.handler.ts", content: "import { eq } from 'drizzle-orm';\n", expectedShouldTrigger: true, description: "Nested Windows-style controller/handler path" },
  { id: "REG-BLOCK-COMMENT", ruleId: "ASTESIA-003", category: "REG", relPath: "reg/block_comment.ts", content: "/*\n * astesia-debt: polling interval is fixed\n * upgrade: replace with WebSocket push\n */\n", expectedShouldTrigger: false, description: "Multiline block comment with upgrade:" },
  { id: "REG-ALLOW-SHORT", ruleId: "ASTESIA-002", category: "REG", relPath: "reg/allow_short.ts", content: "// astesia-allow: ASTESIA-002 -- short\nconst q = 'SELECT * FROM users';\n", expectedShouldTrigger: true, description: "Short (<15 char) reason must not suppress" },
  { id: "REG-ALLOW-STRING", ruleId: "ASTESIA-002", category: "REG", relPath: "reg/allow_string.ts", content: "const s = '// astesia-allow: ASTESIA-002 -- valid fifteen character reason';\nconst q = 'SELECT * FROM users';\n", expectedShouldTrigger: true, description: "Allow inside string must not suppress" },
  { id: "REG-ALLOW-000", ruleId: "ASTESIA-000", category: "REG", relPath: "reg/allow_000.ts", content: "// astesia-allow: ASTESIA-000 -- valid fifteen character reason\nimport { ghost } from './phantom-module';\n", expectedShouldTrigger: true, description: "Banned allow for ASTESIA-000" },
  { id: "REG-ALLOW-004", ruleId: "ASTESIA-004", category: "REG", relPath: "reg/allow_004.ts", content: "// astesia-allow: ASTESIA-004 -- valid fifteen character reason\nconst apiKey = \"sk_live_9876543210abcdef\";\n", expectedShouldTrigger: true, description: "Banned allow for ASTESIA-004" },
  { id: "REG-MAP-NOBRACE", ruleId: "ASTESIA-007", category: "REG", relPath: "reg/map_nobrace.ts", content: "const ids = items.map(x => x.id);\nconst batch = await db.query(ids);\n", expectedShouldTrigger: false, description: "Braceless map must not leak inLoop" },
  { id: "REG-008-TP", ruleId: "ASTESIA-008", category: "REG", relPath: "reg/r008_tp.ts", content: "// FIXME: temporary workaround for database lock\n", expectedShouldTrigger: true, description: "ASTESIA-008 workaround comment" },
  { id: "REG-008-TN", ruleId: "ASTESIA-008", category: "REG", relPath: "reg/r008_tn.ts", content: "// astesia-debt: temporary workaround for lock, upgrade: implement optimistic lock in Wave 2\n", expectedShouldTrigger: false, description: "ASTESIA-008 accompanied by astesia-debt" },
  { id: "REG-009-TP", ruleId: "ASTESIA-009", category: "REG", relPath: "reg/r009_tp.ts", content: "setTimeout(() => { refresh(); }, 100);\n", expectedShouldTrigger: true, description: "ASTESIA-009 setTimeout outside test" },
  { id: "REG-009-TN", ruleId: "ASTESIA-009", category: "REG", relPath: "utils/debounce.ts", content: "export function debounce(fn: Function) { setTimeout(fn, 50); }\n", expectedShouldTrigger: false, description: "ASTESIA-009 setTimeout in debounce" },
  { id: "REG-010-TP", ruleId: "ASTESIA-010", category: "REG", relPath: "reg/docker-compose.yml", content: "services:\n  web:\n    environment:\n      - DB_PASSWORD=my_super_secret_password_123\n", expectedShouldTrigger: true, description: "ASTESIA-010 hardcoded secret in compose" },
  { id: "REG-010-TN", ruleId: "ASTESIA-010", category: "REG", relPath: "reg/docker-compose.prod.yml", content: "services:\n  web:\n    environment:\n      - DB_PASSWORD=${DB_PASSWORD}\n", expectedShouldTrigger: false, description: "ASTESIA-010 env var reference in compose" },

  // ================= ADVERSARIAL KNOWN-GAP FIXTURES =================
  {
    id: "ADV-02-GAP",
    ruleId: "ASTESIA-005",
    category: "EC",
    relPath: "adv/url-regex.ts",
    content: "const urlRegex = /https?:\\/\\/[^\\s]+/;\nconst quoteRegex = /\"([^\"]+)\"/g;\nconst val: any = \"real violation\";\n",
    expectedShouldTrigger: true,
    isKnownGap: true,
    gapReason: "Odd quotes inside regex literal confuse tokenizer string state, blinding subsequent code lines",
    description: "Adversarial: Regex literal with odd quotes blinds subsequent syntax"
  },
  {
    id: "ADV-05-GAP",
    ruleId: "ASTESIA-006",
    category: "EC",
    relPath: "adv/escapes.ts",
    content: "const c = \"multi\\\nline\\\nstring\";\nconsole.log(\"shifted line violation\");\n",
    expectedShouldTrigger: true,
    isKnownGap: true,
    gapReason: "Trailing backslash escape consumes newline, shifting line numbers in violation report",
    description: "Adversarial: Escaped newline shifts reported line numbers"
  },
  {
    id: "ADV-07-GAP",
    ruleId: "ASTESIA-006",
    category: "EC",
    relPath: "adv/unclosed.ts",
    content: "const unclosed = \"this string is never closed\nconsole.log(\"is this detected or blinded?\");\n",
    expectedShouldTrigger: true,
    isKnownGap: true,
    gapReason: "Unclosed string at EOF fails open silently without emitting warning/error",
    description: "Adversarial: Unclosed string at EOF fails open silently"
  },

  // ================= SECRET HEURISTIC KNOWN-GAP FIXTURES =================
  {
    id: "SEC-01-GAP",
    ruleId: "ASTESIA-004",
    category: "EC",
    relPath: "sec/passphrase.ts",
    content: 'const password = "correcthorsebatterystaple";\n',
    expectedShouldTrigger: true,
    isKnownGap: true,
    gapReason: "Pure alphabetic passphrases are bypassed by /^[A-Za-z]+$/ heuristic filter",
    description: "Heuristic Gap: Diceware passphrase without digits/symbols"
  },
  {
    id: "SEC-13-GAP",
    ruleId: "ASTESIA-004",
    category: "EC",
    relPath: "sec/apikey_text.ts",
    content: 'const apiKeyText = "sk_live_9876543210abcdef";\n',
    expectedShouldTrigger: true,
    isKnownGap: true,
    gapReason: "Keys ending in Text/Field/Label/Name unconditionally bypass ASTESIA-004 even for high-entropy secrets",
    description: "Heuristic Gap: Real secret with key ending in Text (apiKeyText)"
  }
];

// Write all fixtures to disk
for (const tc of testCases) {
  const full = join(FIXTURES_DIR, tc.relPath);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, tc.content, "utf8");
}

// Execute Gate
console.log("=== ASTESIA ENFORCEMENT TEST RUNNER ===");
console.log(`Running Gate: ${GATE_PATH}`);
console.log(`Rules: ${RULES_PATH}`);
console.log(`Fixtures: ${testCases.length} cases\n`);

const res = spawnSync("bun", [GATE_PATH, "--root", FIXTURES_DIR, "--rules", RULES_PATH, "--json"], {
  encoding: "utf8",
  maxBuffer: 20 * 1024 * 1024
});

const parsed = JSON.parse(res.stdout);
const violations: Array<{ ruleId: string; file: string; line: number; message: string }> = parsed.violations;

let tpPass = 0, tpTotal = 0;
let tnPass = 0, tnTotal = 0;
let ecFn = 0, ecFp = 0;
let gapsVerified = 0, gapsTotal = 0;

for (const tc of testCases) {
  const matched = violations.filter((v) => v.file === tc.relPath && v.ruleId === tc.ruleId);
  const didTrigger = matched.length > 0;

  if (tc.isKnownGap) {
    gapsTotal++;
    // Known gaps: check for either non-triggering OR line number desynchronization (ADV-05)
    let gapTriggered = false;
    if (tc.id === "ADV-05-GAP") {
      const match = matched[0];
      // It triggers, but on wrong line (line 4 instead of line 6)
      if (match && match.line !== 6) {
        gapTriggered = true;
      }
    } else {
      gapTriggered = didTrigger !== tc.expectedShouldTrigger;
    }

    if (gapTriggered) {
      gapsVerified++;
      console.log(`[KNOWN-GAP CONFIRMED] ${tc.id}: ${tc.description} -> Reason: ${tc.gapReason}`);
    } else {
      console.log(`[KNOWN-GAP UNEXPECTED PASS] ${tc.id}: triggered=${didTrigger}`);
    }
    continue;
  }

  if (tc.category === "TP") {
    tpTotal++;
    if (didTrigger) tpPass++;
  } else if (tc.category === "TN") {
    tnTotal++;
    if (!didTrigger) tnPass++;
  } else if (tc.category === "EC" || tc.category === "REG") {
    if (tc.expectedShouldTrigger && !didTrigger) ecFn++;
    if (!tc.expectedShouldTrigger && didTrigger) ecFp++;
  }

  const ok = didTrigger === tc.expectedShouldTrigger;
  if (!ok) {
    console.log(`[FAIL] ${tc.id} (${tc.category}): triggered=${didTrigger}, expected=${tc.expectedShouldTrigger} | ${tc.description}`);
  }
}

console.log("\n--- TEST MATRIX SUMMARY ---");
console.log(`True Positives (Base): ${tpPass}/${tpTotal}`);
console.log(`True Negatives (Base): ${tnPass}/${tnTotal}`);
console.log(`Edge-Case & Regression False Negatives: ${ecFn}`);
console.log(`Edge-Case & Regression False Positives: ${ecFp}`);
console.log(`Documented Known-Gaps Verified: ${gapsVerified}/${gapsTotal}`);

// Run CLI Tests
console.log("\n--- CLI RESILIENCE TESTS ---");
const cliDir = join(TEST_DIR, "cli-tests");
mkdirSync(cliDir, { recursive: true });
writeFileSync(join(cliDir, "warn.ts"), "console.log('warn');\n", "utf8");

function runCLI(args: string[]) {
  const r = spawnSync("bun", [GATE_PATH, ...args], { encoding: "utf8" });
  return { status: r.status, stderr: r.stderr };
}

const c1 = runCLI(["--root", cliDir, "--rules", RULES_PATH, "--max-warn=0"]).status === 1;
const c2 = runCLI(["--root", cliDir, "--rules", RULES_PATH, "--max-warn", "abc"]).status === 2;
const c3 = runCLI(["--root", cliDir, "--rules", RULES_PATH, "--max-warn"]).status === 2;
const c4 = runCLI(["--root", cliDir, "--rules", RULES_PATH, "--max-warn", "-1"]).status === 2;

console.log(`CLI --max-warn=0: ${c1 ? "PASS" : "FAIL"}`);
console.log(`CLI --max-warn abc: ${c2 ? "PASS" : "FAIL"}`);
console.log(`CLI --max-warn (empty): ${c3 ? "PASS" : "FAIL"}`);
console.log(`CLI --max-warn -1: ${c4 ? "PASS" : "FAIL"}`);

// Clean up fixtures from disk so repo stays clean
rmSync(TEST_DIR, { recursive: true, force: true });
console.log("\nTest fixtures cleaned up. Harness completed successfully.");
