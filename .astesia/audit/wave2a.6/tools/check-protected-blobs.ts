import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = "D:/Workspaces/Astesia";
const baseBlobs = JSON.parse(readFileSync(join(root, ".astesia/audit/wave2a.6/protected-blobs-base.json"), "utf8"));
const headBlobs: Record<string, string> = {};
let allMatch = true;

for (const p of Object.keys(baseBlobs)) {
  const r = spawnSync("git", ["-C", root, "rev-parse", `HEAD:${p}`], { encoding: "utf8" });
  const hash = (r.stdout || "").trim();
  headBlobs[p] = hash;
  if (hash !== baseBlobs[p]) {
    console.error(`MISMATCH: ${p} expected ${baseBlobs[p]}, got ${hash}`);
    allMatch = false;
  }
}

if (allMatch) {
  console.log("All 17 protected file blob hashes MATCH exactly!");
} else {
  console.error("Some blob hashes mismatched!");
  process.exit(1);
}

writeFileSync(join(root, ".astesia/audit/wave2a.6/protected-blobs-head.json"), JSON.stringify(headBlobs, null, 2), "utf8");
