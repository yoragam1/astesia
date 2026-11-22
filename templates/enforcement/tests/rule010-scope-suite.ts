/**
 * templates/enforcement/tests/rule010-scope-suite.ts
 * Scope expansion test suite for ASTESIA-010 (T4 / V4-06).
 * Covers all *.yml, *.yaml, Dockerfile*, .env* (except .example/.template/.sample).
 * Covers mapping (KEY: v), list (- KEY=v), and dotenv (KEY=v).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export interface Rule010ScopeCase {
  id: string;
  file: string;
  content: string;
  expectTrigger: boolean;
  desc: string;
}

export const rule010ScopeCases: Rule010ScopeCase[] = [
  // MUST TRIGGER: YAML, Dockerfile, Compose, Dotenv mapping & list
  {
    id: "R010-01-APP-YML",
    file: "config/app.yml",
    content: 'password: "hunter2hunter2hunter2"\n',
    expectTrigger: true,
    desc: "config/app.yml with password must trigger ASTESIA-010"
  },
  {
    id: "R010-02-SRC-DB-YML",
    file: "src/db.yml",
    content: "PASSWORD: supersecret123456\n",
    expectTrigger: true,
    desc: "src/db.yml (V4-06 case) must trigger ASTESIA-010"
  },
  {
    id: "R010-03-K8S-DEPLOYMENT-YAML",
    file: "k8s/deployment.yaml",
    content: "apiVersion: apps/v1\nkind: Deployment\nspec:\n  template:\n    spec:\n      containers:\n        - env:\n            - name: DB_PASSWORD\n              value: myliteralpassword123456\n",
    expectTrigger: true,
    desc: "k8s/deployment.yaml literal password in env list must trigger"
  },
  {
    id: "R010-04-WORKFLOW-LITERAL-SECRET",
    file: ".github/workflows/ci.yml",
    content: "name: CI\non: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n    env:\n      API_TOKEN: literal_secret_token_123456\n",
    expectTrigger: true,
    desc: ".github/workflows/ci.yml literal secret must trigger"
  },
  {
    id: "R010-05-VALUES-YAML-HELM",
    file: "values.yaml",
    content: "dbPassword: myproductionsecret9999\n",
    expectTrigger: true,
    desc: "values.yaml Helm secret must trigger"
  },
  {
    id: "R010-06-COMPOSE-MAPPING",
    file: "docker-compose.yml",
    content: "services:\n  db:\n    environment:\n      PASSWORD: secretpassword123456\n",
    expectTrigger: true,
    desc: "docker-compose.yml environment mapping must trigger"
  },
  {
    id: "R010-07-COMPOSE-LIST",
    file: "docker-compose.yml",
    content: "services:\n  db:\n    environment:\n      - DB_PASSWORD=mysecretpassword123456\n",
    expectTrigger: true,
    desc: "docker-compose.yml environment list item must trigger"
  },
  {
    id: "R010-08-DOCKERFILE-ENV",
    file: "Dockerfile",
    content: "FROM node:20\nENV APP_SECRET=mysecretpassword123456\n",
    expectTrigger: true,
    desc: "Dockerfile ENV with secret must trigger"
  },
  {
    id: "R010-09-DOCKERFILE-ARG",
    file: "Dockerfile.build",
    content: "FROM alpine\nARG DB_PASSWORD=mysecretpassword123456\n",
    expectTrigger: true,
    desc: "Dockerfile ARG with secret must trigger"
  },
  {
    id: "R010-10-HELM-NESTED-VALUES",
    file: "helm/app/values.yaml",
    content: "adminToken: token_secret_value_123456\n",
    expectTrigger: true,
    desc: "Nested values.yaml with adminToken must trigger"
  },
  {
    id: "R010-11-COMPOSE-OVERRIDE-YAML",
    file: "compose.override.yaml",
    content: "services:\n  web:\n    environment:\n      SECRET_KEY: my_override_secret_key_99\n",
    expectTrigger: true,
    desc: "compose.override.yaml with SECRET_KEY must trigger"
  },

  // MUST NOT TRIGGER: Excluded template/sample/example and variable interpolations
  {
    id: "R010-12-WORKFLOW-GHA-INTERPOLATION",
    file: ".github/workflows/ci.yml",
    content: "name: CI\njobs:\n  test:\n    env:\n      NPM_TOKEN: ${{ secrets.NPM_TOKEN }}\n",
    expectTrigger: false,
    desc: "GitHub Actions ${{ secrets.X }} must NOT trigger"
  },
  {
    id: "R010-13-ENV-EXAMPLE-EXEMPT",
    file: ".env.example",
    content: "PASSWORD=example_placeholder_password_123456\n",
    expectTrigger: false,
    desc: ".env.example must NOT trigger"
  },
  {
    id: "R010-14-TEMPLATE-YML-EXEMPT",
    file: "config.template.yml",
    content: "PASSWORD: template_placeholder_password_123456\n",
    expectTrigger: false,
    desc: "config.template.yml must NOT trigger"
  },
  {
    id: "R010-15-SAMPLE-YAML-EXEMPT",
    file: "sample.yaml",
    content: "PASSWORD: sample_placeholder_password_123456\n",
    expectTrigger: false,
    desc: "sample.yaml must NOT trigger"
  },
  {
    id: "R010-16-VALUES-SAMPLE-YML-EXEMPT",
    file: "values.sample.yml",
    content: "password: sample_placeholder_password_123456\n",
    expectTrigger: false,
    desc: "values.sample.yml must NOT trigger"
  },
  {
    id: "R010-17-K8S-SECRETKEYREF",
    file: "k8s/pod.yaml",
    content: "env:\n  - name: DB_PASS\n    valueFrom:\n      secretKeyRef:\n        name: db\n        key: password\n",
    expectTrigger: false,
    desc: "k8s secretKeyRef must NOT trigger"
  }
];

export function runRule010ScopeSuite(gatePath: string, rulesPath: string, testTmpDir: string): {
  total: number;
  passed: number;
  failed: number;
  errors: string[];
} {
  const suiteDir = resolve(testTmpDir, `rule010-scope-${Date.now()}`);
  mkdirSync(suiteDir, { recursive: true });

  let passed = 0;
  let total = 0;
  const errors: string[] = [];

  for (const c of rule010ScopeCases) {
    total++;
    const caseDir = resolve(suiteDir, c.id);
    mkdirSync(caseDir, { recursive: true });

    const filePath = resolve(caseDir, c.file);
    const parent = resolve(filePath, "..");
    if (!existsSync(parent)) mkdirSync(parent, { recursive: true });
    writeFileSync(filePath, c.content, "utf8");

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
    const triggered = (json.violations || []).some((v: any) => v.ruleId === "ASTESIA-010");

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
  const res = runRule010ScopeSuite(gate, rules, tmp);
  console.log(`Rule 010 Scope Suite: ${res.passed}/${res.total} passed`);
  if (res.errors.length > 0) {
    for (const e of res.errors) console.error(e);
    process.exit(1);
  }
  process.exit(0);
}
