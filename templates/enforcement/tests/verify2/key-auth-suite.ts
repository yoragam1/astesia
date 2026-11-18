import { spawnSync } from "child_process";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

export interface VerifyCase {
  id: string;
  code: string;
  expectTrigger: boolean;
  desc: string;
  isKnownGap?: boolean;
}

export const keyAuthCases: VerifyCase[] = [
  // 1. CONTRACT NEVER-TRIGGER (Neutral keys and substrings)
  { id: "V2A2-KEY-SOLO-1", code: 'const key = "abcdefghijklmnopqrstuvwxyz123";\n', expectTrigger: false, desc: "key solo non-sensitive" },
  { id: "V2A2-KEY-SOLO-2", code: 'const storageKey = "theme_dark_mode_preference";\n', expectTrigger: false, desc: "storageKey qualified non-sensitive" },
  { id: "V2A2-KEY-SOLO-3", code: 'const cacheKey = "user_profile_cache_v1";\n', expectTrigger: false, desc: "cacheKey qualified non-sensitive" },
  { id: "V2A2-KEY-SOLO-4", code: 'const queryKey = "posts_by_category_all";\n', expectTrigger: false, desc: "queryKey qualified non-sensitive" },
  { id: "V2A2-KEY-SOLO-5", code: 'const sortKey = "created_at_descending";\n', expectTrigger: false, desc: "sortKey qualified non-sensitive" },
  { id: "V2A2-KEY-SOLO-6", code: 'const primaryKey = "id_column_primary_uuid";\n', expectTrigger: false, desc: "primaryKey qualified non-sensitive" },
  { id: "V2A2-KEY-SOLO-7", code: 'const foreignKey = "author_id_foreign_uuid";\n', expectTrigger: false, desc: "foreignKey qualified non-sensitive" },
  { id: "V2A2-KEY-SOLO-8", code: 'const themeKey = "dark_high_contrast_theme";\n', expectTrigger: false, desc: "themeKey qualified non-sensitive" },
  { id: "V2A2-KEY-SOLO-9", code: 'const i18nKey = "dashboard_welcome_header";\n', expectTrigger: false, desc: "i18nKey qualified non-sensitive" },
  { id: "V2A2-KEY-SOLO-10", code: 'const monkey = "playful_chimpanzee_12345";\n', expectTrigger: false, desc: "monkey non-sensitive" },
  { id: "V2A2-KEY-SOLO-11", code: 'const hotkey = "ctrl_shift_alt_key_cmd";\n', expectTrigger: false, desc: "hotkey non-sensitive" },
  { id: "V2A2-KEY-SOLO-12", code: 'const turkey = "delicious_thanksgiving_dinner";\n', expectTrigger: false, desc: "turkey non-sensitive" },
  { id: "V2A2-AUTH-SUBSTR-1", code: 'const author = "alexander_pushkin_writer";\n', expectTrigger: false, desc: "author substring non-sensitive" },
  { id: "V2A2-AUTH-SUBSTR-2", code: 'const authorName = "george_orwell_author";\n', expectTrigger: false, desc: "authorName non-sensitive" },
  { id: "V2A2-AUTH-SUBSTR-3", code: 'const authority = "certificate_authority_root";\n', expectTrigger: false, desc: "authority substring non-sensitive" },
  { id: "V2A2-AUTH-SOLO", code: 'const auth = "authentication_module_mode";\n', expectTrigger: false, desc: "auth solo non-sensitive (VER4-003 GAP)", isKnownGap: true },

  // 2. CONTRACT MUST-TRIGGER (Sensitive key pairs and tokens)
  { id: "V2A2-SENS-API-KEY", code: 'const apiKey = "sk_live_1234567890abcdef12345678";\n', expectTrigger: true, desc: "apiKey strong prefix" },
  { id: "V2A2-SENS-X-API-KEY", code: 'const xApiKey = "secretval1234567890";\n', expectTrigger: true, desc: "xApiKey sensitive pair" },
  { id: "V2A2-SENS-AWS-KEY", code: 'const AWS_SECRET_ACCESS_KEY = "AKIA1234567890ABCDEF12";\n', expectTrigger: true, desc: "AWS key sensitive pair" },
  { id: "V2A2-SENS-PRIVATE-KEY", code: 'const privateKey = "my_private_signing_key_123";\n', expectTrigger: true, desc: "privateKey sensitive pair" },
  { id: "V2A2-SENS-SECRET-KEY", code: 'const secretKey = "super_secret_payload_key_99";\n', expectTrigger: true, desc: "secretKey sensitive pair" },
  { id: "V2A2-SENS-ACCESS-KEY", code: 'const accessKey = "access_token_credential_12";\n', expectTrigger: true, desc: "accessKey sensitive pair" },
  { id: "V2A2-SENS-AUTH-KEY", code: 'const authKey = "auth_signature_key_99999";\n', expectTrigger: true, desc: "authKey sensitive pair" },
  { id: "V2A2-SENS-SIGNING-KEY", code: 'const signingKey = "signing_secret_hash_key_12";\n', expectTrigger: true, desc: "signingKey sensitive pair" },
  { id: "V2A2-SENS-ENCRYPT-KEY", code: 'const encryptionKey = "encryption_secret_pass_123";\n', expectTrigger: true, desc: "encryptionKey sensitive pair" },
  { id: "V2A2-SENS-PASSWORD", code: 'const dbPassword = "SuperSecurePassword123!";\n', expectTrigger: true, desc: "dbPassword sensitive token" },
  { id: "V2A2-SENS-REFRESH-TOKEN", code: 'const refreshToken = "jwt_opaque_refresh_token_99";\n', expectTrigger: true, desc: "refreshToken sensitive token" },
  { id: "V2A2-SENS-OPENAI-KEY", code: 'const OPENAI_API_KEY = "sk-proj-1234567890abcdef123456";\n', expectTrigger: true, desc: "OPENAI_API_KEY sensitive token" },
  { id: "V2A2-SENS-PWD", code: 'const userPwd = "UserSecretPassword99!";\n', expectTrigger: true, desc: "userPwd missing token (VER4-002 GAP)", isKnownGap: true },
  { id: "V2A2-SENS-PASSPHRASE", code: 'const passphrase = "correcthorsebatterystaple";\n', expectTrigger: true, desc: "passphrase missing token (VER4-002 GAP)", isKnownGap: true },

  // 3. HTTP AUTH HEADERS UNDER NEUTRAL KEYS (Basic & Bearer)
  { id: "V2A2-BASIC-LABEL", code: 'const label = "Basic dXNlcjpwYXNzd29yZA==";\n', expectTrigger: true, desc: "Basic user:password base64 under label" },
  { id: "V2A2-BASIC-TITLE", code: 'const title = "Basic YWRtaW46c2VjcmV0MTIz";\n', expectTrigger: true, desc: "Basic admin:secret123 base64 under title" },
  { id: "V2A2-BASIC-DESC", code: 'const description = "Basic YXBpa2V5OnNlY3JldA==";\n', expectTrigger: true, desc: "Basic apikey:secret base64 under description" },
  { id: "V2A2-BASIC-PLACEHOLDER", code: 'const placeholder = "Basic cm9vdDpwYXNzMTIz";\n', expectTrigger: true, desc: "Basic root:pass123 under placeholder" },
  { id: "V2A2-BEARER-JWT-LABEL", code: 'const label = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozGzN_ce";\n', expectTrigger: true, desc: "Bearer JWT under label" },
  { id: "V2A2-BEARER-JWT-DESC", code: 'const description = "Bearer eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyIjoiYWRtaW4ifQ.signature12345";\n', expectTrigger: true, desc: "Bearer JWT under description" },
  { id: "V2A2-BEARER-OPAQUE-TITLE", code: 'const title = "Bearer AbCdEf1234567890XyZ98765";\n', expectTrigger: true, desc: "Bearer opaque alphanumeric >=20 under title" },
  { id: "V2A2-BEARER-OPAQUE-X", code: 'const x = "Bearer aB3dE5gH7jK9mN1pQ3sU5wY7";\n', expectTrigger: true, desc: "Bearer opaque alphanumeric >=20 under x" },

  // 4. UI TEXT WITH BASIC / BEARER (MUST NOT TRIGGER)
  { id: "V2A2-UI-BASIC-CONFIG", code: 'const label = "Basic configuration";\n', expectTrigger: false, desc: "UI text Basic configuration" },
  { id: "V2A2-UI-BASIC-INFO", code: 'const label = "Basic information";\n', expectTrigger: false, desc: "UI text Basic information" },
  { id: "V2A2-UI-BASIC-PRICING", code: 'const title = "Basic Pricing Plans";\n', expectTrigger: false, desc: "UI text Basic Pricing Plans" },
  { id: "V2A2-UI-BASIC-SUBSCRIPTION", code: 'const desc = "Basic subscription";\n', expectTrigger: false, desc: "UI text Basic subscription" },
  { id: "V2A2-UI-BEARER-AUTH", code: 'const desc = "Bearer authentication";\n', expectTrigger: false, desc: "UI text Bearer authentication" },
  { id: "V2A2-UI-BEARER-TOKEN-REQ", code: 'const placeholder = "Bearer token required";\n', expectTrigger: false, desc: "UI text Bearer token required" },
  { id: "V2A2-UI-BEARER-TOKENS", code: 'const desc = "Bearer tokens";\n', expectTrigger: false, desc: "UI text Bearer tokens" },
  { id: "V2A2-BEARER-INTERPOLATION", code: 'const header = `Bearer ${token}`;\n', expectTrigger: false, desc: "Template literal Bearer interpolation" }
];

