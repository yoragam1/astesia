import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BASE_GATE = "D:/Workspaces/Astesia/.astesia/audit/wave2a.1/astesia-gate.56dd907.ts";
const HEAD_GATE = "D:/Workspaces/Astesia/templates/enforcement/astesia-gate.ts";
const RULES = "D:/Workspaces/Astesia/templates/enforcement/anti-patterns.json";

const SYNTH_DIR = `D:/Workspaces/Astesia/.astesia/audit/wave2a.1/synth2000-${Date.now()}`;
const OUT_FILE = "D:/Workspaces/Astesia/.astesia/audit/wave2a.1/p3-results.json";

console.log("=== P3 ALTERNATING PERFORMANCE BENCHMARK (15 PAIRS: 56dd907 vs HEAD) ===");

// 1. Generate 2,000 synthetic files across languages
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
console.log(`Generated ${totalFiles} synthetic files in ${SYNTH_DIR}.`);

function runOne(gate: string) {
  const start = performance.now();
  const res = spawnSync("bun", [gate, "--root", SYNTH_DIR, "--rules", RULES, "--json"], { encoding: "utf8" });
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
runOne(BASE_GATE);
runOne(HEAD_GATE);

const baseRuns: number[] = [];
const headRuns: number[] = [];
const pairs: any[] = [];

console.log("\nRunning 15 alternating pairs (Base 56dd907 vs Head)...");
for (let p = 1; p <= 15; p++) {
  const baseRes = runOne(BASE_GATE);
  const headRes = runOne(HEAD_GATE);
  baseRuns.push(baseRes.durationMs);
  headRuns.push(headRes.durationMs);
  const pairRatio = headRes.durationMs / baseRes.durationMs;
  pairs.push({
    pair: p,
    baseMs: baseRes.durationMs,
    headMs: headRes.durationMs,
    ratio: pairRatio
  });
  console.log(`  Pair ${p.toString().padStart(2, " ")}: Base = ${baseRes.durationMs.toFixed(1)} ms | Head = ${headRes.durationMs.toFixed(1)} ms | Ratio = ${pairRatio.toFixed(3)}x`);
}

function stats(arr: number[]) {
  const sorted = [...arr].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return { min, max, range: max - min, median };
}

const baseStats = stats(baseRuns);
const headStats = stats(headRuns);
const medianRatio = headStats.median / baseStats.median;

console.log("\n--- Summary ---");
console.log(`Base Gate (56dd907): Min = ${baseStats.min.toFixed(1)} ms, Median = ${baseStats.median.toFixed(1)} ms, Max = ${baseStats.max.toFixed(1)} ms, Range = ${baseStats.range.toFixed(1)} ms`);
console.log(`Head Gate (bbdfa88): Min = ${headStats.min.toFixed(1)} ms, Median = ${headStats.median.toFixed(1)} ms, Max = ${headStats.max.toFixed(1)} ms, Range = ${headStats.range.toFixed(1)} ms`);
console.log(`Median Ratio (Head / Base): ${medianRatio.toFixed(3)}x`);

const results = {
  totalFiles,
  pairs,
  baseRuns,
  headRuns,
  baseStats,
  headStats,
  medianRatio,
  compliant: medianRatio <= 1.25
};

writeFileSync(OUT_FILE, JSON.stringify(results, null, 2), "utf8");
console.log(`Saved benchmark results to ${OUT_FILE}`);

// Cleanup synth files
try {
  rmSync(SYNTH_DIR, { recursive: true, force: true });
} catch {}
console.log("Benchmark complete.");
