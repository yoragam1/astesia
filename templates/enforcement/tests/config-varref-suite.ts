import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

export interface VarRefTestCase {
  id: string;
  name: string;
  filename: string;
  line: string;
  shouldTrigger: boolean; // true = expect ASTESIA-010 violation, false = exempt
}

export const VARREF_CASES: VarRefTestCase[] = [
  // MUST NOT TRIGGER (Exempt interpolations & variable references)
  { id: "VR-01", name: "Unbraced $VAR dotenv", filename: ".env", line: "DB_PASSWORD=$DB_PASS\n", shouldTrigger: false },
  { id: "VR-02", name: "Unbraced $VAR yaml", filename: "app.yaml", line: "password: $DB_PASSWORD\n", shouldTrigger: false },
  { id: "VR-03", name: "Double-quoted \"$VAR\" dotenv", filename: ".env", line: 'PASSWORD="$DB_PASS"\n', shouldTrigger: false },
  { id: "VR-04", name: "Single-quoted '$VAR' dotenv", filename: ".env", line: "PASSWORD='$DB_PASS'\n", shouldTrigger: false },
  { id: "VR-05", name: "Braced ${VAR} dotenv", filename: ".env", line: "PASSWORD=${DB_PASS}\n", shouldTrigger: false },
  { id: "VR-06", name: "Braced ${VAR} yaml", filename: "app.yaml", line: "password: ${DB_PASS}\n", shouldTrigger: false },
  { id: "VR-07", name: "Braced ${VAR:?required} dotenv", filename: ".env", line: "PASSWORD=${DB_PASS:?required}\n", shouldTrigger: false },
  { id: "VR-08", name: "GitHub Actions ${{ secrets.NPM_TOKEN }}", filename: "workflow.yml", line: "token: ${{ secrets.NPM_TOKEN }}\n", shouldTrigger: false },
  { id: "VR-09", name: "Helm {{ .Values.token }}", filename: "values.yaml", line: "token: {{ .Values.token }}\n", shouldTrigger: false },
  { id: "VR-10", name: "Short fallback ${VAR:-dev}", filename: ".env", line: "DB_PASSWORD=${DB_PASS:-dev}\n", shouldTrigger: false },

  // MUST TRIGGER (Mixed literals, escape $$VAR, long fallbacks, appended secret)
  { id: "VR-11", name: "Mixed prefix literal + $VAR", filename: ".env", line: "PASSWORD=prefix_secret_$VAR\n", shouldTrigger: true },
  { id: "VR-12", name: "Escaped compose $$VAR", filename: "docker-compose.yml", line: "PASSWORD=$$notvar12345\n", shouldTrigger: true },
  { id: "VR-13", name: "Long fallback >= 8 chars", filename: ".env", line: "PASSWORD=${DB_PASS:-hunter2hunter2}\n", shouldTrigger: true },
  { id: "VR-14", name: "Appended secret suffix $VAR-realsecret99", filename: ".env", line: "PASSWORD=$DB_PASS-realsecret99\n", shouldTrigger: true },
  { id: "VR-15", name: "Double $$ in yaml", filename: "app.yaml", line: "secret_token: $$escaped_token123\n", shouldTrigger: true },
  { id: "VR-16", name: "Prefix and suffix secret_$VAR_secret", filename: ".env", line: "API_SECRET=mysecret_$ENV_SUFFIX_1234\n", shouldTrigger: true }
];

export function runConfigVarRefSuite(
  customGatePath?: string,
  customTmpDir?: string
): { total: number; passed: number; failed: number; errors: string[] } {
  let passed = 0;
  let failed = 0;
  const errors: string[] = [];

  const gatePath = customGatePath || path.resolve(__dirname, "../astesia-gate.ts");
  const rulesPath = path.resolve(__dirname, "../anti-patterns.json");
  const auditTmp = customTmpDir || path.resolve(__dirname, "../../../.astesia/audit/tmp");
  fs.mkdirSync(auditTmp, { recursive: true });

  for (const tc of VARREF_CASES) {
    const tmpDir = fs.mkdtempSync(path.join(auditTmp, "varref-"));
    try {
      const filePath = path.join(tmpDir, tc.filename);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, tc.line, "utf8");

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
  const r = runConfigVarRefSuite();
  console.log(`Config VarRef Suite: ${r.passed}/${r.total} passed (${r.failed} failed)`);
  if (r.errors.length > 0) {
    console.error(r.errors.join("\n"));
    process.exit(1);
  }
}
