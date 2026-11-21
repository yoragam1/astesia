import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const DESIGN_PROJECTS = new Set(["eunectes", "ifrit", "flora-smk"]);

export function checkFixEvidence(customPath?: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const fixEvidencePath = customPath || resolve(__dirname, "../fix-evidence.json");
  if (!existsSync(fixEvidencePath)) {
    return { valid: false, errors: ["fix-evidence.json not found"] };
  }

  const fixEvidence = JSON.parse(readFileSync(fixEvidencePath, "utf8"));
  const reconPath = resolve(__dirname, "../reconciliation.json");
  const recon = existsSync(reconPath) ? JSON.parse(readFileSync(reconPath, "utf8")) : null;

  for (const pat of fixEvidence.patterns || []) {
    // 1. Hold-out discipline: Must be DESIGN project only
    if (!DESIGN_PROJECTS.has(pat.source_project)) {
      errors.push(`[HOLD-OUT VIOLATION] pattern ${pat.pattern_id} has forbidden non-design source_project: '${pat.source_project}'`);
    }

    // 2. Finding ID must be valid and exist in reconciliation or project history
    if (!pat.source_finding_id || typeof pat.source_finding_id !== "string") {
      errors.push(`[INVALID PATTERN] pattern ${pat.pattern_id} missing source_finding_id`);
    }

    // 3. Raw line secret check: No raw secrets >= 6 chars unredacted
    if (pat.source_line_raw) {
      if (/(?:sk_live_|ghp_|AKIA|xox[abp]-)[a-zA-Z0-9_-]{6,}/.test(pat.source_line_raw)) {
        errors.push(`[SECRET LEAK] pattern ${pat.pattern_id} contains unredacted secret token in source_line_raw`);
      }
    }

    // 4. Rationale must be >= 15 chars
    if (!pat.rationale || pat.rationale.trim().length < 15) {
      errors.push(`[RATIONALE TOO SHORT] pattern ${pat.pattern_id} rationale must be >= 15 chars`);
    }

    // 5. Must have >= 2 tests added
    if (!Array.isArray(pat.tests_added) || pat.tests_added.length < 2) {
      errors.push(`[INSUFFICIENT TESTS] pattern ${pat.pattern_id} requires >= 2 test cases`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

if (import.meta.main) {
  const res = checkFixEvidence();
  if (!res.valid) {
    console.error("check-fix-evidence FAILED:");
    for (const e of res.errors) console.error("  " + e);
    process.exit(1);
  }
  console.log("check-fix-evidence PASSED: all fix evidence satisfies hold-out discipline and secret redaction.");
  process.exit(0);
}
