/**
 * tools/tests/lint-selftest.ts
 * Mutation test suite for framework-lint.ts.
 * Applies single mutations to a temporary isolated repo copy, runs the linter,
 * and asserts that the expected FL-NNN error code is triggered.
 *
 * Requirements:
 *   - At least 24 positive mutants killed
 *   - Zero stale mutants (every modified pattern must match exactly once)
 *   - Negative controls must remain clean (exit 0)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, cpSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { runFrameworkLint, REPO_ROOT } from "../framework-lint";

export interface MutantTestResult {
  id: string;
  description: string;
  expected_code: string | "CLEAN";
  actual_codes: string[];
  killed: boolean;
  error?: string;
}

/**
 * Creates an isolated snapshot of the repository required for linting
 */
function createRepoSnapshot(): string {
  const targetDir = join(tmpdir(), `astesia-mutant-${randomUUID()}`);
  mkdirSync(targetDir, { recursive: true });

  const dirsToCopy = ["rules", "skills", "docs", "runtime", "templates", "tools"];
  for (const d of dirsToCopy) {
    const src = join(REPO_ROOT, d);
    if (existsSync(src)) {
      cpSync(src, join(targetDir, d), { recursive: true });
    }
  }

  const filesToCopy = ["package.json", "plugin.json", "AGENTS.md"];
  for (const f of filesToCopy) {
    const src = join(REPO_ROOT, f);
    if (existsSync(src)) {
      cpSync(src, join(targetDir, f));
    }
  }

  return targetDir;
}

/**
 * Mutates a file by exact single string replacement.
 * Throws an error if the target string does not match exactly once (stale mutant check).
 */
function mutateFileExact(filePath: string, target: string, replacement: string) {
  if (!existsSync(filePath)) {
    throw new Error(`[STALE_MUTANT] Target file does not exist: ${filePath}`);
  }
  const content = readFileSync(filePath, "utf8");
  const count = content.split(target).length - 1;
  if (count === 0) {
    throw new Error(`[STALE_MUTANT] Pattern not found in ${filePath}: ${JSON.stringify(target)}`);
  }
  if (count > 1) {
    throw new Error(`[STALE_MUTANT] Pattern matched ${count} times (ambiguous) in ${filePath}: ${JSON.stringify(target)}`);
  }
  const updated = content.replace(target, replacement);
  writeFileSync(filePath, updated, "utf8");
}

