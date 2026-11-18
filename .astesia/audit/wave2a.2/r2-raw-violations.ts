import { readFileSync, writeFileSync } from "node:fs";

const data = JSON.parse(readFileSync("D:/Workspaces/Astesia/.astesia/audit/wave2a.2/pustaka-618f8df.json", "utf8"));
const violations = data.violations || [];

console.log(`Total violations: ${violations.length} (errors: ${data.errors}, warnings: ${data.warnings})`);

const byRule: Record<string, any[]> = {};
for (const v of violations) {
  if (!byRule[v.ruleId]) byRule[v.ruleId] = [];
  byRule[v.ruleId].push(v);
}

for (const [rId, list] of Object.entries(byRule)) {
  console.log(`\nRule ${rId}: ${list.length} violations (${list[0].severity})`);
  for (const item of list.slice(0, 5)) {
    console.log(`  ${item.file}:${item.line} -> ${item.message.slice(0, 70)}`);
  }
  if (list.length > 5) {
    console.log(`  ... and ${list.length - 5} more`);
  }
}

writeFileSync("D:/Workspaces/Astesia/.astesia/audit/wave2a.2/r2-raw-violations.json", JSON.stringify(byRule, null, 2), "utf8");
