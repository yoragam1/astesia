/**
 * templates/enforcement/tests/config-quote-suite.ts
 * Tests for F-G: preservation of '#' inside quoted YAML and .env values (VER3-004).
 */
import { preprocessSource } from "../astesia-gate";
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function runConfigQuoteSuite(testTmpDir: string, gatePath: string): {
  total: number;
  passed: number;
  failed: number;
  errors: string[];
} {
  const errors: string[] = [];
  let passed = 0;
  let total = 0;

  function assert(name: string, cond: boolean, msg?: string) {
    total++;
    if (cond) {
      passed++;
    } else {
      errors.push(`FAIL: ${name}${msg ? " - " + msg : ""}`);
    }
  }

  // 1. .env double quotes with # and space around #
  {
    const prep = preprocessSource('SECRET="my # secret # password"\n', ".env");
    assert(".env double quoted ' # ' is preserved in codeLines", prep.codeLines[0].includes('SECRET="my # secret # password"'));
    assert(".env double quoted ' # ' does not create commentLines", !prep.commentLines[0].includes("secret"));
  }

  // 2. .env single quotes with # and space around #
  {
    const prep = preprocessSource("SECRET='my # secret # password'\n", ".env");
    assert(".env single quoted ' # ' is preserved in codeLines", prep.codeLines[0].includes("SECRET='my # secret # password'"));
    assert(".env single quoted ' # ' does not create commentLines", !prep.commentLines[0].includes("secret"));
  }

  // 3. .env with quoted value AND trailing comment
  {
    const prep = preprocessSource('SECRET="my#secret#123" # this is a comment\n', ".env");
    assert(".env codeLines preserves quoted value with #", prep.codeLines[0].includes('SECRET="my#secret#123"'));
    assert(".env commentLines contains trailing comment", prep.commentLines[0].includes("# this is a comment"));
    assert(".env codeLines does NOT contain trailing comment", !prep.codeLines[0].includes("this is a comment"));
  }

  // 4. YAML double quotes with #
  {
    const prep = preprocessSource('api_key: "secret#with#hash"\n', "config.yml");
    assert("YAML double quoted # is preserved in codeLines", prep.codeLines[0].includes('api_key: "secret#with#hash"'));
    assert("YAML double quoted # does not create commentLines", !prep.commentLines[0].includes("with#hash"));
  }

  // 5. YAML single quotes with # and trailing comment
  {
    const prep = preprocessSource("password: 'pass#word#123' # real yaml comment\n", "app.yaml");
    assert("YAML single quoted # is preserved in codeLines", prep.codeLines[0].includes("password: 'pass#word#123'"));
    assert("YAML commentLines contains trailing comment", prep.commentLines[0].includes("# real yaml comment"));
  }

  // 6. YAML whole line comment
  {
    const prep = preprocessSource("# This is a whole line comment\nkey: value\n", "config.yml");
    assert("YAML whole line comment goes to commentLines", prep.commentLines[0].includes("# This is a whole line comment"));
    assert("YAML whole line comment codeLines is empty/whitespace", prep.codeLines[0].trim() === "");
  }

  // 7. YAML unquoted value with trailing comment
  {
    const prep = preprocessSource("timeout: 30 # seconds\n", "config.yml");
    assert("YAML unquoted value codeLines has timeout: 30", prep.codeLines[0].includes("timeout: 30"));
    assert("YAML unquoted trailing comment goes to commentLines", prep.commentLines[0].includes("# seconds"));
  }

  // 8. YAML text containing apostrophe (don't) with trailing comment
  {
    const prep = preprocessSource("description: It isn't ready # status comment\n", "config.yml");
    assert("YAML apostrophe does not break codeLines", prep.codeLines[0].includes("It isn't ready"));
    assert("YAML apostrophe preserves trailing comment", prep.commentLines[0].includes("# status comment"));
  }

  // 9. Dockerfile with quoted # and trailing comment
  {
    const prep = preprocessSource('ENV SECRET="build#pass#1" # docker comment\n', "Dockerfile");
    assert("Dockerfile quoted # is preserved in codeLines", prep.codeLines[0].includes('ENV SECRET="build#pass#1"'));
    assert("Dockerfile commentLines has trailing comment", prep.commentLines[0].includes("# docker comment"));
  }

  // 10. Integration test: gate detects ASTESIA-004 / ASTESIA-010 secret containing #
  {
    const suiteDir = join(testTmpDir, `config-quote-${Date.now()}`);
    mkdirSync(suiteDir, { recursive: true });

    const rules = {
      rules: [
        {
          id: "ASTESIA-004",
          name: "Hardcoded Secrets",
          severity: "error",
          kind: "line-regex",
          description: "Hardcoded secret detected",
          fix: "Use environment variables",
          origin: "SEC-004"
        }
      ]
    };
    writeFileSync(join(suiteDir, "rules.json"), JSON.stringify(rules, null, 2), "utf8");

    // YAML file with secret containing #
    const yamlCode = `
apiKey: "sk_live_12345678#90abcdef#secret" # trailing comment
`;
    writeFileSync(join(suiteDir, "config.yml"), yamlCode, "utf8");

    const r = spawnSync("bun", [gatePath, "--root", suiteDir, "--rules", join(suiteDir, "rules.json"), "--json"], {
      encoding: "utf8"
    });
    let parsed: any = {};
    try { parsed = JSON.parse(r.stdout); } catch {}
    const violations = parsed.violations || [];
    const astesia004 = violations.filter((v: any) => v.ruleId === "ASTESIA-004");

    assert("Gate detects ASTESIA-004 on YAML with # inside quotes", astesia004.length === 1);
    assert("Gate exit code is 1", r.status === 1);

    try { rmSync(suiteDir, { recursive: true, force: true }); } catch {}
  }

  return { total, passed, failed: total - passed, errors };
}

if (import.meta.main) {
  const gate = join(__dirname, "../astesia-gate.ts");
  const tmp = join(__dirname, "../../../.astesia/audit/tmp");
  const res = runConfigQuoteSuite(tmp, gate);
  console.log(`Config Quote Suite: ${res.passed}/${res.total} passed`);
  if (res.errors.length > 0) {
    for (const e of res.errors) console.error(e);
    process.exit(1);
  }
  process.exit(0);
}
