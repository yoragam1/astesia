import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";

const REPO = "D:/Workspaces/Astesia";

function runVerifyInClone(commit: string) {
  const cleanDir = join(os.tmpdir(), `astesia-verify-compare-${commit}-${Date.now()}`);
  mkdirSync(cleanDir, { recursive: true });
  try {
    const archive = spawnSync("git", ["-C", REPO, "-c", "core.autocrlf=false", "archive", commit], { maxBuffer: 50 * 1024 * 1024 });
    spawnSync("tar", ["-xf", "-", "-C", cleanDir], { input: archive.stdout });
    spawnSync("git", ["init", "-q", "-b", "main", cleanDir]);
    spawnSync("git", ["-C", cleanDir, "config", "core.autocrlf", "false"]);

    const v1 = JSON.parse(spawnSync(process.execPath, ["templates/enforcement/tests/verify/run.ts", "--json"], { cwd: cleanDir, encoding: "utf8" }).stdout);
    const v2 = JSON.parse(spawnSync(process.execPath, ["templates/enforcement/tests/verify2/run.ts", "--json"], { cwd: cleanDir, encoding: "utf8" }).stdout);
    const v3 = JSON.parse(spawnSync(process.execPath, ["templates/enforcement/tests/verify3/run.ts", "--json"], { cwd: cleanDir, encoding: "utf8" }).stdout);

    return { v1, v2, v3 };
  } finally {
    try { rmSync(cleanDir, { recursive: true, force: true }); } catch {}
  }
}

console.log("Running verify suites on 2609008...");
const baseResults = runVerifyInClone("2609008");
console.log("Running verify suites on START (bc3c077)...");
const startResults = runVerifyInClone("bc3c077");

console.log("\n--- Comparison Results ---");
console.log("2609008 v1:", baseResults.v1.accounting);
console.log("START   v1:", startResults.v1.accounting);
console.log("2609008 v2:", baseResults.v2.accounting);
console.log("START   v2:", startResults.v2.accounting);
console.log("2609008 v3:", baseResults.v3.accounting);
console.log("START   v3:", startResults.v3.accounting);

writeFileSync(join(REPO, ".astesia/audit/wave2a.7/verify-comparison.json"), JSON.stringify({ baseResults, startResults }, null, 2), "utf8");
console.log("Saved to .astesia/audit/wave2a.7/verify-comparison.json");
