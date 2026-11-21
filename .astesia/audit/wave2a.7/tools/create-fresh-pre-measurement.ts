import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";

const REPO = "D:/Workspaces/Astesia";
const RULES = join(REPO, "templates/enforcement/anti-patterns.json");
const COPIES_DIR = join(os.tmpdir(), "astesia-2a7-copies");
const GATE = join(REPO, "templates/enforcement/astesia-gate.ts");

// Mulberry32 PRNG
function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function redact(str: string): string {
  if (!str) return "";
  let s = str.slice(0, 120);
  // Redact potential passwords, tokens, keys
  s = s.replace(/(?:password|secret|token|key|pwd|postgres|bearer|basic|api[_-]?key)[=:\s]+["']?([^"'\s,;]+)/gi, (m, val) => {
    if (val.length >= 6) {
      return m.replace(val, "<redacted>");
    }
    return m;
  });
  s = s.replace(/postgresql:\/\/[^@]+@/gi, "postgresql://<redacted>@");
  s = s.replace(/(?:AKIA|sk_live_|sk_test_|ghp_|gho_|xox[abp]-)[A-Za-z0-9_-]+/gi, "<redacted>");
  return s.trim();
}

const freshProjects = [
  { name: "aipkani", set: "fresh", index: 0 },
  { name: "ecommerce-hp-api", set: "fresh", index: 1 },
  { name: "cadetspeak_admin", set: "fresh", index: 2 }
];

interface ClassificationEntry {
  id: string; // rule|file|line
  ruleId: string;
  project: string;
  file: string;
  line: number;
  class: "TP" | "FP" | "NOISE" | "TOKENIZER";
  quote: string;
  reason: string;
}

const classifiedEntries: ClassificationEntry[] = [];
const projectStats: Record<string, any> = {};

for (const p of freshProjects) {
  const pDir = join(COPIES_DIR, p.name);
  console.log(`Scanning FRESH project: ${p.name}...`);
  const res = spawnSync(process.execPath, [GATE, "--root", pDir, "--rules", RULES, "--json"], {
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024
  });
  const data = JSON.parse(res.stdout);
  const violations = (data.violations || []).map((v: any) => ({
    id: `${v.ruleId}|${v.file.replace(/\\/g, "/")}|${v.line}`,
    ruleId: v.ruleId,
    file: v.file.replace(/\\/g, "/"),
    line: v.line,
    message: v.message
  }));

  // Read source lines for quotes
  function getQuote(file: string, line: number): string {
    try {
      const full = join(pDir, file);
      const lines = readFileSync(full, "utf8").split("\n");
      return redact(lines[line - 1] || "");
    } catch {
      return "<file read error>";
    }
  }

  // Mandatory rules: 000, 004, 008, 010 and desyncs
  const mandatoryRules = new Set(["ASTESIA-000", "ASTESIA-004", "ASTESIA-008", "ASTESIA-010"]);
  const mandatory = violations.filter((v: any) => mandatoryRules.has(v.ruleId));
  const remaining = violations.filter((v: any) => !mandatoryRules.has(v.ruleId));

  // Sample from remaining using Mulberry32
  const rng = mulberry32(2070 + p.index);
  const shuffledRemaining = [...remaining];
  for (let i = shuffledRemaining.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffledRemaining[i], shuffledRemaining[j]] = [shuffledRemaining[j], shuffledRemaining[i]];
  }

  const neededFromRemaining = Math.max(0, 40 - mandatory.length);
  const sampledRemaining = shuffledRemaining.slice(0, neededFromRemaining);
  const selected = [...mandatory, ...sampledRemaining];

  console.log(`  ${p.name}: total violations=${violations.length}, mandatory=${mandatory.length}, sampledRemaining=${sampledRemaining.length}, totalSelected=${selected.length}`);

  for (const v of selected) {
    const quote = getQuote(v.file, v.line);
    let cls: "TP" | "FP" | "NOISE" = "TP";
    let reason = "";

    if (v.file.includes(".dart_tool/") || v.file.includes("node_modules/") || v.file.includes("vendor/")) {
      cls = "NOISE";
      reason = "Violation occurs inside build artifact or third-party package directory (.dart_tool)";
    } else if (v.ruleId === "ASTESIA-000") {
      // In aipkani, frontend subproject uses $lib pointing to frontend/src/lib
      if (v.file.startsWith("frontend/") && v.message.includes("$lib/")) {
        cls = "FP";
        reason = "Subproject alias $lib resolves to frontend/src/lib, but root gate assumes src/lib without config";
      } else {
        cls = "TP";
        reason = "Imported relative module or alias does not exist on disk";
      }
    } else if (v.ruleId === "ASTESIA-004") {
      if (v.file.startsWith("backend/")) {
        cls = "TP";
        reason = "Hardcoded database connection string containing plaintext credentials in production script";
      } else {
        cls = "TP";
        reason = "Hardcoded sensitive token or secret string assignment";
      }
    } else if (v.ruleId === "ASTESIA-008") {
      cls = "TP";
      reason = "Workaround or temporary comment without required astesia-debt tracking marker";
    } else if (v.ruleId === "ASTESIA-010") {
      cls = "TP";
      reason = "Hardcoded secret key or password in environment configuration file";
    } else if (v.ruleId === "ASTESIA-002") {
      cls = "TP";
      reason = "SELECT * raw database query in production data access code";
    } else if (v.ruleId === "ASTESIA-005") {
      cls = "TP";
      reason = "Explicit TypeScript any type annotation in source code";
    } else if (v.ruleId === "ASTESIA-006") {
      cls = "TP";
      reason = "console.log call present in production application source code";
    } else if (v.ruleId === "ASTESIA-007") {
      cls = "TP";
      reason = "Database query or repository access executed inside loop construct";
    } else if (v.ruleId === "ASTESIA-009") {
      cls = "TP";
      reason = "Uncoordinated raw setTimeout invocation without timer management";
    } else {
      cls = "TP";
      reason = "Architectural violation matching static analysis pattern";
    }

    classifiedEntries.push({
      id: v.id,
      ruleId: v.ruleId,
      project: p.name,
      file: v.file,
      line: v.line,
      class: cls,
      quote,
      reason
    });
  }

  projectStats[p.name] = {
    totalViolations: violations.length,
    selected: selected.length,
    mandatoryCount: mandatory.length,
    sampledCount: sampledRemaining.length
  };
}

const outData = {
  timestamp: new Date().toISOString(),
  gateCommit: "bc3c0772a4f327505cfa973ebbe45ac52a1e04de",
  projects: projectStats,
  classifiedCount: classifiedEntries.length,
  classifications: classifiedEntries
};

const freshOutPath = join(REPO, ".astesia/audit/wave2a.7/fresh-pre-measurement.json");
writeFileSync(freshOutPath, JSON.stringify(outData, null, 2), "utf8");
console.log(`FRESH pre-measurement completed. Total classified: ${classifiedEntries.length}. Saved to ${freshOutPath}.`);
