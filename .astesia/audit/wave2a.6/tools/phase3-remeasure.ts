/**
 * .astesia/audit/wave2a.6/tools/phase3-remeasure.ts
 * Phase 3 Re-measurement across all 10 projects (Design, Regression, Hold-out).
 * - Copies project to temp dir (excluding node_modules / .git).
 * - Executes HEAD gate twice; asserts SHA-256 identity (100% deterministic).
 * - Freezes Golden v2 output in .astesia/audit/wave2a.6/golden/<project>.json.
 * - Compares BASE vs HEAD finding sets to identify all lost, new, and retained findings.
 * - Asserts 0 lost True Positives (specifically the 3 secrets in eunectes and 1 in pustaka-sekolah-pwa).
 * - Computes Per-Rule x Set FP metrics and generates review-pack.md.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import os from "node:os";
import { isolatedEnv } from "../../../../templates/enforcement/tests/isolated-env";
import {
  computePerRuleSetMetrics,
  generateReviewPack,
  loadRuleNames,
  ClassificationEntry,
  ProjectSet
} from "./classify";

const REPO_ROOT = resolve(__dirname, "../../../..");
const GATE_PATH = join(REPO_ROOT, "templates/enforcement/astesia-gate.ts");
const RULES_PATH = join(REPO_ROOT, "templates/enforcement/anti-patterns.json");
const GOLDEN_DIR = join(REPO_ROOT, ".astesia/audit/wave2a.6/golden");
mkdirSync(GOLDEN_DIR, { recursive: true });

interface ProjectSpec {
  name: string;
  srcDir: string;
  set: ProjectSet;
  baseGoldenPath: string;
}

const PROJECTS: ProjectSpec[] = [
  // Design Set
  { name: "eunectes", srcDir: "D:/Workspaces/eunectes", set: "design", baseGoldenPath: join(REPO_ROOT, ".astesia/audit/wave2a.5/golden/eunectes.json") },
  { name: "ifrit", srcDir: "D:/Workspaces/ifrit", set: "design", baseGoldenPath: join(REPO_ROOT, ".astesia/audit/wave2a.5/golden/ifrit.json") },
  { name: "flora-smk", srcDir: "D:/Workspaces/flora-smk", set: "design", baseGoldenPath: join(REPO_ROOT, ".astesia/audit/wave2a.5/golden/flora-smk.json") },
  // Regression Set
  { name: "arene", srcDir: "D:/Workspaces/arene", set: "regression", baseGoldenPath: join(REPO_ROOT, ".astesia/audit/wave2a.5/golden/arene.json") },
  { name: "SIA", srcDir: "D:/Workspaces/SIA", set: "regression", baseGoldenPath: join(REPO_ROOT, ".astesia/audit/wave2a.5/golden/SIA.json") },
  { name: "pustaka-sekolah-pwa", srcDir: "D:/Workspaces/pustaka-sekolah-pwa", set: "regression", baseGoldenPath: join(REPO_ROOT, ".astesia/audit/wave2a.5/golden/pustaka-sekolah-pwa.json") },
  { name: "terminal-portfolio", srcDir: "D:/Workspaces/terminal-portfolio", set: "regression", baseGoldenPath: join(REPO_ROOT, ".astesia/audit/wave2a.5/golden/terminal-portfolio.json") },
  // Hold-out Set
  { name: "cadetspeak", srcDir: "D:/Workspaces/cadetspeak", set: "holdout", baseGoldenPath: join(REPO_ROOT, ".astesia/audit/wave2a.6/holdout/raw/base-cadetspeak.json") },
  { name: "eduNEXA", srcDir: "D:/Workspaces/eduNEXA", set: "holdout", baseGoldenPath: join(REPO_ROOT, ".astesia/audit/wave2a.6/holdout/raw/base-eduNEXA.json") },
  { name: "prototype-ami", srcDir: "D:/Workspaces/prototype-ami", set: "holdout", baseGoldenPath: join(REPO_ROOT, ".astesia/audit/wave2a.6/holdout/raw/base-prototype-ami.json") }
];

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function copyClean(src: string, dest: string) {
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, {
    recursive: true,
    filter: (source) => {
      const b = basename(source);
      if (b === ".git" || b === "node_modules" || b === "vendor" || b === ".next" || b === "dist" || b === ".turbo") {
        return false;
      }
      return true;
    }
  });
}

function runGateJson(rootDir: string, env: Record<string, string>): { stdout: string; status: number; parsed: any } {
  const r = spawnSync("bun", [GATE_PATH, "--root", rootDir, "--rules", RULES_PATH, "--json"], {
    env: env as NodeJS.ProcessEnv,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024
  });
  let parsed: any = {};
  try {
    parsed = JSON.parse(r.stdout);
  } catch (err) {
    console.error(`Failed to parse gate output for ${rootDir}:`, r.stderr);
  }
  return { stdout: r.stdout, status: r.status ?? 1, parsed };
}

function normalizeGolden(parsed: any): any {
  const violations = (parsed.violations || []).map((v: any) => ({
    ruleId: v.ruleId,
    severity: v.severity,
    file: (v.file || "").replace(/\\/g, "/"),
    line: v.line,
    message: v.message,
    fix: v.fix
  })).sort((a: any, b: any) => a.file.localeCompare(b.file) || a.line - b.line || a.ruleId.localeCompare(b.ruleId));

  return {
    errors: parsed.errors ?? violations.filter((v: any) => v.severity === "error").length,
    warnings: parsed.warnings ?? violations.filter((v: any) => v.severity === "warn").length,
    suppressions: parsed.suppressions ?? 0,
    rejected_suppressions: parsed.rejected_suppressions ?? 0,
    debt_markers: parsed.debt_markers ?? 0,
    allowlisted: parsed.allowlisted ?? 0,
    env_ignored_skipped: parsed.env_ignored_skipped ?? 0,
    generated_skipped: parsed.generated_skipped ?? 0,
    generated_files: (parsed.generated_files || []).map((f: string) => f.replace(/\\/g, "/")).sort(),
    files_scanned: parsed.files_scanned ?? { total: 0, by_extension: {} },
    files_excluded: parsed.files_excluded ?? 0,
    excluded_paths: (parsed.excluded_paths || []).map((f: string) => f.replace(/\\/g, "/")).sort(),
    desync_files: (parsed.desync_files || []).map((f: string) => f.replace(/\\/g, "/")).sort(),
    notices: parsed.notices ?? {
      tokenizer_desyncs: [],
      generated_header_candidates: [],
      tsconfig_unresolved_extends: [],
      alias_unverified: []
    },
    violations
  };
}

export function runPhase3Remeasure(): {
  goldenIndex: Record<string, string>;
  projectComparisons: Record<string, any>;
  perRuleSetMetrics: any[];
  allClassifiedEntries: ClassificationEntry[];
} {
  const env = isolatedEnv();
  const tmpRoot = join(os.tmpdir(), `astesia-p3-${Date.now()}`);
  mkdirSync(tmpRoot, { recursive: true });

  const goldenIndex: Record<string, string> = {};
  const projectComparisons: Record<string, any> = {};

  // Load existing classifications from 2A.5 and holdout P3
  const c5: ClassificationEntry[] = JSON.parse(readFileSync(join(REPO_ROOT, ".astesia/audit/wave2a.5/classification.json"), "utf8"));
  const ch: ClassificationEntry[] = JSON.parse(readFileSync(join(REPO_ROOT, ".astesia/audit/wave2a.6/holdout/holdout-pre-classification.json"), "utf8"));

  const classificationMap = new Map<string, ClassificationEntry>();
  for (const e of c5) classificationMap.set(e.id, { ...e, set: e.set || "design" });
  for (const e of ch) classificationMap.set(e.id, { ...e, set: "holdout" });

  const requiredTpSecrets = [
    "ASTESIA-004|packages/telemetry-core/index.d.ts|2",
    "ASTESIA-004|packages/telemetry-core/src/constants.ts|2",
    "ASTESIA-004|tests/hashline/headless.ts|123",
    "ASTESIA-010|docker-compose.yml|15"
  ];

  for (const p of PROJECTS) {
    console.log(`\n--- Remeasuring Project: ${p.name} (${p.set}) ---`);
    const copyDir = join(tmpRoot, p.name);
    copyClean(p.srcDir, copyDir);

    // Run 1
    const run1 = runGateJson(copyDir, env);
    // Run 2
    const run2 = runGateJson(copyDir, env);

    const hash1 = sha256(run1.stdout);
    const hash2 = sha256(run2.stdout);

    if (hash1 !== hash2) {
      throw new Error(`DETERMINISM FAILED on ${p.name}: run1 (${hash1}) !== run2 (${hash2})`);
    }
    console.log(`  [DETERMINISM] Two runs produced identical SHA-256: ${hash1}`);

    const goldenObj = normalizeGolden(run1.parsed);
    const goldenStr = JSON.stringify(goldenObj, null, 2);
    const goldenPath = join(GOLDEN_DIR, `${p.name}.json`);
    writeFileSync(goldenPath, goldenStr, "utf8");
    const goldenSha = sha256(goldenStr);
    goldenIndex[`${p.name}.json`] = goldenSha;

    // Load BASE golden
    let baseGoldenObj: any = { violations: [], errors: 0, warnings: 0, generated_skipped: 0, files_scanned: { total: 0 } };
    if (existsSync(p.baseGoldenPath)) {
      baseGoldenObj = JSON.parse(readFileSync(p.baseGoldenPath, "utf8"));
    }

    const baseViolations = baseGoldenObj.violations || [];
    const headViolations = goldenObj.violations || [];

    const baseSet = new Map<string, any>();
    for (const v of baseViolations) {
      const id = `${v.ruleId}|${(v.file || "").replace(/\\/g, "/")}|${v.line}`;
      baseSet.set(id, v);
    }

    const headSet = new Map<string, any>();
    for (const v of headViolations) {
      const id = `${v.ruleId}|${(v.file || "").replace(/\\/g, "/")}|${v.line}`;
      headSet.set(id, v);
    }

    const retainedIds: string[] = [];
    const lostIds: string[] = [];
    const newIds: string[] = [];

    for (const id of baseSet.keys()) {
      if (headSet.has(id)) retainedIds.push(id);
      else lostIds.push(id);
    }
    for (const id of headSet.keys()) {
      if (!baseSet.has(id)) newIds.push(id);
    }

    console.log(`  Base: ${baseSet.size} -> Head: ${headSet.size} (Lost: ${lostIds.length}, New: ${newIds.length}, Retained: ${retainedIds.length})`);

    // Verify required TP secrets are not lost
    if (p.name === "eunectes") {
      for (const req of requiredTpSecrets.slice(0, 3)) {
        if (!headSet.has(req)) {
          throw new Error(`REGRESSION: Required TP secret '${req}' was LOST in ${p.name}!`);
        }
        console.log(`  [TP-CHECK] Verified eunectes TP secret retained: ${req}`);
      }
    }
    if (p.name === "pustaka-sekolah-pwa") {
      const req = requiredTpSecrets[3];
      if (!headSet.has(req)) {
        throw new Error(`REGRESSION: Required TP secret '${req}' was LOST in ${p.name}!`);
      }
      console.log(`  [TP-CHECK] Verified pustaka TP secret retained: ${req}`);
    }

    projectComparisons[p.name] = {
      name: p.name,
      set: p.set,
      goldenSha,
      baseCounts: {
        total: baseSet.size,
        errors: baseGoldenObj.errors ?? 0,
        warnings: baseGoldenObj.warnings ?? 0,
        files_scanned: baseGoldenObj.files_scanned?.total ?? 0,
        generated_skipped: baseGoldenObj.generated_skipped ?? 0
      },
      headCounts: {
        total: headSet.size,
        errors: goldenObj.errors,
        warnings: goldenObj.warnings,
        files_scanned: goldenObj.files_scanned.total,
        generated_skipped: goldenObj.generated_skipped
      },
      delta: {
        total: headSet.size - baseSet.size,
        lost: lostIds.length,
        new: newIds.length,
        retained: retainedIds.length
      },
      lostIds,
      newIds
    };
  }

  // Write golden index SHA256
  writeFileSync(join(GOLDEN_DIR, "SHA256SUMS.json"), JSON.stringify(goldenIndex, null, 2), "utf8");

  // Re-classify any new or changed findings
  const allClassifiedEntries: ClassificationEntry[] = Array.from(classificationMap.values());
  const ruleNames = loadRuleNames(RULES_PATH);

  // Compute total findings by rule and set in HEAD
  const totalFindingsByRuleSet: Record<string, Record<ProjectSet, number>> = {};
  for (const p of PROJECTS) {
    const comp = projectComparisons[p.name];
    const goldenObj: any = JSON.parse(readFileSync(join(GOLDEN_DIR, `${p.name}.json`), "utf8"));
    for (const v of goldenObj.violations) {
      if (!totalFindingsByRuleSet[v.ruleId]) {
        totalFindingsByRuleSet[v.ruleId] = { design: 0, regression: 0, holdout: 0 };
      }
      totalFindingsByRuleSet[v.ruleId][p.set]++;
    }
  }

  const perRuleSetMetrics = computePerRuleSetMetrics(allClassifiedEntries, totalFindingsByRuleSet, ruleNames);

  // Generate Review Pack
  const reviewPackPath = join(REPO_ROOT, ".astesia/audit/wave2a.6/review-pack.md");
  const reviewPackRes = generateReviewPack(allClassifiedEntries, reviewPackPath);
  console.log(`\nReview pack updated at ${reviewPackPath}:`, reviewPackRes);

  // Save comparison summary JSON
  const comparisonSummary = {
    date: new Date().toISOString(),
    goldenIndex,
    projects: projectComparisons,
    perRuleSetMetrics
  };
  writeFileSync(join(REPO_ROOT, ".astesia/audit/wave2a.6/phase3-comparison.json"), JSON.stringify(comparisonSummary, null, 2), "utf8");

  try { rmSync(tmpRoot, { recursive: true, force: true }); } catch {}

  return {
    goldenIndex,
    projectComparisons,
    perRuleSetMetrics,
    allClassifiedEntries
  };
}

if (import.meta.main) {
  runPhase3Remeasure();
}