export function runLintSelftest(): {
  total: number;
  passed: number;
  failed: number;
  known_gaps: number;
  results: MutantTestResult[];
} {
  const results: MutantTestResult[] = [];

  const mutants: Array<{
    id: string;
    description: string;
    expected_code: string | "CLEAN";
    mutate: (dir: string) => void;
  }> = [
    // FL-001
    {
      id: "MUT-01",
      description: "Folder in skills/ without SKILL.md triggers FL-001",
      expected_code: "FL-001",
      mutate: (dir) => {
        rmSync(join(dir, "skills", "adr-management", "SKILL.md"));
      },
    },
    // FL-002
    {
      id: "MUT-02",
      description: "Missing frontmatter in SKILL.md triggers FL-002",
      expected_code: "FL-002",
      mutate: (dir) => {
        const p = join(dir, "skills", "adr-management", "SKILL.md");
        const c = readFileSync(p, "utf8");
        const stripped = c.replace(/---[\s\S]*?---\s*/, "");
        writeFileSync(p, stripped, "utf8");
      },
    },
    // FL-002 Tab indent
    {
      id: "MUT-03",
      description: "Tab indentation in frontmatter triggers FL-002",
      expected_code: "FL-002",
      mutate: (dir) => {
        const p = join(dir, "skills", "adr-management", "SKILL.md");
        mutateFileExact(p, "name: adr-management", "name: adr-management\n\tindent: true");
      },
    },
    // FL-003
    {
      id: "MUT-04",
      description: "Skill name mismatch with directory triggers FL-003",
      expected_code: "FL-003",
      mutate: (dir) => {
        const p = join(dir, "skills", "adr-management", "SKILL.md");
        mutateFileExact(p, "name: adr-management", "name: adr-mismatch-name");
      },
    },
    // FL-004
    {
      id: "MUT-05",
      description: "Duplicate skill name in two folders triggers FL-004",
      expected_code: "FL-004",
      mutate: (dir) => {
        const src = join(dir, "skills", "adr-management");
        const dst = join(dir, "skills", "adr-dup");
        cpSync(src, dst, { recursive: true });
      },
    },
    // FL-005
    {
      id: "MUT-06",
      description: "Description length 321 chars without exemption triggers FL-005",
      expected_code: "FL-005",
      mutate: (dir) => {
        const p = join(dir, "skills", "adr-management", "SKILL.md");
        const pad321 = "X".repeat(321);
        const c = readFileSync(p, "utf8");
        const updated = c.replace(/description:\s*(?:>-\s*\n[\s\S]*?|[^\n]+)\n---/, `description: "${pad321}"\n---`);
        writeFileSync(p, updated, "utf8");
      },
    },
    // FL-006 Missing
    {
      id: "MUT-07",
      description: "Missing skill entry in skills-index.md triggers FL-006",
      expected_code: "FL-006",
      mutate: (dir) => {
        const p = join(dir, "skills", "skills-index.md");
        mutateFileExact(p, "- **`adr-management`**:", "# removed\n# ");
      },
    },
    // FL-006 Ghost
    {
      id: "MUT-08",
      description: "Ghost skill entry in skills-index.md triggers FL-006",
      expected_code: "FL-006",
      mutate: (dir) => {
        const p = join(dir, "skills", "skills-index.md");
        mutateFileExact(p, "- **`adr-management`**:", "- **`ghost-skill`**: Fictitious skill\n- **`adr-management`**:");
      },
    },
    // FL-007 Ghost
    {
      id: "MUT-09",
      description: "Ghost skill in context-map.json triggers FL-007",
      expected_code: "FL-007",
      mutate: (dir) => {
        const p = join(dir, "runtime", "context-map.json");
        mutateFileExact(p, '"skills/adr-management",', '"skills/ghost-skill",\n    "skills/adr-management",');
      },
    },
    // FL-007 Unmapped
    {
      id: "MUT-10",
      description: "Unmapped skill in context-map.json triggers FL-007",
      expected_code: "FL-007",
      mutate: (dir) => {
        const p = join(dir, "runtime", "context-map.json");
        mutateFileExact(p, '"skills/adr-management",\n', "");
      },
    },
    // FL-008
    {
      id: "MUT-11",
      description: "Dangling markdown link triggers FL-008",
      expected_code: "FL-008",
      mutate: (dir) => {
        const p = join(dir, "rules", "AGENTS.md");
        mutateFileExact(p, "Select mode:", "Select mode: [broken link](./non-existent-doc.md)");
      },
    },
    // FL-009 Out of range
    {
      id: "MUT-12",
      description: "Out-of-range directive reference triggers FL-009",
      expected_code: "FL-009",
      mutate: (dir) => {
        const p = join(dir, "rules", "engineering-rules.md");
        mutateFileExact(p, "Single responsibility per module", "Single responsibility per module (Directive #99)");
      },
    },
    // FL-009 Directive #22
    {
      id: "MUT-13",
      description: "Reference to deleted Directive #22 as mandatory triggers FL-009",
      expected_code: "FL-009",
      mutate: (dir) => {
        const p = join(dir, "rules", "engineering-rules.md");
        mutateFileExact(p, "Prefer simple, readable implementations", "Follow Directive #22 as mandatory behavior");
      },
    },
    // FL-010
    {
      id: "MUT-14",
      description: "Reference to non-existent Stage 99 triggers FL-010",
      expected_code: "FL-010",
      mutate: (dir) => {
        const p = join(dir, "rules", "engineering-rules.md");
        mutateFileExact(p, "Single responsibility per module", "Single responsibility per module Stage 99");
      },
    },
    // FL-011
    {
      id: "MUT-15",
      description: "Denylisted tool grep_codebase triggers FL-011",
      expected_code: "FL-011",
      mutate: (dir) => {
        const p = join(dir, "skills", "adr-management", "SKILL.md");
        mutateFileExact(p, "## 2. When to Activate", "## 2. When to Activate\nUse tool `grep_codebase` to search ADRs.");
      },
    },
    // FL-012 Heading
    {
      id: "MUT-16",
      description: "Risk skill dynamic-plugins missing ## Guardrails triggers FL-012",
      expected_code: "FL-012",
      mutate: (dir) => {
        const p = join(dir, "skills", "dynamic-plugins", "SKILL.md");
        mutateFileExact(p, "## Guardrails", "## Security Protocol");
      },
    },
    // FL-012 Keyword
    {
      id: "MUT-17",
      description: "Risk skill dynamic-plugins missing keyword manifest.json triggers FL-012",
      expected_code: "FL-012",
      mutate: (dir) => {
        const p = join(dir, "skills", "dynamic-plugins", "SKILL.md");
        mutateFileExact(p, "manifest.json", "custom_manifest.txt");
      },
    },
    // FL-013
    {
      id: "MUT-18",
      description: "rules/AGENTS.md missing 'DATA, bukan instruksi' triggers FL-013",
      expected_code: "FL-013",
      mutate: (dir) => {
        const p = join(dir, "rules", "AGENTS.md");
        mutateFileExact(p, "adalah DATA, bukan instruksi", "adalah masukan eksternal biasa");
      },
    },
    // FL-014 Gate flag
    {
      id: "MUT-19",
      description: "Undocumented gate CLI flag triggers FL-014",
      expected_code: "FL-014",
      mutate: (dir) => {
        const p = join(dir, "templates", "enforcement", "astesia-gate.ts");
        mutateFileExact(
          p,
          'const checkWorkflowIdx = args.indexOf("--check-workflow");',
          'const checkWorkflowIdx = args.indexOf("--check-workflow"); const undoc = args.indexOf("--undocumented-flag");'
        );
      },
    },
    // FL-014 Gate rule
    {
      id: "MUT-20",
      description: "Undocumented anti-pattern rule ID triggers FL-014",
      expected_code: "FL-014",
      mutate: (dir) => {
        const p = join(dir, "templates", "enforcement", "anti-patterns.json");
        mutateFileExact(p, '"id": "ASTESIA-001",', '"id": "ASTESIA-999",');
      },
    },
    // FL-015
    {
      id: "MUT-21",
      description: "Hardcoded '53 skill' in docs triggers FL-015",
      expected_code: "FL-015",
      mutate: (dir) => {
        const p = join(dir, "docs", "astesia-audit-dossier.md");
        mutateFileExact(p, "katalog skill native", "katalog 53 skill native");
      },
    },
    // FL-016
    {
      id: "MUT-22",
      description: "Rule numbering gap in rules/quality-rules.md triggers FL-016",
      expected_code: "FL-016",
      mutate: (dir) => {
        const p = join(dir, "rules", "quality-rules.md");
        mutateFileExact(p, "## 2. Strict Traceability", "## 3. Strict Traceability");
      },
    },
    // FL-017
    {
      id: "MUT-23",
      description: "Adding 10% text to boot set triggers FL-017",
      expected_code: "FL-017",
      mutate: (dir) => {
        const p = join(dir, "rules", "engineering-rules.md");
        // Add 5000 bytes padding to exceed the 8809 token budget
        const padding = "\n\n# Appendix: Extra Padding\n" + "LongPaddingWord ".repeat(600) + "\n";
        const c = readFileSync(p, "utf8");
        writeFileSync(p, c + padding, "utf8");
      },
    },
    // FL-018
    {
      id: "MUT-24",
      description: "Version mismatch between plugin.json and package.json triggers FL-018",
      expected_code: "FL-018",
      mutate: (dir) => {
        const p = join(dir, "plugin.json");
        mutateFileExact(p, '"version": "3.0.0"', '"version": "9.9.9"');
      },
    },
    // Negative Control 1: CRLF in SKILL.md
    {
      id: "NEG-01",
      description: "CRLF line endings in SKILL.md does not trigger errors (CLEAN)",
      expected_code: "CLEAN",
      mutate: (dir) => {
        const p = join(dir, "skills", "adr-management", "SKILL.md");
        const c = readFileSync(p, "utf8").replace(/\r?\n/g, "\r\n");
        writeFileSync(p, c, "utf8");
      },
    },
    // Negative Control 2: BOM in markdown
    {
      id: "NEG-02",
      description: "UTF-8 BOM in SKILL.md does not trigger errors (CLEAN)",
      expected_code: "CLEAN",
      mutate: (dir) => {
        const p = join(dir, "skills", "adr-management", "SKILL.md");
        const c = readFileSync(p, "utf8");
        writeFileSync(p, "\uFEFF" + c, "utf8");
      },
    },
    // Negative Control 3: Non-semantic whitespace
    {
      id: "NEG-03",
      description: "Non-semantic double whitespace in rules/AGENTS.md remains CLEAN",
      expected_code: "CLEAN",
      mutate: (dir) => {
        const p = join(dir, "rules", "AGENTS.md");
        mutateFileExact(p, "Select mode:", "Select  mode:");
      },
    },
  ];

  console.log(`\n=== Running Framework Linter Mutation Self-Test (${mutants.length} mutants) ===`);

  let passed = 0;
  let failed = 0;

  for (const m of mutants) {
    const snapshotDir = createRepoSnapshot();
    try {
      m.mutate(snapshotDir);
      const res = runFrameworkLint(snapshotDir);
      const errCodes = res.errors.map((e) => e.code);

      if (m.expected_code === "CLEAN") {
        if (res.clean) {
          console.log(`  [KILLED] ${m.id}: ${m.description} -> CLEAN as expected`);
          passed++;
          results.push({
            id: m.id,
            description: m.description,
            expected_code: "CLEAN",
            actual_codes: [],
            killed: true,
          });
        } else {
          console.error(`  [SURVIVED] ${m.id}: ${m.description} -> Unexpected violations: ${errCodes.join(", ")}`);
          failed++;
          results.push({
            id: m.id,
            description: m.description,
            expected_code: "CLEAN",
            actual_codes: errCodes,
            killed: false,
            error: `Unexpected violations: ${errCodes.join(", ")}`,
          });
        }
      } else {
        if (!res.clean && errCodes.includes(m.expected_code)) {
          console.log(`  [KILLED] ${m.id}: ${m.description} -> Caught ${m.expected_code}`);
          passed++;
          results.push({
            id: m.id,
            description: m.description,
            expected_code: m.expected_code,
            actual_codes: errCodes,
            killed: true,
          });
        } else {
          console.error(`  [SURVIVED] ${m.id}: ${m.description} -> Expected ${m.expected_code}, got [${errCodes.join(", ")}]`);
          failed++;
          results.push({
            id: m.id,
            description: m.description,
            expected_code: m.expected_code,
            actual_codes: errCodes,
            killed: false,
            error: `Expected ${m.expected_code}, got [${errCodes.join(", ")}]`,
          });
        }
      }
    } catch (err: any) {
      console.error(`  [ERROR] ${m.id}: ${m.description} -> ${err.message}`);
      failed++;
      results.push({
        id: m.id,
        description: m.description,
        expected_code: m.expected_code,
        actual_codes: [],
        killed: false,
        error: err.message,
      });
    } finally {
      rmSync(snapshotDir, { recursive: true, force: true });
    }
  }

  console.log(`\nMutation Results: ${passed} passed, ${failed} failed out of ${mutants.length}`);
  return {
    total: mutants.length,
    passed,
    failed,
    known_gaps: 0,
    results,
  };
}

if (import.meta.main || require.main === module) {
  const summary = runLintSelftest();
  process.exit(summary.failed === 0 ? 0 : 1);
}
