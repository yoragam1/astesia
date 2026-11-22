/**
 * tools/framework-lint.ts
 * Mechanical linting of Astesia Framework conventions, consistency,
 * reference integrity, tool names, guardrails, and gate sync.
 *
 * Exit codes:
 *   0 = Clean (no violations)
 *   1 = Violations found
 *   2 = Tool failure (bad config, crash, syntax error)
 *
 * Error codes: FL-001 .. FL-018
 */

import { existsSync, readdirSync, readFileSync, statSync, mkdirSync } from "node:fs";
import { join, resolve, relative, dirname } from "node:path";
import { generateInventory, parseFrontmatter, tokenizeWords } from "./gen-inventory";

export const REPO_ROOT = resolve(__dirname, "..");

export interface LintViolation {
  code: string;
  file: string;
  line?: number;
  message: string;
}

export interface LintConfig {
  description_max_length?: number;
  description_length_exemptions?: Array<{ skill: string; max_length: number; reason: string }>;
  gate_internal_flags_exempt?: Array<{ flag: string; reason: string }>;
  unmapped_skills_exempt?: Array<{ skill: string; reason: string }>;
  unknown_tools_exempt?: Array<{ tool: string; reason: string }>;
  token_budget_max?: number;
}

export function loadLintConfig(configPath?: string): LintConfig {
  const p = configPath || join(REPO_ROOT, "tools", "lint-config.json");
  if (!existsSync(p)) {
    return {
      description_max_length: 320,
      description_length_exemptions: [],
      gate_internal_flags_exempt: [],
      unmapped_skills_exempt: [],
      token_budget_max: 15000,
    };
  }
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch (err: any) {
    throw new Error(`Failed to parse lint config at ${p}: ${err.message}`);
  }
}

/**
 * Check FL-001, FL-002, FL-003, FL-004, FL-005, FL-011, FL-012
 */
