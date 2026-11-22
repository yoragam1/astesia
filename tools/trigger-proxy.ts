/**
 * tools/trigger-proxy.ts
 * Evaluates skill description triggerability using TF-IDF token overlap scoring.
 * Used as a mechanical regression proxy when trimming skill descriptions.
 *
 * Usage:
 *   bun tools/trigger-proxy.ts [--samples <path>] [--output <path>] [--json]
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { generateInventory } from "./gen-inventory";

const REPO_ROOT = resolve(__dirname, "..");
const SAMPLES_FILE = join(REPO_ROOT, "tools", "trigger-samples.json");

export interface TriggerSample {
  skill: string;
  prompt: string;
}

export interface SkillDoc {
  name: string;
  folder: string;
  tokens: string[];
  tokenCounts: Map<string, number>;
  totalTokens: number;
}

export interface TriggerResult {
  sample_index: number;
  expected_skill: string;
  prompt: string;
  passed: boolean;
  top_skill: string;
  top_score: number;
  expected_score: number;
  expected_rank: number;
  ranking: Array<{ skill: string; score: number }>;
}

export interface ProxySummary {
  timestamp: string;
  total_samples: number;
  passed_samples: number;
  failed_samples: number;
  pass_rate: number;
  results: TriggerResult[];
}

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9_-]+/g) || []).filter((w) => w.length >= 2);
}

export function buildSkillCorpus(root = REPO_ROOT): {
  skills: SkillDoc[];
  idf: Map<string, number>;
} {
  const inv = generateInventory(root);
  const docs: SkillDoc[] = [];
  const docFreq = new Map<string, number>();

  for (const s of inv.skills) {
    // Combine name and description as document
    const text = `${s.name.replace(/-/g, " ")} ${s.name} ${s.description}`;
    const tokens = tokenize(text);
    const counts = new Map<string, number>();
    const seenInDoc = new Set<string>();

    for (const t of tokens) {
      counts.set(t, (counts.get(t) || 0) + 1);
      if (!seenInDoc.has(t)) {
        seenInDoc.add(t);
        docFreq.set(t, (docFreq.get(t) || 0) + 1);
      }
    }

    docs.push({
      name: s.name,
      folder: s.folder,
      tokens,
      tokenCounts: counts,
      totalTokens: Math.max(tokens.length, 1),
    });
  }

  const N = docs.length;
  const idf = new Map<string, number>();
  for (const [term, df] of docFreq.entries()) {
    idf.set(term, Math.log(1 + (N / (1 + df))));
  }

  return { skills: docs, idf };
}

export function scorePrompt(
  prompt: string,
  skills: SkillDoc[],
  idf: Map<string, number>
): Array<{ skill: string; score: number }> {
  const queryTokens = tokenize(prompt);
  const scores: Array<{ skill: string; score: number }> = [];

  for (const doc of skills) {
    let score = 0;
    for (const qt of queryTokens) {
      const tf = (doc.tokenCounts.get(qt) || 0) / doc.totalTokens;
      const termIdf = idf.get(qt) || 0;
      score += tf * termIdf;
    }
    scores.push({ skill: doc.name, score: Math.round(score * 10000) / 10000 });
  }

  // Sort descending by score, tiebreak lexicographically
  scores.sort((a, b) => b.score - a.score || a.skill.localeCompare(b.skill));
  return scores;
}

export function evaluateTriggerProxy(
  samplesPath = SAMPLES_FILE,
  root = REPO_ROOT
): ProxySummary {
  if (!existsSync(samplesPath)) {
    throw new Error(`Samples file not found at ${samplesPath}`);
  }

  const raw = readFileSync(samplesPath, "utf8");
  const samples: TriggerSample[] = JSON.parse(raw);

  const { skills, idf } = buildSkillCorpus(root);

  let passed = 0;
  const results: TriggerResult[] = [];

  for (let idx = 0; idx < samples.length; idx++) {
    const sample = samples[idx];
    const ranking = scorePrompt(sample.prompt, skills, idf);
    const top = ranking[0] || { skill: "none", score: 0 };

    const expectedRank = ranking.findIndex((r) => r.skill === sample.skill) + 1;
    const expectedEntry = ranking.find((r) => r.skill === sample.skill) || { score: 0 };

    // Pass if target skill is rank 1 or tied for top score
    const isPass = top.skill === sample.skill || (expectedEntry.score > 0 && expectedEntry.score >= top.score);

    if (isPass) passed++;

    results.push({
      sample_index: idx + 1,
      expected_skill: sample.skill,
      prompt: sample.prompt,
      passed: isPass,
      top_skill: top.skill,
      top_score: top.score,
      expected_score: expectedEntry.score,
      expected_rank: expectedRank,
      ranking: ranking.slice(0, 5),
    });
  }

  return {
    timestamp: new Date().toISOString(),
    total_samples: samples.length,
    passed_samples: passed,
    failed_samples: samples.length - passed,
    pass_rate: samples.length === 0 ? 0 : Math.round((passed / samples.length) * 10000) / 10000,
    results,
  };
}

export interface PairedComparisonResult {
  paired_count: number;
  fileA: string;
  fileB: string;
  before_passed: number;
  after_passed: number;
  before_pass_rate: number;
  after_pass_rate: number;
  degradations: Array<{
    skill: string;
    prompt: string;
    before_score: number;
    after_score: number;
    exempted: boolean;
    reason?: string;
  }>;
  skill_breakdown: Array<{
    skill: string;
    total: number;
    before_passed: number;
    after_passed: number;
    delta: number;
  }>;
}

export function comparePairedTriggerResults(
  fileAPath: string,
  fileBPath: string,
  exceptionsPath = join(REPO_ROOT, "runtime", "trigger-exceptions.json")
): PairedComparisonResult {
  const dataA: ProxySummary = JSON.parse(readFileSync(fileAPath, "utf8"));
  const dataB: ProxySummary = JSON.parse(readFileSync(fileBPath, "utf8"));

  let exceptions: Array<{ skill: string; reason: string }> = [];
  if (existsSync(exceptionsPath)) {
    try {
      const parsed = JSON.parse(readFileSync(exceptionsPath, "utf8"));
      exceptions = parsed.exceptions || [];
    } catch {}
  }
  const exceptionMap = new Map(exceptions.map((e) => [e.skill, e.reason]));

  const mapA = new Map<string, TriggerResult>();
  for (const r of dataA.results) {
    mapA.set(r.prompt.trim(), r);
  }

  const degradations: PairedComparisonResult["degradations"] = [];
  const skillStats = new Map<string, { total: number; before: number; after: number }>();

  let pairedCount = 0;
  let beforePassed = 0;
  let afterPassed = 0;

  for (const rB of dataB.results) {
    const key = rB.prompt.trim();
    if (!mapA.has(key)) continue;

    const rA = mapA.get(key)!;
    pairedCount++;
    if (rA.passed) beforePassed++;
    if (rB.passed) afterPassed++;

    const skill = rB.expected_skill;
    if (!skillStats.has(skill)) {
      skillStats.set(skill, { total: 0, before: 0, after: 0 });
    }
    const stat = skillStats.get(skill)!;
    stat.total++;
    if (rA.passed) stat.before++;
    if (rB.passed) stat.after++;

    if (rA.passed && !rB.passed) {
      const reason = exceptionMap.get(skill);
      degradations.push({
        skill,
        prompt: rB.prompt,
        before_score: rA.expected_score,
        after_score: rB.expected_score,
        exempted: Boolean(reason && reason.length >= 15),
        reason,
      });
    }
  }

  const breakdown: PairedComparisonResult["skill_breakdown"] = [];
  for (const [skill, stat] of skillStats.entries()) {
    breakdown.push({
      skill,
      total: stat.total,
      before_passed: stat.before,
      after_passed: stat.after,
      delta: stat.after - stat.before,
    });
  }
  breakdown.sort((a, b) => a.skill.localeCompare(b.skill));

  return {
    paired_count: pairedCount,
    fileA: fileAPath,
    fileB: fileBPath,
    before_passed: beforePassed,
    after_passed: afterPassed,
    before_pass_rate: pairedCount ? +(beforePassed / pairedCount).toFixed(4) : 0,
    after_pass_rate: pairedCount ? +(afterPassed / pairedCount).toFixed(4) : 0,
    degradations,
    skill_breakdown: breakdown,
  };
}

// CLI entry point
if (import.meta.main || require.main === module) {
  try {
    const args = process.argv.slice(2);
    const isJson = args.includes("--json");
    const pairedIdx = args.indexOf("--paired");

    if (pairedIdx !== -1) {
      const fileA = args[pairedIdx + 1];
      const fileB = args[pairedIdx + 2];
      if (!fileA || !fileB) {
        console.error("Usage: bun tools/trigger-proxy.ts --paired <fileA> <fileB>");
        process.exit(2);
      }

      const comp = comparePairedTriggerResults(resolve(fileA), resolve(fileB));
      if (isJson) {
        console.log(JSON.stringify(comp, null, 2));
      } else {
        console.log(`\n=== PAIRED TRIGGER COMPARISON ===`);
        console.log(`File A (Before): ${comp.fileA}`);
        console.log(`File B (After):  ${comp.fileB}`);
        console.log(`Paired Prompts:  ${comp.paired_count}`);
        console.log(`Before Passed:   ${comp.before_passed}/${comp.paired_count} (${(comp.before_pass_rate * 100).toFixed(2)}%)`);
        console.log(`After Passed:    ${comp.after_passed}/${comp.paired_count} (${(comp.after_pass_rate * 100).toFixed(2)}%)`);
        console.log(`Degradations:    ${comp.degradations.length}`);

        if (comp.degradations.length > 0) {
          console.log("\nDegradation details:");
          for (const d of comp.degradations) {
            console.log(`  [${d.skill}] (score: ${d.before_score} -> ${d.after_score}) Exempted: ${d.exempted ? "YES (" + d.reason + ")" : "NO"}`);
            console.log(`    Prompt: "${d.prompt}"`);
          }
        }
      }

      const unexempted = comp.degradations.filter((d) => !d.exempted);
      if (unexempted.length > 0) {
        console.error(`\nFAIL: Found ${unexempted.length} unexempted trigger degradation(s).`);
        process.exit(1);
      } else {
        console.log("\nPASS: No unexempted trigger degradations found.");
        process.exit(0);
      }
    }

    const outIdx = args.indexOf("--output");
    const outPath = outIdx !== -1 && args[outIdx + 1] ? resolve(args[outIdx + 1]) : null;
    const sIdx = args.indexOf("--samples");
    const samplesPath = sIdx !== -1 && args[sIdx + 1] ? resolve(args[sIdx + 1]) : SAMPLES_FILE;

    const summary = evaluateTriggerProxy(samplesPath, REPO_ROOT);

    if (outPath) {
      writeFileSync(outPath, JSON.stringify(summary, null, 2), "utf8");
      console.log(`Trigger evaluation saved to ${outPath}`);
    }

    if (isJson) {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      console.log(`\n=== SKILL TRIGGER PROXY EVALUATION ===`);
      console.log(`Total Samples:  ${summary.total_samples}`);
      console.log(`Passed Samples: ${summary.passed_samples}`);
      console.log(`Failed Samples: ${summary.failed_samples}`);
      console.log(`Pass Rate:      ${(summary.pass_rate * 100).toFixed(2)}%\n`);

      if (summary.failed_samples > 0) {
        console.log(`Failed Samples Details:`);
        for (const res of summary.results.filter((r) => !r.passed)) {
          console.log(`  [Sample #${res.sample_index}] Expected: ${res.expected_skill} (Rank: ${res.expected_rank}, Score: ${res.expected_score}) vs Top: ${res.top_skill} (Score: ${res.top_score})`);
          console.log(`    Prompt: "${res.prompt}"`);
        }
      }
    }

    // Proxy is informative and records baseline; exits 0
    process.exit(0);
  } catch (err: any) {
    console.error(`[TOOL_FAILURE] ${err.message}`);
    process.exit(2);
  }
}
