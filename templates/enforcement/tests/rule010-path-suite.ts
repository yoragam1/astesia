import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

export interface Rule010PathTestCase {
  id: string;
  name: string;
  filename: string;
  content: string;
  shouldTriggerRule010: boolean;
}

export const RULE010_PATH_CASES: Rule010PathTestCase[] = [
  // SHOULD NOT TRIGGER ASTESIA-010 (Must not match pathRegex)
  { id: "R10-P01", name: ".envrc must NOT match ASTESIA-010", filename: ".envrc", content: 'PASSWORD=SuperSecretPassword123!\n', shouldTriggerRule010: false },
  { id: "R10-P02", name: ".environment must NOT match ASTESIA-010", filename: ".environment", content: 'PASSWORD=SuperSecretPassword123!\n', shouldTriggerRule010: false },
  { id: "R10-P03", name: "vite.env.ts must NOT match ASTESIA-010", filename: "vite.env.ts", content: 'PASSWORD=SuperSecretPassword123!\n', shouldTriggerRule010: false },
  { id: "R10-P04", name: "config.envelope.ts must NOT match ASTESIA-010", filename: "config.envelope.ts", content: 'PASSWORD=SuperSecretPassword123!\n', shouldTriggerRule010: false },
  { id: "R10-P05", name: "x.yaml.ts must NOT match ASTESIA-010", filename: "x.yaml.ts", content: 'PASSWORD=SuperSecretPassword123!\n', shouldTriggerRule010: false },
  { id: "R10-P06", name: "docs/yml-guide.ts must NOT match ASTESIA-010", filename: "docs/yml-guide.ts", content: 'PASSWORD=SuperSecretPassword123!\n', shouldTriggerRule010: false },

  // SHOULD TRIGGER ASTESIA-010 (Valid config / dockerfile files)
  { id: "R10-P07", name: "Root .env matches ASTESIA-010", filename: ".env", content: 'PASSWORD=SuperSecretPassword123!\n', shouldTriggerRule010: true },
  { id: "R10-P08", name: "Subdir .env.production matches ASTESIA-010", filename: "sub/.env.production", content: 'PASSWORD=SuperSecretPassword123!\n', shouldTriggerRule010: true },
  { id: "R10-P09", name: "Root Dockerfile matches ASTESIA-010", filename: "Dockerfile", content: 'ENV PASSWORD="SuperSecretPassword123!"\n', shouldTriggerRule010: true },
  { id: "R10-P10", name: "Dockerfile.dev matches ASTESIA-010", filename: "Dockerfile.dev", content: 'ENV PASSWORD="SuperSecretPassword123!"\n', shouldTriggerRule010: true },
  { id: "R10-P11", name: "api.Dockerfile matches ASTESIA-010", filename: "api.Dockerfile", content: 'ENV PASSWORD="SuperSecretPassword123!"\n', shouldTriggerRule010: true },
  { id: "R10-P12", name: "app.yml matches ASTESIA-010", filename: "app.yml", content: 'password: "SuperSecretPassword123!"\n', shouldTriggerRule010: true },
  { id: "R10-P13", name: "docker-compose.override.yml matches ASTESIA-010", filename: "docker-compose.override.yml", content: 'password: "SuperSecretPassword123!"\n', shouldTriggerRule010: true },
  { id: "R10-P14", name: "nested deploy\\api.Dockerfile with backslash matches", filename: "deploy\\api.Dockerfile", content: 'ENV PASSWORD="SuperSecretPassword123!"\n', shouldTriggerRule010: true }
];

export function runRule010PathSuite(): { total: number; passed: number; failed: number; errors: string[] } {
  let passed = 0;
  let failed = 0;
  const errors: string[] = [];

  const gatePath = path.resolve("templates/enforcement/astesia-gate.ts");
  const rulesPath = path.resolve("templates/enforcement/anti-patterns.json");

  for (const tc of RULE010_PATH_CASES) {
    const tmpDir = fs.mkdtempSync(path.join(path.resolve(".astesia/audit/tmp"), "r010path-"));
    try {
      const filePath = path.join(tmpDir, tc.filename);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, tc.content, "utf8");

      const res = spawnSync("bun", [gatePath, "--root", tmpDir, "--rules", rulesPath, "--json"], { encoding: "utf8" });
      const parsed = JSON.parse(res.stdout);

      const has010 = parsed.violations.some((v: any) => v.ruleId === "ASTESIA-010");

      if (has010 === tc.shouldTriggerRule010) {
        passed++;
      } else {
        failed++;
        errors.push(
          `FAIL: ${tc.id} (${tc.name}) - expected trigger010=${tc.shouldTriggerRule010}, got has010=${has010} (violations: ${JSON.stringify(parsed.violations)})`
        );
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  return { total: passed + failed, passed, failed, errors };
}

if (import.meta.main) {
  const r = runRule010PathSuite();
  console.log(`Rule 010 Path Suite: ${r.passed}/${r.total} passed (${r.failed} failed)`);
  if (r.errors.length > 0) {
    console.error(r.errors.join("\n"));
    process.exit(1);
  }
}
