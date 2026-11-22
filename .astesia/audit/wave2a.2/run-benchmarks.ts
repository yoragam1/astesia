import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BASE_GATE = "D:/Workspaces/Astesia/.astesia/audit/wave2a.1/astesia-gate.56dd907.ts";
const HEAD_GATE = "D:/Workspaces/Astesia/templates/enforcement/astesia-gate.ts";
const RULES = "D:/Workspaces/Astesia/templates/enforcement/anti-patterns.json";

function stats(arr: number[]) {
  const sorted = [...arr].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return { min, max, range: max - min, median };
}

function runOne(gate: string, rootDir: string) {
  const start = performance.now();
  const res = spawnSync("bun", [gate, "--root", rootDir, "--rules", RULES, "--json"], { encoding: "utf8" });
  const end = performance.now();
  let parsed: any = null;
  try { parsed = JSON.parse(res.stdout); } catch (e) {}
  return {
    durationMs: end - start,
    status: res.status,
    filesScanned: parsed?.files_scanned?.total
  };
}

function buildSyntheticDataset(dir: string, envCount: number, otherCount: number) {
  mkdirSync(dir, { recursive: true });

  // Init git repo so git-based operations in head gate can run
  spawnSync("git", ["init"], { cwd: dir });
  spawnSync("git", ["config", "user.email", "test@bench.local"], { cwd: dir });
  spawnSync("git", ["config", "user.name", "Benchmarker"], { cwd: dir });

  writeFileSync(join(dir, ".gitignore"), ".env*\n", "utf8");

  // Create .env files (ignored & untracked)
  for (let i = 1; i <= envCount; i++) {
    const envSub = join(dir, `env_${Math.floor(i / 20)}`);
    if (!existsSync(envSub)) mkdirSync(envSub, { recursive: true });
    writeFileSync(
      join(envSub, `.env.app_${i}`),
      `APP_ENV=production\nDATABASE_PORT=5432\nCACHE_DRIVER=redis\nTIMEOUT=30\n`,
      "utf8"
    );
  }

  // Create other files across languages
  const perCategory = Math.floor(otherCount / 10);
  const exts = [".ts", ".js", ".py", ".go", ".php", ".vue", ".svelte", ".yml", ".sql", ".md"];
  let created = 0;

  for (let c = 0; c < exts.length; c++) {
    const ext = exts[c];
    const count = (c === exts.length - 1) ? (otherCount - created) : perCategory;
    for (let i = 0; i < count; i++) {
      created++;
      const folder = join(dir, `src_${Math.floor(created / 100)}`);
      if (!existsSync(folder)) mkdirSync(folder, { recursive: true });

      let snippet = `// Synthetic item ${created}\n`;
      if (ext === ".ts" || ext === ".js") {
        snippet = `export function computeItem_${created}(val: number): number {\n  const message = "Processing data ${created}";\n  return val * 3;\n}\n`;
      } else if (ext === ".py") {
        snippet = `def compute_item_${created}(val):\n    """Docstring ${created}"""\n    return val * 3\n`;
      } else if (ext === ".go") {
        snippet = `package item\nfunc ComputeItem_${created}(v int) int {\n  return v * 3\n}\n`;
      } else if (ext === ".php") {
        snippet = `<?php\nfunction computeItem_${created}($v) { return $v * 3; }\n`;
      } else {
        snippet = `key_${created}: item_value_${created}\n`;
      }
      writeFileSync(join(folder, `item_${created}${ext}`), snippet, "utf8");
    }
  }

  spawnSync("git", ["add", ".gitignore", "src_*"], { cwd: dir });
  spawnSync("git", ["commit", "-m", "Initial synthetic commit"], { cwd: dir });
}

