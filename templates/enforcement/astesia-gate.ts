/**
 * astesia-gate.ts — Deterministic enforcement gate (Trust Pyramid, Layer 2).
 *
 * Purpose : Turn repeated agent mistakes into machine-checked rules. Prose is advisory; this is not.
 * Input   : .astesia/anti-patterns.json (rule registry) + the project source tree.
 * Output  : Violations on stdout (human or --json), exit code 1 if any `error` rule is violated
 *           (or `warn` count exceeds --max-warn, the ratchet).
 * Run     : bun .astesia/enforcement/astesia-gate.ts [--root .] [--rules .astesia/anti-patterns.json]
 *                                                    [--json] [--max-warn N]
 * Escape  : `astesia-allow: <rule-id> -- <reason>` on the same or the previous line. Reason is mandatory.
 * Deps    : none (node:fs / node:path only; runs on Bun or Node >= 18 with a TS loader).
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";

type Severity = "error" | "warn";

interface LineRegexRule {
  id: string;
  kind: "line-regex";
  severity: Severity;
  description: string;
  fix: string;
  /** Regex source tested against each line. */
  pattern: string;
  /** Optional RegExp flags for `pattern` (e.g. "i"). */
  flags?: string;
  /** Only files whose relative path matches this regex are scanned. */
  pathRegex?: string;
  /** Files whose relative path matches this regex are skipped. */
  excludeRegex?: string;
  /** Provenance: the incident / review that created this rule (the ratchet's paper trail). */
  origin?: string;
}

interface RelativeImportRule {
  id: string;
  kind: "relative-import-exists";
  severity: Severity;
  description: string;
  fix: string;
  origin?: string;
}

interface NestedLoopCallRule {
  id: string;
  kind: "nested-loop-call";
  severity: Severity;
  description: string;
  fix: string;
  loopPattern: string;
  callPattern: string;
  pathRegex?: string;
  excludeRegex?: string;
  origin?: string;
}

type Rule = LineRegexRule | RelativeImportRule | NestedLoopCallRule;

interface Violation {
  ruleId: string;
  severity: Severity;
  file: string;
  line: number;
  message: string;
  fix: string;
}

const SOURCE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".svelte", ".vue", ".py", ".go", ".php"]);
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "coverage", ".astesia", ".next", ".svelte-kit", "vendor"]);
const RESOLVE_EXT = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".svelte", ".vue", "/index.ts", "/index.js", "/index.tsx"];

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}
const flag = (name: string) => process.argv.includes(`--${name}`);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (!SKIP_DIRS.has(entry)) walk(full, out);
    } else if (SOURCE_EXT.has(extname(entry))) {
      out.push(full);
    }
  }
  return out;
}

/** Returns true when the violation is suppressed by a justified `astesia-allow` comment. */
function isAllowed(lines: string[], idx: number, ruleId: string): boolean {
  const re = new RegExp(`astesia-allow:\\s*${ruleId}\\s*--\\s*\\S+`);
  return re.test(lines[idx]) || (idx > 0 && re.test(lines[idx - 1]));
}

function checkLineRegex(rule: LineRegexRule, rel: string, lines: string[], out: Violation[]) {
  if (rule.pathRegex && !new RegExp(rule.pathRegex).test(rel)) return;
  if (rule.excludeRegex && new RegExp(rule.excludeRegex).test(rel)) return;
  const re = new RegExp(rule.pattern, rule.flags);
  lines.forEach((text, i) => {
    if (re.test(text) && !isAllowed(lines, i, rule.id)) {
      out.push({ ruleId: rule.id, severity: rule.severity, file: rel, line: i + 1, message: rule.description, fix: rule.fix });
    }
  });
}

