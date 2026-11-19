/**
 * .astesia/audit/wave2a.6/tools/benchmark.ts
 * Benchmarks Astesia Gate performance across 3 commits:
 * - 56dd907 (wave1.1 baseline)
 * - 2609008 (wave2a.5 BASE)
 * - HEAD (wave2a.6)
 *
 * Corpora:
 * 1. Realistic: 2,000 files, 5 .env* (16 pairs, 1 warmup discarded = 15 measured)
 * 2. Stress: 2,000 files, 100 .env* (16 pairs, 1 warmup discarded = 15 measured)
 * 3. Empty-dir startup: 21 pairs, 1 warmup discarded = 20 measured
 * 4. Eunectes real: 5 pairs
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import os from "node:os";

const REPO_ROOT = resolve(__dirname, "../../../..");
const HEAD_GATE = join(REPO_ROOT, "templates/enforcement/astesia-gate.ts");
const RULES_PATH = join(REPO_ROOT, "templates/enforcement/anti-patterns.json");
const BENCH_OUT = join(REPO_ROOT, ".astesia/audit/wave2a.6/benchmarks.json");

const benchTmp = join(os.tmpdir(), `astesia-bench-2a6-${Date.now()}`);
mkdirSync(benchTmp, { recursive: true });

const GATE_56 = join(benchTmp, "gate_56dd907.ts");
const GATE_BASE = join(benchTmp, "gate_2609008.ts");

// Extract historical gates via git show
const r56 = spawnSync("git", ["-C", REPO_ROOT, "show", "56dd907:templates/enforcement/astesia-gate.ts"], {
  encoding: "utf8",
  maxBuffer: 50 * 1024 * 1024
});
if (r56.status !== 0 || !r56.stdout) throw new Error("Failed to extract gate from 56dd907");
writeFileSync(GATE_56, r56.stdout, "utf8");

const rBase = spawnSync("git", ["-C", REPO_ROOT, "show", "2609008:templates/enforcement/astesia-gate.ts"], {
  encoding: "utf8",
  maxBuffer: 50 * 1024 * 1024
});
if (rBase.status !== 0 || !rBase.stdout) throw new Error("Failed to extract gate from 2609008");
writeFileSync(GATE_BASE, rBase.stdout, "utf8");

// Prepare Eunectes copy
const EUNECTES_SRC = "D:/Workspaces/eunectes";
const EUNECTES_COPY = join(benchTmp, "eunectes_bench");
if (existsSync(EUNECTES_SRC)) {
  mkdirSync(EUNECTES_COPY, { recursive: true });
  cpSync(EUNECTES_SRC, EUNECTES_COPY, {
    recursive: true,
    filter: (src) => {
      const b = basename(src);
      return b !== ".git" && b !== "node_modules" && b !== "vendor" && b !== "dist" && b !== ".next";
    }
  });
}

function gitInitAndIgnore(dir: string) {
  spawnSync("git", ["init", "-q", dir], { stdio: "ignore" });
  writeFileSync(join(dir, ".gitignore"), "node_modules/\ndist/\nvendor/\n", "utf8");
}

function createSynthRepo(dir: string, totalFiles: number, envCount: number) {
  mkdirSync(dir, { recursive: true });
  gitInitAndIgnore(dir);
  const codeCount = totalFiles - envCount;
  for (let i = 0; i < codeCount; i++) {
    const sub = join(dir, `pkg_${i % 20}`);
    if (i < 20) mkdirSync(sub, { recursive: true });
    writeFileSync(
      join(sub, `mod_${i}.ts`),
      `// Module ${i}\nexport const rx_${i} = /a+b+\`/g;\nexport function compute_${i}(x: number) { return x / 2; }\n`,
      "utf8"
    );
  }
  for (let e = 0; e < envCount; e++) {
    writeFileSync(join(dir, `.env.local_${e}`), `PORT=${3000 + e}\nAPP_MODE=development\n`, "utf8");
  }
}

function timeGateMs(gatePath: string, rootDir: string): number {
  const t0 = performance.now();
  spawnSync(process.execPath, [gatePath, "--root", rootDir, "--rules", RULES_PATH, "--json"], {
    stdio: "pipe",
    maxBuffer: 50 * 1024 * 1024
  });
  return performance.now() - t0;
}

function computeStats(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const n = sorted.length;
  const median = n % 2 === 1 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const p95Idx = Math.min(n - 1, Math.ceil(n * 0.95) - 1);
  return {
    count: n,
    median_ms: Number(median.toFixed(2)),
    p95_ms: Number(sorted[p95Idx].toFixed(2)),
    min_ms: Number(sorted[0].toFixed(2)),
    max_ms: Number(sorted[n - 1].toFixed(2)),
    samples_ms: samples.map((x) => Number(x.toFixed(2)))
  };
}

function runAlternatingTriplet(rootDir: string, totalPairs: number, discardFirst: boolean) {
  const s56: number[] = [];
  const sBase: number[] = [];
  const sHead: number[] = [];

  for (let p = 0; p < totalPairs; p++) {
    const t56 = timeGateMs(GATE_56, rootDir);
    const tBase = timeGateMs(GATE_BASE, rootDir);
    const tHead = timeGateMs(HEAD_GATE, rootDir);
    if (discardFirst && p === 0) continue;
    s56.push(t56);
    sBase.push(tBase);
    sHead.push(tHead);
  }

  const st56 = computeStats(s56);
  const stBase = computeStats(sBase);
  const stHead = computeStats(sHead);

  return {
    "56dd907": st56,
    "2609008": stBase,
    HEAD: stHead,
    ratio_head_vs_56dd907: Number((stHead.median_ms / st56.median_ms).toFixed(4)),
    ratio_head_vs_2609008: Number((stHead.median_ms / stBase.median_ms).toFixed(4))
  };
}

try {
  console.log("Setting up benchmark corpora...");
  const realisticDir = join(benchTmp, "realistic");
  const stressDir = join(benchTmp, "stress");
  const emptyDir = join(benchTmp, "empty");
  mkdirSync(emptyDir, { recursive: true });
  createSynthRepo(realisticDir, 2000, 5);
  createSynthRepo(stressDir, 2000, 100);

  console.log("Running Realistic benchmark (2,000 files, 5 .env*, 16 alternating triplets, pair 1 warmup discarded = 15 measured)...");
  const realistic = runAlternatingTriplet(realisticDir, 16, true);

  console.log("Running Stress benchmark (2,000 files, 100 .env*, 16 alternating triplets, pair 1 warmup discarded = 15 measured)...");
  const stress = runAlternatingTriplet(stressDir, 16, true);

  console.log("Running Empty-dir Startup benchmark (21 alternating triplets, pair 1 warmup discarded = 20 measured)...");
  const startup = runAlternatingTriplet(emptyDir, 21, true);

  console.log("Running Eunectes real project benchmark (5 alternating triplets)...");
  const eunectes = runAlternatingTriplet(EUNECTES_COPY, 5, false);

  const out = {
    timestamp: new Date().toISOString(),
    realistic_2000_5env: realistic,
    stress_2000_100env: stress,
    empty_dir_startup: startup,
    eunectes_real: eunectes,
    thresholds_met: {
      realistic_vs_56dd907_le_1_25: realistic.ratio_head_vs_56dd907 <= 1.25,
      realistic_vs_2609008_le_1_15: realistic.ratio_head_vs_2609008 <= 1.15,
      stress_vs_56dd907_le_1_25: stress.ratio_head_vs_56dd907 <= 1.25,
      stress_vs_2609008_le_1_15: stress.ratio_head_vs_2609008 <= 1.15
    }
  };

  writeFileSync(BENCH_OUT, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log("Benchmarks completed:");
  console.log(`  - Realistic: 56dd907=${realistic["56dd907"].median_ms}ms, 2609008=${realistic["2609008"].median_ms}ms, HEAD=${realistic.HEAD.median_ms}ms (vs 56=${realistic.ratio_head_vs_56dd907}x, vs 26=${realistic.ratio_head_vs_2609008}x)`);
  console.log(`  - Stress:    56dd907=${stress["56dd907"].median_ms}ms, 2609008=${stress["2609008"].median_ms}ms, HEAD=${stress.HEAD.median_ms}ms (vs 56=${stress.ratio_head_vs_56dd907}x, vs 26=${stress.ratio_head_vs_2609008}x)`);
  console.log(`  - Startup:   56dd907=${startup["56dd907"].median_ms}ms, 2609008=${startup["2609008"].median_ms}ms, HEAD=${startup.HEAD.median_ms}ms`);
  console.log(`  - Eunectes:  56dd907=${eunectes["56dd907"].median_ms}ms, 2609008=${eunectes["2609008"].median_ms}ms, HEAD=${eunectes.HEAD.median_ms}ms`);
} finally {
  try {
    rmSync(benchTmp, { recursive: true, force: true });
  } catch {}
}
