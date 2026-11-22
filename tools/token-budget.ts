/**
 * tools/token-budget.ts
 * Manages the mechanical token budget for the Astesia Framework BOOT SET.
 *
 * Usage:
 *   bun tools/token-budget.ts --measure
 *   bun tools/token-budget.ts --check
 *   bun tools/token-budget.ts --update [--allow-raise --reason "<>=15 chars>"]
 *
 * Exit codes:
 *   0 = Success / Check passed
 *   1 = Budget exceeded
 *   2 = Tool failure (missing args, invalid config, raise without permission)
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { generateInventory } from "./gen-inventory";

const REPO_ROOT = resolve(__dirname, "..");
const BUDGET_FILE = join(REPO_ROOT, "runtime", "token-budget.json");

export interface BudgetRecord {
  method: string;
  boot_set_definition: string;
  boot_tokens_est: number;
  total_bytes: number;
  per_file: Array<{ path: string; bytes: number; tokens_est: number }>;
  skills_metadata: {
    count: number;
    bytes: number;
    tokens_est: number;
  };
  history: Array<{
    timestamp: string;
    action: string;
    previous_tokens?: number;
    new_tokens: number;
    reason?: string;
  }>;
}

export function loadBudget(path = BUDGET_FILE): BudgetRecord | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err: unknown) {
    throw new Error(`Failed to parse budget file ${path}: ${(err instanceof Error ? err.message : String(err))}`);
  }
}

export function measureBootSet(root = REPO_ROOT) {
  const inv = generateInventory(root);
  return inv.boot_set;
}

export function checkBudget(root = REPO_ROOT, path = BUDGET_FILE): { passed: boolean; current: number; budget: number; diff: number } {
  const record = loadBudget(path);
  if (!record) {
    throw new Error(`Budget file not found at ${path}. Run --update first.`);
  }

  const currentBoot = measureBootSet(root);
  const current = currentBoot.total_tokens_est;
  const budget = record.boot_tokens_est;
  const diff = current - budget;

  return {
    passed: current <= budget,
    current,
    budget,
    diff,
  };
}

export function updateBudget(
  root = REPO_ROOT,
  path = BUDGET_FILE,
  allowRaise = false,
  reason = ""
): BudgetRecord {
  const currentBoot = measureBootSet(root);
  const existing = loadBudget(path);

  const nowTokens = currentBoot.total_tokens_est;
  let action = "init";
  let prevTokens: number | undefined = undefined;

  if (existing) {
    prevTokens = existing.boot_tokens_est;
    if (nowTokens > prevTokens) {
      if (!allowRaise) {
        throw new Error(`Cannot raise token budget from ${prevTokens} to ${nowTokens} without --allow-raise flag.`);
      }
      if (!reason || reason.trim().length < 15) {
        throw new Error(`Raising token budget requires --reason with at least 15 characters.`);
      }
      action = "raise";
    } else if (nowTokens < prevTokens) {
      action = "tighten";
    } else {
      action = "refresh";
    }
  }

  const history = existing ? [...existing.history] : [];
  history.push({
    timestamp: new Date().toISOString(),
    action,
    previous_tokens: prevTokens,
    new_tokens: nowTokens,
    reason: reason || undefined,
  });

  const newRecord: BudgetRecord = {
    method: "ceil(bytes_utf8 / 3.5)",
    boot_set_definition: currentBoot.definition,
    boot_tokens_est: nowTokens,
    total_bytes: currentBoot.total_bytes,
    per_file: currentBoot.files,
    skills_metadata: currentBoot.skills_metadata,
    history,
  };

  writeFileSync(path, JSON.stringify(newRecord, null, 2), "utf8");
  return newRecord;
}

// CLI entry point
if (import.meta.main || require.main === module) {
  try {
    const args = process.argv.slice(2);
    const isMeasure = args.includes("--measure");
    const isCheck = args.includes("--check");
    const isUpdate = args.includes("--update");
    const isJson = args.includes("--json");

    const allowRaise = args.includes("--allow-raise");
    const reasonIdx = args.indexOf("--reason");
    const reason = reasonIdx !== -1 && args[reasonIdx + 1] ? args[reasonIdx + 1] : "";

    if (isMeasure) {
      const b = measureBootSet(REPO_ROOT);
      if (isJson) {
        process.stdout.write((JSON.stringify(b, null, 2)) + "\n");
      } else {
        process.stdout.write((`\n=== BOOT SET TOKEN MEASUREMENT ===`) + "\n");
        process.stdout.write((`Definition: ${b.definition}`) + "\n");
        process.stdout.write((`Total Bytes:  ${b.total_bytes}`) + "\n");
        process.stdout.write((`Total Tokens: ${b.total_tokens_est}`) + "\n");
        process.stdout.write((`\nPer-File Breakdown:`) + "\n");
        for (const f of b.files) {
          process.stdout.write((`  ${f.path.padEnd(30)} ${f.bytes.toString().padStart(6)} bytes  ${f.tokens_est.toString().padStart(5)} tokens`) + "\n");
        }
        process.stdout.write((`  Skills Metadata (${b.skills_metadata.count} skills)     ${b.skills_metadata.bytes.toString().padStart(6)} bytes  ${b.skills_metadata.tokens_est.toString().padStart(5)} tokens\n`) + "\n");
      }
      process.exit(0);
    }

    if (isCheck) {
      const res = checkBudget(REPO_ROOT, BUDGET_FILE);
      if (isJson) {
        process.stdout.write((JSON.stringify(res, null, 2)) + "\n");
      } else {
        process.stdout.write((`\n=== TOKEN BUDGET CHECK ===`) + "\n");
        process.stdout.write((`Current Tokens: ${res.current}`) + "\n");
        process.stdout.write((`Budget Limit:   ${res.budget}`) + "\n");
        process.stdout.write((`Difference:     ${res.diff > 0 ? `+${res.diff} (EXCEEDED)` : `${res.diff} (OK)`}`) + "\n");
        process.stdout.write((`Status:         ${res.passed ? "PASS (Within budget)" : "FAIL (Budget exceeded)"}\n`) + "\n");
      }
      process.exit(res.passed ? 0 : 1);
    }

    if (isUpdate) {
      const updated = updateBudget(REPO_ROOT, BUDGET_FILE, allowRaise, reason);
      if (isJson) {
        process.stdout.write((JSON.stringify(updated, null, 2)) + "\n");
      } else {
        process.stdout.write((`Token budget updated successfully. Current limit: ${updated.boot_tokens_est} tokens.`) + "\n");
      }
      process.exit(0);
    }

    console.error("Usage: bun tools/token-budget.ts (--measure | --check | --update [--allow-raise --reason <text>])");
    process.exit(2);
  } catch (err: unknown) {
    console.error(`[TOOL_FAILURE] ${(err instanceof Error ? err.message : String(err))}`);
    process.exit(2);
  }
}
