import { readFileSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "../../../..");
const TEMP_BASE = join(process.env.TEMP || "C:/Temp", "astesia-real");
const SNAPSHOT_DIR = join(REPO_ROOT, ".astesia/audit/wave2a.5/snapshots");

const PROJECTS = [
  "pustaka-sekolah-pwa",
  "terminal-portfolio",
  "eunectes",
  "flora-smk",
  "ifrit",
  "arene",
  "SIA"
];

const HASH_COMMENT_EXTS = new Set([".py", ".sh", ".bash"]);
const SINGLE_LINE_QUOTE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go"]);
const MARKUP_EXTS = new Set([".svelte", ".vue"]);

export type DesyncCategory =
  | "regex_backtick"
  | "regex_block_comment"
  | "regex_quote"
  | "regex_slash_class"
  | "jsx_text_apostrophe"
  | "template_nested"
  | "minified_bundle"
  | "generated_header"
  | "php_markup"
  | "heredoc"
  | "python_other"
  | "other";

export function checkGeneratedCriteria(rawContent: string, relPath: string): {
  isGenerated: boolean;
  reasons: string[];
  maxLineLength: number;
} {
  let text = rawContent;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = text.split("\n");

  const norm = relPath.replace(/\\/g, "/");
  const base = norm.split("/").pop() || "";
  const reasons: string[] = [];

  if (/\.min\.(js|mjs|cjs|css)$/i.test(base)) {
    reasons.push("min_ext");
  }

  let maxLineLength = 0;
  for (const l of lines) {
    if (l.length > maxLineLength) maxLineLength = l.length;
  }
  if (maxLineLength >= 5000) {
    reasons.push(`line_ge_5000 (max=${maxLineLength})`);
  }

  const first10 = lines.slice(0, 10);
  for (let i = 0; i < first10.length; i++) {
    const l = first10[i];
    if (l.includes("@generated") || l.includes("DO NOT EDIT") || l.includes("Code generated")) {
      reasons.push(`header_marker_L${i + 1}`);
      break;
    }
  }

  return {
    isGenerated: reasons.length > 0,
    reasons,
    maxLineLength
  };
}

