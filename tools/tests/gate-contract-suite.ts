/**
 * tools/tests/gate-contract-suite.ts
 * Mutation test suite for mechanical derivation of gate reference contract.
 *
 * Verifies FAIL-CLOSED behavior of extractGateContract and gen-gate-reference CLI
 * across >= 8 gate mutants and >= 4 document mutants.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { checkRulesAndDocs, LintConfig } from "../framework-lint";

const defaultConfig: LintConfig = {
  description_max_length: 320,
  description_length_exemptions: [],
  gate_internal_flags_exempt: [],
  unmapped_skills_exempt: [],
  token_budget_max: 50000,
};

export interface GateMutationTest {
  id: string;
  name: string;
  run: () => boolean;
}

function createMockGateEnv(prefix: string): {
  dir: string;
  gatePath: string;
  rulesPath: string;
  descPath: string;
  limitPath: string;
  refPath: string;
} {
  const dir = join(tmpdir(), `astesia-gc-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  mkdirSync(join(dir, "templates", "enforcement"), { recursive: true });
  mkdirSync(join(dir, "docs"), { recursive: true });

  const realGate = readFileSync("templates/enforcement/astesia-gate.ts", "utf8");
  const realRules = readFileSync("templates/enforcement/anti-patterns.json", "utf8");
  const realDesc = readFileSync("docs/gate-reference-descriptions.json", "utf8");
  const realLimit = readFileSync("docs/gate-limitations.md", "utf8");
  const realRef = readFileSync("docs/GATE-REFERENCE.md", "utf8");

  const gatePath = join(dir, "templates", "enforcement", "astesia-gate.ts");
  const rulesPath = join(dir, "templates", "enforcement", "anti-patterns.json");
  const descPath = join(dir, "docs", "gate-reference-descriptions.json");
  const limitPath = join(dir, "docs", "gate-limitations.md");
  const refPath = join(dir, "docs", "GATE-REFERENCE.md");

  writeFileSync(gatePath, realGate, "utf8");
  writeFileSync(rulesPath, realRules, "utf8");
  writeFileSync(descPath, realDesc, "utf8");
  writeFileSync(limitPath, realLimit, "utf8");
  writeFileSync(refPath, realRef, "utf8");

  return { dir, gatePath, rulesPath, descPath, limitPath, refPath };
}

function runGenCli(args: string[]): { code: number | null; stdout: string; stderr: string } {
  const res = spawnSync("bun", ["tools/gen-gate-reference.ts", ...args], {
    encoding: "utf8",
    env: { ...process.env },
  });
  return { code: res.status, stdout: res.stdout || "", stderr: res.stderr || "" };
}

export function runGateContractSuite(): { total: number; passed: number; failed: number; known_gaps: number } {
  console.log("\n=== Running Gate Reference Contract & Mutation Suite (12 mutants) ===");

  const tests: GateMutationTest[] = [
    // 1. MUT-GC-01: Delete --root core flag from gate source -> FAIL-CLOSED exit 2
    {
      id: "MUT-GC-01",
      name: "Delete --root handling from gate source causes fail-closed exit 2",
      run: () => {
        const env = createMockGateEnv("gc01");
        try {
          const content = readFileSync(env.gatePath, "utf8")
            .replaceAll("--root", "--disabled-root")
            .replaceAll('opts.get("root")', 'opts.get("disabled-root")');
          writeFileSync(env.gatePath, content, "utf8");
          const res = runGenCli([
            "--gate-file", env.gatePath,
            "--rules-file", env.rulesPath,
            "--desc-file", env.descPath,
            "--limitations-file", env.limitPath,
            "--check"
          ]);
          return res.code === 2 && res.stderr.includes("Oracle flag --root was not found");
        } finally {
          rmSync(env.dir, { recursive: true, force: true });
        }
      },
    },

    // 2. MUT-GC-02: Add unhandled CLI flag in gate parser -> FAIL-CLOSED exit 2
    {
      id: "MUT-GC-02",
      name: "Add undocumented CLI flag in parser context causes fail-closed exit 2",
      run: () => {
        const env = createMockGateEnv("gc02");
        try {
          let content = readFileSync(env.gatePath, "utf8");
          content = content.replace('const { flags, opts } = parseArgs();', 'const { flags, opts } = parseArgs();\nconst test = args.indexOf("--unhandled-test-flag");');
          writeFileSync(env.gatePath, content, "utf8");
          const res = runGenCli([
            "--gate-file", env.gatePath,
            "--rules-file", env.rulesPath,
            "--desc-file", env.descPath,
            "--limitations-file", env.limitPath,
            "--check"
          ]);
          return res.code === 2 && res.stderr.includes("lacks documentation in descriptions oracle");
        } finally {
          rmSync(env.dir, { recursive: true, force: true });
        }
      },
    },

    // 3. MUT-GC-03: Empty NEVER_BASELINE array -> FAIL-CLOSED exit 2
    {
      id: "MUT-GC-03",
      name: "Empty NEVER_BASELINE set causes fail-closed exit 2",
      run: () => {
        const env = createMockGateEnv("gc03");
        try {
          let content = readFileSync(env.gatePath, "utf8");
          content = content.replace(/NEVER_BASELINE\s*=\s*new Set\(\[[^\]]*\]\)/, "NEVER_BASELINE = new Set([])");
          writeFileSync(env.gatePath, content, "utf8");
          const res = runGenCli([
            "--gate-file", env.gatePath,
            "--rules-file", env.rulesPath,
            "--desc-file", env.descPath,
            "--limitations-file", env.limitPath,
            "--check"
          ]);
          return res.code === 2 && res.stderr.includes("NEVER_BASELINE extracted empty array");
        } finally {
          rmSync(env.dir, { recursive: true, force: true });
        }
      },
    },

    // 4. MUT-GC-04: Empty NEVER_INLINE_SUPPRESS array -> FAIL-CLOSED exit 2
    {
      id: "MUT-GC-04",
      name: "Empty NEVER_INLINE_SUPPRESS set causes fail-closed exit 2",
      run: () => {
        const env = createMockGateEnv("gc04");
        try {
          let content = readFileSync(env.gatePath, "utf8");
          content = content.replace(/NEVER_INLINE_SUPPRESS\s*=\s*new Set\(\[[^\]]*\]\)/, "NEVER_INLINE_SUPPRESS = new Set([])");
          writeFileSync(env.gatePath, content, "utf8");
          const res = runGenCli([
            "--gate-file", env.gatePath,
            "--rules-file", env.rulesPath,
            "--desc-file", env.descPath,
            "--limitations-file", env.limitPath,
            "--check"
          ]);
          return res.code === 2 && res.stderr.includes("NEVER_INLINE_SUPPRESS extracted empty array");
        } finally {
          rmSync(env.dir, { recursive: true, force: true });
        }
      },
    },

    // 5. MUT-GC-05: Insert forbidden directive astesia-disable -> FAIL-CLOSED exit 2
    {
      id: "MUT-GC-05",
      name: "Inserting forbidden astesia-disable into gate causes fail-closed exit 2",
      run: () => {
        const env = createMockGateEnv("gc05");
        try {
          let content = readFileSync(env.gatePath, "utf8");
          content += "\n// astesia-disable line check support\n";
          writeFileSync(env.gatePath, content, "utf8");
          const res = runGenCli([
            "--gate-file", env.gatePath,
            "--rules-file", env.rulesPath,
            "--desc-file", env.descPath,
            "--limitations-file", env.limitPath,
            "--check"
          ]);
          return res.code === 2 && res.stderr.includes("Forbidden directive 'astesia-disable'");
        } finally {
          rmSync(env.dir, { recursive: true, force: true });
        }
      },
    },

    // 6. MUT-GC-06: Delete rule from anti-patterns.json -> drift caught on check
    {
      id: "MUT-GC-06",
      name: "Deleting rule from anti-patterns causes check drift exit 1",
      run: () => {
        const env = createMockGateEnv("gc06");
        try {
          const rules = JSON.parse(readFileSync(env.rulesPath, "utf8"));
          rules.rules = rules.rules.filter((r: any) => r.id !== "ASTESIA-000");
          writeFileSync(env.rulesPath, JSON.stringify(rules, null, 2), "utf8");
          const res = runGenCli([
            "--gate-file", env.gatePath,
            "--rules-file", env.rulesPath,
            "--desc-file", env.descPath,
            "--limitations-file", env.limitPath,
            "--output", env.refPath,
            "--check"
          ]);
          return res.code === 1;
        } finally {
          rmSync(env.dir, { recursive: true, force: true });
        }
      },
    },

    // 7. MUT-GC-07: Corrupt anti-patterns.json (invalid JSON) -> FAIL-CLOSED exit 2
    {
      id: "MUT-GC-07",
      name: "Corrupt anti-patterns.json causes fail-closed exit 2",
      run: () => {
        const env = createMockGateEnv("gc07");
        try {
          writeFileSync(env.rulesPath, "INVALID JSON {{{", "utf8");
          const res = runGenCli([
            "--gate-file", env.gatePath,
            "--rules-file", env.rulesPath,
            "--desc-file", env.descPath,
            "--limitations-file", env.limitPath,
            "--check"
          ]);
          return res.code === 2 && res.stderr.includes("anti-patterns.json invalid JSON");
        } finally {
          rmSync(env.dir, { recursive: true, force: true });
        }
      },
    },

    // 8. MUT-GC-08: Corrupt descriptions oracle JSON -> FAIL-CLOSED exit 2
    {
      id: "MUT-GC-08",
      name: "Corrupt gate-reference-descriptions.json causes fail-closed exit 2",
      run: () => {
        const env = createMockGateEnv("gc08");
        try {
          writeFileSync(env.descPath, "CORRUPT JSON", "utf8");
          const res = runGenCli([
            "--gate-file", env.gatePath,
            "--rules-file", env.rulesPath,
            "--desc-file", env.descPath,
            "--limitations-file", env.limitPath,
            "--check"
          ]);
          return res.code === 2 && res.stderr.includes("Invalid JSON in gate-reference-descriptions.json");
        } finally {
          rmSync(env.dir, { recursive: true, force: true });
        }
      },
    },

    // 9. MUT-DOC-01: Add fake flag to GATE-REFERENCE.md -> check drift exit 1
    {
      id: "MUT-DOC-01",
      name: "Add fake flag --astesia-fake-flag to document causes check drift exit 1",
      run: () => {
        const env = createMockGateEnv("doc01");
        try {
          let content = readFileSync(env.refPath, "utf8");
          content = content.replace("## 1. Argumen & Flag CLI Astesia Gate", "## 1. Argumen & Flag CLI Astesia Gate\n| `--astesia-fake-flag` | Flag | Fake flag |");
          writeFileSync(env.refPath, content, "utf8");
          const res = runGenCli([
            "--gate-file", env.gatePath,
            "--rules-file", env.rulesPath,
            "--desc-file", env.descPath,
            "--limitations-file", env.limitPath,
            "--output", env.refPath,
            "--check"
          ]);
          return res.code === 1;
        } finally {
          rmSync(env.dir, { recursive: true, force: true });
        }
      },
    },

    // 10. MUT-DOC-02: Delete limitation point from gate-limitations.md -> check drift exit 1
    {
      id: "MUT-DOC-02",
      name: "Deleting limitation point from limitations text causes check drift exit 1",
      run: () => {
        const env = createMockGateEnv("doc02");
        try {
          let content = readFileSync(env.limitPath, "utf8");
          content = content.replace(/1\. \*\*Model Pemindaian Tanpa AST\*\*:[^\n]*/, "");
          writeFileSync(env.limitPath, content, "utf8");
          const res = runGenCli([
            "--gate-file", env.gatePath,
            "--rules-file", env.rulesPath,
            "--desc-file", env.descPath,
            "--limitations-file", env.limitPath,
            "--output", env.refPath,
            "--check"
          ]);
          return res.code === 1;
        } finally {
          rmSync(env.dir, { recursive: true, force: true });
        }
      },
    },

    // 11. MUT-DOC-03: Insert false claim 'parser AST' -> caught by FL-020
    {
      id: "MUT-DOC-03",
      name: "Inserting false claim 'parser AST' into GATE-REFERENCE.md caught by FL-020",
      run: () => {
        const env = createMockGateEnv("doc03");
        try {
          let content = readFileSync(env.refPath, "utf8");
          content += "\nKeterbatasan: Gate menggunakan parser AST lokal.\n";
          writeFileSync(env.refPath, content, "utf8");
          const violations = checkRulesAndDocs(env.dir, defaultConfig);
          return violations.some((v) => v.code === "FL-020" && v.message.includes("parser AST"));
        } finally {
          rmSync(env.dir, { recursive: true, force: true });
        }
      },
    },

    // 12. MUT-DOC-04: Alter rule severity in GATE-REFERENCE.md -> check drift exit 1
    {
      id: "MUT-DOC-04",
      name: "Altering rule severity in GATE-REFERENCE.md causes check drift exit 1",
      run: () => {
        const env = createMockGateEnv("doc04");
        try {
          let content = readFileSync(env.refPath, "utf8");
          content = content.replace("`ASTESIA-000` | `error`", "`ASTESIA-000` | `warn`");
          writeFileSync(env.refPath, content, "utf8");
          const res = runGenCli([
            "--gate-file", env.gatePath,
            "--rules-file", env.rulesPath,
            "--desc-file", env.descPath,
            "--limitations-file", env.limitPath,
            "--output", env.refPath,
            "--check"
          ]);
          return res.code === 1;
        } finally {
          rmSync(env.dir, { recursive: true, force: true });
        }
      },
    },
  ];

  let passed = 0;
  let failed = 0;

  for (const t of tests) {
    try {
      const ok = t.run();
      if (ok) {
        console.log(`  [PASS] [KILLED] ${t.id}: ${t.name}`);
        passed++;
      } else {
        console.error(`  [FAIL] ${t.id}: ${t.name}`);
        failed++;
      }
    } catch (err: any) {
      console.error(`  [ERROR] ${t.id}: ${t.name} (${err.message})`);
      failed++;
    }
  }

  console.log(`Gate Contract Suite Results: ${passed} passed, ${failed} failed out of ${tests.length}\n`);

  return { total: tests.length, passed, failed, known_gaps: 0 };
}

if (import.meta.main || require.main === module) {
  const res = runGateContractSuite();
  process.exit(res.failed > 0 ? 1 : 0);
}
