import * as fs from "fs";
import * as path from "path";

export interface FlagDoc {
  type: string;
  argument: string | null;
  description: string;
}

export interface GateRuleDoc {
  id: string;
  severity: string;
  description: string;
}

export interface SubprocessArgDoc {
  arg: string;
  line: number;
  reason: string;
}

export interface GateContract {
  never_baseline: string[];
  never_inline_suppress: string[];
  cli_flags: Array<{
    flag: string;
    type: string;
    argument: string | null;
    description: string;
    first_line: number;
  }>;
  subprocess_args: SubprocessArgDoc[];
  directives: string[];
  rules: GateRuleDoc[];
}

const KNOWN_SUBPROCESS_ARGS: Record<string, string> = {
  "--stdin": "Argumen subprocess yang diteruskan ke `git check-ignore -z --stdin` di dalam `classifyEnvFiles`, bukan argumen CLI gate.",
};

export function extractGateContract(
  gatePath = "templates/enforcement/astesia-gate.ts",
  rulesPath = "templates/enforcement/anti-patterns.json",
  descPath = "docs/gate-reference-descriptions.json",
  limitationsPath = "docs/gate-limitations.md"
): { contract: GateContract; limitationsText: string } {
  // Fail-closed checks on required files
  if (!fs.existsSync(gatePath)) {
    console.error(`FAIL-CLOSED: Gate source file not found: ${gatePath}`);
    process.exit(2);
  }
  if (!fs.existsSync(rulesPath)) {
    console.error(`FAIL-CLOSED: Anti-patterns source file not found: ${rulesPath}`);
    process.exit(2);
  }
  if (!fs.existsSync(descPath)) {
    console.error(`FAIL-CLOSED: Gate descriptions file not found: ${descPath}`);
    process.exit(2);
  }
  if (!fs.existsSync(limitationsPath)) {
    console.error(`FAIL-CLOSED: Gate limitations file not found: ${limitationsPath}`);
    process.exit(2);
  }

  const gateSource = fs.readFileSync(gatePath, "utf8");
  const rulesJsonRaw = fs.readFileSync(rulesPath, "utf8");
  const descJsonRaw = fs.readFileSync(descPath, "utf8");
  const limitationsText = fs.readFileSync(limitationsPath, "utf8");

  // 1. Extract NEVER_BASELINE
  const nbMatch = gateSource.match(/NEVER_BASELINE\s*=\s*new Set\(\[([\s\S]*?)\]\)/);
  if (!nbMatch) {
    console.error("FAIL-CLOSED: Pattern NEVER_BASELINE not found in astesia-gate.ts");
    process.exit(2);
  }
  const neverBaseline = [...nbMatch[1].matchAll(/["']([^"']+)["']/g)].map(m => m[1]);
  if (neverBaseline.length === 0) {
    console.error("FAIL-CLOSED: NEVER_BASELINE extracted empty array");
    process.exit(2);
  }

  // 2. Extract NEVER_INLINE_SUPPRESS
  const nisMatch = gateSource.match(/NEVER_INLINE_SUPPRESS\s*=\s*new Set\(\[([\s\S]*?)\]\)/);
  if (!nisMatch) {
    console.error("FAIL-CLOSED: Pattern NEVER_INLINE_SUPPRESS not found in astesia-gate.ts");
    process.exit(2);
  }
  const neverInlineSuppress = [...nisMatch[1].matchAll(/["']([^"']+)["']/g)].map(m => m[1]);
  if (neverInlineSuppress.length === 0) {
    console.error("FAIL-CLOSED: NEVER_INLINE_SUPPRESS extracted empty array");
    process.exit(2);
  }

  // 3. Parse descriptions oracle table
  let flagDescriptions: Record<string, FlagDoc>;
  try {
    flagDescriptions = JSON.parse(descJsonRaw);
  } catch (err: any) {
    console.error("FAIL-CLOSED: Invalid JSON in gate-reference-descriptions.json:", err.message);
    process.exit(2);
  }

  // 4. Locate flags in gate source (via literal occurrence or parseArgs lookup)
  const gateLines = gateSource.split(/\r?\n/);

  function findFlagLocation(flag: string): number | null {
    // Check direct literal string
    for (let idx = 0; idx < gateLines.length; idx++) {
      if (gateLines[idx].includes(flag)) {
        return idx + 1;
      }
    }
    // Check parseArgs opts.get / flags.has / args.indexOf
    const key = flag.replace(/^--/, "");
    const patterns = [
      `opts.get("${key}")`,
      `opts.get('${key}')`,
      `flags.has("${key}")`,
      `flags.has('${key}')`,
      `args.indexOf("${flag}")`,
      `args.indexOf('${flag}')`,
    ];
    for (let idx = 0; idx < gateLines.length; idx++) {
      for (const pat of patterns) {
        if (gateLines[idx].includes(pat)) {
          return idx + 1;
        }
      }
    }
    return null;
  }

  // Scan all literals matching --[a-z][a-z-]*
  const literalMap = new Map<string, number>();
  for (let idx = 0; idx < gateLines.length; idx++) {
    const line = gateLines[idx];
    const matches = line.match(/--[a-z][a-z-]*/g);
    if (matches) {
      for (const m of matches) {
        if (!literalMap.has(m)) {
          literalMap.set(m, idx + 1);
        }
      }
    }
  }

  // Validate all oracle flags exist in gate source
  const oracleFlags = Object.keys(flagDescriptions).sort();
  const cliFlags: GateContract["cli_flags"] = [];
  for (const flag of oracleFlags) {
    const lineNo = findFlagLocation(flag);
    if (!lineNo) {
      console.error(`FAIL-CLOSED: Oracle flag ${flag} was not found in gate source (${gatePath})`);
      process.exit(2);
    }
    const desc = flagDescriptions[flag];
    cliFlags.push({
      flag,
      type: desc.type,
      argument: desc.argument,
      description: desc.description,
      first_line: lineNo,
    });
  }

  // Validate discovered literals: must be in oracle, or known subprocess argument
  const subprocessArgs: SubprocessArgDoc[] = [];
  for (const [flag, lineNo] of literalMap.entries()) {
    if (KNOWN_SUBPROCESS_ARGS[flag]) {
      subprocessArgs.push({
        arg: flag,
        line: lineNo,
        reason: KNOWN_SUBPROCESS_ARGS[flag],
      });
      continue;
    }

    if (!flagDescriptions[flag]) {
      // Check if this appears in CLI arguments parsing context
      const lineContext = gateLines[lineNo - 1] || "";
      if (lineContext.includes("args.") || lineContext.includes("opts.") || lineContext.includes("flags.")) {
        console.error(`FAIL-CLOSED: Gate literal flag ${flag} at line ${lineNo} lacks documentation in descriptions oracle`);
        process.exit(2);
      }
    }
  }

  // Sort CLI flags alphabetically by flag name
  cliFlags.sort((a, b) => a.flag.localeCompare(b.flag));
  subprocessArgs.sort((a, b) => a.arg.localeCompare(b.arg));

  if (cliFlags.length < 8) {
    console.error(`FAIL-CLOSED: CLI flag count (${cliFlags.length}) is below safety threshold 8`);
    process.exit(2);
  }

  // 5. Extract Directives from gate source
  const directives: string[] = [];
  if (gateSource.includes("astesia-allow")) {
    directives.push("astesia-allow");
  }
  if (gateSource.includes("astesia-debt")) {
    directives.push("astesia-debt");
  }
  if (gateSource.includes("astesia-disable")) {
    console.error("FAIL-CLOSED: Forbidden directive 'astesia-disable' found in gate source");
    process.exit(2);
  }

  // 6. Extract Rules from anti-patterns.json
  let rulesData: any;
  try {
    rulesData = JSON.parse(rulesJsonRaw);
  } catch (err: any) {
    console.error("FAIL-CLOSED: anti-patterns.json invalid JSON:", err.message);
    process.exit(2);
  }

  if (!Array.isArray(rulesData.rules) || rulesData.rules.length === 0) {
    console.error("FAIL-CLOSED: No rules array in anti-patterns.json");
    process.exit(2);
  }

  const rules: GateRuleDoc[] = [];
  for (const r of rulesData.rules) {
    if (!r.id || !r.severity || !r.description) {
      console.error(`FAIL-CLOSED: Rule missing required fields (id, severity, or description): ${JSON.stringify(r)}`);
      process.exit(2);
    }
    rules.push({
      id: r.id,
      severity: r.severity,
      description: r.description,
    });
  }

  rules.sort((a, b) => a.id.localeCompare(b.id));

  return {
    contract: {
      never_baseline: neverBaseline,
      never_inline_suppress: neverInlineSuppress,
      cli_flags: cliFlags,
      subprocess_args: subprocessArgs,
      directives,
      rules,
    },
    limitationsText,
  };
}

