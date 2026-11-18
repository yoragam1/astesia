import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

export interface HelmKeyTestCase {
  id: string;
  name: string;
  filename: string;
  content: string;
  shouldTrigger: boolean; // true = expect violation, false = exempt
  isKnownGap?: boolean;
}

export const HELM_CASES: HelmKeyTestCase[] = [
  // MUST NOT TRIGGER (Helm key names: ending in key, preceded by password/passwd/pwd/passphrase/token/credential/credentials, value is identifier ^[a-z][a-z._-]{0,39}$ with no digits)
  { id: "HK-01", name: "adminPasswordKey identifier", filename: "values.yaml", content: "adminPasswordKey: postgres-password\n", shouldTrigger: false },
  { id: "HK-02", name: "passwordKey identifier db-password", filename: "values.yaml", content: "passwordKey: db-password\n", shouldTrigger: false },
  { id: "HK-03", name: "tokenKey identifier api-token", filename: "values.yaml", content: "tokenKey: api-token\n", shouldTrigger: false },
  { id: "HK-04", name: "passwordKey plain word password", filename: "values.yaml", content: "passwordKey: password\n", shouldTrigger: false },
  { id: "HK-05", name: "credentialKey identifier cred-name", filename: "values.yaml", content: "credentialKey: my-cred-name\n", shouldTrigger: false },
  { id: "HK-06", name: "pwdKey identifier app-pwd", filename: "values.yaml", content: "pwdKey: app-pwd\n", shouldTrigger: false },
  { id: "HK-07", name: "passphraseKey identifier ssh-pass", filename: "values.yaml", content: "passphraseKey: ssh-passphrase-key\n", shouldTrigger: false },

  // MUST TRIGGER (Actual secrets or explicitly sensitive keys like secretKey, apiKey, privateKey, accessKey)
  { id: "HK-08", name: "secretKey is ALWAYS sensitive", filename: "values.yaml", content: "secretKey: AbCd1234EfGh5678\n", shouldTrigger: true },
  { id: "HK-09", name: "apiKey is ALWAYS sensitive", filename: "values.yaml", content: "apiKey: sk_live_1234567890abcdef\n", shouldTrigger: true },
  { id: "HK-10", name: "adminPasswordKey with complex literal (digits & punctuation)", filename: "values.yaml", content: "adminPasswordKey: Hunter2Hunter2!\n", shouldTrigger: true },
  { id: "HK-11", name: "passwordKey with digits (not pure identifier)", filename: "values.yaml", content: "passwordKey: abc123def456\n", shouldTrigger: true },
  { id: "HK-12", name: "privateKey is ALWAYS sensitive", filename: "values.yaml", content: "privateKey: MIIEvQIBADANBgkqhkiG9w0BAQEFAASC\n", shouldTrigger: true },
  { id: "HK-13", name: "accessKey is ALWAYS sensitive", filename: "values.yaml", content: "accessKey: AKIAIOSFODNN7EXAMPLE\n", shouldTrigger: true },

  // KNOWN GAP (Accepted consequence: lowercase passphrase under *PasswordKey is treated as key name)
  { id: "HK-14", name: "HELM-KEYNAME-GAP: lowercase passphrase under passwordKey", filename: "values.yaml", content: "passwordKey: correcthorsebatterystaple\n", shouldTrigger: false, isKnownGap: true }
];

export function runHelmKeyNameSuite(): { total: number; passed: number; failed: number; errors: string[] } {
  let passed = 0;
  let failed = 0;
  const errors: string[] = [];

  const gatePath = path.resolve("templates/enforcement/astesia-gate.ts");
  const rulesPath = path.resolve("templates/enforcement/anti-patterns.json");

  for (const tc of HELM_CASES) {
    const tmpDir = fs.mkdtempSync(path.join(path.resolve(".astesia/audit/tmp"), "helm-"));
    try {
      const filePath = path.join(tmpDir, tc.filename);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, tc.content, "utf8");

      const res = spawnSync("bun", [gatePath, "--root", tmpDir, "--rules", rulesPath, "--json"], { encoding: "utf8" });
      const parsed = JSON.parse(res.stdout);

      const hasViolation = parsed.violations.some((v: any) => v.ruleId === "ASTESIA-010" || v.ruleId === "ASTESIA-004");

      if (hasViolation === tc.shouldTrigger) {
        passed++;
      } else {
        failed++;
        errors.push(
          `FAIL: ${tc.id} (${tc.name}) - expected trigger=${tc.shouldTrigger}, got hasViolation=${hasViolation} (violations: ${JSON.stringify(parsed.violations)})`
        );
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  return { total: passed + failed, passed, failed, errors };
}

if (import.meta.main) {
  const r = runHelmKeyNameSuite();
  console.log(`Helm KeyName Suite: ${r.passed}/${r.total} passed (${r.failed} failed)`);
  if (r.errors.length > 0) {
    console.error(r.errors.join("\n"));
    process.exit(1);
  }
}
