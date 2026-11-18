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
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

export type Severity = "error" | "warn";
export type RuleScope = "code" | "comment";

export interface LineRegexRule {
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

export interface RelativeImportRule {
  id: string;
  kind: "relative-import-exists";
  severity: Severity;
  description: string;
  fix: string;
  scope?: RuleScope;
  origin?: string;
}

export interface NestedLoopCallRule {
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

export type Rule = LineRegexRule | RelativeImportRule | NestedLoopCallRule;

export interface Violation {
  ruleId: string;
  severity: Severity;
  file: string;
  line: number;
  message: string;
  fix: string;
}

export interface GateConfigAllowEntry {
  rule: "ASTESIA-004" | "ASTESIA-010";
  path: string;
  match: string;
  reason: string;
}

export interface GateConfig {
  schema: 1;
  exclude?: Array<{ path: string; reason: string }>;
  allow?: GateConfigAllowEntry[];
}

export interface GateState {
  suppressions: number;
  rejectedSuppressions: number;
  debtMarkers: number;
  allowlistedCount: number;
  allowHits: Map<GateConfigAllowEntry, number>;
  envIgnoredSkipped: number;
  rule010?: Rule;
}

export interface PreprocessedFile {
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

export const NEVER_BASELINE = new Set(["ASTESIA-000", "ASTESIA-004", "ASTESIA-010"]);
export const NEVER_INLINE_SUPPRESS = new Set([
  "ASTESIA-000",
  "ASTESIA-004",
  "ASTESIA-010",
  "TOKENIZER_DESYNC",
  "LONG_LINE_SKIPPED"
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

const CONFIG_EXTS = new Set([".yml", ".yaml"]);
const HASH_COMMENT_EXTS = new Set([".py", ".sh", ".bash"]);
const SINGLE_LINE_QUOTE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go"]);
const MARKUP_EXTS = new Set([".svelte", ".vue"]);
const RELATIVE_IMPORT_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".svelte", ".vue"]);

export function profileFor(filePath: string): "config" | "code" {
  const norm = filePath.replace(/\\/g, "/");
  const base = (norm.split("/").pop() || "").toLowerCase();
  if (base.endsWith(".example") || base.endsWith(".template") || base.endsWith(".sample")) {
    return "code";
  }
  if (
    /^\.env(\..+)?$/.test(base) ||
    /^dockerfile(\..+)?$/.test(base) ||
    /\.dockerfile$/.test(base) ||
    /\.ya?ml$/.test(base)
  ) {
    return "config";
  }
  return "code";
}

export function preprocessSource(rawContent: string, filename: string): PreprocessedFile {
  let text = rawContent;
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const ext = extname(filename).toLowerCase();
  const lowerName = filename.toLowerCase();

  const isConfigFile = profileFor(filename) === "config";

  if (isConfigFile) {
    const rawLines = text.split("\n");
    const codeLines: string[] = [];
    const codeNoStringsLines: string[] = [];
    const commentLines: string[] = [];

    for (let l = 0; l < rawLines.length; l++) {
      const line = rawLines[l];
      let commentIdx = -1;
      let inQuote: string | null = null;
      let isEscaped = false;

      for (let j = 0; j < line.length; j++) {
        const ch = line[j];
        if (inQuote) {
          if (ch === "\\" && !isEscaped) {
            isEscaped = true;
            continue;
          }
          if (ch === inQuote && !isEscaped) {
            inQuote = null;
          }
          isEscaped = false;
        } else {
          if (ch === '"' || ch === "'") {
            // A quote begins if at index 0, or preceded by whitespace, =, :, or [
            if (j === 0 || /[\s=:(\[,]/.test(line[j - 1])) {
              inQuote = ch;
            }
          } else if (ch === "#") {
            if (j === 0 || /\s/.test(line[j - 1])) {
              commentIdx = j;
              break;
            }
          }
        }
      }
      if (commentIdx !== -1) {
        const codePart = line.slice(0, commentIdx);
        const pad = " ".repeat(line.length - commentIdx);
        const cLine = codePart + pad;
        codeLines.push(cLine);
        codeNoStringsLines.push(cLine);
        commentLines.push(" ".repeat(commentIdx) + line.slice(commentIdx));
      } else {
        codeLines.push(line);
        codeNoStringsLines.push(line);
        commentLines.push(" ".repeat(line.length));
      }
    }
    return {
      rawLines,
      codeLines,
      codeNoStringsLines,
      commentLines,
      commentBlocks: [],
      desync: false
    };
  }

  const isHashCommentLang = HASH_COMMENT_EXTS.has(ext);
  const isSingleLineQuoteLang = SINGLE_LINE_QUOTE_EXTS.has(ext);
  const isMarkupFile = MARKUP_EXTS.has(ext);
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
  const norm = filename.replace(/\\/g, "/");
  const base = (norm.split("/").pop() || "").toLowerCase();
  if (base.endsWith(".example") || base.endsWith(".template") || base.endsWith(".sample")) return false;
  const ext = extname(base).toLowerCase();
  if (SOURCE_EXT.has(ext)) return true;
  if (/^dockerfile(\.[a-z0-9_-]+)?$/i.test(base)) return true;
  if (/\.dockerfile$/i.test(base)) return true;
  if (/^\.env(\.[a-z0-9_-]+)?$/i.test(base)) return true;
  return false;
}

function countScannable(dir: string): number {
  let count = 0;
  try {
    for (const entry of readdirSync(dir)) {
      if (SKIP_DIRS.has(entry)) continue;
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        count += countScannable(full);
      } else if (isScannable(entry)) {
        count++;
      }
    }
  } catch {}
  return count;
}

function walk(
  dir: string,
  rootDir: string,
  excludes: string[],
  excludedFilesState: { count: number },
  out: string[] = []
): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const rel = relative(rootDir, full).replace(/\\/g, "/");

    // Skip ignored directory trees, but do NOT skip .astesia/plugins
    if (SKIP_DIRS.has(entry)) continue;
    if (
      rel === ".astesia/audit" ||
      rel.startsWith(".astesia/audit/") ||
      rel === ".astesia/verification" ||
      rel.startsWith(".astesia/verification/")
    ) {
      continue;
    }

    // Check config exclusions
    const isExcluded = excludes.some((excl) => rel === excl || rel.startsWith(excl + "/"));
    if (isExcluded) {
      const st = statSync(full);
      if (st.isDirectory()) {
        excludedFilesState.count += countScannable(full);
      } else if (isScannable(entry)) {
        excludedFilesState.count++;
      }
      continue;
    }

    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, rootDir, excludes, excludedFilesState, out);
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
  const isBanned = NEVER_INLINE_SUPPRESS.has(ruleId);
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

function checkAllowlist(
  rel: string,
  ruleId: string,
  lineText: string,
  allowEntries: GateConfigAllowEntry[],
  state: GateState
): boolean {
  if (ruleId !== "ASTESIA-004" && ruleId !== "ASTESIA-010") return false;
  for (const entry of allowEntries) {
    if (entry.rule === ruleId && entry.path === rel && lineText.includes(entry.match)) {
      state.allowlistedCount++;
      state.allowHits.set(entry, (state.allowHits.get(entry) || 0) + 1);
      return true;
    }
  }
  return false;
}

export function tokenizeKey(key: string): string[] {
  if (!key) return [];
  const rawParts = key.split(/[_\-.:\s]+/);
  const tokens: string[] = [];

  for (const part of rawParts) {
    if (!part) continue;
    const subParts = part
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
      .replace(/([a-zA-Z])([0-9])/g, "$1 $2")
      .replace(/([0-9])([a-zA-Z])/g, "$1 $2")
      .split(/\s+/);
    for (const sp of subParts) {
      if (sp) tokens.push(sp.toLowerCase());
    }
  }
  return tokens;
}

const SENSITIVE_KEY_QUALIFIERS = new Set([
  "api", "private", "secret", "auth", "signing", "encryption",
  "master", "license", "ssh", "ssl", "access", "client"
]);

const NON_SENSITIVE_KEY_QUALIFIERS = new Set([
  "storage", "cache", "query", "sort", "primary", "foreign",
  "routing", "partition", "document", "translation", "i18n",
  "index", "filter", "menu", "route", "view", "theme"
]);

export function isSensitiveKey(key: string): boolean {
  if (!key) return false;
  if (key === "env_fallback") return true;
  const tokens = tokenizeKey(key);
  if (tokens.length === 0) return false;

  // Standalone 'key' or 'auth' is never sensitive (VER3-001, VER4-003)
  if (tokens.length === 1 && (tokens[0] === "key" || tokens[0] === "auth")) {
    return false;
  }

  const tokenSet = new Set(tokens);

  // High-confidence sensitive tokens: exact token matching prevents substring collisions (e.g. author vs auth)
  const hasSecret = tokenSet.has("secret") || tokenSet.has("secrets");
  const hasPassword =
    tokenSet.has("password") ||
    tokenSet.has("passwords") ||
    tokenSet.has("passwd") ||
    tokenSet.has("pwd") ||
    tokenSet.has("pwds") ||
    tokenSet.has("passphrase") ||
    tokenSet.has("passphrases") ||
    tokenSet.has("pass") ||
    tokenSet.has("passes");
  const hasToken = tokenSet.has("token") || tokenSet.has("tokens");
  const hasCredential = tokenSet.has("credential") || tokenSet.has("credentials");
  const hasAuthorization = tokenSet.has("authorization");

  // Definite sensitive compound word (e.g. "apikey", "secretkey", "dbpasswd")
  if (tokens.length === 1) {
    const single = tokens[0];
    if (single === "apikey" || single === "privkey" || single === "secretkey" || single === "passkey") {
      return true;
    }
  }

  // Non-sensitive qualifier override: if the key has storage/cache/query/etc. and no secret/password/token/credential/auth
  for (const nsq of NON_SENSITIVE_KEY_QUALIFIERS) {
    if (tokenSet.has(nsq) && !hasSecret && !hasPassword && !hasToken && !hasCredential && !hasAuthorization) {
      return false;
    }
  }

  if (hasSecret || hasPassword || hasToken || hasCredential || hasAuthorization) {
    return true;
  }

  // If the key contains 'key', check whether it is qualified by a sensitive term
  if (tokenSet.has("key")) {
    for (const sq of SENSITIVE_KEY_QUALIFIERS) {
      if (tokenSet.has(sq)) {
        return true;
      }
    }
    return false;
  }

  return false;
}

export function isAuthBearerOrBasic(val: string): boolean {
  if (typeof val !== "string") return false;
  const trimmed = val.trim();

  // Basic <base64>
  const basicMatch = /^Basic\s+([A-Za-z0-9+/=]{8,})$/i.exec(trimmed);
  if (basicMatch) {
    const raw = basicMatch[1];
    try {
      const decoded = Buffer.from(raw, "base64").toString("utf8");
      const colonIdx = decoded.indexOf(":");
      if (colonIdx > 0 && colonIdx < decoded.length - 1) {
        return true;
      }
    } catch {
      // not valid base64
    }
  }

  // Bearer <token>
  const bearerMatch = /^Bearer\s+(\S+)$/i.exec(trimmed);
  if (bearerMatch) {
    const token = bearerMatch[1];
    // Shape A: JWT (2 or 3 dot-separated base64url segments)
    const isJwt = /^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}(?:\.[A-Za-z0-9_-]*)?$/.test(token);
    if (isJwt) return true;

    // Shape B: Opaque token (>= 20 chars, contains both letters and digits, only valid token chars)
    if (token.length >= 20 && /^[A-Za-z0-9._-]+$/.test(token)) {
      const hasLetter = /[A-Za-z]/.test(token);
      const hasDigit = /[0-9]/.test(token);
      if (hasLetter && hasDigit) {
        return true;
      }
    }
  }