export function traceTokenizerDesync(rawContent: string, filename: string) {
  let text = rawContent;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rawLines = text.split("\n");

  const ext = extname(filename).toLowerCase();
  const isHashCommentLang = HASH_COMMENT_EXTS.has(ext);
  const isSingleLineQuoteLang = SINGLE_LINE_QUOTE_EXTS.has(ext);
  const isMarkupFile = MARKUP_EXTS.has(ext);
  const isPython = ext === ".py";

  const S_NORMAL = 0;
  const S_LINE_COMMENT = 1;
  const S_BLOCK_COMMENT = 2;
  const S_STRING_SINGLE = 3;
  const S_STRING_DOUBLE = 4;
  const S_STRING_BACKTICK = 5;
  const S_PY_TRIPLE_SINGLE = 6;
  const S_PY_TRIPLE_DOUBLE = 7;

  const stateNames: Record<number, string> = {
    0: "S_NORMAL",
    1: "S_LINE_COMMENT",
    2: "S_BLOCK_COMMENT",
    3: "S_STRING_SINGLE",
    4: "S_STRING_DOUBLE",
    5: "S_STRING_BACKTICK",
    6: "S_PY_TRIPLE_SINGLE",
    7: "S_PY_TRIPLE_DOUBLE"
  };

  let state = S_NORMAL;
  let currentLine = 1;
  let inScriptTag = false;
  let lastOpenLine = 1;
  let lastOpenToken = "";
  let lastOpenCol = 0;
  let lineStartIdx = 0;
  const transitions: Array<{ line: number; col: number; from: string; to: string; token: string; lineText: string }> = [];

  const len = text.length;
  for (let i = 0; i < len; i++) {
    const ch = text[i];
    const next = i + 1 < len ? text[i + 1] : "";

    if (ch === "\n") {
      currentLine++;
      lineStartIdx = i + 1;
      if (state === S_LINE_COMMENT) {
        state = S_NORMAL;
      } else if (state === S_STRING_SINGLE || state === S_STRING_DOUBLE) {
        const isSingleLineQuoteActive = isSingleLineQuoteLang || (isMarkupFile && inScriptTag);
        if (isSingleLineQuoteActive) {
          let backslashes = 0;
          let k = i - 1;
          while (k >= 0 && text[k] === "\\") {
            backslashes++;
            k--;
          }
          if (backslashes % 2 === 0) {
            state = S_NORMAL;
          }
        }
      }
      continue;
    }

    if (state === S_NORMAL) {
      if (isMarkupFile && ch === "<") {
        const slice7 = text.slice(i, i + 7).toLowerCase();
        const slice9 = text.slice(i, i + 9).toLowerCase();
        if (slice7 === "<script") inScriptTag = true;
        else if (slice9 === "</script>") inScriptTag = false;
      }

      if (isPython && ch === '"' && text.slice(i, i + 3) === '"""') {
        state = S_PY_TRIPLE_DOUBLE;
        lastOpenLine = currentLine;
        lastOpenCol = i - lineStartIdx + 1;
        lastOpenToken = '"""';
        transitions.push({ line: currentLine, col: lastOpenCol, from: "S_NORMAL", to: "S_PY_TRIPLE_DOUBLE", token: '"""', lineText: (rawLines[currentLine - 1] || "").trim().slice(0, 120) });
        i += 2;
      } else if (isPython && ch === "'" && text.slice(i, i + 3) === "'''") {
        state = S_PY_TRIPLE_SINGLE;
        lastOpenLine = currentLine;
        lastOpenCol = i - lineStartIdx + 1;
        lastOpenToken = "'''";
        transitions.push({ line: currentLine, col: lastOpenCol, from: "S_NORMAL", to: "S_PY_TRIPLE_SINGLE", token: "'''", lineText: (rawLines[currentLine - 1] || "").trim().slice(0, 120) });
        i += 2;
      } else if (ch === "/" && next === "/") {
        state = S_LINE_COMMENT;
        i++;
      } else if (ch === "/" && next === "*") {
        state = S_BLOCK_COMMENT;
        lastOpenLine = currentLine;
        lastOpenCol = i - lineStartIdx + 1;
        lastOpenToken = "/*";
        transitions.push({ line: currentLine, col: lastOpenCol, from: "S_NORMAL", to: "S_BLOCK_COMMENT", token: "/*", lineText: (rawLines[currentLine - 1] || "").trim().slice(0, 120) });
        i++;
      } else if (isHashCommentLang && ch === "#") {
        state = S_LINE_COMMENT;
      } else if (ch === '"') {
        state = S_STRING_DOUBLE;
        lastOpenLine = currentLine;
        lastOpenCol = i - lineStartIdx + 1;
        lastOpenToken = '"';
        transitions.push({ line: currentLine, col: lastOpenCol, from: "S_NORMAL", to: "S_STRING_DOUBLE", token: '"', lineText: (rawLines[currentLine - 1] || "").trim().slice(0, 120) });
      } else if (ch === "'") {
        state = S_STRING_SINGLE;
        lastOpenLine = currentLine;
        lastOpenCol = i - lineStartIdx + 1;
        lastOpenToken = "'";
        transitions.push({ line: currentLine, col: lastOpenCol, from: "S_NORMAL", to: "S_STRING_SINGLE", token: "'", lineText: (rawLines[currentLine - 1] || "").trim().slice(0, 120) });
      } else if (ch === "`") {
        state = S_STRING_BACKTICK;
        lastOpenLine = currentLine;
        lastOpenCol = i - lineStartIdx + 1;
        lastOpenToken = "`";
        transitions.push({ line: currentLine, col: lastOpenCol, from: "S_NORMAL", to: "S_STRING_BACKTICK", token: "`", lineText: (rawLines[currentLine - 1] || "").trim().slice(0, 120) });
      }
    } else if (state === S_BLOCK_COMMENT) {
      if (ch === "*" && next === "/") {
        i++;
        state = S_NORMAL;
      }
    } else if (state === S_STRING_DOUBLE) {
      if (ch === "\\") {
        if (next === "\n") {
          // line continuation
        } else if (i + 1 < len) {
          i++;
        }
      } else if (ch === '"') {
        state = S_NORMAL;
      }
    } else if (state === S_STRING_SINGLE) {
      if (ch === "\\") {
        if (next === "\n") {
          // line continuation
        } else if (i + 1 < len) {
          i++;
        }
      } else if (ch === "'") {
        state = S_NORMAL;
      }
    } else if (state === S_STRING_BACKTICK) {
      if (ch === "\\") {
        if (next === "\n") {
          // line continuation
        } else if (i + 1 < len) {
          i++;
        }
      } else if (ch === "`") {
        state = S_NORMAL;
      }
    } else if (state === S_PY_TRIPLE_DOUBLE) {
      if (ch === '"' && text.slice(i, i + 3) === '"""') {
        i += 2;
        state = S_NORMAL;
      }
    } else if (state === S_PY_TRIPLE_SINGLE) {
      if (ch === "'" && text.slice(i, i + 3) === "'''") {
        i += 2;
        state = S_NORMAL;
      }
    }
  }

  return {
    desync: state !== S_NORMAL,
    finalState: stateNames[state],
    lastOpenLine,
    lastOpenCol,
    lastOpenToken,
    lastOpenLineText: (rawLines[lastOpenLine - 1] || "").trim().slice(0, 120),
    firstTransitions: transitions.slice(0, 15),
    lastTransitions: transitions.slice(-10)
  };
}

