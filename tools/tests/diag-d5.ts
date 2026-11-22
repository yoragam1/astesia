import * as fs from "fs";
import * as path from "path";

const targetDirs = ["skills", "rules", "workflows"];
const candidateTools = [
  "read_file",
  "write_file",
  "edit_file",
  "run_command",
  "view_file",
  "list_dir",
  "grep_search",
  "visual_audit",
  "grep_codebase",
  "ask_question",
  "search_web",
  "search_marketplace"
];

function scanFiles(dir: string): Array<{ file: string; line: number; tool: string; text: string }> {
  let matches: Array<{ file: string; line: number; tool: string; text: string }> = [];
  if (!fs.existsSync(dir)) return matches;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      matches = matches.concat(scanFiles(full));
    } else if (ent.isFile() && (ent.name.endsWith(".md") || ent.name.endsWith(".json"))) {
      const content = fs.readFileSync(full, "utf8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        for (const t of candidateTools) {
          if (line.includes("`" + t + "`")) {
            matches.push({ file: full.replace(/\\/g, "/"), line: i + 1, tool: t, text: line.trim() });
          }
        }
      }
    }
  }
  return matches;
}

let totalMatches: Array<{ file: string; line: number; tool: string; text: string }> = [];
for (const d of targetDirs) {
  totalMatches = totalMatches.concat(scanFiles(d));
}

console.log("Total inline tool occurrences in skills/rules/workflows:", totalMatches.length);
for (const m of totalMatches) {
  console.log(`  ${m.file}:${m.line} [${m.tool}] ${m.text}`);
}
