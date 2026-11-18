import { spawnSync } from "node:child_process";
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const REPO = "D:/Workspaces/Astesia";
const PUSTAKA_COPY = join(REPO, ".astesia/audit/wave2a.2/pustaka-copy");
const RULES_PATH = join(REPO, "templates/enforcement/anti-patterns.json");
const OUT_DIR = join(REPO, ".astesia/audit/wave2a.2");

const COMMITS = ["56dd907", "4bc9ff4", "b4d7e93", "bbdfa88", "618f8df"];

const outputs: Record<string, any> = {};

for (const c of COMMITS) {
  const gateTs = spawnSync("git", ["-C", REPO, "show", `${c}:templates/enforcement/astesia-gate.ts`], { encoding: "utf8" }).stdout;
  const tmpGate = join(OUT_DIR, `gate-${c}.ts`);
  writeFileSync(tmpGate, gateTs, "utf8");

  console.log(`Running gate at commit ${c}...`);
  const r = spawnSync("bun", [tmpGate, "--root", PUSTAKA_COPY, "--rules", RULES_PATH, "--json"], {
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024
  });

  try {
    const parsed = JSON.parse(r.stdout);
    outputs[c] = parsed;
    writeFileSync(join(OUT_DIR, `pustaka-${c}.json`), JSON.stringify(parsed, null, 2), "utf8");
    console.log(`  Commit ${c}: errors=${parsed.errors}, warnings=${parsed.warnings}, scanned=${parsed.files_scanned?.total}, env_skipped=${parsed.env_ignored_skipped || 0}`);
  } catch (err) {
    console.error(`  Commit ${c} failed to parse JSON stdout:`, r.stderr.slice(0, 200));
  }
}

// Compare 56dd907 vs 4bc9ff4
console.log("\n=== COMPARING 56dd907 vs 4bc9ff4 ===");
compareViolations(outputs["56dd907"], outputs["4bc9ff4"]);

// Compare 4bc9ff4 vs 618f8df
console.log("\n=== COMPARING 4bc9ff4 vs 618f8df ===");
compareViolations(outputs["4bc9ff4"], outputs["618f8df"]);

function compareViolations(a: any, b: any) {
  if (!a || !b) return;
  const setA = new Map<string, any>();
  const setB = new Map<string, any>();

  for (const v of a.violations || []) {
    setA.set(`${v.ruleId}|${v.file}|${v.line}`, v);
  }
  for (const v of b.violations || []) {
    setB.set(`${v.ruleId}|${v.file}|${v.line}`, v);
  }

  const missingInB: any[] = [];
  const addedInB: any[] = [];

  for (const [k, v] of setA) {
    if (!setB.has(k)) missingInB.push(v);
  }
  for (const [k, v] of setB) {
    if (!setA.has(k)) addedInB.push(v);
  }

  console.log(`Lost in B (${missingInB.length}):`);
  for (const v of missingInB) {
    console.log(`  [-] ${v.ruleId} ${v.file}:${v.line} (${v.severity}) - ${v.message}`);
  }

  console.log(`Added in B (${addedInB.length}):`);
  for (const v of addedInB) {
    console.log(`  [+] ${v.ruleId} ${v.file}:${v.line} (${v.severity}) - ${v.message}`);
  }
}
