import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const REPO_ROOT = resolve(__dirname, "../../../..");
const WORKSPACES_ROOT = resolve(REPO_ROOT, "..");
const TEMP_BASE = join(process.env.TEMP || "C:/Temp", "astesia-real");
const SNAPSHOT_DIR = join(REPO_ROOT, ".astesia/audit/wave2a.5/snapshots");

mkdirSync(TEMP_BASE, { recursive: true });
mkdirSync(SNAPSHOT_DIR, { recursive: true });

const PROJECTS = [
  "pustaka-sekolah-pwa",
  "terminal-portfolio",
  "eunectes",
  "flora-smk",
  "ifrit",
  "arene",
  "SIA"
];

function copyDirExcludingNodeModules(src: string, dest: string) {
  mkdirSync(dest, { recursive: true });
  const entries = readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules") continue;
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirExcludingNodeModules(srcPath, destPath);
    } else if (entry.isFile()) {
      cpSync(srcPath, destPath, { force: true });
    }
  }
}

// Extract 56dd907 gate and rules
const gatesDir = join(TEMP_BASE, "_gates");
mkdirSync(gatesDir, { recursive: true });
const gate56Path = join(gatesDir, "gate-56dd907.ts");
const rules56Path = join(gatesDir, "rules-56dd907.json");

writeFileSync(
  gate56Path,
  spawnSync("git", ["show", "56dd907:templates/enforcement/astesia-gate.ts"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024
  }).stdout,
  "utf8"
);
writeFileSync(
  rules56Path,
  spawnSync("git", ["show", "56dd907:templates/enforcement/anti-patterns.json"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024
  }).stdout,
  "utf8"
);

const gateA9Path = join(REPO_ROOT, "templates/enforcement/astesia-gate.ts");
const rulesA9Path = join(REPO_ROOT, "templates/enforcement/anti-patterns.json");

interface ProjectMeta {
  name: string;
  sourcePath: string;
  copyPath: string;
  headCommit: string;
  gitStatusShort: string;
  scan56dd907: {
    exitCode: number | null;
    filesScanned: number;
    errors: number;
    warnings: number;
    violationsCount: number;
    sha256: string;
  };
  scana9e20cd: {
    exitCode: number | null;
    filesScanned: number;
    errors: number;
    warnings: number;
    desyncCount: number;
    violationsCount: number;
    sha256: string;
  };
  determinismCheck?: {
    run1Sha256: string;
    run2Sha256: string;
    identical: boolean;
  };
}

const metadata: ProjectMeta[] = [];

for (const proj of PROJECTS) {
  const srcDir = join(WORKSPACES_ROOT, proj);
  const copyDir = join(TEMP_BASE, proj);
  console.log(`[D1] Processing ${proj}...`);

  if (!existsSync(copyDir)) {
    console.log(`  Copying ${srcDir} -> ${copyDir} (without node_modules)...`);
    copyDirExcludingNodeModules(srcDir, copyDir);
  }

  const headRes = spawnSync("git", ["rev-parse", "HEAD"], { cwd: srcDir, encoding: "utf8" });
  const statusRes = spawnSync("git", ["status", "--short"], { cwd: srcDir, encoding: "utf8" });

  // Run 56dd907
  const res56 = spawnSync(process.execPath, [gate56Path, "--root", copyDir, "--rules", rules56Path, "--json"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024
  });
  const out56File = join(SNAPSHOT_DIR, `d1-${proj}-56dd907.json`);
  writeFileSync(out56File, res56.stdout, "utf8");
  const parsed56 = JSON.parse(res56.stdout);
  const sha56 = createHash("sha256").update(res56.stdout).digest("hex");

  // Run a9e20cd
  const resA9 = spawnSync(process.execPath, [gateA9Path, "--root", copyDir, "--rules", rulesA9Path, "--json"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024
  });
  const outA9File = join(SNAPSHOT_DIR, `d1-${proj}-a9e20cd.json`);
  writeFileSync(outA9File, resA9.stdout, "utf8");
  const parsedA9 = JSON.parse(resA9.stdout);
  const shaA9 = createHash("sha256").update(resA9.stdout).digest("hex");

  const meta: ProjectMeta = {
    name: proj,
    sourcePath: srcDir,
    copyPath: copyDir,
    headCommit: (headRes.stdout || "").trim(),
    gitStatusShort: (statusRes.stdout || "").trim(),
    scan56dd907: {
      exitCode: res56.status,
      filesScanned: parsed56.files_scanned?.total ?? 0,
      errors: parsed56.errors ?? 0,
      warnings: parsed56.warnings ?? 0,
      violationsCount: parsed56.violations?.length ?? 0,
      sha256: sha56
    },
    scana9e20cd: {
      exitCode: resA9.status,
      filesScanned: parsedA9.files_scanned?.total ?? 0,
      errors: parsedA9.errors ?? 0,
      warnings: parsedA9.warnings ?? 0,
      desyncCount: parsedA9.desync_files?.length ?? 0,
      violationsCount: parsedA9.violations?.length ?? 0,
      sha256: shaA9
    }
  };

  if (proj === "pustaka-sekolah-pwa") {
    const resA9Run2 = spawnSync(process.execPath, [gateA9Path, "--root", copyDir, "--rules", rulesA9Path, "--json"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      maxBuffer: 50 * 1024 * 1024
    });
    const outA9Run2File = join(SNAPSHOT_DIR, `d1-${proj}-a9e20cd-run2.json`);
    writeFileSync(outA9Run2File, resA9Run2.stdout, "utf8");
    const shaA9Run2 = createHash("sha256").update(resA9Run2.stdout).digest("hex");
    meta.determinismCheck = {
      run1Sha256: shaA9,
      run2Sha256: shaA9Run2,
      identical: shaA9 === shaA9Run2
    };
  }

  console.log(
    `  56dd907: files=${meta.scan56dd907.filesScanned}, viol=${meta.scan56dd907.violationsCount} | a9e20cd: files=${meta.scana9e20cd.filesScanned}, viol=${meta.scana9e20cd.violationsCount}, desync=${meta.scana9e20cd.desyncCount}`
  );
  metadata.push(meta);
}

writeFileSync(join(SNAPSHOT_DIR, "d1-metadata.json"), JSON.stringify(metadata, null, 2), "utf8");
console.log("[D1] Completed all 7 project copies and snapshots.");
