import { spawnSync } from "child_process";
import { writeFileSync, readFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

export function runWorkflowGuardSuite(gatePath: string, canonicalWorkflowPath: string) {
  const tmpDir = join(tmpdir(), "astesia_verify2_wf_" + Date.now());
  mkdirSync(tmpDir, { recursive: true });

  const origYaml = readFileSync(canonicalWorkflowPath, "utf8");

  const cases: Array<{ id: string; desc: string; yaml: string; expectedExit: number }> = [
    { id: "WF-CANONICAL", desc: "Canonical workflow passes", yaml: origYaml, expectedExit: 0 },
    { id: "WF-M1-PR-TARGET", desc: "pull_request_target rejected", yaml: origYaml.replace("pull_request:", "pull_request_target:"), expectedExit: 1 },
    { id: "WF-M2-PERM-WRITE", desc: "contents: write rejected", yaml: origYaml.replace("contents: read", "contents: write"), expectedExit: 1 },
    { id: "WF-M3-PERM-MISSING", desc: "Missing permissions rejected", yaml: origYaml.replace(/permissions:\s*\n\s+contents:\s*read/, ""), expectedExit: 1 },
    { id: "WF-M4-UNPINNED-USES", desc: "Unpinned uses (@v4) rejected", yaml: origYaml.replace(/actions\/checkout@[0-9a-f]{40}/, "actions/checkout@v4"), expectedExit: 1 },
    { id: "WF-M5-SHORT-SHA", desc: "39-char SHA pin rejected", yaml: origYaml.replace(/actions\/checkout@[0-9a-f]{40}/, "actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af68"), expectedExit: 1 },
    { id: "WF-M6-MISSING-BASE-CHECKOUT", desc: "Missing base checkout rejected", yaml: origYaml.replace("path: trusted", "path: untrusted_base"), expectedExit: 1 },
    { id: "WF-M7-MISSING-PR-CHECKOUT", desc: "Missing PR checkout rejected", yaml: origYaml.replace("path: pr", "path: untrusted_pr"), expectedExit: 1 },
    { id: "WF-M8-PERSIST-CREDENTIALS", desc: "persist-credentials: true rejected", yaml: origYaml.replace(/persist-credentials:\s*false/g, "persist-credentials: true"), expectedExit: 1 },
    { id: "WF-M9-CONTINUE-ON-ERROR", desc: "continue-on-error rejected", yaml: origYaml.replace("name: Execute trusted gate on incoming code", "name: Execute trusted gate on incoming code\n        continue-on-error: true"), expectedExit: 1 },
    { id: "WF-M10-PATHS-FILTER", desc: "paths: filter rejected", yaml: origYaml.replace("branches: [main]", "branches: [main]\n    paths:\n      - 'src/**'"), expectedExit: 1 },
    { id: "WF-M11-PATHS-IGNORE", desc: "paths-ignore: filter rejected", yaml: origYaml.replace("branches: [main]", "branches: [main]\n    paths-ignore:\n      - 'docs/**'"), expectedExit: 1 },
    { id: "WF-M12-MISSING-RULES-DIFF", desc: "Missing --rules-diff rejected", yaml: origYaml.replace("--rules-diff", "--no-rules-diff"), expectedExit: 1 },
    { id: "WF-M13-MISSING-BASELINE", desc: "Missing --baseline rejected", yaml: origYaml.replace("--baseline", "--no-baseline"), expectedExit: 1 },
    { id: "WF-M14-UPDATE-BASELINE-IN-CI", desc: "Forbidden --update-baseline in CI rejected", yaml: origYaml.replace("--max-warn 0", "--max-warn 0 \\\n            --update-baseline"), expectedExit: 1 },
    { id: "WF-M15-MISSING-GUARD-STEP", desc: "Missing guard step rejected", yaml: origYaml.replace("--check-workflow", "--bypass-workflow"), expectedExit: 1 }
  ];

  const results: any[] = [];
  let passedCount = 0;
  let failedCount = 0;

  for (const c of cases) {
    const fPath = join(tmpDir, `${c.id}.yml`);
    writeFileSync(fPath, c.yaml, "utf8");

    const r = spawnSync("bun", [gatePath, "--check-workflow", fPath], { encoding: "utf8" });
    try { rmSync(fPath); } catch {}

    const passed = r.status === c.expectedExit;
    if (passed) {
      passedCount++;
      results.push({ id: c.id, status: "PASSED", desc: c.desc });
    } else {
      failedCount++;
      results.push({ id: c.id, status: "FAILED", desc: c.desc, expectedExit: c.expectedExit, got: r.status });
    }
  }

  // Missing file check (must exit 2)
  const rMissing = spawnSync("bun", [gatePath, "--check-workflow", join(tmpDir, "nonexistent.yml")], { encoding: "utf8" });
  const missingPassed = rMissing.status === 2;
  if (missingPassed) {
    passedCount++;
    results.push({ id: "WF-MISSING-FILE", status: "PASSED", desc: "Missing workflow file exits 2" });
  } else {
    failedCount++;
    results.push({ id: "WF-MISSING-FILE", status: "FAILED", desc: "Missing workflow file exits 2", expectedExit: 2, got: rMissing.status });
  }

  try { rmSync(tmpDir, { recursive: true }); } catch {}

  return {
    total: cases.length + 1,
    passed: passedCount,
    failed: failedCount,
    known_gaps: 0,
    results
  };
}
