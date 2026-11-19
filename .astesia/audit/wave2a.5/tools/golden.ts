/**
 * .astesia/audit/wave2a.5/tools/golden.ts
 * Re-runs HEAD gate on the 7 copied real projects and verifies 0 diff
 * against the normalized golden JSON snapshots in .astesia/audit/wave2a.5/golden/<project>.json.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "../../../..");
const HEAD_GATE = join(REPO_ROOT, "templates/enforcement/astesia-gate.ts");
const RULES_PATH = join(REPO_ROOT, "templates/enforcement/anti-patterns.json");
const GOLDEN_DIR = resolve(__dirname, "../golden");
const REAL_COPY_ROOT = process.argv[2] || "C:/Users/alta1r/AppData/Local/Temp/astesia-real";

const PROJECTS = [
  "pustaka-sekolah-pwa",
  "terminal-portfolio",
  "eunectes",
  "flora-smk",
  "ifrit",
  "arene",
  "SIA"
];

function sha256(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

function runAndNormalize(projDir: string): string {
  const res = spawnSync(process.execPath, [HEAD_GATE, "--root", projDir, "--rules", RULES_PATH, "--json"], {
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024
  });
  const parsed = JSON.parse(res.stdout);
  if (Array.isArray(parsed.violations)) {
    parsed.violations.sort((a: any, b: any) =>
      a.file.localeCompare(b.file) || a.line - b.line || a.ruleId.localeCompare(b.ruleId)
    );
  }
  if (Array.isArray(parsed.desync_files)) {
    parsed.desync_files.sort();
  }
  if (Array.isArray(parsed.generated_files)) {
    parsed.generated_files.sort();
  }
  return JSON.stringify(parsed, null, 2) + "\n";
}

let allMatched = true;
for (const proj of PROJECTS) {
  const goldenPath = join(GOLDEN_DIR, `${proj}.json`);
  if (!existsSync(goldenPath)) {
    console.error(`FAIL: Missing golden file ${goldenPath}`);
    allMatched = false;
    continue;
  }
  const goldenRaw = readFileSync(goldenPath, "utf8").replace(/\r\n/g, "\n");
  const goldenHash = sha256(goldenRaw);

  const projDir = join(REAL_COPY_ROOT, proj);
  if (!existsSync(projDir)) {
    console.error(`FAIL: Missing project copy at ${projDir}`);
    allMatched = false;
    continue;
  }

  const actualNormalized = runAndNormalize(projDir);
  const actualHash = sha256(actualNormalized);

  if (actualHash === goldenHash) {
    console.log(`[PASS] ${proj}: golden sha256=${goldenHash} (0 diff)`);
  } else {
    console.error(`[FAIL] ${proj}: golden=${goldenHash}, actual=${actualHash}`);
    allMatched = false;
  }
}

process.exit(allMatched ? 0 : 1);
