import { spawnSync, execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";

const REPO = "D:/Workspaces/Astesia";
const RULES = join(REPO, "templates/enforcement/anti-patterns.json");
const COPIES_DIR = join(os.tmpdir(), "astesia-2a7-copies");

// Load rules to get severity
const rulesJson = JSON.parse(readFileSync(RULES, "utf8")) as { rules: Array<{ id: string; severity: string; name?: string }> };
const ruleSeverity: Record<string, string> = {};
for (const r of rulesJson.rules) {
  ruleSeverity[r.id] = r.severity;
}
ruleSeverity["TOKENIZER_DESYNC"] = "warn";

// Prepare base5 gate and start gate
const tempGateDir = join(os.tmpdir(), `astesia-gates-${Date.now()}`);
mkdirSync(tempGateDir, { recursive: true });

const gateBase5Path = join(tempGateDir, "gate-base5.ts");
const base5Content = execSync(`git -C ${REPO} show 2609008:templates/enforcement/astesia-gate.ts`, { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 });
writeFileSync(gateBase5Path, base5Content, "utf8");

const gateStartPath = join(tempGateDir, "gate-start.ts");
const startContent = execSync(`git -C ${REPO} show bc3c077:templates/enforcement/astesia-gate.ts`, { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 });
writeFileSync(gateStartPath, startContent, "utf8");

function runGate(gatePath: string, rootDir: string): { json: any; hash: string } {
  // Run 1
  const r1 = spawnSync(process.execPath, [gatePath, "--root", rootDir, "--rules", RULES, "--json"], {
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024
  });
  if (r1.status !== 0 && !r1.stdout) {
    throw new Error(`Gate failed on ${rootDir}: ${r1.stderr}`);
  }
  const hash1 = createHash("sha256").update(r1.stdout).digest("hex");

  // Run 2 (verify determinism)
  const r2 = spawnSync(process.execPath, [gatePath, "--root", rootDir, "--rules", RULES, "--json"], {
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024
  });
  const hash2 = createHash("sha256").update(r2.stdout).digest("hex");

  if (hash1 !== hash2) {
    throw new Error(`Non-deterministic gate output on ${rootDir}! Run1: ${hash1}, Run2: ${hash2}`);
  }

  return { json: JSON.parse(r1.stdout), hash: hash1 };
}

const projects = [
  // DESIGN
  { name: "eunectes", set: "design" },
  { name: "ifrit", set: "design" },
  { name: "flora-smk", set: "design" },
  // SEEN
  { name: "arene", set: "seen" },
  { name: "SIA", set: "seen" },
  { name: "pustaka-sekolah-pwa", set: "seen" },
  { name: "terminal-portfolio", set: "seen" },
  { name: "cadetspeak", set: "seen" },
  { name: "eduNEXA", set: "seen" },
  { name: "prototype-ami", set: "seen" }
];

interface FindingItem {
  id: string; // rule|file|line
  ruleId: string;
  file: string;
  line: number;
  message: string;
  quote?: string;
}

const reconciliationResults: Record<string, any> = {};

console.log("Starting reconciliation between BASE5 (2609008) and START (bc3c077)...");

for (const p of projects) {
  const pPath = join(COPIES_DIR, p.name);
  console.log(`Scanning project: ${p.name} (${p.set})...`);

  const baseRes = runGate(gateBase5Path, pPath);
  const startRes = runGate(gateStartPath, pPath);

  const baseViolations: FindingItem[] = (baseRes.json.violations || []).map((v: any) => ({
    id: `${v.ruleId}|${v.file.replace(/\\/g, "/")}|${v.line}`,
    ruleId: v.ruleId,
    file: v.file.replace(/\\/g, "/"),
    line: v.line,
    message: v.message,
    quote: v.quote
  }));

  const startViolations: FindingItem[] = (startRes.json.violations || []).map((v: any) => ({
    id: `${v.ruleId}|${v.file.replace(/\\/g, "/")}|${v.line}`,
    ruleId: v.ruleId,
    file: v.file.replace(/\\/g, "/"),
    line: v.line,
    message: v.message,
    quote: v.quote
  }));

  const baseMap = new Map<string, FindingItem>(baseViolations.map((v) => [v.id, v]));
  const startMap = new Map<string, FindingItem>(startViolations.map((v) => [v.id, v]));

  const hilang: FindingItem[] = [];
  for (const [id, v] of baseMap) {
    if (!startMap.has(id)) hilang.push(v);
  }

  const baru: FindingItem[] = [];
  for (const [id, v] of startMap) {
    if (!baseMap.has(id)) baru.push(v);
  }

  const baseErrors = baseRes.json.errors || 0;
  const baseWarnings = baseRes.json.warnings || 0;
  const startErrors = startRes.json.errors || 0;
  const startWarnings = startRes.json.warnings || 0;

  const deltaErrors = startErrors - baseErrors;
  const deltaWarnings = startWarnings - baseWarnings;

  const hilangErrors = hilang.filter((v) => ruleSeverity[v.ruleId] === "error").length;
  const baruErrors = baru.filter((v) => ruleSeverity[v.ruleId] === "error").length;
  const hilangWarnings = hilang.filter((v) => (ruleSeverity[v.ruleId] || "warn") === "warn").length;
  const baruWarnings = baru.filter((v) => (ruleSeverity[v.ruleId] || "warn") === "warn").length;

  const calcDeltaErrors = baruErrors - hilangErrors;
  const calcDeltaWarnings = baruWarnings - hilangWarnings;

  if (calcDeltaErrors !== deltaErrors) {
    throw new Error(
      `Error arithmetic mismatch for ${p.name}: gate says delta=${deltaErrors}, calculated=${calcDeltaErrors} (baru=${baruErrors}, hilang=${hilangErrors})`
    );
  }
  if (calcDeltaWarnings !== deltaWarnings) {
    throw new Error(
      `Warning arithmetic mismatch for ${p.name}: gate says delta=${deltaWarnings}, calculated=${calcDeltaWarnings} (baru=${baruWarnings}, hilang=${hilangWarnings})`
    );
  }

  reconciliationResults[p.name] = {
    name: p.name,
    set: p.set,
    base5: {
      sha256: baseRes.hash,
      total: baseViolations.length,
      errors: baseErrors,
      warnings: baseWarnings,
      files_scanned: baseRes.json.files_scanned,
      generated_skipped: baseRes.json.generated_skipped
    },
    start: {
      sha256: startRes.hash,
      total: startViolations.length,
      errors: startErrors,
      warnings: startWarnings,
      files_scanned: startRes.json.files_scanned,
      generated_skipped: startRes.json.generated_skipped
    },
    delta: {
      total: startViolations.length - baseViolations.length,
      errors: deltaErrors,
      warnings: deltaWarnings,
      hilangCount: hilang.length,
      baruCount: baru.length
    },
    hilang,
    baru
  };

  console.log(
    `  ${p.name.padEnd(20)}: Base=${baseViolations.length} (err:${baseErrors}, warn:${baseWarnings}) -> Start=${startViolations.length} (err:${startErrors}, warn:${startWarnings}) | Hilang=${hilang.length}, Baru=${baru.length}`
  );
}

const outPath = join(REPO, ".astesia/audit/wave2a.7/reconciliation.json");
writeFileSync(outPath, JSON.stringify(reconciliationResults, null, 2), "utf8");
console.log(`\nReconciliation finished successfully. Saved to ${outPath}.`);
