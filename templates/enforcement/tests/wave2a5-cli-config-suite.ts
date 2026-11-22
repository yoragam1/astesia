import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

export function runWave2a5CliConfigSuite(
  customGatePath?: string,
  customTmpDir?: string
): { total: number; passed: number; failed: number; known_gaps: number; gapIds: string[]; errors: string[] } {
  const gatePath = customGatePath || resolve(__dirname, "../astesia-gate.ts");
  const rulesPath = resolve(__dirname, "../anti-patterns.json");
  const templateConfigPath = resolve(__dirname, "../gate-config.template.json");
  const workflowPath = resolve(__dirname, "../astesia-gate.workflow.yml");
  const baseTmp = customTmpDir || resolve(__dirname, "../../../.astesia/audit/tmp/w2a5-cli-" + Date.now());
  mkdirSync(baseTmp, { recursive: true });

  let passed = 0;
  let failed = 0;
  let known_gaps = 0;
  const gapIds: string[] = [];
  const errors: string[] = [];

  function record(id: string, name: string, ok: boolean, detail: string) {
    if (ok) {
      passed++;
    } else {
      failed++;
      errors.push(`FAIL: ${id} (${name}) - ${detail}`);
    }
  }

  try {
    // T5-01: Nested template literal with escaped backticks inside ${ } on a single line (eunectes manager.ts pattern)
    {
      const d = join(baseTmp, "t5_01");
      mkdirSync(d, { recursive: true });
      const code = [
        "export function formatRetry(retryModel: string) {",
        "  return `<system-reminder>",
        "**ID:** \\`123\\`",
        "**Link:** ${retryModel ? `\\n- Model: \\`${retryModel}\\`` : \"\"}",
        "</system-reminder>`;",
        "}",
        "export const bad: any = 1;",
        ""
      ].join("\n");
      writeFileSync(join(d, "manager_repro.ts"), code, "utf8");
      const res = spawnSync(process.execPath, [gatePath, "--root", d, "--rules", rulesPath, "--json"], { encoding: "utf8" });
      const parsed = JSON.parse(res.stdout || "{}");
      const viols = parsed.violations || [];
      const ok =
        (parsed.desync_files || []).length === 0 &&
        viols.some((v: any) => v.ruleId === "ASTESIA-005" && v.line === 7);
      record("T5-01", "Nested template literal with escaped backticks inside ${ } has 0 desync", ok, JSON.stringify(parsed));
    }

    // T5-02: Table row template literal with nested escaped backticks (eunectes create-background-cancel.ts pattern)
    {
      const d = join(baseTmp, "t5_02");
      mkdirSync(d, { recursive: true });
      const code = [
        "export function row(t: { id: string; sessionID?: string }) {",
        "  return `| \\`${t.id}\\` | ${t.sessionID ? `\\`${t.sessionID}\\`` : \"(none)\"} |`;",
        "}",
        "export const bad: any = 1;",
        ""
      ].join("\n");
      writeFileSync(join(d, "cancel_repro.ts"), code, "utf8");
      const res = spawnSync(process.execPath, [gatePath, "--root", d, "--rules", rulesPath, "--json"], { encoding: "utf8" });
      const parsed = JSON.parse(res.stdout || "{}");
      const viols = parsed.violations || [];
      const ok =
        (parsed.desync_files || []).length === 0 &&
        viols.some((v: any) => v.ruleId === "ASTESIA-005" && v.line === 4);
      record("T5-02", "Single-line table row with nested template literal & escaped backticks has 0 desync", ok, JSON.stringify(parsed));
    }

    // T5-03: Unclosed ${ in template literal at EOF must remain fail-closed (triggers TOKENIZER_DESYNC)
    {
      const d = join(baseTmp, "t5_03");
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "unclosed_interp.ts"), "const x = `hello ${user;\n", "utf8");
      const res = spawnSync(process.execPath, [gatePath, "--root", d, "--rules", rulesPath, "--json"], { encoding: "utf8" });
      const parsed = JSON.parse(res.stdout || "{}");
      const ok = (parsed.desync_files || []).includes("unclosed_interp.ts");
      record("T5-03", "Unclosed ${ in template literal at EOF triggers TOKENIZER_DESYNC", ok, JSON.stringify(parsed));
    }

    // T4-GAP: PHP/Blade markup apostrophe outside <?php ?> registered as known-gap PHP-MARKUP-OUTSIDE-TAG-GAP
    {
      const d = join(baseTmp, "t4_gap");
      mkdirSync(d, { recursive: true });
      const phpCode = "<div>Welcome to Owner's Portal</div>\n<?php\n$q = \"SELECT * FROM users\";\n?>\n";
      writeFileSync(join(d, "view.blade.php"), phpCode, "utf8");
      const res = spawnSync(process.execPath, [gatePath, "--root", d, "--rules", rulesPath, "--json"], { encoding: "utf8" });
      const parsed = JSON.parse(res.stdout || "{}");
      const hasDesync = (parsed.desync_files || []).includes("view.blade.php");
      // Known gap: currently triggers desync because apostrophe is outside <?php ?>
      if (hasDesync) {
        known_gaps++;
        gapIds.push("PHP-MARKUP-OUTSIDE-TAG-GAP");
      } else {
        passed++;
      }
    }

    // T6-01: --baseline without value -> exit 2 with "use --baseline <path>" (even if default .astesia/gate-baseline.json exists!)
    {
      const d = join(baseTmp, "t6_01");
      mkdirSync(join(d, ".astesia"), { recursive: true });
      writeFileSync(join(d, "index.ts"), "export const a = 1;\n", "utf8");
      spawnSync(process.execPath, [gatePath, "--root", d, "--rules", rulesPath, "--update-baseline"], { encoding: "utf8" });
      const res = spawnSync(process.execPath, [gatePath, "--root", d, "--rules", rulesPath, "--baseline"], { encoding: "utf8" });
      const ok = res.status === 2 && res.stderr.includes("use --baseline <path>");
      record("T6-01", "--baseline without value exits 2 with 'use --baseline <path>'", ok, `status=${res.status}, stderr=${res.stderr}`);
    }

    // T6-02: --baseline followed immediately by --json flag (no path value) -> exit 2 (even if default .astesia/gate-baseline.json exists!)
    {
      const d = join(baseTmp, "t6_02");
      mkdirSync(join(d, ".astesia"), { recursive: true });
      writeFileSync(join(d, "index.ts"), "export const a = 1;\n", "utf8");
      spawnSync(process.execPath, [gatePath, "--root", d, "--rules", rulesPath, "--update-baseline"], { encoding: "utf8" });
      const res = spawnSync(process.execPath, [gatePath, "--root", d, "--rules", rulesPath, "--baseline", "--json"], { encoding: "utf8" });
      const ok = res.status === 2 && res.stderr.includes("use --baseline <path>");
      record("T6-02", "--baseline --json without path exits 2", ok, `status=${res.status}, stderr=${res.stderr}`);
    }

    // T6-03: --update-baseline without value still uses default .astesia/gate-baseline.json and exits 0
    {
      const d = join(baseTmp, "t6_03");
      mkdirSync(join(d, ".astesia"), { recursive: true });
      writeFileSync(join(d, "index.ts"), "export const a = 1;\n", "utf8");
      const resUp = spawnSync(process.execPath, [gatePath, "--root", d, "--rules", rulesPath, "--update-baseline"], { encoding: "utf8" });
      const resCheck = spawnSync(process.execPath, [gatePath, "--root", d, "--rules", rulesPath, "--baseline", ".astesia/gate-baseline.json"], { encoding: "utf8" });
      const ok = resUp.status === 0 && resCheck.status === 0;
      record("T6-03", "--update-baseline without value writes default .astesia/gate-baseline.json", ok, `up=${resUp.status}, check=${resCheck.status}`);
    }

    // T6-04: Workflow file explicitly supplies path to --baseline
    {
      const wf = readFileSync(workflowPath, "utf8");
      const ok = /--baseline\s+\S+/.test(wf);
      record("T6-04", "Workflow file uses explicit path with --baseline", ok, "Checked astesia-gate.workflow.yml");
    }

    // T10-01: gate-config.template.json contains dev-dist and .vercel/output with reasons >= 15 chars
    {
      let tpl: any = {};
      try {
        tpl = JSON.parse(readFileSync(templateConfigPath, "utf8"));
      } catch {}
      const excl: Array<{ path: string; reason: string }> = Array.isArray(tpl.exclude) ? tpl.exclude : [];
      const hasDevDist = excl.some((e) => e.path === "dev-dist" && typeof e.reason === "string" && e.reason.trim().length >= 15);
      const hasVercelOut = excl.some((e) => e.path === ".vercel/output" && typeof e.reason === "string" && e.reason.trim().length >= 15);
      record("T10-01", "gate-config.template.json includes dev-dist and .vercel/output with reasons >= 15 chars", hasDevDist && hasVercelOut, JSON.stringify(tpl));
    }

    // T10-02: Applying gate-config.template.json excludes dev-dist and .vercel/output and records files_excluded
    {
      const d = join(baseTmp, "t10_02");
      mkdirSync(join(d, ".astesia"), { recursive: true });
      mkdirSync(join(d, "dev-dist"), { recursive: true });
      mkdirSync(join(d, ".vercel/output/static"), { recursive: true });
      copyFileSync(templateConfigPath, join(d, ".astesia/gate-config.json"));
      writeFileSync(join(d, "dev-dist/workbox.js"), "// TODO: workbox hack\n", "utf8");
      writeFileSync(join(d, ".vercel/output/static/chunk.js"), "const x = `unclosed;\n", "utf8");
      writeFileSync(join(d, "index.ts"), "export const ok = 1;\n", "utf8");
      const res = spawnSync(process.execPath, [gatePath, "--root", d, "--rules", rulesPath, "--json"], { encoding: "utf8" });
      const parsed = JSON.parse(res.stdout || "{}");
      const ok =
        res.status === 0 &&
        parsed.files_excluded === 2 &&
        parsed.files_scanned?.total === 1 &&
        (parsed.violations || []).length === 0;
      record("T10-02", "gate-config.template.json excludes dev-dist and .vercel/output and records files_excluded=2", ok, JSON.stringify(parsed));
    }
  } finally {
    try {
      rmSync(baseTmp, { recursive: true, force: true });
    } catch {}
  }

  return { total: passed + failed + known_gaps, passed, failed, known_gaps, gapIds, errors };
}

if (import.meta.main) {
  const r = runWave2a5CliConfigSuite();
  console.log(`Wave 2A.5 CLI & Config Suite: ${r.passed}/${r.total} passed (${r.failed} failed, ${r.known_gaps} known gaps)`);
  if (r.errors.length > 0) {
    console.error(r.errors.join("\n"));
    process.exit(1);
  }
}