export function checkSkills(root: string, config: LintConfig): LintViolation[] {
  const violations: LintViolation[] = [];
  const skillsDir = join(root, "skills");
  if (!existsSync(skillsDir)) return violations;

  const entries = readdirSync(skillsDir, { withFileTypes: true });
  const skillFolders = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();

  const nameMap = new Map<string, string[]>();
  const maxDescLen = config.description_max_length ?? 320;
  const descExemptions = new Map<string, number>();
  for (const ex of config.description_length_exemptions || []) {
    if (ex.reason && ex.reason.length >= 15) {
      descExemptions.set(ex.skill, ex.max_length);
    }
  }

  // Denied tools
  let deniedTools: string[] = [];
  const deniedPath = join(root, "runtime", "denied-tool-names.json");
  if (existsSync(deniedPath)) {
    try {
      const parsed = JSON.parse(readFileSync(deniedPath, "utf8"));
      deniedTools = Array.isArray(parsed) ? parsed : (parsed.denied_tools || parsed.tools || []);
    } catch {}
  }
  const deniedSet = new Set(deniedTools);

  // Known tools (for FL-019)
  let knownTools: string[] = [];
  const knownPath = join(root, "runtime", "known-tools.json");
  if (existsSync(knownPath)) {
    try {
      const parsed = JSON.parse(readFileSync(knownPath, "utf8"));
      knownTools = Array.isArray(parsed) ? parsed : (parsed.tools || []);
    } catch {}
  }
  const knownToolsSet = new Set(knownTools);
  const exemptToolsSet = new Set((config.unknown_tools_exempt || []).map((x) => x.tool));

  // Risk skills config
  let riskSkills: Array<{ name: string; required_heading: string; required_keywords: string[] }> = [];
  const riskPath = join(root, "runtime", "risk-skills.json");
  if (existsSync(riskPath)) {
    try {
      const parsed = JSON.parse(readFileSync(riskPath, "utf8"));
      riskSkills = parsed.skills || [];
    } catch {}
  }
  const riskMap = new Map<string, { required_heading: string; required_keywords: string[] }>();
  for (const rs of riskSkills) {
    riskMap.set(rs.name, rs);
  }

  for (const folder of skillFolders) {
    const folderPath = `skills/${folder}`;
    const skillMd = join(skillsDir, folder, "SKILL.md");

    // FL-001: folder skill tanpa SKILL.md
    if (!existsSync(skillMd)) {
      violations.push({
        code: "FL-001",
        file: folderPath,
        message: `Skill directory '${folderPath}' missing SKILL.md`,
      });
      continue;
    }

    const raw = readFileSync(skillMd, "utf8");
    const fm = parseFrontmatter(raw);

    // FL-002: frontmatter hilang/tak valid (termasuk tab sebagai indentasi)
    if (!fm.valid) {
      violations.push({
        code: "FL-002",
        file: `${folderPath}/SKILL.md`,
        message: fm.hasTabs
          ? `Frontmatter contains forbidden tab indentation`
          : `Missing or invalid YAML frontmatter`,
      });
      continue;
    }

    // FL-003: name !== nama folder
    if (fm.name !== folder) {
      violations.push({
        code: "FL-003",
        file: `${folderPath}/SKILL.md`,
        message: `Skill name '${fm.name}' does not match directory name '${folder}'`,
      });
    }

    // Record for FL-004
    if (!nameMap.has(fm.name)) {
      nameMap.set(fm.name, []);
    }
    nameMap.get(fm.name)!.push(folderPath);

    // FL-005: description kosong atau lebih panjang dari batas
    const allowedLen = descExemptions.get(folder) ?? descExemptions.get(fm.name) ?? maxDescLen;
    if (!fm.description || fm.description.trim() === "") {
      violations.push({
        code: "FL-005",
        file: `${folderPath}/SKILL.md`,
        message: `Skill description is empty`,
      });
    } else if (fm.description.length > allowedLen) {
      violations.push({
        code: "FL-005",
        file: `${folderPath}/SKILL.md`,
        message: `Skill description length (${fm.description.length}) exceeds maximum allowed (${allowedLen})`,
      });
    }

    // FL-011: nama tool terlarang
    const lines = raw.split(/\r?\n/);
    lines.forEach((l, idx) => {
      if (/tool|alat|panggil|call|gunakan/i.test(l)) {
        const matches = l.match(/`([a-zA-Z0-9_.-]+)`/g) || [];
        for (const m of matches) {
          const tName = m.slice(1, -1);
          if (deniedSet.has(tName)) {
            violations.push({
              code: "FL-011",
              file: `${folderPath}/SKILL.md`,
              line: idx + 1,
              message: `Forbidden tool name '${tName}' used on tool invocation line`,
            });
          }
        }
      }
    });

    // FL-019: unknown snake_case tool identifiers on tool lines
    lines.forEach((l, idx) => {
      if (/\b(tool|tools|alat|panggil|call|calling)\b/i.test(l)) {
        const matches = [...l.matchAll(/`([a-z0-9]+_[a-z0-9_]+)`/g)];
        for (const m of matches) {
          const tName = m[1];
          if (!knownToolsSet.has(tName) && !exemptToolsSet.has(tName)) {
            violations.push({
              code: "FL-019",
              file: `${folderPath}/SKILL.md`,
              line: idx + 1,
              message: `Unknown tool identifier '${tName}' on tool line (must be in known-tools.json or exempted in lint-config.json)`,
            });
          }
        }
      }
    });

    // FL-012: skill berisiko tanpa guardrails dan kata kunci wajib
    if (riskMap.has(folder) || riskMap.has(fm.name)) {
      const riskCfg = riskMap.get(folder) || riskMap.get(fm.name)!;
      const headingRegex = new RegExp(`^${riskCfg.required_heading.replace(/#/g, "\\#")}\\b`, "m");
      if (!headingRegex.test(raw)) {
        violations.push({
          code: "FL-012",
          file: `${folderPath}/SKILL.md`,
          message: `Risk skill '${folder}' missing required heading '${riskCfg.required_heading}'`,
        });
      }

      for (const kw of riskCfg.required_keywords || []) {
        const kwRegex = new RegExp(`\\b${kw}\\b`, "i");
        if (!kwRegex.test(raw)) {
          violations.push({
            code: "FL-012",
            file: `${folderPath}/SKILL.md`,
            message: `Risk skill '${folder}' missing required guardrail keyword '${kw}'`,
          });
        }
      }
    }
  }

  // FL-004: nama skill duplikat
  for (const [name, paths] of nameMap.entries()) {
    if (paths.length > 1) {
      violations.push({
        code: "FL-004",
        file: paths.join(", "),
        message: `Duplicate skill name '${name}' found across multiple folders: ${paths.join(", ")}`,
      });
    }
  }

  return violations;
}

