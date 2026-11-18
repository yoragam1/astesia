/**
 * templates/enforcement/tests/key-contract-suite.ts
 * Data-driven key contract test suite (T2 / VER4-002, -003).
 * Verifies exact positive and negative sensitivity contracts.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export interface KeyContractCase {
  id: string;
  varName: string;
  code: string;
  expectTrigger: boolean;
  desc: string;
}

export const keyContractCases: KeyContractCase[] = [
  // 1. Positive: userPwd -> MUST TRIGGER
  { id: "KC-01-USERPWD", varName: "userPwd", code: 'const userPwd = "SecretPassword123!";\n', expectTrigger: true, desc: "userPwd sensitive token" },
  // 2. Positive: dbPwd -> MUST TRIGGER
  { id: "KC-02-DBPWD", varName: "dbPwd", code: 'const dbPwd = "db_secret_pass_1234";\n', expectTrigger: true, desc: "dbPwd sensitive token" },
  // 3. Positive: passphrase -> MUST TRIGGER
  { id: "KC-03-PASSPHRASE-LOWER", varName: "passphrase", code: 'const passphrase = "correcthorsebatterystaple123";\n', expectTrigger: true, desc: "passphrase lowercase sensitive token" },
  // 4. Positive: PASSPHRASE -> MUST TRIGGER
  { id: "KC-04-PASSPHRASE-UPPER", varName: "PASSPHRASE", code: 'const PASSPHRASE = "MyMasterSecretPassphrase99";\n', expectTrigger: true, desc: "PASSPHRASE uppercase sensitive token" },
  // 5. Negative: auth -> MUST NOT TRIGGER (auth alone is non-sensitive)
  { id: "KC-05-AUTH-SOLO", varName: "auth", code: 'const auth = "authentication_module_mode";\n', expectTrigger: false, desc: "auth alone non-sensitive" },
  // 6. Negative: authorName -> MUST NOT TRIGGER
  { id: "KC-06-AUTHORNAME", varName: "authorName", code: 'const authorName = "george_orwell_author_name";\n', expectTrigger: false, desc: "authorName non-sensitive" },
  // 7. Negative: authority -> MUST NOT TRIGGER
  { id: "KC-07-AUTHORITY", varName: "authority", code: 'const authority = "certificate_revocation_root";\n', expectTrigger: false, desc: "authority non-sensitive" },
  // 8. Positive: credentials -> MUST TRIGGER
  { id: "KC-08-CREDENTIALS", varName: "credentials", code: 'const credentials = "my_user_secret_credentials_99";\n', expectTrigger: true, desc: "credentials sensitive token" },
  // 9. Positive: client_secret -> MUST TRIGGER
  { id: "KC-09-CLIENT-SECRET", varName: "client_secret", code: 'const client_secret = "cs_live_secret_value_123456";\n', expectTrigger: true, desc: "client_secret sensitive token" },
  // 10. Positive: privateKey -> MUST TRIGGER
  { id: "KC-10-PRIVATEKEY", varName: "privateKey", code: 'const privateKey = "my_private_rsa_key_material_99";\n', expectTrigger: true, desc: "privateKey sensitive pair" },
  // 11. Positive: signingKey -> MUST TRIGGER
  { id: "KC-11-SIGNINGKEY", varName: "signingKey", code: 'const signingKey = "signing_secret_hash_key_1234";\n', expectTrigger: true, desc: "signingKey sensitive pair" },
  // 12. Positive: encryptionKey -> MUST TRIGGER
  { id: "KC-12-ENCRYPTIONKEY", varName: "encryptionKey", code: 'const encryptionKey = "encryption_secret_aes_key_99";\n', expectTrigger: true, desc: "encryptionKey sensitive pair" },
  // 13. Negative: key -> MUST NOT TRIGGER (standalone key is non-sensitive)
  { id: "KC-13-KEY-SOLO", varName: "key", code: 'const key = "abcdefghijklmnopqrstuvwxyz123";\n', expectTrigger: false, desc: "key standalone non-sensitive" },
  // 14. Negative: monkey -> MUST NOT TRIGGER
  { id: "KC-14-MONKEY", varName: "monkey", code: 'const monkey = "playful_chimpanzee_jungle_123";\n', expectTrigger: false, desc: "monkey non-sensitive" },
  // 15. Positive pair: authToken -> MUST TRIGGER
  { id: "KC-15-AUTHTOKEN", varName: "authToken", code: 'const authToken = "secret_auth_token_value_99";\n', expectTrigger: true, desc: "authToken pair sensitive" },
  // 16. Positive pair: authKey -> MUST TRIGGER
  { id: "KC-16-AUTHKEY", varName: "authKey", code: 'const authKey = "secret_auth_key_signature_12";\n', expectTrigger: true, desc: "authKey pair sensitive" },
  // 17. Neutral with basic header: authHeader -> MUST TRIGGER via shape
  { id: "KC-17-AUTHHEADER", varName: "authHeader", code: 'const authHeader = "Basic dXNlcjpwYXNzd29yZA==";\n', expectTrigger: true, desc: "authHeader via Basic shape" }
];

export function runKeyContractSuite(gatePath: string, rulesPath: string, testTmpDir: string): {
  total: number;
  passed: number;
  failed: number;
  errors: string[];
} {
  const suiteDir = resolve(testTmpDir, `key-contract-${Date.now()}`);
  mkdirSync(suiteDir, { recursive: true });

  let passed = 0;
  let total = 0;
  const errors: string[] = [];

  for (const c of keyContractCases) {
    total++;
    const caseDir = resolve(suiteDir, c.id);
    mkdirSync(caseDir, { recursive: true });
    writeFileSync(resolve(caseDir, "target.ts"), c.code, "utf8");

    const r = spawnSync("bun", [
      gatePath,
      "--root", caseDir,
      "--rules", rulesPath,
      "--json"
    ], { encoding: "utf8" });

    let json: any = {};
    try { json = JSON.parse(r.stdout); } catch (e) {}
    const hasSecret = (json.violations || []).some((v: any) => v.ruleId === "ASTESIA-004");

    if (hasSecret === c.expectTrigger) {
      passed++;
    } else {
      errors.push(`FAIL: ${c.id} (${c.varName}) - expectTrigger=${c.expectTrigger}, got hasSecret=${hasSecret} [${c.desc}]`);
    }

    try { rmSync(caseDir, { recursive: true, force: true }); } catch {}
  }

  try { rmSync(suiteDir, { recursive: true, force: true }); } catch {}

  return { total, passed, failed: total - passed, errors };
}

if (import.meta.main) {
  const gate = resolve(__dirname, "../astesia-gate.ts");
  const rules = resolve(__dirname, "../anti-patterns.json");
  const tmp = resolve(__dirname, "../../../.astesia/audit/tmp");
  const res = runKeyContractSuite(gate, rules, tmp);
  console.log(`Key Contract Suite: ${res.passed}/${res.total} passed`);
  if (res.errors.length > 0) {
    for (const e of res.errors) console.error(e);
    process.exit(1);
  }
  process.exit(0);
}