  return false;
}

const REGEX_CACHE = new Map<string, RegExp>();
function getCachedRegex(pattern: string, flags?: string): RegExp {
  const key = `${flags || ""}:${pattern}`;
  let re = REGEX_CACHE.get(key);
  if (!re) {
    re = new RegExp(pattern, flags);
    REGEX_CACHE.set(key, re);
  }
  return re;
}

const SYNTAX_ONLY_RULES = new Set(["ASTESIA-005", "ASTESIA-006", "ASTESIA-009"]);

const HELM_KEYNAME_PREV = new Set([
  "password", "passwd", "pwd", "passphrase", "token", "credential", "credentials"
]);

export function isHelmKeyName(key: string, val: string): boolean {
  const tokens = tokenizeKey(key);
  if (tokens.length >= 2 && tokens[tokens.length - 1] === "key") {
    const prevToken = tokens[tokens.length - 2];
    if (HELM_KEYNAME_PREV.has(prevToken)) {
      return /^[a-z][a-z._-]{0,39}$/.test(val);
    }
  }
  return false;
}

export function checkConfigSecret(
  line: string,
  prevKey?: string
): { isSecret: boolean; key: string; val: string } {
  let cleanLine = line.trim();
  if (!cleanLine || cleanLine.startsWith("#")) return { isSecret: false, key: "", val: "" };
  if (cleanLine.startsWith("ENV ") || cleanLine.startsWith("ARG ")) cleanLine = cleanLine.slice(4).trim();
  if (cleanLine.startsWith("- ")) cleanLine = cleanLine.slice(2).trim();

  let key = "";
  let val = "";

  const m = /^([a-zA-Z0-9_$.-]+)\s*[:=]\s*(.*)$/.exec(cleanLine);
  if (m) {
    key = (prevKey && m[1].toLowerCase() === "value") ? prevKey : m[1];
    val = m[2];
  } else if (prevKey && /^value:\s*(.*)$/i.test(cleanLine)) {
    key = prevKey;
    val = cleanLine.replace(/^value:\s*/i, "");
  } else {
    return { isSecret: false, key: "", val: "" };
  }

  val = val.trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1).trim();
  }

  // 1. Known prefix anywhere in value (e.g. sk_live_, ghp_, AKIA, etc.) or auth bearer/basic
  if (/(?:sk_live_|sk_test_|ghp_|gho_|AKIA|xox[abp]-|eyJ)[a-zA-Z0-9_.-]{8,}/.test(val) || isAuthBearerOrBasic(val)) {
    return { isSecret: true, key, val };
  }

