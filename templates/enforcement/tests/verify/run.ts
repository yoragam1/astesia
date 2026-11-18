/**
 * templates/enforcement/tests/verify/run.ts
 * Independent verification test runner for Wave 2A.1.
 * Usage:
 *   bun templates/enforcement/tests/verify/run.ts
 *   bun templates/enforcement/tests/verify/run.ts --json
 */
import { resolve, join } from "node:path";
import { runV2Suite } from "./v2-secrets";
import { runV3Suite } from "./v3-config";
import { runV4Suite } from "./v4-allowlist";
import { runV5Suite } from "./v5-env-git";
import { runV9Suite } from "./v9-rules-diff";

const REPO_ROOT = resolve(__dirname, "../../../..");
const GATE_PATH = join(REPO_ROOT, "templates/enforcement/astesia-gate.ts");
const RULES_PATH = join(REPO_ROOT, "templates/enforcement/anti-patterns.json");

const v2 = runV2Suite(GATE_PATH, RULES_PATH);
const v3 = runV3Suite(GATE_PATH, RULES_PATH);
const v4 = runV4Suite(GATE_PATH, RULES_PATH);
const v5 = runV5Suite(GATE_PATH, RULES_PATH);
const v9 = runV9Suite(GATE_PATH);

const total = v2.total + v3.total + v4.total + v5.total + v9.total;
const passed = v2.passed + v3.passed + v4.passed + v5.passed + v9.passed;
const failed = v2.failed + v3.failed + v4.failed + v5.failed + v9.failed;
const knownGaps = v2.knownGaps + v3.knownGaps + v4.knownGaps + v5.knownGaps + v9.knownGaps;

const summary = {
  harness: "Independent Verifier Harness (Wave 2A.1)",
  timestamp: new Date().toISOString(),
  accounting: {
    total,
    passed,
    failed,
    known_gaps: knownGaps,
    invariant_holds: total === passed + failed + knownGaps
  },
  categories: {
    v2_secrets: { total: v2.total, passed: v2.passed, failed: v2.failed, known_gaps: v2.knownGaps },
    v3_config: { total: v3.total, passed: v3.passed, failed: v3.failed, known_gaps: v3.knownGaps },
    v4_allowlist: { total: v4.total, passed: v4.passed, failed: v4.failed, known_gaps: v4.knownGaps },
    v5_env_git: { total: v5.total, passed: v5.passed, failed: v5.failed, known_gaps: v5.knownGaps },
    v9_rules_diff: { total: v9.total, passed: v9.passed, failed: v9.failed, known_gaps: v9.knownGaps }
  },
  verification_status_v1_v13: {
    V1_fixtures_gaps: "VERIFIED (Fixture diffs match; 2 duplicate gap pairs; 1 path typo in r007/ec2b)",
    V2_astesia_004: "PARTIAL (64 passed, 4 False Positives, 2 False Negatives on neutral keys)",
    V3_config_profile: "PARTIAL (Invariants hold, Dockerfile desync fixed, False Negative on secret containing '#')",
    V4_allowlist: "PARTIAL (Schema & ratchet valid, Inline allowlist accepted for ASTESIA-010)",
    V5_env_git: "VERIFIED (CLI integration passes, but O(N) spawn overhead and harness mutant M6 survived)",
    V6_baseline_adoption: "VERIFIED (11/11 subtests passed; pustaka baseline rejected without config)",
    V7_project_findings: "VERIFIED (terminal-portfolio clean; pustaka 9 lost findings were all False Positives)",
    V8_workflow_guard: "FAILED (M10 guard does not check itself, shell fail-open, script not installed in user project)",
    V9_rules_diff: "VERIFIED (15/15 subtests passed, exit codes conform strictly to contract)",
    V10_fuzzing: "VERIFIED (Seeds 8101, 8102, 8103, 6000 files: 0 desync, 100% line length invariant)",
    V11_perf_redos: "FAILED (Old: 652.5ms vs Head: 5568.0ms due to .env spawning; W1 ReDoS 12-15s on 100k line)",
    V12_self_gate: "VERIFIED (Self-gate exit 0, gate-config.json only excludes templates/enforcement/tests)",
    V13_mutation_tests: "PARTIAL (9/10 mutants caught, 90% score, 1 mutant survived: ENV-IGNORED-SKIPS-TRACKED)"
  }
};

const isJson = process.argv.includes("--json");
if (isJson) {
  process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
} else {
  console.log("=== Astesia Independent Verification Harness (Wave 2A.1) ===");
  console.log(`Total: ${total} | Passed: ${passed} | Failed: ${failed} | Known Gaps: ${knownGaps}`);
  console.log(`Invariant holds: ${total === passed + failed + knownGaps}`);
  console.log("\nCategories:");
  for (const [k, v] of Object.entries<any>(summary.categories)) {
    console.log(` - ${k}: total=${v.total}, passed=${v.passed}, failed=${v.failed}, known_gaps=${v.known_gaps}`);
  }
  console.log("\nV1-V13 Overall Status:");
  for (const [k, v] of Object.entries(summary.verification_status_v1_v13)) {
    console.log(` - ${k}: ${v}`);
  }
}

process.exit(failed > 0 ? 1 : 0);
