import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { selectProjectSample } from "./classify";

const REPO_ROOT = resolve(__dirname, "../../../..");
const HEAD_GATE = join(REPO_ROOT, "templates/enforcement/astesia-gate.ts");
const RULES_PATH = join(REPO_ROOT, "templates/enforcement/anti-patterns.json");
const SNAP_DIR = resolve(__dirname, "../snapshots");
const GOLDEN_DIR = resolve(__dirname, "../golden");
const REAL_COPY_ROOT = "C:/Users/alta1r/AppData/Local/Temp/astesia-real";

mkdirSync(GOLDEN_DIR, { recursive: true });

const PROJECTS = [
  "pustaka-sekolah-pwa",
  "terminal-portfolio",
  "eunectes",
  "flora-smk",
  "ifrit",
  "arene",
  "SIA"
];

function sha256(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

function runHeadGate(projDir: string) {
  const res = spawnSync(process.execPath, [HEAD_GATE, "--root", projDir, "--rules", RULES_PATH, "--json"], {
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024
  });
  const parsed = JSON.parse(res.stdout);
  // Sort violations deterministically by file, line, ruleId
  if (Array.isArray(parsed.violations)) {
    parsed.violations.sort((a: any, b: any) =>
      a.file.localeCompare(b.file) || a.line - b.line || a.ruleId.localeCompare(b.ruleId)
    );
  }
  if (Array.isArray(parsed.desync_files)) {
    parsed.desync_files.sort();
  }
  if (Array.isArray(parsed.generated_files)) {
    parsed.generated_files.sort();
  }
  const normalized = JSON.stringify(parsed, null, 2) + "\n";
  return { status: res.status, parsed, normalized, hash: sha256(normalized) };
}

interface FindingTuple {
  key: string;
  ruleId: string;
  severity: string;
  file: string;
  line: number;
  message: string;
  quote: string;
}

function extractTupleMap(projDir: string, parsed: any): Map<string, FindingTuple> {
  const map = new Map<string, FindingTuple>();
  for (const v of parsed.violations || []) {
    const k = `${v.ruleId}|${v.file}|${v.line}`;
    let quote = "";
    try {
      const raw = readFileSync(join(projDir, v.file), "utf8").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      const lines = raw.split("\n");
      quote = (lines[v.line - 1] || "").trim().slice(0, 120);
    } catch {}
    map.set(k, {
      key: k,
      ruleId: v.ruleId,
      severity: v.severity,
      file: v.file,
      line: v.line,
      message: v.message,
      quote
    });
  }
  return map;
}

const comparisonSummary: Record<string, any> = {};
const toClassifyByProject: Record<string, Array<{ ruleId: string; severity: string; file: string; line: number; quote: string; contextLines: string[] }>> = {};

for (let idx = 0; idx < PROJECTS.length; idx++) {
  const proj = PROJECTS[idx];
  const projDir = join(REAL_COPY_ROOT, proj);
  console.log(`Scanning ${proj} (run 1 & run 2)...`);
  const run1 = runHeadGate(projDir);
  const run2 = runHeadGate(projDir);
  if (run1.hash !== run2.hash) {
    throw new Error(`Determinism check failed on ${proj}: ${run1.hash} !== ${run2.hash}`);
  }

  // Save snapshot and golden
  writeFileSync(join(SNAP_DIR, `d1-${proj}-HEAD.json`), run1.normalized, "utf8");
  writeFileSync(join(GOLDEN_DIR, `${proj}.json`), run1.normalized, "utf8");

  const snap56 = JSON.parse(readFileSync(join(SNAP_DIR, `d1-${proj}-56dd907.json`), "utf8"));
  const snapA9 = JSON.parse(readFileSync(join(SNAP_DIR, `d1-${proj}-a9e20cd.json`), "utf8"));
  const snapHead = run1.parsed;

  const map56 = extractTupleMap(projDir, snap56);
  const mapA9 = extractTupleMap(projDir, snapA9);
  const mapHead = extractTupleMap(projDir, snapHead);

  const lostVsA9: FindingTuple[] = [];
  const newVsA9: FindingTuple[] = [];
  for (const [k, v] of mapA9.entries()) {
    if (!mapHead.has(k)) lostVsA9.push(v);
  }
  for (const [k, v] of mapHead.entries()) {
    if (!mapA9.has(k)) newVsA9.push(v);
  }

  const lostVs56: FindingTuple[] = [];
  const newVs56: FindingTuple[] = [];
  for (const [k, v] of map56.entries()) {
    if (!mapHead.has(k)) lostVs56.push(v);
  }
  for (const [k, v] of mapHead.entries()) {
    if (!map56.has(k)) newVs56.push(v);
  }

  const totalA9 = (snapA9.errors || 0) + (snapA9.warnings || 0);
  const totalHead = (snapHead.errors || 0) + (snapHead.warnings || 0);
  const deltaTotalVsA9 = totalHead - totalA9;
  // Wait: if same (ruleId, file, line) appears once per violation, let's check if any file+line has duplicate ruleId
  const uniqueDeltaVsA9 = newVsA9.length - lostVsA9.length;

  comparisonSummary[proj] = {
    determinism_sha256: run1.hash,
    determinism_verified: run1.hash === run2.hash,
    metrics: {
      "56dd907": {
        files_scanned: snap56.files_scanned?.total ?? 0,
        generated_skipped: snap56.generated_skipped ?? 0,
        desync_files: (snap56.desync_files || []).length,
        errors: snap56.errors ?? 0,
        warnings: snap56.warnings ?? 0,
        total_violations: (snap56.violations || []).length
      },
      a9e20cd: {
        files_scanned: snapA9.files_scanned?.total ?? 0,
        generated_skipped: snapA9.generated_skipped ?? 0,
        desync_files: (snapA9.desync_files || []).length,
        errors: snapA9.errors ?? 0,
        warnings: snapA9.warnings ?? 0,
        total_violations: (snapA9.violations || []).length
      },
      HEAD: {
        files_scanned: snapHead.files_scanned?.total ?? 0,
        generated_skipped: snapHead.generated_skipped ?? 0,
        generated_files: snapHead.generated_files || [],
        desync_files: (snapHead.desync_files || []).length,
        desync_file_list: snapHead.desync_files || [],
        errors: snapHead.errors ?? 0,
        warnings: snapHead.warnings ?? 0,
        total_violations: (snapHead.violations || []).length
      }
    },
    diff_vs_a9e20cd: {
      delta_errors: (snapHead.errors ?? 0) - (snapA9.errors ?? 0),
      delta_warnings: (snapHead.warnings ?? 0) - (snapA9.warnings ?? 0),
      delta_total: deltaTotalVsA9,
      new_count: newVsA9.length,
      lost_count: lostVsA9.length,
      arithmetic_holds: deltaTotalVsA9 === uniqueDeltaVsA9,
      lost_findings: lostVsA9,
      new_findings: newVsA9
    },
    diff_vs_56dd907: {
      delta_errors: (snapHead.errors ?? 0) - (snap56.errors ?? 0),
      delta_warnings: (snapHead.warnings ?? 0) - (snap56.warnings ?? 0),
      delta_total: totalHead - ((snap56.errors || 0) + (snap56.warnings || 0)),
      new_count: newVs56.length,
      lost_count: lostVs56.length,
      lost_findings: lostVs56,
      new_findings: newVs56
    }
  };

  // Select findings on HEAD for classification using selectProjectSample
  const sampleInfo = selectProjectSample(snapHead.violations || [], idx, 40);
  const selected = sampleInfo.selected;
  toClassifyByProject[proj] = selected.map((v) => {
    let quote = "";
    let contextLines: string[] = [];
    try {
      const raw = readFileSync(join(projDir, v.file), "utf8").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      const lines = raw.split("\n");
      quote = (lines[v.line - 1] || "").trim().slice(0, 120);
      const startL = Math.max(0, v.line - 3);
      const endL = Math.min(lines.length, v.line + 2);
      contextLines = lines.slice(startL, endL).map((l, k) => `L${startL + k + 1}: ${l.slice(0, 140)}`);
    } catch {}
    return {
      ruleId: v.ruleId,
      severity: v.severity,
      file: v.file,
      line: v.line,
      quote: quote || `[${v.ruleId} at ${v.file}:${v.line}]`,
      contextLines
    };
  });
}

writeFileSync(join(SNAP_DIR, "phase3-comparison-summary.json"), JSON.stringify(comparisonSummary, null, 2) + "\n", "utf8");
writeFileSync(join(SNAP_DIR, "phase3-selected-findings-to-classify.json"), JSON.stringify(toClassifyByProject, null, 2) + "\n", "utf8");

console.log("Phase 3 scan & diff completed. Summary:");
for (const proj of PROJECTS) {
  const m = comparisonSummary[proj].metrics;
  const d = comparisonSummary[proj].diff_vs_a9e20cd;
  console.log(
    `  - ${proj}: 56dd907=${m["56dd907"].total_violations} (desync=${m["56dd907"].desync_files}) -> a9e20cd=${m.a9e20cd.total_violations} (desync=${m.a9e20cd.desync_files}) -> HEAD=${m.HEAD.total_violations} (desync=${m.HEAD.desync_files}, gen_skipped=${m.HEAD.generated_skipped}) | new=${d.new_count}, lost=${d.lost_count}, arith=${d.arithmetic_holds}`
  );
}
