import { execFileSync } from "node:child_process";
import { writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

export function wilsonUpper95(k: number, n: number): number {
  if (n <= 0) return 0;
  if (k >= n) return 1.0;
  const z = 1.959963984540054;
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = p + z2 / (2 * n);
  const spread = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n);
  const rawUpper = (center + spread) / denom;
  return Math.min(1, Math.max(0, rawUpper));
}

const SET_MEMBERS = {
  design: ["eunectes", "ifrit", "flora-smk"],
  seen: ["arene", "SIA", "pustaka-sekolah-pwa", "terminal-portfolio", "cadetspeak", "eduNEXA", "prototype-ami"],
  fresh: ["aipkani", "ecommerce-hp-api", "cadetspeak_admin"]
};

const ALL_PROJECTS = [
  ...SET_MEMBERS.design,
  ...SET_MEMBERS.seen,
  ...SET_MEMBERS.fresh
];

const RULES = [
  "ASTESIA-000",
  "ASTESIA-001",
  "ASTESIA-002",
  "ASTESIA-003",
  "ASTESIA-004",
  "ASTESIA-005",
  "ASTESIA-006",
  "ASTESIA-007",
  "ASTESIA-008",
  "ASTESIA-009",
  "ASTESIA-010"
];

interface AggregateStats {
  total_findings: number;
  errors: number;
  warnings: number;
  files_scanned: number;
  generated_skipped: number;
  wilson_ci_95_upper: number;
}

interface SetComparisonBlock {
  aggregate: AggregateStats;
  by_rule: Record<string, AggregateStats>;
  by_project: Record<string, {
    total_findings: number;
    errors: number;
    warnings: number;
    files_scanned: number;
    generated_skipped: number;
    wilson_ci_95_upper: number;
    findings_by_rule: Record<string, number>;
  }>;
}

export interface ComparisonSchema {
  version: "1.0.0";
  timestamp: string;
  gate_start_commit: string;
  gate_head_commit: string;
  before: {
    design: SetComparisonBlock;
    seen: SetComparisonBlock;
    fresh: SetComparisonBlock;
    all: SetComparisonBlock;
  };
  after: {
    design: SetComparisonBlock;
    seen: SetComparisonBlock;
    fresh: SetComparisonBlock;
    all: SetComparisonBlock;
  };
  delta: {
    total_findings: { before: number; after: number; diff: number };
    errors: { before: number; after: number; diff: number };
    warnings: { before: number; after: number; diff: number };
    files_scanned: { before: number; after: number; diff: number };
    generated_skipped: { before: number; after: number; diff: number };
    wilson_ci_95_upper: { before: number; after: number; diff: number };
  };
  invariants_satisfied: boolean;
}

function runGateOnProject(projectDir: string, gateScript: string, rulesPath: string): any {
  try {
    const raw = execFileSync("bun", [gateScript, "--root", projectDir, "--rules", rulesPath, "--json"], {
      encoding: "utf8",
      maxBuffer: 50 * 1024 * 1024
    });
    return JSON.parse(raw);
  } catch (err: any) {
    if (err.stdout) {
      try { return JSON.parse(err.stdout); } catch {}
    }
    throw new Error(`Failed to scan project ${projectDir}: ${err.message}`);
  }
}

function buildSetBlock(
  projectNames: string[],
  projectDataMap: Record<string, { violations: any[]; files_scanned: number; generated_skipped: number }>
): SetComparisonBlock {
  let totalFindings = 0;
  let totalErrors = 0;
  let totalWarnings = 0;
  let totalFilesScanned = 0;
  let totalGeneratedSkipped = 0;

  const byRule: Record<string, { errors: number; warnings: number }> = {};
  for (const r of RULES) {
    byRule[r] = { errors: 0, warnings: 0 };
  }

  const byProject: SetComparisonBlock["by_project"] = {};

  for (const name of projectNames) {
    const pData = projectDataMap[name];
    if (!pData) continue;
    totalFilesScanned += pData.files_scanned;
    totalGeneratedSkipped += pData.generated_skipped;

    let pErrors = 0;
    let pWarns = 0;
    const pByRule: Record<string, number> = {};
    for (const r of RULES) pByRule[r] = 0;

    for (const v of pData.violations) {
      totalFindings++;
      if (v.severity === "error") {
        totalErrors++;
        pErrors++;
      } else {
        totalWarnings++;
        pWarns++;
      }
      if (byRule[v.ruleId]) {
        if (v.severity === "error") byRule[v.ruleId].errors++;
        else byRule[v.ruleId].warnings++;
      }
      pByRule[v.ruleId] = (pByRule[v.ruleId] || 0) + 1;
    }

    byProject[name] = {
      total_findings: pErrors + pWarns,
      errors: pErrors,
      warnings: pWarns,
      files_scanned: pData.files_scanned,
      generated_skipped: pData.generated_skipped,
      wilson_ci_95_upper: wilsonUpper95(pErrors, pData.files_scanned),
      findings_by_rule: pByRule
    };
  }

  const byRuleAgg: Record<string, AggregateStats> = {};
  for (const r of RULES) {
    const errs = byRule[r]?.errors || 0;
    const warns = byRule[r]?.warnings || 0;
    byRuleAgg[r] = {
      total_findings: errs + warns,
      errors: errs,
      warnings: warns,
      files_scanned: totalFilesScanned,
      generated_skipped: totalGeneratedSkipped,
      wilson_ci_95_upper: wilsonUpper95(errs, totalFilesScanned)
    };
  }

  return {
    aggregate: {
      total_findings: totalFindings,
      errors: totalErrors,
      warnings: totalWarnings,
      files_scanned: totalFilesScanned,
      generated_skipped: totalGeneratedSkipped,
      wilson_ci_95_upper: wilsonUpper95(totalErrors, totalFilesScanned)
    },
    by_rule: byRuleAgg,
    by_project: byProject
  };
}

