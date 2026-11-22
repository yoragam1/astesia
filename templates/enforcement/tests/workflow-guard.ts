/**
 * templates/enforcement/tests/workflow-guard.ts
 * Zero-dependency static validator and mutation test suite for CI workflow security.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { checkWorkflow } from "../astesia-gate";

export interface GuardResult {
  valid: boolean;
  errors: string[];
}

export const validateWorkflow = checkWorkflow;

export function runWorkflowGuardSuite(): { passed: boolean; mutationResults: Array<{ name: string; failedAsExpected: boolean }> } {
  const workflowPath = join(__dirname, "../astesia-gate.workflow.yml");
  const authenticYaml = readFileSync(workflowPath, "utf8");

  // Verify authentic workflow passes
  const authenticResult = validateWorkflow(authenticYaml);
  if (!authenticResult.valid) {
    console.error("Authentic workflow FAILED validation:", authenticResult.errors);
    return { passed: false, mutationResults: [] };
  }

  // Define 12 mutations
  const mutations = [
    {
      name: "Mutation 1: pull_request_target trigger",
      mutate: (y: string) => y.replace(/pull_request:/g, "pull_request_target:")
    },
    {
      name: "Mutation 2: write permissions",
      mutate: (y: string) => y.replace(/contents:\s*read/g, "contents: write")
    },
    {
      name: "Mutation 3: missing permissions block",
      mutate: (y: string) => y.replace(/permissions:\s*\n\s+contents:\s*read/g, "# permissions removed")
    },
    {
      name: "Mutation 4: unpinned action tag @v4",
      mutate: (y: string) => y.replace(/actions\/checkout@[0-9a-f]{40}/g, "actions/checkout@v4")
    },
    {
      name: "Mutation 5: missing trusted base checkout",
      mutate: (y: string) => y.replace(/path:\s*trusted/g, "path: other")
    },
    {
      name: "Mutation 6: missing PR code checkout",
      mutate: (y: string) => y.replace(/path:\s*pr/g, "path: incoming")
    },
    {
      name: "Mutation 7: persist-credentials removed",
      mutate: (y: string) => y.replace(/persist-credentials:\s*false/g, "persist-credentials: true")
    },
    {
      name: "Mutation 8: continue-on-error added",
      mutate: (y: string) => y + "\n      continue-on-error: true\n"
    },
    {
      name: "Mutation 9: paths filter added to trigger",
      mutate: (y: string) => y.replace(/pull_request:\n    branches: \[main\]/, "pull_request:\n    branches: [main]\n    paths:\n      - 'src/**'")
    },
    {
      name: "Mutation 10: missing --rules-diff",
      mutate: (y: string) => y.replace(/--rules-diff[^\n]+/g, "echo skipped")
    },
    {
      name: "Mutation 11: --update-baseline illegally added",
      mutate: (y: string) => y.replace(/--baseline/g, "--update-baseline")
    },
    {
      name: "Mutation 12: missing workflow security guard step (VER3-006)",
      mutate: (y: string) => y.replace(/--check-workflow/g, "--ignore-check")
    }
  ];

  const mutationResults: Array<{ name: string; failedAsExpected: boolean }> = [];
  let allMutationsPassed = true;

  for (const m of mutations) {
    const mutatedYaml = m.mutate(authenticYaml);
    const res = validateWorkflow(mutatedYaml);
    const failedAsExpected = !res.valid;
    mutationResults.push({ name: m.name, failedAsExpected });
    if (!failedAsExpected) {
      allMutationsPassed = false;
      console.error(`Mutation failed to trigger guard: ${m.name}`);
    }
  }

  return {
    passed: authenticResult.valid && allMutationsPassed,
    mutationResults
  };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.length > 0) {
    const targetPath = args[0];
    if (!existsSync(targetPath)) {
      console.error(`[TOOL_FAILED: workflow file not found: ${targetPath}]`);
      process.exit(2);
    }
    let content: string;
    try {
      content = readFileSync(targetPath, "utf8");
    } catch (err: unknown) {
      console.error(`[TOOL_FAILED: failed to read workflow file: ${err instanceof Error ? err.message : String(err)}]`);
      process.exit(2);
    }
    const res = validateWorkflow(content);
    if (!res.valid) {
      for (const err of res.errors) {
        console.error(`[WORKFLOW_GUARD_ERROR: ${err}]`);
      }
      process.exit(1);
    }
    console.log(`workflow-guard: valid (no security issues detected in ${targetPath}).`);
    process.exit(0);
  }

  const suite = runWorkflowGuardSuite();
  if (suite.passed) {
    console.log("Workflow Guard: Authentic workflow passed and all 8 mutations failed as expected.");
    process.exit(0);
  } else {
    console.error("Workflow Guard suite failed.");
    process.exit(1);
  }
}
