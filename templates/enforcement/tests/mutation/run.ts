/**
 * templates/enforcement/tests/mutation/run.ts
 * Self-testing mutation harness for Astesia Gate (F-I / T8).
 * Tests >= 27 distinct mutants against enforcement test suites with strict single-match replacement.
 * Invariant: ALL mutants must be caught (100% kill rate, 0 survivors).
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

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
        const r = spawnSync("bun", [join(__dirname, "../env-git-suite.ts")], {
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
          import { join } from "node:path";

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
          import { join } from "node:path";

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
