/**
 * templates/enforcement/tests/auth-header-suite.ts
 * Tests for F-C: shape-based detection of Basic and Bearer auth headers (VER3-003, VER3-008).
 */
import { isAuthBearerOrBasic } from "../astesia-gate";
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function runAuthHeaderSuite(testTmpDir: string, gatePath: string): {
  total: number;
  passed: number;
  failed: number;
  errors: string[];
} {
  const errors: string[] = [];
  let passed = 0;
  let total = 0;

  function assert(name: string, cond: boolean, msg?: string) {
    total++;
    if (cond) {
      passed++;
    } else {
      errors.push(`FAIL: ${name}${msg ? " - " + msg : ""}`);
    }
  }

  // Unit tests on isAuthBearerOrBasic
  // 1. Positive Basic auth
  // "admin:secret123" -> YWRtaW46c2VjcmV0MTIz
  assert("Basic admin:secret123", isAuthBearerOrBasic("Basic YWRtaW46c2VjcmV0MTIz"));
  // "aladdin:opensesame" -> YWxhZGRpbjpvcGVuc2VzYW1l
  assert("Basic aladdin:opensesame", isAuthBearerOrBasic("Basic YWxhZGRpbjpvcGVuc2VzYW1l"));
  // Case insensitivity of "basic"
  assert("basic aladdin:opensesame (lowercase)", isAuthBearerOrBasic("basic YWxhZGRpbjpvcGVuc2VzYW1l"));

  // 2. Positive Bearer JWT
  const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
  assert("Bearer JWT (with dots)", isAuthBearerOrBasic(`Bearer ${jwt}`));
  assert("bearer JWT (lowercase)", isAuthBearerOrBasic(`bearer ${jwt}`));

  // 3. Positive Bearer opaque token (>= 20 chars, digits and letters)
  assert("Bearer opaque token 24 chars", isAuthBearerOrBasic("Bearer a1b2c3d4e5f6g7h8i9j0k1l2"));
  assert("Bearer token with hyphens/underscores", isAuthBearerOrBasic("Bearer tok_sec_1234567890abcdef_xyz"));

  // 4. Negative Basic: English phrases
  assert("Neg: Basic configuration", !isAuthBearerOrBasic("Basic configuration"));
  assert("Neg: Basic information", !isAuthBearerOrBasic("Basic information"));
  assert("Neg: Basic setup", !isAuthBearerOrBasic("Basic setup"));
  assert("Neg: Basic example", !isAuthBearerOrBasic("Basic example"));

  // 5. Negative Basic: valid base64 but no colon (e.g. "hello world" -> aGVsbG8gd29ybGQ=)
  assert("Neg: Basic base64 without colon", !isAuthBearerOrBasic("Basic aGVsbG8gd29ybGQ="));

  // 6. Negative Bearer: English phrases
  assert("Neg: Bearer authentication", !isAuthBearerOrBasic("Bearer authentication"));
  assert("Neg: Bearer token required", !isAuthBearerOrBasic("Bearer token required"));
  assert("Neg: Bearer authorization header", !isAuthBearerOrBasic("Bearer authorization header"));
  assert("Neg: Bearer standard", !isAuthBearerOrBasic("Bearer standard"));

  // 7. Negative Bearer: short string or pure letters
  assert("Neg: Bearer short", !isAuthBearerOrBasic("Bearer short123"));
  assert("Neg: Bearer pure letters 20 chars", !isAuthBearerOrBasic("Bearer purelyalphabeticwordstring"));

  // Integration test with gate execution: neutral keys MUST trigger
  {
    const suiteDir = join(testTmpDir, `auth-header-${Date.now()}`);
    mkdirSync(suiteDir, { recursive: true });

    const rules = {
      rules: [
        {
          id: "ASTESIA-004",
          name: "Hardcoded Secrets",
          severity: "error",
          kind: "line-regex",
          description: "Hardcoded secret detected",
          fix: "Use environment variables",
          origin: "SEC-004"
        }
      ]
    };
    writeFileSync(join(suiteDir, "rules.json"), JSON.stringify(rules, null, 2), "utf8");

    // File with Basic and Bearer under NEUTRAL variable names
    const testCode = `
      const label = "Basic YWRtaW46c2VjcmV0MTIz";
      const description = "Bearer ${jwt}";
      const neutralVar = "Bearer a1b2c3d4e5f6g7h8i9j0k1l2";
      const innocent1 = "Basic configuration";
      const innocent2 = "Bearer authentication";
    `;
    writeFileSync(join(suiteDir, "test.ts"), testCode, "utf8");

    const r = spawnSync("bun", [gatePath, "--root", suiteDir, "--rules", join(suiteDir, "rules.json"), "--json"], {
      encoding: "utf8"
    });
    let parsed: any = {};
    try { parsed = JSON.parse(r.stdout); } catch {}
    const violations = parsed.violations || [];
    const astesia004 = violations.filter((v: any) => v.ruleId === "ASTESIA-004");

    assert("Neutral key Basic is caught by gate", astesia004.some((v: any) => v.line === 2));
    assert("Neutral key Bearer JWT is caught by gate", astesia004.some((v: any) => v.line === 3));
    assert("Neutral key Bearer opaque token is caught by gate", astesia004.some((v: any) => v.line === 4));
    assert("Innocent Basic configuration is NOT flagged", !astesia004.some((v: any) => v.line === 5));
    assert("Innocent Bearer authentication is NOT flagged", !astesia004.some((v: any) => v.line === 6));
    assert("Gate exit code is 1 (3 secrets detected)", r.status === 1 && astesia004.length === 3);

    try { rmSync(suiteDir, { recursive: true, force: true }); } catch {}
  }

  return { total, passed, failed: total - passed, errors };
}

if (import.meta.main) {
  const gate = join(__dirname, "../astesia-gate.ts");
  const tmp = join(__dirname, "../../../.astesia/audit/tmp");
  const res = runAuthHeaderSuite(tmp, gate);
  console.log(`Auth Header Suite: ${res.passed}/${res.total} passed`);
  if (res.errors.length > 0) {
    for (const e of res.errors) console.error(e);
    process.exit(1);
  }
  process.exit(0);
}
