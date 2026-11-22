import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

export function runFpReductionSuite(
  customGatePath?: string,
  customTmpDir?: string
): { total: number; passed: number; failed: number; known_gaps: number; errors: string[] } {
  const gatePath = customGatePath || resolve(__dirname, "../astesia-gate.ts");
  const rulesPath = resolve(__dirname, "../anti-patterns.json");
  const baseTmp = customTmpDir || resolve(__dirname, "../../../.astesia/audit/tmp/fp-" + Date.now());
  mkdirSync(baseTmp, { recursive: true });

  let passed = 0;
  let failed = 0;
  const errors: string[] = [];

  function record(id: string, name: string, ok: boolean, detail: string) {
    if (ok) {
      passed++;
    } else {
      failed++;
      errors.push(`FAIL: ${id} (${name}) - ${detail}`);
    }
  }

  function runGate(dir: string, extraArgs: string[] = []) {
    const res = spawnSync(process.execPath, [gatePath, "--root", dir, "--rules", rulesPath, "--json", ...extraArgs], {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024
    });
    let parsed: any = null;
    try {
      parsed = JSON.parse(res.stdout || "{}");
    } catch {
      //
    }
    return { status: res.status, stdout: res.stdout, stderr: res.stderr, parsed };
  }

  function makeFixture(subName: string, files: Record<string, string>): string {
    const d = join(baseTmp, subName);
    mkdirSync(d, { recursive: true });
    for (const [rel, content] of Object.entries(files)) {
      const full = join(d, rel);
      mkdirSync(resolve(full, ".."), { recursive: true });
      writeFileSync(full, content, "utf8");
    }
    return d;
  }

  // Case 1: Positive test - OFFLINE_AUTH_KEY with actual hex secret triggers ASTESIA-004
  {
    const d = makeFixture("c1-pos-hex", {
      "auth.ts": `const OFFLINE_AUTH_KEY = '4a8f9b2c3d1e0f7a6b5c4d3e2f1a0b9c';\n`
    });
    const r = runGate(d);
    const v = (r.parsed?.violations || []).filter((x: any) => x.ruleId === "ASTESIA-004");
    record("FP-DESIGN-01-POS-01", "hex secret in OFFLINE_AUTH_KEY triggers", v.length >= 1, `count=${v.length}`);
  }

  // Case 2: Positive test - USER_PASSWORD with versioned string still triggers ASTESIA-004
  {
    const d = makeFixture("c2-pos-password", {
      "auth.ts": `const USER_PASSWORD = 'flora_smk_auth_user_v1';\n`
    });
    const r = runGate(d);
    const v = (r.parsed?.violations || []).filter((x: any) => x.ruleId === "ASTESIA-004");
    record("FP-DESIGN-01-POS-02", "password key with versioned string triggers", v.length >= 1, `count=${v.length}`);
  }

  // Case 3: Negative test - OFFLINE_AUTH_KEY with versioned storage key identifier does NOT trigger
  {
    const d = makeFixture("c3-neg-offline-auth", {
      "src/lib/repositories/auth.repository.ts": `const OFFLINE_AUTH_KEY = 'flora_smk_auth_user_v1';\n`
    });
    const r = runGate(d);
    const v = (r.parsed?.violations || []).filter((x: any) => x.ruleId === "ASTESIA-004");
    record("FP-DESIGN-01-NEG-01", "flora-smk OFFLINE_AUTH_KEY exempt", v.length === 0, `count=${v.length}`);
  }

  // Case 4: Negative test - LOCAL_AUTH_KEY with versioned session identifier does NOT trigger
  {
    const d = makeFixture("c4-neg-local-auth", {
      "src/auth.ts": `const LOCAL_AUTH_KEY = 'flora_smk_user_session_v2';\n`
    });
    const r = runGate(d);
    const v = (r.parsed?.violations || []).filter((x: any) => x.ruleId === "ASTESIA-004");
    record("FP-DESIGN-01-NEG-02", "LOCAL_AUTH_KEY with versioned session exempt", v.length === 0, `count=${v.length}`);
  }

  // Clean up
  try {
    rmSync(baseTmp, { recursive: true, force: true });
  } catch {
    //
  }

  return {
    total: passed + failed,
    passed,
    failed,
    known_gaps: 0,
    errors
  };
}

if (import.meta.main) {
  const res = runFpReductionSuite();
  console.log(`runFpReductionSuite: total=${res.total}, passed=${res.passed}, failed=${res.failed}`);
  if (res.errors.length) {
    console.error(res.errors.join("\n"));
    process.exit(1);
  }
}