import { readdirSync, statSync } from "node:fs";
import { relative } from "node:path";

const SOURCE_EXT = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".go", ".php", ".svelte", ".vue",
  ".yml", ".yaml", ".sh", ".bash"
]);

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next", ".nuxt",
  ".svelte-kit", "coverage", "vendor", "__pycache__", ".venv",
  "venv", "target", "out", ".turbo", ".cache", ".output"
]);

function isScannableA9(filename: string): boolean {
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

function walkScannable(dir: string, rootDir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const rel = relative(rootDir, full).replace(/\\/g, "/");
    if (
      rel === ".astesia/audit" ||
      rel.startsWith(".astesia/audit/") ||
      rel === ".astesia/verification" ||
      rel.startsWith(".astesia/verification/")
    ) {
      continue;
    }
    const st = statSync(full);
    if (st.isDirectory()) {
      walkScannable(full, rootDir, out);
    } else if (isScannableA9(entry)) {
      out.push(full);
    }
  }
  return out;
}

function classifyDesyncCategory(
  relPath: string,
  rawContent: string,
  trace: ReturnType<typeof traceTokenizerDesync>,
  genCheck: ReturnType<typeof checkGeneratedCriteria>
): { category: DesyncCategory; detail: string } {
  const lower = relPath.toLowerCase();
  if (lower.endsWith(".php") || lower.endsWith(".blade.php")) {
    return {
      category: "php_markup",
      detail: `Quote/apostrophe (${trace.lastOpenToken}) in HTML/Blade markup outside <?php ?> at line ${trace.lastOpenLine}`
    };
  }
  if (genCheck.reasons.some((r) => r.startsWith("min_ext") || r.startsWith("line_ge_5000"))) {
    return {
      category: "minified_bundle",
      detail: `Minified/bundled file (${genCheck.reasons.join(", ")}) desynced on ${trace.lastOpenToken} at line ${trace.lastOpenLine}`
    };
  }
  if (genCheck.reasons.some((r) => r.startsWith("header_marker"))) {
    return {
      category: "generated_header",
      detail: `Generated header file (${genCheck.reasons.join(", ")}) desynced on ${trace.lastOpenToken} at line ${trace.lastOpenLine}`
    };
  }

  // Inspect the line where state was last opened or first mis-synchronized
  const lineText = trace.lastOpenLineText;
  if (trace.lastOpenToken === "/*" && /\/[^/\n]*\/\*/.test(lineText)) {
    return {
      category: "regex_block_comment",
      detail: `Regex literal containing '/*' opened false block comment at line ${trace.lastOpenLine}`
    };
  }
  // Also check if an earlier transition on a regex line opened a backtick or quote or block comment
  for (const t of trace.lastTransitions) {
    if (t.token === "/*" && /\/.*\/\*/.test(t.lineText)) {
      return {
        category: "regex_block_comment",
        detail: `Regex literal containing '/*' opened false block comment at line ${t.line}`
      };
    }
    if (t.token === "`" && /\/[^/\n]*`[^/\n]*\//.test(t.lineText)) {
      return {
        category: "regex_backtick",
        detail: `Regex literal containing backtick (\`) opened false template literal at line ${t.line}`
      };
    }
  }
  if (trace.lastOpenToken === "`") {
    // Check if there is a regex with a backtick in the file that inverted backtick parity!
    const lines = rawContent.replace(/\r\n/g, "\n").split("\n");
    for (let idx = 0; idx < lines.length; idx++) {
      const l = lines[idx];
      const trimmed = l.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
      // Count unescaped backticks in regex literals on this line
      if (/\/[^/\n]*`[^/\n]*\/[gimsuy]*/.test(l)) {
        return {
          category: "regex_backtick",
          detail: `Regex literal containing backtick on line ${idx + 1} (${trimmed.slice(0, 80)}) inverted template literal parity, leaving open backtick at line ${trace.lastOpenLine}`
        };
      }
    }
    // Check if nested template literal ${ `...` } inverted parity
    for (let idx = 0; idx < lines.length; idx++) {
      const l = lines[idx];
      if (/\$\{[^}]*`/.test(l)) {
        return {
          category: "template_nested",
          detail: `Nested template literal inside \${...} on line ${idx + 1} (${l.trim().slice(0, 80)}) inverted backtick parity, leaving open backtick at line ${trace.lastOpenLine}`
        };
      }
    }
  }

  return {
    category: "other",
    detail: `Unclosed ${trace.lastOpenToken} (${trace.finalState}) at line ${trace.lastOpenLine}`
  };
}

