import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";

const REPO = "D:/Workspaces/Astesia";
const RULES = "D:/Workspaces/Astesia/templates/enforcement/anti-patterns.json";
const tempDir = join(os.tmpdir(), `test-v2-13-${Date.now()}`);
mkdirSync(tempDir, { recursive: true });

const code = 'const key = "random_dictionary_lookup_key_abcdef";\n';
writeFileSync(join(tempDir, "test-key-solo.ts"), code);

try {
  // Test with START gate
  const resStart = spawnSync("bun", [join(REPO, "templates/enforcement/astesia-gate.ts"), "--root", tempDir, "--rules", RULES, "--json"], { encoding: "utf-8" });
  if (resStart.status !== 0 && !resStart.stdout) {
    console.error("resStart stderr:", resStart.stderr);
  } else {
    const jsonStart = JSON.parse(resStart.stdout);
    console.log("START violations:", jsonStart.violations.map((v: any) => v.ruleId + ":" + v.message));
  }

  // Test with 2609008 gate
  const gate2609008 = spawnSync("git", ["-C", REPO, "show", "2609008:templates/enforcement/astesia-gate.ts"], { encoding: "utf-8" }).stdout;
  writeFileSync(join(tempDir, "gate-2609008.ts"), gate2609008);
  const res2609008 = spawnSync("bun", [join(tempDir, "gate-2609008.ts"), "--root", tempDir, "--rules", RULES, "--json"], { encoding: "utf-8" });
  if (res2609008.status !== 0 && !res2609008.stdout) {
    console.error("res2609008 stderr:", res2609008.stderr);
  } else {
    const json2609008 = JSON.parse(res2609008.stdout);
    console.log("2609008 violations:", json2609008.violations.filter((v: any) => v.file.includes("test-key-solo.ts")).map((v: any) => v.ruleId + ":" + v.message));
  }
} finally {
  try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
}
