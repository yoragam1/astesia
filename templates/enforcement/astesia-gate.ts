/**
 * astesia-gate.ts — Deterministic enforcement gate (Trust Pyramid, Layer 2).
 *
 * Purpose : Turn repeated agent mistakes into machine-checked rules. Prose is advisory; this is not.
 * Input   : .astesia/anti-patterns.json (rule registry) + the project source tree.
 * Output  : Violations on stdout (human or --json), exit code 1 if any `error` rule is violated
 *           (or `warn` count exceeds --max-warn, the ratchet).
 * Run     : bun templates/enforcement/astesia-gate.ts [--root .] [--rules templates/enforcement/anti-patterns.json]
 *                                                    [--json] [--max-warn N]
 * Escape  : `astesia-allow: <rule-id> -- <reason>` on the same or previous line. Reason >= 15 chars.
 *           Banned for ASTESIA-000 and ASTESIA-004.
 * Deps    : none (node:fs / node:path only; runs on Bun or Node >= 18 with a TS loader).
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";

type Severity = "error" | "warn";
type RuleScope = "code" | "comment";

interface LineRegexRule {
  id: string;
  kind: "line-regex";
  severity: Severity;
  description: string;
  fix: string;
  pattern: string;
  flags?: string;
  pathRegex?: string;
  excludeRegex?: string;
  scope?: RuleScope;
  origin?: string;
}

interface RelativeImportRule {
  id: string;
  kind: "relative-import-exists";
  severity: Severity;
  description: string;
  fix: string;
  scope?: RuleScope;
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
  flags?: string;
  pathRegex?: string;
  excludeRegex?: string;
  scope?: RuleScope;
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

interface GateState {
  suppressions: number;
  rejectedSuppressions: number;
  debtMarkers: number;
}

interface PreprocessedFile {
  rawLines: string[];
  codeLines: string[];
  codeNoStringsLines: string[];
  commentLines: string[];
  commentBlocks: Array<{ text: string; startLine: number; endLine: number }>;
  desync?: boolean;
}

const SOURCE_EXT = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".svelte",
  ".vue",
  ".py",
  ".go",
  ".php",
  ".yml",
  ".yaml"
]);

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".next",
  ".svelte-kit",
  "vendor"
]);

const RESOLVE_EXT = [
  "",
  ".ts",
  ".tsx",
  ".d.ts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".svelte",
  ".vue",
  "/index.ts",
  "/index.tsx",
  "/index.d.ts",
  "/index.js"
];

function parseArgs() {
  const args = process.argv.slice(2);
  const flags = new Set<string>();
  const opts = new Map<string, string>();

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      const eqIdx = a.indexOf("=");
      if (eqIdx !== -1) {
        const key = a.slice(2, eqIdx);
        const val = a.slice(eqIdx + 1);
        opts.set(key, val);
      } else {
        const key = a.slice(2);
        const next = args[i + 1];
        if (next !== undefined && !next.startsWith("--")) {
          opts.set(key, next);
          i++;
        } else {
          flags.add(key);
          opts.set(key, "");
        }
      }
    }
  }
  return { flags, opts };
}

function preprocessSource(rawContent: string, filename: string): PreprocessedFile {
  let text = rawContent;
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const ext = extname(filename).toLowerCase();
  const lowerName = filename.toLowerCase();
  const isHashCommentLang =
    [".py", ".yml", ".yaml", ".sh", ".bash"].includes(ext) ||
    lowerName.includes("dockerfile") ||
    lowerName.startsWith(".env");

  const isSingleLineQuoteLang = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go"].includes(ext);
  const isMarkupFile = [".svelte", ".vue"].includes(ext);
  const isPython = ext === ".py";

  const len = text.length;
  const codeChars: string[] = new Array(len);
  const codeNoStringsChars: string[] = new Array(len);
  const commentChars: string[] = new Array(len);

  const S_NORMAL = 0;
  const S_LINE_COMMENT = 1;
  const S_BLOCK_COMMENT = 2;
  const S_STRING_SINGLE = 3;
  const S_STRING_DOUBLE = 4;
  const S_STRING_BACKTICK = 5;
  const S_PY_TRIPLE_SINGLE = 6;
  const S_PY_TRIPLE_DOUBLE = 7;

  let state = S_NORMAL;
  const commentBlocks: Array<{ text: string; startLine: number; endLine: number }> = [];
  let blockStartLine = 1;
  let blockStartIndex = 0;
  let currentLine = 1;
  let inScriptTag = false;

  for (let i = 0; i < len; i++) {
    const ch = text[i];
    const next = i + 1 < len ? text[i + 1] : "";

    if (ch === "\n") {
      codeChars[i] = "\n";
      codeNoStringsChars[i] = "\n";
      commentChars[i] = "\n";
      currentLine++;
      if (state === S_LINE_COMMENT) {
        state = S_NORMAL;
      } else if (state === S_STRING_SINGLE || state === S_STRING_DOUBLE) {
        const isSingleLineQuoteActive = isSingleLineQuoteLang || (isMarkupFile && inScriptTag);
        if (isSingleLineQuoteActive) {
          // Check if newline was preceded by an unescaped backslash (line continuation)
          let backslashes = 0;
          let k = i - 1;
          while (k >= 0 && text[k] === "\\") {
            backslashes++;
            k--;
          }
          if (backslashes % 2 === 0) {
            // Not escaped with odd backslashes -> string terminates at newline
            state = S_NORMAL;
          }
        }
      }
      continue;
    }

    if (state === S_NORMAL) {
      if (isMarkupFile) {
        if (ch === "<") {
          const slice7 = text.slice(i, i + 7).toLowerCase();
          const slice9 = text.slice(i, i + 9).toLowerCase();
          if (slice7 === "<script") {
            inScriptTag = true;
          } else if (slice9 === "</script>") {
            inScriptTag = false;
          }
        }
      }

      if (isPython && ch === '"' && text.slice(i, i + 3) === '"""') {
        state = S_PY_TRIPLE_DOUBLE;
        codeChars[i] = '"'; codeChars[i + 1] = '"'; codeChars[i + 2] = '"';
        codeNoStringsChars[i] = '"'; codeNoStringsChars[i + 1] = '"'; codeNoStringsChars[i + 2] = '"';
        commentChars[i] = " "; commentChars[i + 1] = " "; commentChars[i + 2] = " ";
        i += 2;
      } else if (isPython && ch === "'" && text.slice(i, i + 3) === "'''") {
        state = S_PY_TRIPLE_SINGLE;
        codeChars[i] = "'"; codeChars[i + 1] = "'"; codeChars[i + 2] = "'";
        codeNoStringsChars[i] = "'"; codeNoStringsChars[i + 1] = "'"; codeNoStringsChars[i + 2] = "'";
        commentChars[i] = " "; commentChars[i + 1] = " "; commentChars[i + 2] = " ";
        i += 2;
      } else if (ch === "/" && next === "/") {
        state = S_LINE_COMMENT;
        codeChars[i] = " ";
        codeChars[i + 1] = " ";
        codeNoStringsChars[i] = " ";
        codeNoStringsChars[i + 1] = " ";
        commentChars[i] = "/";
        commentChars[i + 1] = "/";
        i++;
      } else if (ch === "/" && next === "*") {
        state = S_BLOCK_COMMENT;
        blockStartLine = currentLine;
        blockStartIndex = i;
        codeChars[i] = " ";
        codeChars[i + 1] = " ";
        codeNoStringsChars[i] = " ";
        codeNoStringsChars[i + 1] = " ";
        commentChars[i] = "/";
        commentChars[i + 1] = "*";
        i++;
      } else if (isHashCommentLang && ch === "#") {
        state = S_LINE_COMMENT;
        codeChars[i] = " ";
        codeNoStringsChars[i] = " ";
        commentChars[i] = "#";
      } else if (ch === '"') {
        state = S_STRING_DOUBLE;
        codeChars[i] = '"';
        codeNoStringsChars[i] = '"';
        commentChars[i] = " ";
      } else if (ch === "'") {
        state = S_STRING_SINGLE;
        codeChars[i] = "'";
        codeNoStringsChars[i] = "'";
        commentChars[i] = " ";
      } else if (ch === "`") {
        state = S_STRING_BACKTICK;
        codeChars[i] = "`";
        codeNoStringsChars[i] = "`";
        commentChars[i] = " ";
      } else {
        codeChars[i] = ch;
        codeNoStringsChars[i] = ch;
        commentChars[i] = " ";
      }
    } else if (state === S_LINE_COMMENT) {
      codeChars[i] = " ";
      codeNoStringsChars[i] = " ";
      commentChars[i] = ch;
    } else if (state === S_BLOCK_COMMENT) {
      if (ch === "*" && next === "/") {
        codeChars[i] = " ";
        codeChars[i + 1] = " ";
        codeNoStringsChars[i] = " ";
        codeNoStringsChars[i + 1] = " ";
        commentChars[i] = "*";
        commentChars[i + 1] = "/";
        commentBlocks.push({
          text: text.slice(blockStartIndex, i + 2),
          startLine: blockStartLine,
          endLine: currentLine
        });
        i++;
        state = S_NORMAL;
      } else {
        codeChars[i] = " ";
        codeNoStringsChars[i] = " ";
        commentChars[i] = ch;
      }
    } else if (state === S_STRING_DOUBLE) {
      if (ch === "\\") {
        codeChars[i] = "\\";
        codeNoStringsChars[i] = " ";
        commentChars[i] = " ";
        if (next === "\\") {
          i++;
          codeChars[i] = "\\";
          codeNoStringsChars[i] = " ";
          commentChars[i] = " ";
        } else if (next === '"') {
          i++;
          codeChars[i] = '"';
          codeNoStringsChars[i] = " ";
          commentChars[i] = " ";
        } else if (next === "\n") {
          // Line continuation: do NOT consume \n here, main loop will handle it at next index
        } else if (i + 1 < len) {
          i++;
          codeChars[i] = text[i];
          codeNoStringsChars[i] = " ";
          commentChars[i] = " ";
        }
      } else if (ch === '"') {
        codeChars[i] = '"';
        codeNoStringsChars[i] = '"';
        commentChars[i] = " ";
        state = S_NORMAL;
      } else {
        codeChars[i] = ch;
        codeNoStringsChars[i] = " ";
        commentChars[i] = " ";
      }
    } else if (state === S_STRING_SINGLE) {
      if (ch === "\\") {
        codeChars[i] = "\\";
        codeNoStringsChars[i] = " ";
        commentChars[i] = " ";
        if (next === "\\") {
          i++;
          codeChars[i] = "\\";
          codeNoStringsChars[i] = " ";
          commentChars[i] = " ";
        } else if (next === "'") {
          i++;
          codeChars[i] = "'";
          codeNoStringsChars[i] = " ";
          commentChars[i] = " ";
        } else if (next === "\n") {
          // Line continuation
        } else if (i + 1 < len) {
          i++;
          codeChars[i] = text[i];
          codeNoStringsChars[i] = " ";
          commentChars[i] = " ";
        }
      } else if (ch === "'") {
        codeChars[i] = "'";
        codeNoStringsChars[i] = "'";
        commentChars[i] = " ";
        state = S_NORMAL;
      } else {
        codeChars[i] = ch;
        codeNoStringsChars[i] = " ";
        commentChars[i] = " ";
      }
    } else if (state === S_STRING_BACKTICK) {
      if (ch === "\\") {
        codeChars[i] = "\\";
        codeNoStringsChars[i] = " ";
        commentChars[i] = " ";
        if (next === "\\") {
          i++;
          codeChars[i] = "\\";
          codeNoStringsChars[i] = " ";
          commentChars[i] = " ";
        } else if (next === "`") {
          i++;
          codeChars[i] = "`";
          codeNoStringsChars[i] = " ";
          commentChars[i] = " ";
        } else if (next === "\n") {
          // Line continuation
        } else if (i + 1 < len) {
          i++;
          codeChars[i] = text[i];
          codeNoStringsChars[i] = " ";
          commentChars[i] = " ";
        }
      } else if (ch === "`") {
        codeChars[i] = "`";
        codeNoStringsChars[i] = "`";
        commentChars[i] = " ";
        state = S_NORMAL;
      } else {
        codeChars[i] = ch;
        codeNoStringsChars[i] = " ";
        commentChars[i] = " ";
      }
    } else if (state === S_PY_TRIPLE_DOUBLE) {
      if (ch === '"' && text.slice(i, i + 3) === '"""') {
        codeChars[i] = '"'; codeChars[i + 1] = '"'; codeChars[i + 2] = '"';
        codeNoStringsChars[i] = '"'; codeNoStringsChars[i + 1] = '"'; codeNoStringsChars[i + 2] = '"';
        commentChars[i] = " "; commentChars[i + 1] = " "; commentChars[i + 2] = " ";
        i += 2;
        state = S_NORMAL;
      } else {
        codeChars[i] = ch;
        codeNoStringsChars[i] = " ";
        commentChars[i] = " ";
      }
    } else if (state === S_PY_TRIPLE_SINGLE) {
      if (ch === "'" && text.slice(i, i + 3) === "'''") {
        codeChars[i] = "'"; codeChars[i + 1] = "'"; codeChars[i + 2] = "'";
        codeNoStringsChars[i] = "'"; codeNoStringsChars[i + 1] = "'"; codeNoStringsChars[i + 2] = "'";
        commentChars[i] = " "; commentChars[i + 1] = " "; commentChars[i + 2] = " ";
        i += 2;
        state = S_NORMAL;
      } else {
        codeChars[i] = ch;
        codeNoStringsChars[i] = " ";
        commentChars[i] = " ";
      }
    }
  }

  const rawLines = text.split("\n");
  const codeLines = codeChars.join("").split("\n");
  const codeNoStringsLines = codeNoStringsChars.join("").split("\n");
  const commentLines = commentChars.join("").split("\n");

  const isDesync = state !== S_NORMAL;

  return { rawLines, codeLines, codeNoStringsLines, commentLines, commentBlocks, desync: isDesync };
}

function isScannable(filename: string): boolean {
  const ext = extname(filename).toLowerCase();
  if (SOURCE_EXT.has(ext)) return true;
  const base = filename.toLowerCase();
  if (/^dockerfile(\.[a-z0-9_-]+)?$/i.test(base)) return true;
  if (/^\.env(\.[a-z0-9_-]+)?$/i.test(base) && !base.endsWith(".example")) return true;
  return false;
}

function walk(dir: string, rootDir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const rel = relative(rootDir, full).replace(/\\/g, "/");

    // Skip ignored directory trees, but do NOT skip .astesia/plugins
    if (SKIP_DIRS.has(entry)) continue;
    if (rel === ".astesia/audit" || rel.startsWith(".astesia/audit/") ||
        rel === ".astesia/verification" || rel.startsWith(".astesia/verification/")) {
      continue;
    }

    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, rootDir, out);
    } else if (isScannable(entry)) {
      out.push(full);
    }
  }
  return out;
}

function checkSuppression(
  prep: PreprocessedFile,
  idx: number,
  ruleId: string,
  state: GateState
): boolean {
  const isBanned = ruleId === "ASTESIA-000" || ruleId === "ASTESIA-004";
  const checkIndices = [idx];
  if (idx > 0) checkIndices.push(idx - 1);

  for (const i of checkIndices) {
    const commentText = prep.commentLines[i];
    if (!commentText || !commentText.trim()) continue;

    const match = /(?:\/\/|#|\*)\s*astesia-allow:\s*([A-Za-z0-9_-]+)(?:\s*--\s*(.*))?$/.exec(commentText.trim());
    if (!match) continue;

    const targetRule = match[1];
    if (targetRule !== ruleId) continue;

    const reason = match[2] ? match[2].trim() : "";

    if (isBanned) {
      state.rejectedSuppressions++;
      return false;
    }

    if (reason.length >= 15) {
      state.suppressions++;
      return true;
    } else {
      state.rejectedSuppressions++;
      return false;
    }
  }

  // Check if idx is the first code line after a block comment ends
  for (const b of prep.commentBlocks) {
    let firstCodeIdx = b.endLine; // b.endLine is 1-based, index b.endLine is line b.endLine + 1
    while (firstCodeIdx < prep.codeLines.length && !prep.codeLines[firstCodeIdx].trim()) {
      firstCodeIdx++;
    }
    if (idx === firstCodeIdx) {
      const blockLines = b.text.split("\n");
      for (const bLine of blockLines) {
        const match = /(?:\/\/|#|\*)\s*astesia-allow:\s*([A-Za-z0-9_-]+)(?:\s*--\s*(.*))?$/.exec(bLine.trim());
        if (!match) continue;

        const targetRule = match[1];
        if (targetRule !== ruleId) continue;

        const reason = match[2] ? match[2].trim() : "";

        if (isBanned) {
          state.rejectedSuppressions++;
          return false;
        }

        if (reason.length >= 15) {
          state.suppressions++;
          return true;
        } else {
          state.rejectedSuppressions++;
          return false;
        }
      }
    }
  }

  return false;
}

function checkLineRegex(
  rule: LineRegexRule,
  rel: string,
  prep: PreprocessedFile,
  out: Violation[],
  state: GateState
) {
  if (rule.pathRegex && !new RegExp(rule.pathRegex, "i").test(rel)) return;
  if (rule.excludeRegex && new RegExp(rule.excludeRegex, "i").test(rel)) return;

  const scope = rule.scope || "code";
  let targetLines: string[];

  if (scope === "comment") {
    targetLines = prep.commentLines;
  } else {
    // Syntax-only rules run on codeNoStringsLines to eliminate string false positives
    if (["ASTESIA-005", "ASTESIA-006", "ASTESIA-009"].includes(rule.id)) {
      targetLines = prep.codeNoStringsLines;
    } else {
      targetLines = prep.codeLines;
    }
  }

  const flags = rule.flags || "";
  const re = new RegExp(rule.pattern, flags);

  // Special handler for ASTESIA-003: multi-line block comments and empty clauses
  if (rule.id === "ASTESIA-003") {
    for (let i = 0; i < prep.commentLines.length; i++) {
      const line = prep.commentLines[i];
      if (!line.includes("astesia-debt:")) continue;

      const block = prep.commentBlocks.find(
        (b) => b.startLine <= i + 1 && i + 1 <= b.endLine
      );

      if (block) {
        const debtIdx = block.text.indexOf("astesia-debt:");
        const textAfter = block.text.slice(debtIdx);
        const hasValidDebt = /astesia-debt:\s*\S+(?:(?!upgrade:).)*upgrade:\s*\S+/s.test(textAfter);
        if (!hasValidDebt && !checkSuppression(prep, i, rule.id, state)) {
          out.push({
            ruleId: rule.id,
            severity: rule.severity,
            file: rel,
            line: i + 1,
            message: rule.description,
            fix: rule.fix
          });
        }
      } else {
        const hasValidDebt = /astesia-debt:\s*\S+.*?[,\s]+upgrade:\s*\S+/.test(line);
        if (!hasValidDebt && !checkSuppression(prep, i, rule.id, state)) {
          out.push({
            ruleId: rule.id,
            severity: rule.severity,
            file: rel,
            line: i + 1,
            message: rule.description,
            fix: rule.fix
          });
        }
      }
    }
    return;
  }

  // Special handler for ASTESIA-004: Decision Table for hardcoded secret detection
  if (rule.id === "ASTESIA-004") {
    const KNOWN_PREFIX = /^(?:sk_live_|sk_test_|ghp_|gho_|AKIA|xox[abp]-|eyJ)/;
    const SENSITIVE_KEY_RE = /(?:api[_-]?key|[a-zA-Z0-9_]*key|[a-zA-Z0-9_]*secret|[a-zA-Z0-9_]*passw(?:or)?d|[a-zA-Z0-9_]*token|[a-zA-Z0-9_]*auth)/i;
    const SUFFIX_KEY_RE = /(?:label|placeholder|field|text|name|type)$/i;

    for (let i = 0; i < targetLines.length; i++) {
      const line = targetLines[i];
      if (!line.trim()) continue;

      // Extract candidate assignment: key = "val", key: "val", or process.env.X ?? "val"
      const assignMatch = /(?:([a-zA-Z0-9_$]+)\s*[:=]|process\.env\.[a-zA-Z0-9_]+\s*(?:\?\?|\|\|))\s*['"`]([^'"`\r\n]{12,})['"`]/i.exec(line);

      let key = "";
      let val = "";
      let isCandidate = false;

      if (assignMatch) {
        key = assignMatch[1] || "env_fallback";
        val = assignMatch[2];
        if (SENSITIVE_KEY_RE.test(key) || key === "env_fallback" || KNOWN_PREFIX.test(val)) {
          isCandidate = true;
        }
      } else {
        // Standalone known prefix string on line
        const prefixMatch = /['"`]((?:sk_live_|sk_test_|ghp_|gho_|AKIA|xox[abp]-|eyJ)[^'"`\r\n]{8,})['"`]/.exec(line);
        if (prefixMatch) {
          key = "prefix_token";
          val = prefixMatch[1];
          isCandidate = true;
        }
      }

      if (!isCandidate) continue;

      let isSecret = false;

      // 1. Always Trigger on known high-confidence secret prefixes
      if (KNOWN_PREFIX.test(val)) {
        isSecret = true;
      } else {
        // 2. E1 (Value exception, any key):
        // Value contains space, OR is purely alphabetic PascalCase with >= 2 capital segments -> NOT secret
        const hasSpace = val.includes(" ");
        const isPascalCase = /^[A-Z][a-z]+(?:[A-Z][a-z]+)+$/.test(val);

        if (hasSpace || isPascalCase) {
          isSecret = false;
        } else {
          // 3. E2 (Key suffix exception: Label|Placeholder|Field|Text|Name|Type)
          const isSuffix = SUFFIX_KEY_RE.test(key);

          if (isSuffix) {
            // Applies ONLY if value consists of letters, _, - only, no secret prefix, and NOT unbroken lowercase >= 12
            const lettersUnderscoreHyphenOnly = /^[A-Za-z_-]+$/.test(val);
            const isUnbrokenLowercase = /^[a-z]{12,}$/.test(val);

            if (lettersUnderscoreHyphenOnly && !isUnbrokenLowercase) {
              isSecret = false;
            } else {
              // Contains digits, symbols, or is unbroken lowercase >= 12 -> triggers!
              isSecret = true;
            }
          } else {
            // 4. Sensitive keys not ending in label suffixes:
            // Triggers if without spaces contains digits or symbols
            const hasDigitsOrSymbols = /[^A-Za-z]/.test(val);
            // OR unbroken lowercase string >= 12 on password/secret/token/apikey
            const isUnbrokenLowercase = /^[a-z]{12,}$/.test(val);
            const isDirectSecretKey = /(?:password|secret|token|apikey|api_key)/i.test(key);

            if (hasDigitsOrSymbols || (isUnbrokenLowercase && isDirectSecretKey)) {
              isSecret = true;
            }
          }
        }
      }

      if (isSecret && !checkSuppression(prep, i, rule.id, state)) {
        out.push({
          ruleId: rule.id,
          severity: rule.severity,
          file: rel,
          line: i + 1,
          message: rule.description,
          fix: rule.fix
        });
      }
    }
    return;
  }

  // General line regex scanning
  for (let i = 0; i < targetLines.length; i++) {
    const text = targetLines[i];
    let matched = re.test(text);

    // Multiline check for ASTESIA-002: SELECT followed by * on subsequent line
    if (!matched && rule.id === "ASTESIA-002" && /\bselect\s*$/i.test(text)) {
      for (let j = i + 1; j < Math.min(i + 5, targetLines.length); j++) {
        const nextTrim = targetLines[j].trim();
        if (!nextTrim) continue;
        if (/^(\*|[a-zA-Z0-9_]+\.\*)/.test(nextTrim)) {
          matched = true;
        }
        break;
      }
    }

    if (matched && !checkSuppression(prep, i, rule.id, state)) {
      out.push({
        ruleId: rule.id,
        severity: rule.severity,
        file: rel,
        line: i + 1,
        message: rule.description,
        fix: rule.fix
      });
    }
  }
}

function checkRelativeImports(
  rule: RelativeImportRule,
  root: string,
  abs: string,
  rel: string,
  prep: PreprocessedFile,
  out: Violation[],
  state: GateState
) {
  const ext = extname(abs);
  if (![".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".svelte", ".vue"].includes(ext)) {
    return;
  }

  const importRe = /(?:from|import|require)\s*(?:\(\s*|\s+)['"](\.{1,2}\/[^'"]+|@[^'"]+)['"]/;

  prep.codeLines.forEach((text, i) => {
    const m = importRe.exec(text);
    if (!m) return;
    const specifier = m[1];

    let targetBase: string;
    if (specifier.startsWith("./") || specifier.startsWith("../")) {
      targetBase = resolve(dirname(abs), specifier);
    } else if (specifier.startsWith("@/")) {
      targetBase = resolve(root, "src", specifier.slice(2));
    } else {
      // Scoped npm package (e.g. @prisma/client), not a local alias
      return;
    }

    if (checkSuppression(prep, i, rule.id, state)) return;

    const candidates = RESOLVE_EXT.flatMap((e) => [
      targetBase + e,
      targetBase.replace(/\.js$/, "") + e
    ]);

    // Also check root/specifier fallback for @/ if root/src/ does not exist
    if (specifier.startsWith("@/")) {
      const altBase = resolve(root, specifier.slice(2));
      RESOLVE_EXT.forEach((e) => {
        candidates.push(altBase + e);
        candidates.push(altBase.replace(/\.js$/, "") + e);
      });
    }

    const exists = candidates.some((c) => existsSync(c) && statSync(c).isFile());
    if (!exists) {
      out.push({
        ruleId: rule.id,
        severity: rule.severity,
        file: rel,
        line: i + 1,
        message: `${rule.description} (${specifier})`,
        fix: rule.fix
      });
    }
  });
}

function checkNestedLoopCall(
  rule: NestedLoopCallRule,
  rel: string,
  prep: PreprocessedFile,
  out: Violation[],
  state: GateState
) {
  if (rule.pathRegex && !new RegExp(rule.pathRegex, "i").test(rel)) return;
  if (rule.excludeRegex && new RegExp(rule.excludeRegex, "i").test(rel)) return;

  const loopRe = new RegExp(rule.loopPattern, rule.flags || "");
  const callRe = new RegExp(rule.callPattern, rule.flags || "");
  const isPython = rel.endsWith(".py");

  const lines = prep.codeLines;
  let inLoop = false;
  let loopDepth = 0;
  let loopStartLine = 0;
  let pythonLoopIndent = -1;

  for (let i = 0; i < lines.length; i++) {
    const text = lines[i];

    if (isPython) {
      if (!inLoop) {
        if (loopRe.test(text)) {
          const indent = text.search(/\S/);
          if (indent !== -1) {
            inLoop = true;
            pythonLoopIndent = indent;
            loopStartLine = i + 1;
            if (callRe.test(text) && !checkSuppression(prep, i, rule.id, state)) {
              out.push({
                ruleId: rule.id,
                severity: rule.severity,
                file: rel,
                line: i + 1,
                message: `${rule.description} (loop started L${loopStartLine})`,
                fix: rule.fix
              });
            }
          }
        }
      } else {
        const indent = text.search(/\S/);
        if (indent !== -1) {
          if (indent <= pythonLoopIndent) {
            inLoop = false;
            pythonLoopIndent = -1;
            // Check if this line starts a new loop
            if (loopRe.test(text)) {
              inLoop = true;
              pythonLoopIndent = indent;
              loopStartLine = i + 1;
            }
          } else {
            if (callRe.test(text) && !checkSuppression(prep, i, rule.id, state)) {
              out.push({
                ruleId: rule.id,
                severity: rule.severity,
                file: rel,
                line: i + 1,
                message: `${rule.description} (enclosed by loop L${loopStartLine})`,
                fix: rule.fix
              });
            }
          }
        }
      }
      continue;
    }

    // JS/TS/Go/PHP loop handling
    if (!inLoop) {
      if (loopRe.test(text)) {
        inLoop = true;
        loopStartLine = i + 1;

        const opens = (text.match(/{/g) || []).length;
        const closes = (text.match(/}/g) || []).length;
        loopDepth = opens - closes;

        if (callRe.test(text) && !checkSuppression(prep, i, rule.id, state)) {
          out.push({
            ruleId: rule.id,
            severity: rule.severity,
            file: rel,
            line: i + 1,
            message: `${rule.description} (loop started L${loopStartLine})`,
            fix: rule.fix
          });
        }

        // Handle single-line or braceless callbacks: .map(...) or .forEach(...)
        if (/\.(map|forEach)\s*\(/.test(text) && !text.includes("{")) {
          const pOpen = (text.match(/\(/g) || []).length;
          const pClose = (text.match(/\)/g) || []).length;
          if (pOpen <= pClose) {
            inLoop = false;
            loopDepth = 0;
          }
        } else if (loopDepth <= 0 && text.includes("{")) {
          inLoop = false;
        }
      }
    } else {
      const opens = (text.match(/{/g) || []).length;
      const closes = (text.match(/}/g) || []).length;
      loopDepth += opens - closes;

      if (callRe.test(text) && !checkSuppression(prep, i, rule.id, state)) {
        out.push({
          ruleId: rule.id,
          severity: rule.severity,
          file: rel,
          line: i + 1,
          message: `${rule.description} (enclosed by loop L${loopStartLine})`,
          fix: rule.fix
        });
      }

      if (loopDepth <= 0) {
        inLoop = false;
        loopDepth = 0;
      }
    }
  }
}

function main() {
  const { flags, opts } = parseArgs();
  const root = resolve(opts.get("root") || ".");
  const rulesPath = resolve(root, opts.get("rules") || "templates/enforcement/anti-patterns.json");

  let maxWarn = Infinity;
  if (opts.has("max-warn")) {
    const raw = opts.get("max-warn")!;
    if (raw === "" || !/^\d+$/.test(raw)) {
      console.error("[TOOL_FAILED: invalid --max-warn]");
      process.exit(2);
    }
    maxWarn = parseInt(raw, 10);
    if (isNaN(maxWarn) || maxWarn < 0) {
      console.error("[TOOL_FAILED: invalid --max-warn]");
      process.exit(2);
    }
  }

  if (!existsSync(rulesPath)) {
    console.error(`[TOOL_FAILED: rules registry not found at ${rulesPath}]`);
    process.exit(2);
  }

  let rawRulesContent = readFileSync(rulesPath, "utf8");
  if (rawRulesContent.charCodeAt(0) === 0xfeff) {
    rawRulesContent = rawRulesContent.slice(1);
  }

  let parsedRegistry: { rules?: Rule[] };
  try {
    parsedRegistry = JSON.parse(rawRulesContent);
  } catch (err) {
    console.error(`[TOOL_FAILED: failed to parse rules registry JSON: ${err}]`);
    process.exit(2);
  }

  if (!parsedRegistry || !Array.isArray(parsedRegistry.rules)) {
    console.error(`[TOOL_FAILED: rules registry missing 'rules' array]`);
    process.exit(2);
  }

  const validKinds = new Set(["line-regex", "relative-import-exists", "nested-loop-call"]);
  for (const r of parsedRegistry.rules) {
    if (!validKinds.has(r.kind)) {
      console.error(`[TOOL_FAILED: rule ${r.id} has unknown kind '${r.kind}']`);
      process.exit(2);
    }
    if (typeof r.fix !== "string" || r.fix.trim().length === 0) {
      console.error(`[TOOL_FAILED: rule ${r.id} is missing a non-empty 'fix' message]`);
      process.exit(2);
    }
  }

  const rules = parsedRegistry.rules;
  const violations: Violation[] = [];
  const desyncFiles: string[] = [];
  const gateState: GateState = {
    suppressions: 0,
    rejectedSuppressions: 0,
    debtMarkers: 0
  };

  const files = walk(root, root);
  for (const abs of files) {
    const rel = relative(root, abs).replace(/\\/g, "/");
    const rawContent = readFileSync(abs, "utf8");
    const prep = preprocessSource(rawContent, abs);

    if (prep.desync) {
      desyncFiles.push(rel);
      violations.push({
        ruleId: "TOKENIZER_DESYNC",
        severity: "warn",
        file: rel,
        line: prep.rawLines.length,
        message: "Tokenizer state desynchronization: unclosed string, template literal, or comment at EOF.",
        fix: "Ensure all strings, template literals, and comments are properly terminated."
      });
    }

    for (const line of prep.commentLines) {
      if (/(?:\/\/|#|\*)\s*astesia-debt:/i.test(line)) {
        gateState.debtMarkers++;
      }
    }

    for (const rule of rules) {
      if (rule.kind === "line-regex") {
        checkLineRegex(rule, rel, prep, violations, gateState);
      } else if (rule.kind === "relative-import-exists") {
        checkRelativeImports(rule, root, abs, rel, prep, violations, gateState);
      } else if (rule.kind === "nested-loop-call") {
        checkNestedLoopCall(rule, rel, prep, violations, gateState);
      }
    }
  }

  const errors = violations.filter((v) => v.severity === "error");
  const warns = violations.filter((v) => v.severity === "warn");

  if (flags.has("json")) {
    console.log(
      JSON.stringify(
        {
          errors: errors.length,
          warnings: warns.length,
          suppressions: gateState.suppressions,
          rejected_suppressions: gateState.rejectedSuppressions,
          debt_markers: gateState.debtMarkers,
          desync_files: desyncFiles,
          violations
        },
        null,
        2
      )
    );
  } else {
    for (const v of violations) {
      console.log(`[${v.severity.toUpperCase()}] ${v.ruleId} ${v.file}:${v.line}\n  ${v.message}\n  fix: ${v.fix}`);
    }
    console.log(
      `\nastesia-gate: ${errors.length} error(s), ${warns.length} warning(s), ${rules.length} rule(s) loaded (suppressions: ${gateState.suppressions}, rejected: ${gateState.rejectedSuppressions}, debt markers: ${gateState.debtMarkers}).`
    );
  }

  if (errors.length > 0) process.exit(1);
  if (warns.length > maxWarn) {
    console.error(`astesia-gate: warning ratchet exceeded (${warns.length} > ${maxWarn}).`);
    process.exit(1);
  }
}

main();
