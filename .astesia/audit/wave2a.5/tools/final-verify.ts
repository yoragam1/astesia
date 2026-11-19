import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "../../../..");
const GATE_PATH = join(REPO_ROOT, "templates/enforcement/astesia-gate.ts");
const RULES_PATH = join(REPO_ROOT, "templates/enforcement/anti-patterns.json");
const WAVE_DIR = resolve(__dirname, "..");

function sha256File(p: string): string {
  const buf = readFileSync(p);
  return createHash("sha256").update(buf).digest("hex");
}

// 1. Gate line count check (<= 2,800 lines)
const gateRaw = readFileSync(GATE_PATH, "utf8");
const gateLineCount = gateRaw.replace(/\r\n/g, "\n").split("\n").length;
console.log(`[1/5] Gate line count: ${gateLineCount} (limit <= 2800)`);
if (gateLineCount > 2800) {
  console.error(`FAIL: Gate line count ${gateLineCount} exceeds 2800!`);
  process.exit(1);
}

// 2. Protected files SHA-256 verification against Step 0 baseline
const baselineHashes = JSON.parse(
  readFileSync(join(WAVE_DIR, "protected-files-baseline-sha256.json"), "utf8")
) as Record<string, string>;

const afterHashes: Record<string, { before: string; after: string; match: boolean }> = {};
let allProtectedMatch = true;
for (const [relP, expHash] of Object.entries(baselineHashes)) {
  const actHash = sha256File(join(REPO_ROOT, relP));
  const match = actHash === expHash;
  afterHashes[relP] = { before: expHash, after: actHash, match };
  if (!match) {
    console.error(`FAIL: Protected file modified: ${relP} (expected ${expHash}, got ${actHash})`);
    allProtectedMatch = false;
  }
}
writeFileSync(join(WAVE_DIR, "protected-files-after-sha256.json"), JSON.stringify(afterHashes, null, 2) + "\n", "utf8");
console.log(`[2/5] Protected files SHA-256 check: ${Object.keys(baselineHashes).length}/17 matched (${allProtectedMatch ? "PASS" : "FAIL"})`);
if (!allProtectedMatch) process.exit(1);

// 3. Self-Gate check
const selfGateRes = spawnSync(
  process.execPath,
  [GATE_PATH, "--root", REPO_ROOT, "--rules", RULES_PATH, "--max-warn", "0", "--json"],
  { cwd: REPO_ROOT, encoding: "utf8" }
);
const selfGateJson = JSON.parse(selfGateRes.stdout || "{}");
console.log(
  `[3/5] Self-Gate: exit=${selfGateRes.status}, errors=${selfGateJson.errors}, warnings=${selfGateJson.warnings}, scanned=${selfGateJson.files_scanned?.total}, excluded=${selfGateJson.files_excluded}, gen_skipped=${selfGateJson.generated_skipped}`
);
if (selfGateRes.status !== 0) {
  console.error("FAIL: Self-gate failed!", selfGateRes.stdout, selfGateRes.stderr);
  process.exit(1);
}

// 4. --rules-diff check against a9e20cd
const baseRulesTmp = join(WAVE_DIR, "snapshots/anti-patterns-a9e20cd.json");
const gitShowRules = spawnSync("git", ["-C", REPO_ROOT, "show", "a9e20cd:templates/enforcement/anti-patterns.json"], {
  encoding: "utf8"
});
writeFileSync(baseRulesTmp, gitShowRules.stdout, "utf8");
const rulesDiffRes = spawnSync(process.execPath, [GATE_PATH, "--rules-diff", baseRulesTmp, RULES_PATH], {
  cwd: REPO_ROOT,
  encoding: "utf8"
});
rmSync(baseRulesTmp, { force: true });
console.log(`[4/5] --rules-diff vs a9e20cd: exit=${rulesDiffRes.status} (${rulesDiffRes.stdout.trim()})`);
if (rulesDiffRes.status !== 0) {
  console.error("FAIL: --rules-diff failed!", rulesDiffRes.stderr);
  process.exit(1);
}

// 5. Isolated Clean Clone verification in %TEMP%
const cleanDir = `C:/Users/alta1r/AppData/Local/Temp/astesia-clean-final-${Date.now()}`;
const emptyHome = `C:/Users/alta1r/AppData/Local/Temp/astesia-empty-home-final`;
mkdirSync(cleanDir, { recursive: true });
mkdirSync(emptyHome, { recursive: true });

console.log(`[5/5] Creating isolated clean clone at ${cleanDir} and running FULL all.ts --json...`);
try {
  cpSync(join(REPO_ROOT, ".git"), join(cleanDir, ".git"), { recursive: true });
  const isolatedEnv = {
    ...process.env,
    HOME: emptyHome,
    USERPROFILE: emptyHome,
    XDG_CONFIG_HOME: emptyHome,
    GIT_CONFIG_GLOBAL: "NUL",
    GIT_CONFIG_SYSTEM: "NUL"
  };

  const coRes = spawnSync("git", ["-C", cleanDir, "checkout", "-f", "HEAD"], {
    encoding: "utf8",
    env: isolatedEnv
  });
  if (coRes.status !== 0) {
    throw new Error(`git checkout failed in clean clone: ${coRes.stderr}`);
  }

  const allRes = spawnSync(process.execPath, [join(cleanDir, "templates/enforcement/tests/all.ts"), "--json"], {
    cwd: cleanDir,
    encoding: "utf8",
    env: isolatedEnv,
    maxBuffer: 50 * 1024 * 1024
  });

  const allJson = JSON.parse(allRes.stdout);
  writeFileSync(join(WAVE_DIR, "harness-after.json"), JSON.stringify(allJson, null, 2) + "\n", "utf8");
  writeFileSync(
    join(WAVE_DIR, "final-verification-summary.json"),
    JSON.stringify(
      {
        gate_line_count: gateLineCount,
        protected_files_verified: allProtectedMatch,
        self_gate: {
          exit_code: selfGateRes.status,
          output: selfGateJson
        },
        rules_diff: {
          exit_code: rulesDiffRes.status,
          stdout: rulesDiffRes.stdout.trim()
        },
        clean_clone: {
          clone_dir: cleanDir,
          empty_home: emptyHome,
          exit_code: allRes.status,
          accounting: allJson.accounting,
          mutation_testing: allJson.runners?.mutation_testing
        }
      },
      null,
      2
    ) + "\n",
    "utf8"
  );

  console.log(
    `Clean clone all.ts: exit=${allRes.status}, total=${allJson.accounting?.total}, passed=${allJson.accounting?.passed}, failed=${allJson.accounting?.failed}, known_gaps=${allJson.accounting?.known_gaps}, mutants=${allJson.runners?.mutation_testing?.killed}/${allJson.runners?.mutation_testing?.total}`
  );
  if (allRes.status !== 0) {
    console.error("FAIL: Clean clone all.ts exited with non-zero status!");
    process.exit(1);
  }
} finally {
  try { rmSync(cleanDir, { recursive: true, force: true }); } catch {}
  try { rmSync(emptyHome, { recursive: true, force: true }); } catch {}
}
