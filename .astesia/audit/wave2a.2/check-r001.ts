import { readFileSync } from "node:fs";

const files = [
  "pustaka-56dd907.json",
  "pustaka-4bc9ff4.json",
  "pustaka-618f8df.json"
];

for (const f of files) {
  const data = JSON.parse(readFileSync(`D:/Workspaces/Astesia/.astesia/audit/wave2a.2/${f}`, "utf8"));
  const r001 = (data.violations || []).filter((v: any) => v.ruleId === "ASTESIA-001");
  console.log(`${f} -> ASTESIA-001 count: ${r001.length}`);
  for (const v of r001) {
    console.log(`  ${v.file}:${v.line}`);
  }
}
