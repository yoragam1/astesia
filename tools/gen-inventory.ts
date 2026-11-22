/**
 * tools/gen-inventory.ts
 * Generates comprehensive inventory of Astesia skills, boot set tokens,
 * consistency checks, reference graph, tool names, gate documentation sync,
 * and hardcoded numbers.
 *
 * Usage:
 *   bun tools/gen-inventory.ts [--output <path>] [--write-docs]
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve, relative, dirname } from "node:path";

const REPO_ROOT = resolve(__dirname, "..");

export interface SkillInfo {
  folder: string;
  name: string;
  valid_frontmatter: boolean;
  has_tabs_in_frontmatter: boolean;
  description: string;
  description_length: number;
  file_bytes: number;
  tokens_est: number;
}

export interface JaccardPair {
  skill_a: string;
  skill_b: string;
  similarity: number;
  common_tokens: string[];
}

export interface BootFile {
  path: string;
  bytes: number;
  tokens_est: number;
}

export interface BootSet {
  definition: string;
  rationale: string;
  files: BootFile[];
  skills_metadata: {
    count: number;
    bytes: number;
    tokens_est: number;
  };
  total_bytes: number;
  total_tokens_est: number;
}

export interface InventoryReport {
  timestamp: string;
  repo_root: string;
  skills: SkillInfo[];
  description_jaccard_pairs: JaccardPair[];
  boot_set: BootSet;
  consistency: {
    total_skill_folders: number;
    skills_in_index: number;
    skills_in_context_map: number;
    ghost_skills_index: string[];
    ghost_skills_context_map: string[];
    unmapped_skills_index: string[];
    unmapped_skills_context_map: string[];
  };
  reference_graph: {
    dangling_file_references: Array<{ source_file: string; link_text: string; target_path: string }>;
    directive_references: Array<{ source_file: string; line: number; text: string; directive_num: number; issue: string }>;
    stage_references: Array<{ source_file: string; line: number; text: string; stage: string; issue: string }>;
  };
  tool_candidates: {
    denylist_matches: Array<{ tool: string; count: number; locations: string[] }>;
    known_tool_matches: Array<{ tool: string; count: number }>;
    unclassified_candidates: Array<{ candidate: string; count: number }>;
  };
  gate_sync: {
    cli_flags: Array<{ flag: string; documented: boolean; occurrences: number }>;
    rule_ids: Array<{ rule: string; documented: boolean; occurrences: number }>;
  };
  hardcoded_numbers: Array<{ file: string; line: number; text: string; matched: string }>;
}

export function tokenizeWords(text: string): Set<string> {
  const words = text.toLowerCase().match(/[a-z0-9]+/g) || [];
  return new Set(words);
}

export function jaccardSimilarity(setA: Set<string>, setB: Set<string>): { sim: number; common: string[] } {
  if (setA.size === 0 && setB.size === 0) return { sim: 1.0, common: [] };
  let intersection = 0;
  const common: string[] = [];
  for (const item of setA) {
    if (setB.has(item)) {
      intersection++;
      common.push(item);
    }
  }
  const union = setA.size + setB.size - intersection;
  return { sim: union === 0 ? 0 : intersection / union, common };
}

export function parseFrontmatter(raw: string): {
  valid: boolean;
  hasTabs: boolean;
  name: string;
  description: string;
} {
  const lines = raw.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") {
    return { valid: false, hasTabs: false, name: "", description: "" };
  }

  let closingIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      closingIndex = i;
      break;
    }
  }

  if (closingIndex <= 0) {
    return { valid: false, hasTabs: false, name: "", description: "" };
  }

  let valid = true;
  let hasTabs = false;
  let name = "";
  let description = "";

  const fmLines = lines.slice(1, closingIndex);

  for (let i = 0; i < fmLines.length; i++) {
    const line = fmLines[i];
    if (line.includes("\t")) {
      hasTabs = true;
      valid = false;
    }

    const nameMatch = line.match(/^name:\s*(.+)$/);
    if (nameMatch) {
      name = nameMatch[1].trim().replace(/^['"]|['"]$/g, "");
    }

    if (line.startsWith("description:")) {
      const rest = line.slice("description:".length).trim();
      if (rest === ">-" || rest === ">" || rest === "|" || rest === "|-" || rest === "") {
        // Multi-line block scalar
        const descParts: string[] = [];
        for (let j = i + 1; j < fmLines.length; j++) {
          const nextLine = fmLines[j];
          if (/^[a-zA-Z0-9_-]+:/.test(nextLine)) {
            // Next key encountered
            break;
          }
          if (/^\s+/.test(nextLine)) {
            descParts.push(nextLine.trim());
            i = j; // advance outer loop
          } else if (nextLine.trim() === "") {
            // Blank line within scalar
          } else {
            break;
          }
        }
        description = descParts.join(" ");
      } else {
        description = rest.replace(/^['"]|['"]$/g, "");
      }
    }
  }

  return { valid, hasTabs, name, description };
}

export function generateInventory(root = REPO_ROOT): InventoryReport {
  const skillsDir = join(root, "skills");
  const rulesDir = join(root, "rules");
  const workflowsDir = join(root, "workflows");
  const runtimeDir = join(root, "runtime");
  const docsDir = join(root, "docs");

  // 1. Enumerate skills
  const skills: SkillInfo[] = [];
  const skillFolders = existsSync(skillsDir)
    ? readdirSync(skillsDir).filter((f) => {
        const full = join(skillsDir, f);
        return statSync(full).isDirectory();
      }).sort()
    : [];

  let totalMetadataBytes = 0;

  for (const folder of skillFolders) {
    const skillMdPath = join(skillsDir, folder, "SKILL.md");
    if (!existsSync(skillMdPath)) {
      skills.push({
        folder: `skills/${folder}`,
        name: folder,
        valid_frontmatter: false,
        has_tabs_in_frontmatter: false,
        description: "",
        description_length: 0,
        file_bytes: 0,
        tokens_est: 0,
      });
      continue;
    }

    const raw = readFileSync(skillMdPath, "utf8");
    const fileBytes = Buffer.byteLength(raw, "utf8");
    const tokensEst = Math.ceil(fileBytes / 3.5);

    const fm = parseFrontmatter(raw);
    const skillName = fm.name || folder;
    const skillDesc = fm.description;

    const metaStr = `name: ${skillName}\ndescription: ${skillDesc}\n`;
    totalMetadataBytes += Buffer.byteLength(metaStr, "utf8");

    skills.push({
      folder: `skills/${folder}`,
      name: skillName,
      valid_frontmatter: fm.valid,
      has_tabs_in_frontmatter: fm.hasTabs,
      description: skillDesc,
      description_length: skillDesc.length,
      file_bytes: fileBytes,
      tokens_est: tokensEst,
    });
  }

  // Jaccard similarity pairs
  const jaccardPairs: JaccardPair[] = [];
  for (let i = 0; i < skills.length; i++) {
    const tokensA = tokenizeWords(skills[i].description);
    for (let j = i + 1; j < skills.length; j++) {
      const tokensB = tokenizeWords(skills[j].description);
      const { sim, common } = jaccardSimilarity(tokensA, tokensB);
      if (sim >= 0.5) {
        jaccardPairs.push({
          skill_a: skills[i].folder,
          skill_b: skills[j].folder,
          similarity: Math.round(sim * 1000) / 1000,
          common_tokens: common,
        });
      }
    }
  }

  // 2. Boot Set Calculation
  // Definition: AGENTS.md + rules/*.md + skills/skills-index.md + runtime/context-map.json + name & description of ALL SKILL.md
  const bootFilesList: string[] = [];

  const agentsPath = join(rulesDir, "AGENTS.md");
  if (existsSync(agentsPath)) bootFilesList.push(agentsPath);

  if (existsSync(rulesDir)) {
    const rFiles = readdirSync(rulesDir)
      .filter((f) => f.endsWith(".md") && f !== "AGENTS.md")
      .sort();
    for (const rf of rFiles) {
      bootFilesList.push(join(rulesDir, rf));
    }
  }

  const skillsIndexPath = join(skillsDir, "skills-index.md");
  if (existsSync(skillsIndexPath)) bootFilesList.push(skillsIndexPath);

  const contextMapPath = join(runtimeDir, "context-map.json");
  if (existsSync(contextMapPath)) bootFilesList.push(contextMapPath);

  const bootFiles: BootFile[] = [];
  let fileTotalBytes = 0;
  let fileTotalTokens = 0;

  for (const fp of bootFilesList) {
    const content = readFileSync(fp, "utf8");
    const b = Buffer.byteLength(content, "utf8");
    const tok = Math.ceil(b / 3.5);
    bootFiles.push({
      path: relative(root, fp).replace(/\\/g, "/"),
      bytes: b,
      tokens_est: tok,
    });
    fileTotalBytes += b;
    fileTotalTokens += tok;
  }

  const metaTokens = Math.ceil(totalMetadataBytes / 3.5);
  const bootSetTotalBytes = fileTotalBytes + totalMetadataBytes;
  const bootSetTotalTokens = fileTotalTokens + metaTokens;

  const bootSet: BootSet = {
    definition: "AGENTS.md + rules/*.md + skills/skills-index.md + runtime/context-map.json + name & description of all SKILL.md",
    rationale: "Matches the exact set of documentation, rule files, and index metadata loaded during agent initialization and progressive disclosure.",
    files: bootFiles,
    skills_metadata: {
      count: skills.length,
      bytes: totalMetadataBytes,
      tokens_est: metaTokens,
    },
    total_bytes: bootSetTotalBytes,
    total_tokens_est: bootSetTotalTokens,
  };

  // 3. Consistency checks
  let indexedSkills: string[] = [];
  if (existsSync(skillsIndexPath)) {
    const raw = readFileSync(skillsIndexPath, "utf8");
    const matches = raw.match(/- \*\*`([a-z0-9-]+)`\*\*/g) || [];
    indexedSkills = matches.map((m) => m.replace(/- \*\*`|`\*\*/g, "").trim());
    if (indexedSkills.length === 0) {
      const altMatches = raw.match(/`([a-z0-9-]+)`/g) || [];
      indexedSkills = [...new Set(altMatches.map((m) => m.replace(/`/g, "").trim()))];
    }
  }

  let contextMapSkills: string[] = [];
  if (existsSync(contextMapPath)) {
    try {
      const parsed = JSON.parse(readFileSync(contextMapPath, "utf8"));
      for (const layer of Object.keys(parsed)) {
        if (Array.isArray(parsed[layer])) {
          for (const item of parsed[layer]) {
            contextMapSkills.push(item.replace(/^skills\//, ""));
          }
        }
      }
    } catch {}
  }

  const actualSkillNames = skills.map((s) => s.folder.replace(/^skills\//, ""));
  const actualSkillSet = new Set(actualSkillNames);
  const indexSkillSet = new Set(indexedSkills);
  const contextMapSkillSet = new Set(contextMapSkills);

  const ghostSkillsIndex = indexedSkills.filter((s) => !actualSkillSet.has(s));
  const unmappedSkillsIndex = actualSkillNames.filter((s) => !indexSkillSet.has(s));
  const ghostSkillsContextMap = contextMapSkills.filter((s) => !actualSkillSet.has(s));
  const unmappedSkillsContextMap = actualSkillNames.filter((s) => !contextMapSkillSet.has(s));

  // 4. Reference Graph Check
  const danglingFiles: Array<{ source_file: string; link_text: string; target_path: string }> = [];
  const directiveRefs: Array<{ source_file: string; line: number; text: string; directive_num: number; issue: string }> = [];
  const stageRefs: Array<{ source_file: string; line: number; text: string; stage: string; issue: string }> = [];

  const knownStages = new Set(["1", "1.5", "2", "2.5", "2.7", "3", "4", "4.5", "5"]);

  function scanMarkdownFiles(dir: string) {
    if (!existsSync(dir)) return;
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      const full = join(dir, ent.name);
      if (ent.isDirectory()) {
        scanMarkdownFiles(full);
      } else if (ent.isFile() && ent.name.endsWith(".md")) {
        const relPath = relative(root, full).replace(/\\/g, "/");
        const content = readFileSync(full, "utf8");
        const lines = content.split(/\r?\n/);

        // Check file links [text](target)
        const linkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
        let match: RegExpExecArray | null;
        while ((match = linkRegex.exec(content)) !== null) {
          const linkText = match[1];
          let target = match[2].trim();

          // Skip external, anchors, mailto, protocol links
          if (/^(https?:|mailto:|file:|#)/.test(target)) continue;

          // Strip anchor
          const anchorIdx = target.indexOf("#");
          if (anchorIdx !== -1) {
            target = target.slice(0, anchorIdx);
          }
          if (!target) continue;

          // Resolve target relative to current file or repo root
          const resolvedRel = resolve(dirname(full), target);
          const resolvedRoot = resolve(root, target.replace(/^\//, ""));

          if (!existsSync(resolvedRel) && !existsSync(resolvedRoot)) {
            danglingFiles.push({
              source_file: relPath,
              link_text: linkText,
              target_path: target,
            });
          }
        }

        // Check directive and stage references line-by-line
        lines.forEach((line, idx) => {
          const lineNum = idx + 1;

          // Directive references: Directive #N, Direktif #N
          const dirMatches = line.matchAll(/(?:Direktif|Directive)\s*#(\d+)/gi);
          for (const dm of dirMatches) {
            const num = parseInt(dm[1], 10);
            if (num === 22) {
              directiveRefs.push({
                source_file: relPath,
                line: lineNum,
                text: line.trim(),
                directive_num: num,
                issue: "Points to deleted Directive #22",
              });
            } else if (num < 1 || num > 30) {
              directiveRefs.push({
                source_file: relPath,
                line: lineNum,
                text: line.trim(),
                directive_num: num,
                issue: `Directive #${num} out of valid range (1..29)`,
              });
            }
          }

          // Stage references: Stage N
          const stageMatches = line.matchAll(/\bStage\s+([0-9]+(?:\.[0-9]+)?)\b/gi);
          for (const sm of stageMatches) {
            const st = sm[1];
            if (!knownStages.has(st)) {
              stageRefs.push({
                source_file: relPath,
                line: lineNum,
                text: line.trim(),
                stage: st,
                issue: `Stage ${st} is not defined in boot-sequence.md`,
              });
            }
          }
        });
      }
    }
  }

  scanMarkdownFiles(skillsDir);
  scanMarkdownFiles(rulesDir);
  scanMarkdownFiles(workflowsDir);
  scanMarkdownFiles(docsDir);

  // 5. Tool name candidates on tool lines in SKILL.md
  let deniedTools: string[] = [];
  const deniedPath = join(runtimeDir, "denied-tool-names.json");
  if (existsSync(deniedPath)) {
    try {
      const parsed = JSON.parse(readFileSync(deniedPath, "utf8"));
      deniedTools = Array.isArray(parsed) ? parsed : (parsed.denied_tools || parsed.tools || []);
    } catch {}
  }
  const deniedSet = new Set(deniedTools);

  let knownTools: string[] = [];
  const knownPath = join(runtimeDir, "known-tools.json");
  if (existsSync(knownPath)) {
    try {
      const parsed = JSON.parse(readFileSync(knownPath, "utf8"));
      knownTools = Array.isArray(parsed) ? parsed : (parsed.tools || []);
    } catch {}
  }
  const knownSet = new Set(knownTools);

  const toolFreq: Record<string, { count: number; locations: string[] }> = {};

  for (const s of skills) {
    const sp = join(root, s.folder, "SKILL.md");
    if (!existsSync(sp)) continue;
    const lines = readFileSync(sp, "utf8").split(/\r?\n/);
    lines.forEach((l, idx) => {
      if (/tool|alat|panggil|call|gunakan/i.test(l)) {
        const matches = l.match(/`([a-zA-Z0-9_.-]+)`/g) || [];
        for (const m of matches) {
          const tName = m.slice(1, -1);
          if (!toolFreq[tName]) {
            toolFreq[tName] = { count: 0, locations: [] };
          }
          toolFreq[tName].count++;
          toolFreq[tName].locations.push(`${s.folder}/SKILL.md:${idx + 1}`);
        }
      }
    });
  }

  const denylistMatches: Array<{ tool: string; count: number; locations: string[] }> = [];
  const knownToolMatches: Array<{ tool: string; count: number }> = [];
  const unclassifiedCandidates: Array<{ candidate: string; count: number }> = [];

  for (const [candidate, data] of Object.entries(toolFreq)) {
    if (deniedSet.has(candidate)) {
      denylistMatches.push({ tool: candidate, count: data.count, locations: data.locations });
    } else if (knownSet.has(candidate)) {
      knownToolMatches.push({ tool: candidate, count: data.count });
    } else {
      unclassifiedCandidates.push({ candidate, count: data.count });
    }
  }

  // 6. Gate behavior documentation sync
  const antiPatternsPath = join(root, "templates/enforcement/anti-patterns.json");

  const documentedFlags: Array<{ flag: string; documented: boolean; occurrences: number }> = [];
  const documentedRules: Array<{ rule: string; documented: boolean; occurrences: number }> = [];

  let allDocsText = "";
  function gatherText(dir: string) {
    if (!existsSync(dir)) return;
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      const full = join(dir, ent.name);
      if (ent.isDirectory()) gatherText(full);
      else if (ent.isFile() && ent.name.endsWith(".md")) {
        allDocsText += "\n" + readFileSync(full, "utf8");
      }
    }
  }
  gatherText(rulesDir);
  gatherText(skillsDir);
  gatherText(workflowsDir);
  gatherText(docsDir);

  const gateCliFlags = [
    "--baseline",
    "--update-baseline",
    "--max-warn",
    "--json",
    "--root",
    "--rules",
    "--rules-diff",
    "--check-workflow",
    "--stdin",
    "--allow-raise",
    "--reason",
  ];

  for (const flag of gateCliFlags) {
    const count = (allDocsText.match(new RegExp(flag.replace(/-/g, "\\-"), "g")) || []).length;
    documentedFlags.push({
      flag,
      documented: count > 0,
      occurrences: count,
    });
  }

  if (existsSync(antiPatternsPath)) {
    try {
      const ap = JSON.parse(readFileSync(antiPatternsPath, "utf8"));
      for (const r of ap.rules || []) {
        const id = r.id;
        const count = (allDocsText.match(new RegExp(`\\b${id}\\b`, "g")) || []).length;
        documentedRules.push({
          rule: id,
          documented: count > 0,
          occurrences: count,
        });
      }
    } catch {}
  }

  // 7. Hardcoded numbers in prose
  const hardcodedNumbers: Array<{ file: string; line: number; text: string; matched: string }> = [];
  const hardcodedRegex = /\b(\d+)\s+(skill|skills|aturan|rules|direktif)\b/i;

  function scanHardcodedNumbers(dir: string) {
    if (!existsSync(dir)) return;
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      const full = join(dir, ent.name);
      if (ent.isDirectory()) {
        scanHardcodedNumbers(full);
      } else if (ent.isFile() && (ent.name.endsWith(".md") || ent.name.startsWith("README"))) {
        const relPath = relative(root, full).replace(/\\/g, "/");
        if (relPath.includes("GENERATED-INVENTORY")) continue;
        const lines = readFileSync(full, "utf8").split(/\r?\n/);
        lines.forEach((l, idx) => {
          const match = l.match(hardcodedRegex);
          if (match) {
            hardcodedNumbers.push({
              file: relPath,
              line: idx + 1,
              text: l.trim(),
              matched: match[0],
            });
          }
        });
      }
    }
  }

  scanHardcodedNumbers(docsDir);
  scanHardcodedNumbers(rulesDir);
  scanHardcodedNumbers(skillsDir);

  return {
    timestamp: new Date().toISOString(),
    repo_root: root,
    skills,
    description_jaccard_pairs: jaccardPairs,
    boot_set: bootSet,
    consistency: {
      total_skill_folders: skills.length,
      skills_in_index: indexedSkills.length,
      skills_in_context_map: contextMapSkills.length,
      ghost_skills_index: ghostSkillsIndex,
      ghost_skills_context_map: ghostSkillsContextMap,
      unmapped_skills_index: unmappedSkillsIndex,
      unmapped_skills_context_map: unmappedSkillsContextMap,
    },
    reference_graph: {
      dangling_file_references: danglingFiles,
      directive_references: directiveRefs,
      stage_references: stageRefs,
    },
    tool_candidates: {
      denylist_matches: denylistMatches,
      known_tool_matches: knownToolMatches,
      unclassified_candidates: unclassifiedCandidates,
    },
    gate_sync: {
      cli_flags: documentedFlags,
      rule_ids: documentedRules,
    },
    hardcoded_numbers: hardcodedNumbers,
  };
}

