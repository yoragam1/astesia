/**
 * templates/enforcement/tests/verify2/run.ts
 * Independent Verification Harness for Wave 2A.2 Astesia Framework v3.0.0.
 *
 * Verifies:
 * - Key sensitivity, auth headers, and neutral keys (D2)
 * - Config profile, quote tracking, and comment handling (D5)
 * - Allowlist schema and baseline ratchet rules (D6)
 * - Workflow guard static analysis and mutations (D7)
 * - Known gaps documentation and accounting invariants
 *
 * Usage:
 *   bun templates/enforcement/tests/verify2/run.ts
 *   bun templates/enforcement/tests/verify2/run.ts --json
 */
import { resolve, join } from "path";
import { runKeyAuthSuite } from "./key-auth-suite";
import { runWorkflowGuardSuite } from "./workflow-guard-suite";
import { runAllowlistRatchetSuite } from "./allowlist-ratchet-suite";
import { runConfigCommentsSuite } from "./config-comments-suite";

const REPO_ROOT = resolve(__dirname, "../../../..");
const GATE_PATH = join(REPO_ROOT, "templates/enforcement/astesia-gate.ts");
const RULES_PATH = join(REPO_ROOT, "templates/enforcement/anti-patterns.json");
const CANONICAL_WF = join(REPO_ROOT, "templates/enforcement/astesia-gate.workflow.yml");

const isJsonMode = process.argv.includes("--json");

if (!isJsonMode) {
  console.log("=== RUNNING WAVE 2A.2 INDEPENDENT VERIFIER HARNESS ===");
}

const keyAuthRes = runKeyAuthSuite(GATE_PATH, RULES_PATH);
const wfGuardRes = runWorkflowGuardSuite(GATE_PATH, CANONICAL_WF);
const allowlistRes = runAllowlistRatchetSuite(GATE_PATH, RULES_PATH);
const configRes = runConfigCommentsSuite(GATE_PATH, RULES_PATH);

const total = keyAuthRes.total + wfGuardRes.total + allowlistRes.total + configRes.total;
const passed = keyAuthRes.passed + wfGuardRes.passed + allowlistRes.passed + configRes.passed;
const failed = keyAuthRes.failed + wfGuardRes.failed + allowlistRes.failed + configRes.failed;
const knownGaps = keyAuthRes.known_gaps + wfGuardRes.known_gaps + allowlistRes.known_gaps + configRes.known_gaps;

const invariantHolds = total === (passed + failed + knownGaps);

const summary = {
  harness: "wave2a.2/verify2",
  timestamp: new Date().toISOString(),
  accounting: {
    total,
    passed,
    failed,
    known_gaps: knownGaps,
    invariant_holds: invariantHolds
  },
  suites: {
    key_auth_suite: keyAuthRes,
    workflow_guard_suite: wfGuardRes,
    allowlist_ratchet_suite: allowlistRes,
    config_comments_suite: configRes
  }
};

if (isJsonMode) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  console.log("\n--- VERIFY2 HARNESS SUMMARY ---");
  console.log(`Key & Auth Suite:      ${keyAuthRes.passed}/${keyAuthRes.total} passed (${keyAuthRes.known_gaps} known gaps, ${keyAuthRes.failed} failed)`);
  console.log(`Workflow Guard Suite:  ${wfGuardRes.passed}/${wfGuardRes.total} passed (${wfGuardRes.known_gaps} known gaps, ${wfGuardRes.failed} failed)`);
  console.log(`Allowlist & Ratchet:   ${allowlistRes.passed}/${allowlistRes.total} passed (${allowlistRes.known_gaps} known gaps, ${allowlistRes.failed} failed)`);
  console.log(`Config & Quotes Suite: ${configRes.passed}/${configRes.total} passed (${configRes.known_gaps} known gaps, ${configRes.failed} failed)`);
  console.log("-----------------------------------------");
  console.log(`TOTAL:                 ${passed}/${total} passed (${knownGaps} known gaps, ${failed} failed)`);
  console.log(`Accounting Invariant:  ${total} === ${passed} + ${failed} + ${knownGaps} (${invariantHolds ? "HOLDS" : "BROKEN"})`);
}

process.exit(invariantHolds && failed === 0 ? 0 : 1);