/**
 * Check FL-006, FL-007, FL-018
 */
export function checkConsistency(root: string, config: LintConfig): LintViolation[] {
  const violations: LintViolation[] = [];
  const skillsDir = join(root, "skills");
  const actualSkills = existsSync(skillsDir)
    ? readdirSync(skillsDir).filter((f) => statSync(join(skillsDir, f)).isDirectory())
    : [];
  const actualSet = new Set(actualSkills);

  // FL-006: skills-index.md sync
  const indexPath = join(skillsDir, "skills-index.md");
  if (!existsSync(indexPath)) {
    violations.push({
      code: "FL-006",
      file: "skills/skills-index.md",
      message: `skills/skills-index.md missing`,
    });
  } else {
    const raw = readFileSync(indexPath, "utf8");
    const matches = raw.match(/- \*\*`([a-z0-9-]+)`\*\*/g) || [];
    let indexedSkills = matches.map((m) => m.replace(/- \*\*`|`\*\*/g, "").trim());
    if (indexedSkills.length === 0) {
      const alt = raw.match(/`([a-z0-9-]+)`/g) || [];
      indexedSkills = [...new Set(alt.map((m) => m.replace(/`/g, "").trim()))];
    }
    const indexSet = new Set(indexedSkills);

    for (const g of indexedSkills) {
      if (!actualSet.has(g)) {
        violations.push({
          code: "FL-006",
          file: "skills/skills-index.md",
          message: `Ghost skill in skills-index.md: '${g}' does not exist in skills/`,
        });
      }
    }

    for (const act of actualSkills) {
      if (!indexSet.has(act)) {
        violations.push({
          code: "FL-006",
          file: "skills/skills-index.md",
          message: `Missing skill in skills-index.md: '${act}' is not listed in index`,
        });
      }
    }
  }

  // FL-007: context-map.json sync
  const contextMapPath = join(root, "runtime", "context-map.json");
  if (!existsSync(contextMapPath)) {
    violations.push({
      code: "FL-007",
      file: "runtime/context-map.json",
      message: `runtime/context-map.json missing`,
    });
  } else {
    try {
      const parsed = JSON.parse(readFileSync(contextMapPath, "utf8"));
      const mappedSkills: string[] = [];
      for (const layer of Object.keys(parsed)) {
        if (Array.isArray(parsed[layer])) {
          for (const item of parsed[layer]) {
            mappedSkills.push(item.replace(/^skills\//, ""));
          }
        }
      }
      const mappedSet = new Set(mappedSkills);

      const unmappedExemptions = new Set(
        (config.unmapped_skills_exempt || [])
          .filter((e) => e.reason && e.reason.length >= 15)
          .map((e) => e.skill)
      );

      for (const ms of mappedSkills) {
        if (!actualSet.has(ms)) {
          violations.push({
            code: "FL-007",
            file: "runtime/context-map.json",
            message: `Ghost skill in runtime/context-map.json: '${ms}' does not exist in skills/`,
          });
        }
      }

      for (const act of actualSkills) {
        if (!mappedSet.has(act) && !unmappedExemptions.has(act)) {
          violations.push({
            code: "FL-007",
            file: "runtime/context-map.json",
            message: `Unmapped skill '${act}' is not assigned in runtime/context-map.json without valid exemption`,
          });
        }
      }
    } catch (err: any) {
      violations.push({
        code: "FL-007",
        file: "runtime/context-map.json",
        message: `runtime/context-map.json is not valid JSON: ${err.message}`,
      });
    }
  }

  // FL-018: plugin/version inconsistency
  const pluginPath = join(root, "plugin.json");
  const pkgPath = join(root, "package.json");
  if (existsSync(pluginPath) && existsSync(pkgPath)) {
    try {
      const plugin = JSON.parse(readFileSync(pluginPath, "utf8"));
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
      if (plugin.version && pkg.version && plugin.version !== pkg.version) {
        violations.push({
          code: "FL-018",
          file: "plugin.json",
          message: `Version mismatch: plugin.json version (${plugin.version}) !== package.json version (${pkg.version})`,
        });
      }
    } catch (err: any) {
      violations.push({
        code: "FL-018",
        file: "plugin.json",
        message: `Failed to compare plugin.json and package.json: ${err.message}`,
      });
    }
  }

  return violations;
}

/**
 * Check FL-008, FL-009, FL-010
 */
export function checkReferences(root: string, _config: LintConfig): LintViolation[] {
  const violations: LintViolation[] = [];
  const knownStages = new Set(["1", "1.5", "2", "2.5", "2.7", "3", "4", "4.5", "5"]);

  function scanDir(dir: string) {
    if (!existsSync(dir)) return;
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      const full = join(dir, ent.name);
      if (ent.isDirectory()) {
        scanDir(full);
      } else if (ent.isFile() && ent.name.endsWith(".md")) {
        const relPath = relative(root, full).replace(/\\/g, "/");
        const raw = readFileSync(full, "utf8");
        const lines = raw.split(/\r?\n/);

        // FL-008: dangling file reference
        const linkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
        let match: RegExpExecArray | null;
        while ((match = linkRegex.exec(raw)) !== null) {
          let target = match[2].trim();
          if (/^(https?:|mailto:|#)/.test(target)) continue;

          let targetPath = target;
          if (targetPath.startsWith("file:///")) {
            targetPath = targetPath.replace(/^file:\/\/\//, "");
          }

          const anchorIdx = targetPath.indexOf("#");
          if (anchorIdx !== -1) targetPath = targetPath.slice(0, anchorIdx);
          if (!targetPath) continue;

          const resolvedRel = resolve(dirname(full), targetPath);
          const resolvedRoot = resolve(root, targetPath.replace(/^\//, ""));

          if (!existsSync(resolvedRel) && !existsSync(resolvedRoot) && !existsSync(targetPath)) {
            violations.push({
              code: "FL-008",
              file: relPath,
              message: `Dangling markdown link target: '${target}'`,
            });
          }
        }

        // FL-009 & FL-010: line by line
        lines.forEach((line, idx) => {
          const lineNum = idx + 1;

          // FL-009: Directive #22 or out of range
          const dirMatches = line.matchAll(/(?:Direktif|Directive)\s*#(\d+)/gi);
          for (const dm of dirMatches) {
            const num = parseInt(dm[1], 10);
            if (num === 22) {
              // Directive 22 is deleted
              violations.push({
                code: "FL-009",
                file: relPath,
                line: lineNum,
                message: `Reference to deleted Directive #22: '${dm[0]}'`,
              });
            } else if (num < 1 || num > 30) {
              violations.push({
                code: "FL-009",
                file: relPath,
                line: lineNum,
                message: `Directive #${num} out of valid range (1..29)`,
              });
            }
          }

          // FL-010: Stage N non-existent
          const stageMatches = line.matchAll(/\bStage\s+([0-9]+(?:\.[0-9]+)?)\b/gi);
          for (const sm of stageMatches) {
            const st = sm[1];
            if (!knownStages.has(st)) {
              violations.push({
                code: "FL-010",
                file: relPath,
                line: lineNum,
                message: `Reference to non-existent Boot Stage ${st}`,
              });
            }
          }
        });
      }
    }
  }

  scanDir(join(root, "skills"));
  scanDir(join(root, "rules"));
  scanDir(join(root, "workflows"));
  scanDir(join(root, "docs"));

  return violations;
}