if (import.meta.main) {
  const desyncInventory: any[] = [];
  const d3Results: Record<string, any> = {};
  const d4Inventory: any[] = [];

  for (const proj of PROJECTS) {
    const copyDir = join(TEMP_BASE, proj);
    const snapPath = join(SNAPSHOT_DIR, `d1-${proj}-a9e20cd.json`);
    const snap = JSON.parse(readFileSync(snapPath, "utf8"));

    // D2: Process every file in desync_files
    for (const rel of snap.desync_files || []) {
      const abs = join(copyDir, rel);
      const raw = readFileSync(abs, "utf8");
      const trace = traceTokenizerDesync(raw, abs);
      const genCheck = checkGeneratedCriteria(raw, rel);
      const { category, detail } = classifyDesyncCategory(rel, raw, trace, genCheck);
      desyncInventory.push({
        project: proj,
        path: rel,
        language: extname(rel).toLowerCase(),
        lastOpenLine: trace.lastOpenLine,
        lastOpenCol: trace.lastOpenCol,
        lastOpenToken: trace.lastOpenToken,
        finalState: trace.finalState,
        lastOpenLineText: trace.lastOpenLineText,
        isGeneratedCandidate: genCheck.isGenerated,
        generatedReasons: genCheck.reasons,
        category,
        detail
      });
    }

    // D3: Check all scannable files in copyDir for Decision 2 criteria
    const allScannable = walkScannable(copyDir, copyDir);
    const genFiles: any[] = [];
    for (const abs of allScannable) {
      const rel = relative(copyDir, abs).replace(/\\/g, "/");
      const raw = readFileSync(abs, "utf8");
      const genCheck = checkGeneratedCriteria(raw, rel);
      if (genCheck.isGenerated) {
        const fileViols = (snap.violations || []).filter((v: any) => v.file === rel);
        const byRule: Record<string, number> = {};
        for (const fv of fileViols) {
          byRule[fv.ruleId] = (byRule[fv.ruleId] || 0) + 1;
        }
        genFiles.push({
          file: rel,
          reasons: genCheck.reasons,
          maxLineLength: genCheck.maxLineLength,
          a9e20cdViolationsCount: fileViols.length,
          a9e20cdViolationsByRule: byRule
        });
      }
    }
    d3Results[proj] = {
      generatedFilesCount: genFiles.length,
      totalViolationsInGenerated: genFiles.reduce((acc, x) => acc + x.a9e20cdViolationsCount, 0),
      files: genFiles
    };

    // D4: All ASTESIA-004 findings
    const r004s = (snap.violations || []).filter((v: any) => v.ruleId === "ASTESIA-004");
    for (const v of r004s) {
      const abs = join(copyDir, v.file);
      const lines = readFileSync(abs, "utf8").replace(/\r\n/g, "\n").split("\n");
      const lineText = (lines[v.line - 1] || "").trim();
      const quote = lineText.slice(0, 120);

      let valueShape: "url_without_credentials" | "url_with_credentials" | "token" | "other" = "other";
      if (/['"`](?:https?|wss?|libsql|postgres(?:ql)?|mysql|mongodb(?:\+srv)?|rediss?|amqps?):\/\//i.test(lineText)) {
        if (/:\/\/[^/\s'"`]+:[^/\s'"`]+@/.test(lineText) || /[?&](?:token|key|secret|password|auth)=/i.test(lineText)) {
          valueShape = "url_with_credentials";
        } else {
          valueShape = "url_without_credentials";
        }
      } else if (/sk_live_|sk_test_|ghp_|gho_|AKIA|xox[abp]-|eyJ|Bearer\s+|Basic\s+/i.test(lineText)) {
        valueShape = "token";
      }

      d4Inventory.push({
        project: proj,
        file: v.file,
        line: v.line,
        valueShape,
        quote
      });
    }
  }

  // Build D2 histograms
  const byCategory: Record<string, number> = {};
  const byProject: Record<string, Record<string, number>> = {};
  for (const item of desyncInventory) {
    byCategory[item.category] = (byCategory[item.category] || 0) + 1;
    if (!byProject[item.project]) byProject[item.project] = {};
    byProject[item.project][item.category] = (byProject[item.project][item.category] || 0) + 1;
  }

  const syntheticReproducers: Record<string, string> = {
    regex_backtick: "const stripCode = (s: string) => s.replace(/`([^`]+)`/g, '$1');\nexport const x: any = 1;\n",
    regex_block_comment: "const globToRe = (s: string) => s.replace(/\\/\\*\\*/g, '.*');\nexport const x: any = 1;\n",
    minified_bundle: `// Simulated single-line bundle >= 5000 chars with regex /` + "`" + `/\nconst bundle = "${"a".repeat(5000)}" + /` + "`" + `/.source;\n`,
    php_markup: "<div>Welcome to Owner's Portal</div>\n<?php\n$q = \"SELECT * FROM users\";\n?>\n"
  };

  writeFileSync(join(SNAPSHOT_DIR, "d2-desync-inventory.json"), JSON.stringify({
    totalDesyncFiles: desyncInventory.length,
    byCategory,
    byProject,
    files: desyncInventory,
    syntheticReproducers
  }, null, 2), "utf8");

  writeFileSync(join(SNAPSHOT_DIR, "d3-generated-candidates.json"), JSON.stringify(d3Results, null, 2), "utf8");
  writeFileSync(join(SNAPSHOT_DIR, "d4-astesia004-inventory.json"), JSON.stringify({
    totalAstesia004: d4Inventory.length,
    findings: d4Inventory
  }, null, 2), "utf8");

  console.log("=== D2 DESYNC HISTOGRAM ===");
  console.log("Total desync files:", desyncInventory.length);
  console.log("By category:", byCategory);
  console.log("By project:", byProject);
  console.log("\n=== D3 GENERATED CANDIDATES ===");
  for (const [p, d] of Object.entries(d3Results)) {
    console.log(`  ${p}: ${d.generatedFilesCount} files (${d.totalViolationsInGenerated} violations in a9e20cd)`);
  }
  console.log("\n=== D4 ASTESIA-004 INVENTORY ===");
  console.log("Total ASTESIA-004 findings:", d4Inventory.length);
  for (const f of d4Inventory) {
    console.log(`  [${f.project}] ${f.file}:${f.line} (${f.valueShape}) -> ${f.quote}`);
  }
}
