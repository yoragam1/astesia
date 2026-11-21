/**
 * .astesia/audit/wave2a.7/tools/benchmark.ts
 * Benchmarks Astesia Gate performance across:
 * - 56dd907 (Wave 1.1 baseline)
 * - 2609008 (Wave 2A.5 BASE)
 * - bc3c077 (Wave 2A.6 START)
 * - HEAD (Wave 2A.7)
 *
 * Corpora:
 * 1. Realistic: 2,000 files, 5 .env* (16 triplets, 1 warmup discarded = 15 measured)
 * 2. Stress: 2,000 files, 100 .env* (16 triplets, 1 warmup discarded = 15 measured)
 * 3. Empty-dir startup: 21 triplets, 1 warmup discarded = 20 measured
 * 4. Eunectes real: 5 triplets
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import os from "node:os";

const REPO_ROOT = resolve(__dirname, "../../../..");
const HEAD_GATE = join(REPO_ROOT, "templates/enforcement/astesia-gate.ts");
const RULES_PATH = join(REPO_ROOT, "templates/enforcement/anti-patterns.json");
const BENCH_OUT = join(REPO_ROOT, ".astesia/audit/wave2a.7/benchmarks.json");

const benchTmp = join(os.tmpdir(), `astesia-bench-2a7-${Date.now()}`);
mkdirSync(benchTmp, { recursive: true });

const GATE_56 = join(benchTmp, "gate_56dd907.ts");
const GATE_BASE5 = join(benchTmp, "gate_2609008.ts");
const GATE_START = join(benchTmp, "gate_bc3c077.ts");

// Extract historical gates
const r56 = spawnSync("git", ["-C", REPO_ROOT, "show", "56dd907:templates/enforcement/astesia-gate.ts"], {
  encoding: "utf8",
  maxBuffer: 50 * 1024 * 1024
});
if (r56.status !== 0 || !r56.stdout) throw new Error("Failed to extract gate from 56dd907");
writeFileSync(GATE_56, r56.stdout, "utf8");

const rBase5 = spawnSync("git", ["-C", REPO_ROOT, "show", "2609008:templates/enforcement/astesia-gate.ts"], {
  encoding: "utf8",
  maxBuffer: 50 * 1024 * 1024
});
if (rBase5.status !== 0 || !rBase5.stdout) throw new Error("Failed to extract gate from 2609008");
writeFileSync(GATE_BASE5, rBase5.stdout, "utf8");

const rStart = spawnSync("git", ["-C", REPO_ROOT, "show", "bc3c077:templates/enforcement/astesia-gate.ts"], {
  encoding: "utf8",
  maxBuffer: 50 * 1024 * 1024
});
if (rStart.status !== 0 || !rStart.stdout) throw new Error("Failed to extract gate from bc3c077");
writeFileSync(GATE_START, rStart.stdout, "utf8");

// Prepare Eunectes copy from copyDir or workspace
const copyDir = join(os.tmpdir(), "astesia-2a7-copies");
const EUNECTES_SRC = existsSync(join(copyDir, "eunectes")) ? join(copyDir, "eunectes") : "D:/Workspaces/eunectes";
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
      `// Module ${i}\nexport const rx_${i} = /a+b+/g;\nexport function compute_${i}(x: number) { return x / 2; }\n`,
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

function runAlternatingBenchmark(rootDir: string, totalRuns: number, discardFirst: boolean) {
  const s56: number[] = [];
  const sBase5: number[] = [];
  const sStart: number[] = [];
  const sHead: number[] = [];

  for (let p = 0; p < totalRuns; p++) {
    const t56 = timeGateMs(GATE_56, rootDir);
    const tBase5 = timeGateMs(GATE_BASE5, rootDir);
    const tStart = timeGateMs(GATE_START, rootDir);
    const tHead = timeGateMs(HEAD_GATE, rootDir);
    if (discardFirst && p === 0) continue;
    s56.push(t56);
    sBase5.push(tBase5);
    sStart.push(tStart);
    sHead.push(tHead);
  }

  const st56 = computeStats(s56);
  const stBase5 = computeStats(sBase5);
  const stStart = computeStats(sStart);
  const stHead = computeStats(sHead);

  return {
    "56dd907": st56,
    "2609008": stBase5,
    "bc3c077": stStart,
    HEAD: stHead,
    ratio_head_vs_56dd907: Number((stHead.median_ms / st56.median_ms).toFixed(4)),
    ratio_head_vs_2609008: Number((stHead.median_ms / stBase5.median_ms).toFixed(4)),
    ratio_head_vs_bc3c077: Number((stHead.median_ms / stStart.median_ms).toFixed(4))
  };
}

try {
  console.log("Setting up benchmark corpora...");
  const realisticDir = join(benchTmp, "realistic");
  const stressDir = join(benchTmp, "stress");
  const emptyDir = join(benchTmp, "empty");

  createSynthRepo(realisticDir, 2000, 5);
  createSynthRepo(stressDir, 2000, 100);
  mkdirSync(emptyDir, { recursive: true });
  gitInitAndIgnore(emptyDir);

  console.log("1. Benchmarking Realistic corpus (16 runs, 15 measured)...");
  const realisticRes = runAlternatingBenchmark(realisticDir, 16, true);

  console.log("2. Benchmarking Stress corpus (16 runs, 15 measured)...");
  const stressRes = runAlternatingBenchmark(stressDir, 16, true);

  console.log("3. Benchmarking Empty startup (21 runs, 20 measured)...");
  const startupRes = runAlternatingBenchmark(emptyDir, 21, true);

  let eunectesRes: any = null;
  if (existsSync(EUNECTES_COPY)) {
    console.log("4. Benchmarking Eunectes real corpus (5 runs)...");
    eunectesRes = runAlternatingBenchmark(EUNECTES_COPY, 5, false);
  }

  const output = {
    version: "1.0.0",
    scope: "wave2a.7",
    timestamp: new Date().toISOString(),
    corpora: {
      realistic: realisticRes,
      stress: stressRes,
      startup: startupRes,
      eunectes: eunectesRes
    }
  };

  writeFileSync(BENCH_OUT, JSON.stringify(output, null, 2), "utf8");
  console.log("Benchmarks written to:", BENCH_OUT);
  console.log(`Realistic median: HEAD=${realisticRes.HEAD.median_ms}ms, START=${realisticRes.bc3c077.median_ms}ms, BASE5=${realisticRes["2609008"].median_ms}ms`);
  console.log(`Stress median:    HEAD=${stressRes.HEAD.median_ms}ms, START=${stressRes.bc3c077.median_ms}ms`);
  console.log(`Startup median:   HEAD=${startupRes.HEAD.median_ms}ms, START=${startupRes.bc3c077.median_ms}ms`);
} finally {
  try {
    rmSync(benchTmp, { recursive: true, force: true });
  } catch {}
}