  // 2. Interpolation with fallback: ${VAR:-fallback} or ${VAR-fallback}
  const fallbackMatch = /^\$\{[A-Za-z0-9_]+:?-(.+)\}$/.exec(val);
  if (fallbackMatch) {
    val = fallbackMatch[1].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1).trim();
    }
  } else if (
    /^\$[A-Za-z_]\w*$/.test(val) ||
    /^\$\{[^}]+\}$/.test(val) ||
    /^\$\{\{.*\}\}$/.test(val) ||
    /^\{\{.*\}\}$/.test(val)
  ) {
    return { isSecret: false, key, val };
  }

  // 3. Paths
  if (val.startsWith("/") || val.startsWith("./") || val.startsWith("../") || val.startsWith("~/") || /^[A-Za-z]:[\\/]/.test(val)) {
    return { isSecret: false, key, val };
  }

  // 4. Object mapping literal: e.g. {name: db, key: password}
  if (val.startsWith("{") && val.endsWith("}")) {
    return { isSecret: false, key, val };
  }

  // 5. Length check: literal secrets must be >= 8 chars
  if (val.length < 8) {
    return { isSecret: false, key, val };
  }

  // 6. Suffix / reference key exclusion
  if (key.toLowerCase().startsWith("existing")) {
    return { isSecret: false, key, val };
  }
  if (/(?:name|ref|file|path|url|id|type|label|field|text|placeholder)$/i.test(key)) {
    const isUnbrokenLowercase = /^[a-z]{12,}$/.test(val);
    if (!isUnbrokenLowercase) {
      return { isSecret: false, key, val };
    }
  }

  // 6b. Helm Key Name rule (Decision 4 / VER5-002)
  if (isHelmKeyName(key, val)) {
    return { isSecret: false, key, val };
  }

  // 7. Sensitive key check (E1 disabled: spaces and PascalCase do NOT exempt)
  const tokens = tokenizeKey(key);
  const tokenSet = new Set(tokens);
  const hasPassToken = tokenSet.has("pass") || tokenSet.has("passes");
  if (isSensitiveKey(key) || hasPassToken) {
    return { isSecret: true, key, val };
  }

  return { isSecret: false, key, val };
}

