/**
 * .astesia/audit/wave2a.6/tools/classify.ts
 * Classification, validation, metrics, secret redaction, and review pack generator.
 * Keputusan 4: Per-rule x set breakdown with coverage ratio; aggregate and per-project removed.
 * Keputusan 6: Automatic secret redaction for ASTESIA-004/010 and strong prefixes.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { wilsonUpper95, formatWilsonUpper95 } from "./stats";

export type FindingClass = "TP" | "FP" | "NOISE" | "TOKENIZER";
export type ProjectSet = "design" | "regression" | "holdout";

export interface ClassificationEntry {
  id: string; // "rule|file|line"
  project?: string;
  set?: ProjectSet;
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

const VALID_CLASSES = new Set<FindingClass>(["TP", "FP", "NOISE", "TOKENIZER"]);

/**
 * Secret redaction (Keputusan 6).
 * Redacts literal values >= 6 characters after =, :, ??, || or strong prefixes.
 */
export function redactSecretQuote(quote: string, ruleId?: string): string {
  let redacted = quote;
  // 1. Strong prefixes anywhere
  redacted = redacted.replace(/(?:sk[_-](?:live[_-]|test[_-]|proj[_-])|ghp_|gho_|AKIA|xox[abp]-|eyJ)[A-Za-z0-9_.\-+=]{6,}/g, "<redacted>");
  // 2. Literal values in quotes after =, :, ??, ||
  redacted = redacted.replace(/((?:[:=]|\?\?|\|\|)\s*['"`])([^'"`\r\n]{6,})(['"`])/g, "$1<redacted>$3");
  // 3. Unquoted values in env/yaml (e.g. DEPLOY_TOKEN: hardcoded_token_value_12345)
  redacted = redacted.replace(/([:=]\s+)(?!process\.env\b)([A-Za-z0-9_\-\/.+=!@#$%^&*]{6,})/g, (m, p, v) => {
    if (/^(?:true|false|null|undefined|string|boolean|number|function|default|export|import|<redacted>)$/i.test(v)) return m;
    return `${p}<redacted>`;
  });
  return redacted;
}

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

export interface RuleSetMetric {
  ruleId: string;
  ruleDescription: string;
  set: ProjectSet;
  totalInSet: number;
  classifiedInSet: number;
  coverageRatio: string; // e.g. "10/10 (100.0%)"
  isCensus: boolean;
  tp: number;
  fp: number;
  noise: number;
  tokenizer: number;
  fpRateCode: string; // fp/(tp+fp)
  wilsonUpper95Code: number | "n/a";
  fpRateAll: string; // fp/(tp+fp+noise)
  wilsonUpper95All: number | "n/a";
}

export function computePerRuleSetMetrics(
  classified: ClassificationEntry[],
  totalFindingsByRuleSet: Record<string, Record<ProjectSet, number>>,
  ruleNames: Record<string, string>
): RuleSetMetric[] {
  const sets: ProjectSet[] = ["design", "regression", "holdout"];
  const counts: Record<string, Record<ProjectSet, { tp: number; fp: number; noise: number; tokenizer: number }>> = {};

  for (const e of classified) {
    const ruleId = e.id.split("|")[0];
    const s = e.set || "design";
    if (!counts[ruleId]) {
      counts[ruleId] = {
        design: { tp: 0, fp: 0, noise: 0, tokenizer: 0 },
        regression: { tp: 0, fp: 0, noise: 0, tokenizer: 0 },
        holdout: { tp: 0, fp: 0, noise: 0, tokenizer: 0 }
      };
    }
    if (e.class === "TP") counts[ruleId][s].tp++;
    else if (e.class === "FP") counts[ruleId][s].fp++;
    else if (e.class === "NOISE") counts[ruleId][s].noise++;
    else if (e.class === "TOKENIZER") counts[ruleId][s].tokenizer++;
  }

  const out: RuleSetMetric[] = [];
  const allRules = Array.from(new Set([...Object.keys(counts), ...Object.keys(totalFindingsByRuleSet)])).sort();

  for (const ruleId of allRules) {
    for (const s of sets) {
      const c = counts[ruleId]?.[s] || { tp: 0, fp: 0, noise: 0, tokenizer: 0 };
      const classifiedCount = c.tp + c.fp + c.noise + c.tokenizer;
      const totalInSet = totalFindingsByRuleSet[ruleId]?.[s] || classifiedCount;
      const covPct = totalInSet > 0 ? ((classifiedCount / totalInSet) * 100).toFixed(1) : "100.0";
      const isCensus = classifiedCount >= totalInSet;
      const codeEval = c.tp + c.fp;
      const allEval = c.tp + c.fp + c.noise;

      out.push({
        ruleId,
        ruleDescription: ruleNames[ruleId] || ruleId,
        set: s,
        totalInSet,
        classifiedInSet: classifiedCount,
        coverageRatio: `${classifiedCount}/${totalInSet} (${covPct}%)`,
        isCensus,
        tp: c.tp,
        fp: c.fp,
        noise: c.noise,
        tokenizer: c.tokenizer,
        fpRateCode: `${c.fp}/${codeEval}`,
        wilsonUpper95Code: wilsonUpper95(c.fp, codeEval),
        fpRateAll: `${c.fp}/${allEval}`,
        wilsonUpper95All: wilsonUpper95(c.fp, allEval)
      });
    }
  }

  return out;
}

/**
 * Generates .astesia/audit/wave2a.6/review-pack.md
 * Keputusan 6: Contains ALL FP, ALL NOISE, and 25 seeded TP (seed = 2061).
 * Redacts all secret quotes.
 */
export function generateReviewPack(
  entries: ClassificationEntry[],
  outputPath: string
): { totalEntries: number; fpCount: number; noiseCount: number; tpSampled: number } {
  const fps = entries.filter((e) => e.class === "FP");
  const noises = entries.filter((e) => e.class === "NOISE");
  const tps = entries.filter((e) => e.class === "TP");

  // Sample 25 TPs with Mulberry32(seed 2061)
  const rng = mulberry32(2061);
  const shuffledTps = [...tps];
  for (let i = shuffledTps.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = shuffledTps[i];
    shuffledTps[i] = shuffledTps[j];
    shuffledTps[j] = tmp;
  }
  const sampledTps = shuffledTps.slice(0, Math.min(25, shuffledTps.length));

  const reviewEntries: ClassificationEntry[] = [
    ...fps,
    ...noises,
    ...sampledTps
  ].sort((a, b) => a.id.localeCompare(b.id));

  const lines: string[] = [
    "# Astesia Gelombang 2A.6 — Audit Review Pack",
    "",
    "> Review pack memuat seluruh temuan False Positive (FP), Noise, dan 25 True Positive (TP) sampel berseed (Mulberry32, seed = 2061).",
    "> Seluruh kutipan secret berprefiks kuat atau bernilai rahasia telah DIREDAKSI secara deterministik sesuai Keputusan 6.",
    "",
    "| No | ID Temuan (`rule|file|line`) | Rule | Kelas | Kutipan (Diredaksi) | Alasan Klasifikasi |",
    "|---:|:---|:---|:---:|:---|:---|"
  ];

  let idx = 1;
  for (const e of reviewEntries) {
    const ruleId = e.id.split("|")[0];
    const redactedQuote = redactSecretQuote(e.quote, ruleId).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
    const cleanReason = e.reason.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
    lines.push(`| ${idx} | \`${e.id}\` | ${ruleId} | **${e.class}** | \`${redactedQuote}\` | ${cleanReason} |`);
    idx++;
  }

  lines.push("");
  lines.push(`Total item: ${reviewEntries.length} (FP: ${fps.length}, NOISE: ${noises.length}, TP Sampel: ${sampledTps.length} dari ${tps.length} total TP).`);
  lines.push("");

  writeFileSync(outputPath, lines.join("\n"), "utf8");
  return {
    totalEntries: reviewEntries.length,
    fpCount: fps.length,
    noiseCount: noises.length,
    tpSampled: sampledTps.length
  };
}
