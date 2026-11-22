import { execFileSync } from "child_process";
import path from "path";
import os from "os";

const gateScript = path.resolve("Astesia/templates/enforcement/astesia-gate.ts");
const rulesPath = path.resolve("Astesia/templates/enforcement/anti-patterns.json");
const copyDir = path.join(os.tmpdir(), "astesia-2a7-copies");

for (const p of ["flora-smk", "ifrit", "eunectes"]) {
  const targetDir = path.join(copyDir, p);
  try {
    const raw = execFileSync("bun", [gateScript, "--root", targetDir, "--rules", rulesPath, "--json"], {
      encoding: "utf8",
      maxBuffer: 50 * 1024 * 1024,
    });
    report(p, JSON.parse(raw));
  } catch (err: any) {
    if (err.stdout) {
      report(p, JSON.parse(err.stdout));
    }
  }
}

function report(project: string, parsed: any) {
  console.log(`\n=================== ${project} ===================`);
  const byRule: Record<string, any[]> = {};
  for (const v of parsed.violations) {
    byRule[v.ruleId] = byRule[v.ruleId] || [];
    byRule[v.ruleId].push(v);
  }
  for (const [r, list] of Object.entries(byRule)) {
    console.log(`  ${r}: ${list.length}`);
    if (r === "ASTESIA-000" || r === "ASTESIA-004" || r === "ASTESIA-008" || r === "ASTESIA-010") {
      for (const item of list) {
        console.log(`    ${item.file}:${item.line} -> ${item.message}`);
      }
    }
  }
}
