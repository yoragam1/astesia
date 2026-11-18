import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { profileFor, preprocessSource } from "../astesia-gate.ts";

export interface ProfileTestCase {
  id: string;
  name: string;
  path: string;
  expectedProfile: "config" | "code";
}

const D2_FILES: ProfileTestCase[] = [
  { id: "PC-01", name: "Root .env", path: ".env", expectedProfile: "config" },
  { id: "PC-02", name: "Subdir .env.production", path: "config/.env.production", expectedProfile: "config" },
  { id: "PC-03", name: ".envrc is NOT config", path: ".envrc", expectedProfile: "code" },
  { id: "PC-04", name: ".environment is NOT config", path: ".environment", expectedProfile: "code" },
  { id: "PC-05", name: "Dockerfile is config", path: "Dockerfile", expectedProfile: "config" },
  { id: "PC-06", name: "Dockerfile.dev is config", path: "Dockerfile.dev", expectedProfile: "config" },
  { id: "PC-07", name: "api.Dockerfile is config", path: "api.Dockerfile", expectedProfile: "config" },
  { id: "PC-08", name: "Subdir Dockerfile", path: "deploy/api.Dockerfile", expectedProfile: "config" },
  { id: "PC-09", name: "app.yml is config", path: "app.yml", expectedProfile: "config" },
  { id: "PC-10", name: "app.yaml is config", path: "sub/app.yaml", expectedProfile: "config" },
  { id: "PC-11", name: "locales/en.json is code", path: "locales/en.json", expectedProfile: "code" },
  { id: "PC-12", name: "Cargo.toml is code", path: "Cargo.toml", expectedProfile: "code" },
  { id: "PC-13", name: "setup.cfg is code", path: "setup.cfg", expectedProfile: "code" },
  { id: "PC-14", name: "config.ini is code", path: "config.ini", expectedProfile: "code" },
  { id: "PC-15", name: "dockerfile-tools/index.ts is code", path: "dockerfile-tools/index.ts", expectedProfile: "code" },
  { id: "PC-16", name: ".env-tools/x.ts is code", path: ".env-tools/x.ts", expectedProfile: "code" },
  { id: "PC-17", name: ".env.example exception", path: ".env.example", expectedProfile: "code" },
  { id: "PC-18", name: ".env.template exception", path: "deploy/.env.template", expectedProfile: "code" },
  { id: "PC-19", name: ".env.sample exception", path: "config/.env.sample", expectedProfile: "code" },
  { id: "PC-20", name: "my.dockerfile.d/util.ts is code", path: "my.dockerfile.d/util.ts", expectedProfile: "code" }
];

export function runProfileContractSuite(): { total: number; passed: number; failed: number; errors: string[] } {
  let passed = 0;
  let failed = 0;
  const errors: string[] = [];

  // 1. Direct profileFor checks (forward slash & backslash) - 20 cases
  for (const tc of D2_FILES) {
    const slashPath = tc.path.replace(/\\/g, "/");
    const backslashPath = tc.path.replace(/\//g, "\\");

    const profSlash = profileFor(slashPath);
    const profBack = profileFor(backslashPath);

    if (profSlash === tc.expectedProfile && profBack === tc.expectedProfile) {
      passed++;
    } else {
      failed++;
      errors.push(`FAIL: ${tc.id} (${tc.name}) - expected ${tc.expectedProfile}, got slash=${profSlash}, backslash=${profBack}`);
    }
  }

  // 2. Tokenization difference test for .envrc (code profile vs config profile)
  // In code profile: '// bukan komentar di config' IS a comment.
  // In config profile: '//' is NOT a comment (only '#' is comment).
  const envrcContent = '// bukan komentar di config\nexport X="a # b"\n';
  const prep = preprocessSource(envrcContent, "/path/to/.envrc");
  // In code profile, line 1 is stripped as comment
  const isCodeComment = prep.commentLines[0] && prep.commentLines[0].includes("bukan komentar");
  if (isCodeComment) {
    passed++;
  } else {
    failed++;
    errors.push(`FAIL: PC-ENVRC-TOKEN - .envrc was not tokenized as code profile (comment line 1 not recognized)`);
  }

  // 3. locales/en.json secret immunity test
  const jsonContent = '{\n  "password": "Enter your password",\n  "loginPassword": "Password"\n}\n';
  const tmpDir = fs.mkdtempSync(path.join(path.resolve(".astesia/audit/tmp"), "pc-json-"));
  try {
    fs.mkdirSync(path.join(tmpDir, "locales"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "locales", "en.json"), jsonContent, "utf8");

    const gatePath = path.resolve("templates/enforcement/astesia-gate.ts");
    const rulesPath = path.resolve("templates/enforcement/anti-patterns.json");
    const res = spawnSync("bun", [gatePath, "--root", tmpDir, "--rules", rulesPath, "--json"], { encoding: "utf8" });
    const parsed = JSON.parse(res.stdout);

    if (parsed.violations.length === 0 && parsed.files_scanned.total === 0) {
      passed++;
    } else {
      failed++;
      errors.push(`FAIL: PC-JSON-SCAN - locales/en.json produced violations or was scanned: ${parsed.violations.length}`);
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  // 4. Parity with gate 27fe428 on non-scanned extensions (.json, .toml, .ini, .cfg)
  const synthDir = fs.mkdtempSync(path.join(path.resolve(".astesia/audit/tmp"), "pc-parity-"));
  try {
    fs.writeFileSync(path.join(synthDir, "a.json"), "{}", "utf8");
    fs.writeFileSync(path.join(synthDir, "b.toml"), "", "utf8");
    fs.writeFileSync(path.join(synthDir, "c.ini"), "", "utf8");
    fs.writeFileSync(path.join(synthDir, "d.cfg"), "", "utf8");

    const gatePath = path.resolve("templates/enforcement/astesia-gate.ts");
    const rulesPath = path.resolve("templates/enforcement/anti-patterns.json");
    const res = spawnSync("bun", [gatePath, "--root", synthDir, "--rules", rulesPath, "--json"], { encoding: "utf8" });
    const parsed = JSON.parse(res.stdout);

    if (parsed.files_scanned.total === 0) {
      passed++;
    } else {
      failed++;
      errors.push(`FAIL: PC-PARITY - scanned ${parsed.files_scanned.total} files on non-scannable extensions, expected 0`);
    }
  } finally {
    fs.rmSync(synthDir, { recursive: true, force: true });
  }

  return { total: passed + failed, passed, failed, errors };
}

if (import.meta.main) {
  const r = runProfileContractSuite();
  console.log(`Profile Contract Suite: ${r.passed}/${r.total} passed (${r.failed} failed)`);
  if (r.errors.length > 0) {
    console.error(r.errors.join("\n"));
    process.exit(1);
  }
}
