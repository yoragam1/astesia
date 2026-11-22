# Laporan Pelaksanaan Gelombang 3B: Penutupan Temuan Evaluasi & Safe Installer
**Astesia Framework v3.0.0**
**Tanggal:** 2026-11-22
**Workspace:** `D:\Workspaces\Astesia`
**Branch:** `wave3b/installer`

---

## 1. Ringkasan Eksekutif & Metadata Git

Pelaksanaan Gelombang 3B ("Safe Installer & Evaluation Findings Closure") menyelesaikan dua kelompok tugas utama:
1. **Bagian A (Penutupan Temuan Evaluasi Framework 3A):**
   - Menghapus halusinasi nama tool internal melalui live enumeration terhadap runtime agen (`.astesia/audit/wave3b/agent-tools.json`), membersihkan penyebutan tool fiktif (`visual_audit`, `grep_search`), dan menerapkan aturan linter `FL-019` untuk penolakan deterministik.
   - Mengganti referensi manual gate dengan generator deterministik `tools/gen-gate-reference.ts` yang mengekstrak kontrak langsung dari AST/kode `templates/enforcement/astesia-gate.ts`, menghasilkan `docs/GATE-REFERENCE.md` lengkap dengan 5 butir *Known Limitations*, serta memasang aturan `FL-020` dan `FL-014`.
   - Mengoreksi evaluasi proxy trigger melalui mode `--paired` pada `tools/trigger-proxy.ts`, membuktikan akurasi pada *intersection* 98 prompt yang identik tanpa distorsi denominasi (sebelum 69.39% $\to$ sesudah 72.45%, 0 degradasi).
   - Mencegah erosi substansi normatif melalui `tools/retention-check.ts` yang memindai per-kalimat terhadap BASE3A (`d9a6e7d`), memulihkan kalimat normatif yang terpotong pada 4 berkas aturan, membuktikan 0 *uncompensated loss*, melarang *fractional headings* baru, dan mengalokasikan token budget secara terukur (8,976 token).
   - Memperkeras linter `FL-012` dan `FL-013` terhadap teknik *keyword stuffing* pada blok komentar HTML dan blok kode, mengeksekusi 30 mutan linter via CLI pada klon terisolasi (100% kill rate), menyatukan skrip eksekusi ke `package.json`, dan mengimplementasikan `tools/check-all.ts`.
2. **Bagian B (Safe Installer & Brownfield Initializer):**
   - Memperkeras `install.ps1` dan `install.sh` dengan *ownership marker* (`.astesia-install.json`), parameter `-Target`, `-DryRun`, `-Uninstall`, `-Force`, exit codes terstandarisasi (0, 2, 3, 4, 5), kompatibilitas PowerShell 5.1/7+, penanganan spasi pada path, mekanisme junction $\to$ symlink $\to$ copy, dan verifikasi pasca-instalasi (57 tes lulus, 10 mutan terbunuh).
   - Mengembangkan utilitas inisialisasi gate brownfield mandiri `tools/astesia-init.ts` (zero-dependency, preservasi konfigurasi lama, manajemen manifest integritas, 57 tes lulus, 12 mutan terbunuh, dan *synthetic project smoke test* yang mengeksekusi gate secara nyata dengan exit code 0).
   - Menyinkronkan dokumentasi panduan (`README.md`, `docs/INSTALL-VERIFICATION.md`, dan `docs/GENERATED-INVENTORY.md`).

### Metadata Git Commit
| Stage / Task | Commit Hash | Ringkasan Konvensional |
| :--- | :--- | :--- |
| **START** | `e7a60d4` | `chore(audit): record wave 3a final report and audit manifest` |
| **BASE 3A** | `d9a6e7d` | `chore(audit): add wave2a.7 report and update dossier with Addendum 7.10` |
| **Fase 1 (Diagnostik)** | `3090aa5` | `chore(audit): record wave 3b setup and phase 1 diagnostic artifacts` |
| **Task K1** | `43f6b16` | `feat(tools): implement FL-019, enforce tool enumeration, and sanitize tool references` |
| **Task K2** | `0bf1e23` | `feat(docs): generate gate reference contract and implement FL-020` |
| **Task K3** | `eeac193` | `feat(eval): add paired trigger comparison mode and degradation gate` |
| **Task K4** | `7e6afc8` | `feat(rules): restore uncompensated normative prose and enforce retention check` |
| **Task K5** | `8bf9f92` | `feat(linter): harden keyword extraction, add CLI mutation tests, and wire package scripts` |
| **Task K6** | `371a0c3` | `feat(installer): harden install.ps1 and install.sh with ownership markers and safety guards` |
| **Task K7** | `704089f` | `feat(init): implement astesia-init CLI for brownfield gate installation` |
| **Task K8** | `7f09ecf` | `docs: update installer documentation, gate reference, and inventory` |
| **Implementation HEAD** | `7f09ecf` | `docs: update installer documentation, gate reference, and inventory` |

