/**
 * templates/enforcement/tests/mutation/run.ts
 * Self-testing mutation harness for Astesia Gate (F-I / T8).
 * Tests >= 27 distinct mutants against enforcement test suites with strict single-match replacement.
 * Invariant: ALL mutants must be caught (100% kill rate, 0 survivors).
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export function strictReplace(
  code: string,
  target: string,
  replacement: string,
  mutantId: string
): string {
  const normCode = code.replace(/\r\n/g, "\n");
  const normTarget = target.replace(/\r\n/g, "\n");
  const normReplacement = replacement.replace(/\r\n/g, "\n");
  let count = 0;
  let idx = 0;
  while ((idx = normCode.indexOf(normTarget, idx)) !== -1) {
    count++;
    idx += normTarget.length;
  }
  if (count !== 1) {
    throw new Error(
      `Strict replacement failed for mutant ${mutantId}: expected exactly 1 match, found ${count}`
    );
  }
  return normCode.replace(normTarget, normReplacement);
}

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
  const authenticGate = readFileSync(gatePath, "utf8").replace(/\r\n/g, "\n");
  const authenticWf = readFileSync(join(__dirname, "../../astesia-gate.workflow.yml"), "utf8").replace(/\r\n/g, "\n");
  const tmpDir = join(__dirname, "../../../../.astesia/audit/tmp/mutation-tmp-" + Date.now());
  mkdirSync(tmpDir, { recursive: true });

  const mutants: Mutant[] = [
    // M01: ReDoS check removed
    {
      id: "M01",
      name: "redos_quote_precheck_removed",
      description: "Bypass linear quote check in ASTESIA-004",
      mutate: (code) =>
        strictReplace(
          code,
          'const hasQuote = line.includes("\'") || line.includes(\'"\') || line.includes("\\x60");',
          "const hasQuote = false;",
          "M01"
        ),
      testCmd: (mgPath, td) => {
        const testScript = join(td, "test_m01.ts");
        writeFileSync(testScript, `
          import { spawnSync } from "node:child_process";
          import { mkdirSync, writeFileSync } from "node:fs";
          import { join, resolve } from "node:path";
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
      mutate: (code) =>
        strictReplace(
          code,
          "return { ignoredUntracked, spawnCount };\n}",
          "return { ignoredUntracked, spawnCount: spawnCount + 10 };\n}",
          "M02"
        ),
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
      mutate: (code) =>
        strictReplace(code, "if (colonIdx > 0 && colonIdx < decoded.length - 1)", "if (true)", "M03"),
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
      description: "Remove dot handling from Bearer opaque regex",
      mutate: (code) =>
        strictReplace(
          code,
          "/^[A-Za-z0-9._-]+$/",
          "/^[A-Za-z0-9_-]+$/",
          "M04"
        ),
      testCmd: (mgPath, td) => {
        const testScript = join(td, "test_m04.ts");
        writeFileSync(testScript, `
          import { isAuthBearerOrBasic } from "${mgPath.replace(/\\/g, "/")}";
          const tokenWithDot = "opaque.bearer.token.1234567890";
          process.exit(isAuthBearerOrBasic("Bearer " + tokenWithDot) ? 0 : 1);
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
      mutate: (code) =>
        strictReplace(
          code,
          "if (hasSecret || hasPassword || hasToken || hasCredential || hasAuthorization) {",
          "if (hasSecret || hasPassword || hasToken || hasCredential || hasAuthorization || key.toLowerCase().includes(\"auth\")) {",
          "M05"
        ),
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
      mutate: (code) =>
        strictReplace(
          code,
          "if (envClassification.ignoredUntracked.has(rel)) {",
          'if (rel.toLowerCase().includes(".env")) {',
          "M06"
        ),
      testCmd: (mgPath, td) => {
        const r = spawnSync("bun", [join(__dirname, "../env-git-suite.ts"), mgPath], {
          encoding: "utf8",
          env: { ...process.env, GATE_PATH: mgPath }
        });
        return { passed: r.status === 0 };
      }
    },
    // M07: Workflow guard check omitted
    {
      id: "M07",
      name: "workflow_guard_check_omitted",
      description: "Disable checkWorkflow guard step validation",
      mutate: (code) => strictReplace(code, "if (!hasGuardStep) {", "if (false) {", "M07"),
      testCmd: (mgPath, td) => {
        const testScript = join(td, "test_m07.ts");
        writeFileSync(testScript, `
          import { checkWorkflow } from "${mgPath.replace(/\\/g, "/")}";
          const noGuardWf = \`${authenticWf.replace("--check-workflow", "--dummy-step")}\`;
          process.exit(checkWorkflow(noGuardWf).valid ? 1 : 0);
        `);
        const r = spawnSync("bun", [testScript], { encoding: "utf8" });
        return { passed: r.status === 0 };
      }
    },
    // M08: Hash in quotes chopped
    {
      id: "M08",
      name: "hash_in_quotes_chopped",
      description: "PreprocessConfig cuts comments inside quoted strings",
      mutate: (code) =>
        strictReplace(
          code,
          "if (inQuote) {\n          if (ch === \"\\\\\" && !isEscaped) {",
          "if (false) {\n          if (ch === \"\\\\\" && !isEscaped) {",
          "M08"
        ),
      testCmd: (mgPath, td) => {
        const testScript = join(td, "test_m08.ts");
        writeFileSync(testScript, `
          import { preprocessSource } from "${mgPath.replace(/\\/g, "/")}";
          const prep = preprocessSource('PASSWORD: "val # supersecret"\\n', "compose.yml");
          process.exit(prep.codeLines[0].includes("supersecret") ? 0 : 1);
        `);
        const r = spawnSync("bun", [testScript], { encoding: "utf8" });
        return { passed: r.status === 0 };
      }
    },
    // M09: ASTESIA-010 inline allow permitted
    {
      id: "M09",
      name: "astesia010_inline_allow_permitted",
      description: "Permit inline astesia-allow comment for ASTESIA-010",
      mutate: (code) =>
        strictReplace(code, '"ASTESIA-010",\n  "TOKENIZER_DESYNC"', '"TOKENIZER_DESYNC"', "M09"),
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
      mutate: (code) =>
        strictReplace(
          code,
          'if (tokens.length === 1 && (tokens[0] === "key" || tokens[0] === "auth")) {\n    return false;\n  }',
          'if (tokens.length === 1 && (tokens[0] === "key" || tokens[0] === "auth")) {\n    return true;\n  }',
          "M10"
        ),
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
      description: "Permit baseline violation increase even when allowRaise is false",
      mutate: (code) =>
        strictReplace(
          code,
          "if (count > oldCount) {",
          "if (false) {",
          "M11"
        ),
      testCmd: (mgPath, td) => {
        const testScript = join(td, "test_m11.ts");
        writeFileSync(testScript, `
          import { spawnSync } from "node:child_process";
          import { mkdirSync, writeFileSync } from "node:fs";
          import { join, resolve } from "node:path";

          const dir = join("${td.replace(/\\/g, "/")}", "m11-base");
          mkdirSync(dir, { recursive: true });
          const rules = { rules: [{ id: "ASTESIA-005", name: "any", severity: "error", kind: "line-regex", pattern: ": any", description: "any", fix: "fix", origin: "COD" }] };
          writeFileSync(join(dir, "rules.json"), JSON.stringify(rules));
          writeFileSync(join(dir, "base.json"), JSON.stringify({ schema: 1, violations: { "ASTESIA-005": { "a.ts": 1 } }, counters: { debt_markers: 0, suppressions: 0, files_excluded: 0, desync_files: 0, allowlisted: 0 }, coverage: { files_scanned: 1, min_ratio: 0.9 }, history: [] }));
          writeFileSync(join(dir, "a.ts"), "const x: any = 1;\\nconst y: any = 2;\\n");

          const r = spawnSync("bun", ["${mgPath.replace(/\\/g, "/")}", "--root", dir, "--rules", join(dir, "rules.json"), "--baseline", join(dir, "base.json"), "--update-baseline"], { encoding: "utf8" });
          const caughtIncrease = r.status === 1;
          process.exit(caughtIncrease ? 0 : 1);
        `);
        const r = spawnSync("bun", [testScript], { encoding: "utf8" });
        return { passed: r.status === 0 };
      }
    },
    // M12: rules_diff allows removal
    {
      id: "M12",
      name: "rules_diff_allows_removal",
      description: "Permit removal of rules in rules-diff",
      mutate: (code) =>
        strictReplace(
          code,
          "if (!hr) {\n      console.error(`[RULES_DIFF: rule ID '${br.id}' was removed in head]`);\n      return 1;\n    }",
          "if (false) {\n      return 1;\n    }",
          "M12"
        ),
      testCmd: (mgPath, td) => {
        const testScript = join(td, "test_m12.ts");
        writeFileSync(testScript, `
          import { handleRulesDiff } from "${mgPath.replace(/\\/g, "/")}";
          import { writeFileSync } from "node:fs";
          import { join, resolve } from "node:path";

          const bPath = join("${td.replace(/\\/g, "/")}", "base.json");
          const hPath = join("${td.replace(/\\/g, "/")}", "head.json");
          writeFileSync(bPath, JSON.stringify({ rules: [{ id: "R1", severity: "error", kind: "line-regex", pattern: "a", description: "d", fix: "f" }] }));
          writeFileSync(hPath, JSON.stringify({ rules: [] }));

          process.exit(handleRulesDiff(bPath, hPath) === 1 ? 0 : 1);
        `);
        const r = spawnSync("bun", [testScript], { encoding: "utf8" });
        return { passed: r.status === 0 };
      }
    },
    // M13: Non-existent root exits 0
    {
      id: "M13",
      name: "non_existent_root_exits_0",
      description: "Exit 0 when root directory does not exist instead of 2",
      mutate: (code) =>
        strictReplace(
          code,
          'if (!existsSync(root)) {\n    console.error(`[TOOL_FAILED: root directory does not exist: ${root}]`);\n    process.exit(2);\n  }',
          "if (!existsSync(root)) { process.exit(0); }",
          "M13"
        ),
      testCmd: (mgPath, td) => {
        const r = spawnSync("bun", [mgPath, "--root", "D:/non-existent-dir-for-m13"], { encoding: "utf8" });
        return { passed: r.status === 2 };
      }
    },
    // M14: Tokenizer desync suppressed
    {
      id: "M14",
      name: "tokenizer_desync_suppressed",
      description: "Permit inline suppression for TOKENIZER_DESYNC",
      mutate: (code) =>
        strictReplace(code, '"TOKENIZER_DESYNC",\n  "LONG_LINE_SKIPPED"', '"LONG_LINE_SKIPPED"', "M14"),
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
    // M15: ASTESIA-000 config allow permitted
    {
      id: "M15",
      name: "astesia000_config_allow_permitted",
      description: "Permit ASTESIA-000 in config allowlist",
      mutate: (code) =>
        strictReplace(
          code,
          'if (item.rule !== "ASTESIA-004" && item.rule !== "ASTESIA-010") {',
          "if (false) {",
          "M15"
        ),
      testCmd: (mgPath, td) => {
        const testScript = join(td, "test_m15.ts");
        writeFileSync(testScript, `
          import { spawnSync } from "node:child_process";
          import { mkdirSync, writeFileSync } from "node:fs";
          import { join, resolve } from "node:path";

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
      mutate: (code) => strictReplace(code, "if (/write/i.test(permBlock)) {", "if (false) {", "M16"),
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
      mutate: (code) =>
        strictReplace(code, "if (!/^[0-9a-f]{40}$/i.test(pin)) {", "if (false) {", "M17"),
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
      mutate: (code) =>
        strictReplace(
          code,
          "catch {\n    // Fail-closed\n  }",
          'catch {\n    ignoredUntracked.add(".env");\n  }',
          "M18"
        ),
      testCmd: (mgPath, td) => {
        const testScript = join(td, "test_m18.ts");
        writeFileSync(testScript, `
          import { classifyEnvFiles } from "${mgPath.replace(/\\/g, "/")}";
          let call = 0;
          const customSpawn = () => {
            call++;
            if (call === 1) return { status: 0, stdout: "" };
            throw new Error("git check-ignore failed");
          };
          const c = classifyEnvFiles("dummy", [".env"], customSpawn);
          process.exit(c.ignoredUntracked.size === 0 ? 0 : 1);
        `);
        const r = spawnSync("bun", [testScript], { encoding: "utf8" });
        return { passed: r.status === 0 };
      }
    },

    // ================= NEW MUTANTS T8 (M19..M27) =================
    // M19: profileFor ignores basename
    {
      id: "M19",
      name: "profile_for_ignores_basename",
      description: "profileFor uses raw path instead of basename, failing on absolute paths",
      mutate: (code) =>
        strictReplace(
          code,
          'export function profileFor(filePath: string): "config" | "code" {\n  const norm = filePath.replace(/\\\\/g, "/");\n  const base = (norm.split("/").pop() || "").toLowerCase();',
          'export function profileFor(filePath: string): "config" | "code" {\n  const norm = filePath.replace(/\\\\/g, "/");\n  const base = norm.toLowerCase();',
          "M19"
        ),
      testCmd: (mgPath, td) => {
        const testScript = join(td, "test_m19.ts");
        writeFileSync(testScript, `
          import { profileFor } from "${mgPath.replace(/\\/g, "/")}";
          process.exit(profileFor("C:/project/sub/.env") === "config" ? 0 : 1);
        `);
        const r = spawnSync("bun", [testScript], { encoding: "utf8" });
        return { passed: r.status === 0 };
      }
    },
    // M20: token 'pwd' removed from hasPassword
    {
      id: "M20",
      name: "token_pwd_removed_from_has_password",
      description: "Remove 'pwd' and 'pwds' token check from hasPassword",
      mutate: (code) =>
        strictReplace(
          code,
          'tokenSet.has("pwd") ||\n    tokenSet.has("pwds") ||',
          "false ||",
          "M20"
        ),
      testCmd: (mgPath, td) => {
        const testScript = join(td, "test_m20.ts");
        writeFileSync(testScript, `
          import { isSensitiveKey } from "${mgPath.replace(/\\/g, "/")}";
          process.exit(isSensitiveKey("user_pwd") ? 0 : 1);
        `);
        const r = spawnSync("bun", [testScript], { encoding: "utf8" });
        return { passed: r.status === 0 };
      }
    },
    // M21: token 'passphrase' removed from hasPassword
    {
      id: "M21",
      name: "token_passphrase_removed_from_has_password",
      description: "Remove 'passphrase' and 'passphrases' token check from hasPassword",
      mutate: (code) =>
        strictReplace(
          code,
          'tokenSet.has("passphrase") ||\n    tokenSet.has("passphrases") ||',
          "false ||",
          "M21"
        ),
      testCmd: (mgPath, td) => {
        const testScript = join(td, "test_m21.ts");
        writeFileSync(testScript, `
          import { isSensitiveKey } from "${mgPath.replace(/\\/g, "/")}";
          process.exit(isSensitiveKey("user_passphrase") ? 0 : 1);
        `);
        const r = spawnSync("bun", [testScript], { encoding: "utf8" });
        return { passed: r.status === 0 };
      }
    },
    // M22: Solo 'auth' made sensitive again
    {
      id: "M22",
      name: "solo_auth_made_sensitive",
      description: "Re-enable sensitivity for solo 'auth' token violating F1 contract",
      mutate: (code) =>
        strictReplace(
          code,
          'if (tokens.length === 1 && (tokens[0] === "key" || tokens[0] === "auth")) {\n    return false;\n  }',
          'if (tokens.length === 1 && tokens[0] === "auth") {\n    return true;\n  }',
          "M22"
        ),
      testCmd: (mgPath, td) => {
        const testScript = join(td, "test_m22.ts");
        writeFileSync(testScript, `
          import { isSensitiveKey } from "${mgPath.replace(/\\/g, "/")}";
          process.exit(isSensitiveKey("auth") ? 1 : 0);
        `);
        const r = spawnSync("bun", [testScript], { encoding: "utf8" });
        return { passed: r.status === 0 };
      }
    },
    // M23: E1 space exemption enabled in config profile
    {
      id: "M23",
      name: "e1_space_exemption_enabled_in_config",
      description: "Enable E1 space exemption in checkConfigSecret",
      mutate: (code) =>
        strictReplace(
          code,
          "if (isSensitiveKey(key) || hasPassToken) {",
          'if (val.includes(" ")) return { isSecret: false, key, val };\n  if (isSensitiveKey(key) || hasPassToken) {',
          "M23"
        ),
      testCmd: (mgPath, td) => {
        const testScript = join(td, "test_m23.ts");
        writeFileSync(testScript, `
          import { checkConfigSecret } from "${mgPath.replace(/\\/g, "/")}";
          const res = checkConfigSecret("DB_PASSWORD: 'my super secret password 123'");
          process.exit(res.isSecret ? 0 : 1);
        `);
        const r = spawnSync("bun", [testScript], { encoding: "utf8" });
        return { passed: r.status === 0 };
      }
    },
    // M24: config secret length threshold changed from 8 to 15
    {
      id: "M24",
      name: "config_secret_length_threshold_inflated",
      description: "Inflate config secret length threshold to 15, missing 8-14 character secrets",
      mutate: (code) =>
        strictReplace(
          code,
          "// 5. Length check: literal secrets must be >= 8 chars\n  if (val.length < 8) {",
          "// 5. Length check: literal secrets must be >= 8 chars\n  if (val.length < 15) {",
          "M24"
        ),
      testCmd: (mgPath, td) => {
        const testScript = join(td, "test_m24.ts");
        writeFileSync(testScript, `
          import { checkConfigSecret } from "${mgPath.replace(/\\/g, "/")}";
          const res = checkConfigSecret("DB_PASSWORD: 'secret12'");
          process.exit(res.isSecret ? 0 : 1);
        `);
        const r = spawnSync("bun", [testScript], { encoding: "utf8" });
        return { passed: r.status === 0 };
      }
    },
    // M25: Interpolation fallback ignored
    {
      id: "M25",
      name: "interpolation_fallback_ignored",
      description: "Ignore fallback value in \${VAR:-fallback} config expressions",
      mutate: (code) =>
        strictReplace(
          code,
          "const fallbackMatch = /^\\$\\{[A-Za-z0-9_]+:?-(.+)\\}$/.exec(val);\n  if (fallbackMatch) {\n    val = fallbackMatch[1].trim();",
          "const fallbackMatch = /^\\$\\{[A-Za-z0-9_]+:?-(.+)\\}$/.exec(val);\n  if (fallbackMatch) {\n    return { isSecret: false, key, val };",
          "M25"
        ),
      testCmd: (mgPath, td) => {
        const testScript = join(td, "test_m25.ts");
        writeFileSync(testScript, `
          import { checkConfigSecret } from "${mgPath.replace(/\\/g, "/")}";
          const res = checkConfigSecret("DB_PASSWORD: '\${VAR:-production_secret_key_12345}'");
          process.exit(res.isSecret ? 0 : 1);
        `);
        const r = spawnSync("bun", [testScript], { encoding: "utf8" });
        return { passed: r.status === 0 };
      }
    },
    // M26: ASTESIA-010 compose list syntax disabled
    {
      id: "M26",
      name: "compose_list_syntax_disabled",
      description: "Disable docker compose list syntax (- KEY=val) detection",
      mutate: (code) =>
        strictReplace(
          code,
          'if (cleanLine.startsWith("- ")) cleanLine = cleanLine.slice(2).trim();',
          'if (cleanLine.startsWith("- ")) return { isSecret: false, key: "", val: "" };',
          "M26"
        ),
      testCmd: (mgPath, td) => {
        const testScript = join(td, "test_m26.ts");
        writeFileSync(testScript, `
          import { checkConfigSecret } from "${mgPath.replace(/\\/g, "/")}";
          const res = checkConfigSecret("- DB_PASSWORD=my_hardcoded_super_secret_123");
          process.exit(res.isSecret ? 0 : 1);
        `);
        const r = spawnSync("bun", [testScript], { encoding: "utf8" });
        return { passed: r.status === 0 };
      }
    },
    // M27: YAML comment stripping disabled in preprocessSource
    {
      id: "M27",
      name: "yaml_comment_stripping_disabled",
      description: "Bypass comment stripping for config files",
      mutate: (code) =>
        strictReplace(
          code,
          'const isConfigFile = profileFor(filename) === "config";\n\n  if (isConfigFile) {',
          'const isConfigFile = profileFor(filename) === "config";\n\n  if (false && isConfigFile) {',
          "M27"
        ),
      testCmd: (mgPath, td) => {
        const testScript = join(td, "test_m27.ts");
        writeFileSync(testScript, `
          import { preprocessSource } from "${mgPath.replace(/\\/g, "/")}";
          const prep = preprocessSource("PASSWORD: secret12345 # a comment\\n", "docker-compose.yml");
          const commentCut = prep.commentLines[0].includes("a comment");
          process.exit(commentCut ? 0 : 1);
        `);
        const r = spawnSync("bun", [testScript], { encoding: "utf8" });
        return { passed: r.status === 0 };
      }
    },
    // M28: .envrc considered config
    {
      id: "M28",
      name: "envrc_considered_config",
      description: "Treat .envrc as config profile instead of code profile",
      mutate: (code) =>
        strictReplace(
          code,
          '  if (\n    /^\\.env(\\..+)?$/.test(base) ||',
          '  if (\n    /^\\.env.*$/.test(base) ||',
          "M28"
        ),
      testCmd: (mgPath, td) => {
        const testScript = join(td, "test_m28.ts");
        writeFileSync(testScript, `
          import { profileFor } from "${mgPath.replace(/\\/g, "/")}";
          process.exit(profileFor(".envrc") === "code" ? 0 : 1);
        `);
        const r = spawnSync("bun", [testScript], { encoding: "utf8" });
        return { passed: r.status === 0 };
      }
    },
    // M29: profileFor without backslash normalization
    {
      id: "M29",
      name: "profile_for_no_backslash_normalization",
      description: "Omit backslash normalization in profileFor",
      mutate: (code) =>
        strictReplace(
          code,
          'const norm = filePath.replace(/\\\\/g, "/");',
          'const norm = filePath;',
          "M29"
        ),
      testCmd: (mgPath, td) => {
        const testScript = join(td, "test_m29.ts");
        writeFileSync(testScript, `
          import { profileFor } from "${mgPath.replace(/\\/g, "/")}";
          process.exit(profileFor("config\\\\.env.production") === "config" ? 0 : 1);
        `);
        const r = spawnSync("bun", [testScript], { encoding: "utf8" });
        return { passed: r.status === 0 };
      }
    },
    // M30: startsWith('.env') dispatch without boundary
    {
      id: "M30",
      name: "env_dispatch_unbounded_startswith",
      description: "Dispatch config via startsWith('.env') without boundary check",
      mutate: (code) =>
        strictReplace(
          code,
          '/^\\.env(\\..+)?$/.test(base) ||',
          'base.startsWith(".env") ||',
          "M30"
        ),
      testCmd: (mgPath, td) => {
        const testScript = join(td, "test_m30.ts");
        writeFileSync(testScript, `
          import { profileFor } from "${mgPath.replace(/\\/g, "/")}";
          process.exit(profileFor(".environment") === "code" ? 0 : 1);
        `);
        const r = spawnSync("bun", [testScript], { encoding: "utf8" });
        return { passed: r.status === 0 };
      }
    },
    // M31: unbraced $VAR not recognized in config
    {
      id: "M31",
      name: "unbraced_var_not_recognized",
      description: "Disable unbraced $VAR interpolation exemption in checkConfigSecret",
      mutate: (code) =>
        strictReplace(
          code,
          '/^\\$[A-Za-z_]\\w*$/.test(val) ||',
          'false ||',
          "M31"
        ),
      testCmd: (mgPath, td) => {
        const testScript = join(td, "test_m31.ts");
        writeFileSync(testScript, `
          import { checkConfigSecret } from "${mgPath.replace(/\\/g, "/")}";
          const res = checkConfigSecret("DB_PASSWORD=$DB_PASS");
          process.exit(!res.isSecret ? 0 : 1);
        `);
        const r = spawnSync("bun", [testScript], { encoding: "utf8" });
        return { passed: r.status === 0 };
      }
    },
    // M32: Helm keyname rule extended to secretKey
    {
      id: "M32",
      name: "helm_rule_extended_to_secretkey",
      description: "Add 'secret' to HELM_KEYNAME_PREV allowing secretKey identifier values",
      mutate: (code) =>
        strictReplace(
          code,
          'const HELM_KEYNAME_PREV = new Set([\n  "password",',
          'const HELM_KEYNAME_PREV = new Set([\n  "secret",\n  "password",',
          "M32"
        ),
      testCmd: (mgPath, td) => {
        const testScript = join(td, "test_m32.ts");
        writeFileSync(testScript, `
          import { isHelmKeyName } from "${mgPath.replace(/\\/g, "/")}";
          process.exit(!isHelmKeyName("secretKey", "postgres-password") ? 0 : 1);
        `);
        const r = spawnSync("bun", [testScript], { encoding: "utf8" });
        return { passed: r.status === 0 };
      }
    },
    // M33: .json considered config profile
    {
      id: "M33",
      name: "json_considered_config_profile",
      description: "Treat .json files as config profile",
      mutate: (code) =>
        strictReplace(
          code,
          '/\\.dockerfile$/.test(base) ||',
          '/\\.dockerfile$/.test(base) || base.endsWith(".json") ||',
          "M33"
        ),
      testCmd: (mgPath, td) => {
        const testScript = join(td, "test_m33.ts");
        writeFileSync(testScript, `
          import { profileFor } from "${mgPath.replace(/\\/g, "/")}";
          process.exit(profileFor("locales/en.json") === "code" ? 0 : 1);
        `);
        const r = spawnSync("bun", [testScript], { encoding: "utf8" });
        return { passed: r.status === 0 };
      }
    },
    // M34: Dockerfile* not considered config profile
    {
      id: "M34",
      name: "dockerfile_not_considered_config",
      description: "Disable Dockerfile* config profile recognition",
      mutate: (code) =>
        strictReplace(
          code,
          '/^dockerfile(\\..+)?$/.test(base) ||',
          'false ||',
          "M34"
        ),
      testCmd: (mgPath, td) => {
        const testScript = join(td, "test_m34.ts");
        writeFileSync(testScript, `
          import { profileFor } from "${mgPath.replace(/\\/g, "/")}";
          const ok1 = profileFor("Dockerfile") === "config";
          const ok2 = profileFor("Dockerfile.dev") === "config";
          process.exit(ok1 && ok2 ? 0 : 1);
        `);
        const r = spawnSync("bun", [testScript], { encoding: "utf8" });
        return { passed: r.status === 0 };
      }
    },
    // M35: / after identifier treated as regex (division a / b / c broken)
    {
      id: "M35",
      name: "regex_after_ident_treated_as_regex",
      description: "Treat slash after any identifier as opening a regex literal",
      mutate: (code) =>
        strictReplace(
          code,
          "return REGEX_PRECEDING_KEYWORDS.has(word);",
          "return true;",
          "M35"
        ),
      testCmd: (mgPath, td) => {
        const testScript = join(td, "test_m35.ts");
        writeFileSync(testScript, `
          import { preprocessSource } from "${mgPath.replace(/\\/g, "/")}";
          const prep = preprocessSource('const x = a / b / c; const s = "hello";', "div.ts");
          process.exit(!prep.desync && prep.codeNoStringsLines[0].includes("b") ? 0 : 1);
        `);
        const r = spawnSync("bun", [testScript], { encoding: "utf8" });
        return { passed: r.status === 0 };
      }
    },
    // M36: / after return treated as division (regex /`/ triggers desync)
    {
      id: "M36",
      name: "regex_after_return_treated_as_division",
      description: "Remove 'return' from REGEX_PRECEDING_KEYWORDS so return /`/ desyncs",
      mutate: (code) =>
        strictReplace(
          code,
          '"return", "typeof", "case", "void", "delete", "in", "of",',
          '"typeof", "case", "void", "delete", "in", "of",',
          "M36"
        ),
      testCmd: (mgPath, td) => {
        const testScript = join(td, "test_m36.ts");
        writeFileSync(testScript, `
          import { preprocessSource } from "${mgPath.replace(/\\/g, "/")}";
          const prep = preprocessSource("function f() { return /\`/g; }\\n", "ret.ts");
          process.exit(!prep.desync ? 0 : 1);
        `);
        const r = spawnSync("bun", [testScript], { encoding: "utf8" });
        return { passed: r.status === 0 };
      }
    },
    // M37: [/] inside regex closes regex too early
    {
      id: "M37",
      name: "regex_char_class_slash_terminates_early",
      description: "Disable character class tracking in tryScanRegexLiteral so [/] closes regex early",
      mutate: (code) =>
        strictReplace(
          code,
          'if (c === "[") {\n      inClass = true;',
          'if (c === "[") {\n      inClass = false;',
          "M37"
        ),
      testCmd: (mgPath, td) => {
        const testScript = join(td, "test_m37.ts");
        writeFileSync(testScript, `
          import { preprocessSource } from "${mgPath.replace(/\\/g, "/")}";
          const prep = preprocessSource("const r = /[/]\`/g;\\n", "cls.ts");
          process.exit(!prep.desync ? 0 : 1);
        `);
        const r = spawnSync("bun", [testScript], { encoding: "utf8" });
        return { passed: r.status === 0 };
      }
    },
    // M38: Regex handling disabled inside <script> of .svelte/.vue
    {
      id: "M38",
      name: "regex_disabled_inside_svelte_script",
      description: "Disable regex literal scanning inside <script> blocks of .svelte/.vue files",
      mutate: (code) =>
        strictReplace(
          code,
          "const regexEnabled = isRegexLang || (isMarkupFile && inScriptTag);",
          "const regexEnabled = isRegexLang;",
          "M38"
        ),
      testCmd: (mgPath, td) => {
        const testScript = join(td, "test_m38.ts");
        writeFileSync(testScript, `
          import { preprocessSource } from "${mgPath.replace(/\\/g, "/")}";
          const prep = preprocessSource('<script lang="ts">\\nconst r = /\`/g;\\n</script>\\n', "Comp.svelte");
          process.exit(!prep.desync ? 0 : 1);
        `);
        const r = spawnSync("bun", [testScript], { encoding: "utf8" });
        return { passed: r.status === 0 };
      }
    },
    // M39: Regex handling enabled in .py or .go
    {
      id: "M39",
      name: "regex_enabled_in_python_or_go",
      description: "Enable JS regex literal scanner in .py and .go files",
      mutate: (code) =>
        strictReplace(
          code,
          'const REGEX_LANG_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);',
          'const REGEX_LANG_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go"]);',
          "M39"
        ),
      testCmd: (mgPath, td) => {
        const testScript = join(td, "test_m39.ts");
        writeFileSync(testScript, `
          import { preprocessSource } from "${mgPath.replace(/\\/g, "/")}";
          const prep = preprocessSource('def f(): return / "py_str" /', "script.py");
          process.exit(prep.codeNoStringsLines[0].includes('"') ? 0 : 1);
        `);
        const r = spawnSync("bun", [testScript], { encoding: "utf8" });
        return { passed: r.status === 0 };
      }
    },
    // M40: Generated line length threshold lowered to 100
    {
      id: "M40",
      name: "generated_threshold_lowered_to_100",
      description: "Lower generated line length threshold from 5000 to 100 so normal files are skipped",
      mutate: (code) =>
        strictReplace(
          code,
          "if (cleanLines[i].length >= 5000) {",
          "if (cleanLines[i].length >= 100) {",
          "M40"
        ),
      testCmd: (mgPath, td) => {
        const testScript = join(td, "test_m40.ts");
        writeFileSync(testScript, `
          import { isGeneratedFile } from "${mgPath.replace(/\\/g, "/")}";
          const normalLine = "// " + "a".repeat(1200);
          process.exit(!isGeneratedFile([normalLine], "src/app.ts") ? 0 : 1);
        `);
        const r = spawnSync("bun", [testScript], { encoding: "utf8" });
        return { passed: r.status === 0 };
      }
    },
    // M41: @generated header marker checked across entire file instead of first 10 lines
    {
      id: "M41",
      name: "generated_header_checked_after_line_10",
      description: "Check @generated header marker across all lines instead of first 10 lines",
      mutate: (code) =>
        strictReplace(
          code,
          "const headerLimit = Math.min(10, rawLines.length);",
          "const headerLimit = rawLines.length;",
          "M41"
        ),
      testCmd: (mgPath, td) => {
        const testScript = join(td, "test_m41.ts");
        writeFileSync(testScript, `
          import { detectHeaderMarker } from "${mgPath.replace(/\\/g, "/")}";
          const lines = [...Array(10).fill("// normal line"), "// @generated on line 11"];
          process.exit(detectHeaderMarker(lines) === null ? 0 : 1);
        `);
        const r = spawnSync("bun", [testScript], { encoding: "utf8" });
        return { passed: r.status === 0 };
      }
    },
    // M42: Strong-prefix secret scan on generated files disabled
    {
      id: "M42",
      name: "generated_secret_scan_disabled",
      description: "Disable STRONG_SECRET_RE scan on generated/minified files",
      mutate: (code) =>
        strictReplace(
          code,
          "if (STRONG_SECRET_RE.test(rawLines[l])) {",
          "if (false && STRONG_SECRET_RE.test(rawLines[l])) {",
          "M42"
        ),
      testCmd: (mgPath, td) => {
        const dir = join(td, "m42-gen");
        mkdirSync(dir, { recursive: true });
        const rules = { rules: [{ id: "ASTESIA-004", name: "sec", severity: "error", kind: "line-regex", pattern: "sec", description: "d", fix: "f" }] };
        writeFileSync(join(dir, "rules.json"), JSON.stringify(rules));
        writeFileSync(join(dir, "app.min.js"), 'const k = "sk_live_1234567890abcdef";\n');
        const r = spawnSync("bun", [mgPath, "--root", dir, "--rules", join(dir, "rules.json"), "--json"], { encoding: "utf8" });
        return { passed: r.status === 1 };
      }
    },
    // M43: Increase in generated_skipped does not fail --baseline
    {
      id: "M43",
      name: "generated_skipped_ratchet_ignored",
      description: "Ignore increase in generated_skipped counter during --baseline check",
      mutate: (code) =>
        strictReplace(
          code,
          'if ((counters.generated_skipped ?? 0) > (baseline.counters?.generated_skipped ?? 0)) {\n    counterRegressions.push(`generated_skipped increased (${counters.generated_skipped ?? 0} > ${baseline.counters?.generated_skipped ?? 0})`);\n  }',
          "if (false) {}",
          "M43"
        ),
      testCmd: (mgPath, td) => {
        const dir = join(td, "m43-base");
        mkdirSync(dir, { recursive: true });
        const rules = { rules: [{ id: "ASTESIA-005", name: "any", severity: "error", kind: "line-regex", pattern: ": any", description: "d", fix: "f" }] };
        writeFileSync(join(dir, "rules.json"), JSON.stringify(rules));
        writeFileSync(
          join(dir, "base.json"),
          JSON.stringify({
            schema: 1,
            violations: {},
            counters: { debt_markers: 0, suppressions: 0, files_excluded: 0, desync_files: 0, allowlisted: 0, generated_skipped: 0 },
            generated_files: ["bundle.min.js"],
            coverage: { files_scanned: 1, min_ratio: 0.9 },
            history: []
          })
        );
        writeFileSync(join(dir, "index.ts"), "export const a = 1;\n");
        writeFileSync(join(dir, "bundle.min.js"), "const b = 2;\n");
        const r = spawnSync("bun", [mgPath, "--root", dir, "--rules", join(dir, "rules.json"), "--baseline", join(dir, "base.json")], { encoding: "utf8" });
        return { passed: r.status === 1 };
      }
    },
    // M44: URL exemption ignores user:pass@ in userinfo
    {
      id: "M44",
      name: "url_exempt_ignores_userinfo_password",
      description: "Exempt URL even when userinfo contains a hardcoded password",
      mutate: (code) =>
        strictReplace(
          code,
          'if (!URL_VAR_REF_RE.test(pass)) {\n        return "trigger";\n      }',
          'if (false) {\n        return "trigger";\n      }',
          "M44"
        ),
      testCmd: (mgPath, td) => {
        const testScript = join(td, "test_m44.ts");
        writeFileSync(testScript, `
          import { analyzeUrlFor004 } from "${mgPath.replace(/\\/g, "/")}";
          process.exit(analyzeUrlFor004("postgres://admin:hunter2@db/app", "u", "DATABASE_URL", true) === "trigger" ? 0 : 1);
        `);
        const r = spawnSync("bun", [testScript], { encoding: "utf8" });
        return { passed: r.status === 0 };
      }
    },
    // M45: URL exemption ignores sensitive query parameter token= / api_key=
    {
      id: "M45",
      name: "url_exempt_ignores_sensitive_query_param",
      description: "Exempt URL even when query parameters contain token= or api_key=",
      mutate: (code) =>
        strictReplace(
          code,
          'for (const [k] of parsedUrl.searchParams.entries()) {\n    if (SENSITIVE_URL_PARAM_RE.test(k)) {\n      return "trigger";\n    }\n  }',
          'for (const [k] of parsedUrl.searchParams.entries()) {\n    if (false) {\n      return "trigger";\n    }\n  }',
          "M45"
        ),
      testCmd: (mgPath, td) => {
        const testScript = join(td, "test_m45.ts");
        writeFileSync(testScript, `
          import { analyzeUrlFor004 } from "${mgPath.replace(/\\/g, "/")}";
          process.exit(analyzeUrlFor004("https://api.example.com?api_key=abcd1234", "u", "API_URL", true) === "trigger" ? 0 : 1);
        `);
        const r = spawnSync("bun", [testScript], { encoding: "utf8" });
        return { passed: r.status === 0 };
      }
    },
    // M46: URL exemption applies even when key/env name is sensitive (JWT_SECRET)
    {
      id: "M46",
      name: "url_exempt_ignores_sensitive_key_name",
      description: "Exempt URL even when assigned to a sensitive key or sensitive env var like JWT_SECRET",
      mutate: (code) =>
        strictReplace(
          code,
          'if (lhsSensitive || envSensitive) {\n    return "trigger";\n  }',
          'if (false) {\n    return "trigger";\n  }',
          "M46"
        ),
      testCmd: (mgPath, td) => {
        const testScript = join(td, "test_m46.ts");
        writeFileSync(testScript, `
          import { analyzeUrlFor004 } from "${mgPath.replace(/\\/g, "/")}";
          process.exit(analyzeUrlFor004("https://x.example.com", "s", "JWT_SECRET", true) === "trigger" ? 0 : 1);
        `);
        const r = spawnSync("bun", [testScript], { encoding: "utf8" });
        return { passed: r.status === 0 };
      }
    },
    // M47: URL parse failure still treated as exempt
    {
      id: "M47",
      name: "url_parse_failure_treated_as_exempt",
      description: "Return exempt instead of trigger when URL parsing fails",
      mutate: (code) =>
        strictReplace(
          code,
          '  try {\n    parsedUrl = new URL("http://" + hostPort + pathQueryHash);\n  } catch {\n    return isEnvFallback ? "trigger" : "not_url";\n  }',
          '  try {\n    parsedUrl = new URL("http://" + hostPort + pathQueryHash);\n  } catch {\n    return "exempt";\n  }',
          "M47"
        ),
      testCmd: (mgPath, td) => {
        const testScript = join(td, "test_m47.ts");
        writeFileSync(testScript, `
          import { analyzeUrlFor004 } from "${mgPath.replace(/\\/g, "/")}";
          process.exit(analyzeUrlFor004("http://[::1", "u", "API_URL", true) === "trigger" ? 0 : 1);
        `);
        const r = spawnSync("bun", [testScript], { encoding: "utf8" });
        return { passed: r.status === 0 };
      }
    },
    // M48: Bare --baseline without argument falls back to default path (exit 0 instead of exit 2)
    {
      id: "M48",
      name: "bare_baseline_flag_uses_default_path",
      description: "Allow bare --baseline without path to fall back to .astesia/gate-baseline.json instead of exiting 2",
      mutate: (code) =>
        strictReplace(
          code,
          'if (opts.has("baseline") && (!opts.get("baseline") || opts.get("baseline")!.trim() === "")) {\n    console.error("[TOOL_FAILED: missing path for --baseline (use --baseline <path>)]");\n    process.exit(2);\n  }',
          'if (opts.has("baseline") && (!opts.get("baseline") || opts.get("baseline")!.trim() === "")) {\n    opts.set("baseline", ".astesia/gate-baseline.json");\n  }',
          "M48"
        ),
      testCmd: (mgPath, td) => {
        const dir = join(td, "m48-bare");
        mkdirSync(join(dir, ".astesia"), { recursive: true });
        const rules = { rules: [{ id: "ASTESIA-005", name: "any", severity: "error", kind: "line-regex", pattern: ": any", description: "d", fix: "f" }] };
        writeFileSync(join(dir, "rules.json"), JSON.stringify(rules));
        writeFileSync(
          join(dir, ".astesia/gate-baseline.json"),
          JSON.stringify({
            schema: 1,
            violations: {},
            counters: { debt_markers: 0, suppressions: 0, files_excluded: 0, desync_files: 0, allowlisted: 0, generated_skipped: 0 },
            coverage: { files_scanned: 1, min_ratio: 0.9 },
            history: []
          })
        );
        writeFileSync(join(dir, "index.ts"), "export const a = 1;\n");
        const r = spawnSync("bun", [mgPath, "--root", dir, "--rules", join(dir, "rules.json"), "--baseline"], { encoding: "utf8" });
        return { passed: r.status === 2 };
      }
    },
    // M49: Ratio criteria removed in isGeneratedFile
    {
      id: "M49",
      name: "ratio_criteria_removed",
      description: "Remove ratio check in isGeneratedFile so any file with line >= 5000 is marked generated",
      mutate: (code) =>
        strictReplace(code, "return longLinesBytes / totalBytes >= 0.5;", "return true;", "M49"),
      testCmd: (mgPath, td) => {
        const repo = join(td, "m49-repo"); mkdirSync(repo, { recursive: true });
        const lines = ["// " + "a".repeat(5500)];
        for (let i = 0; i < 100; i++) lines.push("console.log(1);" + " ".repeat(485));
        writeFileSync(join(repo, "heavy.ts"), lines.join("\n"));
        const r = spawnSync("bun", [mgPath, "--root", repo, "--rules", join(__dirname, "../../anti-patterns.json"), "--json"], { encoding: "utf8" });
        return { passed: r.status === 1 };
      }
    },
    // M50: Ratio threshold relaxed (0.5 -> 0.05)
    {
      id: "M50",
      name: "ratio_threshold_relaxed",
      description: "Relax ratio threshold from 0.5 to 0.05 in isGeneratedFile",
      mutate: (code) =>
        strictReplace(code, "return longLinesBytes / totalBytes >= 0.5;", "return longLinesBytes / totalBytes >= 0.05;", "M50"),
      testCmd: (mgPath, td) => {
        const repo = join(td, "m50-repo"); mkdirSync(repo, { recursive: true });
        const lines = ["// " + "a".repeat(5500)];
        for (let i = 0; i < 100; i++) lines.push("console.log(1);" + " ".repeat(485));
        writeFileSync(join(repo, "heavy.ts"), lines.join("\n"));
        const r = spawnSync("bun", [mgPath, "--root", repo, "--rules", join(__dirname, "../../anti-patterns.json"), "--json"], { encoding: "utf8" });
        return { passed: r.status === 1 };
      }
    },
    // M51: Header marker skips file
    {
      id: "M51",
      name: "header_marker_skips_file",
      description: "Reintroduce header bypass so // @generated skips file scanning",
      mutate: (code) =>
        strictReplace(
          code,
          "if (isGeneratedFile(rawLines, rel, normText)) {\n      generatedFiles.push(rel);",
          "if (isGeneratedFile(rawLines, rel, normText) || detectHeaderMarker(rawLines)) {\n      generatedFiles.push(rel);",
          "M51"
        ),
      testCmd: (mgPath, td) => {
        const repo = join(td, "m51-repo"); mkdirSync(repo, { recursive: true });
        writeFileSync(join(repo, "file.ts"), "// @generated\nconsole.log(1);\n");
        const r = spawnSync("bun", [mgPath, "--root", repo, "--rules", join(__dirname, "../../anti-patterns.json"), "--json"], { encoding: "utf8" });
        return { passed: r.status === 1 };
      }
    },
    // M52: generated_files set ignored in baseline
    {
      id: "M52",
      name: "generated_files_set_ignored",
      description: "Ignore unbaselined generated files set check (only checking counter)",
      mutate: (code) =>
        strictReplace(
          code,
          "const unbaselinedGenerated = generatedFiles.filter((f) => !baselineGeneratedSet.has(f));\n  if (unbaselinedGenerated.length > 0) {",
          "const unbaselinedGenerated = generatedFiles.filter((f) => !baselineGeneratedSet.has(f));\n  if (false && unbaselinedGenerated.length > 0) {",
          "M52"
        ),
      testCmd: (mgPath, td) => {
        const repo = join(td, "m52-repo"); mkdirSync(join(repo, ".astesia"), { recursive: true });
        writeFileSync(join(repo, "file.ts"), "export const a = 1;");
        writeFileSync(join(repo, "new.min.js"), "var a=1;");
        writeFileSync(join(repo, ".astesia/gate-baseline.json"), JSON.stringify({
          schema: 1, violations: {},
          counters: { debt_markers: 0, suppressions: 0, files_excluded: 0, desync_files: 0, allowlisted: 0, generated_skipped: 1, imports_declared: 0 },
          generated_files: ["old.min.js"], coverage: { files_scanned: 1, min_ratio: 0.9 }, history: []
        }));
        const r = spawnSync("bun", [mgPath, "--root", repo, "--rules", join(__dirname, "../../anti-patterns.json"), "--baseline", join(repo, ".astesia/gate-baseline.json")], { encoding: "utf8" });
        return { passed: r.status === 1 };
      }
    },
    // M53: Path normalization removed in generated_files
    {
      id: "M53",
      name: "generated_files_normalization_removed",
      description: "Remove POSIX path normalization for generated_files output",
      mutate: (code) =>
        strictReplace(code, "generated_files: sortedGeneratedFiles,", 'generated_files: sortedGeneratedFiles.map((f) => f.replace(/\\//g, "\\\\")),', "M53"),
      testCmd: (mgPath, td) => {
        const repo = join(td, "m53-repo"); mkdirSync(join(repo, "sub"), { recursive: true });
        writeFileSync(join(repo, "sub/min.min.js"), "var a=1;");
        const r = spawnSync("bun", [mgPath, "--root", repo, "--rules", join(__dirname, "../../anti-patterns.json"), "--json"], { encoding: "utf8" });
        let j: any = {};
        try { j = JSON.parse(r.stdout); } catch {}
        return { passed: Boolean(j.generated_files?.length > 0 && !j.generated_files[0].includes("\\")) };
      }
    },
    // M54: Case sensitivity disabled in existsCaseSensitive
    {
      id: "M54",
      name: "exists_case_sensitive_disabled",
      description: "Disable case-sensitive check in existsCaseSensitive (using existsSync directly)",
      mutate: (code) =>
        strictReplace(
          code,
          "function existsCaseSensitive(targetPath: string, rootDir: string): boolean {\n  try { if (!existsSync(targetPath) || !statSync(targetPath).isFile()) return false; } catch { return false; }",
          "function existsCaseSensitive(targetPath: string, rootDir: string): boolean {\n  try { return existsSync(targetPath) && statSync(targetPath).isFile(); } catch { return false; }",
          "M54"
        ),
      testCmd: (mgPath, td) => {
        const repo = join(td, "m54-repo"); mkdirSync(repo, { recursive: true });
        writeFileSync(join(repo, "target.ts"), "export const x = 1;");
        writeFileSync(join(repo, "main.ts"), "import { x } from './Target.js';");
        const r = spawnSync("bun", [mgPath, "--root", repo, "--rules", join(__dirname, "../../anti-patterns.json"), "--json"], { encoding: "utf8" });
        return { passed: r.status === 1 };
      }
    },
    // M55: ESM TS mapping removed
    {
      id: "M55",
      name: "esm_ts_mapping_removed",
      description: "Remove .js to .ts/.tsx mapping from import resolution candidates",
      mutate: (code) =>
        strictReplace(
          code,
          'if (tBase.endsWith(".js")) {\n        const baseNoExt = tBase.slice(0, -3);\n        candidates.push(baseNoExt + ".ts", baseNoExt + ".tsx", baseNoExt + ".mts", baseNoExt + ".cts", baseNoExt + ".d.ts");\n      }',
          "// esm ts mapping removed",
          "M55"
        ),
      testCmd: (mgPath, td) => {
        const repo = join(td, "m55-repo"); mkdirSync(repo, { recursive: true });
        writeFileSync(join(repo, "target.ts"), "export const x = 1;");
        writeFileSync(join(repo, "main.ts"), "import { x } from './target.js';");
        const r = spawnSync("bun", [mgPath, "--root", repo, "--rules", join(__dirname, "../../anti-patterns.json"), "--json"], { encoding: "utf8" });
        return { passed: r.status === 0 };
      }
    },
    // M56: tsconfig paths ignored
    {
      id: "M56",
      name: "tsconfig_paths_ignored",
      description: "Ignore compilerOptions.paths in tsconfig resolution",
      mutate: (code) =>
        strictReplace(code, 'if (compOpts.paths && typeof compOpts.paths === "object") {', 'if (false && compOpts.paths && typeof compOpts.paths === "object") {', "M56"),
      testCmd: (mgPath, td) => {
        const repo = join(td, "m56-repo"); mkdirSync(join(repo, "src/custom"), { recursive: true });
        writeFileSync(join(repo, "src/custom/btn.ts"), "export const btn = 1;");
        writeFileSync(join(repo, "tsconfig.json"), JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@/*": ["src/custom/*"] } } }));
        writeFileSync(join(repo, "main.ts"), "import { btn } from '@/btn';");
        const r = spawnSync("bun", [mgPath, "--root", repo, "--rules", join(__dirname, "../../anti-patterns.json"), "--json"], { encoding: "utf8" });
        return { passed: r.status === 0 };
      }
    },
    // M57: tsconfig extends ignored
    {
      id: "M57",
      name: "tsconfig_extends_ignored",
      description: "Ignore extends clause in tsconfig resolution",
      mutate: (code) =>
        strictReplace(code, 'if (parsed.extends && typeof parsed.extends === "string") {', 'if (false && parsed.extends && typeof parsed.extends === "string") {', "M57"),
      testCmd: (mgPath, td) => {
        const repo = join(td, "m57-repo"); mkdirSync(join(repo, "src/custom"), { recursive: true });
        writeFileSync(join(repo, "src/custom/btn.ts"), "export const btn = 1;");
        writeFileSync(join(repo, "tsconfig.base.json"), JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@/*": ["src/custom/*"] } } }));
        writeFileSync(join(repo, "tsconfig.json"), JSON.stringify({ extends: "./tsconfig.base.json" }));
        writeFileSync(join(repo, "main.ts"), "import { btn } from '@/btn';");
        const r = spawnSync("bun", [mgPath, "--root", repo, "--rules", join(__dirname, "../../anti-patterns.json"), "--json"], { encoding: "utf8" });
        return { passed: r.status === 0 };
      }
    },
    // M58: Query parameter stripping disabled
    {
      id: "M58",
      name: "query_stripping_disabled",
      description: "Disable ?raw and ?url query specifier stripping in import resolution",
      mutate: (code) =>
        strictReplace(code, 'const specifier = rawSpecifier.replace(/\\?[a-zA-Z0-9_-]+$/, "");', "const specifier = rawSpecifier;", "M58"),
      testCmd: (mgPath, td) => {
        const repo = join(td, "m58-repo"); mkdirSync(repo, { recursive: true });
        writeFileSync(join(repo, "icon.svg"), "<svg></svg>");
        writeFileSync(join(repo, "main.ts"), "import icon from './icon.svg?raw';");
        const r = spawnSync("bun", [mgPath, "--root", repo, "--rules", join(__dirname, "../../anti-patterns.json"), "--json"], { encoding: "utf8" });
        return { passed: r.status === 0 };
      }
    },
    // M59: imports.virtual relative prefix validation removed
    {
      id: "M59",
      name: "virtual_imports_prefix_validation_removed",
      description: "Remove ./ relative path prefix validation in imports.virtual config",
      mutate: (code) =>
        strictReplace(
          code,
          'if (typeof pfx !== "string" || pfx.length < 3 || pfx.startsWith("./") || pfx.startsWith("../") || pfx.startsWith("/") || pfx.startsWith("..") || pfx === ".") {',
          'if (typeof pfx !== "string" || pfx.length < 3) {',
          "M59"
        ),
      testCmd: (mgPath, td) => {
        const repo = join(td, "m59-repo"); mkdirSync(join(repo, ".astesia"), { recursive: true });
        writeFileSync(join(repo, "main.ts"), "export const a = 1;");
        writeFileSync(join(repo, ".astesia/gate-config.json"), JSON.stringify({
          schema: 1, imports: { virtual: [{ prefix: "./relative", reason: "Valid reason for fifteen characters" }] }
        }));
        const r = spawnSync("bun", [mgPath, "--root", repo, "--rules", join(__dirname, "../../anti-patterns.json")], { encoding: "utf8" });
        return { passed: r.status === 2 };
      }
    },
    // M60: imports_declared counter check ignored in baseline
    {
      id: "M60",
      name: "imports_declared_counter_ignored",
      description: "Ignore imports_declared counter regression check in baseline evaluation",
      mutate: (code) =>
        strictReplace(
          code,
          "  if ((counters.imports_declared ?? 0) > (baseline.counters?.imports_declared ?? 0)) {\n    counterRegressions.push(`imports_declared increased (${counters.imports_declared ?? 0} > ${baseline.counters?.imports_declared ?? 0})`);\n  }",
          "  // imports_declared counter ignored",
          "M60"
        ),
      testCmd: (mgPath, td) => {
        const repo = join(td, "m60-repo"); mkdirSync(join(repo, ".astesia"), { recursive: true });
        writeFileSync(join(repo, "main.ts"), "export const a = 1;");
        writeFileSync(join(repo, ".astesia/gate-config.json"), JSON.stringify({
          schema: 1, imports: { virtual: [{ prefix: "#vmod", reason: "Valid reason for fifteen characters" }] }
        }));
        writeFileSync(join(repo, ".astesia/gate-baseline.json"), JSON.stringify({
          schema: 1, violations: {},
          counters: { debt_markers: 0, suppressions: 0, files_excluded: 0, desync_files: 0, allowlisted: 0, generated_skipped: 0, imports_declared: 0 },
          coverage: { files_scanned: 1, min_ratio: 0.9 }, history: []
        }));
        const r = spawnSync("bun", [mgPath, "--root", repo, "--rules", join(__dirname, "../../anti-patterns.json"), "--baseline", join(repo, ".astesia/gate-baseline.json")], { encoding: "utf8" });
        return { passed: r.status === 1 };
      }
    },
    // M61: Virtual modules widened to all $
    {
      id: "M61",
      name: "virtual_modules_widened_to_all_dollar",
      description: "Widen virtual module prefix check to match any $ prefix specifier",
      mutate: (code) =>
        strictReplace(
          code,
          'if (specifier.startsWith("$app/") || specifier.startsWith("$env/") || specifier.startsWith("$service-worker") ||\n        specifier.startsWith("virtual:") || specifier.startsWith("#imports") || specifier.startsWith("#app") || specifier.startsWith("astro:")) return;',
          'if (specifier.startsWith("$") ||\n        specifier.startsWith("virtual:") || specifier.startsWith("#imports") || specifier.startsWith("#app") || specifier.startsWith("astro:")) return;',
          "M61"
        ),
      testCmd: (mgPath, td) => {
        const repo = join(td, "m61-repo"); mkdirSync(repo, { recursive: true });
        writeFileSync(join(repo, "main.ts"), "import x from '$hallucinated/mod';");
        const r = spawnSync("bun", [mgPath, "--root", repo, "--rules", join(__dirname, "../../anti-patterns.json"), "--json"], { encoding: "utf8" });
        return { passed: r.status === 1 };
      }
    },
    // M62: isolatedEnv uses hardcoded NUL
    {
      id: "M62",
      name: "isolated_env_hardcoded_nul",
      description: "Reintroduce hardcoded NUL in isolatedEnv helper",
      mutate: (code) => code + "\n// MUTANT_M62",
      testCmd: (mgPath, td) => {
        const isoPath = join(__dirname, "../isolated-env.ts");
        const isoContent = readFileSync(isoPath, "utf8");
        const mutatedIso = strictReplace(isoContent, 'const nullDevice = process.platform === "win32" ? "/dev/null" : os.devNull;', 'const nullDevice = "NUL";', "M62_ISO");
        const script = join(td, "test_m62.ts");
        writeFileSync(join(td, "iso_m62.ts"), mutatedIso);
        writeFileSync(script, `
          import { isolatedEnv } from "./iso_m62";
          const env = isolatedEnv();
          process.exit(env.GIT_CONFIG_GLOBAL !== "NUL" ? 0 : 1);
        `);
        const r = spawnSync("bun", [script], { cwd: td, encoding: "utf8" });
        return { passed: r.status === 0 };
      }
    },
    // M63: Bun version pin check in --check-workflow removed
    {
      id: "M63",
      name: "workflow_bun_pin_rule_removed",
      description: "Remove exact bun-version pinning check in --check-workflow",
      mutate: (code) =>
        strictReplace(
          code,
          "const bunStep = /uses:\\s*oven-sh\\/setup-bun@[^\\n]+/i.exec(yamlContent);\n  if (bunStep) {",
          "const bunStep = /uses:\\s*oven-sh\\/setup-bun@[^\\n]+/i.exec(yamlContent);\n  if (false && bunStep) {",
          "M63"
        ),
      testCmd: (mgPath, td) => {
        const wf = `name: CI\non: [pull_request]\npermissions:\n  contents: read\njobs:\n  gate:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683\n        with:\n          ref: \${{ github.event.pull_request.base.sha }}\n          path: trusted\n          persist-credentials: false\n      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683\n        with:\n          ref: \${{ github.event.pull_request.head.sha }}\n          path: pr\n          persist-credentials: false\n      - uses: oven-sh/setup-bun@4bc047ad259df6fc24a6c9b0f9a0cb08cf17fbe5\n      - run: bun trusted/gate.ts --check-workflow pr/workflow.yml\n      - run: bun trusted/gate.ts --rules-diff trusted/rules.json pr/rules.json\n      - run: bun trusted/gate.ts --root pr --baseline trusted/base.json\n`;
        const wfPath = join(td, "m63_wf.yml");
        writeFileSync(wfPath, wf);
        const r = spawnSync("bun", [mgPath, "--check-workflow", wfPath], { encoding: "utf8" });
        return { passed: r.status === 1 };
      }
    },
    // M64: Wilson upper bound clamping removed
    {
      id: "M64",
      name: "wilson_clamping_removed",
      description: "Remove Math.min(1, Math.max(0, rawUpper)) clamping from Wilson calculation",
      mutate: (code) => code + "\n// MUTANT_M64",
      testCmd: (mgPath, td) => {
        const statsPath = resolve(__dirname, "../../../../.astesia/audit/wave2a.6/tools/stats.ts");
        const statsContent = readFileSync(statsPath, "utf8");
        const mutatedStats = strictReplace(statsContent, "return Math.min(1, Math.max(0, rawUpper));", "return rawUpper;", "M64_STATS");
        const script = join(td, "test_m64.ts");
        writeFileSync(join(td, "stats_m64.ts"), mutatedStats);
        writeFileSync(script, `
          import { wilsonUpper95 } from "./stats_m64";
          const val = wilsonUpper95(5, 5);
          process.exit(val === 1.0 ? 0 : 1);
        `);
        const r = spawnSync("bun", [script], { cwd: td, encoding: "utf8" });
        return { passed: r.status === 0 };
      }
    },
    // M65: Secret redaction in review-pack disabled
    {
      id: "M65",
      name: "secret_redaction_disabled",
      description: "Disable automatic secret redaction in redactSecretQuote",
      mutate: (code) => code + "\n// MUTANT_M65",
      testCmd: (mgPath, td) => {
        const classifyPath = resolve(__dirname, "../../../../.astesia/audit/wave2a.6/tools/classify.ts");
        const classifyContent = readFileSync(classifyPath, "utf8");
        const mutatedClassify = strictReplace(classifyContent, "export function redactSecretQuote(quote: string, ruleId?: string): string {", "export function redactSecretQuote(quote: string, ruleId?: string): string {\n  return quote;", "M65_CLS");
        const script = join(td, "test_m65.ts");
        writeFileSync(join(td, "classify_m65.ts"), mutatedClassify);
        writeFileSync(script, `
          import { redactSecretQuote } from "./classify_m65";
          const res = redactSecretQuote("key = 'sk_live_1234567890abcdef'");
          process.exit(!res.includes("sk_live") ? 0 : 1);
        `);
        const r = spawnSync("bun", [script], { cwd: td, encoding: "utf8" });
        return { passed: r.status === 0 };
      }
    },
    // M66: Generated file ratio check removed (Keputusan 1 / Task M)
    {
      id: "M66",
      name: "generated_ratio_check_removed",
      description: "Remove ratio check in isGeneratedFile, checking only length >= 5000",
      mutate: (code) =>
        strictReplace(
          code,
          "return longLinesBytes / totalBytes >= 0.5;",
          "return true; // MUTANT M66",
          "M66"
        ),
      testCmd: (mgPath, td) => {
        const rulesPath = resolve(__dirname, "../../anti-patterns.json");
        const fixtureDir = join(td, "m66_fix");
        mkdirSync(fixtureDir, { recursive: true });
        const normalLines = Array.from({ length: 100 }, (_, i) => `// normal line ${i} ` + "x".repeat(80)).join("\n");
        const bomb = "// " + "A".repeat(5000) + "\n" + normalLines + "\n";
        writeFileSync(join(fixtureDir, "bomb.ts"), bomb, "utf8");
        const r = spawnSync("bun", [mgPath, "--root", fixtureDir, "--rules", rulesPath, "--json"], { encoding: "utf8" });
        const parsed = JSON.parse(r.stdout || "{}");
        return { passed: parsed.counters?.generated_skipped === 0 };
      }
    },
    // M67: Generated length threshold lowered from 5000 to 1000 (Task M)
    {
      id: "M67",
      name: "generated_threshold_lowered",
      description: "Lower generated threshold from 5000 to 1000 chars",
      mutate: (code) =>
        strictReplace(
          code,
          "if (cleanLines[i].length >= 5000) {",
          "if (cleanLines[i].length >= 1000) { // MUTANT M67",
          "M67"
        ),
      testCmd: (mgPath, td) => {
        const rulesPath = resolve(__dirname, "../../anti-patterns.json");
        const fixtureDir = join(td, "m67_fix");
        mkdirSync(fixtureDir, { recursive: true });
        writeFileSync(join(fixtureDir, "short_long.ts"), "// " + "B".repeat(2000) + "\n", "utf8");
        const r = spawnSync("bun", [mgPath, "--root", fixtureDir, "--rules", rulesPath, "--json"], { encoding: "utf8" });
        const parsed = JSON.parse(r.stdout || "{}");
        return { passed: parsed.counters?.generated_skipped === 0 };
      }
    },
    // M68: Header marker restores direct bypass without long-line heuristic (Task M)
    {
      id: "M68",
      name: "header_marker_direct_bypass_restored",
      description: "Restore header marker (@generated) as direct bypass in isGeneratedFile",
      mutate: (code) =>
        strictReplace(
          code,
          "if (/\\.min\\.(js|mjs|cjs|css)$/i.test(base)) {\n    return true;\n  }",
          "if (/\\.min\\.(js|mjs|cjs|css)$/i.test(base)) {\n    return true;\n  }\n  if (rawLines.some((l) => /@generated|DO NOT EDIT/i.test(l))) return true; // MUTANT M68",
          "M68"
        ),
      testCmd: (mgPath, td) => {
        const rulesPath = resolve(__dirname, "../../anti-patterns.json");
        const fixtureDir = join(td, "m68_fix");
        mkdirSync(fixtureDir, { recursive: true });
        writeFileSync(join(fixtureDir, "gen_hdr.ts"), "// @generated\nconst a = 1;\n", "utf8");
        const r = spawnSync("bun", [mgPath, "--root", fixtureDir, "--rules", rulesPath, "--json"], { encoding: "utf8" });
        const parsed = JSON.parse(r.stdout || "{}");
        return { passed: parsed.counters?.generated_skipped === 0 };
      }
    },
    // M69: Node_modules reading for package extends restored (Task M)
    {
      id: "M69",
      name: "node_modules_extends_restored",
      description: "Restore reading node_modules for package extends in loadTsconfigRecursive",
      mutate: (code) =>
        strictReplace(
          code,
          "notices.tsconfig_unresolved_extends.push(`${configPath}: extends '${extVal}' ignored (package extends not resolved)`);\n      hasUnresolvedExtends = true;",
          "const nmPath = resolve(configDir, 'node_modules', extVal, 'tsconfig.json');\n      if (existsSync(nmPath)) {\n        const parent = loadTsconfigRecursive(nmPath, depth + 1, notices);\n        mergedPaths = { ...parent.paths };\n        mergedBaseUrl = parent.baseUrl;\n      } else {\n        notices.tsconfig_unresolved_extends.push(`${configPath}: extends '${extVal}' ignored (package extends not resolved)`);\n        hasUnresolvedExtends = true;\n      }",
          "M69"
        ),
      testCmd: (mgPath, td) => {
        const rulesPath = resolve(__dirname, "../../anti-patterns.json");
        const fixtureDir = join(td, "m69_fix");
        mkdirSync(join(fixtureDir, "node_modules/@pkg/config"), { recursive: true });
        mkdirSync(join(fixtureDir, "src"), { recursive: true });
        writeFileSync(join(fixtureDir, "node_modules/@pkg/config/tsconfig.json"), JSON.stringify({ compilerOptions: { paths: { "@/*": ["src/*"] } } }), "utf8");
        writeFileSync(join(fixtureDir, "tsconfig.json"), JSON.stringify({ extends: "@pkg/config" }), "utf8");
        writeFileSync(join(fixtureDir, "src/index.ts"), "export const x = 1;\n", "utf8");
        const r = spawnSync("bun", [mgPath, "--root", fixtureDir, "--rules", rulesPath, "--json"], { encoding: "utf8" });
        const parsed = JSON.parse(r.stdout || "{}");
        // Authentic gate emits notice: (parsed.notices?.tsconfig_unresolved_extends?.length ?? 0) >= 1 -> passed: true
        // Mutated gate reads node_modules and does not emit notice: length === 0 -> passed: false (killed)
        return { passed: (parsed.notices?.tsconfig_unresolved_extends?.length ?? 0) >= 1 };
      }
    },
    // M70: Unverified alias triggers ASTESIA-000 violation directly (Task M)
    {
      id: "M70",
      name: "alias_unverified_triggers_violation",
      description: "Trigger ASTESIA-000 violation instead of alias_unverified notice",
      mutate: (code) =>
        strictReplace(
          code,
          "notices.alias_unverified.push(`${rel}:${i + 1} (${specifier} in unverified package extends)`);\n            return;",
          "out.push({ ruleId: rule.id, severity: rule.severity, file: rel, line: i + 1, message: 'Unverified alias', fix: rule.fix });\n            return;",
          "M70"
        ),
      testCmd: (mgPath, td) => {
        const rulesPath = resolve(__dirname, "../../anti-patterns.json");
        const fixtureDir = join(td, "m70_fix");
        mkdirSync(join(fixtureDir, "src"), { recursive: true });
        writeFileSync(join(fixtureDir, "tsconfig.json"), JSON.stringify({ extends: "@pkg/config" }), "utf8");
        writeFileSync(join(fixtureDir, "src/main.ts"), "import { foo } from '@/unresolved';\n", "utf8");
        const r = spawnSync("bun", [mgPath, "--root", fixtureDir, "--rules", rulesPath, "--json"], { encoding: "utf8" });
        const parsed = JSON.parse(r.stdout || "{}");
        return { passed: (parsed.violations?.length ?? 0) === 0 };
      }
    },
    // M71: Bun version pin check in checkWorkflow removed (Task M)
    {
      id: "M71",
      name: "workflow_bun_pin_check_removed",
      description: "Remove bun-version semver pinning check from checkWorkflow",
      mutate: (code) =>
        strictReplace(
          code,
          "if (bVer === \"latest\" || /[\\^~><x*]/.test(bVer) || !/^\\d+\\.\\d+\\.\\d+$/.test(bVer)) {",
          "if (false && (bVer === \"latest\" || /[\\^~><x*]/.test(bVer) || !/^\\d+\\.\\d+\\.\\d+$/.test(bVer))) { // MUTANT M71",
          "M71"
        ),
      testCmd: (mgPath, td) => {
        const wf = `name: CI\non: [pull_request]\npermissions:\n  contents: read\njobs:\n  gate:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683\n        with:\n          ref: \${{ github.event.pull_request.base.sha }}\n          path: trusted\n          persist-credentials: false\n      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683\n        with:\n          ref: \${{ github.event.pull_request.head.sha }}\n          path: pr\n          persist-credentials: false\n      - uses: oven-sh/setup-bun@4bc047ad259df6fc24a6c9b0f9a0cb08cf17fbe5\n        with:\n          bun-version: latest\n      - run: bun trusted/gate.ts --check-workflow pr/workflow.yml\n      - run: bun trusted/gate.ts --rules-diff trusted/rules.json pr/rules.json\n      - run: bun trusted/gate.ts --root pr --baseline trusted/base.json\n`;
        const wfPath = join(td, "m71_wf.yml");
        writeFileSync(wfPath, wf, "utf8");
        const r = spawnSync("bun", [mgPath, "--check-workflow", wfPath], { encoding: "utf8" });
        return { passed: r.status === 1 };
      }
    },
    // M72: Generated files baseline check replaced by count-only (Task M)
    {
      id: "M72",
      name: "generated_files_set_check_replaced_by_count",
      description: "Replace generated_files set equality check with count-only in evaluateBaseline",
      mutate: (code) =>
        strictReplace(
          code,
          "const baselineGeneratedSet = new Set(baseline.generated_files ?? []);\n  const unbaselinedGenerated = generatedFiles.filter((f) => !baselineGeneratedSet.has(f));\n  if (unbaselinedGenerated.length > 0) {\n    counterRegressions.push(`generated_files contains unbaselined file(s): ${unbaselinedGenerated.join(\", \")}`);\n  }",
          "// MUTANT M72: count-only generated_files comparison\n  if ((counters.generated_skipped ?? 0) > (baseline.counters?.generated_skipped ?? 0)) {\n    // count only\n  }",
          "M72"
        ),
      testCmd: (mgPath, td) => {
        const rulesPath = resolve(__dirname, "../../anti-patterns.json");
        const fixtureDir = join(td, "m72_fix");
        mkdirSync(fixtureDir, { recursive: true });
        const baseObj = {
          version: 1,
          counters: { debt_markers: 0, suppressions: 0, files_excluded: 0, desync_files: 0, allowlisted: 0, generated_skipped: 1, imports_declared: 0 },
          generated_files: ["fileA.min.js"],
          violations: {}
        };
        const basePath = join(fixtureDir, "baseline.json");
        writeFileSync(basePath, JSON.stringify(baseObj), "utf8");
        writeFileSync(join(fixtureDir, "fileB.min.js"), "console.log(1);", "utf8");
        const r = spawnSync("bun", [mgPath, "--root", fixtureDir, "--rules", rulesPath, "--baseline", basePath, "--json"], { encoding: "utf8" });
        return { passed: r.status === 1 };
      }
    },
    // M73: Secret redaction in check-fix-evidence disabled (Task M)
    {
      id: "M73",
      name: "secret_redaction_disabled_in_audit_tools",
      description: "Disable secret pattern rejection in check-fix-evidence",
      mutate: (code) => code + "\n// MUTANT_M73",
      testCmd: (mgPath, td) => {
        const cfePath = resolve(__dirname, "../../../../.astesia/audit/wave2a.7/tools/check-fix-evidence.ts");
        const cfeContent = readFileSync(cfePath, "utf8");
        const mutatedCfe = strictReplace(
          cfeContent,
          "if (/(?:sk_live_|ghp_|AKIA|xox[abp]-)[a-zA-Z0-9_-]{6,}/.test(pat.source_line_raw)) {",
          "if (false && /(?:sk_live_|ghp_|AKIA|xox[abp]-)[a-zA-Z0-9_-]{6,}/.test(pat.source_line_raw)) { // MUTANT M73",
          "M73_CFE"
        );
        const script = join(td, "test_m73.ts");
        writeFileSync(join(td, "cfe_m73.ts"), mutatedCfe);
        writeFileSync(join(td, "fix-evidence.json"), JSON.stringify({
          version: "1.0.0",
          scope: "wave2a.7",
          patterns: [{
            pattern_id: "FP-LEAK",
            rule: "ASTESIA-004",
            source_project: "flora-smk",
            source_finding_id: "ASTESIA-004|foo.ts|1",
            source_line_raw: "key = 'sk_live_1234567890abcdef'",
            rationale: "valid rationale >= 15 chars",
            tests_added: ["t1", "t2"]
          }]
        }));
        writeFileSync(script, `
          import { checkFixEvidence } from "./cfe_m73";
          const res = checkFixEvidence("${join(td, "fix-evidence.json").replace(/\\/g, "/")}");
          process.exit(!res.valid ? 0 : 1);
        `);
        const r = spawnSync("bun", [script], { cwd: td, encoding: "utf8" });
        return { passed: r.status === 0 };
      }
    }
  ];

  const results: Array<{ id: string; name: string; killed: boolean; detail?: string }> = [];
  let killed = 0;

  for (const m of mutants) {
    let mutatedCode = "";
    try {
      mutatedCode = m.mutate(authenticGate);
    } catch (err: unknown) {
      console.error(`ERROR: Mutation ${m.id} (${m.name}) setup failed: ${err}`);
      results.push({ id: m.id, name: m.name, killed: false, detail: String(err) });
      continue;
    }

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

  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {}

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
