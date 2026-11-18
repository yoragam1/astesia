import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";

export function runV2Suite(gatePath: string, rulesPath: string): { total: number; passed: number; failed: number; knownGaps: number; cases: any[] } {
  const tmpDir = join(os.tmpdir(), `astesia-verify-v2-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });

  const cases: Array<{ id: string; code: string; expectTrigger: boolean; isKnownGap?: boolean; gapId?: string }> = [
    // Non-sensitive keys (Must NOT trigger)
    { id: "V2-01", code: 'const THEME_STORAGE_KEY = "terminal_portfolio_theme_123456789";\n', expectTrigger: false },
    { id: "V2-02", code: 'const CACHE_KEY = "user_cache_storage_key_123456789";\n', expectTrigger: false },
    { id: "V2-03", code: 'const QUERY_KEY = "all_user_posts_query_key_123456789";\n', expectTrigger: false },
    { id: "V2-04", code: 'const sortKey = "created_at_descending_sort_key_123456";\n', expectTrigger: false },
    { id: "V2-05", code: 'const primaryKey = "composite_primary_key_id_123456789";\n', expectTrigger: false },
    { id: "V2-06", code: 'const i18nKey = "welcome_banner_message_i18n_key_123";\n', expectTrigger: false },
    { id: "V2-07", code: 'const foreignKey = "author_profile_foreign_key_123456";\n', expectTrigger: false },
    { id: "V2-08", code: 'const monkey = "curious_george_monkey_token_abcdef12";\n', expectTrigger: false },
    { id: "V2-09", code: 'const hotkey = "ctrl_shift_alt_super_hotkey_123456";\n', expectTrigger: false },
    { id: "V2-10", code: 'const keyboard = "qwerty_mechanical_keyboard_abcdef";\n', expectTrigger: false },
    { id: "V2-11", code: 'const turkey = "thanksgiving_dinner_turkey_abcdef1";\n', expectTrigger: false },
    { id: "V2-12", code: 'const routingKey = "orders_europe_north_routing_key_1";\n', expectTrigger: false },

    // Solo 'key' and 'auth*' substring False Positives (Known Gaps in Head Gate)
    { id: "V2-13", code: 'const key = "random_dictionary_lookup_key_abcdef";\n', expectTrigger: false, isKnownGap: true, gapId: "VER3-001-FP-KEY-SOLO" },
    { id: "V2-14", code: 'const author = "alexander_pushkin_great_russian_author";\n', expectTrigger: false, isKnownGap: true, gapId: "VER3-002-FP-AUTHOR-SUBSTRING" },
    { id: "V2-15", code: 'const authorName = "george_orwell_famous_author_name_12";\n', expectTrigger: false, isKnownGap: true, gapId: "VER3-002-FP-AUTHOR-SUBSTRING" },
    { id: "V2-16", code: 'const authority = "certificate_revocation_authority_ca";\n', expectTrigger: false, isKnownGap: true, gapId: "VER3-002-FP-AUTHOR-SUBSTRING" },

    // Sensitive keys (MUST trigger)
    { id: "V2-17", code: 'const apiKey = "sk_live_1234567890abcdef12345678";\n', expectTrigger: true },
    { id: "V2-18", code: 'const api_key = "sk_test_1234567890abcdef12345678";\n', expectTrigger: true },
    { id: "V2-19", code: 'const SECRET_KEY = "my_super_secret_signing_key_12345";\n', expectTrigger: true },
    { id: "V2-20", code: 'const secretKey = "another_very_secret_key_12345678";\n', expectTrigger: true },
    { id: "V2-21", code: 'const privateKey = "pk_live_1234567890abcdef12345678";\n', expectTrigger: true },
    { id: "V2-22", code: 'const accessKey = "AKIA1234567890EXAMPLE12";\n', expectTrigger: true },
    { id: "V2-23", code: 'const AWS_SECRET_ACCESS_KEY = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";\n', expectTrigger: true },
    { id: "V2-24", code: 'const authToken = "auth_token_value_with_digits_12345";\n', expectTrigger: true },
    { id: "V2-25", code: 'const refresh_token = "rt_1234567890abcdef1234567890ab";\n', expectTrigger: true },
    { id: "V2-26", code: 'const dbPassword = "p4ssw0rd_with_special_chars_1234";\n', expectTrigger: true },
    { id: "V2-27", code: 'const client_secret = "cs_live_1234567890abcdef1234567";\n', expectTrigger: true },

    // Neutral keys with high-confidence prefixes (MUST trigger)
    { id: "V2-28", code: 'const cacheKey = "sk_live_1234567890abcdef12345678";\n', expectTrigger: true },
    { id: "V2-29", code: 'const label = "ghp_1234567890abcdef1234567890abcdef12";\n', expectTrigger: true },
    { id: "V2-30", code: 'const title = "gho_1234567890abcdef1234567890abcdef12";\n', expectTrigger: true },
    { id: "V2-31", code: 'const config = "AKIAIOSFODNN7EXAMPLE1";\n', expectTrigger: true },
    { id: "V2-32", code: 'const data = "xoxb-123456789012-1234567890123-abcdef123456";\n', expectTrigger: true },
    { id: "V2-33", code: 'const item = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc";\n', expectTrigger: true },

    // UI text under neutral keys (MUST NOT trigger)
    { id: "V2-34", code: 'const label = "Basic configuration";\n', expectTrigger: false },
    { id: "V2-35", code: 'const title = "Basic information";\n', expectTrigger: false },
    { id: "V2-36", code: 'const description = "Basic subscription";\n', expectTrigger: false },
    { id: "V2-37", code: 'const message = "Bearer authentication";\n', expectTrigger: false },
    { id: "V2-38", code: 'const placeholder = "Enter your password";\n', expectTrigger: false },
    { id: "V2-39", code: 'const heading = "Basic Pricing Plans";\n', expectTrigger: false },

    // Credential header formats (Under sensitive key -> triggers; under neutral key -> FN Known Gap)
    { id: "V2-40", code: 'const authHeader = "Basic dXNlcm5hbWU6cGFzc3dvcmQ=";\n', expectTrigger: true },
    { id: "V2-41", code: 'const authHeader = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc";\n', expectTrigger: true, isKnownGap: true, gapId: "VER3-008-FN-BEARER-JWT-MISSING-DOT" },
    { id: "V2-42", code: 'const label = "Basic dXNlcm5hbWU6cGFzc3dvcmQ=";\n', expectTrigger: true, isKnownGap: true, gapId: "VER3-003-FN-BEARER-BASIC-NEUTRAL-KEY" },
    { id: "V2-43", code: 'const description = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc";\n', expectTrigger: true, isKnownGap: true, gapId: "VER3-003-FN-BEARER-BASIC-NEUTRAL-KEY" },

    // SEC-01..15 from Wave 1.1 corpus
    { id: "SEC-01", code: 'const apiKey = "sk_live_51Mz0123456789abcdef";\n', expectTrigger: true },
    { id: "SEC-02", code: 'const api_key = "ghp_1234567890abcdef1234567890abcdef12";\n', expectTrigger: true },
    { id: "SEC-03", code: 'const SECRET_KEY = "AKIA1234567890EXAMPLE";\n', expectTrigger: true },
    { id: "SEC-04", code: 'const dbPassword = "superSecretPassword123!";\n', expectTrigger: true },
    { id: "SEC-05", code: 'const token = "xoxb-1234567890-123456789012-abcdef123456";\n', expectTrigger: true },
    { id: "SEC-06", code: 'const client_secret = "cs_live_1234567890abcdef12345678";\n', expectTrigger: true },
    { id: "SEC-07", code: 'const privateKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc";\n', expectTrigger: true },
    { id: "SEC-08", code: 'const authToken = "abcdef1234567890abcdef";\n', expectTrigger: true },
    { id: "SEC-09", code: 'const api_secret = "secret_with_numbers_123456";\n', expectTrigger: true },
    { id: "SEC-10", code: 'const passwordField = "password123456";\n', expectTrigger: true },
    { id: "SEC-11", code: 'const apiKeyPlaceholder = "your-api-key-here";\n', expectTrigger: false },
    { id: "SEC-12", code: 'const passwordLabel = "Password:";\n', expectTrigger: false },
    { id: "SEC-13", code: 'const secretName = "ProductionSecret";\n', expectTrigger: false },
    { id: "SEC-14", code: 'const tokenType = "Bearer";\n', expectTrigger: false },
    { id: "SEC-15", code: 'const authDescription = "Basic authentication with username and password";\n', expectTrigger: false },
    { id: "SEC-16", code: 'const userToken = "my_snake_case_secret_token";\n', expectTrigger: true },
    { id: "SEC-17", code: 'const apiLabel = "Enter Your Secret API Key Below";\n', expectTrigger: false },
    { id: "SEC-18", code: 'const tokenField = "sk_test_51Mz0123456789abcdef";\n', expectTrigger: true },
    { id: "SEC-19", code: 'const passwordName = "sk_live_1234567890abcdef";\n', expectTrigger: true },
    { id: "SEC-20", code: 'const passwordPlaceholder = "your-account-password";\n', expectTrigger: false },
    { id: "SEC-21", code: 'const tokenType = "application/json";\n', expectTrigger: false },
    { id: "SEC-22", code: 'const apiKeyLabel = "API Key:";\n', expectTrigger: false },
    { id: "SEC-23-GAP", code: 'const tokenField = "my_snake_case_secret_token";\n', expectTrigger: true, isKnownGap: true },
    { id: "SEC-24", code: 'const secret = "a1b2c3d4e5f6g7h8";\n', expectTrigger: true },
    { id: "SEC-25", code: 'const authHeader = "Basic dXNlcm5hbWU6cGFzc3dvcmQ=";\n', expectTrigger: true }
  ];

  let passed = 0;
  let failed = 0;
  let knownGaps = 0;
  const evaluatedCases: any[] = [];

  for (const c of cases) {
    const testFile = join(tmpDir, `${c.id}.ts`);
    writeFileSync(testFile, c.code, "utf8");

    const r = spawnSync("bun", [
      gatePath,
      "--root", tmpDir,
      "--rules", rulesPath,
      "--json"
    ], { encoding: "utf8" });

    let triggered = false;
    try {
      const data = JSON.parse(r.stdout);
      triggered = data.violations?.some((v: any) => v.file.includes(c.id) && v.ruleId === "ASTESIA-004");
    } catch {}

    const matchesExpectation = triggered === c.expectTrigger;
    if (matchesExpectation) {
      passed++;
      evaluatedCases.push({ id: c.id, status: "PASSED", triggered, expectTrigger: c.expectTrigger });
    } else if (c.isKnownGap) {
      knownGaps++;
      evaluatedCases.push({ id: c.id, status: "KNOWN_GAP", gapId: c.gapId, triggered, expectTrigger: c.expectTrigger });
    } else {
      failed++;
      evaluatedCases.push({ id: c.id, status: "FAILED", triggered, expectTrigger: c.expectTrigger });
    }

    try { rmSync(testFile, { force: true }); } catch {}
  }

  try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  return { total: cases.length, passed, failed, knownGaps, cases: evaluatedCases };
}
