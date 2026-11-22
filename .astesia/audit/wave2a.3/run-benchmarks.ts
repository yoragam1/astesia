/**
 * .astesia/audit/wave2a.3/run-benchmarks.ts
 * Performance benchmark comparing:
 * - 56dd907 (Wave 1.1 head)
 * - 27fe428 (Wave 2A.2 head)
 * - current HEAD (Wave 2A.3 head)
 *
 * Corpora:
 * - Realistic: 2,000 files (1,995 .ts files, 5 .env files)
 * - Stress: 2,000 files (1,900 .ts files, 100 .env files)
 *
 * Runs 15 alternating rounds, computes medians and ratios, asserts invariants:
 * - head / 56dd907 <= 1.25x
 * - head / 27fe428 <= 1.10x
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(__dirname, "../../..");
const WORK_DIR = join(REPO_ROOT, ".astesia/audit/tmp/bench-" + Date.now());
mkdirSync(WORK_DIR, { recursive: true });

// 1. Extract historic gates
const gate56dd907Path = join(WORK_DIR, "gate-56dd907.ts");
const gate27fe428Path = join(WORK_DIR, "gate-27fe428.ts");
const gateHeadPath = join(REPO_ROOT, "templates/enforcement/astesia-gate.ts");
const rulesPath = join(REPO_ROOT, "templates/enforcement/anti-patterns.json");

const g1Res = spawnSync("git", ["show", "56dd907:templates/enforcement/astesia-gate.ts"], {
  cwd: REPO_ROOT,
  encoding: "utf8",
  maxBuffer: 50 * 1024 * 1024
});
writeFileSync(gate56dd907Path, g1Res.stdout, "utf8");

const g2Res = spawnSync("git", ["show", "27fe428:templates/enforcement/astesia-gate.ts"], {
  cwd: REPO_ROOT,
  encoding: "utf8",
  maxBuffer: 50 * 1024 * 1024
});
writeFileSync(gate27fe428Path, g2Res.stdout, "utf8");

// 2. Build Realistic Corpus (2,000 files: 1,995 .ts, 5 .env)
console.log("Generating Realistic corpus (2,000 files)...");
const realisticDir = join(WORK_DIR, "realistic");
mkdirSync(realisticDir, { recursive: true });
spawnSync("git", ["init"], { cwd: realisticDir });

for (let i = 1; i <= 1995; i++) {
  writeFileSync(
    join(realisticDir, `service_${i}.ts`),
    `export function calculate_${i}(a: number, b: number): number {\n  return a + b * ${i};\n}\n`
  );
}
for (let i = 1; i <= 5; i++) {
  writeFileSync(
    join(realisticDir, `.env.local_${i}`),
    `APP_ENV=realistic_${i}\nPORT=808${i}\n`
  );
}

// 3. Build Stress Corpus (2,000 files: 1,900 .ts, 100 .env)
console.log("Generating Stress corpus (2,000 files)...");
const stressDir = join(WORK_DIR, "stress");
mkdirSync(stressDir, { recursive: true });
spawnSync("git", ["init"], { cwd: stressDir });

for (let i = 1; i <= 1900; i++) {
  writeFileSync(
    join(stressDir, `worker_${i}.ts`),
    `export const worker_${i} = (data: unknown) => ({ processed: true, id: ${i} });\n`
  );
}
for (let i = 1; i <= 100; i++) {
  writeFileSync(
    join(stressDir, `.env.module_${i}`),
    `MODULE_NAME=module_${i}\nDEBUG=false\n`
  );
}

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Number(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(2));
  }
  return Number(sorted[mid].toFixed(2));
}

function runMeasurement(gate: string, rootDir: string): number {
  const start = performance.now();
  spawnSync("bun", [gate, "--root", rootDir, "--rules", rulesPath, "--json"], {
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024
  });
  return Math.round(performance.now() - start);
}

const ROUNDS = 15;

// Benchmarking Realistic Corpus
console.log(`Running ${ROUNDS} alternating rounds on Realistic Corpus...`);
const realisticResults = {
  gate_56dd907: [] as number[],
  gate_27fe428: [] as number[],
  gate_head: [] as number[]
};

// Warmup
runMeasurement(gate56dd907Path, realisticDir);
runMeasurement(gate27fe428Path, realisticDir);
runMeasurement(gateHeadPath, realisticDir);

for (let r = 1; r <= ROUNDS; r++) {
  process.stdout.write(`  Realistic Round ${r}/${ROUNDS}... `);
  const t1 = runMeasurement(gate56dd907Path, realisticDir);
  const t2 = runMeasurement(gate27fe428Path, realisticDir);
  const t3 = runMeasurement(gateHeadPath, realisticDir);
  realisticResults.gate_56dd907.push(t1);
  realisticResults.gate_27fe428.push(t2);
  realisticResults.gate_head.push(t3);
  console.log(`56dd907=${t1}ms | 27fe428=${t2}ms | head=${t3}ms`);
}

const realisticMedians = {
  gate_56dd907: median(realisticResults.gate_56dd907),
  gate_27fe428: median(realisticResults.gate_27fe428),
  gate_head: median(realisticResults.gate_head)
};

const realisticRatios = {
  head_vs_56dd907: Number((realisticMedians.gate_head / realisticMedians.gate_56dd907).toFixed(3)),
  head_vs_27fe428: Number((realisticMedians.gate_head / realisticMedians.gate_27fe428).toFixed(3))
};

const realisticOutput = {
  benchmark: "Realistic Corpus (2,000 files: 1,995 .ts, 5 .env)",
  rounds: ROUNDS,
  rawRunsMs: realisticResults,
  mediansMs: realisticMedians,
  ratios: realisticRatios,
  thresholds: {
    head_vs_56dd907_max: 1.25,
    head_vs_27fe428_max: 1.10
  },
  passed:
    realisticRatios.head_vs_56dd907 <= 1.25 &&
    realisticRatios.head_vs_27fe428 <= 1.10
};

writeFileSync(
  join(REPO_ROOT, ".astesia/audit/wave2a.3/p3-realistic.json"),
  JSON.stringify(realisticOutput, null, 2),
  "utf8"
);
console.log("Realistic benchmark saved:", realisticRatios, "Passed:", realisticOutput.passed);

// Benchmarking Stress Corpus
console.log(`\nRunning ${ROUNDS} alternating rounds on Stress Corpus...`);
const stressResults = {
  gate_56dd907: [] as number[],
  gate_27fe428: [] as number[],
  gate_head: [] as number[]
};

// Warmup
runMeasurement(gate56dd907Path, stressDir);
runMeasurement(gate27fe428Path, stressDir);
runMeasurement(gateHeadPath, stressDir);

for (let r = 1; r <= ROUNDS; r++) {
  process.stdout.write(`  Stress Round ${r}/${ROUNDS}... `);
  const t1 = runMeasurement(gate56dd907Path, stressDir);
  const t2 = runMeasurement(gate27fe428Path, stressDir);
  const t3 = runMeasurement(gateHeadPath, stressDir);
  stressResults.gate_56dd907.push(t1);
  stressResults.gate_27fe428.push(t2);
  stressResults.gate_head.push(t3);
  console.log(`56dd907=${t1}ms | 27fe428=${t2}ms | head=${t3}ms`);
}

const stressMedians = {
  gate_56dd907: median(stressResults.gate_56dd907),
  gate_27fe428: median(stressResults.gate_27fe428),
  gate_head: median(stressResults.gate_head)
};

const stressRatios = {
  head_vs_56dd907: Number((stressMedians.gate_head / stressMedians.gate_56dd907).toFixed(3)),
  head_vs_27fe428: Number((stressMedians.gate_head / stressMedians.gate_27fe428).toFixed(3))
};

const stressOutput = {
  benchmark: "Stress Corpus (2,000 files: 1,900 .ts, 100 .env)",
  rounds: ROUNDS,
  rawRunsMs: stressResults,
  mediansMs: stressMedians,
  ratios: stressRatios,
  thresholds: {
    head_vs_56dd907_max: 1.25,
    head_vs_27fe428_max: 1.10
  },
  passed:
    stressRatios.head_vs_56dd907 <= 1.25 &&
    stressRatios.head_vs_27fe428 <= 1.10
};

writeFileSync(
  join(REPO_ROOT, ".astesia/audit/wave2a.3/p3-stress.json"),
  JSON.stringify(stressOutput, null, 2),
  "utf8"
);
console.log("Stress benchmark saved:", stressRatios, "Passed:", stressOutput.passed);

try {
  rmSync(WORK_DIR, { recursive: true, force: true });
} catch {}

console.log("\nBenchmarks completed successfully.");
