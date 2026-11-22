/**
 * .astesia/audit/wave2a.5/tools/classify.ts
 * Deterministic seeded sampling (Mulberry32, seed = 2026 + projectIndex),
 * strict validation of classification.json, and table generation with
 * rule names from anti-patterns.json and Wilson 95% upper bounds.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { wilsonUpper95 } from "./stats";

export type FindingClass = "TP" | "FP" | "NOISE" | "TOKENIZER";

export interface ClassificationEntry {
  id: string; // "rule|file|line"
  project?: string;
  class: FindingClass;
  quote: string; // 1..120 chars
  reason: string; // >= 15 chars
}

export interface GateViolation {
  ruleId: string;
  severity: string;
  file: string;
  line: number;
  message: string;
}

export function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function canonicalViolationId(v: { ruleId: string; file: string; line: number }): string {
  return `${v.ruleId}|${v.file.replace(/\\/g, "/")}|${v.line}`;
}

const MANDATORY_RULES = new Set(["ASTESIA-001", "ASTESIA-004", "ASTESIA-010", "TOKENIZER_DESYNC"]);

export function selectProjectSample(
  violations: GateViolation[],
  projectIndex: number,
  minSampleSize: number = 40
): {
  seed: number;
  totalViolations: number;
  sampledCount: number;
  isFullCensus: boolean;
  selected: GateViolation[];
} {
  const seed = 2026 + projectIndex;
  // Deduplicate by canonical id preserving order
  const seen = new Set<string>();
  const unique: GateViolation[] = [];
  for (const v of violations) {
    const id = canonicalViolationId(v);
    if (!seen.has(id)) {
      seen.add(id);
      unique.push(v);
    }
  }

  if (unique.length <= 60) {
    return {
      seed,
      totalViolations: unique.length,
      sampledCount: unique.length,
      isFullCensus: true,
      selected: unique
    };
  }

  const mandatory: GateViolation[] = [];
  const rest: GateViolation[] = [];
  for (const v of unique) {
    if (MANDATORY_RULES.has(v.ruleId)) {
      mandatory.push(v);
    } else {
      rest.push(v);
    }
  }

  // Deterministic Fisher-Yates shuffle on rest using Mulberry32(seed)
  const rng = mulberry32(seed);
  const shuffled = [...rest];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = tmp;
  }

  const neededFromRest = Math.max(0, minSampleSize - mandatory.length);
  const takenFromRest = shuffled.slice(0, neededFromRest);
  const selected = [...mandatory, ...takenFromRest].sort((a, b) =>
    canonicalViolationId(a).localeCompare(canonicalViolationId(b))
  );

  return {
    seed,
    totalViolations: unique.length,
    sampledCount: selected.length,
    isFullCensus: false,
    selected
  };
}

const VALID_CLASSES = new Set<FindingClass>(["TP", "FP", "NOISE", "TOKENIZER"]);

export function validateClassifications(
  requiredIds: string[],
  entries: ClassificationEntry[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const byId = new Map<string, ClassificationEntry>();

  for (const e of entries) {
    if (!e || typeof e.id !== "string" || e.id.split("|").length !== 3) {
      errors.push(`Invalid entry id format: ${JSON.stringify(e?.id)}`);
      continue;
    }
    if (!VALID_CLASSES.has(e.class)) {
      errors.push(`Invalid class '${e.class}' for '${e.id}' (must be TP|FP|NOISE|TOKENIZER)`);
    }
    const ruleId = e.id.split("|")[0];
    if (ruleId === "TOKENIZER_DESYNC" && e.class !== "TOKENIZER") {
      errors.push(`Entry '${e.id}' is TOKENIZER_DESYNC and must have class TOKENIZER, got '${e.class}'`);
    }
    if (ruleId !== "TOKENIZER_DESYNC" && e.class === "TOKENIZER") {
      errors.push(`Entry '${e.id}' has class TOKENIZER but ruleId is '${ruleId}'`);
    }
    if (typeof e.quote !== "string" || e.quote.trim().length === 0) {
      errors.push(`Empty quote for '${e.id}'`);
    } else if (e.quote.length > 120) {
      errors.push(`Quote exceeds 120 chars (${e.quote.length}) for '${e.id}'`);
    }
    if (typeof e.reason !== "string" || e.reason.trim().length < 15) {
      errors.push(`Reason too short (< 15 chars) for '${e.id}': '${e.reason || ""}'`);
    }
    byId.set(e.id, e);
  }

  for (const reqId of requiredIds) {
    if (!byId.has(reqId)) {
      errors.push(`Missing classification entry for required sample id '${reqId}'`);
    }
  }

  return { valid: errors.length === 0, errors };
}

export function loadRuleNames(rulesJsonPath?: string): Record<string, string> {
  const p = rulesJsonPath || resolve(__dirname, "../../../../templates/enforcement/anti-patterns.json");
  const parsed = JSON.parse(readFileSync(p, "utf8"));
  const map: Record<string, string> = {
    TOKENIZER_DESYNC: "Tokenizer state desynchronization: unclosed string, template literal, or comment at EOF."
  };
  for (const r of parsed.rules || []) {
    map[r.id] = r.description || r.name || r.id;
  }
  return map;
}

export interface RuleClassificationMetric {
  ruleId: string;
  ruleDescription: string;
  evaluatedTotal: number;
  codeEvaluated: number; // TP + FP
  tp: number;
  fp: number;
  noise: number;
  tokenizer: number;
  fpRateCode: string; // x/n (TP+FP)
  wilsonUpper95Code: number | "n/a";
  fpRateAll: string; // x/N (TP+FP+NOISE)
  wilsonUpper95All: number | "n/a";
}

export function computeRuleMetrics(
  entries: ClassificationEntry[],
  ruleNames: Record<string, string>
): RuleClassificationMetric[] {
  const byRule: Record<string, { tp: number; fp: number; noise: number; tokenizer: number }> = {};
  for (const e of entries) {
    const ruleId = e.id.split("|")[0];
    if (!byRule[ruleId]) {
      byRule[ruleId] = { tp: 0, fp: 0, noise: 0, tokenizer: 0 };
    }
    if (e.class === "TP") byRule[ruleId].tp++;
    else if (e.class === "FP") byRule[ruleId].fp++;
    else if (e.class === "NOISE") byRule[ruleId].noise++;
    else if (e.class === "TOKENIZER") byRule[ruleId].tokenizer++;
  }

  const out: RuleClassificationMetric[] = [];
  for (const ruleId of Object.keys(byRule).sort()) {
    const m = byRule[ruleId];
    const evalTotal = m.tp + m.fp + m.noise + m.tokenizer;
    const codeEval = m.tp + m.fp;
    const nonTokEval = m.tp + m.fp + m.noise;
    out.push({
      ruleId,
      ruleDescription: ruleNames[ruleId] || ruleId,
      evaluatedTotal: evalTotal,
      codeEvaluated: codeEval,
      tp: m.tp,
      fp: m.fp,
      noise: m.noise,
      tokenizer: m.tokenizer,
      fpRateCode: `${m.fp}/${codeEval}`,
      wilsonUpper95Code: wilsonUpper95(m.fp, codeEval),
      fpRateAll: `${m.fp}/${nonTokEval}`,
      wilsonUpper95All: wilsonUpper95(m.fp, nonTokEval)
    });
  }
  return out;
}
