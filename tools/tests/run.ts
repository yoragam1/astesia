/**
 * tools/tests/run.ts
 * Unified test runner for all tools/ test suites.
 * Executes lint-rules-suite.ts and lint-selftest.ts,
 * validates the strict invariant: total === passed + failed + known_gaps,
 * and exits with code 0 only if all tests pass and the invariant holds.
 */

import { runLintRulesSuite } from "./lint-rules-suite";
import { runLintSelftest } from "./lint-selftest";
import { runRetentionSuite } from "./retention-suite";
import { runInstallerPs1Suite } from "./installer-ps1.test";
import { runInitSuite } from "./init-suite";
import { runGateContractSuite } from "./gate-contract-suite";
import { runReportLintSuite } from "./report-lint-suite";

async function main() {
  console.log("=================================================");
  console.log("    ASTESIA FRAMEWORK TOOLS TEST RUNNER (T8)    ");
  console.log("=================================================");

  const startTime = Date.now();

  // Suite 1: Rule-by-rule positive and negative tests (FL-001..FL-020)
  const rulesSuite = runLintRulesSuite();

  // Suite 2: Mutation testing & negative controls on isolated repository clones
  const mutationSuite = runLintSelftest();

  // Suite 3: Normative retention & heading integrity tests
  const retentionSuite = runRetentionSuite();

  // Suite 4: PowerShell 5.1 & Bash Plugin Installer Suite
  const installerSuite = runInstallerPs1Suite();

  // Suite 5: Brownfield Gate Initializer Suite (astesia-init.ts)
  const initSuite = runInitSuite();

  // Suite 6: Gate Reference Contract & Mutation Suite (tools/gen-gate-reference.ts)
  const gateContractSuite = runGateContractSuite();

  // Suite 7: Mechanical Report Linter Suite (tools/report-lint.ts)
  const reportLintSuite = runReportLintSuite();

  const total = rulesSuite.total + mutationSuite.total + retentionSuite.total + installerSuite.total + initSuite.total + gateContractSuite.total + reportLintSuite.total;
  const passed = rulesSuite.passed + mutationSuite.passed + retentionSuite.passed + installerSuite.passed + initSuite.passed + gateContractSuite.passed + reportLintSuite.passed;
  const failed = rulesSuite.failed + mutationSuite.failed + retentionSuite.failed + installerSuite.failed + initSuite.failed + gateContractSuite.failed + reportLintSuite.failed;
  const known_gaps = rulesSuite.known_gaps + mutationSuite.known_gaps + retentionSuite.known_gaps + installerSuite.known_gaps + initSuite.known_gaps + gateContractSuite.known_gaps + reportLintSuite.known_gaps;

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log("\n=================================================");
  console.log("               TEST RUNNER SUMMARY               ");
  console.log("=================================================");
  console.log(`Suite 1 (Rules Suite):         ${rulesSuite.passed}/${rulesSuite.total} passed (${rulesSuite.failed} failed, ${rulesSuite.known_gaps} gaps)`);
  console.log(`Suite 2 (Mutation Suite):      ${mutationSuite.passed}/${mutationSuite.total} passed (${mutationSuite.failed} failed, ${mutationSuite.known_gaps} gaps)`);
  console.log(`Suite 3 (Retention Suite):     ${retentionSuite.passed}/${retentionSuite.total} passed (${retentionSuite.failed} failed, ${retentionSuite.known_gaps} gaps)`);
  console.log(`Suite 4 (Installer Suite):     ${installerSuite.passed}/${installerSuite.total} passed (${installerSuite.failed} failed, ${installerSuite.known_gaps} gaps)`);
  console.log(`Suite 5 (Init Suite):          ${initSuite.passed}/${initSuite.total} passed (${initSuite.failed} failed, ${initSuite.known_gaps} gaps)`);
  console.log(`Suite 6 (Gate Contract Suite): ${gateContractSuite.passed}/${gateContractSuite.total} passed (${gateContractSuite.failed} failed, ${gateContractSuite.known_gaps} gaps)`);
  console.log(`Suite 7 (Report Lint Suite):   ${reportLintSuite.passed}/${reportLintSuite.total} passed (${reportLintSuite.failed} failed, ${reportLintSuite.known_gaps} gaps)`);
  console.log("-------------------------------------------------");
  console.log(`TOTAL TESTS:               ${total}`);
  console.log(`PASSED:                    ${passed}`);
  console.log(`FAILED:                    ${failed}`);
  console.log(`KNOWN GAPS:                ${known_gaps}`);
  console.log(`DURATION:                  ${durationSec}s`);
  console.log("-------------------------------------------------");

  // Invariant verification: total === passed + failed + known_gaps
  const invariantHolds = total === passed + failed + known_gaps;
  console.log(`INVARIANT CHECK:           ${invariantHolds ? "HOLDS" : "BROKEN"}`);
  console.log(`  formula: total (${total}) === passed (${passed}) + failed (${failed}) + known_gaps (${known_gaps})`);

  if (!invariantHolds) {
    console.error("\n[FATAL] Invariant violated: total !== passed + failed + known_gaps");
    process.exit(1);
  }

  if (failed > 0) {
    console.error(`\n[FATAL] Test runner failed with ${failed} failing tests.`);
    process.exit(1);
  }

  console.log("\n>>> ALL TEST SUITES PASSED CLEANLY <<<");
  process.exit(0);
}

main().catch((err) => {
  console.error("\n[UNHANDLED_EXCEPTION]", err);
  process.exit(2);
});