export function generateGateReferenceMarkdown(contract: GateContract, limitationsText: string): string {
  const flagsRows = contract.cli_flags.map((f) => {
    const flagDisplay = f.argument ? `\`${f.flag} ${f.argument}\`` : `\`${f.flag}\``;
    return `| ${flagDisplay} | ${f.type} | ${f.description} |`;
  });

  const subprocessRows = contract.subprocess_args.map((s) => {
    return `| \`${s.arg}\` | Baris ${s.line} | ${s.reason} |`;
  });

  const rulesRows = contract.rules.map((r) => {
    return `| \`${r.id}\` | \`${r.severity}\` | ${r.description} |`;
  });

  return `# Referensi Resmi Astesia Gate Enforcement (Release Candidate)
*Dokumen ini dihasilkan secara otomatis dari sumber kode \`templates/enforcement/astesia-gate.ts\` dan \`templates/enforcement/anti-patterns.json\`. JANGAN SUNTING MANUAL.*

---

## 1. Argumen & Flag CLI Astesia Gate
Astesia gate mendukung opsi dan flag CLI berikut:

| Flag / Opsi | Tipe | Deskripsi Kontrak |
| :--- | :--- | :--- |
${flagsRows.join("\n")}

### Subprocess Arguments (Excluded)
Argumen berikut terdeteksi di dalam kode sumber namun BUKAN bagian dari antarmuka CLI gate:

| Argumen | Lokasi Kode | Keterangan Pengecualian |
| :--- | :--- | :--- |
${subprocessRows.join("\n")}

---

## 2. Kebijakan Ratchet & Pembungkaman Inline

### NEVER_BASELINE Rules
Aturan-aturan berikut **DILARANG KERAS** dimasukkan ke dalam baseline ratchet:
\`\`\`json
${JSON.stringify(contract.never_baseline, null, 2)}
\`\`\`

### NEVER_INLINE_SUPPRESS Rules
Aturan-aturan berikut **DILARANG KERAS** dibungkam menggunakan komentar inline (misal \`astesia-allow\`):
\`\`\`json
${JSON.stringify(contract.never_inline_suppress, null, 2)}
\`\`\`

### Supported Inline Directives
Hanya direktif inline berikut yang didukung oleh pemindai kode gate:
- \`astesia-allow\`: Pembungkaman peringatan inline untuk satu baris, wajib disertai alasan yang jelas setelah tanda titik dua.
- \`astesia-debt\`: Penanda utang teknis untuk satu baris, wajib disertai klausul \`upgrade:\` konkret.

*Catatan: Direktif penonaktifan menyeluruh tidak didukung oleh Astesia gate.*

---

## 3. Registri Aturan Anti-Pattern & Severity

| Rule ID | Severity | Deskripsi Aturan |
| :--- | :--- | :--- |
${rulesRows.join("\n")}

---

${limitationsText.trim()}
`;
}

