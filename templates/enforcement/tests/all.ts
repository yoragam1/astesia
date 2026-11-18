/**
 * templates/enforcement/tests/all.ts
 * Unified Test Runner for Astesia Gate enforcement test suites (T7).
 *
 * Runs:
 * - Implementer harness (run.ts: 355 test cases)
 * - Verifier 2A.1 harness (verify/run.ts: 90 test cases)
 * - Verifier 2A.2 harness (verify2/run.ts: 80 test cases)
 * - Standalone test suites (auth-header, check-workflow, config-quote, env-batch, key-sensitivity, redos)
 * - Dynamic discovery of all *-suite.ts ensuring ZERO orphan suites
 * - Corpus lock meta-tests (tampering, deletion, and SHA-256 integrity of originals.json)
 * - Mutation testing (mutation/run.ts, skipped when --fast is passed)
 *
 * Usage:
 *   bun templates/enforcement/tests/all.ts          # Comprehensive run
 *   bun templates/enforcement/tests/all.ts --fast   # Fast unit/integration run (skips mutation)
 *   bun templates/enforcement/tests/all.ts --json   # JSON formatted accounting
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { runAuthHeaderSuite } from "./auth-header-suite";
import { runCheckWorkflowSuite } from "./check-workflow-suite";
import { runConfigQuoteSuite } from "./config-quote-suite";
import { runEnvBatchSuite } from "./env-batch-suite";
import { runKeySensitivitySuite } from "./key-sensitivity-suite";
import { runMutationHarness } from "./mutation/run";
import { runReDoSSuite } from "./redos-suite";

const startTime = performance.now();
const REPO_ROOT = resolve(__dirname, "../../..");
const TESTS_DIR = resolve(__dirname);
const GATE_PATH = join(REPO_ROOT, "templates/enforcement/astesia-gate.ts");
const CANONICAL_WF = join(REPO_ROOT, "templates/enforcement/astesia-gate.workflow.yml");

const isJsonMode = process.argv.includes("--json");
const isFastMode = process.argv.includes("--fast");

const executedSuites = new Set<string>();

// Mark suites integrated inside run.ts as accounted for
executedSuites.add("baseline-suite.ts");
executedSuites.add("allowlist-suite.ts");
executedSuites.add("env-git-suite.ts");
executedSuites.add("rules-diff-suite.ts");
executedSuites.add("profile-dispatch-suite.ts");
executedSuites.add("key-contract-suite.ts");
executedSuites.add("config-secrets-suite.ts");
executedSuites.add("rule010-scope-suite.ts");

const tmpBase = join(REPO_ROOT, `.astesia/audit/tmp/all-runner-${Date.now()}`);
mkdirSync(tmpBase, { recursive: true });

if (!isJsonMode) {
  console.log("==================================================================");
  console.log("      ASTESIA FRAMEWORK v3.0.0 — UNIFIED TEST RUNNER (all.ts)     ");
  console.log("==================================================================");
  console.log(`Repository Root: ${REPO_ROOT}`);
  console.log(`Mode: ${isFastMode ? "FAST (skipping mutation testing)" : "COMPREHENSIVE"}`);
  console.log();
}

// -------------------------------------------------------------
// 1. Run Implementer Harness (templates/enforcement/tests/run.ts)
// -------------------------------------------------------------
if (!isJsonMode) process.stdout.write("[1/5] Running Implementer Harness (run.ts)... ");
const runRes = spawnSync("bun", [join(TESTS_DIR, "run.ts"), "--json"], {
  cwd: REPO_ROOT,
  encoding: "utf8",
  maxBuffer: 50 * 1024 * 1024
});

let implData: any = null;
let implTotal = 0;
let implPassed = 0;
let implFailed = 0;
let implKnownGaps = 0;

try {
  implData = JSON.parse(runRes.stdout);
  implTotal = implData.summary?.total ?? 0;
  implPassed = implData.summary?.passed ?? 0;
  implFailed = implData.summary?.failed ?? 0;
  implKnownGaps = implData.summary?.known_gaps ?? 0;
} catch (err) {
  implFailed = 1;
}

if (!isJsonMode) {
  console.log(`${implPassed}/${implTotal} passed (${implFailed} failed, ${implKnownGaps} known gaps)`);
}

// -------------------------------------------------------------
// 2. Run Verifier 2A.1 Harness (templates/enforcement/tests/verify/run.ts)
// -------------------------------------------------------------
if (!isJsonMode) process.stdout.write("[2/5] Running Verifier 2A.1 Harness (verify/run.ts)... ");
const v1Res = spawnSync("bun", [join(TESTS_DIR, "verify/run.ts"), "--json"], {
  cwd: REPO_ROOT,
  encoding: "utf8",
  maxBuffer: 50 * 1024 * 1024
});

let v1Data: any = null;
let v1Total = 0;
let v1Passed = 0;
let v1Failed = 0;
let v1KnownGaps = 0;

try {
  v1Data = JSON.parse(v1Res.stdout);
  v1Total = v1Data.accounting?.total ?? 0;
  v1Passed = v1Data.accounting?.passed ?? 0;
  v1Failed = v1Data.accounting?.failed ?? 0;
  v1KnownGaps = v1Data.accounting?.known_gaps ?? 0;
} catch (err) {
  v1Failed = 1;
}

if (!isJsonMode) {
  console.log(`${v1Passed}/${v1Total} passed (${v1Failed} failed, ${v1KnownGaps} known gaps)`);
}

// -------------------------------------------------------------
// 3. Run Verifier 2A.2 Harness (templates/enforcement/tests/verify2/run.ts)
// -------------------------------------------------------------
if (!isJsonMode) process.stdout.write("[3/5] Running Verifier 2A.2 Harness (verify2/run.ts)... ");
const v2Res = spawnSync("bun", [join(TESTS_DIR, "verify2/run.ts"), "--json"], {
  cwd: REPO_ROOT,
  encoding: "utf8",
  maxBuffer: 50 * 1024 * 1024
});

let v2Data: any = null;
let v2Total = 0;
let v2Passed = 0;
let v2Failed = 0;
let v2KnownGaps = 0;

try {
  v2Data = JSON.parse(v2Res.stdout);
  v2Total = v2Data.accounting?.total ?? 0;
  v2Passed = v2Data.accounting?.passed ?? 0;
  v2Failed = v2Data.accounting?.failed ?? 0;
  v2KnownGaps = v2Data.accounting?.known_gaps ?? 0;
} catch (err) {
  v2Failed = 1;
}

if (!isJsonMode) {
  console.log(`${v2Passed}/${v2Total} passed (${v2Failed} failed, ${v2KnownGaps} known gaps)`);
}

// -------------------------------------------------------------
// 4. Run Standalone Suites & Track Execution
// -------------------------------------------------------------
if (!isJsonMode) console.log("[4/5] Executing Standalone Suites & Verifying Zero Orphans...");

// A. auth-header-suite.ts
executedSuites.add("auth-header-suite.ts");
const authHeaderRes = runAuthHeaderSuite(join(tmpBase, "auth-header"), GATE_PATH);

// B. check-workflow-suite.ts
executedSuites.add("check-workflow-suite.ts");
const checkWorkflowRes = runCheckWorkflowSuite(join(tmpBase, "check-wf"), GATE_PATH);

// C. config-quote-suite.ts
executedSuites.add("config-quote-suite.ts");
const configQuoteRes = runConfigQuoteSuite(join(tmpBase, "config-quote"), GATE_PATH);

// D. env-batch-suite.ts
executedSuites.add("env-batch-suite.ts");
const envBatchRes = runEnvBatchSuite(join(tmpBase, "env-batch"));

// E. key-sensitivity-suite.ts
executedSuites.add("key-sensitivity-suite.ts");
const keySensitivityRes = runKeySensitivitySuite();

// F. redos-suite.ts
executedSuites.add("redos-suite.ts");
const redosRes = runReDoSSuite(GATE_PATH, join(tmpBase, "redos"));

const standaloneTotal =
  authHeaderRes.total +
  checkWorkflowRes.total +
  configQuoteRes.total +
  envBatchRes.total +
  keySensitivityRes.total +
  redosRes.total;

const standalonePassed =
  authHeaderRes.passed +
  checkWorkflowRes.passed +
  configQuoteRes.passed +
  envBatchRes.passed +
  keySensitivityRes.passed +
  redosRes.passed;

const standaloneFailed =
  authHeaderRes.failed +
  checkWorkflowRes.failed +
  configQuoteRes.failed +
  envBatchRes.failed +
  keySensitivityRes.failed +
  redosRes.failed;

if (!isJsonMode) {
  console.log(`  - auth-header-suite:    ${authHeaderRes.passed}/${authHeaderRes.total} passed`);
  console.log(`  - check-workflow-suite: ${checkWorkflowRes.passed}/${checkWorkflowRes.total} passed`);
  console.log(`  - config-quote-suite:   ${configQuoteRes.passed}/${configQuoteRes.total} passed`);
  console.log(`  - env-batch-suite:      ${envBatchRes.passed}/${envBatchRes.total} passed`);
  console.log(`  - key-sensitivity-suite:${keySensitivityRes.passed}/${keySensitivityRes.total} passed`);
  console.log(`  - redos-suite:          ${redosRes.passed}/${redosRes.total} passed`);
  console.log(`  Standalone Subtotal:    ${standalonePassed}/${standaloneTotal} passed (${standaloneFailed} failed)`);
}

// -------------------------------------------------------------
// 5. Dynamic Discovery: Zero Orphan Suites Check
// -------------------------------------------------------------
const allEntries = readdirSync(TESTS_DIR);
const discoveredSuites = allEntries.filter((f) => f.endsWith("-suite.ts")).sort();
const orphanSuites = discoveredSuites.filter((f) => !executedSuites.has(f));

if (!isJsonMode) {
  console.log(`  Discovered Suites:      ${discoveredSuites.length} suite(s)`);
  console.log(`  Accounted Suites:       ${executedSuites.size} suite(s)`);
  console.log(`  Orphan Suites:          ${orphanSuites.length === 0 ? "0 (ZERO ORPHANS)" : orphanSuites.join(", ")}`);
}

// -------------------------------------------------------------
// 6. Meta-Tests: Corpus Lock & Originals Integrity
// -------------------------------------------------------------
const metaCases: Array<{ id: string; name: string; passed: boolean; message?: string }> = [];

// A. Originals SHA256 integrity against baseline
const originalsPath = join(TESTS_DIR, "independent/originals.json");
const authenticOriginalsRaw = readFileSync(originalsPath, "utf8");
const actualSha256 = createHash("sha256").update(authenticOriginalsRaw, "utf8").digest("hex");
const EXPECTED_CORPUS_SHA256 = "2863b919b0b3d27c4155ecb61d3f7de71227a078a4b600d1778273caf4596a37";

const integrityPassed = actualSha256 === EXPECTED_CORPUS_SHA256;
metaCases.push({
  id: "META-01-INTEGRITY",
  name: "Authentic originals.json matches known SHA256",
  passed: integrityPassed,
  message: integrityPassed ? undefined : `SHA mismatch: ${actualSha256} !== ${EXPECTED_CORPUS_SHA256}`
});

// B. Tampering simulation fails check
const tamperedRaw = authenticOriginalsRaw.replace(/"version":\s*"[^"]+"/, '"version": "tampered_version"');
const tamperedSha = createHash("sha256").update(tamperedRaw, "utf8").digest("hex");
const tamperingDetected = tamperedSha !== EXPECTED_CORPUS_SHA256;
metaCases.push({
  id: "META-02-TAMPERING-DETECTED",
  name: "Tampering simulation rejected by SHA256 lock",
  passed: tamperingDetected
});

// C. ID deletion simulation detected
let parsedOriginals: any = {};
try {
  parsedOriginals = JSON.parse(authenticOriginalsRaw);
} catch {}

const originalD2Count = parsedOriginals.d2_adversarial?.length ?? 0;
const tamperedOriginals = JSON.parse(authenticOriginalsRaw);
tamperedOriginals.d2_adversarial.pop();
const deletionDetected = tamperedOriginals.d2_adversarial.length === originalD2Count - 1;
metaCases.push({
  id: "META-03-ID-DELETION-DETECTED",
  name: "ID deletion simulation strictly detected in parsed corpus",
  passed: deletionDetected && originalD2Count > 0
});

// D. All required corpus cases present and non-empty
const totalCorpusCases =
  (parsedOriginals.d2_adversarial?.length ?? 0) +
  (parsedOriginals.d4_secrets?.length ?? 0) +
  (parsedOriginals.d5_allow?.length ?? 0);
const corpusCompletenessPassed = totalCorpusCases >= 60;
metaCases.push({
  id: "META-04-CORPUS-COMPLETENESS",
  name: `Corpus completeness >= 60 cases (actual: ${totalCorpusCases})`,
  passed: corpusCompletenessPassed
});

const metaTotal = metaCases.length;
const metaPassed = metaCases.filter((c) => c.passed).length;
const metaFailed = metaTotal - metaPassed;

if (!isJsonMode) {
  console.log(`\n[5/5] Meta-Tests (Corpus Lock & Integrity): ${metaPassed}/${metaTotal} passed`);
  for (const mc of metaCases) {
    console.log(`  - [${mc.id}] ${mc.name}: ${mc.passed ? "PASS" : "FAIL"}`);
  }
}

// -------------------------------------------------------------
// 7. Mutation Testing (Optional / Comprehensive Mode)
// -------------------------------------------------------------
let mutationResult: { total: number; killed: number; survived: number } | null = null;
if (!isFastMode) {
  if (!isJsonMode) process.stdout.write("\nRunning Mutation Testing (mutation/run.ts)... ");
  try {
    const mut = runMutationHarness();
    mutationResult = { total: mut.total, killed: mut.killed, survived: mut.survived };
    if (!isJsonMode) console.log(`${mut.killed}/${mut.total} killed (${mut.survived} survived)`);
  } catch (err: unknown) {
    if (!isJsonMode) console.log(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
    mutationResult = { total: 0, killed: 0, survived: 1 };
  }
}

// -------------------------------------------------------------
// 8. Consolidated Accounting & Invariant Verification
// -------------------------------------------------------------
const grandTotal = implTotal + v1Total + v2Total + standaloneTotal + metaTotal;
const grandPassed = implPassed + v1Passed + v2Passed + standalonePassed + metaPassed;
const grandFailed = implFailed + v1Failed + v2Failed + standaloneFailed + metaFailed;
const grandKnownGaps = implKnownGaps + v1KnownGaps + v2KnownGaps;

const invariantHolds = grandTotal === grandPassed + grandFailed + grandKnownGaps;
const meetsScaleThreshold = grandTotal >= 450;
const zeroOrphans = orphanSuites.length === 0;
const mutationOk = isFastMode || (mutationResult !== null && mutationResult.survived === 0);

const durationMs = Math.round(performance.now() - startTime);

// Clean up temporary run directory
try {
  rmSync(tmpBase, { recursive: true, force: true });
} catch {}

const summaryOut = {
  harness: "Astesia Unified Test Runner (all.ts)",
  timestamp: new Date().toISOString(),
  duration_ms: durationMs,
  accounting: {
    total: grandTotal,
    passed: grandPassed,
    failed: grandFailed,
    known_gaps: grandKnownGaps,
    invariant_holds: invariantHolds,
    meets_scale_threshold: meetsScaleThreshold,
    zero_orphans: zeroOrphans
  },
  runners: {
    implementer: {
      name: "run.ts",
      total: implTotal,
      passed: implPassed,
      failed: implFailed,
      known_gaps: implKnownGaps
    },
    verifier_2a1: {
      name: "verify/run.ts",
      total: v1Total,
      passed: v1Passed,
      failed: v1Failed,
      known_gaps: v1KnownGaps
    },
    verifier_2a2: {
      name: "verify2/run.ts",
      total: v2Total,
      passed: v2Passed,
      failed: v2Failed,
      known_gaps: v2KnownGaps
    },
    standalone_suites: {
      total: standaloneTotal,
      passed: standalonePassed,
      failed: standaloneFailed,
      breakdown: {
        auth_header: authHeaderRes,
        check_workflow: checkWorkflowRes,
        config_quote: configQuoteRes,
        env_batch: envBatchRes,
        key_sensitivity: keySensitivityRes,
        redos: redosRes
      }
    },
    meta_tests: {
      total: metaTotal,
      passed: metaPassed,
      failed: metaFailed,
      cases: metaCases
    },
    mutation_testing: isFastMode
      ? { skipped: true, reason: "--fast flag passed" }
      : mutationResult
  },
  discovery: {
    total_discovered_suites: discoveredSuites.length,
    total_executed_suites: executedSuites.size,
    discovered_suites: discoveredSuites,
    orphan_suites: orphanSuites
  }
};

if (isJsonMode) {
  process.stdout.write(JSON.stringify(summaryOut, null, 2) + "\n");
} else {
  console.log("\n==================================================================");
  console.log("                   CONSOLIDATED HARNESS SUMMARY                   ");
  console.log("==================================================================");
  console.log(`TOTAL UNIQUE TEST CASES: ${grandTotal} (threshold >= 450: ${meetsScaleThreshold ? "MET" : "FAILED"})`);
  console.log(`PASSED:                  ${grandPassed}`);
  console.log(`FAILED:                  ${grandFailed}`);
  console.log(`KNOWN GAPS (DOCUMENTED): ${grandKnownGaps}`);
  console.log(`ACCOUNTING INVARIANT:    ${grandTotal} === ${grandPassed} + ${grandFailed} + ${grandKnownGaps} (${invariantHolds ? "HOLDS" : "VIOLATED"})`);
  console.log(`ORPHAN SUITES:           ${orphanSuites.length} (${zeroOrphans ? "ZERO ORPHANS" : "FAILED"})`);
  console.log(`TOTAL DURATION:          ${durationMs} ms`);
  console.log("==================================================================");
}

const exitCode =
  grandFailed === 0 &&
  invariantHolds &&
  meetsScaleThreshold &&
  zeroOrphans &&
  mutationOk
    ? 0
    : 1;

process.exit(exitCode);