export function writeGeneratedInventoryDoc(inv: InventoryReport, outPath: string) {
  const content = `# Astesia Framework Generated Inventory

> **Note:** This document is automatically generated by \`tools/gen-inventory.ts --write-docs\`.
> Do NOT edit this file manually. Any manual edits will be overwritten by the generator.

## 1. Skill Catalog Summary
- **Total Skills:** ${inv.skills.length}
- **Index Consistency:** ${inv.consistency.ghost_skills_index.length === 0 && inv.consistency.unmapped_skills_index.length === 0 ? "CONSISTENT" : "INCONSISTENT"}
- **Context Map Consistency:** ${inv.consistency.ghost_skills_context_map.length === 0 && inv.consistency.unmapped_skills_context_map.length === 0 ? "CONSISTENT" : "INCONSISTENT"}

| Skill Name | Folder | Description Length | File Size (Bytes) | Est. Tokens |
|---|---|---|---|---|
${inv.skills.map((s) => `| \`${s.name}\` | \`${s.folder}\` | ${s.description_length} | ${s.file_bytes} | ${s.tokens_est} |`).join("\n")}

## 2. Boot Set Token Budget
- **Definition:** ${inv.boot_set.definition}
- **Total Boot Set Bytes:** ${inv.boot_set.total_bytes}
- **Total Estimated Tokens:** ${inv.boot_set.total_tokens_est}
- **Skills Frontmatter Metadata Tokens:** ${inv.boot_set.skills_metadata.tokens_est} (${inv.boot_set.skills_metadata.count} skills)

