/**
 * templates/enforcement/tests/mutation/run.ts
 * Self-testing mutation harness for Astesia Gate (F-I).
 * Tests >= 18 distinct mutants against enforcement test suites.
 * Invariant: ALL mutants must be caught (0 survivors).
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

interface Mutant {
  id: string;
  name: string;
  description: string;
  mutate: (gateContent: string) => string;
  testCmd: (mutatedGatePath: string, tmpDir: string) => { passed: boolean; error?: string };
}

export function runMutationHarness(): {
  total: number;
  killed: number;
  survived: number;
  results: Array<{ id: string; name: string; killed: boolean; detail?: string }>;
} {
  const gatePath = join(__dirname, "../../astesia-gate.ts");
  const authenticGate = readFileSync(gatePath, "utf8");
  const authenticWf = readFileSync(join(__dirname, "../../astesia-gate.workflow.yml"), "utf8");
  const tmpDir = join(__dirname, "../../../../.astesia/audit/tmp/mutation-tmp-" + Date.now());
  mkdirSync(tmpDir, { recursive: true });

  const mutants: Mutant[] = [
    // M01: ReDoS check removed
    {
      id: "M01",
      name: "redos_quote_precheck_removed",
      description: "Bypass linear quote check in ASTESIA-004",
      mutate: (code) => code.replace(/const hasQuote = [^;]+;/, "const hasQuote = false;"),
      testCmd: (mgPath, td) => {
        const testScript = join(td, "test_m01.ts");
        writeFileSync(testScript, `
          import { spawnSync } from "node:child_process";
          import { mkdirSync, writeFileSync } from "node:fs";
          import { join } from "node:path";
          const dir = join("${td.replace(/\\/g, "/")}", "m01-run");
          mkdirSync(dir, { recursive: true });
          const rules = { rules: [{ id: "ASTESIA-004", name: "sec", severity: "error", kind: "line-regex", pattern: "sec", description: "d", fix: "f" }] };
          writeFileSync(join(dir, "rules.json"), JSON.stringify(rules));
          writeFileSync(join(dir, "test.ts"), 'const apiKey = "sk_live_1234567890abcdef";\\n');
          const r = spawnSync("bun", ["${mgPath.replace(/\\/g, "/")}", "--root", dir, "--rules", join(dir, "rules.json"), "--json"], { encoding: "utf8" });
          let parsed: any = {};
          try { parsed = JSON.parse(r.stdout); } catch {}
          process.exit((parsed.violations && parsed.violations.length >= 1) ? 0 : 1);
        `);
        const r = spawnSync("bun", [testScript], { encoding: "utf8" });
        return { passed: r.status === 0 };
      }
    },
    // M02: Env batching disabled
    {
      id: "M02",
      name: "env_batching_spawn_count_inflated",
      description: "Mutate classifyEnvFiles to spawn per file (> 3 spawns)",
      mutate: (code) => code.replace(/return \{ ignoredUntracked, spawnCount \};/g, "return { ignoredUntracked, spawnCount: spawnCount + 10 };"),
      testCmd: (mgPath, td) => {
        const testScript = join(td, "test_m02.ts");
        writeFileSync(testScript, `
          import { classifyEnvFiles } from "${mgPath.replace(/\\/g, "/")}";
          const res = classifyEnvFiles("D:/dummy", [".env"], () => ({ status: 0, stdout: "true\\n", stderr: "" }));
          process.exit(res.spawnCount <= 3 ? 0 : 1);
        `);
        const r = spawnSync("bun", [testScript], { encoding: "utf8" });
        return { passed: r.status === 0 };
      }
    },
    // M03: Basic auth without colon accepted
    {
      id: "M03",
      name: "basic_auth_colon_omitted",
      description: "Basic auth accepts base64 even without colon",
      mutate: (code) => code.replace(/if \(colonIdx > 0 && colonIdx < decoded\.length - 1\)/, "if (true)"),
      testCmd: (mgPath, td) => {
        const testScript = join(td, "test_m03.ts");
        writeFileSync(testScript, `
          import { isAuthBearerOrBasic } from "${mgPath.replace(/\\/g, "/")}";
          const acceptsNoColon = isAuthBearerOrBasic("Basic aGVsbG8gd29ybGQ=");
          process.exit(acceptsNoColon ? 1 : 0);
        `);
        const r = spawnSync("bun", [testScript], { encoding: "utf8" });
        return { passed: r.status === 0 };
      }
    },
    // M04: Bearer regex missing dot
    {
      id: "M04",
      name: "bearer_regex_missing_dot",
      description: "Remove dot from Bearer JWT regex and opaque regex",
      mutate: (code) => code.replace(/\[A-Za-z0-9\._-\]/g, "[A-Za-z0-9_-]").replace(/\\\.\[A-Za-z0-9_-\]/g, "[A-Za-z0-9_-]"),
      testCmd: (mgPath, td) => {
        const testScript = join(td, "test_m04.ts");
        writeFileSync(testScript, `
          import { isAuthBearerOrBasic } from "${mgPath.replace(/\\/g, "/")}";
          const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doz";
          process.exit(isAuthBearerOrBasic("Bearer " + jwt) ? 0 : 1);
        `);
        const r = spawnSync("bun", [testScript], { encoding: "utf8" });
        return { passed: r.status === 0 };
      }
    },
    // M05: Key sensitivity substring auth
    {
      id: "M05",
      name: "key_sensitivity_substring_auth",
      description: "Treat any key containing substring 'auth' as sensitive",
      mutate: (code) => code.replace(/const hasAuth = tokenSet\.has\("auth"\) \|\| tokenSet\.has\("authorization"\);/, 'const hasAuth = key.toLowerCase().includes("auth");'),
      testCmd: (mgPath, td) => {
        const testScript = join(td, "test_m05.ts");
        writeFileSync(testScript, `
          import { isSensitiveKey } from "${mgPath.replace(/\\/g, "/")}";
          process.exit(isSensitiveKey("author") ? 1 : 0);
        `);
        const r = spawnSync("bun", [testScript], { encoding: "utf8" });
        return { passed: r.status === 0 };
      }
    },
    // M06: Tracked env file skipped
    {
      id: "M06",
      name: "tracked_env_skipped",
      description: "Ignore git index tracked status and skip all env files in .gitignore",
      mutate: (code) => code.replace('if (envClassification.ignoredUntracked.has(rel)) {', 'if (rel.toLowerCase().includes(".env")) {'),
      testCmd: (mgPath, td) => {
        const r = spawnSync("bun", [join(__dirname, "../env-git-suite.ts")], {
          encoding: "utf8",
          env: { ...process.env, GATE_PATH: mgPath }
        });
        // Mutating gate to skip all env files causes eg02 and eg03 to fail in env-git-suite
        return { passed: r.status === 0 };
      }
    },
    // M07: Workflow guard check omitted
    {
      id: "M07",
      name: "workflow_guard_check_omitted",
      description: "Remove check for guard step in checkWorkflow",
      mutate: (code) => code.replace(/const hasGuardStep = [^;]+;/, "const hasGuardStep = true;"),
      testCmd: (mgPath, td) => {
        const testScript = join(td, "test_m07.ts");
        writeFileSync(testScript, `
          import { checkWorkflow } from "${mgPath.replace(/\\/g, "/")}";
          const wf = \`${authenticWf.replace(/--check-workflow/g, "--ignore-check")}\`;
          const res = checkWorkflow(wf);
          process.exit(res.valid ? 1 : 0);
        `);
        const r = spawnSync("bun", [testScript], { encoding: "utf8" });
        return { passed: r.status === 0 };
      }
    },
    // M08: Hash in quotes chopped
    {
      id: "M08",
      name: "hash_in_quotes_chopped",
      description: "Revert quote-aware comment stripping in YAML/.env",
      mutate: (code) => code.replace(/if \(inQuote\) \{[\s\S]*?\} else \{/g, "if (false) {} else {"),
      testCmd: (mgPath, td) => {
        const testScript = join(td, "test_m08.ts");
        writeFileSync(testScript, `
          import { preprocessSource } from "${mgPath.replace(/\\/g, "/")}";
          const p = preprocessSource('SECRET="a # b"\\n', ".env");
          process.exit(p.codeLines[0].includes('SECRET="a # b"') ? 0 : 1);
        `);
        const r = spawnSync("bun", [testScript], { encoding: "utf8" });
        return { passed: r.status === 0 };
      }
    },
    // M09: ASTESIA-010 inline allow permitted
    {
      id: "M09",
      name: "astesia010_inline_allow_permitted",
      description: "Remove ASTESIA-010 from NEVER_INLINE_SUPPRESS",
      mutate: (code) => code.replace(/"ASTESIA-010",/g, ""),
      testCmd: (mgPath, td) => {
        const testScript = join(td, "test_m09.ts");
        writeFileSync(testScript, `
          import { NEVER_INLINE_SUPPRESS } from "${mgPath.replace(/\\/g, "/")}";
          process.exit(NEVER_INLINE_SUPPRESS.has("ASTESIA-010") ? 0 : 1);
        `);
        const r = spawnSync("bun", [testScript], { encoding: "utf8" });
        return { passed: r.status === 0 };
      }
    },
    // M10: Standalone key sensitive
    {
      id: "M10",
      name: "standalone_key_sensitive",
      description: "Make standalone 'key' sensitive",
      mutate: (code) => code.replace('if (tokens.length === 1 && tokens[0] === "key") {\n    return false;\n  }', 'if (tokens.length === 1 && tokens[0] === "key") { return true; }'),
      testCmd: (mgPath, td) => {
        const testScript = join(td, "test_m10.ts");
        writeFileSync(testScript, `
          import { isSensitiveKey } from "${mgPath.replace(/\\/g, "/")}";
          process.exit(isSensitiveKey("key") ? 1 : 0);
        `);
        const r = spawnSync("bun", [testScript], { encoding: "utf8" });
        return { passed: r.status === 0 };
      }
    },
    // M11: Baseline raise permitted without flag
    {
      id: "M11",
      name: "baseline_raise_permitted_without_flag",
      description: "Permit baseline increase even when allowRaise is false",
      mutate: (code) => code.replace("if (count > baseCount) {", "if (false) {"),
      testCmd: (mgPath, td) => {
        const testScript = join(td, "test_m11.ts");
        writeFileSync(testScript, `
          import { spawnSync } from "node:child_process";
          import { mkdirSync, writeFileSync } from "node:fs";
          import { join } from "node:path";

          const dir = join("${td.replace(/\\/g, "/")}", "m11-base");
          mkdirSync(dir, { recursive: true });
          const rules = { rules: [{ id: "ASTESIA-005", name: "any", severity: "error", kind: "line-regex", pattern: ": any", description: "any", fix: "fix", origin: "COD" }] };
          writeFileSync(join(dir, "rules.json"), JSON.stringify(rules));
          writeFileSync(join(dir, "base.json"), JSON.stringify({ schema: 1, violations: { "ASTESIA-005": { "a.ts": 1 } }, counters: { debt_markers: 0, suppressions: 0, files_excluded: 0, desync_files: 0, allowlisted: 0 }, coverage: { files_scanned: 1, min_ratio: 0.9 }, history: [] }));
          writeFileSync(join(dir, "a.ts"), "const x: any = 1;\\nconst y: any = 2;\\n");

          const r = spawnSync("bun", ["${mgPath.replace(/\\/g, "/")}", "--root", dir, "--rules", join(dir, "rules.json"), "--baseline", join(dir, "base.json")], { encoding: "utf8" });
          const caughtIncrease = r.status === 1;
          process.exit(caughtIncrease ? 0 : 1);
        `);
        const r = spawnSync("bun", [testScript], { encoding: "utf8" });
        return { passed: r.status === 0 };
      }
    },
    // M12: Rules diff allows rule removal
    {
      id: "M12",
      name: "rules_diff_allows_removal",
      description: "Omit check for removed rules in handleRulesDiff",
      mutate: (code) => code.replace('if (!hr) {\n      console.error(`[RULES_DIFF: rule ID \'${br.id}\' was removed in head]`);\n      return 1;\n    }', "if (false) {}"),
      testCmd: (mgPath, td) => {
        const testScript = join(td, "test_m12.ts");
        writeFileSync(testScript, `
          import { spawnSync } from "node:child_process";
          import { mkdirSync, writeFileSync } from "node:fs";
          import { join } from "node:path";

          const dir = join("${td.replace(/\\/g, "/")}", "m12-rd");
          mkdirSync(dir, { recursive: true });
          const baseRules = { rules: [{ id: "R1", name: "r1", severity: "error", kind: "line-regex", pattern: "a", description: "d", fix: "f", origin: "o" }] };
          const headRules = { rules: [] };
          writeFileSync(join(dir, "base.json"), JSON.stringify(baseRules));
          writeFileSync(join(dir, "head.json"), JSON.stringify(headRules));

          const r = spawnSync("bun", ["${mgPath.replace(/\\/g, "/")}", "--rules-diff", join(dir, "base.json"), join(dir, "head.json")], { encoding: "utf8" });
          process.exit(r.status === 1 ? 0 : 1);
        `);
        const r = spawnSync("bun", [testScript], { encoding: "utf8" });
        return { passed: r.status === 0 };
      }
    },
    // M13: Fail closed exit code 2 mutated to 0
    {
      id: "M13",
      name: "non_existent_root_exits_0",
      description: "Non-existent root directory exits 0 instead of 2",
      mutate: (code) => code.replace('console.error(`[TOOL_FAILED: root directory does not exist: ${root}]`);\n    process.exit(2);', "process.exit(0);"),
      testCmd: (mgPath, td) => {
        const r = spawnSync("bun", [mgPath, "--root", "non/existent/path/xyz", "--rules", "rules.json"], { encoding: "utf8" });
        return { passed: r.status === 2 };
      }
    },
    // M14: Tokenizer desync suppressed
    {
      id: "M14",
      name: "tokenizer_desync_suppressed",
      description: "Permit suppression of TOKENIZER_DESYNC",
      mutate: (code) => code.replace(/"TOKENIZER_DESYNC",/g, ""),
      testCmd: (mgPath, td) => {
        const testScript = join(td, "test_m14.ts");
        writeFileSync(testScript, `
          import { NEVER_INLINE_SUPPRESS } from "${mgPath.replace(/\\/g, "/")}";
          process.exit(NEVER_INLINE_SUPPRESS.has("TOKENIZER_DESYNC") ? 0 : 1);
        `);
        const r = spawnSync("bun", [testScript], { encoding: "utf8" });
        return { passed: r.status === 0 };
      }
    },
    // M15: ASTESIA-000 allowed in config allowlist
    {
      id: "M15",
      name: "astesia000_config_allow_permitted",
      description: "Permit ASTESIA-000 in config allowlist",
      mutate: (code) => code.replace('if (item.rule !== "ASTESIA-004" && item.rule !== "ASTESIA-010") {', "if (false) {"),
      testCmd: (mgPath, td) => {
        const testScript = join(td, "test_m15.ts");
        writeFileSync(testScript, `
          import { spawnSync } from "node:child_process";
          import { mkdirSync, writeFileSync } from "node:fs";
          import { join } from "node:path";

          const dir = join("${td.replace(/\\/g, "/")}", "m15-al");
          mkdirSync(dir, { recursive: true });
          const rules = { rules: [{ id: "ASTESIA-004", name: "r0", severity: "error", kind: "line-regex", pattern: "foo", description: "d", fix: "fix-it", origin: "SEC" }] };
          writeFileSync(join(dir, "rules.json"), JSON.stringify(rules));
          writeFileSync(join(dir, "cfg.json"), JSON.stringify({ schema: 1, allow: [{ rule: "ASTESIA-000", path: "a.ts", match: "foo", reason: "Attempted bypass of rule 000" }] }));
          writeFileSync(join(dir, "a.ts"), "foo\\n");

          const r = spawnSync("bun", ["${mgPath.replace(/\\/g, "/")}", "--root", dir, "--rules", join(dir, "rules.json"), "--config", join(dir, "cfg.json")], { encoding: "utf8" });
          const rejected = r.status === 2 && r.stderr.includes("allowlist only permitted for ASTESIA-004 and ASTESIA-010");
          process.exit(rejected ? 0 : 1);
        `);
        const r = spawnSync("bun", [testScript], { encoding: "utf8" });
        return { passed: r.status === 0 };
      }
    },
    // M16: Write permissions permitted in checkWorkflow
    {
      id: "M16",
      name: "workflow_write_permissions_permitted",
      description: "Permit write permissions in checkWorkflow",
      mutate: (code) => code.replace("if (/write/i.test(permBlock)) {", "if (false) {"),
      testCmd: (mgPath, td) => {
        const testScript = join(td, "test_m16.ts");
        writeFileSync(testScript, `
          import { checkWorkflow } from "${mgPath.replace(/\\/g, "/")}";
          const mutatedWf = \`${authenticWf.replace(/contents:\s*read/g, "contents: write")}\`;
          process.exit(checkWorkflow(mutatedWf).valid ? 1 : 0);
        `);
        const r = spawnSync("bun", [testScript], { encoding: "utf8" });
        return { passed: r.status === 0 };
      }
    },
    // M17: Unpinned action permitted in checkWorkflow
    {
      id: "M17",
      name: "workflow_unpinned_action_permitted",
      description: "Permit action tags instead of 40-hex commit SHA in checkWorkflow",
      mutate: (code) => code.replace("if (!/^[0-9a-f]{40}$/i.test(pin)) {", "if (false) {"),
      testCmd: (mgPath, td) => {
        const testScript = join(td, "test_m17.ts");
        writeFileSync(testScript, `
          import { checkWorkflow } from "${mgPath.replace(/\\/g, "/")}";
          const mutatedWf = \`${authenticWf.replace(/actions\/checkout@[0-9a-f]{40}/g, "actions/checkout@v4")}\`;
          process.exit(checkWorkflow(mutatedWf).valid ? 1 : 0);
        `);
        const r = spawnSync("bun", [testScript], { encoding: "utf8" });
        return { passed: r.status === 0 };
      }
    },
    // M18: Fail open on git error
    {
      id: "M18",
      name: "classify_env_git_error_fail_open",
      description: "Treat files as ignored when git errors instead of fail-closed",
      mutate: (code) => code.replace("return { ignoredUntracked, spawnCount };", 'return { ignoredUntracked: new Set([".env"]), spawnCount };'),
      testCmd: (mgPath, td) => {
        const testScript = join(td, "test_m18.ts");
        writeFileSync(testScript, `
          import { classifyEnvFiles } from "${mgPath.replace(/\\/g, "/")}";
          const c = classifyEnvFiles("non/existent/dir", [".env"]);
          process.exit(c.ignoredUntracked.size === 0 ? 0 : 1);
        `);
        const r = spawnSync("bun", [testScript], { encoding: "utf8" });
        return { passed: r.status === 0 };
      }
    }
  ];

  const results: Array<{ id: string; name: string; killed: boolean; detail?: string }> = [];
  let killed = 0;

  for (const m of mutants) {
    const mutatedCode = m.mutate(authenticGate);
    if (mutatedCode === authenticGate) {
      console.error(`ERROR: Mutation ${m.id} (${m.name}) did not modify gate code!`);
      results.push({ id: m.id, name: m.name, killed: false, detail: "Mutation pattern did not match" });
      continue;
    }

    const mutatedGatePath = join(tmpDir, `gate_${m.id}.ts`);
    writeFileSync(mutatedGatePath, mutatedCode, "utf8");

    const check = m.testCmd(mutatedGatePath, tmpDir);
    const wasKilled = !check.passed;
    if (wasKilled) {
      killed++;
    }
    results.push({ id: m.id, name: m.name, killed: wasKilled, detail: check.error });
  }

  try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}

  return {
    total: mutants.length,
    killed,
    survived: mutants.length - killed,
    results
  };
}

if (import.meta.main) {
  const res = runMutationHarness();
  console.log(`=== MUTATION TEST RUNNER ===`);
  console.log(`Mutants tested: ${res.total}`);
  console.log(`Mutants killed: ${res.killed}`);
  console.log(`Mutants survived: ${res.survived}`);

  for (const r of res.results) {
    const status = r.killed ? "KILLED" : "SURVIVED (GAP)";
    console.log(`[${status}] ${r.id}: ${r.name}${r.detail ? " (" + r.detail + ")" : ""}`);
  }

  if (res.survived > 0) {
    console.error(`FAILED: ${res.survived} mutants survived!`);
    process.exit(1);
  }
  process.exit(0);
}