function checkRelativeImports(rule: RelativeImportRule, abs: string, rel: string, lines: string[], out: Violation[]) {
  if (![".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].includes(extname(abs))) return;
  const re = /(?:from|import|require)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/;
  lines.forEach((text, i) => {
    const m = re.exec(text);
    if (!m || isAllowed(lines, i, rule.id)) return;
    const target = resolve(dirname(abs), m[1]);
    // Accept TS-style ".js" specifiers that point at ".ts" sources.
    const candidates = RESOLVE_EXT.flatMap((e) => [target + e, target.replace(/\.js$/, "") + e]);
    if (!candidates.some((c) => existsSync(c) && statSync(c).isFile())) {
      out.push({ ruleId: rule.id, severity: rule.severity, file: rel, line: i + 1, message: `${rule.description} (${m[1]})`, fix: rule.fix });
    }
  });
}

function checkNestedLoopCall(rule: NestedLoopCallRule, rel: string, lines: string[], out: Violation[]) {
  if (rule.pathRegex && !new RegExp(rule.pathRegex).test(rel)) return;
  if (rule.excludeRegex && new RegExp(rule.excludeRegex).test(rel)) return;
  const loopRe = new RegExp(rule.loopPattern);
  const callRe = new RegExp(rule.callPattern);

  let inLoop = false;
  let loopDepth = 0;
  let loopStartLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const text = lines[i];
    if (!inLoop) {
      if (loopRe.test(text)) {
        inLoop = true;
        loopStartLine = i + 1;
        const opens = (text.match(/{/g) || []).length;
        const closes = (text.match(/}/g) || []).length;
        loopDepth = opens - closes;
        // Check single-line loops or calls on the same line
        if (callRe.test(text) && !isAllowed(lines, i, rule.id)) {
          out.push({ ruleId: rule.id, severity: rule.severity, file: rel, line: i + 1, message: `${rule.description} (loop started L${loopStartLine})`, fix: rule.fix });
        }
        if (loopDepth <= 0 && text.includes("{")) inLoop = false;
      }
    } else {
      const opens = (text.match(/{/g) || []).length;
      const closes = (text.match(/}/g) || []).length;
      loopDepth += opens - closes;
      if (callRe.test(text) && !isAllowed(lines, i, rule.id)) {
        out.push({ ruleId: rule.id, severity: rule.severity, file: rel, line: i + 1, message: `${rule.description} (enclosed by loop L${loopStartLine})`, fix: rule.fix });
      }
      if (loopDepth <= 0) {
        inLoop = false;
        loopDepth = 0;
      }
    }
  }
}

function main() {
  const root = resolve(arg("root", ".")!);
  const rulesPath = resolve(root, arg("rules", ".astesia/anti-patterns.json")!);
  const maxWarn = Number(arg("max-warn", "Infinity"));
  if (!existsSync(rulesPath)) {
    console.error(`[TOOL_FAILED: rules registry not found at ${rulesPath}]`);
    process.exit(2);
  }
  const rules: Rule[] = JSON.parse(readFileSync(rulesPath, "utf8")).rules;
  const violations: Violation[] = [];

  for (const abs of walk(root)) {
    const rel = relative(root, abs).replace(/\\/g, "/");
    const lines = readFileSync(abs, "utf8").split(/\r?\n/);
    for (const rule of rules) {
      if (rule.kind === "line-regex") checkLineRegex(rule, rel, lines, violations);
      else if (rule.kind === "relative-import-exists") checkRelativeImports(rule, abs, rel, lines, violations);
      else if (rule.kind === "nested-loop-call") checkNestedLoopCall(rule, rel, lines, violations);
    }
  }

  const errors = violations.filter((v) => v.severity === "error");
  const warns = violations.filter((v) => v.severity === "warn");

  if (flag("json")) {
    console.log(JSON.stringify({ errors: errors.length, warnings: warns.length, violations }, null, 2));
  } else {
    for (const v of violations) {
      console.log(`[${v.severity.toUpperCase()}] ${v.ruleId} ${v.file}:${v.line}\n  ${v.message}\n  fix: ${v.fix}`);
    }
    console.log(`\nastesia-gate: ${errors.length} error(s), ${warns.length} warning(s), ${rules.length} rule(s) loaded.`);
  }

  if (errors.length > 0) process.exit(1);
  if (warns.length > maxWarn) {
    console.error(`astesia-gate: warning ratchet exceeded (${warns.length} > ${maxWarn}).`);
    process.exit(1);
  }
}

main();
