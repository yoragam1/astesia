import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const OLD_GATE = "D:/Workspaces/Astesia/.astesia/audit/verify11/orig/astesia-gate.orig.ts";
const OLD_RULES = "D:/Workspaces/Astesia/.astesia/audit/verify11/orig/anti-patterns.orig.json";
const NEW_GATE = "D:/Workspaces/Astesia/templates/enforcement/astesia-gate.ts";
const NEW_RULES = "D:/Workspaces/Astesia/templates/enforcement/anti-patterns.json";

const SYNTH_DIR = "D:/Workspaces/Astesia/.astesia/audit/wave2a/synth2000";
const OUT_FILE = "D:/Workspaces/Astesia/.astesia/audit/wave2a/p3-results.json";

console.log("=== P3 ALTERNATING PERFORMANCE BENCHMARK (10 PAIRS) ===");

// 1. Generate 2,000 synthetic files across languages
rmSync(SYNTH_DIR, { recursive: true, force: true });
mkdirSync(SYNTH_DIR, { recursive: true });

const extGroups = [
  { ext: ".ts", count: 800 },
  { ext: ".js", count: 200 },
  { ext: ".py", count: 300 },
  { ext: ".go", count: 200 },
  { ext: ".php", count: 100 },
  { ext: ".vue", count: 100 },
  { ext: ".svelte", count: 100 },
  { ext: ".yml", count: 100 },
  { ext: ".sql", count: 50 },
  { ext: ".md", count: 50 }
];

let totalFiles = 0;
for (const g of extGroups) {
  for (let i = 0; i < g.count; i++) {
    totalFiles++;
    const folder = join(SYNTH_DIR, `f_${Math.floor(totalFiles / 100)}`);
    if (!existsSync(folder)) mkdirSync(folder, { recursive: true });
    
    let snippet = `// Synthetic ${totalFiles}\n`;
    if (g.ext === ".ts" || g.ext === ".js") {
      snippet = `export function calc_${totalFiles}(x: number) {\n  const msg = "Processing item ${totalFiles}";\n  /* Comment */\n  return x * 2;\n}\n`;
    } else if (g.ext === ".py") {
      snippet = `def compute_${totalFiles}(val):\n    """Docstring"""\n    return val * 2\n`;
    } else if (g.ext === ".go") {
      snippet = `package main\nfunc Calc_${totalFiles}(n int) int {\n  return n * 2\n}\n`;
    } else if (g.ext === ".php") {
      snippet = `<?php\nfunction calc_${totalFiles}($x) { return $x * 2; }\n`;
    } else {
      snippet = `key_${totalFiles}: value_${totalFiles}\n`;
    }
    writeFileSync(join(folder, `item_${totalFiles}${g.ext}`), snippet);
  }
}
console.log(`Generated ${totalFiles} synthetic files.`);

function runOne(gate: string, rules: string) {
  const start = performance.now();
  const res = spawnSync("bun", [gate, "--root", SYNTH_DIR, "--rules", rules, "--json"], { encoding: "utf8" });
  const end = performance.now();
  let parsed: any = null;
  try { parsed = JSON.parse(res.stdout); } catch (e) {}
  return {
    durationMs: end - start,
    status: res.status,
    filesScanned: parsed?.files_scanned?.total
  };
}

// Warmup
console.log("\nRunning warmup...");
runOne(OLD_GATE, OLD_RULES);
runOne(NEW_GATE, NEW_RULES);

const oldRuns: number[] = [];
const newRuns: number[] = [];
const pairs: any[] = [];

console.log("\nRunning 10 alternating pairs (Old, New, Old, New...):");
for (let p = 1; p <= 10; p++) {
  const oldRes = runOne(OLD_GATE, OLD_RULES);
  const newRes = runOne(NEW_GATE, NEW_RULES);
  oldRuns.push(oldRes.durationMs);
  newRuns.push(newRes.durationMs);
  pairs.push({
    pair: p,
    oldMs: oldRes.durationMs,
    newMs: newRes.durationMs,
    ratio: newRes.durationMs / oldRes.durationMs
  });
  console.log(`  Pair ${p}: Old = ${oldRes.durationMs.toFixed(1)} ms | New = ${newRes.durationMs.toFixed(1)} ms | Ratio = ${(newRes.durationMs / oldRes.durationMs).toFixed(3)}x`);
}

function stats(arr: number[]) {
  const sorted = [...arr].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return { min, max, range: max - min, median };
}

const oldStats = stats(oldRuns);
const newStats = stats(newRuns);
const medianRatio = newStats.median / oldStats.median;

console.log("\n--- Summary ---");
console.log(`Old Gate (1d66a66): Min = ${oldStats.min.toFixed(1)} ms, Median = ${oldStats.median.toFixed(1)} ms, Max = ${oldStats.max.toFixed(1)} ms, Range = ${oldStats.range.toFixed(1)} ms`);
console.log(`New Gate (56dd907): Min = ${newStats.min.toFixed(1)} ms, Median = ${newStats.median.toFixed(1)} ms, Max = ${newStats.max.toFixed(1)} ms, Range = ${newStats.range.toFixed(1)} ms`);
console.log(`Median Ratio (New / Old): ${medianRatio.toFixed(3)}x`);

const results = {
  totalFiles,
  pairs,
  oldRuns,
  newRuns,
  oldStats,
  newStats,
  medianRatio,
  compliant: medianRatio <= 1.25
};

writeFileSync(OUT_FILE, JSON.stringify(results, null, 2));
console.log(`Saved to ${OUT_FILE}`);

// Cleanup synth files
rmSync(SYNTH_DIR, { recursive: true, force: true });
console.log("Cleaned up synth2000 directory.");
