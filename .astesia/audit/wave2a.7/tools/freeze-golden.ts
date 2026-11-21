import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const ALL_PROJECTS = [
  "eunectes", "ifrit", "flora-smk",
  "arene", "SIA", "pustaka-sekolah-pwa", "terminal-portfolio", "cadetspeak", "eduNEXA", "prototype-ami",
  "aipkani", "ecommerce-hp-api", "cadetspeak_admin"
];

export function freezeGoldenV3() {
  const gateScript = resolve(__dirname, "../../../../templates/enforcement/astesia-gate.ts");
  const rulesPath = resolve(__dirname, "../../../../templates/enforcement/anti-patterns.json");
  const copyDir = join(tmpdir(), "astesia-2a7-copies");
  const goldenDir = resolve(__dirname, "../golden");
  mkdirSync(goldenDir, { recursive: true });

  const index: Record<string, { sha256: string; totalViolations: number; errors: number; warnings: number; filesScanned: number }> = {};

  for (const name of ALL_PROJECTS) {
    const targetDir = join(copyDir, name);
    let parsed: any;
    try {
      const raw = execFileSync("bun", [gateScript, "--root", targetDir, "--rules", rulesPath, "--json"], {
        encoding: "utf8",
        maxBuffer: 50 * 1024 * 1024
      });
      parsed = JSON.parse(raw);
    } catch (err: any) {
      parsed = JSON.parse(err.stdout);
    }

    const jsonStr = JSON.stringify(parsed, null, 2);
    const sha = createHash("sha256").update(jsonStr).digest("hex");
    const outPath = join(goldenDir, `${name}.golden.json`);
    writeFileSync(outPath, jsonStr, "utf8");

    const errors = (parsed.violations || []).filter((v: any) => v.severity === "error").length;
    const warnings = (parsed.violations || []).filter((v: any) => v.severity === "warn").length;

    index[name] = {
      sha256: sha,
      totalViolations: parsed.violations?.length || 0,
      errors,
      warnings,
      filesScanned: parsed.files_scanned?.total || 0
    };
    console.log(`Frozen ${name}: sha=${sha.slice(0, 12)}..., violations=${index[name].totalViolations}`);
  }

  const indexPath = join(goldenDir, "golden-index.json");
  writeFileSync(indexPath, JSON.stringify({
    version: "3.0.0",
    scope: "wave2a.7",
    timestamp: new Date().toISOString(),
    projects: index
  }, null, 2), "utf8");
  console.log("Golden v3 index written to:", indexPath);
}

if (import.meta.main) {
  freezeGoldenV3();
}