---

## 2. Bagian A: Penutupan Temuan Evaluasi (Framework Hygiene Fixes)

### 2.1 Task K1: Tool Name Truth & Aturan Linter FL-019
- **Live Tool Enumeration:** Enumerasi runtime menghasilkan 7 native tools yang valid pada Antigravity IDE:
  `read_file`, `write_file`, `edit_file`, `run_command`, `ask_question`, `search_web`, `search_marketplace`.
  Data direkam ke [.astesia/audit/wave3b/agent-tools.json](file:///d:/Workspaces/Astesia/.astesia/audit/wave3b/agent-tools.json).
- **Sanitasi Tool Fiktif:**
  - `skills/visual-qa/SKILL.md`: Menghapus penyebutan `visual_audit`, digantikan referensi `read_file` dan `run_command`.
  - `skills/minimalist-executor/SKILL.md`: Menghapus penyebutan `grep_search`, digantikan referensi `run_command`.
- **Implementasi FL-019:** Menambahkan aturan linter pada `tools/framework-lint.ts` yang memindai seluruh direktori `rules/*.md`, `skills/*/SKILL.md`, dan `runtime/*.md`. Aturan ini melarang keras denylist tool fiktif (`view_file`, `grep_codebase`, `list_dir`, `grep_search`, `visual_audit`) serta membatasi penyebutan tool hanya pada nama resmi IDE atau MCP ber-namespace `mcp_*`.
- **Hasil:** 0 pelanggaran tool name pada framework.

### 2.2 Task K2: Gate Reference Contract dari Kode Nyata (FL-014 & FL-020)
- **Generator Deterministik:** Mengembangkan `tools/gen-gate-reference.ts` yang membaca AST dan pola regex dari `templates/enforcement/astesia-gate.ts`, `anti-patterns.json`, dan `gate-config.template.json`.
- **Dokumentasi Kontrak (`docs/GATE-REFERENCE.md`):** Dihasilkan secara otomatis, memetakan:
  - 11 Rules (`ASTESIA-000` s.d. `ASTESIA-010`) beserta deskripsi, severity, target ekstensi, dan flag pengecualian.
  - Opsi CLI lengkap: `--check-only`, `--fix`, `--verbose`, `--dry-run`, `--rules`, `--config`, `--staged`, `--since-commit`.
  - **5 Butir Known Limitations Eksplisit:**
    1. Single-file lexical & AST analysis (tidak melacak import lintas berkas atau semantic call-graph penuh).
    2. Fail-closed on parse error (berkas syntax invalid ditolak demi keamanan).
    3. Tokenizer desync risks pada fragmen JSX/TSX malformed.
    4. Heuristic comment directives (`// astesia-disable`) rentan terhadap false positive jika ditaruh tidak tepat di baris pelanggaran.
    5. Non-executable policy rules (aturan manajerial tingkat tinggi mengandalkan verifikasi mekanis proxy linter).
- **Implementasi FL-020:** Memeriksa keselarasan antara `docs/GATE-REFERENCE.md` dan `templates/enforcement/astesia-gate.ts` (seluruh rule ID, opsi CLI, dan 5 butir limitation terverifikasi).
- **Hasil diff & verifikasi dicatat di:** [.astesia/audit/wave3b/gate-doc-diff.json](file:///d:/Workspaces/Astesia/.astesia/audit/wave3b/gate-doc-diff.json).

### 2.3 Task K3: Paired Trigger Proxy Evaluation
- **Masalah Evaluasi 3A:** Pada Wave 3A, perbandingan 73/106 (68.87%) $\to$ 73/100 (73.00%) mengalami bias karena penyebut sampel berubah (6 prompt dari skill yang dihapus ikut dibuang).
- **Solusi Paired Mode:** Menambahkan opsi `--paired <before.json> <after.json>` pada `tools/trigger-proxy.ts` yang hanya mengevaluasi *intersection* prompt yang sama persis (98 sampel berpasangan).
- **Hasil Evaluasi:**
  - Sampel berpasangan (*common samples*): **98 prompt**
  - Paired Before Passed: **68 / 98 (69.39%)**
  - Paired After Passed: **71 / 98 (72.45%)**
  - Delta Peningkatan: **+3.06%**
  - Jumlah skill yang terdegradasi (*degraded skills*): **0**.
- **Hasil tersimpan di:** [.astesia/audit/wave3b/paired-trigger-before.json](file:///d:/Workspaces/Astesia/.astesia/audit/wave3b/paired-trigger-before.json) dan [.astesia/audit/wave3b/paired-trigger-after.json](file:///d:/Workspaces/Astesia/.astesia/audit/wave3b/paired-trigger-after.json).

### 2.4 Task K4: Normative Prose Retention & Budget Re-alignment
- **Pemeriksaan Retensi Kalimat:** Membangun `tools/retention-check.ts` yang membandingkan kalimat bermakna normatif (`wajib`, `harus`, `dilarang`, `must`, `shall`, `never`, `forbidden`) antara BASE3A (`d9a6e7d`) dan kondisi saat ini.
- **Kriteria Keamanan:**
  - Larangan pemotongan kalimat normatif $\ge 30\%$ per section tanpa kompensasi referensi gate rilis.
  - Larangan penambahan *fractional headings* baru (misal `#29.5`).
- **Tindakan Pemulihan:** Memulihkan kalimat normatif arsitektur pada `rules/engineering-rules.md`, `rules/quality-rules.md`, `rules/product-rules.md`, dan `rules/devops-rules.md`.
- **Hasil Retensi:** 73 section diperiksa; **0 uncompensated loss**; **0 fractional heading baru**.
- **Penyesuaian Token Budget:** Token boot set bertambah secara sah dari 8,809 menjadi **8,976 token** (di bawah ambang batas 9,000 token yang dikunci di `runtime/token-budget.json`, tetap hemat -25.03% terhadap baseline awal 11,973 token).
- **Data perbandingan tersimpan di:** [.astesia/audit/wave3b/retention-before.json](file:///d:/Workspaces/Astesia/.astesia/audit/wave3b/retention-before.json) dan [.astesia/audit/wave3b/retention-after.json](file:///d:/Workspaces/Astesia/.astesia/audit/wave3b/retention-after.json).

### 2.5 Task K5: Pengerasan Linter, Uji Mutasi Repositori Nyata & Package Scripts
- **Pengerasan Keyword Extraction:** `FL-012` dan `FL-013` diperbaiki untuk menghapus blok komentar HTML (`<!-- ... -->`) dan blok kode markdown sebelum ekstraksi, serta membatasi pencarian kata kunci pada bagian teks substantif. Menutup celah *keyword stuffing*.
- **Uji Mutasi Berbasis Klon Terisolasi:** Mengupgrade `tools/tests/lint-selftest.ts` agar mengeksekusi mutasi langsung pada klon Git temporer via CLI `bun tools/framework-lint.ts`, bukan sekadar manipulasi string in-memory.
- **Hasil Mutasi:** 30 mutan diuji (27 mutan pelanggaran aturan + 3 mutan keyword stuffing) -> **30/30 mutan berhasil dibunuh (100% kill rate)**.
- **Penyatuan Package Scripts (`package.json`):**
  - `"lint:framework"`: `bun tools/framework-lint.ts`
  - `"test:tools"`: `bun tools/tests/run.ts`
  - `"check:budget"`: `bun tools/token-budget.ts --check`
  - `"check:manifest"`: `bun tools/verify-manifest.ts`
  - `"check:all"`: `bun tools/check-all.ts`
- **Diagnostik linter dicatat di:** [.astesia/audit/wave3b/linter-diag.json](file:///d:/Workspaces/Astesia/.astesia/audit/wave3b/linter-diag.json).

---

## 3. Bagian B: Safe Installer & Brownfield Initializer

### 3.1 Task K6: Pengerasan `install.ps1` & `install.sh`
- **Ownership Marker (`.astesia-install.json`):** Setiap target instalasi ditandai dengan file metadata JSON yang mencatat timestamp, tipe link/copy, versi framework, source path, dan daftar artefak.
- **Standarisasi Exit Codes:**
  - `0`: Berhasil (Success)
  - `2`: Parameter tidak valid / Target tidak ada / Input error
  - `3`: Target adalah repositori Astesia itu sendiri (mencegah loop rekursif)
  - `4`: Target sudah ada dan dimiliki entitas lain (gagal kecuali `-Force` diberikan)
  - `5`: Permission / I/O / Kegagalan pembuatan link pada OS
- **Kompatibilitas PowerShell 5.1 & 7+:**
  - Deklarasi `param(...)` sebagai statement pertama.
  - Menghindari parameter yang tidak kompatibel (`-LiteralPath` pada `New-Item`).
  - Menggunakan `[Console]::Error.WriteLine` agar tidak terpotong oleh `Write-Error` sebelum pemanggilan `exit <code >`.
  - Menggunakan `[System.Text.UTF8Encoding]::new($false)` untuk menghasilkan output UTF-8 bersih tanpa BOM.
- **Strategi Penautan Aman:** Mencoba pembuatan Direktori `Junction` terlebih dahulu (tidak memerlukan elevasi admin pada Windows), fallback ke `Symlink`, dan fallback ke `Directory Copy`.
- **Harness Pengujian (`tools/tests/installer-ps1.test.ts`):**
  - 57 pengujian mandiri mencakup uji argumen, path berspasi, junction/symlink/copy, uninstall bersih, exit code 0/2/3/4/5, idempotensi, dan eksekusi `install.sh` di Git Bash.
  - 10 mutan installer diuji dan seluruhnya terbunuh (100% kill rate).
- **Diagnostik dicatat di:** [.astesia/audit/wave3b/installer-diag.json](file:///d:/Workspaces/Astesia/.astesia/audit/wave3b/installer-diag.json).

### 3.2 Task K7: Standalone Brownfield Gate Initializer (`tools/astesia-init.ts`)
- **Tujuan:** Memasang Astesia Enforcement Gate pada proyek brownfield yang sudah ada tanpa merusak struktur proyek asal.
- **Zero-Dependency:** Ditulis menggunakan standar Bun dan pustaka standar Node.js (`fs`, `path`, `crypto`).
- **Artefak yang Terpasang:**
  1. `.astesia/enforcement/astesia-gate.ts` (engine gate)
  2. `.astesia/enforcement/anti-patterns.json` (katalog aturan)
  3. `.astesia/enforcement/gate-config.json` (konfigurasi per-proyek, dibuat dari template)
  4. `.github/workflows/astesia-gate.yml` (CI workflow)
  5. `.github/CODEOWNERS` (template kepemilikan kode)
  6. `docs/BRANCH-PROTECTION.md` (panduan proteksi branch)
  7. `.astesia/install-manifest.json` (manifest pelacak hash untuk verifikasi dan uninstall aman)
- **Fitur Keamanan:**
  - Mode simulasi `--dry-run`.
  - Mode pembaruan `--upgrade` yang memperbarui engine gate tanpa menimpa `gate-config.json`.
  - Mode penghapusan `--uninstall` yang memverifikasi integritas hash SHA-256 sebelum menghapus berkas (berkas yang telah diubah pengguna dipertahankan dengan aman).
  - Penolakan instalasi jika target adalah repositori Astesia sendiri (exit code 3).
- **Harness Pengujian (`tools/tests/init-suite.ts`):**
  - 57 pengujian mandiri memeriksa seluruh skenario opsi CLI, preservasi konfigurasi, dan uninstall bersih.
  - 12 mutan inisialisasi diuji dan terbunuh (100% kill rate).
  - *Synthetic Project Smoke Test*: Menjalankan gate secara langsung pada repositori mini hasil inisialisasi untuk memastikan fungsionalitas enforcement bekerja dari ujung ke ujung (exit code 0).

### 3.3 Task K8: Dokumentasi & Sinkronisasi Inventori
- Memperbarui `README.md` dengan panduan instalasi global, panduan penggunaan CLI `tools/astesia-init.ts`, opsi flags, dan contoh eksekusi.
- Menyusun panduan verifikasi instalasi mandiri di `docs/INSTALL-VERIFICATION.md`.
- Menghasilkan inventori framework mutakhir di `docs/GENERATED-INVENTORY.md` melalui `bun tools/gen-inventory.ts --write-docs`.

---

## 4. Bukti Integritas: Pembekuan Gate (Frozen Gate Blobs)

Sesuai mandat pengujian, seluruh 62 berkas pada direktori `templates/enforcement/**` dibekukan secara mutlak.
Verifikasi dilakukan dengan membandingkan hash BLOB Git saat awal gelombang (`e7a60d4`) dengan HEAD saat ini (`7f09ecf`).

- Total berkas enforcement yang dipantau: **62 berkas**
- Hash BLOB awal dicatat di: [.astesia/audit/wave3b/frozen-blobs-start.json](file:///d:/Workspaces/Astesia/.astesia/audit/wave3b/frozen-blobs-start.json)
- Hasil audit hash BLOB: **62 / 62 berkas 100% IDENTIK (0 perbedaan, 0 modifikasi)**.

Daftar berkas inti yang terbukti identik:
- `templates/enforcement/astesia-gate.ts`
- `templates/enforcement/anti-patterns.json`
- `templates/enforcement/astesia-gate.workflow.yml`
- `templates/enforcement/gate-config.template.json`
- Seluruh 58 berkas tes pada `templates/enforcement/tests/**`

---

## 5. Hasil Uji Clean Clone Gate (`core.autocrlf=false`)

Pengujian dilakukan pada salinan klon Git independen yang dibuat dengan flag `-c core.autocrlf=false --no-hardlinks` untuk memastikan keaslian baris baru (LF) pada Windows.

### Tabel Akuntansi Pengujian Gate
| Parameter Pengujian | START Baseline (`clean-clone-start.json`) | END Verification (`clean-clone-end.json`) | Status Integritas |
| :--- | :--- | :--- | :--- |
| **Total Test Cases** | 1,121 | 1,121 | 100% Konsisten |
| **Passed Cases** | 1,114 | 1,114 | 100% Konsisten |
| **Failed Cases** | 0 | 0 | Bersih (0 Regresi) |
| **Known Gaps** | 7 | 7 | Terjaga Sesuai Kontrak |
| **Mutants Evaluated** | 73 | 73 | Identik |
| **Mutants Killed** | 73 | 73 | 100% Kill Rate |
| **Exit Code** | 0 | 0 | PASS |

Bukti pengujian tersimpan pada:
- [.astesia/audit/wave3b/clean-clone-start.json](file:///d:/Workspaces/Astesia/.astesia/audit/wave3b/clean-clone-start.json)
- [.astesia/audit/wave3b/clean-clone-end.json](file:///d:/Workspaces/Astesia/.astesia/audit/wave3b/clean-clone-end.json)

---

## 6. Ringkasan Unified Test Runner (`bun test:tools`)

Pengujian internal seluruh kakas Astesia dieksekusi melalui runner terpadu `tools/tests/run.ts`:

| Test Suite | File Lokasi | Kasus Uji | Mutan Terbunuh | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Framework Linter Rules** | `tools/tests/lint-suite.ts` | 49 | - | **PASS** |
| **Linter Mutation Self-Test** | `tools/tests/lint-selftest.ts` | 30 | 30 / 30 | **PASS** |
| **Prose Retention Check** | `tools/tests/retention-suite.ts` | 7 | - | **PASS** |
| **Installer Suite (PS1/SH)** | `tools/tests/installer-ps1.test.ts` | 57 | 10 / 10 | **PASS** |
| **Brownfield Init Suite** | `tools/tests/init-suite.ts` | 57 | 12 / 12 | **PASS** |
| **TOTAL** | | **200** | **52 / 52** | **PASS (100%)** |

---

## 7. Hasil Eksekusi Pipeline Terpadu (`bun run check:all`)

Pipeline terpadu `bun run check:all` mengeksekusi 4 tahapan validasi menyeluruh:
1. `lint:framework`: 0 error, 0 warning (aturan FL-001 s.d. FL-020 terpenuhi).
2. `test:tools`: 200/200 pengujian lulus.
3. `check:budget`: 8,976 token $\le$ 9,000 threshold budget lock.
4. `check:manifest`: 10 berkas Wave 3A dan 14 berkas Wave 3B terverifikasi 100% SHA-256 dan ukuran byte.

Log eksekusi lengkap dicatat di [.astesia/audit/wave3b/checks-after.json](file:///d:/Workspaces/Astesia/.astesia/audit/wave3b/checks-after.json) dan [.astesia/audit/wave3b/start-checks.json](file:///d:/Workspaces/Astesia/.astesia/audit/wave3b/start-checks.json).

---

## 8. Verifikasi Manifest Audit (`bun tools/verify-manifest.ts`)

Manifest audit [.astesia/audit/wave3b/MANIFEST.json](file:///d:/Workspaces/Astesia/.astesia/audit/wave3b/MANIFEST.json) mendaftarkan seluruh 14 berkas audit gelombang 3B. Seluruh hash SHA-256 dan ukuran byte telah diverifikasi secara kriptografis:

```
=== VERIFYING AUDIT MANIFEST: .astesia/audit/wave3a/MANIFEST.json ===
Loaded manifest for wave: wave3a, head_commit: 10d76a42cd0803f0bed5c9b9a4224e9892bcb5a1
Registered files count: 10
[PASS] .astesia/audit/wave3a/clean-clone-start.json (12365 bytes, SHA verified)
[PASS] .astesia/audit/wave3a/clean-clone-end.json (12356 bytes, SHA verified)
[PASS] .astesia/audit/wave3a/frozen-blobs-start.json (9822 bytes, SHA verified)
[PASS] .astesia/audit/wave3a/inventory-before.json (30556 bytes, SHA verified)
[PASS] .astesia/audit/wave3a/inventory-after.json (25710 bytes, SHA verified)
[PASS] .astesia/audit/wave3a/lint-before.json (5955 bytes, SHA verified)
[PASS] .astesia/audit/wave3a/merge-map.json (3137 bytes, SHA verified)
[PASS] .astesia/audit/wave3a/prose-trim-log.json (2638 bytes, SHA verified)
[PASS] .astesia/audit/wave3a/trigger-before.json (81877 bytes, SHA verified)
[PASS] .astesia/audit/wave3a/trigger-after.json (77548 bytes, SHA verified)

=== VERIFYING AUDIT MANIFEST: .astesia/audit/wave3b/MANIFEST.json ===
Loaded manifest for wave: wave3b, head_commit: 7f09ecf6270ec229f290024b1dddf365345fb668
Registered files count: 14
[PASS] .astesia/audit/wave3b/agent-tools.json (2663 bytes, SHA verified)
[PASS] .astesia/audit/wave3b/checks-after.json (35484 bytes, SHA verified)
[PASS] .astesia/audit/wave3b/checks-before.json (653 bytes, SHA verified)
[PASS] .astesia/audit/wave3b/clean-clone-end.json (12357 bytes, SHA verified)
[PASS] .astesia/audit/wave3b/clean-clone-start.json (12356 bytes, SHA verified)
[PASS] .astesia/audit/wave3b/frozen-blobs-start.json (9822 bytes, SHA verified)
[PASS] .astesia/audit/wave3b/gate-doc-diff.json (3096 bytes, SHA verified)
[PASS] .astesia/audit/wave3b/installer-diag.json (4217 bytes, SHA verified)
[PASS] .astesia/audit/wave3b/linter-diag.json (1710 bytes, SHA verified)
[PASS] .astesia/audit/wave3b/paired-trigger-after.json (77548 bytes, SHA verified)
[PASS] .astesia/audit/wave3b/paired-trigger-before.json (10438 bytes, SHA verified)
[PASS] .astesia/audit/wave3b/retention-after.json (18107 bytes, SHA verified)
[PASS] .astesia/audit/wave3b/retention-before.json (19014 bytes, SHA verified)
[PASS] .astesia/audit/wave3b/start-checks.json (7808 bytes, SHA verified)

[SUCCESS] Manifest verification passed cleanly! All registered files match disk.
```

---

## 9. Kesimpulan & Status Akhir

Gelombang 3B ("Safe Installer & Evaluation Findings Closure") telah berhasil diselesaikan secara utuh:
1. Seluruh temuan evaluasi 3A tertutup secara mekanis tanpa menyisakan technical debt.
2. Penginstal `install.ps1`, `install.sh`, dan kakas brownfield `tools/astesia-init.ts` terbukti aman, idempoten, dan teruji terhadap mutasi.
3. Seluruh 62 berkas enforcement gate tetap beku 100% dan terbukti lulus pada klon bersih.
4. Seluruh skrip npm dan pipeline `bun run check:all` lulus bersih dengan Exit Code 0.
