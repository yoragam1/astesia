import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";
import { runAstesiaInit } from "../astesia-init";

export function runD3Diag() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "astesia-3c-d3-test2-"));
  runAstesiaInit({ target: tmpDir });

  const gatePath = path.join(tmpDir, ".astesia", "enforcement", "astesia-gate.ts");
  const rulesPath = path.join(tmpDir, ".astesia", "enforcement", "anti-patterns.json");

  // Custom modules (not in SKIP_DIRS)
  const customDir = path.join(tmpDir, "custom_modules");
  fs.mkdirSync(customDir, { recursive: true });
  fs.writeFileSync(path.join(customDir, "x.ts"), "export const q = 'SELECT * FROM users';\nexport const a: any = 1;\n", "utf8");

  // Vendor modules (IS in SKIP_DIRS)
  const vendorDir = path.join(tmpDir, "vendor");
  fs.mkdirSync(vendorDir, { recursive: true });
  fs.writeFileSync(path.join(vendorDir, "x.ts"), "export const q = 'SELECT * FROM users';\nexport const a: any = 1;\n", "utf8");

  // Without exclude
  let res1: any;
  try {
    res1 = JSON.parse(execSync(`bun "${gatePath}" --root "${tmpDir}" --rules "${rulesPath}" --json`, { encoding: "utf8" }));
  } catch (e: any) {
    res1 = JSON.parse(e.stdout);
  }
  console.log("Without exclude: files_excluded =", res1.files_excluded, "violations =", res1.violations.length);
  console.log("Violating files:", res1.violations.map((v: any) => v.file));

  // With exclude in .astesia/gate-config.json
  fs.writeFileSync(path.join(tmpDir, ".astesia", "gate-config.json"), JSON.stringify({
    schema: 1,
    exclude: [
      { path: "custom_modules", reason: "Custom legacy modules excluded from gate analysis" },
      { path: "vendor", reason: "Vendor directory exclusion entry" }
    ]
  }, null, 2), "utf8");

  let res2: any;
  try {
    res2 = JSON.parse(execSync(`bun "${gatePath}" --root "${tmpDir}" --rules "${rulesPath}" --json`, { encoding: "utf8" }));
  } catch (e: any) {
    res2 = JSON.parse(e.stdout);
  }
  console.log("With exclude: files_excluded =", res2.files_excluded, "violations =", res2.violations.length);

  // Clean up
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

if (import.meta.main) {
  runD3Diag();
}
