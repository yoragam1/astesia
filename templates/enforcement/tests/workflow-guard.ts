/**
 * templates/enforcement/tests/workflow-guard.ts
 * Zero-dependency static validator and mutation test suite for CI workflow security.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface GuardResult {
  valid: boolean;
  errors: string[];
}

export function validateWorkflow(yamlContent: string): GuardResult {
  const errors: string[] = [];

  // 1. Prohibit pull_request_target
  if (/pull_request_target/i.test(yamlContent)) {
    errors.push("Forbidden trigger 'pull_request_target' detected. Use 'pull_request' only.");
  }

  // 2. Enforce read-only permissions
  const permissionsMatch = yamlContent.match(/permissions:\s*([^\n]+|\n\s+[^\n]+)/);
  if (!permissionsMatch) {
    errors.push("Missing top-level or job-level permissions specification.");
  } else {
    const permBlock = permissionsMatch[0];
    if (/write/i.test(permBlock)) {
      errors.push("Write permissions detected. CI must have read-only permissions ('contents: read').");
    }
    if (!/contents:\s*read/i.test(permBlock)) {
      errors.push("Permissions must strictly specify 'contents: read'.");
    }
  }

  // 3. Verify all uses: are pinned to 40-character commit SHAs
  const usesRegex = /uses:\s*([^\s#]+)/g;
  let m: RegExpExecArray | null;
  while ((m = usesRegex.exec(yamlContent)) !== null) {
    const actionTarget = m[1];
    const atIdx = actionTarget.lastIndexOf("@");
    if (atIdx === -1) {
      errors.push(`Action '${actionTarget}' is unpinned (missing @commit-sha).`);
    } else {
      const pin = actionTarget.slice(atIdx + 1);
      if (!/^[0-9a-f]{40}$/i.test(pin)) {
        errors.push(`Action '${actionTarget}' is not pinned to a 40-character SHA ('${pin}').`);
      }
    }
  }

  // 4. Two checkouts (base into trusted, head into pr) with persist-credentials: false
  const hasTrustedCheckout = /path:\s*trusted/i.test(yamlContent) && /ref:\s*\${{\s*github\.event\.pull_request\.base\.sha\s*}}/i.test(yamlContent);
  const hasPrCheckout = /path:\s*pr/i.test(yamlContent) && /ref:\s*\${{\s*github\.event\.pull_request\.head\.sha\s*}}/i.test(yamlContent);
  const persistFalseCount = (yamlContent.match(/persist-credentials:\s*false/gi) || []).length;

  if (!hasTrustedCheckout) {
    errors.push("Missing trusted base checkout (expected path: trusted with base.sha).");
  }
  if (!hasPrCheckout) {
    errors.push("Missing PR code checkout (expected path: pr with head.sha).");
  }
  if (persistFalseCount < 2) {
    errors.push("Both checkouts must explicitly specify 'persist-credentials: false'.");
  }

  // 5. Prohibit continue-on-error
  if (/continue-on-error/i.test(yamlContent)) {
    errors.push("Forbidden 'continue-on-error' detected in CI workflow.");
  }

  // 6. Prohibit paths: and paths-ignore:
  if (/^\s*(paths|paths-ignore):/m.test(yamlContent)) {
    errors.push("Forbidden 'paths:' or 'paths-ignore:' filter detected in workflow trigger.");
  }

  // 7. Verify presence of --baseline and --rules-diff
  if (!yamlContent.includes("--rules-diff")) {
    errors.push("Missing '--rules-diff' check to detect rule registry weakenings.");
  }
  if (!yamlContent.includes("--baseline")) {
    errors.push("Missing '--baseline' enforcement argument.");
  }

  // 8. Prohibit --update-baseline in CI
  if (/--update-baseline/.test(yamlContent)) {
    errors.push("Forbidden '--update-baseline' flag detected in CI workflow script.");
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export function runWorkflowGuardSuite(): { passed: boolean; mutationResults: Array<{ name: string; failedAsExpected: boolean }> } {
  const workflowPath = join(__dirname, "../astesia-gate.workflow.yml");
  const authenticYaml = readFileSync(workflowPath, "utf8");

  // Verify authentic workflow passes
  const authenticResult = validateWorkflow(authenticYaml);
  if (!authenticResult.valid) {
    console.error("Authentic workflow FAILED validation:", authenticResult.errors);
    return { passed: false, mutationResults: [] };
  }

  // Define mutations
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
      name: "Mutation 3: unpinned action tag @v4",
      mutate: (y: string) => y.replace(/actions\/checkout@[0-9a-f]{40}/g, "actions/checkout@v4")
    },
    {
      name: "Mutation 4: missing trusted base checkout",
      mutate: (y: string) => y.replace(/path:\s*trusted/g, "path: other")
    },
    {
      name: "Mutation 5: continue-on-error added",
      mutate: (y: string) => y + "\n      continue-on-error: true\n"
    },
    {
      name: "Mutation 6: paths filter added to trigger",
      mutate: (y: string) => y.replace(/pull_request:\n    branches: \[main\]/, "pull_request:\n    branches: [main]\n    paths:\n      - 'src/**'")
    },
    {
      name: "Mutation 7: missing --rules-diff",
      mutate: (y: string) => y.replace(/--rules-diff[^\n]+/g, "echo skipped")
    },
    {
      name: "Mutation 8: --update-baseline illegally added",
      mutate: (y: string) => y.replace(/--baseline/g, "--update-baseline")
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