| Boot File | Bytes | Est. Tokens |
|---|---|---|
${inv.boot_set.files.map((f) => `| \`${f.path}\` | ${f.bytes} | ${f.tokens_est} |`).join("\n")}
| *Skill Metadata (name + desc)* | ${inv.boot_set.skills_metadata.bytes} | ${inv.boot_set.skills_metadata.tokens_est} |

## 3. Enforcement Gate Sync
### Supported CLI Flags (${inv.gate_sync.cli_flags.length})
| CLI Flag | Documented | Doc Occurrences |
|---|---|---|
${inv.gate_sync.cli_flags.map((f) => `| \`${f.flag}\` | ${f.documented ? "Yes" : "No"} | ${f.occurrences} |`).join("\n")}

### Anti-Pattern Rule IDs (${inv.gate_sync.rule_ids.length})
| Rule ID | Documented | Doc Occurrences |
|---|---|---|
${inv.gate_sync.rule_ids.map((r) => `| \`${r.rule}\` | ${r.documented ? "Yes" : "No"} | ${r.occurrences} |`).join("\n")}
`;

  writeFileSync(outPath, content, "utf8");
  console.log(`Generated docs written to ${outPath}`);
}

// CLI entry point
if (import.meta.main || require.main === module) {
  const args = process.argv.slice(2);
  const isWriteDocs = args.includes("--write-docs");
  const outIdx = args.indexOf("--output");
  const outPath = outIdx !== -1 && args[outIdx + 1] ? resolve(args[outIdx + 1]) : null;

  const inv = generateInventory(REPO_ROOT);

  if (isWriteDocs) {
    const docPath = join(REPO_ROOT, "docs", "GENERATED-INVENTORY.md");
    writeGeneratedInventoryDoc(inv, docPath);
  }

  const jsonStr = JSON.stringify(inv, null, 2);
  if (outPath) {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, jsonStr, "utf8");
    console.log(`Inventory JSON written to ${outPath}`);
  } else if (!isWriteDocs) {
    console.log(jsonStr);
  }
}
