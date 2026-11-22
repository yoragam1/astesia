import { spawnSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";

const r = spawnSync("git", ["-C", "D:/Workspaces/Astesia", "show", "2609008:templates/enforcement/anti-patterns.json"], { encoding: "utf8" });
const tmp = join(os.tmpdir(), "rules-base-2609008.json");
writeFileSync(tmp, r.stdout, "utf8");
const diffRes = spawnSync(process.execPath, [
  "D:/Workspaces/Astesia/templates/enforcement/astesia-gate.ts",
  "--rules-diff",
  tmp,
  "D:/Workspaces/Astesia/templates/enforcement/anti-patterns.json"
], { encoding: "utf8" });
console.log(diffRes.stdout || diffRes.stderr);
try { unlinkSync(tmp); } catch {}
process.exit(diffRes.status ?? 0);