function checkLineRegex(
  rule: LineRegexRule,
  rel: string,
  prep: PreprocessedFile,
  out: Violation[],
  state: GateState,
  allowEntries: GateConfigAllowEntry[] = []
) {
  if (rule.pathRegex && !getCachedRegex(rule.pathRegex, "i").test(rel)) return;
  if (rule.excludeRegex && getCachedRegex(rule.excludeRegex, "i").test(rel)) return;

  const scope = rule.scope || "code";
  let targetLines: string[];

  if (scope === "comment") {
    targetLines = prep.commentLines;
  } else {
    // Syntax-only rules run on codeNoStringsLines to eliminate string false positives
    if (SYNTAX_ONLY_RULES.has(rule.id)) {
      targetLines = prep.codeNoStringsLines;
    } else {
      targetLines = prep.codeLines;
    }
  }

  const flags = rule.flags || "";
  const re = getCachedRegex(rule.pattern, flags);

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

  // Special handler for ASTESIA-010: Configuration and compose secret detection
  if (rule.id === "ASTESIA-010") {
    if (rule.pathRegex && !getCachedRegex(rule.pathRegex, "i").test(rel)) return;
    if (rule.excludeRegex && getCachedRegex(rule.excludeRegex, "i").test(rel)) return;

    const isConfig = profileFor(rel) === "config";
    if (isConfig) {
      let prevKey = "";
      for (let i = 0; i < prep.rawLines.length; i++) {
        const rawLine = prep.rawLines[i];
        const codeLine = prep.codeLines[i] || "";
        if (!codeLine.trim()) continue;

        const res = checkConfigSecret(codeLine, prevKey);
        if (/- name:\s*([A-Za-z0-9_]+)/.test(codeLine)) {
          prevKey = /- name:\s*([A-Za-z0-9_]+)/.exec(codeLine)![1];
        } else if (codeLine.trim()) {
          prevKey = "";
        }

        if (res.isSecret) {
          if (checkAllowlist(rel, rule.id, rawLine, allowEntries, state)) {
            continue;
          }
          if (!checkSuppression(prep, i, rule.id, state)) {
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

    // If a custom ASTESIA-010 rule without pathRegex is applied to code files
    for (let i = 0; i < targetLines.length; i++) {
      const line = targetLines[i];
      if (re.test(line)) {
        if (checkAllowlist(rel, rule.id, prep.rawLines[i], allowEntries, state)) {
          continue;
        }
        if (!checkSuppression(prep, i, rule.id, state)) {
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
    const isConfigFile = profileFor(rel) === "config";
    if (isConfigFile) {
      if (state.rule010 && (!state.rule010.pathRegex || getCachedRegex(state.rule010.pathRegex, "i").test(rel))) {
        return; // ASTESIA-010 will scan this config file
      }

      let prevKey = "";
      for (let i = 0; i < prep.rawLines.length; i++) {
        const rawLine = prep.rawLines[i];
        const codeLine = prep.codeLines[i] || "";
        if (!codeLine.trim()) continue;

        const res = checkConfigSecret(codeLine, prevKey);
        if (/- name:\s*([A-Za-z0-9_]+)/.test(codeLine)) {
          prevKey = /- name:\s*([A-Za-z0-9_]+)/.exec(codeLine)![1];
        } else if (codeLine.trim()) {
          prevKey = "";
        }

        if (res.isSecret) {
          if (checkAllowlist(rel, rule.id, rawLine, allowEntries, state)) {
            continue;
          }
          if (!checkSuppression(prep, i, rule.id, state)) {
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

    const KNOWN_PREFIX = /^(?:sk_live_|sk_test_|ghp_|gho_|AKIA|xox[abp]-|eyJ)/;
    const SUFFIX_KEY_RE = /(?:label|placeholder|field|text|name|type)$/i;

    for (let i = 0; i < targetLines.length; i++) {
      const line = targetLines[i];
      if (!line.trim()) continue;

      // Quick linear pre-check: string literal secrets always require quotes
      const hasQuote = line.includes("'") || line.includes('"') || line.includes("\x60");
      if (!hasQuote) continue;

      // Extract candidate assignment: key = "val", key: "val", or process.env.X ?? "val"
      // Linearized with lookbehind (?<![\w$]) to prevent quadratic backtracking ReDoS (VER3-007a)
      const assignMatch = /(?:(?<![\w$])([a-zA-Z0-9_$]+)\s*[:=]|(?<![\w$])process\.env\.[a-zA-Z0-9_]+\s*(?:\?\?|\|\|))\s*['"\x60]([^'"\x60\r\n]{12,})['"\x60]/i.exec(line);

      let key = "";
      let val = "";
      let isCandidate = false;

      if (assignMatch) {
        key = assignMatch[1] || "env_fallback";
        val = assignMatch[2];
        if (isSensitiveKey(key) || KNOWN_PREFIX.test(val) || isAuthBearerOrBasic(val)) {
          isCandidate = true;
        }
      } else {
        // Standalone known prefix string on line
        const prefixMatch = /['"\x60]((?:sk_live_|sk_test_|ghp_|gho_|AKIA|xox[abp]-|eyJ)[^'"\x60\r\n]{8,})['"\x60]/.exec(line);
        if (prefixMatch) {
          key = "token";
          val = prefixMatch[1];
          isCandidate = true;
        }
      }

      // If not yet a candidate, scan all string literals on the line for Basic/Bearer auth or known prefixes
      if (!isCandidate) {
        const strRegex = /['"\x60]([^'"\x60\r\n]{12,})['"\x60]/g;
        let sm: RegExpExecArray | null;
        while ((sm = strRegex.exec(line)) !== null) {
          if (isAuthBearerOrBasic(sm[1]) || KNOWN_PREFIX.test(sm[1])) {
            key = "auth_header";
            val = sm[1];
            isCandidate = true;
            break;
          }
        }
      }

      if (!isCandidate) continue;

      let isSecret = false;

      // 1. Always Trigger on known high-confidence secret prefixes or auth bearer/basic
      if (KNOWN_PREFIX.test(val) || isAuthBearerOrBasic(val)) {
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
            // MIME types like application/json on *Type keys are not secrets
            const lettersUnderscoreHyphenOnly = /^[A-Za-z_-]+$/.test(val);
            const isMimeType = /^[a-zA-Z0-9_+.-]+\/[a-zA-Z0-9_+.-]+$/.test(val);
            const isUnbrokenLowercase = /^[a-z]{12,}$/.test(val);

            if ((lettersUnderscoreHyphenOnly || (isMimeType && /(?:type|format)$/i.test(key))) && !isUnbrokenLowercase) {
              isSecret = false;
            } else {
              // Contains digits, symbols, or is unbroken lowercase >= 12 -> triggers!
              isSecret = true;
            }
          } else {
            // 4. Sensitive keys not ending in label suffixes:
            // Triggers if without spaces contains digits or symbols
            const hasDigitsOrSymbols = /[^A-Za-z]/.test(val);
            // OR unbroken lowercase string >= 12 on password/secret/token/apikey/pwd/passphrase
            const isUnbrokenLowercase = /^[a-z]{12,}$/.test(val);
            const isDirectSecretKey = /(?:password|passwords|passwd|pwd|passphrase|pass|secret|token|apikey|api_key)/i.test(key);

            if (hasDigitsOrSymbols || (isUnbrokenLowercase && isDirectSecretKey)) {
              isSecret = true;
            }
          }

          if (isHelmKeyName(key, val)) {
            isSecret = false;
          }
        }
      }

      if (isSecret) {
        if (checkAllowlist(rel, rule.id, prep.rawLines[i], allowEntries, state)) {
          continue;
        }
        if (!checkSuppression(prep, i, rule.id, state)) {
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

    if (matched) {
      if (checkAllowlist(rel, rule.id, prep.rawLines[i], allowEntries, state)) {
        continue;
      }
      if (!checkSuppression(prep, i, rule.id, state)) {
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
  if (!RELATIVE_IMPORT_EXTS.has(ext)) {
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
  const isPython = extname(rel).toLowerCase() === ".py";

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

function loadConfig(
  root: string,
  explicitPath?: string
): { excludedPaths: string[]; allowEntries: GateConfigAllowEntry[]; configFound: boolean } {
  let targetPath = explicitPath ? resolve(root, explicitPath) : join(root, ".astesia/gate-config.json");
  if (!existsSync(targetPath)) {
    if (explicitPath) {
      console.error(`[TOOL_FAILED: config file not found: ${targetPath}]`);
      process.exit(2);
    }
    return { excludedPaths: [], allowEntries: [], configFound: false };
  }

  let raw = readFileSync(targetPath, "utf8");
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  let parsed: GateConfig | null = null;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error(`[TOOL_FAILED: invalid JSON in config file: ${targetPath}]`);
    process.exit(2);
  }

  if (!parsed || typeof parsed !== "object" || parsed.schema !== 1) {
    console.error(`[TOOL_FAILED: invalid config schema in ${targetPath} (schema must be 1)]`);
    process.exit(2);
  }

  const excludedPaths: string[] = [];
  if (parsed.exclude !== undefined) {
    if (!Array.isArray(parsed.exclude)) {
      console.error(`[TOOL_FAILED: 'exclude' in config must be an array]`);
      process.exit(2);
    }
    for (const item of parsed.exclude) {
      if (!item || typeof item !== "object") {
        console.error(`[TOOL_FAILED: invalid exclude entry in config]`);
        process.exit(2);
      }
      if (typeof item.path !== "string" || item.path.trim().length === 0) {
        console.error(`[TOOL_FAILED: exclude entry path must be non-empty]`);
        process.exit(2);
      }
      if (typeof item.reason !== "string" || item.reason.trim().length < 15) {
        console.error(`[TOOL_FAILED: exclude entry reason must be at least 15 characters: '${item.reason || ""}']`);
        process.exit(2);
      }
      const rawPath = item.path.replace(/\\/g, "/").trim();
      if (rawPath.startsWith("/") || rawPath.includes("..") || /^[a-zA-Z]:/.test(rawPath)) {
        console.error(`[TOOL_FAILED: exclude path must be a clean relative POSIX path: ${item.path}]`);
        process.exit(2);
      }
      const normPath = rawPath.replace(/\/+$/, "");
      if (normPath === ".astesia/plugins" || normPath.startsWith(".astesia/plugins/")) {
        console.error(`[TOOL_FAILED: cannot exclude .astesia/plugins directory in config]`);
        process.exit(2);
      }
      excludedPaths.push(normPath);
    }
  }

  const allowEntries: GateConfigAllowEntry[] = [];
  if (parsed.allow !== undefined) {
    if (!Array.isArray(parsed.allow)) {
      console.error(`[TOOL_FAILED: 'allow' in config must be an array]`);
      process.exit(2);
    }
    for (const item of parsed.allow) {
      if (!item || typeof item !== "object") {
        console.error(`[TOOL_FAILED: invalid allow entry in config]`);
        process.exit(2);
      }
      if (item.rule !== "ASTESIA-004" && item.rule !== "ASTESIA-010") {
        console.error(`[TOOL_FAILED: allowlist only permitted for ASTESIA-004 and ASTESIA-010, found '${item.rule}']`);
        process.exit(2);
      }
      if (typeof item.path !== "string" || item.path.trim().length === 0) {
        console.error(`[TOOL_FAILED: allow entry path must be non-empty]`);
        process.exit(2);
      }
      const rawPath = item.path.replace(/\\/g, "/").trim();
      if (
        rawPath.startsWith("/") ||
        rawPath.includes("..") ||
        /^[a-zA-Z]:/.test(rawPath) ||
        rawPath.includes("*") ||
        rawPath.includes("?")
      ) {
        console.error(`[TOOL_FAILED: allow entry path must be a specific relative path without wildcards: '${item.path}']`);
        process.exit(2);
      }
      const normPath = rawPath.replace(/\/+$/, "");
      if (typeof item.match !== "string" || item.match.trim().length < 6) {
        console.error(`[TOOL_FAILED: allow entry match must be at least 6 characters: '${item.match || ""}']`);
        process.exit(2);
      }
      if (typeof item.reason !== "string" || item.reason.trim().length < 15) {
        console.error(`[TOOL_FAILED: allow entry reason must be at least 15 characters: '${item.reason || ""}']`);
        process.exit(2);
      }
      allowEntries.push({
        rule: item.rule,
        path: normPath,
        match: item.match,
        reason: item.reason
      });
    }
  }

  return { excludedPaths, allowEntries, configFound: true };
}

function handleRulesDiff(basePath: string, headPath: string): number {
  if (!existsSync(basePath)) {
    console.error(`[TOOL_FAILED: rules file not found: ${basePath}]`);
    return 2;
  }
  if (!existsSync(headPath)) {
    console.error(`[TOOL_FAILED: rules file not found: ${headPath}]`);
    return 2;
  }
  let baseRaw = readFileSync(basePath, "utf8");
  let headRaw = readFileSync(headPath, "utf8");
  if (baseRaw.charCodeAt(0) === 0xfeff) baseRaw = baseRaw.slice(1);
  if (headRaw.charCodeAt(0) === 0xfeff) headRaw = headRaw.slice(1);
  let baseData: { rules?: Rule[] } | null = null;
  let headData: { rules?: Rule[] } | null = null;
  try {
    baseData = JSON.parse(baseRaw);
    headData = JSON.parse(headRaw);
  } catch (err) {
    console.error(`[TOOL_FAILED: invalid JSON in rules file for --rules-diff]`);
    return 2;
  }
  if (!Array.isArray(baseData?.rules) || !Array.isArray(headData?.rules)) {
    console.error(`[TOOL_FAILED: rules file missing 'rules' array for --rules-diff]`);
    return 2;
  }

  const baseRules = baseData.rules;
  const headRules = headData.rules;

  const headIds = new Set<string>();
  for (const r of headRules) {
    if (headIds.has(r.id)) {
      console.error(`[RULES_DIFF: duplicate rule ID '${r.id}' in head]`);
      return 1;
    }
    headIds.add(r.id);
  }

  const headMap = new Map<string, Rule>(headRules.map((r: Rule) => [r.id, r]));

  for (const br of baseRules) {
    const hr = headMap.get(br.id);
    if (!hr) {
      console.error(`[RULES_DIFF: rule ID '${br.id}' was removed in head]`);
      return 1;
    }
    if (br.severity === "error" && hr.severity !== "error") {
      console.error(`[RULES_DIFF: rule '${br.id}' severity lowered from '${br.severity}' to '${hr.severity}']`);
      return 1;
    }
    if (br.kind !== hr.kind) {
      console.error(`[RULES_DIFF: rule '${br.id}' kind changed from '${br.kind}' to '${hr.kind}']`);
      return 1;
    }
    if (br.scope !== hr.scope) {
      console.error(`[RULES_DIFF: rule '${br.id}' scope changed from '${br.scope}' to '${hr.scope}']`);
      return 1;
    }
    if (br.pattern !== hr.pattern) {
      process.stderr.write(`[RULES_DIFF: notice: pattern for rule '${br.id}' updated]\n`);
    }

    const baseExts = new Set(br.extensions || []);
    const headExts = new Set(hr.extensions || []);
    const removedExts = [...baseExts].filter((x) => !headExts.has(x));
    const addedExts = [...headExts].filter((x) => !baseExts.has(x));

    if (removedExts.length > 0) {
      console.error(
        `[RULES_DIFF: rule '${br.id}' narrowed extensions (removed: ${removedExts.join(", ")})]`
      );
      return 1;
    }
    if (addedExts.length > 0) {
      process.stderr.write(
        `[RULES_DIFF: notice: extensions for rule '${br.id}' broadened (added: ${addedExts.join(", ")})]\n`
      );
    }
  }

  for (const hr of headRules) {
    if (typeof hr.fix !== "string" || hr.fix.trim().length === 0) {
      console.error(`[RULES_DIFF: rule '${hr.id}' has missing or empty 'fix']`);
      return 1;
    }
    if (typeof hr.origin !== "string" || hr.origin.trim().length === 0) {
      console.error(`[RULES_DIFF: rule '${hr.id}' has missing or empty 'origin']`);
      return 1;
    }
  }

  const isIdentical = JSON.stringify(baseRules) === JSON.stringify(headRules);
  if (isIdentical) {
    process.stdout.write("rules-diff: compatible (rules identical).\n");
    return 0;
  }

  process.stdout.write("rules-diff: compatible (no weakenings detected).\n");
  return 0;
}

export function checkWorkflow(yamlContent: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // 1. Prohibit pull_request_target
  if (/pull_request_target/i.test(yamlContent)) {
    errors.push("Forbidden trigger 'pull_request_target' detected. Use 'pull_request' only.");
  }

  // 2. Enforce read-only permissions
  const permissionsMatch = yamlContent.match(/permissions:\s*([^\n]+|\n\s+[^\n]+)/);
  if (!permissionsMatch) {
    errors.push("Missing top-level or job-level permissions specification.");
  } else {
    const permBlock = permissionsMatch[0];
    if (/write/i.test(permBlock)) {
      errors.push("Write permissions detected. CI must have read-only permissions ('contents: read').");
    }
    if (!/contents:\s*read/i.test(permBlock)) {
      errors.push("Permissions must strictly specify 'contents: read'.");
    }
  }

  // 3. Verify all uses: are pinned to 40-character commit SHAs
  const usesRegex = /uses:\s*([^\s#]+)/g;
  let m: RegExpExecArray | null;
  while ((m = usesRegex.exec(yamlContent)) !== null) {
    const actionTarget = m[1];
    const atIdx = actionTarget.lastIndexOf("@");
    if (atIdx === -1) {
      errors.push(`Action '${actionTarget}' is unpinned (missing @commit-sha).`);
    } else {
      const pin = actionTarget.slice(atIdx + 1);
      if (!/^[0-9a-f]{40}$/i.test(pin)) {
        errors.push(`Action '${actionTarget}' is not pinned to a 40-character SHA ('${pin}').`);
      }
    }
  }

  // 4. Two checkouts (base into trusted, head into pr) with persist-credentials: false
  const hasTrustedCheckout = /path:\s*trusted/i.test(yamlContent) && /ref:\s*\${{\s*github\.event\.pull_request\.base\.sha\s*}}/i.test(yamlContent);
  const hasPrCheckout = /path:\s*pr/i.test(yamlContent) && /ref:\s*\${{\s*github\.event\.pull_request\.head\.sha\s*}}/i.test(yamlContent);
  const persistFalseCount = (yamlContent.match(/persist-credentials:\s*false/gi) || []).length;

  if (!hasTrustedCheckout) {
    errors.push("Missing trusted base checkout (expected path: trusted with base.sha).");
  }
  if (!hasPrCheckout) {
    errors.push("Missing PR code checkout (expected path: pr with head.sha).");
  }
  if (persistFalseCount < 2) {
    errors.push("Both checkouts must explicitly specify 'persist-credentials: false'.");
  }

  // 5. Prohibit continue-on-error
  if (/continue-on-error/i.test(yamlContent)) {
    errors.push("Forbidden 'continue-on-error' detected in CI workflow.");
  }

  // 6. Prohibit paths: and paths-ignore:
  if (/^\s*(paths|paths-ignore):/m.test(yamlContent)) {
    errors.push("Forbidden 'paths:' or 'paths-ignore:' filter detected in workflow trigger.");
  }

  // 7. Verify presence of --baseline and --rules-diff
  if (!yamlContent.includes("--rules-diff")) {
    errors.push("Missing '--rules-diff' check to detect rule registry weakenings.");
  }
  if (!yamlContent.includes("--baseline")) {
    errors.push("Missing '--baseline' enforcement argument.");
  }

  // 8. Prohibit --update-baseline in CI
  if (/--update-baseline/.test(yamlContent)) {
    errors.push("Forbidden '--update-baseline' flag detected in CI workflow script.");
  }

  // 9. VER3-006: Verify presence of workflow security guard verification step
  const hasGuardStep = yamlContent.includes("--check-workflow") || yamlContent.includes("workflow-guard.ts");
  if (!hasGuardStep) {
    errors.push("Missing workflow security guard verification step (--check-workflow).");
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export function handleCheckWorkflow(targetPath: string): number {
  if (!existsSync(targetPath)) {
    console.error(`[TOOL_FAILED: workflow file not found: ${targetPath}]`);
    return 2;
  }
  let content: string;
  try {
    content = readFileSync(targetPath, "utf8");
  } catch (err: unknown) {
    console.error(`[TOOL_FAILED: failed to read workflow file: ${err instanceof Error ? err.message : String(err)}]`);
    return 2;
  }
  const res = checkWorkflow(content);
  if (!res.valid) {
    for (const err of res.errors) {
      console.error(`[WORKFLOW_GUARD_ERROR: ${err}]`);
    }
    return 1;
  }
  process.stdout.write(`workflow-guard: valid (no security issues detected in ${targetPath}).\n`);
  return 0;
}

interface BaselineData {
  schema: number;
  violations: Record<string, Record<string, number>>;
  counters: {
    debt_markers: number;
    suppressions: number;
    files_excluded: number;
    desync_files: number;
    allowlisted?: number;
  };
  coverage: {
    files_scanned: number;
    min_ratio: number;
  };
  history: Array<{
    date: string;
    action: "init" | "tighten" | "raise";
    reason: string;
    diff: Record<string, unknown>;
  }>;
}

const VALID_RULE_IDS = new Set([
  "ASTESIA-000",
  "ASTESIA-001",
  "ASTESIA-002",
  "ASTESIA-003",
  "ASTESIA-004",
  "ASTESIA-005",
  "ASTESIA-006",
  "ASTESIA-007",
  "ASTESIA-008",
  "ASTESIA-009",
  "ASTESIA-010"
]);

function loadBaseline(baselinePath: string): BaselineData {
  if (!existsSync(baselinePath)) {
    console.error(`[TOOL_FAILED: baseline file not found: ${baselinePath}]`);
    process.exit(2);
  }
  const raw = readFileSync(baselinePath, "utf8");
  if (raw.charCodeAt(0) === 0xfeff) {
    console.error(`[TOOL_FAILED: baseline file contains BOM: ${baselinePath}]`);
    process.exit(2);
  }
  let parsed: (BaselineData & { version?: number }) | null = null;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error(`[TOOL_FAILED: invalid JSON in baseline file: ${baselinePath}]`);
    process.exit(2);
  }
  const hasVersionOrSchema = parsed && (parsed.schema === 1 || parsed.version === 1);
  if (!parsed || typeof parsed !== "object" || !hasVersionOrSchema || typeof parsed.violations !== "object") {
    console.error(`[TOOL_FAILED: invalid baseline schema or missing version in ${baselinePath}]`);
    process.exit(2);
  }

  const normViolations: Record<string, Record<string, number>> = {};
  for (const [rId, fileMap] of Object.entries(parsed.violations as Record<string, Record<string, number>>)) {
    if (!VALID_RULE_IDS.has(rId)) {
      console.error(`[TOOL_FAILED: unknown rule ID in baseline: ${rId}]`);
      process.exit(2);
    }
    normViolations[rId] = {};
    if (fileMap && typeof fileMap === "object") {
      for (const [fPath, cnt] of Object.entries(fileMap)) {
        const normP = fPath.replace(/\\/g, "/");
        if (normP.startsWith("../") || normP.startsWith("/") || normP.includes("/../")) {
          console.error(`[TOOL_FAILED: baseline path outside root: ${fPath}]`);
          process.exit(2);
        }
        normViolations[rId][normP] = Number(cnt) || 0;
      }
    }
  }
  parsed.violations = normViolations;
  return parsed;
}

export type SpawnSyncFn = (
  cmd: string,
  args: string[],
  opts?: Record<string, unknown>
) => { status: number | null; stdout: string | Buffer; stderr: string | Buffer };

export interface EnvClassification {
  ignoredUntracked: Set<string>;
  spawnCount: number;
}

export function classifyEnvFiles(
  root: string,
  relFiles: string[],
  customSpawn?: SpawnSyncFn
): EnvClassification {
  const spawn = customSpawn || spawnSync;
  let spawnCount = 0;
  const ignoredUntracked = new Set<string>();

  const candidates: string[] = [];
  for (const f of relFiles) {
    const norm = f.replace(/\\/g, "/");
    const base = norm.split("/").pop()!.toLowerCase();
    if (/^\.env(\..+)?$/.test(base)) {
      candidates.push(f);
    }
  }

  if (candidates.length === 0) {
    return { ignoredUntracked, spawnCount: 0 };
  }

  const tracked = new Set<string>();
  try {
    spawnCount++;
    const lsRes = spawn("git", ["-C", root, "ls-files", "-z", "--", ...candidates], {
      encoding: "utf8",
      stdio: "pipe"
    });
    if (lsRes.status !== 0) {
      return { ignoredUntracked, spawnCount };
    }
    if (lsRes.stdout) {
      const parts = String(lsRes.stdout).split("\0").filter(Boolean);
      for (const p of parts) {
        tracked.add(p.replace(/\\/g, "/"));
      }
    }
  } catch {
    return { ignoredUntracked, spawnCount };
  }

  const untrackedCandidates = candidates.filter((c) => !tracked.has(c.replace(/\\/g, "/")));
  if (untrackedCandidates.length === 0) {
    return { ignoredUntracked, spawnCount };
  }

  try {
    spawnCount++;
    const checkRes = spawn("git", ["-C", root, "check-ignore", "-z", "--stdin"], {
      encoding: "utf8",
      stdio: "pipe",
      input: untrackedCandidates.join("\0") + "\0"
    });
    if (checkRes.status === 0 && checkRes.stdout) {
      const parts = String(checkRes.stdout).split("\0").filter(Boolean);
      for (const p of parts) {
        ignoredUntracked.add(p.replace(/\\/g, "/"));
      }
    }
  } catch {
    // Fail-closed
  }

  return { ignoredUntracked, spawnCount };
}

function evaluateBaseline(
  baseline: BaselineData,
  violations: Violation[],
  counters: { debt_markers: number; suppressions: number; files_excluded: number; desync_files: number; allowlisted?: number },
  filesScannedTotal: number
) {
  const neverBaselineViolations = violations.filter((v) => NEVER_BASELINE.has(v.ruleId));
  const otherViolations = violations.filter((v) => !NEVER_BASELINE.has(v.ruleId));

  const currentCounts: Record<string, Record<string, number>> = {};
  for (const v of otherViolations) {
    if (!currentCounts[v.ruleId]) currentCounts[v.ruleId] = {};
    currentCounts[v.ruleId][v.file] = (currentCounts[v.ruleId][v.file] || 0) + 1;
  }

  const newViolations: Violation[] = [];
  let tightenable = false;

  for (const [rId, files] of Object.entries(currentCounts)) {
    for (const [fPath, count] of Object.entries(files)) {
      const baseCount = baseline.violations?.[rId]?.[fPath] || 0;
      if (count > baseCount) {
        const matching = otherViolations.filter((v) => v.ruleId === rId && v.file === fPath);
        const excess = matching.slice(baseCount);
        newViolations.push(...excess);
      } else if (count < baseCount) {
        tightenable = true;
      }
    }
  }

  for (const [rId, files] of Object.entries(baseline.violations || {})) {
    for (const [fPath, baseCount] of Object.entries(files)) {
      const curCount = currentCounts[rId]?.[fPath] || 0;
      if (curCount < baseCount) {
        tightenable = true;
      }
    }
  }

  const counterRegressions: string[] = [];
  if (counters.debt_markers > (baseline.counters?.debt_markers ?? 0)) {
    counterRegressions.push(`debt_markers increased (${counters.debt_markers} > ${baseline.counters?.debt_markers ?? 0})`);
  }
  if (counters.suppressions > (baseline.counters?.suppressions ?? 0)) {
    counterRegressions.push(`suppressions increased (${counters.suppressions} > ${baseline.counters?.suppressions ?? 0})`);
  }
  if (counters.files_excluded > (baseline.counters?.files_excluded ?? 0)) {
    counterRegressions.push(`files_excluded increased (${counters.files_excluded} > ${baseline.counters?.files_excluded ?? 0})`);
  }
  if (counters.desync_files > (baseline.counters?.desync_files ?? 0)) {
    counterRegressions.push(`desync_files increased (${counters.desync_files} > ${baseline.counters?.desync_files ?? 0})`);
  }
  if ((counters.allowlisted ?? 0) > (baseline.counters?.allowlisted ?? 0)) {
    counterRegressions.push(`allowlisted increased (${counters.allowlisted ?? 0} > ${baseline.counters?.allowlisted ?? 0})`);
  }

  const minRatio = baseline.coverage?.min_ratio ?? 0.9;
  const expectedMin = Math.ceil((baseline.coverage?.files_scanned ?? 0) * minRatio);
  const coverageDropped = filesScannedTotal < expectedMin;
  if (coverageDropped) {
    counterRegressions.push(`coverage drop: files_scanned (${filesScannedTotal}) < expected min (${expectedMin})`);
  }

  const isRegressed = newViolations.length > 0 || counterRegressions.length > 0;
  const status = isRegressed ? "regressed" : tightenable ? "tightenable" : "passed";

  return {
    status,
    isRegressed,
    newViolations,
    neverBaselineViolations,
    counterRegressions,
    tightenable,
    coverage: {
      files_scanned: filesScannedTotal,
      expected_min: expectedMin,
      ratio: filesScannedTotal / Math.max(1, baseline.coverage?.files_scanned || 1)
    }
  };
}

function updateBaseline(
  targetPath: string,
  violations: Violation[],
  counters: { debt_markers: number; suppressions: number; files_excluded: number; desync_files: number; allowlisted?: number },
  filesScannedTotal: number,
  allowRaise: boolean,
  reason: string
) {
  const neverBaselineViolations = violations.filter((v) => NEVER_BASELINE.has(v.ruleId));
  if (neverBaselineViolations.length > 0) {
    process.stderr.write(
      `[BASELINE_UPDATE_REJECTED: cannot baseline NEVER_BASELINE rules (${neverBaselineViolations.map((v) => v.ruleId).join(", ")})]\n`
    );
    process.exit(1);
  }

  const newViolationsMap: Record<string, Record<string, number>> = {};
  for (const v of violations) {
    if (!newViolationsMap[v.ruleId]) newViolationsMap[v.ruleId] = {};
    newViolationsMap[v.ruleId][v.file] = (newViolationsMap[v.ruleId][v.file] || 0) + 1;
  }

  let action: "init" | "tighten" | "raise" = "init";
  let history: BaselineData["history"] = [];
  let diff: Record<string, unknown> = {};

  if (!existsSync(targetPath)) {
    action = "init";
    history = [
      {
        date: new Date().toISOString(),
        action: "init",
        reason: reason.trim().length >= 15 ? reason : "initial baseline",
        diff: {}
      }
    ];
  } else {
    const oldBaseline = loadBaseline(targetPath);
    history = oldBaseline.history || [];

    let hasMetricIncrease = false;
    const diffDetails: {
      violations: Record<string, Record<string, { from: number; to: number }>>;
      counters: Record<string, { from: number; to: number }>;
    } = { violations: {}, counters: {} };

    for (const [rId, files] of Object.entries(newViolationsMap)) {
      for (const [fPath, count] of Object.entries(files)) {
        const oldCount = oldBaseline.violations?.[rId]?.[fPath] || 0;
        if (count > oldCount) {
          hasMetricIncrease = true;
          if (!diffDetails.violations[rId]) diffDetails.violations[rId] = {};
          diffDetails.violations[rId][fPath] = { from: oldCount, to: count };
        }
      }
    }
    if (counters.debt_markers > (oldBaseline.counters?.debt_markers ?? 0)) {
      hasMetricIncrease = true;
      diffDetails.counters.debt_markers = { from: oldBaseline.counters?.debt_markers ?? 0, to: counters.debt_markers };
    }
    if (counters.suppressions > (oldBaseline.counters?.suppressions ?? 0)) {
      hasMetricIncrease = true;
      diffDetails.counters.suppressions = { from: oldBaseline.counters?.suppressions ?? 0, to: counters.suppressions };
    }
    if (counters.files_excluded > (oldBaseline.counters?.files_excluded ?? 0)) {
      hasMetricIncrease = true;
      diffDetails.counters.files_excluded = { from: oldBaseline.counters?.files_excluded ?? 0, to: counters.files_excluded };
    }
    if (counters.desync_files > (oldBaseline.counters?.desync_files ?? 0)) {
      hasMetricIncrease = true;
      diffDetails.counters.desync_files = { from: oldBaseline.counters?.desync_files ?? 0, to: counters.desync_files };
    }
    if ((counters.allowlisted ?? 0) > (oldBaseline.counters?.allowlisted ?? 0)) {
      hasMetricIncrease = true;
      diffDetails.counters.allowlisted = { from: oldBaseline.counters?.allowlisted ?? 0, to: counters.allowlisted ?? 0 };
    }

    if (hasMetricIncrease) {
      if (!allowRaise) {
        process.stderr.write("[BASELINE_UPDATE_REJECTED: baseline metrics increased without --allow-raise]\n");
        process.exit(1);
      }
      if (reason.trim().length < 15) {
        process.stderr.write("[BASELINE_UPDATE_REJECTED: --reason must be at least 15 characters when raising baseline]\n");
        process.exit(1);
      }
      action = "raise";
    } else {
      action = "tighten";
    }
    diff = diffDetails;
    history.push({
      date: new Date().toISOString(),
      action,
      reason: reason.trim().length >= 15 ? reason : action === "tighten" ? "automatic ratchet tightening" : "manual raise",
      diff
    });
  }

  const sortedViolations: Record<string, Record<string, number>> = {};
  const sortedRuleIds = Object.keys(newViolationsMap).sort();
  for (const rId of sortedRuleIds) {
    sortedViolations[rId] = {};
    const sortedFiles = Object.keys(newViolationsMap[rId]).sort();
    for (const f of sortedFiles) {
      sortedViolations[rId][f] = newViolationsMap[rId][f];
    }
  }

  const baselineData: BaselineData = {
    schema: 1,
    violations: sortedViolations,
    counters: {
      debt_markers: counters.debt_markers,
      suppressions: counters.suppressions,
      files_excluded: counters.files_excluded,
      desync_files: counters.desync_files,
      allowlisted: counters.allowlisted ?? 0
    },
    coverage: {
      files_scanned: filesScannedTotal,
      min_ratio: 0.9
    },
    history
  };

  writeFileSync(targetPath, JSON.stringify(baselineData, null, 2) + "\n", "utf8");
  process.stdout.write(`astesia-gate: baseline updated (${action}).\n`);
  process.exit(0);
}

function main() {
  const args = process.argv.slice(2);
  const rulesDiffIdx = args.indexOf("--rules-diff");
  if (rulesDiffIdx !== -1) {
    const basePath = args[rulesDiffIdx + 1];
    const headPath = args[rulesDiffIdx + 2];
    if (!basePath || basePath.startsWith("--") || !headPath || headPath.startsWith("--")) {
      console.error("[TOOL_FAILED: --rules-diff requires two arguments: <base.json> <head.json>]");
      process.exit(2);
    }
    const code = handleRulesDiff(basePath, headPath);
    process.exit(code);
  }

  const checkWorkflowIdx = args.indexOf("--check-workflow");
  if (checkWorkflowIdx !== -1) {
    const targetPath = args[checkWorkflowIdx + 1];
    if (!targetPath || targetPath.startsWith("--")) {
      console.error("[TOOL_FAILED: --check-workflow requires one argument: <workflow.yml>]");
      process.exit(2);
    }
    const code = handleCheckWorkflow(targetPath);
    process.exit(code);
  }

  const { flags, opts } = parseArgs();
  const root = resolve(opts.get("root") || ".");

  if (!existsSync(root)) {
    console.error(`[TOOL_FAILED: root directory does not exist: ${root}]`);
    process.exit(2);
  }
  try {
    const st = statSync(root);
    if (!st.isDirectory()) {
      console.error(`[TOOL_FAILED: root path is not a directory: ${root}]`);
      process.exit(2);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[TOOL_FAILED: root directory error: ${msg}]`);
    process.exit(2);
  }

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
    debtMarkers: 0,
    allowlistedCount: 0,
    allowHits: new Map<GateConfigAllowEntry, number>(),
    envIgnoredSkipped: 0,
    rule010: rules.find((r) => r.id === "ASTESIA-010")
  };

  const { excludedPaths, allowEntries } = loadConfig(root, opts.get("config"));
  const excludedFilesState = { count: 0 };
  const allFiles = walk(root, root, excludedPaths, excludedFilesState);

  const relFileMap = new Map<string, string>();
  const relFiles: string[] = [];
  for (const abs of allFiles) {
    const rel = relative(root, abs).replace(/\\/g, "/");
    relFileMap.set(abs, rel);
    relFiles.push(rel);
  }

  const envClassification = classifyEnvFiles(root, relFiles);
  const files: string[] = [];
  for (const abs of allFiles) {
    const rel = relFileMap.get(abs)!;
    if (envClassification.ignoredUntracked.has(rel)) {
      gateState.envIgnoredSkipped++;
      continue;
    }
    files.push(abs);
  }

  const filesScanned = {
    total: files.length,
    by_extension: {} as Record<string, number>
  };
  for (const abs of files) {
    const ext = extname(abs).toLowerCase() || abs.toLowerCase();
    filesScanned.by_extension[ext] = (filesScanned.by_extension[ext] || 0) + 1;
  }

  for (const abs of files) {
    const rel = relFileMap.get(abs) || relative(root, abs).replace(/\\/g, "/");
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
      if (line.includes("astesia-debt:") && /(?:\/\/|#|\*)\s*astesia-debt:/i.test(line)) {
        gateState.debtMarkers++;
      }
    }

    for (const rule of rules) {
      if (rule.kind === "line-regex") {
        checkLineRegex(rule, rel, prep, violations, gateState, allowEntries);
      } else if (rule.kind === "relative-import-exists") {
        checkRelativeImports(rule, root, abs, rel, prep, violations, gateState);
      } else if (rule.kind === "nested-loop-call") {
        checkNestedLoopCall(rule, rel, prep, violations, gateState);
      }
    }
  }

  const counters = {
    debt_markers: gateState.debtMarkers,
    suppressions: gateState.suppressions,
    files_excluded: excludedFilesState.count,
    desync_files: desyncFiles.length,
    allowlisted: gateState.allowlistedCount
  };

  const staleAllowEntries: GateConfigAllowEntry[] = [];
  for (const entry of allowEntries) {
    if (!gateState.allowHits.has(entry) || (gateState.allowHits.get(entry) || 0) === 0) {
      staleAllowEntries.push(entry);
    }
  }

  // Handle --update-baseline
  if (flags.has("update-baseline") || opts.has("update-baseline")) {
    const bTarget = opts.has("baseline")
      ? resolve(root, opts.get("baseline")!)
      : opts.get("update-baseline") && opts.get("update-baseline") !== ""
      ? resolve(root, opts.get("update-baseline")!)
      : join(root, ".astesia/gate-baseline.json");
    const allowRaise = flags.has("allow-raise");
    const reason = opts.get("reason") || "";
    if (allowRaise) {
      if (!opts.has("reason") || !reason) {
        console.error("[TOOL_FAILED: --allow-raise requires --reason <text>]");
        process.exit(2);
      }
      if (reason.trim().length < 15) {
        console.error("[TOOL_FAILED: --reason must be at least 15 characters when using --allow-raise]");
        process.exit(2);
      }
    }
    updateBaseline(bTarget, violations, counters, filesScanned.total, allowRaise, reason);
    return;
  }

  // Handle --baseline
  let bEval: ReturnType<typeof evaluateBaseline> | null = null;
  if (opts.has("baseline")) {
    const bTarget = resolve(root, opts.get("baseline")!);
    const baselineData = loadBaseline(bTarget);
    bEval = evaluateBaseline(baselineData, violations, counters, filesScanned.total);
  }

  const errors = violations.filter((v) => v.severity === "error");
  const warns = violations.filter((v) => v.severity === "warn");

  if (flags.has("json")) {
    const jsonOut: Record<string, unknown> = {
      errors: errors.length,
      warnings: warns.length,
      suppressions: gateState.suppressions,
      rejected_suppressions: gateState.rejectedSuppressions,
      debt_markers: gateState.debtMarkers,
      allowlisted: gateState.allowlistedCount,
      allow_stale: staleAllowEntries,
      env_ignored_skipped: gateState.envIgnoredSkipped,
      files_scanned: filesScanned,
      files_excluded: excludedFilesState.count,
      excluded_paths: excludedPaths,
      desync_files: desyncFiles,
      violations
    };
    if (bEval) {
      jsonOut.baseline = {
        status: bEval.status,
        new_violations: bEval.newViolations,
        counter_regressions: bEval.counterRegressions,
        coverage: bEval.coverage,
        tightenable: bEval.tightenable
      };
    }
    process.stdout.write(JSON.stringify(jsonOut, null, 2) + "\n");
  } else {
    for (const v of violations) {
      process.stdout.write(`[${v.severity.toUpperCase()}] ${v.ruleId} ${v.file}:${v.line}\n  ${v.message}\n  fix: ${v.fix}\n`);
    }
    for (const stale of staleAllowEntries) {
      process.stdout.write(`astesia-gate: notice: stale allowlist entry for ${stale.rule} at ${stale.path} ('${stale.match}').\n`);
    }
    const extSummary = Object.entries(filesScanned.by_extension).map(([k, v]) => `${k}: ${v}`).join(", ");
    process.stdout.write(
      `\nastesia-gate: scanned ${filesScanned.total} file(s) (${extSummary || "none"}), ${excludedFilesState.count} excluded.\n`
    );
    process.stdout.write(
      `astesia-gate: ${errors.length} error(s), ${warns.length} warning(s), ${rules.length} rule(s) loaded (suppressions: ${gateState.suppressions}, rejected: ${gateState.rejectedSuppressions}, debt markers: ${gateState.debtMarkers}, allowlisted: ${gateState.allowlistedCount}, env skipped: ${gateState.envIgnoredSkipped}).\n`
    );
    if (bEval) {
      if (bEval.tightenable && !bEval.isRegressed) {
        process.stdout.write("astesia-gate: notice: baseline can be tightened (--update-baseline).\n");
      }
      for (const reg of bEval.counterRegressions) {
        process.stderr.write(`astesia-gate: baseline regression: ${reg}\n`);
      }
    }
  }

  if (bEval) {
    if (bEval.neverBaselineViolations.length > 0 || bEval.isRegressed) {
      process.exit(1);
    }
    const newWarns = bEval.newViolations.filter((v) => v.severity === "warn");
    if (newWarns.length > maxWarn) {
      process.stderr.write(`astesia-gate: warning ratchet exceeded (${newWarns.length} > ${maxWarn}).\n`);
      process.exit(1);
    }
    process.exit(0);
  }

  if (errors.length > 0) process.exit(1);
  if (warns.length > maxWarn) {
    process.stderr.write(`astesia-gate: warning ratchet exceeded (${warns.length} > ${maxWarn}).\n`);
    process.exit(1);
  }
}

if (import.meta.main) {
  try {
    main();
  } catch (err: unknown) {
    console.error(`[TOOL_FAILED: ${err instanceof Error ? err.message : String(err)}]`);
    process.exit(2);
  }
}
