import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const REPO_ROOT = resolve(__dirname, "../../../..");
const WORKSPACES_ROOT = resolve(REPO_ROOT, "..");
const TEMP_HOLDOUT = join(process.env.TEMP || "C:/Temp", "astesia-holdout");
const RAW_DIR = join(REPO_ROOT, ".astesia/audit/wave2a.6/holdout/raw");

mkdirSync(TEMP_HOLDOUT, { recursive: true });
mkdirSync(RAW_DIR, { recursive: true });

const HOLDOUT_PROJECTS = ["eduNEXA", "prototype-ami", "cadetspeak"];

function copyDirExcludingNodeModules(src: string, dest: string) {
  mkdirSync(dest, { recursive: true });
  const entries = readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirExcludingNodeModules(srcPath, destPath);
    } else if (entry.isFile()) {
      cpSync(srcPath, destPath, { force: true });
    }
  }
}

const gatePath = join(REPO_ROOT, "templates/enforcement/astesia-gate.ts");
const rulesPath = join(REPO_ROOT, "templates/enforcement/anti-patterns.json");

const results: Record<string, any> = {};

for (const proj of HOLDOUT_PROJECTS) {
  const src = join(WORKSPACES_ROOT, proj);
  const dest = join(TEMP_HOLDOUT, proj);
  console.log(`Copying ${proj}...`);
  copyDirExcludingNodeModules(src, dest);

  console.log(`Scanning ${proj} with BASE gate...`);
  const proc = spawnSync(
    "bun",
    [gatePath, "--root", dest, "--rules", rulesPath, "--json"],
    {
      cwd: REPO_ROOT,
      encoding: "utf8",
      maxBuffer: 50 * 1024 * 1024
    }
  );

  let parsed: any = null;
  try {
    parsed = JSON.parse(proc.stdout);
  } catch (err) {
    console.error(`Failed to parse json for ${proj}:`, err);
    console.log("Stdout head:", proc.stdout.slice(0, 500));
  }

  const rawPath = join(RAW_DIR, `base-${proj}.json`);
  writeFileSync(rawPath, proc.stdout, "utf8");

  results[proj] = {
    exitCode: proc.status,
    filesScanned: parsed?.summary?.files_scanned ?? parsed?.files_scanned ?? 0,
    errors: parsed?.summary?.errors ?? parsed?.errors ?? 0,
    warnings: parsed?.summary?.warnings ?? parsed?.warnings ?? 0,
    desyncCount: parsed?.notices?.tokenizer_desyncs?.length ?? 0,
    violationsCount: parsed?.violations?.length ?? 0
  };
}

console.log("Scan Results Summary:");
console.log(JSON.stringify(results, null, 2));

const summaryPath = join(REPO_ROOT, ".astesia/audit/wave2a.6/holdout/holdout-base-scan-summary.json");
writeFileSync(summaryPath, JSON.stringify(results, null, 2), "utf8");