function runBenchmarkSuite(name: string, dir: string, envCount: number, otherCount: number, outFile: string) {
  console.log(`\n======================================================`);
  console.log(`BENCHMARK: ${name} (${envCount + otherCount} total files: ${envCount} .env, ${otherCount} code/doc)`);
  console.log(`======================================================`);

  buildSyntheticDataset(dir, envCount, otherCount);
  console.log(`Dataset generated at ${dir}`);

  // Warmup
  console.log("Warming up Base and Head gates...");
  runOne(BASE_GATE, dir);
  runOne(HEAD_GATE, dir);

  const baseRuns: number[] = [];
  const headRuns: number[] = [];
  const pairs: any[] = [];

  console.log("Executing 15 alternating pairs (Base 56dd907 vs Head wave2a.2)...");
  for (let p = 1; p <= 15; p++) {
    const baseRes = runOne(BASE_GATE, dir);
    const headRes = runOne(HEAD_GATE, dir);

    baseRuns.push(baseRes.durationMs);
    headRuns.push(headRes.durationMs);

    const ratio = headRes.durationMs / baseRes.durationMs;
    pairs.push({
      pair: p,
      baseMs: Math.round(baseRes.durationMs * 10) / 10,
      headMs: Math.round(headRes.durationMs * 10) / 10,
      ratio: Math.round(ratio * 1000) / 1000,
      baseStatus: baseRes.status,
      headStatus: headRes.status
    });

    console.log(
      `  Pair ${p.toString().padStart(2, " ")}: Base = ${baseRes.durationMs.toFixed(1)} ms | Head = ${headRes.durationMs.toFixed(1)} ms | Ratio = ${ratio.toFixed(3)}x`
    );
  }

  const baseStats = stats(baseRuns);
  const headStats = stats(headRuns);
  const medianRatio = headStats.median / baseStats.median;
  const passedContract = medianRatio <= 1.25;

  const result = {
    benchmark: name,
    timestamp: new Date().toISOString(),
    config: {
      totalFiles: envCount + otherCount,
      envFiles: envCount,
      otherFiles: otherCount,
      pairs: 15,
      contractLimit: 1.25
    },
    pairs,
    statistics: {
      base: {
        minMs: Math.round(baseStats.min * 10) / 10,
        maxMs: Math.round(baseStats.max * 10) / 10,
        rangeMs: Math.round(baseStats.range * 10) / 10,
        medianMs: Math.round(baseStats.median * 10) / 10
      },
      head: {
        minMs: Math.round(headStats.min * 10) / 10,
        maxMs: Math.round(headStats.max * 10) / 10,
        rangeMs: Math.round(headStats.range * 10) / 10,
        medianMs: Math.round(headStats.median * 10) / 10
      },
      medianRatio: Math.round(medianRatio * 1000) / 1000,
      passedContract
    }
  };

  writeFileSync(outFile, JSON.stringify(result, null, 2), "utf8");
  console.log(`\nResults written to ${outFile}`);
  console.log(`Base Median: ${baseStats.median.toFixed(1)} ms | Head Median: ${headStats.median.toFixed(1)} ms`);
  console.log(`Median Ratio: ${medianRatio.toFixed(3)}x (Threshold <= 1.25x) -> ${passedContract ? "PASS" : "FAIL"}`);

  // Cleanup dataset
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch (e) {}

  return result;
}

// 1. Realistic: 2,000 files (5 .env, 1,995 other)
const realisticDir = `D:/Workspaces/Astesia/.astesia/audit/wave2a.2/synth-realistic-${Date.now()}`;
const realisticOut = `D:/Workspaces/Astesia/.astesia/audit/wave2a.2/p3-realistic.json`;
runBenchmarkSuite("Realistic Dataset", realisticDir, 5, 1995, realisticOut);

// 2. Stress: 2,000 files (100 .env, 1,900 other)
const stressDir = `D:/Workspaces/Astesia/.astesia/audit/wave2a.2/synth-stress-${Date.now()}`;
const stressOut = `D:/Workspaces/Astesia/.astesia/audit/wave2a.2/p3-stress.json`;
runBenchmarkSuite("Stress Dataset", stressDir, 100, 1900, stressOut);
