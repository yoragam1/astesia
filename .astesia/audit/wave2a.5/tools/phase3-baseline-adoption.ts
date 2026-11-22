import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "../../../..");
const HEAD_GATE = join(REPO_ROOT, "templates/enforcement/astesia-gate.ts");
const RULES_PATH = join(REPO_ROOT, "templates/enforcement/anti-patterns.json");
const SNAP_DIR = resolve(__dirname, "../snapshots");
const REAL_COPY_ROOT = "C:/Users/alta1r/AppData/Local/Temp/astesia-real";

function runGate(projDir: string, extraArgs: string[]) {
  const res = spawnSync(process.execPath, [HEAD_GATE, "--root", projDir, "--rules", RULES_PATH, ...extraArgs], {
    encoding: "utf8",
    maxBuffer: 30 * 1024 * 1024
  });
  let json: any = null;
  try {
    json = JSON.parse(res.stdout);
  } catch {}
  return { status: res.status, stdout: res.stdout, stderr: res.stderr, json };
}

function testAdoption(
  projName: string,
  excludeEntries: Array<{ path: string; reason: string }>,
  allowEntries: Array<{ rule: "ASTESIA-004" | "ASTESIA-010"; path: string; match: string; reason: string }>
) {
  const projDir = join(REAL_COPY_ROOT, projName);
  const astesiaDir = join(projDir, ".astesia");
  const cfgPath = join(astesiaDir, "gate-config.json");
  const basePath = join(astesiaDir, "gate-baseline.json");
  const injectedCodeFile = join(projDir, "__astesia_injected_violation__.ts");
  const injectedBundleFile = join(projDir, "__astesia_injected_bundle__.js");

  try {
    mkdirSync(astesiaDir, { recursive: true });
    const configObj = {
      schema: 1,
      exclude: excludeEntries,
      allow: allowEntries
    };
    writeFileSync(cfgPath, JSON.stringify(configObj, null, 2) + "\n", "utf8");

    // 1. Scan with config before baseline
    const preScan = runGate(projDir, ["--json"]);

    // 2. --update-baseline -> exit 0
    const initRes = runGate(projDir, ["--update-baseline"]);

    // 3. --baseline .astesia/gate-baseline.json -> exit 0
    const checkClean = runGate(projDir, ["--baseline", ".astesia/gate-baseline.json", "--json"]);

    // 4. Inject 1 code violation -> exit 1
    writeFileSync(injectedCodeFile, "export const injectedViolation: any = 42;\n", "utf8");
    const checkCodeViol = runGate(projDir, ["--baseline", ".astesia/gate-baseline.json", "--json"]);
    rmSync(injectedCodeFile, { force: true });

    // 5. Inject 1 generated bundle file (>= 5000 chars line) -> exit 1 via generated_skipped counter
    writeFileSync(injectedBundleFile, "// " + "x".repeat(5005) + "\n", "utf8");
    const checkBundleViol = runGate(projDir, ["--baseline", ".astesia/gate-baseline.json", "--json"]);
    rmSync(injectedBundleFile, { force: true });

    // 6. Re-verify clean state passes --baseline -> exit 0
    const checkRestored = runGate(projDir, ["--baseline", ".astesia/gate-baseline.json", "--json"]);

    const baselineSaved = JSON.parse(readFileSync(basePath, "utf8"));

    return {
      project: projName,
      config_applied: configObj,
      pre_baseline_scan: {
        files_scanned: preScan.json?.files_scanned?.total,
        files_excluded: preScan.json?.files_excluded,
        generated_skipped: preScan.json?.generated_skipped,
        allowlisted: preScan.json?.allowlisted,
        errors: preScan.json?.errors,
        warnings: preScan.json?.warnings
      },
      step1_update_baseline_exit: initRes.status,
      step2_check_clean_exit: checkClean.status,
      step3_inject_code_violation_exit: checkCodeViol.status,
      step3_new_violations_count: checkCodeViol.json?.baseline?.new_violations?.length ?? 0,
      step4_inject_bundle_5000_exit: checkBundleViol.status,
      step4_counter_regressions: checkBundleViol.json?.baseline?.counter_regressions ?? [],
      step5_restored_clean_exit: checkRestored.status,
      baseline_counters: baselineSaved.counters,
      all_passed:
        initRes.status === 0 &&
        checkClean.status === 0 &&
        checkCodeViol.status === 1 &&
        checkBundleViol.status === 1 &&
        (checkBundleViol.json?.baseline?.counter_regressions || []).some((r: string) => r.includes("generated_skipped")) &&
        checkRestored.status === 0
    };
  } finally {
    try { rmSync(injectedCodeFile, { force: true }); } catch {}
    try { rmSync(injectedBundleFile, { force: true }); } catch {}
    try { rmSync(astesiaDir, { recursive: true, force: true }); } catch {}
  }
}

const pustakaResult = testAdoption(
  "pustaka-sekolah-pwa",
  [
    {
      path: "dev-dist",
      reason: "Exclude Vite/Workbox PWA development build artifacts from source scanning"
    }
  ],
  [
    {
      rule: "ASTESIA-010",
      path: "docker-compose.yml",
      match: "JWT_SECRET=${JWT_SECRET:-rahasia-pustaka-sekolah-production-key-2026}",
      reason: "Legacy local docker-compose fallback secret tracked for migration to env-only"
    }
  ]
);

const floraResult = testAdoption(
  "flora-smk",
  [
    {
      path: ".vercel/output",
      reason: "Exclude Vercel deployment build output directory and bundled chunks"
    }
  ],
  [
    {
      rule: "ASTESIA-004",
      path: "src/lib/repositories/auth.repository.ts",
      match: "OFFLINE_AUTH_KEY",
      reason: "Local storage key identifier for offline authentication cache, not a secret"
    }
  ]
);

const out = {
  "pustaka-sekolah-pwa": pustakaResult,
  "flora-smk": floraResult
};

writeFileSync(join(SNAP_DIR, "phase3-baseline-adoption.json"), JSON.stringify(out, null, 2) + "\n", "utf8");
console.log("Baseline Adoption Tests:");
console.log(`  - pustaka-sekolah-pwa: all_passed=${pustakaResult.all_passed} (init=${pustakaResult.step1_update_baseline_exit}, clean=${pustakaResult.step2_check_clean_exit}, codeViol=${pustakaResult.step3_inject_code_violation_exit}, bundleViol=${pustakaResult.step4_inject_bundle_5000_exit})`);
console.log(`  - flora-smk:           all_passed=${floraResult.all_passed} (init=${floraResult.step1_update_baseline_exit}, clean=${floraResult.step2_check_clean_exit}, codeViol=${floraResult.step3_inject_code_violation_exit}, bundleViol=${floraResult.step4_inject_bundle_5000_exit})`);
process.exit(pustakaResult.all_passed && floraResult.all_passed ? 0 : 1);
