import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

export function runGeneratedPolicySuite(
  customGatePath?: string,
  customTmpDir?: string
): { total: number; passed: number; failed: number; known_gaps: number; errors: string[] } {
  const gatePath = customGatePath || resolve(__dirname, "../astesia-gate.ts");
  const rulesPath = resolve(__dirname, "../anti-patterns.json");
  const baseTmp = customTmpDir || resolve(__dirname, "../../../.astesia/audit/tmp/gen-policy-" + Date.now());
  mkdirSync(baseTmp, { recursive: true });

  let passed = 0;
  let failed = 0;
  const errors: string[] = [];

  function record(id: string, name: string, ok: boolean, detail: string) {
    if (ok) {
      passed++;
    } else {
      failed++;
      errors.push(`FAIL: ${id} (${name}) - ${detail}`);
    }
  }

  function runGate(dir: string, extraArgs: string[] = []) {
    const start = performance.now();
    const res = spawnSync(process.execPath, [gatePath, "--root", dir, "--rules", rulesPath, ...extraArgs], {
      encoding: "utf8",
      maxBuffer: 30 * 1024 * 1024
    });
    const elapsedMs = performance.now() - start;
    let json: any = null;
    try {
      json = JSON.parse(res.stdout);
    } catch {}
    return { status: res.status, stdout: res.stdout, stderr: res.stderr, json, elapsedMs };
  }

  try {
    // GP-01: .min.js is treated as generated, not counted in files_scanned, in generated_files
    {
      const d = join(baseTmp, "gp01");
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "app.min.js"), "const x: any = 1; console.log(x);\n", "utf8");
      const r = runGate(d, ["--json"]);
      const ok =
        r.status === 0 &&
        r.json?.generated_skipped === 1 &&
        Array.isArray(r.json?.generated_files) &&
        r.json.generated_files.includes("app.min.js") &&
        r.json?.files_scanned?.total === 0;
      record("GP-01", ".min.js treated as generated_skipped", ok, JSON.stringify(r.json));
    }

    // GP-02: .min.mjs treated as generated
    {
      const d = join(baseTmp, "gp02");
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "bundle.min.mjs"), "const x = `unclosed;\n", "utf8");
      const r = runGate(d, ["--json"]);
      const ok = r.status === 0 && r.json?.generated_skipped === 1 && r.json?.desync_files?.length === 0;
      record("GP-02", ".min.mjs treated as generated without desync", ok, JSON.stringify(r.json));
    }

    // GP-03: .min.cjs treated as generated
    {
      const d = join(baseTmp, "gp03");
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "vendor.min.cjs"), "const x = `unclosed;\n", "utf8");
      const r = runGate(d, ["--json"]);
      const ok = r.status === 0 && r.json?.generated_skipped === 1 && r.json?.desync_files?.length === 0;
      record("GP-03", ".min.cjs treated as generated without desync", ok, JSON.stringify(r.json));
    }

    // GP-04: .min.css treated as generated and scanned for strong prefix secrets
    {
      const d = join(baseTmp, "gp04");
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "theme.min.css"), "body{color:red}\n/* sk_live_1234567890abcdef */\n", "utf8");
      const r = runGate(d, ["--json"]);
      const viols = r.json?.violations || [];
      const ok =
        r.status === 1 &&
        r.json?.generated_skipped === 1 &&
        viols.length === 1 &&
        viols[0].ruleId === "ASTESIA-004" &&
        viols[0].line === 2;
      record("GP-04", ".min.css treated as generated and strong secret caught on L2", ok, JSON.stringify(r.json));
    }

    // GP-05: Line of exactly 5000 chars -> generated
    {
      const d = join(baseTmp, "gp05");
      mkdirSync(d, { recursive: true });
      const line5000 = "// " + "a".repeat(4997); // 3 + 4997 = 5000
      writeFileSync(join(d, "chunk.js"), line5000 + "\nexport const bad: any = 1;\n", "utf8");
      const r = runGate(d, ["--json"]);
      const ok = r.status === 0 && r.json?.generated_skipped === 1 && r.json?.files_scanned?.total === 0 && (r.json?.violations?.length ?? 1) === 0;
      record("GP-05", "Line of exactly 5000 chars is generated", ok, JSON.stringify(r.json));
    }

    // GP-06: Line of 4999 chars -> NOT generated
    {
      const d = join(baseTmp, "gp06");
      mkdirSync(d, { recursive: true });
      const line4999 = "// " + "a".repeat(4996); // 3 + 4996 = 4999
      writeFileSync(join(d, "normal.ts"), line4999 + "\nexport const bad: any = 1;\n", "utf8");
      const r = runGate(d, ["--json"]);
      const viols = r.json?.violations || [];
      const ok =
        r.json?.generated_skipped === 0 &&
        r.json?.files_scanned?.total === 1 &&
        viols.some((v: any) => v.ruleId === "ASTESIA-005" && v.line === 2);
      record("GP-06", "Line of 4999 chars is NOT generated", ok, JSON.stringify(r.json));
    }

    // GP-07: Header marker @generated on line 1
    {
      const d = join(baseTmp, "gp07");
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "client.ts"), "// @generated by prisma\nexport const bad: any = 1;\n", "utf8");
      const r = runGate(d, ["--json"]);
      const ok = r.status === 0 && r.json?.generated_skipped === 1 && (r.json?.violations?.length ?? 1) === 0;
      record("GP-07", "Header @generated on line 1 is generated", ok, JSON.stringify(r.json));
    }

    // GP-08: Header marker DO NOT EDIT on line 5
    {
      const d = join(baseTmp, "gp08");
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "schema.ts"), "// L1\n// L2\n// L3\n// L4\n// DO NOT EDIT THIS FILE\nexport const bad: any = 1;\n", "utf8");
      const r = runGate(d, ["--json"]);
      const ok = r.status === 0 && r.json?.generated_skipped === 1 && (r.json?.violations?.length ?? 1) === 0;
      record("GP-08", "Header DO NOT EDIT on line 5 is generated", ok, JSON.stringify(r.json));
    }

    // GP-09: Header marker Code generated on line 10 (boundary inclusive)
    {
      const d = join(baseTmp, "gp09");
      mkdirSync(d, { recursive: true });
      const lines = Array.from({ length: 9 }, (_, i) => `// line ${i + 1}`).join("\n") + "\n// Code generated by protoc-gen-ts\nexport const bad: any = 1;\n";
      writeFileSync(join(d, "proto.ts"), lines, "utf8");
      const r = runGate(d, ["--json"]);
      const ok = r.status === 0 && r.json?.generated_skipped === 1 && (r.json?.violations?.length ?? 1) === 0;
      record("GP-09", "Header Code generated on line 10 is generated", ok, JSON.stringify(r.json));
    }

    // GP-10: Header marker @generated on line 11 (boundary exclusive -> NOT generated)
    {
      const d = join(baseTmp, "gp10");
      mkdirSync(d, { recursive: true });
      const lines = Array.from({ length: 10 }, (_, i) => `// line ${i + 1}`).join("\n") + "\n// @generated too late on line 11\nexport const bad: any = 1;\n";
      writeFileSync(join(d, "not_gen.ts"), lines, "utf8");
      const r = runGate(d, ["--json"]);
      const viols = r.json?.violations || [];
      const ok =
        r.json?.generated_skipped === 0 &&
        r.json?.files_scanned?.total === 1 &&
        viols.some((v: any) => v.ruleId === "ASTESIA-005" && v.line === 12);
      record("GP-10", "Header @generated on line 11 is NOT generated", ok, JSON.stringify(r.json));
    }

    // GP-11: Strong-prefix secret in the MIDDLE of 1,000,000-char line + ReDoS < 1500 ms
    {
      const d = join(baseTmp, "gp11");
      mkdirSync(d, { recursive: true });
      const pad = "x".repeat(500000);
      const content = "const header = 1;\n" + pad + ',"sk_live_1234567890abcdef",' + pad + "\nconst footer = 2;\n";
      writeFileSync(join(d, "huge_mid.min.js"), content, "utf8");
      const r = runGate(d, ["--json"]);
      const viols = r.json?.violations || [];
      const ok =
        r.status === 1 &&
        r.elapsedMs < 1500 &&
        r.json?.generated_skipped === 1 &&
        viols.length === 1 &&
        viols[0].ruleId === "ASTESIA-004" &&
        viols[0].line === 2;
      record("GP-11", `Strong secret in middle of 1M-char line caught on L2 in ${Math.round(r.elapsedMs)}ms (<1500ms)`, ok, `elapsed=${r.elapsedMs}, viols=${JSON.stringify(viols)}`);
    }

    // GP-12: Strong-prefix secret at the VERY END of 1,000,000-char line + ReDoS < 1500 ms
    {
      const d = join(baseTmp, "gp12");
      mkdirSync(d, { recursive: true });
      const pad = "a=1;".repeat(250000); // 1,000,000 chars
      const content = "// L1\n// L2\n" + pad + '"ghp_1234567890abcdefghijklmnop"\n';
      writeFileSync(join(d, "huge_end.min.js"), content, "utf8");
      const r = runGate(d, ["--json"]);
      const viols = r.json?.violations || [];
      const ok =
        r.status === 1 &&
        r.elapsedMs < 1500 &&
        r.json?.generated_skipped === 1 &&
        viols.length === 1 &&
        viols[0].ruleId === "ASTESIA-004" &&
        viols[0].line === 3;
      record("GP-12", `Strong secret at EOF of 1M-char line caught on L3 in ${Math.round(r.elapsedMs)}ms (<1500ms)`, ok, `elapsed=${r.elapsedMs}, viols=${JSON.stringify(viols)}`);
    }

    // GP-13: Private key header -----BEGIN RSA PRIVATE KEY----- in generated file caught
    {
      const d = join(baseTmp, "gp13");
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "keys.ts"), "// @generated\nconst a = 1;\nconst k = '-----BEGIN RSA PRIVATE KEY-----';\n", "utf8");
      const r = runGate(d, ["--json"]);
      const viols = r.json?.violations || [];
      const ok = r.status === 1 && viols.length === 1 && viols[0].ruleId === "ASTESIA-004" && viols[0].line === 3;
      record("GP-13", "Private key header caught in generated file at L3", ok, JSON.stringify(viols));
    }

    // GP-14: JWT eyJ... in generated file caught
    {
      const d = join(baseTmp, "gp14");
      mkdirSync(d, { recursive: true });
      writeFileSync(
        join(d, "jwt.min.js"),
        '// L1\nconst t = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";\n',
        "utf8"
      );
      const r = runGate(d, ["--json"]);
      const viols = r.json?.violations || [];
      const ok = r.status === 1 && viols.length === 1 && viols[0].ruleId === "ASTESIA-004" && viols[0].line === 2;
      record("GP-14", "JWT eyJ... caught in generated file at L2", ok, JSON.stringify(viols));
    }

    // GP-15: Generic password = "abcdefgh12345" (no strong prefix) in generated file is NOT detected
    {
      const d = join(baseTmp, "gp15");
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "gen.min.js"), 'const password = "abcdefgh12345";\n', "utf8");
      const r = runGate(d, ["--json"]);
      const ok = r.status === 0 && (r.json?.violations?.length ?? 1) === 0 && r.json?.generated_skipped === 1;
      record("GP-15", 'Generic password = "abcdefgh12345" in generated file not detected', ok, JSON.stringify(r.json));
    }

    // GP-16: Inline astesia-allow cannot suppress strong secret in generated file
    {
      const d = join(baseTmp, "gp16");
      mkdirSync(d, { recursive: true });
      writeFileSync(
        join(d, "unsuppressible.min.js"),
        "// astesia-allow: ASTESIA-004 -- attempted suppression in generated file\nconst k = 'AKIA1234567890EXAMPLE';\n",
        "utf8"
      );
      const r = runGate(d, ["--json"]);
      const viols = r.json?.violations || [];
      const ok = r.status === 1 && viols.length === 1 && viols[0].ruleId === "ASTESIA-004" && viols[0].line === 2;
      record("GP-16", "Strong secret in generated file cannot be suppressed", ok, JSON.stringify(r.json));
    }

    // GP-17: Generated file with unclosed string/backtick does not produce TOKENIZER_DESYNC even with --max-warn 0
    {
      const d = join(baseTmp, "gp17");
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "desync.min.js"), "const broken = `unclosed template literal;\n", "utf8");
      const r = runGate(d, ["--max-warn", "0", "--json"]);
      const ok = r.status === 0 && r.json?.desync_files?.length === 0 && (r.json?.violations?.length ?? 1) === 0;
      record("GP-17", "Generated file never produces TOKENIZER_DESYNC", ok, JSON.stringify(r.json));
    }

    // GP-18: Baseline ratchet: increase in generated_skipped -> exit 1
    {
      const d = join(baseTmp, "gp18");
      mkdirSync(join(d, ".astesia"), { recursive: true });
      writeFileSync(join(d, "index.ts"), "export const a = 1;\n", "utf8");
      const initRes = runGate(d, ["--update-baseline"]);
      writeFileSync(join(d, "bundle.min.js"), "const b = 2;\n", "utf8");
      const checkRes = runGate(d, ["--baseline", ".astesia/gate-baseline.json", "--json"]);
      const ok =
        initRes.status === 0 &&
        checkRes.status === 1 &&
        checkRes.json?.baseline?.counter_regressions?.some((s: string) => s.includes("generated_skipped"));
      record("GP-18", "Increase in generated_skipped fails --baseline with exit 1", ok, JSON.stringify(checkRes.json?.baseline));
    }

    // GP-19: Old baseline without generated_skipped key -> treated as 0
    {
      const d = join(baseTmp, "gp19");
      mkdirSync(join(d, ".astesia"), { recursive: true });
      writeFileSync(join(d, "index.ts"), "export const a = 1;\n", "utf8");
      writeFileSync(join(d, "bundle.min.js"), "const b = 2;\n", "utf8");
      const oldBaseline = {
        schema: 1,
        violations: {},
        counters: {
          debt_markers: 0,
          suppressions: 0,
          files_excluded: 0,
          desync_files: 0,
          allowlisted: 0
        },
        coverage: { files_scanned: 1, min_ratio: 0.9 },
        history: []
      };
      writeFileSync(join(d, ".astesia/gate-baseline.json"), JSON.stringify(oldBaseline, null, 2), "utf8");
      const checkRes = runGate(d, ["--baseline", ".astesia/gate-baseline.json", "--json"]);
      const ok =
        checkRes.status === 1 &&
        checkRes.json?.baseline?.counter_regressions?.some((s: string) => s.includes("generated_skipped increased (1 > 0)"));
      record("GP-19", "Old baseline missing generated_skipped defaults to 0 and catches increase", ok, JSON.stringify(checkRes.json?.baseline));
    }

    // GP-20: --update-baseline without --allow-raise rejected when generated_skipped increases
    {
      const d = join(baseTmp, "gp20");
      mkdirSync(join(d, ".astesia"), { recursive: true });
      writeFileSync(join(d, "index.ts"), "export const a = 1;\n", "utf8");
      runGate(d, ["--update-baseline"]);
      writeFileSync(join(d, "bundle.min.js"), "const b = 2;\n", "utf8");
      const upReject = runGate(d, ["--update-baseline"]);
      const upAllow = runGate(d, ["--update-baseline", "--allow-raise", "--reason", "Authorized new generated bundle file"]);
      const ok = upReject.status === 1 && upAllow.status === 0;
      record("GP-20", "--update-baseline rejects generated_skipped increase unless --allow-raise + --reason provided", ok, `reject=${upReject.status}, allow=${upAllow.status}`);
    }

    // GP-21: File in config exclude is counted in files_excluded, NOT generated_skipped
    {
      const d = join(baseTmp, "gp21");
      mkdirSync(join(d, ".astesia"), { recursive: true });
      mkdirSync(join(d, "dev-dist"), { recursive: true });
      writeFileSync(
        join(d, ".astesia/gate-config.json"),
        JSON.stringify({
          schema: 1,
          exclude: [{ path: "dev-dist", reason: "Exclude build directory from scanning" }]
        }),
        "utf8"
      );
      writeFileSync(join(d, "dev-dist/workbox.min.js"), "a".repeat(6000) + "\n", "utf8");
      writeFileSync(join(d, "index.ts"), "export const a = 1;\n", "utf8");
      const r = runGate(d, ["--json"]);
      const ok =
        r.status === 0 &&
        r.json?.files_excluded === 1 &&
        r.json?.generated_skipped === 0 &&
        r.json?.generated_files?.length === 0;
      record("GP-21", "Excluded file counted in files_excluded, not generated_skipped", ok, JSON.stringify(r.json));
    }

    // GP-22: CRLF in generated file: 4999 chars + \r\n is NOT generated, strong secret line number accurate
    {
      const d = join(baseTmp, "gp22");
      mkdirSync(d, { recursive: true });
      const content = "// @generated\r\nconst a = 1;\r\nconst b = 2;\r\nconst s = 'xoxb-1234567890-1234567890';\r\n";
      writeFileSync(join(d, "crlf_gen.ts"), content, "utf8");
      const r = runGate(d, ["--json"]);
      const viols = r.json?.violations || [];
      const ok =
        r.status === 1 &&
        r.json?.generated_skipped === 1 &&
        viols.length === 1 &&
        viols[0].ruleId === "ASTESIA-004" &&
        viols[0].line === 4;
      record("GP-22", "CRLF generated file reports strong secret on exact line 4", ok, JSON.stringify(r.json));
    }

    // GP-23: Text mode output includes generated_skipped
    {
      const d = join(baseTmp, "gp23");
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "app.min.js"), "const a = 1;\n", "utf8");
      const r = runGate(d, []);
      const ok = r.status === 0 && r.stdout.includes("generated_skipped=1");
      record("GP-23", "Text output includes generated_skipped=1", ok, r.stdout);
    }
  } finally {
    try {
      rmSync(baseTmp, { recursive: true, force: true });
    } catch {}
  }

  return { total: passed + failed, passed, failed, known_gaps: 0, errors };
}

if (import.meta.main) {
  const r = runGeneratedPolicySuite();
  console.log(`Generated Policy Suite: ${r.passed}/${r.total} passed (${r.failed} failed)`);
  if (r.errors.length > 0) {
    console.error(r.errors.join("\n"));
    process.exit(1);
  }
}
