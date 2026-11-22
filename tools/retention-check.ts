import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

export interface SectionRetention {
  file: string;
  heading: string;
  beforeNormative: number;
  afterNormative: number;
  lossPct: number;
  hasGateRef: boolean;
  uncompensatedLoss: boolean;
}

export interface RetentionReport {
  timestamp: string;
  base: string;
  head: string;
  total_sections: number;
  uncompensated_losses: number;
  fractional_headings: Array<{ file: string; heading: string }>;
  details: SectionRetention[];
}

const NORMATIVE_REGEX = /\b(WAJIB|DILARANG|HARUS|JANGAN|WAJIB\s+TIDAK|MUST|NEVER|SHALL)\b/i;
const GATE_REF_REGEX = /\b(ASTESIA-\d{3}|TOKENIZER_DESYNC|LONG_LINE_SKIPPED)\b/;
const FRACTIONAL_HEADING_REGEX = /^#{1,4}\s+\d+\.\d+/;

export function parseSections(content: string, filePath: string): Array<{ heading: string; normative: number; hasGate: boolean; raw: string }> {
  const lines = content.split("\n");
  const sections: Array<{ heading: string; normative: number; hasGate: boolean; raw: string }> = [];
  let currentHeading = "Preamble";
  let currentLines: string[] = [];

  function flush() {
    if (currentLines.length > 0) {
      const text = currentLines.join("\n");
      const sentences = text.split(/[.\n]+/).map((s) => s.trim()).filter(Boolean);
      const normativeCount = sentences.filter((s) => NORMATIVE_REGEX.test(s)).length;
      const hasGate = GATE_REF_REGEX.test(text);
      sections.push({
        heading: currentHeading,
        normative: normativeCount,
        hasGate,
        raw: text,
      });
    }
  }

  for (const line of lines) {
    const m = line.match(/^(#{1,4})\s+(.+)$/);
    if (m) {
      flush();
      currentHeading = m[2].trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }
  flush();

  return sections;
}

export function evaluateRetention(
  baseGetter: (file: string) => string,
  headGetter: (file: string) => string,
  files: string[],
  baseLabel = "BASE",
  headLabel = "HEAD"
): RetentionReport {
  const details: SectionRetention[] = [];
  const fractionalHeadings: Array<{ file: string; heading: string }> = [];
  let totalSections = 0;
  let uncompensatedCount = 0;

  for (const f of files) {
    let baseRaw = "";
    let headRaw = "";
    try {
      baseRaw = baseGetter(f);
    } catch {}
    try {
      headRaw = headGetter(f);
    } catch {}

    // Check new fractional headings in head not in base (specifically forbids #29.5 and new fractional numbers)
    const baseLines = baseRaw.split("\n");
    const baseFractionals = baseLines.filter((l) => FRACTIONAL_HEADING_REGEX.test(l)).map((l) => l.trim());
    const headLines = headRaw.split("\n");
    for (const hl of headLines) {
      if (FRACTIONAL_HEADING_REGEX.test(hl)) {
        const trimmed = hl.trim();
        if (!baseFractionals.includes(trimmed) || trimmed.includes("29.5")) {
          fractionalHeadings.push({ file: f, heading: trimmed });
        }
      }
    }

    const baseSections = parseSections(baseRaw, f);
    const headSections = parseSections(headRaw, f);
    const headMap = new Map(headSections.map((s) => [s.heading, s]));

    for (const bSec of baseSections) {
      totalSections++;
      const hSec = headMap.get(bSec.heading);
      const beforeCount = bSec.normative;
      const afterCount = hSec ? hSec.normative : 0;
      const hasGate = hSec ? hSec.hasGate : false;

      let lossPct = 0;
      if (beforeCount > 0) {
        lossPct = +(((beforeCount - afterCount) / beforeCount) * 100).toFixed(1);
      }

      const isUncompensated = beforeCount > 0 && lossPct >= 30.0 && !hasGate;
      if (isUncompensated) {
        uncompensatedCount++;
      }

      details.push({
        file: f,
        heading: bSec.heading,
        beforeNormative: beforeCount,
        afterNormative: afterCount,
        lossPct,
        hasGateRef: hasGate,
        uncompensatedLoss: isUncompensated,
      });
    }
  }

  return {
    timestamp: new Date().toISOString(),
    base: baseLabel,
    head: headLabel,
    total_sections: totalSections,
    uncompensated_losses: uncompensatedCount,
    fractional_headings: fractionalHeadings,
    details,
  };
}

// CLI entry point
if (import.meta.main || require.main === module) {
  const args = process.argv.slice(2);
  const isJson = args.includes("--json");
  const fixtureIdx = args.indexOf("--fixture");
  const baseIdx = args.indexOf("--base");
  const headIdx = args.indexOf("--head");

  const baseCommit = baseIdx !== -1 ? args[baseIdx + 1] : "d9a6e7d";
  const headCommit = headIdx !== -1 ? args[headIdx + 1] : "HEAD";

  const ruleFiles = [
    "rules/AGENTS.md",
    "rules/coding-standards.md",
    "rules/design-rules.md",
    "rules/devops-rules.md",
    "rules/engineering-rules.md",
    "rules/product-rules.md",
    "rules/quality-rules.md",
  ];

  let report: RetentionReport;

  if (fixtureIdx !== -1) {
    const dirA = args[fixtureIdx + 1];
    const dirB = args[fixtureIdx + 2];
    if (!dirA || !dirB) {
      console.error("Usage: bun tools/retention-check.ts --fixture <dirA> <dirB>");
      process.exit(2);
    }
    const filesInA = fs.readdirSync(dirA).filter((f) => f.endsWith(".md"));
    report = evaluateRetention(
      (f) => fs.readFileSync(path.join(dirA, f), "utf8"),
      (f) => fs.readFileSync(path.join(dirB, f), "utf8"),
      filesInA,
      dirA,
      dirB
    );
  } else {
    report = evaluateRetention(
      (f) => execSync(`git show ${baseCommit}:${f}`, { encoding: "utf8" }),
      (f) => fs.readFileSync(f, "utf8"),
      ruleFiles,
      baseCommit,
      headCommit
    );
  }

  if (isJson) {
    process.stdout.write((JSON.stringify(report, null, 2)) + "\n");
  } else {
    process.stdout.write((`\n=== NORMATIVE RETENTION CHECK ===`) + "\n");
    process.stdout.write((`Base: ${report.base} | Head: ${report.head}`) + "\n");
    process.stdout.write((`Total Sections Scanned: ${report.total_sections}`) + "\n");
    process.stdout.write((`Uncompensated Losses (>=30% without Gate Ref): ${report.uncompensated_losses}`) + "\n");
    process.stdout.write((`Fractional Headings Found: ${report.fractional_headings.length}\n`) + "\n");

    if (report.fractional_headings.length > 0) {
      process.stdout.write(("Fractional Headings Detected:") + "\n");
      for (const fh of report.fractional_headings) {
        process.stdout.write((`  [FAIL] ${fh.file}: "${fh.heading}"`) + "\n");
      }
      process.stdout.write(("") + "\n");
    }

    if (report.uncompensated_losses > 0) {
      process.stdout.write(("Uncompensated Loss Sections:") + "\n");
      for (const d of report.details.filter((s) => s.uncompensatedLoss)) {
        process.stdout.write((`  [FAIL] ${d.file} -> "${d.heading}": ${d.beforeNormative} -> ${d.afterNormative} (-${d.lossPct}%)`) + "\n");
      }
      process.stdout.write(("") + "\n");
    }
  }

  if (report.uncompensated_losses > 0 || report.fractional_headings.length > 0) {
    if (!isJson) {
      process.stdout.write(("FAIL: Retention check failed.") + "\n");
    }
    process.exit(1);
  } else {
    if (!isJson) {
      process.stdout.write(("PASS: Normative retention satisfied across all rules.") + "\n");
    }
    process.exit(0);
  }
}
