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

// CLI entry point
if (import.meta.main || require.main === module) {
  try {
    const args = process.argv.slice(2);
    const isJson = args.includes("--json");
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
