/**
 * templates/enforcement/tests/independent/corpus.ts
 * Port of independent verification cases (D2 Adversarial, D4 Secrets Decision Table, D5 Suppressions).
 */
import type { TestCase } from "../run";

export const independentCases: TestCase[] = [
  // ================= 1. D2 ADVERSARIAL CASES =================
  {
    id: "D2-01-REG-DOUBLE",
    ruleId: "ASTESIA-005",
    category: "independent",
    relPath: "indep/d2_01.ts",
    content: 'const r = /"([a-z]+)"/g;\nconst x: any = 1;\n',
    expectedShouldTrigger: true,
    description: "Regex with double quotes followed by : any"
  },
  {
    id: "D2-02-REG-SINGLE",
    ruleId: "ASTESIA-005",
    category: "independent",
    relPath: "indep/d2_02.ts",
    content: "const r = /'([a-z]+)'/g;\nconst x: any = 1;\n",
    expectedShouldTrigger: true,
    description: "Regex with single quotes followed by : any"
  },
  {
    id: "D2-03-SLASH-ESC",
    ruleId: "ASTESIA-005",
    category: "independent",
    relPath: "indep/d2_03.ts",
    content: "const r = /\\/\\//;\nconst x: any = 1;\n",
    expectedShouldTrigger: true,
    description: "Regex with escaped slash /\\/\\// followed by : any"
  },
  {
    id: "D2-04-BRACKET-SLASH",
    ruleId: "ASTESIA-005",
    category: "independent",
    relPath: "indep/d2_04.ts",
    content: "const r = /[/]/;\nconst x: any = 1;\n",
    expectedShouldTrigger: true,
    description: "Regex with bracket class containing slash followed by : any"
  },
  {
    id: "D2-05-AFTER-RETURN",
    ruleId: "ASTESIA-005",
    category: "independent",
    relPath: "indep/d2_05.ts",
    content: 'function f(s: string) { return /"abc"/.test(s); }\nconst x: any = 1;\n',
    expectedShouldTrigger: true,
    description: "Regex after return keyword followed by : any"
  },
  {
    id: "D2-06-AFTER-PAREN",
    ruleId: "ASTESIA-005",
    category: "independent",
    relPath: "indep/d2_06.ts",
    content: 'if (/"abc"/.test(s)) {\n  const x: any = 1;\n}\n',
    expectedShouldTrigger: true,
    description: "Regex after opening paren followed by : any"
  },
  {
    id: "D2-07-DIVISION",
    ruleId: "ASTESIA-005",
    category: "independent",
    relPath: "indep/d2_07.ts",
    content: "const d = a / b / c;\nconst x: any = 1;\n",
    expectedShouldTrigger: true,
    description: "Arithmetic division followed by : any"
  },
  {
    id: "D2-REG-BACKTICK-GAP",
    ruleId: "ASTESIA-005",
    category: "independent",
    relPath: "indep/d2_gap1.ts",
    content: "const r = /`/;\nconst x: any = 1;\n",
    expectedShouldTrigger: true,
    isKnownGap: true,
    gapReason: "Adversarial known-gap: backtick inside regex literal",
    description: "Adversarial known-gap: backtick inside regex literal"
  },
  {
    id: "D2-08-STR-CONTINUATION",
    ruleId: "ASTESIA-005",
    category: "independent",
    relPath: "indep/d2_08.ts",
    content: 'const s = "line1\\\nline2\\\nline3";\nconst x: any = 1;\n',
    expectedShouldTrigger: true,
    description: "Escaped newline continuation line numbering"
  },
  {
    id: "D2-09-NESTED-TEMPLATE",
    ruleId: "ASTESIA-005",
    category: "independent",
    relPath: "indep/d2_09.ts",
    content: 'const s = `outer ${"nested } string"} end`;\nconst x: any = 1;\n',
    expectedShouldTrigger: true,
    description: "Nested template literal with braces followed by : any"
  },
  {
    id: "D2-10-ESCAPED-QUOTE",
    ruleId: "ASTESIA-005",
    category: "independent",
    relPath: "indep/d2_10.ts",
    content: 'const s = "a\\"b\\"c";\nconst x: any = 1;\n',
    expectedShouldTrigger: true,
    description: 'String with escaped quotes \\" followed by : any'
  },
  {
    id: "D2-11-PY-CONCAT",
    ruleId: "ASTESIA-002",
    category: "independent",
    relPath: "indep/d2_11.py",
    content: 's = "a" "b"\ncursor.execute("SELECT * FROM users")\n',
    expectedShouldTrigger: true,
    description: "Python concatenated string literals followed by SELECT *"
  },
  {
    id: "D2-12-PY-TRIPLE-HASH",
    ruleId: "ASTESIA-002",
    category: "independent",
    relPath: "indep/d2_12.py",
    content: 'doc = """\n# comment inside docstring\n"""\ncursor.execute("SELECT * FROM users")\n',
    expectedShouldTrigger: true,
    description: "Python triple quote containing # followed by SELECT *"
  },
  {
    id: "D2-13-PY-FSTRING",
    ruleId: "ASTESIA-002",
    category: "independent",
    relPath: "indep/d2_13.py",
    content: 'msg = f"user {user_id}"\ncursor.execute("SELECT * FROM users")\n',
    expectedShouldTrigger: true,
    description: "Python f-string followed by SELECT *"
  },
  {
    id: "D2-14-GO-RAW-SLASH",
    ruleId: "ASTESIA-002",
    category: "independent",
    relPath: "indep/d2_14.go",
    content: "package main\nvar r = `multiline\n// not a comment\nraw string`\nfunc f() { db.Query(\"SELECT * FROM users\") }\n",
    expectedShouldTrigger: true,
    description: "Go raw string containing // followed by SELECT *"
  },
  {
    id: "D2-15-PHP-MULTILINE",
    ruleId: "ASTESIA-002",
    category: "independent",
    relPath: "indep/d2_15.php",
    content: '<?php\n$s = "multi\nline\nstring";\n$q = "SELECT * FROM users";\n',
    expectedShouldTrigger: true,
    description: "PHP multiline string followed by SELECT *"
  },
  {
    id: "D2-PHP-HEREDOC",
    ruleId: "ASTESIA-002",
    category: "independent",
    relPath: "indep/d2_gap2.php",
    content: "<?php\n$str = <<<EOD\nSELECT * FROM users in heredoc\nEOD;\n$q = \"SELECT * FROM users\";\n",
    expectedShouldTrigger: true,
    isKnownGap: true,
    gapReason: "VER2-002: PHP heredoc syntax not stripped as string literal in zero-dependency tokenizer",
    description: "PHP heredoc text followed by real SELECT *"
  },
  {
    id: "D2-17-SVELTE-ATTR",
    ruleId: "ASTESIA-005",
    category: "independent",
    relPath: "indep/d2_17.svelte",
    content: '<div class="btn\n  btn-primary">\n</div>\n<script lang="ts">\nlet x: any = 1;\n</script>\n',
    expectedShouldTrigger: true,
    description: "Svelte markup multiline attribute followed by : any"
  },
  {
    id: "D2-18-CRLF-CONTINUATION",
    ruleId: "ASTESIA-005",
    category: "independent",
    relPath: "indep/d2_18.ts",
    content: 'const s = "line1\\\r\nline2\\\r\nline3";\r\nconst x: any = 1;\r\n',
    expectedShouldTrigger: true,
    description: "CRLF line endings with escaped newline continuation"
  },
  {
    id: "D2-19-BOM-REG-QUOTE",
    ruleId: "ASTESIA-005",
    category: "independent",
    relPath: "indep/d2_19.ts",
    content: '\uFEFFconst r = /"([a-z]+)"/g;\nconst x: any = 1;\n',
    expectedShouldTrigger: true,
    description: "UTF-8 BOM with regex quotes followed by : any"
  },
  {
    id: "D2-20-EOF-BACKTICK",
    ruleId: "TOKENIZER_DESYNC",
    category: "independent",
    relPath: "indep/d2_20.ts",
    content: "const s = `unclosed template literal;\n",
    expectedShouldTrigger: true,
    description: "Unclosed template literal at EOF must trigger TOKENIZER_DESYNC"
  },
  {
    id: "D2-21-EOF-PY-TRIPLE",
    ruleId: "TOKENIZER_DESYNC",
    category: "independent",
    relPath: "indep/d2_21.py",
    content: 'doc = """unclosed python triple quote;\n',
    expectedShouldTrigger: true,
    description: "Unclosed Python triple quote at EOF must trigger TOKENIZER_DESYNC"
  },
  {
    id: "D2-22-EOF-BLOCK-COMMENT",
    ruleId: "TOKENIZER_DESYNC",
    category: "independent",
    relPath: "indep/d2_22.ts",
    content: "/* unclosed block comment\n",
    expectedShouldTrigger: true,
    description: "Unclosed block comment at EOF must trigger TOKENIZER_DESYNC"
  },
  {
    id: "D2-23-EOF-ALLOW-UNSUP",
    ruleId: "TOKENIZER_DESYNC",
    category: "independent",
    relPath: "indep/d2_23.ts",
    content: "// astesia-allow: TOKENIZER_DESYNC -- valid fifteen character reason\nconst s = `unclosed;\n",
    expectedShouldTrigger: true,
    description: "TOKENIZER_DESYNC cannot be suppressed by astesia-allow"
  },

  // ================= 2. D4 SECRETS CASES =================
  { id: "D4-01", ruleId: "ASTESIA-004", category: "independent", relPath: "indep/d4_01.ts", content: 'const password = "correcthorsebatterystaple";\n', expectedShouldTrigger: true, description: "Diceware passphrase unbroken letters >= 12" },
  { id: "D4-02", ruleId: "ASTESIA-004", category: "independent", relPath: "indep/d4_02.ts", content: 'const apiKey = "abcdefghijklmnop";\n', expectedShouldTrigger: true, description: "API key: pure alphabetic letters length 16" },
  { id: "D4-03", ruleId: "ASTESIA-004", category: "independent", relPath: "indep/d4_03.ts", content: 'const secret = "mysecretpassword";\n', expectedShouldTrigger: true, description: "Secret: pure alphabetic letters length 16" },
  { id: "D4-04", ruleId: "ASTESIA-004", category: "independent", relPath: "indep/d4_04.ts", content: 'const token = "Sup3rSecret!Value";\n', expectedShouldTrigger: true, description: "Token with digits and symbol" },
  { id: "D4-05", ruleId: "ASTESIA-004", category: "independent", relPath: "indep/d4_05.ts", content: 'const token = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";\n', expectedShouldTrigger: true, description: "Real JWT token starting with eyJ" },
  { id: "D4-06", ruleId: "ASTESIA-004", category: "independent", relPath: "indep/d4_06.ts", content: 'const secret = process.env.API_SECRET ?? "fallback_secret_12345";\n', expectedShouldTrigger: true, description: "process.env ?? fallback literal with digits" },
  { id: "D4-07", ruleId: "ASTESIA-004", category: "independent", relPath: "indep/d4_07.ts", content: 'const token = `ghp_1234567890abcdefghijklmnopqrstuv`;\n', expectedShouldTrigger: true, description: "GitHub PAT starting with ghp_" },
  { id: "D4-08", ruleId: "ASTESIA-004", category: "independent", relPath: "indep/d4_08.ts", content: 'const labels = { password: "EnterYourNewPassword" };\n', expectedShouldTrigger: false, description: "UI label: PascalCase with >= 2 capital segments" },
  { id: "D4-09", ruleId: "ASTESIA-004", category: "independent", relPath: "indep/d4_09.ts", content: 'const passwordField = "user_password_confirmation";\n', expectedShouldTrigger: false, description: "Form field name ending with Field, only letters and _" },
  { id: "D4-10", ruleId: "ASTESIA-004", category: "independent", relPath: "indep/d4_10.ts", content: 'const passwordLabel = "Please enter your password";\n', expectedShouldTrigger: false, description: "Ending with Label and spaced string" },
  { id: "D4-11", ruleId: "ASTESIA-004", category: "independent", relPath: "indep/d4_11.ts", content: 'const tokenType = "Bearer";\n', expectedShouldTrigger: false, description: "Short value (< 12 chars) ending with Type" },
  { id: "D4-12", ruleId: "ASTESIA-004", category: "independent", relPath: "indep/d4_12.ts", content: 'const msg = "Please enter your password";\n', expectedShouldTrigger: false, description: "Spaced user message" },
  { id: "D4-13", ruleId: "ASTESIA-004", category: "independent", relPath: "indep/d4_13.ts", content: 'const apiKeyText = "sk_live_9876543210abcdef";\n', expectedShouldTrigger: true, description: "Real secret assigned to key ending with Text" },
  { id: "D4-14", ruleId: "ASTESIA-004", category: "independent", relPath: "indep/d4_14.ts", content: 'const passwordField = "SuperSecretP@ssw0rd1234!";\n', expectedShouldTrigger: true, description: "Real password assigned to key ending with Field" },
  { id: "D4-15", ruleId: "ASTESIA-004", category: "independent", relPath: "indep/d4_15.ts", content: 'const secretName = "sk_live_9876543210abcdef";\n', expectedShouldTrigger: true, description: "Real secret assigned to key ending with Name" },
  { id: "D4-16", ruleId: "ASTESIA-004", category: "independent", relPath: "indep/d4_16.ts", content: 'const awsAccessKey = "AKIAIOSFODNN7EXAMPLE";\n', expectedShouldTrigger: true, description: "AWS Access Key starting with AKIA" },
  { id: "D4-17", ruleId: "ASTESIA-004", category: "independent", relPath: "indep/d4_17.ts", content: 'const slackToken = "xoxb-123456789012-1234567890123-4j3k2l1m";\n', expectedShouldTrigger: true, description: "Slack Bot Token starting with xoxb-" },
  { id: "D4-18", ruleId: "ASTESIA-004", category: "independent", relPath: "indep/d4_18.ts", content: 'const ghToken = "gho_1234567890abcdefghijklmnopqrstuv";\n', expectedShouldTrigger: true, description: "GitHub OAuth token starting with gho_" },
  { id: "D4-19", ruleId: "ASTESIA-004", category: "independent", relPath: "indep/d4_19.ts", content: 'const stripeTest = "sk_test_51Mz0123456789abcdef";\n', expectedShouldTrigger: true, description: "Stripe test key starting with sk_test_" },
  { id: "D4-20", ruleId: "ASTESIA-004", category: "independent", relPath: "indep/d4_20.ts", content: 'const passwordLabel = "correcthorsebatterystaple";\n', expectedShouldTrigger: true, description: "Diceware unbroken lowercase >= 12 under Label suffix" },
  {
    id: "D4-21-GAP",
    ruleId: "ASTESIA-004",
    category: "independent",
    relPath: "indep/d4_gap.ts",
    content: "const password = `pass_${userId}`;\n",
    expectedShouldTrigger: false,
    isKnownGap: true,
    gapReason: "Template literal interpolation pass_${userId} is not recognized by line-regex heuristic without runtime evaluation",
    description: "Known-gap: template literal interpolation pass_${userId}"
  },
  { id: "D4-22", ruleId: "ASTESIA-004", category: "independent", relPath: "indep/d4_22.ts", content: 'const passwordPlaceholder = "your-account-password";\n', expectedShouldTrigger: false, description: "Hyphenated UI placeholder under Placeholder suffix" },
  { id: "D4-23", ruleId: "ASTESIA-004", category: "independent", relPath: "indep/d4_23.ts", content: 'const tokenType = "Bearer-Token-Type";\n', expectedShouldTrigger: false, description: "Hyphenated identifier string ending in Type" },
  { id: "D4-24", ruleId: "ASTESIA-004", category: "independent", relPath: "indep/d4_24.ts", content: 'const apiKeyLabel = "API Key Label:";\n', expectedShouldTrigger: false, description: "Spaced UI label with colon ending in Label" },
  { id: "D4-25", ruleId: "ASTESIA-004", category: "independent", relPath: "indep/d4_25.ts", content: 'const buttonText = "ConfirmPasswordNow";\n', expectedShouldTrigger: false, description: "PascalCase label ending in Text" },
  { id: "D4-26", ruleId: "ASTESIA-004", category: "independent", relPath: "indep/d4_26.ts", content: 'const secret = "a1b2c3d4e5f6g7h8";\n', expectedShouldTrigger: true, description: "Alphanumeric secret without spaces" },
  { id: "D4-27", ruleId: "ASTESIA-004", category: "independent", relPath: "indep/d4_27.ts", content: 'const token = "short_tok";\n', expectedShouldTrigger: false, description: "Short token (< 12 chars)" },
  { id: "D4-28", ruleId: "ASTESIA-004", category: "independent", relPath: "indep/d4_28.ts", content: 'const authToken = "dXNlcm5hbWU6cGFzc3dvcmQ=";\n', expectedShouldTrigger: true, description: "Base64 credential string with =" },
  { id: "D4-29", ruleId: "ASTESIA-004", category: "independent", relPath: "indep/d4_29.ts", content: 'const passwordName = "sk_live_0987654321fedcba";\n', expectedShouldTrigger: true, description: "Stripe live secret under passwordName" },
  { id: "D4-30", ruleId: "ASTESIA-004", category: "independent", relPath: "indep/d4_30.ts", content: 'const tokenField = "sk_test_abcdef1234567890";\n', expectedShouldTrigger: true, description: "Stripe test secret under tokenField" },

  // ================= 3. D5 SUPPRESSION CASES =================
  { id: "D5-01-REASON-1", ruleId: "ASTESIA-002", category: "independent", relPath: "indep/d5_01.ts", content: '// astesia-allow: ASTESIA-002 -- x\nconst q = "SELECT * FROM users";\n', expectedShouldTrigger: true, description: "Reason 1 char (<15) must be rejected" },
  { id: "D5-02-REASON-14", ruleId: "ASTESIA-002", category: "independent", relPath: "indep/d5_02.ts", content: '// astesia-allow: ASTESIA-002 -- 12345678901234\nconst q = "SELECT * FROM users";\n', expectedShouldTrigger: true, description: "Reason 14 chars (<15) must be rejected" },
  { id: "D5-03-REASON-15", ruleId: "ASTESIA-002", category: "independent", relPath: "indep/d5_03.ts", content: '// astesia-allow: ASTESIA-002 -- 123456789012345\nconst q = "SELECT * FROM users";\n', expectedShouldTrigger: false, description: "Reason exactly 15 chars must be accepted" },
  { id: "D5-04-NO-COMMENT", ruleId: "ASTESIA-002", category: "independent", relPath: "indep/d5_04.ts", content: 'astesia-allow: ASTESIA-002 -- valid fifteen character reason\nconst q = "SELECT * FROM users";\n', expectedShouldTrigger: true, description: "Directive without comment marker is regular code" },
  { id: "D5-05-INSIDE-STR", ruleId: "ASTESIA-002", category: "independent", relPath: "indep/d5_05.ts", content: 'const s = "// astesia-allow: ASTESIA-002 -- valid fifteen character reason";\nconst q = "SELECT * FROM users";\n', expectedShouldTrigger: true, description: "Directive inside string literal must not suppress" },
  { id: "D5-06-BLOCK-PREV", ruleId: "ASTESIA-002", category: "independent", relPath: "indep/d5_06.ts", content: '/*\n * astesia-allow: ASTESIA-002 -- valid fifteen character reason\n */\nconst q = "SELECT * FROM users";\n', expectedShouldTrigger: false, description: "Directive in block comment before code must suppress" },
  { id: "D5-07-BLOCK-INLINE", ruleId: "ASTESIA-002", category: "independent", relPath: "indep/d5_07.ts", content: '/* astesia-allow: ASTESIA-002 -- valid fifteen character reason */ const q = "SELECT * FROM users";\n', expectedShouldTrigger: false, description: "Inline block comment on same line must suppress" },
  { id: "D5-08-SAME-LINE", ruleId: "ASTESIA-002", category: "independent", relPath: "indep/d5_08.ts", content: 'const q = "SELECT * FROM users"; // astesia-allow: ASTESIA-002 -- valid fifteen character reason\n', expectedShouldTrigger: false, description: "Line comment on same line must suppress" },
  { id: "D5-09-PREV-LINE", ruleId: "ASTESIA-002", category: "independent", relPath: "indep/d5_09.ts", content: '// astesia-allow: ASTESIA-002 -- valid fifteen character reason\nconst q = "SELECT * FROM users";\n', expectedShouldTrigger: false, description: "Line comment on previous line must suppress" },
  { id: "D5-10-BANNED-000", ruleId: "ASTESIA-000", category: "independent", relPath: "indep/d5_10.ts", content: '// astesia-allow: ASTESIA-000 -- valid fifteen character reason\nimport { x } from "./ghost";\n', expectedShouldTrigger: true, description: "ASTESIA-000 suppression is banned and must be rejected" },
  { id: "D5-11-BANNED-004", ruleId: "ASTESIA-004", category: "independent", relPath: "indep/d5_11.ts", content: '// astesia-allow: ASTESIA-004 -- valid fifteen character reason\nconst apiKey = "sk_live_1234567890abcdef";\n', expectedShouldTrigger: true, description: "ASTESIA-004 suppression is banned and must be rejected" },
  { id: "D5-12-BANNED-000-BLOCK", ruleId: "ASTESIA-000", category: "independent", relPath: "indep/d5_12.ts", content: '/*\n * astesia-allow: ASTESIA-000 -- valid fifteen character reason\n */\nimport { x } from "./ghost";\n', expectedShouldTrigger: true, description: "ASTESIA-000 in block comment must be rejected" },
  { id: "D5-13-BANNED-004-BLOCK", ruleId: "ASTESIA-004", category: "independent", relPath: "indep/d5_13.ts", content: '/*\n * astesia-allow: ASTESIA-004 -- valid fifteen character reason\n */\nconst apiKey = "sk_live_1234567890abcdef";\n', expectedShouldTrigger: true, description: "ASTESIA-004 in block comment must be rejected" }
];