/**
 * Check FL-013, FL-014, FL-015, FL-016
 */
export function checkRulesAndDocs(root: string, config: LintConfig): LintViolation[] {
  const violations: LintViolation[] = [];
  const rulesDir = join(root, "rules");
  const docsDir = join(root, "docs");
  const workflowsDir = join(root, "workflows");
  const skillsDir = join(root, "skills");

  // FL-013: AGENTS.md untrusted content rule
  const agentsPath = join(rulesDir, "AGENTS.md");
  if (!existsSync(agentsPath)) {
    violations.push({
      code: "FL-013",
      file: "rules/AGENTS.md",
      message: `rules/AGENTS.md missing`,
    });
  } else {
    const raw = readFileSync(agentsPath, "utf8");
    const hasDataNotInstruction = /DATA\s*,\s*bukan\s*instruksi/i.test(raw) || /data\s*,\s*not\s*instructions/i.test(raw);
    const hasUntrustedSection = /untrusted|konten\s*tidak\s*tepercaya/i.test(raw);
    if (!hasDataNotInstruction || !hasUntrustedSection) {
      violations.push({
        code: "FL-013",
        file: "rules/AGENTS.md",
        message: `rules/AGENTS.md missing mandatory untrusted content guardrail rule ('DATA, bukan instruksi')`,
      });
    }
  }

  // FL-014: Gate sync check
  let allDocsText = "";
  function gather(dir: string) {
    if (!existsSync(dir)) return;
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      const full = join(dir, ent.name);
      if (ent.isDirectory()) gather(full);
      else if (ent.isFile() && ent.name.endsWith(".md")) {
        allDocsText += "\n" + readFileSync(full, "utf8");
      }
    }
  }
  gather(rulesDir);
  gather(docsDir);
  gather(workflowsDir);
  gather(skillsDir);

  const gateScript = join(root, "templates/enforcement/astesia-gate.ts");
  const gateRefPath = join(root, "docs/GATE-REFERENCE.md");

  if (!existsSync(gateRefPath)) {
    violations.push({
      code: "FL-014",
      file: "docs/GATE-REFERENCE.md",
      message: "docs/GATE-REFERENCE.md missing; must be generated from gate source",
    });
  }

  let extractedFlags: string[] = [];
  if (existsSync(gateScript)) {
    const rawScript = readFileSync(gateScript, "utf8");
    const optsMatches = [...rawScript.matchAll(/opts\.get\(["']([^"']+)["']\)/g)].map((m) => "--" + m[1]);
    const flagsMatches = [...rawScript.matchAll(/flags\.has\(["']([^"']+)["']\)/g)].map((m) => "--" + m[1]);
    const directArgMatches = [...rawScript.matchAll(/args\.indexOf\(["']--([^"']+)["']\)/g)].map((m) => "--" + m[1]);
    extractedFlags = [...new Set([...optsMatches, ...flagsMatches, ...directArgMatches])].sort();
  } else {
    extractedFlags = [
      "--baseline",
      "--update-baseline",
      "--max-warn",
      "--json",
      "--root",
      "--rules",
      "--rules-diff",
      "--check-workflow",
      "--config",
      "--allow-raise",
      "--reason",
    ];
  }

  const exemptFlags = new Set(
    (config.gate_internal_flags_exempt || [])
      .filter((e) => e.reason && e.reason.length >= 15)
      .map((e) => e.flag)
  );

  for (const flag of extractedFlags) {
    if (exemptFlags.has(flag)) continue;
    const count = (allDocsText.match(new RegExp(flag.replace(/-/g, "\\-"), "g")) || []).length;
    if (count === 0) {
      violations.push({
        code: "FL-014",
        file: "docs/GATE-REFERENCE.md",
        message: `CLI flag '${flag}' from astesia-gate.ts is not documented in framework docs/rules`,
      });
    }
  }

  // FL-020: Known Limitations in docs/GATE-REFERENCE.md
  if (existsSync(gateRefPath)) {
    const gateRefContent = readFileSync(gateRefPath, "utf8");
    const requiredLimitationPoints: Array<{ id: string; keywords: string[] }> = [
      {
        id: "P1_FALSE_POSITIVE",
        keywords: ["false positive", "ASTESIA-000", "ASTESIA-004", "tinggi", "proyek nyata"],
      },
      {
        id: "P2_PLATFORM_VALIDATION",
        keywords: ["validasi", "Windows", "Linux", "diverifikasi", "gate"],
      },
      {
        id: "P3_WORKFLOW_LINT",
        keywords: ["--check-workflow", "lint", "workflow", "CODEOWNERS", "status check"],
      },
      {
        id: "P4_GENERATED_BYPASS",
        keywords: ["generated", "tokenizer", "bypass", "ratchet", "baseline"],
      },
      {
        id: "P5_REGEX_HEURISTIC",
        keywords: ["heuristik", "regex", "N+1", "lintas fungsi", "tidak terdeteksi"],
      },
    ];

    for (const pt of requiredLimitationPoints) {
      for (const kw of pt.keywords) {
        const kwRegex = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
        if (!kwRegex.test(gateRefContent)) {
          violations.push({
            code: "FL-020",
            file: "docs/GATE-REFERENCE.md",
            message: `Known Limitations section missing required keyword '${kw}' for limitation ${pt.id}`,
          });
        }
      }
    }
  }

  const antiPatternsPath = join(root, "templates/enforcement/anti-patterns.json");
  if (existsSync(antiPatternsPath)) {
    try {
      const ap = JSON.parse(readFileSync(antiPatternsPath, "utf8"));
      for (const r of ap.rules || []) {
        const id = r.id;
        const count = (allDocsText.match(new RegExp(`\\b${id}\\b`, "g")) || []).length;
        if (count === 0) {
          violations.push({
            code: "FL-014",
            file: "rules/quality-rules.md",
            message: `Gate rule ID '${id}' is not documented in framework docs/rules`,
          });
        }
      }
    } catch {}
  }

  // FL-015: Hardcoded numbers in prose
  const hardcodedRegex = /\b(\d+)\s+(skill|skills|aturan|rules|direktif)\b/i;
  function scanHardcoded(dir: string) {
    if (!existsSync(dir)) return;
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      const full = join(dir, ent.name);
      if (ent.isDirectory()) {
        scanHardcoded(full);
      } else if (ent.isFile() && (ent.name.endsWith(".md") || ent.name.startsWith("README"))) {
        const rel = relative(root, full).replace(/\\/g, "/");
        if (rel.includes("GENERATED-INVENTORY")) continue;
        const lines = readFileSync(full, "utf8").split(/\r?\n/);
        lines.forEach((l, idx) => {
          const match = l.match(hardcodedRegex);
          if (match) {
            violations.push({
              code: "FL-015",
              file: rel,
              line: idx + 1,
              message: `Forbidden hardcoded number in prose: '${match[0]}' (use GENERATED-INVENTORY.md reference)`,
            });
          }
        });
      }
    }
  }
  scanHardcoded(rulesDir);
  scanHardcoded(docsDir);
  scanHardcoded(skillsDir);

  // FL-016: Non-contiguous rule numbering in rules files
  if (existsSync(rulesDir)) {
    const rFiles = readdirSync(rulesDir)
      .filter((f) => f.endsWith(".md") && f !== "AGENTS.md" && f !== "coding-standards.md")
      .sort();

    for (const rf of rFiles) {
      const full = join(rulesDir, rf);
      const rel = `rules/${rf}`;
      const lines = readFileSync(full, "utf8").split(/\r?\n/);

      const intNumbers: number[] = [];
      for (const line of lines) {
        let m: RegExpMatchArray | null = null;
        if (rf === "engineering-rules.md") {
          // Match "# N." but ignore decimal sub-rules like "# 1.5."
          if (!line.match(/^#\s+\d+\.\d+\./)) {
            m = line.match(/^#\s+(\d+)\./);
          }
        } else {
          m = line.match(/^##\s+(\d+)\./);
        }
        if (m) {
          intNumbers.push(parseInt(m[1], 10));
        }
      }

      for (let i = 1; i < intNumbers.length; i++) {
        if (intNumbers[i] !== intNumbers[i - 1] + 1) {
          violations.push({
            code: "FL-016",
            file: rel,
            message: `Non-contiguous rule numbering in ${rel}: jump from #${intNumbers[i - 1]} to #${intNumbers[i]}`,
          });
        }
      }
    }
  }

  return violations;
}

/**
 * Check FL-017
 */
export function checkTokenBudget(root: string, config: LintConfig): LintViolation[] {
  const violations: LintViolation[] = [];
  let maxBudget = config.token_budget_max;
  const budgetFile = join(root, "runtime/token-budget.json");
  if (existsSync(budgetFile)) {
    try {
      const bData = JSON.parse(readFileSync(budgetFile, "utf8"));
      if (typeof bData.boot_tokens_est === "number") {
        maxBudget = bData.boot_tokens_est;
      }
    } catch {}
  }
  if (!maxBudget) return violations;

  const inv = generateInventory(root);
  if (inv.boot_set.total_tokens_est > maxBudget) {
    violations.push({
      code: "FL-017",
      file: "runtime/token-budget.json",
      message: `Boot set tokens (${inv.boot_set.total_tokens_est}) exceeds budget maximum (${maxBudget})`,
    });
  }

  return violations;
}

export function runFrameworkLint(root = REPO_ROOT, configPath?: string): {
  errors: LintViolation[];
  total_violations: number;
  clean: boolean;
} {
  const config = loadLintConfig(configPath);
  const errors: LintViolation[] = [
    ...checkSkills(root, config),
    ...checkConsistency(root, config),
    ...checkReferences(root, config),
    ...checkRulesAndDocs(root, config),
    ...checkTokenBudget(root, config),
  ];

  return {
    errors,
    total_violations: errors.length,
    clean: errors.length === 0,
  };
}

// CLI entry point
if (import.meta.main || require.main === module) {
  try {
    const isJson = process.argv.includes("--json");
    const cfgIdx = process.argv.indexOf("--config");
    const cfgPath = cfgIdx !== -1 && process.argv[cfgIdx + 1] ? resolve(process.argv[cfgIdx + 1]) : undefined;

    const result = runFrameworkLint(REPO_ROOT, cfgPath);

    if (isJson) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`\n=== ASTESIA FRAMEWORK LINT ===`);
      console.log(`Total Violations: ${result.total_violations}`);
      if (result.clean) {
        console.log(`Status: CLEAN (0 violations)\n`);
      } else {
        console.log(`Status: FAILED (${result.total_violations} violations)\n`);
        for (const err of result.errors) {
          console.log(`  [${err.code}] ${err.file}${err.line ? `:${err.line}` : ""}: ${err.message}`);
        }
      }
    }

    process.exit(result.clean ? 0 : 1);
  } catch (err: any) {
    console.error(`[TOOL_FAILURE] ${err.message}`);
    process.exit(2);
  }
}