export function generatePhase3Comparison(): ComparisonSchema {
  const headGate = resolve(__dirname, "../../../../templates/enforcement/astesia-gate.ts");
  const startGate = join(tmpdir(), "astesia-gate-start.ts");
  const rulesPath = resolve(__dirname, "../../../../templates/enforcement/anti-patterns.json");
  const copyDir = join(tmpdir(), "astesia-2a7-copies");

  // 1. Gather BEFORE data (using startGate)
  console.log("Scanning 13 projects with START gate (bc3c077)...");
  const beforeProjectMap: Record<string, { violations: any[]; files_scanned: number; generated_skipped: number }> = {};
  for (const name of ALL_PROJECTS) {
    const targetDir = join(copyDir, name);
    const parsed = runGateOnProject(targetDir, startGate, rulesPath);
    beforeProjectMap[name] = {
      violations: parsed.violations || [],
      files_scanned: parsed.files_scanned?.total || 0,
      generated_skipped: parsed.generated_skipped || 0
    };
  }

  // 2. Gather AFTER data (using headGate)
  console.log("Scanning 13 projects with HEAD gate...");
  const afterProjectMap: Record<string, { violations: any[]; files_scanned: number; generated_skipped: number }> = {};
  for (const name of ALL_PROJECTS) {
    const targetDir = join(copyDir, name);
    const parsed = runGateOnProject(targetDir, headGate, rulesPath);
    afterProjectMap[name] = {
      violations: parsed.violations || [],
      files_scanned: parsed.files_scanned?.total || 0,
      generated_skipped: parsed.generated_skipped || 0
    };
  }

  const beforeDesign = buildSetBlock(SET_MEMBERS.design, beforeProjectMap);
  const beforeSeen = buildSetBlock(SET_MEMBERS.seen, beforeProjectMap);
  const beforeFresh = buildSetBlock(SET_MEMBERS.fresh, beforeProjectMap);
  const beforeAll = buildSetBlock(ALL_PROJECTS, beforeProjectMap);

  const afterDesign = buildSetBlock(SET_MEMBERS.design, afterProjectMap);
  const afterSeen = buildSetBlock(SET_MEMBERS.seen, afterProjectMap);
  const afterFresh = buildSetBlock(SET_MEMBERS.fresh, afterProjectMap);
  const afterAll = buildSetBlock(ALL_PROJECTS, afterProjectMap);

  // Validate invariants
  let invariantsOk = true;
  for (const blk of [beforeDesign, beforeSeen, beforeFresh, beforeAll, afterDesign, afterSeen, afterFresh, afterAll]) {
    if (blk.aggregate.total_findings !== blk.aggregate.errors + blk.aggregate.warnings) invariantsOk = false;
    for (const r of RULES) {
      const rb = blk.by_rule[r];
      if (rb.total_findings !== rb.errors + rb.warnings) invariantsOk = false;
    }
  }

  const comparison: ComparisonSchema = {
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    gate_start_commit: "bc3c0772a4f327505cfa973ebbe45ac52a1e04de",
    gate_head_commit: "ac1b1b2",
    before: {
      design: beforeDesign,
      seen: beforeSeen,
      fresh: beforeFresh,
      all: beforeAll
    },
    after: {
      design: afterDesign,
      seen: afterSeen,
      fresh: afterFresh,
      all: afterAll
    },
    delta: {
      total_findings: {
        before: beforeAll.aggregate.total_findings,
        after: afterAll.aggregate.total_findings,
        diff: afterAll.aggregate.total_findings - beforeAll.aggregate.total_findings
      },
      errors: {
        before: beforeAll.aggregate.errors,
        after: afterAll.aggregate.errors,
        diff: afterAll.aggregate.errors - beforeAll.aggregate.errors
      },
      warnings: {
        before: beforeAll.aggregate.warnings,
        after: afterAll.aggregate.warnings,
        diff: afterAll.aggregate.warnings - beforeAll.aggregate.warnings
      },
      files_scanned: {
        before: beforeAll.aggregate.files_scanned,
        after: afterAll.aggregate.files_scanned,
        diff: afterAll.aggregate.files_scanned - beforeAll.aggregate.files_scanned
      },
      generated_skipped: {
        before: beforeAll.aggregate.generated_skipped,
        after: afterAll.aggregate.generated_skipped,
        diff: afterAll.aggregate.generated_skipped - beforeAll.aggregate.generated_skipped
      },
      wilson_ci_95_upper: {
        before: beforeAll.aggregate.wilson_ci_95_upper,
        after: afterAll.aggregate.wilson_ci_95_upper,
        diff: afterAll.aggregate.wilson_ci_95_upper - beforeAll.aggregate.wilson_ci_95_upper
      }
    },
    invariants_satisfied: invariantsOk
  };

  const outPath = resolve(__dirname, "../phase3-comparison.json");
  writeFileSync(outPath, JSON.stringify(comparison, null, 2), "utf8");
  return comparison;
}

if (import.meta.main) {
  console.log("Generating phase3-comparison.json...");
  const res = generatePhase3Comparison();
  console.log(`Phase 3 Comparison generated successfully!`);
  console.log(`Invariants satisfied: ${res.invariants_satisfied}`);
  console.log(`Total findings: before=${res.delta.total_findings.before}, after=${res.delta.total_findings.after} (diff=${res.delta.total_findings.diff})`);
  console.log(`Files scanned: ${res.after.all.aggregate.files_scanned}`);
  console.log(`Wilson 95% upper: before=${res.delta.wilson_ci_95_upper.before.toFixed(4)}, after=${res.delta.wilson_ci_95_upper.after.toFixed(4)}`);
}
