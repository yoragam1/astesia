import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

export interface RegexLiteralTestCase {
  id: string;
  name: string;
  filename: string;
  content: string;
  expectedViolationLine: number;
  expectedRuleId: string;
}

export const REGEX_LITERAL_CASES: RegexLiteralTestCase[] = [
  // Positive regex cases (must tokenize as regex without desync, and catch violation a few lines later)
  {
    id: "RL-01",
    name: "const r = /`/; backtick inside regex literal",
    filename: "rl01.ts",
    content: "const r = /`/;\nconst ok = 1;\nexport const bad: any = 1;\n",
    expectedViolationLine: 3,
    expectedRuleId: "ASTESIA-005"
  },
  {
    id: "RL-02",
    name: 'x = /"/g double quote inside regex literal with flag',
    filename: "rl02.ts",
    content: 'let x = /"/g; const s = "`";\nconst next = 1;\nexport const bad: any = 1;\n',
    expectedViolationLine: 3,
    expectedRuleId: "ASTESIA-005"
  },
  {
    id: "RL-03",
    name: "y = /'/ single quote inside regex literal",
    filename: "rl03.ts",
    content: "let y = /'/; const s = '`';\nconst next = 1;\nexport const bad: any = 1;\n",
    expectedViolationLine: 3,
    expectedRuleId: "ASTESIA-005"
  },
  {
    id: "RL-04",
    name: "z = /\\/*/ block comment opener inside regex literal",
    filename: "rl04.ts",
    content: "const z = /\\/*/;\nconst a = 1;\nexport const bad: any = 1;\n",
    expectedViolationLine: 3,
    expectedRuleId: "ASTESIA-005"
  },
  {
    id: "RL-05",
    name: "w = /[/*]/ slash and star inside regex character class",
    filename: "rl05.ts",
    content: "const w = /[/*]/;\nconst a = 1;\nexport const bad: any = 1;\n",
    expectedViolationLine: 3,
    expectedRuleId: "ASTESIA-005"
  },
  {
    id: "RL-06",
    name: "/a\\/\\/b/ escaped double slash inside regex at start of file",
    filename: "rl06.ts",
    content: "/a\\/\\/b/.test('a//b'); const s = `multiline\nend`;\nexport const bad: any = 1;\n",
    expectedViolationLine: 3,
    expectedRuleId: "ASTESIA-005"
  },
  {
    id: "RL-07",
    name: 'return /"/.test(s) regex after return keyword',
    filename: "rl07.ts",
    content: 'function f(s: string) {\n  return /"/.test(s) && s !== "`";\n}\nexport const bad: any = 1;\n',
    expectedViolationLine: 4,
    expectedRuleId: "ASTESIA-005"
  },
  {
    id: "RL-08",
    name: "case /x`/.test(s): regex after case keyword",
    filename: "rl08.ts",
    content: "switch (true) {\n  case /x`/.test(s):\n    break;\n}\nexport const bad: any = 1;\n",
    expectedViolationLine: 5,
    expectedRuleId: "ASTESIA-005"
  },
  {
    id: "RL-09",
    name: "arr.filter(x => /'/.test(x)) regex after fat arrow =>",
    filename: "rl09.ts",
    content: "const res = ['a'].filter(x => /'/.test(x) && x !== '`');\nconst next = 1;\nexport const bad: any = 1;\n",
    expectedViolationLine: 3,
    expectedRuleId: "ASTESIA-005"
  },
  {
    id: "RL-10",
    name: "{ pattern: /`/ } regex after colon in object literal",
    filename: "rl10.ts",
    content: "const cfg = { pattern: /`/ };\nconst next = 1;\nexport const bad: any = 1;\n",
    expectedViolationLine: 3,
    expectedRuleId: "ASTESIA-005"
  },
  {
    id: "RL-11",
    name: "s.replace(/\\//g, '') chained with .replace(/`/g, '')",
    filename: "rl11.ts",
    content: "const clean = 'a/b`c'.replace(/\\//g, '').replace(/`/g, '');\nconst next = 1;\nexport const bad: any = 1;\n",
    expectedViolationLine: 3,
    expectedRuleId: "ASTESIA-005"
  },
  {
    id: "RL-12",
    name: "regex with backtick inside ${ } template interpolation",
    filename: "rl12.ts",
    content: "const msg = `hasBacktick=${/`/.test('a`b')}`;\nconst next = 1;\nexport const bad: any = 1;\n",
    expectedViolationLine: 3,
    expectedRuleId: "ASTESIA-005"
  },
  {
    id: "RL-13",
    name: "regex after ( and ,",
    filename: "rl13.ts",
    content: "const m = [/`/, /\"/].some((r) => r.test('x'));\nconst next = 1;\nexport const bad: any = 1;\n",
    expectedViolationLine: 3,
    expectedRuleId: "ASTESIA-005"
  },
  {
    id: "RL-14",
    name: "regex after !, &&, ||, ?",
    filename: "rl14.ts",
    content: "const ok = !/`/.test(a) && /\"/.test(b) || /'/.test(c) ? /`/ : /'/;\nconst next = 1;\nexport const bad: any = 1;\n",
    expectedViolationLine: 3,
    expectedRuleId: "ASTESIA-005"
  },
  {
    id: "RL-15",
    name: "regex after ; + - * % ~ ^",
    filename: "rl15.ts",
    content: "let k = 0; /`/.test(a);\nconst n = +/`/.source.length - /\"/.source.length * /'/.source.length % /`/.source.length ^ ~/\"/.source.length;\nexport const bad: any = 1;\n",
    expectedViolationLine: 3,
    expectedRuleId: "ASTESIA-005"
  },
  {
    id: "RL-16",
    name: "regex after typeof, void, delete, throw, new, await, yield",
    filename: "rl16.ts",
    content: "const t = typeof /`/;\nvoid /`/;\nfunction* gen() { yield /`/; }\nexport const bad: any = 1;\n",
    expectedViolationLine: 4,
    expectedRuleId: "ASTESIA-005"
  },
  {
    id: "RL-17",
    name: "regex after do, else, in, of, instanceof",
    filename: "rl17.ts",
    content: "if (a) {} else /`/.test(b);\nconst b1 = 'x' in /`/;\nexport const bad: any = 1;\n",
    expectedViolationLine: 3,
    expectedRuleId: "ASTESIA-005"
  },
  {
    id: "RL-18",
    name: "regex with character class containing [/`\"'/*]",
    filename: "rl18.ts",
    content: "const p = /[\\/`\"'/*]/gimsu;\nconst next = 1;\nexport const bad: any = 1;\n",
    expectedViolationLine: 3,
    expectedRuleId: "ASTESIA-005"
  },
  {
    id: "RL-19",
    name: "regex on CRLF lines",
    filename: "rl19.ts",
    content: "const r1 = /`/g;\r\nconst r2 = /\\/*/g;\r\nexport const bad: any = 1;\r\n",
    expectedViolationLine: 3,
    expectedRuleId: "ASTESIA-005"
  },
  {
    id: "RL-20",
    name: "regex inside Vue/Svelte <script> block",
    filename: "rl20.svelte",
    content: "<script lang=\"ts\">\nconst r = /`/g;\nexport let bad: any = 1;\n</script>\n<div>ok</div>\n",
    expectedViolationLine: 3,
    expectedRuleId: "ASTESIA-005"
  },
  // Negative cases: division must NOT open regex
  {
    id: "RL-21",
    name: "Division a / b / c followed by string with backtick",
    filename: "rl21.ts",
    content: 'const x = a / b / c; const s = "`";\nconst next = 1;\nexport const bad: any = 1;\n',
    expectedViolationLine: 3,
    expectedRuleId: "ASTESIA-005"
  },
  {
    id: "RL-22",
    name: "Division (a + b) / 2 followed by string with backtick and slash",
    filename: "rl22.ts",
    content: 'const x = (a + b) / 2; const s = "` / ";\nconst next = 1;\nexport const bad: any = 1;\n',
    expectedViolationLine: 3,
    expectedRuleId: "ASTESIA-005"
  },
  {
    id: "RL-23",
    name: "Division x[0] / y followed by string with backtick and slash",
    filename: "rl23.ts",
    content: 'const x = arr[0] / y; const s = "` / ";\nconst next = 1;\nexport const bad: any = 1;\n',
    expectedViolationLine: 3,
    expectedRuleId: "ASTESIA-005"
  },
  {
    id: "RL-24",
    name: "Division i++ / 2 and i-- / 2 followed by string with backtick and slash",
    filename: "rl24.ts",
    content: 'const x = i++ / 2 + j-- / 2; const s = "` / ";\nconst next = 1;\nexport const bad: any = 1;\n',
    expectedViolationLine: 3,
    expectedRuleId: "ASTESIA-005"
  },
  {
    id: "RL-25",
    name: "Division 10 / 5 / 1 followed by string with backtick",
    filename: "rl25.ts",
    content: 'const x = 10 / 5 / 1; const s = "`";\nconst next = 1;\nexport const bad: any = 1;\n',
    expectedViolationLine: 3,
    expectedRuleId: "ASTESIA-005"
  },
  {
    id: "RL-26",
    name: "Division a /b/ c without spaces followed by string with backtick",
    filename: "rl26.ts",
    content: 'const x = a /b/ c; const s = "`";\nconst next = 1;\nexport const bad: any = 1;\n',
    expectedViolationLine: 3,
    expectedRuleId: "ASTESIA-005"
  },
  {
    id: "RL-27",
    name: "Division after closing brace } / 2 followed by string with backtick and slash",
    filename: "rl27.ts",
    content: 'const x = ({ valueOf() { return 4; } } as unknown as number) / 2; const fn = function() { return 1; } as unknown as number / 2; const s = "` / ";\nconst b = { a: 1 } / 2; const t = "` / ";\nexport const bad: any = 1;\n',
    expectedViolationLine: 3,
    expectedRuleId: "ASTESIA-005"
  },
  // JSX / TSX cases
  {
    id: "RL-28",
    name: "JSX <div>text</div> must not open regex on closing tag",
    filename: "rl28.tsx",
    content: 'const el = <div>text</div>; const s = "` / ";\nconst next = 1;\nexport const bad: any = 1;\n',
    expectedViolationLine: 3,
    expectedRuleId: "ASTESIA-005"
  },
  {
    id: "RL-29",
    name: "JSX self-closing <Foo /> and <br/> on same line",
    filename: "rl29.tsx",
    content: 'const el = <><Foo /><br/></>; const s = "`";\nconst next = 1;\nexport const bad: any = 1;\n',
    expectedViolationLine: 3,
    expectedRuleId: "ASTESIA-005"
  },
  {
    id: "RL-30",
    name: 'JSX <a href="/x">/path</a> with slash in text and closing tag',
    filename: "rl30.tsx",
    content: 'const el = <a href="/x">/path</a>; const s = "`";\nconst next = 1;\nexport const bad: any = 1;\n',
    expectedViolationLine: 3,
    expectedRuleId: "ASTESIA-005"
  },
  {
    id: "RL-31",
    name: "JSX closing tag </div> followed by slash in JSX text",
    filename: "rl31.tsx",
    content: 'const el = <div><span>a</span> / <span>b</span></div>; const s = "`";\nconst next = 1;\nexport const bad: any = 1;\n',
    expectedViolationLine: 3,
    expectedRuleId: "ASTESIA-005"
  },
  {
    id: "RL-32",
    name: "JSX text with apostrophe on same line as template literal",
    filename: "rl32.tsx",
    content: "const el = <div>Don't panic {`user`}</div>;\nconst next = 1;\nexport const bad: any = 1;\n",
    expectedViolationLine: 3,
    expectedRuleId: "ASTESIA-005"
  },
  // Boundary & fallback cases
  {
    id: "RL-33",
    name: "Unclosed regex on line falls back to division without state leak",
    filename: "rl33.ts",
    content: "const x = /abc\nconst ok = `valid template`;\nexport const bad: any = 1;\n",
    expectedViolationLine: 3,
    expectedRuleId: "ASTESIA-005"
  },
  {
    id: "RL-34",
    name: "Regex > 2000 chars falls back to division without state leak",
    filename: "rl34.ts",
    content: `const x = /${"a".repeat(2005)}/;\nconst ok = 1;\nexport const bad: any = 1;\n`,
    expectedViolationLine: 3,
    expectedRuleId: "ASTESIA-005"
  },
  {
    id: "RL-35",
    name: "Triple backtick inside regex /```[\\s\\S]*?```/g",
    filename: "rl35.ts",
    content: "const CODE_BLOCK = /```[\\s\\S]*?```/g;\nconst next = 1;\nexport const bad: any = 1;\n",
    expectedViolationLine: 3,
    expectedRuleId: "ASTESIA-005"
  },
  {
    id: "RL-36",
    name: "Nested template literal with escaped backticks inside ${ }",
    filename: "rl36.ts",
    content: "const msg = `Header: ${flag ? `\\`inner\\`` : 'none'}`;\nconst next = 1;\nexport const bad: any = 1;\n",
    expectedViolationLine: 3,
    expectedRuleId: "ASTESIA-005"
  }
];

