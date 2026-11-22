/**
 * templates/enforcement/tests/config-secrets-suite.ts
 * Config profile secret triggers and exemptions test suite (T3 / V3-06).
 * Verifies Decision 2 & 3: E1 disabled in config, E1 preserved in code files.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export interface ConfigSecretCase {
  id: string;
  file: string;
  content: string;
  expectTrigger: boolean;
  desc: string;
}

export const configSecretCases: ConfigSecretCase[] = [
  // MUST TRIGGER (Config profile: E1 disabled, secrets with space/PascalCase or after hash trigger)
  {
    id: "CS-01-YAML-HASH-WITH-SPACE",
    file: "docker-compose.yml",
    content: 'services:\n  db:\n    environment:\n      PASSWORD: "foo # secret123456"\n',
    expectTrigger: true,
    desc: "YAML password containing hash with space must trigger"
  },
  {
    id: "CS-02-ENV-SECRET-HASH-SPACE",
    file: ".env",
    content: 'SECRET="p4ss word # more"\nAPP=1\n',
    expectTrigger: true,
    desc: "Dotenv secret with space and hash must trigger"
  },
  {
    id: "CS-03-YAML-PREFIX-AFTER-HASH",
    file: "docker-compose.yml",
    content: "TOKEN: 'x # ghp_1234567890abcdef12345678'\n",
    expectTrigger: true,
    desc: "YAML token with strong prefix after hash must trigger"
  },
  {
    id: "CS-04-YAML-UNQUOTED-SPACED-PASSWORD",
    file: "config.yaml",
    content: "password: correct horse battery staple\n",
    expectTrigger: true,
    desc: "YAML unquoted password with spaces must trigger"
  },
  {
    id: "CS-05-ENV-SPACED-PASSWORD",
    file: ".env.production",
    content: "DB_PASSWORD=my secret value 123456\n",
    expectTrigger: true,
    desc: "Dotenv DB_PASSWORD with space must trigger"
  },
  {
    id: "CS-06-YAML-PASCALCASE-PASSWORD",
    file: "docker-compose.yml",
    content: "POSTGRES_PASSWORD: ChangeMe123456\n",
    expectTrigger: true,
    desc: "YAML PascalCase password must trigger (E1 disabled in config)"
  },
  {
    id: "CS-07-COMPOSE-LIST-FALLBACK",
    file: "docker-compose.yml",
    content: "services:\n  app:\n    environment:\n      - JWT_SECRET=${JWT_SECRET:-rahasia_jwt_super_aman_123456}\n",
    expectTrigger: true,
    desc: "Compose list with literal secret in fallback must trigger"
  },
  {
    id: "CS-08-ENV-PLAIN-PASSWORD",
    file: ".env",
    content: "PASSWORD=SuperSecretPass99!\n",
    expectTrigger: true,
    desc: "Dotenv plain password must trigger"
  },
  {
    id: "CS-09-YAML-STRONG-PREFIX",
    file: "secrets.yml",
    content: 'API_KEY: "sk_live_1234567890abcdef12345678"\n',
    expectTrigger: true,
    desc: "YAML strong prefix API_KEY must trigger"
  },
  {
    id: "CS-10-YAML-CAMELCASE-SECRET",
    file: "values.yaml",
    content: 'appSecret: "my_custom_secret_val_123456"\n',
    expectTrigger: true,
    desc: "YAML camelCase appSecret must trigger"
  },
  {
    id: "CS-11-YAML-SNAKECASE-SECRET",
    file: "settings.yaml",
    content: 'secret_pass: "super_secret_value_999999"\n',
    expectTrigger: true,
    desc: "YAML snake_case secret_pass must trigger"
  },
  {
    id: "CS-12-ENV-PASS-TOKEN",
    file: ".env",
    content: 'DB_PASS="pass_with_number_123456"\n',
    expectTrigger: true,
    desc: "Dotenv DB_PASS must trigger"
  },

  // MUST NOT TRIGGER (Non-sensitive keys, references, interpolation, paths, short values)
  {
    id: "CS-13-NON-SENSITIVE-DESC",
    file: "config.yaml",
    content: 'description: "Enter your password"\n',
    expectTrigger: false,
    desc: "description key must not trigger"
  },
  {
    id: "CS-14-PASSWORD-LABEL",
    file: "config.yaml",
    content: "passwordLabel: Password\n",
    expectTrigger: false,
    desc: "passwordLabel with simple text must not trigger"
  },
  {
    id: "CS-15-SECRET-NAME",
    file: "k8s.yaml",
    content: "secretName: db-credentials\n",
    expectTrigger: false,
    desc: "secretName reference must not trigger"
  },
  {
    id: "CS-16-SECRET-REF",
    file: "k8s.yaml",
    content: "secretRef: db-credentials\n",
    expectTrigger: false,
    desc: "secretRef reference must not trigger"
  },
  {
    id: "CS-17-EXISTING-SECRET",
    file: "values.yaml",
    content: "existingSecret: my-release-db\n",
    expectTrigger: false,
    desc: "existingSecret reference must not trigger"
  },
  {
    id: "CS-18-PASSWORD-FILE-PATH",
    file: "docker-compose.yml",
    content: "passwordFile: /run/secrets/db_password\n",
    expectTrigger: false,
    desc: "passwordFile unix path must not trigger"
  },
  {
    id: "CS-19-TOKEN-FILE-PATH",
    file: "k8s.yaml",
    content: "tokenFile: /var/run/secrets/token\n",
    expectTrigger: false,
    desc: "tokenFile unix path must not trigger"
  },
  {
    id: "CS-20-ENV-INTERPOLATION-PURE",
    file: "docker-compose.yml",
    content: "password: ${DB_PASSWORD}\n",
    expectTrigger: false,
    desc: "Pure env interpolation without fallback must not trigger"
  },
  {
    id: "CS-21-ENV-INTERPOLATION-REQUIRED",
    file: "docker-compose.yml",
    content: "password: ${DB_PASSWORD:?required}\n",
    expectTrigger: false,
    desc: "Required env interpolation must not trigger"
  },
  {
    id: "CS-22-GHA-SECRETS-INTERPOLATION",
    file: ".github/workflows/ci.yml",
    content: "token: ${{ secrets.NPM_TOKEN }}\n",
    expectTrigger: false,
    desc: "GitHub Actions secrets interpolation must not trigger"
  },
  {
    id: "CS-23-HELM-VALUES-INTERPOLATION",
    file: "deployment.yaml",
    content: "password: {{ .Values.db.password }}\n",
    expectTrigger: false,
    desc: "Helm values interpolation must not trigger"
  },
  {
    id: "CS-24-K8S-SECRET-KEY-REF",
    file: "pod.yaml",
    content: "secretKeyRef: {name: db, key: password}\n",
    expectTrigger: false,
    desc: "Kubernetes secretKeyRef mapping must not trigger"
  },
  {
    id: "CS-25-PASSWORD-SHORT",
    file: ".env",
    content: "PASSWORD=short\n",
    expectTrigger: false,
    desc: "Password < 8 chars must not trigger"
  },
  // 26. CODE FILE: E1 space exemption holds in code files
  {
    id: "CS-26-CODE-FILE-E1-HOLDS",
    file: "src/prompt.ts",
    content: 'const promptConfig = { password: "Please enter your password" };\n',
    expectTrigger: false,
    desc: "E1 space exemption holds in code (.ts) files"
  }
];

export function runConfigSecretsSuite(gatePath: string, rulesPath: string, testTmpDir: string): {
  total: number;
  passed: number;
  failed: number;
  errors: string[];
} {
  const suiteDir = resolve(testTmpDir, `config-secrets-${Date.now()}`);
  mkdirSync(suiteDir, { recursive: true });

  let passed = 0;
  let total = 0;
  const errors: string[] = [];

  for (const c of configSecretCases) {
    total++;
    const caseDir = resolve(suiteDir, c.id);
    mkdirSync(caseDir, { recursive: true });

    const filePath = resolve(caseDir, c.file);
    const parent = resolve(filePath, "..");
    if (!existsSync(parent)) mkdirSync(parent, { recursive: true });
    writeFileSync(filePath, c.content, "utf8");

    // Init git repo so env classification works deterministically
    spawnSync("git", ["init"], { cwd: caseDir });
    spawnSync("git", ["add", "-A"], { cwd: caseDir });

    const r = spawnSync("bun", [
      gatePath,
      "--root", caseDir,
      "--rules", rulesPath,
      "--json"
    ], { encoding: "utf8" });

    let json: any = {};
    try { json = JSON.parse(r.stdout); } catch (e) {}
    const triggered = (json.violations || []).some((v: any) => v.ruleId === "ASTESIA-004" || v.ruleId === "ASTESIA-010");

    if (triggered === c.expectTrigger) {
      passed++;
    } else {
      errors.push(`FAIL: ${c.id} (${c.file}) - expectTrigger=${c.expectTrigger}, got triggered=${triggered} [${c.desc}]`);
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
  const res = runConfigSecretsSuite(gate, rules, tmp);
  console.log(`Config Secrets Suite: ${res.passed}/${res.total} passed`);
  if (res.errors.length > 0) {
    for (const e of res.errors) console.error(e);
    process.exit(1);
  }
  process.exit(0);
}
