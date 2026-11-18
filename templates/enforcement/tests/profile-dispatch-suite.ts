/**
 * templates/enforcement/tests/profile-dispatch-suite.ts
 * Directory scanning tests for profileFor dispatch (T1 / VER4-001).
 * Uses real directory scans with absolute paths.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export interface ProfileDispatchCase {
  id: string;
  desc: string;
  file: string;
  content: string;
  expectViolations: number;
  expectDesync: boolean;
  expect010Trigger: boolean;
  notes?: string;
}

export function runProfileDispatchSuite(gatePath: string, rulesPath: string, testTmpDir: string): {
  total: number;
  passed: number;
  failed: number;
  errors: string[];
} {
  const suiteDir = resolve(testTmpDir, `profile-dispatch-${Date.now()}`);
  mkdirSync(suiteDir, { recursive: true });

  const cases: ProfileDispatchCase[] = [
    // 1. .env with commented secret -> MUST NOT TRIGGER in config profile
    {
      id: "PD-01-ROOT-ENV-COMMENTED",
      desc: "Root .env with commented secret (# PASSWORD=realvalue1234abcd) must not trigger",
      file: ".env",
      content: "# PASSWORD=realvalue1234abcd\nAPP_NAME=Astesia\n",
      expectViolations: 0,
      expectDesync: false,
      expect010Trigger: false
    },
    // 2. Subdirectory .env.production with unclosed quote -> MUST NOT DESYNC in config profile
    {
      id: "PD-02-SUB-ENV-UNCLOSED-QUOTE",
      desc: "Subdirectory sub/.env.production with unclosed quote must not desync in config profile",
      file: "sub/.env.production",
      content: 'DESCRIPTION="unclosed quote string at end of line\nPORT=3000\n',
      expectViolations: 0,
      expectDesync: false,
      expect010Trigger: false
    },
    // 3. Dockerfile at root -> config profile
    {
      id: "PD-03-ROOT-DOCKERFILE",
      desc: "Dockerfile with commented secret must not trigger",
      file: "Dockerfile",
      content: "# ENV SECRET_KEY=realvalue1234abcd\nFROM alpine:latest\n",
      expectViolations: 0,
      expectDesync: false,
      expect010Trigger: false
    },
    // 4. Subdirectory sub/Dockerfile.dev -> config profile
    {
      id: "PD-04-SUB-DOCKERFILE-DEV",
      desc: "sub/Dockerfile.dev with unclosed quote in RUN command must not desync",
      file: "sub/Dockerfile.dev",
      content: 'FROM node:20\nRUN echo "unclosed\n',
      expectViolations: 0,
      expectDesync: false,
      expect010Trigger: false
    },
    // 5. api.Dockerfile -> config profile
    {
      id: "PD-05-API-DOCKERFILE",
      desc: "api.Dockerfile with commented secret must not trigger",
      file: "api.Dockerfile",
      content: "# ARG DB_PASSWORD=realvalue1234abcd\nFROM node:20\n",
      expectViolations: 0,
      expectDesync: false,
      expect010Trigger: false
    },
    // 6. a.yml -> config profile
    {
      id: "PD-06-A-YML",
      desc: "a.yml with hash comment must not trigger",
      file: "a.yml",
      content: "# password: realvalue1234abcd\nversion: '3'\n",
      expectViolations: 0,
      expectDesync: false,
      expect010Trigger: false
    },
    // 7. .envrc -> NOT config (code profile, # is not recognized as comment for code)
    {
      id: "PD-07-ENVRC-NOT-CONFIG",
      desc: ".envrc is NOT config profile",
      file: ".envrc",
      content: "export FOO=bar\n",
      expectViolations: 0,
      expectDesync: false,
      expect010Trigger: false
    },
    // 8. .environment -> NOT config profile
    {
      id: "PD-08-ENVIRONMENT-NOT-CONFIG",
      desc: ".environment is NOT config profile",
      file: ".environment",
      content: "MODE=test\n",
      expectViolations: 0,
      expectDesync: false,
      expect010Trigger: false
    },
    // 9. dockerfile-tools/index.ts -> MUST BE CODE PROFILE (// comment stripped, string tracked)
    {
      id: "PD-09-DOCKERFILE-TOOLS-TS",
      desc: "dockerfile-tools/index.ts must use code profile (not config profile despite dockerfile in path)",
      file: "dockerfile-tools/index.ts",
      content: '// const apiKey = "sk_live_1234567890abcdef1234";\nexport const x = 1;\n',
      expectViolations: 0,
      expectDesync: false,
      expect010Trigger: false
    },
    // 10. docker/dockerfile_utils.py -> MUST BE CODE PROFILE
    {
      id: "PD-10-DOCKERFILE-UTILS-PY",
      desc: "docker/dockerfile_utils.py must use code profile",
      file: "docker/dockerfile_utils.py",
      content: '# const apiKey = "sk_live_1234567890abcdef1234"\ndef build(): pass\n',
      expectViolations: 0,
      expectDesync: false,
      expect010Trigger: false
    },
    // 11. Windows backslash path sub\Dockerfile.dev
    {
      id: "PD-11-WINDOWS-BACKSLASH-PATH",
      desc: "Windows backslash path sub\\Dockerfile.dev correctly dispatched to config profile",
      file: "sub\\Dockerfile.dev",
      content: "# ENV SECRET_KEY=realvalue1234abcd\nFROM scratch\n",
      expectViolations: 0,
      expectDesync: false,
      expect010Trigger: false
    }
  ];

  let passed = 0;
  let total = 0;
  const errors: string[] = [];

  for (const c of cases) {
    total++;
    const caseDir = resolve(suiteDir, c.id);
    mkdirSync(caseDir, { recursive: true });

    // Normalize path for creation
    const filePath = resolve(caseDir, c.file);
    const parentDir = resolve(filePath, "..");
    if (!existsSync(parentDir)) mkdirSync(parentDir, { recursive: true });
    writeFileSync(filePath, c.content, "utf8");

    // Init git repo so env classification doesn't skip or fail unexpectedly
    spawnSync("git", ["init"], { cwd: caseDir });
    spawnSync("git", ["add", "-A"], { cwd: caseDir });

    const r = spawnSync("bun", [
      gatePath,
      "--root", caseDir,
      "--rules", rulesPath,
      "--json"
    ], { encoding: "utf8" });

    let json: any = {};
    try {
      json = JSON.parse(r.stdout);
    } catch (e) {
      errors.push(`FAIL: ${c.id} - Invalid JSON output from gate: ${r.stderr || r.stdout}`);
      continue;
    }

    const desyncFiles: string[] = json.desync_files || [];
    const violations: any[] = json.violations || [];
    const hasDesync = desyncFiles.length > 0;
    const has010 = violations.some((v) => v.ruleId === "ASTESIA-010");

    let casePass = true;
    if (hasDesync !== c.expectDesync) {
      errors.push(`FAIL: ${c.id} - expectDesync=${c.expectDesync}, got hasDesync=${hasDesync}`);
      casePass = false;
    }
    if (has010 !== c.expect010Trigger) {
      errors.push(`FAIL: ${c.id} - expect010Trigger=${c.expect010Trigger}, got has010=${has010}`);
      casePass = false;
    }

    if (casePass) {
      passed++;
    }

    try { rmSync(caseDir, { recursive: true, force: true }); } catch {}
  }

  try { rmSync(suiteDir, { recursive: true, force: true }); } catch {}

  return { total, passed, failed: total - passed, errors };
}

if (import.meta.main) {
  const gate = resolve(__dirname, "../astesia-gate.ts");
  const rules = resolve(__dirname, "../anti-patterns.json");
  const tmp = resolve(__dirname, "../../../.astesia/audit/tmp");
  const res = runProfileDispatchSuite(gate, rules, tmp);
  console.log(`Profile Dispatch Suite: ${res.passed}/${res.total} passed`);
  if (res.errors.length > 0) {
    for (const e of res.errors) console.error(e);
    process.exit(1);
  }
  process.exit(0);
}