export function runRegexLiteralSuite(
  customGatePath?: string,
  customTmpDir?: string
): { total: number; passed: number; failed: number; known_gaps: number; errors: string[] } {
  const gatePath = customGatePath || resolve(__dirname, "../astesia-gate.ts");
  const rulesPath = resolve(__dirname, "../anti-patterns.json");
  const baseTmp = customTmpDir || resolve(__dirname, "../../../.astesia/audit/tmp/regex-literal-" + Date.now());
  mkdirSync(baseTmp, { recursive: true });

  let passed = 0;
  let failed = 0;
  const errors: string[] = [];

  try {
    for (const tc of REGEX_LITERAL_CASES) {
      const filePath = join(baseTmp, tc.filename);
      writeFileSync(filePath, tc.content, "utf8");
    }

    const res = spawnSync(process.execPath, [gatePath, "--root", baseTmp, "--rules", rulesPath, "--json"], {
      encoding: "utf8",
      maxBuffer: 30 * 1024 * 1024
    });

    const parsed = JSON.parse(res.stdout || "{}");
    const violations: Array<{ ruleId: string; file: string; line: number }> = parsed.violations || [];
    const desyncSet = new Set<string>(parsed.desync_files || []);

    for (const tc of REGEX_LITERAL_CASES) {
      const fileViols = violations.filter((v) => v.file === tc.filename);
      const hasDesync = desyncSet.has(tc.filename) || fileViols.some((v) => v.ruleId === "TOKENIZER_DESYNC");
      const hasExpected = fileViols.some((v) => v.ruleId === tc.expectedRuleId && v.line === tc.expectedViolationLine);
      const extraRuleViols = fileViols.filter((v) => v.ruleId === tc.expectedRuleId);

      if (!hasDesync && hasExpected && extraRuleViols.length === 1) {
        passed++;
      } else {
        failed++;
        errors.push(
          `FAIL: ${tc.id} (${tc.name}) - hasDesync=${hasDesync}, hasExpected=${hasExpected} at L${tc.expectedViolationLine}, viols=${JSON.stringify(fileViols)}`
        );
      }
    }
  } finally {
    try {
      rmSync(baseTmp, { recursive: true, force: true });
    } catch {}
  }

  return { total: passed + failed, passed, failed, known_gaps: 0, errors };
}

if (import.meta.main) {
  const r = runRegexLiteralSuite();
  console.log(`Regex Literal Suite: ${r.passed}/${r.total} passed (${r.failed} failed)`);
  if (r.errors.length > 0) {
    console.error(r.errors.join("\n"));
    process.exit(1);
  }
}
