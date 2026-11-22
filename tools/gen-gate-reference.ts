import * as fs from "fs";
import * as path from "path";

export interface GateContract {
  never_baseline: string[];
  never_inline_suppress: string[];
  cli_flags: string[];
  rules: Array<{ id: string; name: string; severity: string }>;
}

export function extractGateContract(
  gatePath = "templates/enforcement/astesia-gate.ts",
  rulesPath = "templates/enforcement/anti-patterns.json"
): GateContract {
  if (!fs.existsSync(gatePath)) {
    console.error(`FAIL-CLOSED: Gate source file not found: ${gatePath}`);
    process.exit(2);
  }
  if (!fs.existsSync(rulesPath)) {
    console.error(`FAIL-CLOSED: Anti-patterns source file not found: ${rulesPath}`);
    process.exit(2);
  }

  const gateSource = fs.readFileSync(gatePath, "utf8");
  const rulesJsonRaw = fs.readFileSync(rulesPath, "utf8");

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

  // 3. Extract CLI flags
  const optsMatches = [...gateSource.matchAll(/opts\.get\(["']([^"']+)["']\)/g)].map(m => "--" + m[1]);
  const flagsMatches = [...gateSource.matchAll(/flags\.has\(["']([^"']+)["']\)/g)].map(m => "--" + m[1]);
  const directArgMatches = [...gateSource.matchAll(/args\.indexOf\(["']--([^"']+)["']\)/g)].map(m => "--" + m[1]);
  const cliFlags = [...new Set([...optsMatches, ...flagsMatches, ...directArgMatches])].sort();

  if (!cliFlags.includes("--config")) {
    console.error("FAIL-CLOSED: --config flag not detected in gate arguments parser");
    process.exit(2);
  }
  if (cliFlags.length < 10) {
    console.error(`FAIL-CLOSED: Suspiciously low CLI flags count (${cliFlags.length})`);
    process.exit(2);
  }

  // 4. Extract Rules from anti-patterns.json
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

  const rules = rulesData.rules.map((r: any) => ({
    id: r.id,
    name: r.name,
    severity: r.severity
  }));

  return {
    never_baseline: neverBaseline,
    never_inline_suppress: neverInlineSuppress,
    cli_flags: cliFlags,
    rules
  };
}

export function generateGateReferenceMarkdown(contract: GateContract): string {
  return `# Referensi Resmi Astesia Gate Enforcement (Release Candidate)
*Dokumen ini dihasilkan secara otomatis dari sumber kode \`templates/enforcement/astesia-gate.ts\` dan \`templates/enforcement/anti-patterns.json\`. JANGAN SUNTING MANUAL.*

---

## 1. Argumen & Flag CLI Astesia Gate
Astesia gate mendukung opsi dan flag CLI berikut:

| Flag / Opsi | Tipe | Deskripsi Kontrak |
| :--- | :--- | :--- |
| \`--allow-raise\` | Flag | Mengizinkan kenaikan batas baseline ratchet (wajib disertai \`--reason\`) |
| \`--baseline <path>\` | Opsi | Menentukan lokasi berkas baseline ratchet |
| \`--check-workflow <path>\` | Opsi | Memverifikasi workflow GitHub Actions dari mutasi bypass |
| \`--config <path>\` | Opsi | Menentukan path ke berkas konfigurasi \`gate-config.json\` |
| \`--json\` | Flag | Mengeluarkan laporan analisis dalam format JSON terstruktur |
| \`--max-warn <n>\` | Opsi | Batas maksimum peringatan (*warning*) sebelum gate gagal (exit 1) |
| \`--reason "<text>"\` | Opsi | Memberikan alasan wajib saat menaikkan baseline ratchet |
| \`--root <dir>\` | Opsi | Menentukan direktori akar proyek yang dipindai |
| \`--rules <path>\` | Opsi | Menentukan berkas aturan anti-pattern (\`anti-patterns.json\`) |
| \`--rules-diff <base> <head>\` | Opsi | Membandingkan perubahan dua berkas aturan anti-patterns |
| \`--update-baseline\` | Flag/Opsi | Merekam pelanggaran saat ini sebagai baseline ratchet baru |

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

---

## 3. Registri Aturan Anti-Pattern & Severity

| Rule ID | Severity | Deskripsi Aturan |
| :--- | :--- | :--- |
${contract.rules.map(r => `| \`${r.id}\` | \`${r.severity}\` | ${r.name} |`).join("\n")}

---

## 4. Keterbatasan yang Diketahui

Bagian ini mencatat secara jujur batasan teknis dari rilis gate enforcement saat ini:

1. **False positive tinggi pada ASTESIA-000 dan ASTESIA-004:** Pada sebagian struktur proyek nyata tertentu (seperti template blade/markup atau konfigurasi dinamis), deteksi berbasis regex dan parser AST lokal dapat menghasilkan false positive.
2. **Validasi platform baru diverifikasi di Windows:** Pengujian menyeluruh suite enforcement dan benchmark gate baru diverifikasi penuh di lingkungan Windows; eksekusi di Linux dan macOS belum diverifikasi secara independen.
3. **Pemeriksaan workflow bertindak sebagai lint:** Flag \`--check-workflow\` hanya bertindak sebagai pemeriksaan statis (*lint*); kontributor PR dapat menghapus langkah tersebut dari berkas workflow jika tidak dilindungi oleh \`CODEOWNERS\` dan *required status check*.
4. **Bypass berkas generated dilewati tokenizer:** Berkas yang terdeteksi sebagai artefak *generated* dilewati oleh parser berbasis tokenizer (bypass terbatas yang dikendalikan ratchet baseline).
5. **Heuristik regex terbatas pada scope fungsi:** Deteksi query database dan pola N+1 menggunakan heuristik regex fungsi lokal, sehingga query yang didelegasikan ke helper lintas fungsi tidak terdeteksi.
`;
}

// CLI Execution
if (import.meta.main || require.main === module) {
  const args = process.argv.slice(2);
  const isCheck = args.includes("--check");
  const gateFileIdx = args.indexOf("--gate-file");
  const gateFile = gateFileIdx !== -1 ? args[gateFileIdx + 1] : undefined;

  const contract = extractGateContract(gateFile);
  const expectedMd = generateGateReferenceMarkdown(contract);
  const targetPath = path.resolve("docs/GATE-REFERENCE.md");

  if (isCheck) {
    if (!fs.existsSync(targetPath)) {
      console.error("FAIL: docs/GATE-REFERENCE.md does not exist");
      process.exit(1);
    }
    const currentMd = fs.readFileSync(targetPath, "utf8");
    if (currentMd !== expectedMd) {
      console.error("FAIL: docs/GATE-REFERENCE.md is out of sync with gate source!");
      process.exit(1);
    }
    console.log("PASS: docs/GATE-REFERENCE.md is synchronized with gate source.");
    process.exit(0);
  } else {
    fs.writeFileSync(targetPath, expectedMd, "utf8");
    console.log(`Generated and updated ${targetPath}`);
  }
}
