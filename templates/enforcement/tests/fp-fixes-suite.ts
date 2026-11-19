import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

export function runFpFixesSuite(
  customGatePath?: string,
  customTmpDir?: string
): { total: number; passed: number; failed: number; known_gaps: number; errors: string[] } {
  const gatePath = customGatePath || resolve(__dirname, "../astesia-gate.ts");
  const rulesPath = resolve(__dirname, "../anti-patterns.json");
  const baseTmp = customTmpDir || resolve(__dirname, "../../../.astesia/audit/tmp/fp-fixes-" + Date.now());
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
      maxBuffer: 50 * 1024 * 1024
    });
    let json: any = null;
    try {
      json = JSON.parse(res.stdout);
    } catch {}
    return { status: res.status, stdout: res.stdout, stderr: res.stderr, json };
  }

  try {
    // =============================================================
    // Group 1: fp_004_env_fallback (>=3 positive, >=3 negative)
    // =============================================================
    {
      // POSITIVE 1: HASHLINE_TEST_API_KEY fallback string must trigger ASTESIA-004
      const d = join(baseTmp, "fp04_pos1");
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "client.ts"), 'const key = process.env.HASHLINE_TEST_API_KEY ?? "quota_1234567890abcdef";\n', "utf8");
      const r = runGate(d);
      const viols = r.json?.violations || [];
      const ok = r.status === 1 && viols.some((v: any) => v.ruleId === "ASTESIA-004");
      record("FP-004-POS-1", "HASHLINE_TEST_API_KEY fallback detected", ok, JSON.stringify(viols));
    }

    {
      // POSITIVE 2: DATABASE_PASSWORD fallback string must trigger ASTESIA-004
      const d = join(baseTmp, "fp04_pos2");
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "db.ts"), 'const pw = process.env.DATABASE_PASSWORD || "super_secret_pw_123";\n', "utf8");
      const r = runGate(d);
      const viols = r.json?.violations || [];
      const ok = r.status === 1 && viols.some((v: any) => v.ruleId === "ASTESIA-004");
      record("FP-004-POS-2", "DATABASE_PASSWORD fallback detected", ok, JSON.stringify(viols));
    }

    {
      // POSITIVE 3: AUTH_TOKEN fallback string must trigger ASTESIA-004
      const d = join(baseTmp, "fp04_pos3");
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "auth.ts"), 'const token = process.env.AUTH_TOKEN || "jwt_token_secret_123456";\n', "utf8");
      const r = runGate(d);
      const viols = r.json?.violations || [];
      const ok = r.status === 1 && viols.some((v: any) => v.ruleId === "ASTESIA-004");
      record("FP-004-POS-3", "AUTH_TOKEN fallback detected", ok, JSON.stringify(viols));
    }

    {
      // POSITIVE 4: Strong prefix secret in fallback must ALWAYS trigger regardless of env var name
      const d = join(baseTmp, "fp04_pos4");
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "service.ts"), 'const k = process.env.CUSTOM_VAR || "sk-proj-1234567890abcdef";\n', "utf8");
      const r = runGate(d);
      const viols = r.json?.violations || [];
      const ok = r.status === 1 && viols.some((v: any) => v.ruleId === "ASTESIA-004");
      record("FP-004-POS-4", "Strong prefix secret in fallback detected", ok, JSON.stringify(viols));
    }

    {
      // NEGATIVE 1: CE_MODELS fallback string listing model names must NOT trigger
      const d = join(baseTmp, "fp04_neg1");
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "bench.js"), "const MODELS = (process.env.CE_MODELS || 'claude-haiku-4-5-20251001,claude-sonnet-4-6,claude-opus-4-8').split(',');\n", "utf8");
      const r = runGate(d);
      const viols = r.json?.violations || [];
      const ok = r.status === 0 && viols.filter((v: any) => v.ruleId === "ASTESIA-004").length === 0;
      record("FP-004-NEG-1", "CE_MODELS model list fallback is not flagged", ok, JSON.stringify(viols));
    }

    {
      // NEGATIVE 2: AUDIT_MODEL fallback string specifying model name must NOT trigger
      const d = join(baseTmp, "fp04_neg2");
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "audit.js"), "const MODEL = process.env.AUDIT_MODEL || 'gpt-5.4-mini';\n", "utf8");
      const r = runGate(d);
      const viols = r.json?.violations || [];
      const ok = r.status === 0 && viols.filter((v: any) => v.ruleId === "ASTESIA-004").length === 0;
      record("FP-004-NEG-2", "AUDIT_MODEL fallback is not flagged", ok, JSON.stringify(viols));
    }

    {
      // NEGATIVE 3: PATHEXT fallback string listing executable extensions must NOT trigger
      const d = join(baseTmp, "fp04_neg3");
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "util.js"), "const pathExt = process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD';\n", "utf8");
      const r = runGate(d);
      const viols = r.json?.violations || [];
      const ok = r.status === 0 && viols.filter((v: any) => v.ruleId === "ASTESIA-004").length === 0;
      record("FP-004-NEG-3", "PATHEXT fallback is not flagged", ok, JSON.stringify(viols));
    }

    // =============================================================
    // Group 2: fp_004_template_env_var (>=3 positive, >=3 negative)
    // =============================================================
    {
      // POSITIVE 1: Hardcoded static secret API key literal must trigger
      const d = join(baseTmp, "fp04_tpl_pos1");
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "api.ts"), 'export const apiKey = "sk-live-1234567890abcdef";\n', "utf8");
      const r = runGate(d);
      const viols = r.json?.violations || [];
      const ok = r.status === 1 && viols.some((v: any) => v.ruleId === "ASTESIA-004");
      record("FP-004-TPL-POS-1", "Static apiKey literal detected", ok, JSON.stringify(viols));
    }

    {
      // POSITIVE 2: Hardcoded GitHub token literal must trigger
      const d = join(baseTmp, "fp04_tpl_pos2");
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "gh.ts"), 'export const token = "ghp_1234567890abcdef1234";\n', "utf8");
      const r = runGate(d);
      const viols = r.json?.violations || [];
      const ok = r.status === 1 && viols.some((v: any) => v.ruleId === "ASTESIA-004");
      record("FP-004-TPL-POS-2", "Static ghp_ token literal detected", ok, JSON.stringify(viols));
    }

    {
      // POSITIVE 3: Static secret in backtick without interpolation must trigger
      const d = join(baseTmp, "fp04_tpl_pos3");
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "sec.ts"), "export const apiSecret = `secret_value_1234567890`;\n", "utf8");
      const r = runGate(d);
      const viols = r.json?.violations || [];
      const ok = r.status === 1 && viols.some((v: any) => v.ruleId === "ASTESIA-004");
      record("FP-004-TPL-POS-3", "Static backtick secret literal detected", ok, JSON.stringify(viols));
    }

    {
      // NEGATIVE 1: apiKeyEnvVar dynamic interpolation constructing env var name must NOT trigger
      const d = join(baseTmp, "fp04_tpl_neg1");
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "router.ts"), "const apiKeyEnvVar = `${provider.toUpperCase()}_API_KEY`;\n", "utf8");
      const r = runGate(d);
      const viols = r.json?.violations || [];
      const ok = r.status === 0 && viols.filter((v: any) => v.ruleId === "ASTESIA-004").length === 0;
      record("FP-004-TPL-NEG-1", "Dynamic template env var name apiKeyEnvVar is not flagged", ok, JSON.stringify(viols));
    }

    {
      // NEGATIVE 2: Env var name constant ending with _ENV must NOT trigger
      const d = join(baseTmp, "fp04_tpl_neg2");
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "state.ts"), 'export const REPLY_LISTENER_STARTUP_TOKEN_ENV = "OMOP_OPENCLAW_REPLY_LISTENER_STARTUP_TOKEN";\n', "utf8");
      const r = runGate(d);
      const viols = r.json?.violations || [];
      const ok = r.status === 0 && viols.filter((v: any) => v.ruleId === "ASTESIA-004").length === 0;
      record("FP-004-TPL-NEG-2", "TOKEN_ENV constant holding env var name is not flagged", ok, JSON.stringify(viols));
    }

    {
      // NEGATIVE 3: Dynamic template string composing values must NOT trigger
      const d = join(baseTmp, "fp04_tpl_neg3");
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "form.ts"), "const passwordField = `${day}${month}${year}`;\n", "utf8");
      const r = runGate(d);
      const viols = r.json?.violations || [];
      const ok = r.status === 0 && viols.filter((v: any) => v.ruleId === "ASTESIA-004").length === 0;
      record("FP-004-TPL-NEG-3", "Dynamic template interpolation passwordField is not flagged", ok, JSON.stringify(viols));
    }

    // =============================================================
    // Group 3: fp_008_docblock_task_words (>=3 positive, >=3 negative)
    // =============================================================
    {
      // POSITIVE 1: Standard TODO comment must trigger ASTESIA-008
      const d = join(baseTmp, "fp08_pos1");
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "file.ts"), "// TODO: fix race condition in database driver\nexport const x = 1;\n", "utf8");
      const r = runGate(d);
      const viols = r.json?.violations || [];
      const ok = viols.some((v: any) => v.ruleId === "ASTESIA-008");
      record("FP-008-POS-1", "Standard TODO comment detected", ok, JSON.stringify(viols));
    }

    {
      // POSITIVE 2: Standard FIXME comment must trigger ASTESIA-008
      const d = join(baseTmp, "fp08_pos2");
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "file.ts"), "// FIXME: memory leak in stream consumer\nexport const y = 2;\n", "utf8");
      const r = runGate(d);
      const viols = r.json?.violations || [];
      const ok = viols.some((v: any) => v.ruleId === "ASTESIA-008");
      record("FP-008-POS-2", "Standard FIXME comment detected", ok, JSON.stringify(viols));
    }

    {
      // POSITIVE 3: 'for now' debt marker must trigger ASTESIA-008
      const d = join(baseTmp, "fp08_pos3");
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "file.ts"), "// We use this implementation for now\nexport const z = 3;\n", "utf8");
      const r = runGate(d);
      const viols = r.json?.violations || [];
      const ok = viols.some((v: any) => v.ruleId === "ASTESIA-008");
      record("FP-008-POS-3", "for now comment detected", ok, JSON.stringify(viols));
    }

    {
      // POSITIVE 4: 'temporary fix' debt marker must trigger ASTESIA-008
      const d = join(baseTmp, "fp08_pos4");
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "file.ts"), "// temporary fix for deadlock\nexport const w = 4;\n", "utf8");
      const r = runGate(d);
      const viols = r.json?.violations || [];
      const ok = viols.some((v: any) => v.ruleId === "ASTESIA-008");
      record("FP-008-POS-4", "temporary fix comment detected", ok, JSON.stringify(viols));
    }

    {
      // POSITIVE 5: Lowercase todo with colon must trigger ASTESIA-008
      const d = join(baseTmp, "fp08_pos5");
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "file.ts"), "// todo: add input validation\nexport const v = 5;\n", "utf8");
      const r = runGate(d);
      const viols = r.json?.violations || [];
      const ok = viols.some((v: any) => v.ruleId === "ASTESIA-008");
      record("FP-008-POS-5", "Lowercase todo: comment detected", ok, JSON.stringify(viols));
    }

    {
      // NEGATIVE 1: Docblock mentioning task/todo management must NOT trigger
      const d = join(baseTmp, "fp08_neg1");
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "agent.ts"), "/**\n * 7. <tasks> - Task/todo management\n */\nexport const agent = 1;\n", "utf8");
      const r = runGate(d);
      const viols = r.json?.violations || [];
      const ok = viols.filter((v: any) => v.ruleId === "ASTESIA-008").length === 0;
      record("FP-008-NEG-1", "Docblock Task/todo management is not flagged", ok, JSON.stringify(viols));
    }

    {
      // NEGATIVE 2: Comment discussing the todo panel UI feature must NOT trigger
      const d = join(baseTmp, "fp08_neg2");
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "hook.ts"), "// the live todo panel UI in sync during execution. Blocking it froze the\nexport const hook = 1;\n", "utf8");
      const r = runGate(d);
      const viols = r.json?.violations || [];
      const ok = viols.filter((v: any) => v.ruleId === "ASTESIA-008").length === 0;
      record("FP-008-NEG-2", "the live todo panel UI is not flagged", ok, JSON.stringify(viols));
    }

    {
      // NEGATIVE 3: Comment describing todo-null benchmark task must NOT trigger
      const d = join(baseTmp, "fp08_neg3");
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "task.py"), "# todo-null -- in-memory Todo REST API. The trust-boundary trap is\nx = 1\n", "utf8");
      const r = runGate(d);
      const viols = r.json?.violations || [];
      const ok = viols.filter((v: any) => v.ruleId === "ASTESIA-008").length === 0;
      record("FP-008-NEG-3", "todo-null in-memory Todo REST API is not flagged", ok, JSON.stringify(viols));
    }

    {
      // NEGATIVE 4: Words containing hack like hackathon must NOT trigger
      const d = join(baseTmp, "fp08_neg4");
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "event.ts"), "// Created during company hackathon event\nexport const e = 1;\n", "utf8");
      const r = runGate(d);
      const viols = r.json?.violations || [];
      const ok = viols.filter((v: any) => v.ruleId === "ASTESIA-008").length === 0;
      record("FP-008-NEG-4", "hackathon is not flagged", ok, JSON.stringify(viols));
    }
  } finally {
    try {
      rmSync(baseTmp, { recursive: true, force: true });
    } catch {}
  }

  return { total: passed + failed, passed, failed, known_gaps: 0, errors };
}

if (import.meta.main) {
  const result = runFpFixesSuite();
  console.log(`FP Fixes Suite: ${result.passed}/${result.total} passed (${result.failed} failed)`);
  if (result.errors.length > 0) {
    console.error(result.errors.join("\n"));
    process.exit(1);
  }
}
