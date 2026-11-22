/**
 * tools/report-lint.ts
 * Mechanical linter for Astesia audit and wave reports.
 *
 * Rules:
 * - RL-001: Forbids unsubstantiated hyperbolic words in prose (100%, mutlak, terverifikasi, verified, integritas penuh, tanpa menyisakan, sempurna, technical debt conclusion claims).
 * - RL-002: Enforces 7 exact mandatory report sections.
 * - RL-003: Enforces non-empty 'Hal yang Tidak Bisa atau Tidak Sempat Diuji' section containing UNVERIFIABLE.
 * - RL-004: Verifies all cited .astesia/audit/... files exist on disk.
 * - RL-005: Verifies all cited git commit hashes exist in git object database via git cat-file.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

export interface ReportViolation {
  code: "RL-001" | "RL-002" | "RL-003" | "RL-004" | "RL-005";
  file: string;
  line?: number;
  message: string;
}

export const REPO_ROOT = path.resolve(__dirname, "..");

export const MANDATORY_SECTIONS = [
  "Metadata",
  "Diagnosis",
  "Tugas",
  "Pengukuran",
  "Keputusan dan Asumsi",
  "Keterbatasan yang Diketahui",
  "Hal yang Tidak Bisa atau Tidak Sempat Diuji",
];

const FORBIDDEN_PROSE_TERMS = [
  { term: "100%", pattern: /\b100%/ },
  { term: "mutlak", pattern: /\bmutlak\b/i },
  { term: "terverifikasi", pattern: /\bterverifikasi\b/i },
  { term: "verified", pattern: /\bverified\b/i },
  { term: "integritas penuh", pattern: /\bintegritas\s+penuh\b/i },
  { term: "tanpa menyisakan", pattern: /\btanpa\s+menyisakan\b/i },
  { term: "sempurna", pattern: /\bsempurna\b/i },
  { term: "tanpa technical debt", pattern: /\b(?:tanpa|bebas|zero)\s+technical\s+debt\b/i },
];

export function lintReport(reportPath: string, rootDir = REPO_ROOT): ReportViolation[] {
  const violations: ReportViolation[] = [];
  const resolvedPath = path.isAbsolute(reportPath) ? reportPath : path.resolve(rootDir, reportPath);

  if (!fs.existsSync(resolvedPath)) {
    violations.push({
      code: "RL-004",
      file: reportPath,
      message: `Report file not found: ${resolvedPath}`,
    });
    return violations;
  }

  const rawContent = fs.readFileSync(resolvedPath, "utf8");
  const lines = rawContent.split(/\r?\n/);

  // 1. Separate code blocks from prose for RL-001
  let inCodeBlock = false;
  const proseLines: Array<{ lineNo: number; text: string }> = [];

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }

    if (!inCodeBlock) {
      proseLines.push({ lineNo: idx + 1, text: line });
    }
  }

  // RL-001: Check forbidden terms in prose lines
  for (const item of proseLines) {
    // Strip inline backticks for command outputs/identifiers
    const textWithoutCode = item.text.replace(/`[^`]+`/g, "");

    for (const fb of FORBIDDEN_PROSE_TERMS) {
      if (fb.pattern.test(textWithoutCode)) {
        violations.push({
          code: "RL-001",
          file: reportPath,
          line: item.lineNo,
          message: `Forbidden unsubstantiated word/claim in prose: '${fb.term}'`,
        });
      }
    }
  }

  // RL-002: Enforce 7 mandatory section headers
  for (const sec of MANDATORY_SECTIONS) {
    const secRegex = new RegExp(`^#{1,3}\\s+.*?\\b${sec.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "mi");
    if (!secRegex.test(rawContent)) {
      violations.push({
        code: "RL-002",
        file: reportPath,
        message: `Missing mandatory report section: '${sec}'`,
      });
    }
  }

  // RL-003: Check 'Hal yang Tidak Bisa atau Tidak Sempat Diuji' is non-empty and contains UNVERIFIABLE
  const headerIdx = rawContent.search(/^#{1,3}\s+.*?\bHal yang Tidak Bisa atau Tidak Sempat Diuji\b/mi);

  if (headerIdx === -1) {
    violations.push({
      code: "RL-003",
      file: reportPath,
      message: "Section 'Hal yang Tidak Bisa atau Tidak Sempat Diuji' could not be parsed",
    });
  } else {
    const afterHeader = rawContent.slice(headerIdx);
    const firstNewline = afterHeader.indexOf("\n");
    const bodyStart = firstNewline === -1 ? "" : afterHeader.slice(firstNewline + 1);
    const nextHeaderMatch = bodyStart.match(/^#{1,3}\s+/m);
    const secBody = (nextHeaderMatch && nextHeaderMatch.index !== undefined ? bodyStart.slice(0, nextHeaderMatch.index) : bodyStart).trim();

    if (secBody.length < 20 || /^(?:-|n\/a|none|\s*)$/i.test(secBody)) {
      violations.push({
        code: "RL-003",
        file: reportPath,
        message: "Section 'Hal yang Tidak Bisa atau Tidak Sempat Diuji' cannot be empty or trivial",
      });
    }
    if (!secBody.includes("UNVERIFIABLE")) {
      violations.push({
        code: "RL-003",
        file: reportPath,
        message: "Section 'Hal yang Tidak Bisa atau Tidak Sempat Diuji' must explicitly document items as 'UNVERIFIABLE'",
      });
    }
  }

  // RL-004: Verify cited audit file paths exist on disk
  const auditFileMatches = rawContent.matchAll(/\.astesia\/audit\/[a-zA-Z0-9_\-\./]+\.[a-zA-Z0-9]+/g);
  const seenFiles = new Set<string>();

  for (const m of auditFileMatches) {
    const relFile = m[0];
    if (seenFiles.has(relFile)) continue;
    seenFiles.add(relFile);

    const fullFilePath = path.resolve(rootDir, relFile);
    if (!fs.existsSync(fullFilePath)) {
      violations.push({
        code: "RL-004",
        file: reportPath,
        message: `Referenced audit artifact does not exist on disk: '${relFile}'`,
      });
    }
  }

  // RL-005: Verify cited commit hashes in backticks
  const commitHashMatches = rawContent.matchAll(/`([0-9a-f]{7,40})`/g);
  const seenHashes = new Set<string>();

  for (const m of commitHashMatches) {
    const hash = m[1];
    // Filter out obvious numbers like 1000000 or short numeric tokens
    if (/^\d+$/.test(hash)) continue;
    if (seenHashes.has(hash)) continue;
    seenHashes.add(hash);

    const gitDir = fs.existsSync(path.join(rootDir, ".git")) ? rootDir : REPO_ROOT;
    const res = spawnSync("git", ["cat-file", "-e", `${hash}^{commit}`], {
      cwd: gitDir,
      stdio: "pipe",
    });

    if (res.status !== 0) {
      violations.push({
        code: "RL-005",
        file: reportPath,
        message: `Cited commit hash '${hash}' does not exist in git object database`,
      });
    }
  }

  return violations;
}

// CLI entry point
if (import.meta.main || require.main === module) {
  const args = process.argv.slice(2);
  const targetReport = args[0] || ".astesia/audit/wave3c-report.md";

  console.log(`=== ASTESIA REPORT LINTER (tools/report-lint.ts) ===`);
  console.log(`Scanning report: ${targetReport}`);

  const violations = lintReport(targetReport);

  if (violations.length === 0) {
    console.log(`PASS: Report ${targetReport} passed all mechanical checks (0 violations).\n`);
    process.exit(0);
  } else {
    console.error(`\nFAIL: Found ${violations.length} report violation(s):`);
    for (const v of violations) {
      const lineStr = v.line ? `:${v.line}` : "";
      console.error(`  [${v.code}] ${v.file}${lineStr}: ${v.message}`);
    }
    console.error("");
    process.exit(1);
  }
}