export function runKeyAuthSuite(gatePath: string, rulesPath: string) {
  const tmpDir = join(tmpdir(), "astesia_verify2_keyauth_" + Date.now());
  mkdirSync(tmpDir, { recursive: true });

  const results: any[] = [];
  let passedCount = 0;
  let failedCount = 0;
  let gapCount = 0;

  for (const tc of keyAuthCases) {
    const fPath = join(tmpDir, `${tc.id}.ts`);
    writeFileSync(fPath, tc.code, "utf8");

    const r = spawnSync("bun", [gatePath, "--root", tmpDir, "--rules", rulesPath, "--json"], { encoding: "utf8" });
    try { rmSync(fPath); } catch {}

    let json: any = {};
    try { json = JSON.parse(r.stdout); } catch {}

    const has004 = (json.violations || []).some((v: any) => v.ruleId === "ASTESIA-004");
    const matched = has004 === tc.expectTrigger;

    if (matched) {
      passedCount++;
      results.push({ id: tc.id, status: "PASSED", desc: tc.desc });
    } else if (tc.isKnownGap) {
      gapCount++;
      results.push({ id: tc.id, status: "KNOWN_GAP", desc: tc.desc });
    } else {
      failedCount++;
      results.push({ id: tc.id, status: "FAILED", desc: tc.desc, expected: tc.expectTrigger, got: has004 });
    }
  }

  try { rmSync(tmpDir, { recursive: true }); } catch {}

  return {
    total: keyAuthCases.length,
    passed: passedCount,
    failed: failedCount,
    known_gaps: gapCount,
    results
  };
}