// CLI Execution
if (import.meta.main || require.main === module) {
  try {
    const args = process.argv.slice(2);
    const isCheck = args.includes("--check");
    const isWrite = args.includes("--write");

    const gateIdx = args.indexOf("--gate-file");
    const gateFile = gateIdx !== -1 ? args[gateIdx + 1] : undefined;

    const rulesIdx = args.indexOf("--rules-file");
    const rulesFile = rulesIdx !== -1 ? args[rulesIdx + 1] : undefined;

    const descIdx = args.indexOf("--desc-file");
    const descFile = descIdx !== -1 ? args[descIdx + 1] : undefined;

    const limitIdx = args.indexOf("--limitations-file");
    const limitFile = limitIdx !== -1 ? args[limitIdx + 1] : undefined;

    const outIdx = args.indexOf("--output");
    const targetPath = outIdx !== -1 ? path.resolve(args[outIdx + 1]) : path.resolve("docs/GATE-REFERENCE.md");

    const { contract, limitationsText } = extractGateContract(gateFile, rulesFile, descFile, limitFile);
    const expectedMd = generateGateReferenceMarkdown(contract, limitationsText);

    if (isCheck) {
      if (!fs.existsSync(targetPath)) {
        console.error(`FAIL: ${targetPath} does not exist`);
        process.exit(1);
      }
      const currentMd = fs.readFileSync(targetPath, "utf8");
      // Normalize line breaks for comparison
      const normCurrent = currentMd.replace(/\r\n/g, "\n");
      const normExpected = expectedMd.replace(/\r\n/g, "\n");
      if (normCurrent !== normExpected) {
        console.error(`FAIL: ${targetPath} is out of sync with gate source!`);
        process.exit(1);
      }
      console.log(`PASS: ${targetPath} is synchronized with gate source.`);
      process.exit(0);
    } else if (isWrite) {
      fs.writeFileSync(targetPath, expectedMd, "utf8");
      console.log(`Generated and updated ${targetPath}`);
      process.exit(0);
    } else {
      console.log(expectedMd);
      process.exit(0);
    }
  } catch (err: any) {
    console.error(`[TOOL_FAILED: ${err.message}]`);
    process.exit(2);
  }
}
