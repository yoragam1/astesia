# Laporan Gelombang 2A: CI Security & Baseline Ratchet

**Framework:** Astesia Framework v3.0.0  
**Workspace:** `D:\Workspaces\Astesia`  
**Branch:** `wave2a/ci-ratchet`  
**Base Commit:** `56dd907` (diverifikasi dari `1d66a66`)  
**Head Commit:** (Working tree siap commit)  
**Tanggal:** 2026-11-18  

---

## 1. Hasil Fase 0 (Pra-Kondisi)

### 1.1 Audit Hunk Commit 56dd907 (P1)
Analisis mendalam terhadap perubahan pada commit `56dd907` (`test(harness): fix flaky CLI and desync tests on Windows`) membuktikan tidak ada pelemahan asersi tes:

| File | Hunk | Baris (Sebelum -> Sesudah) | Klasifikasi | Justifikasi Teknis |
|---|---|---|---|---|
| `templates/enforcement/tests/run.ts` | Hunk 1 | 314 -> 314 | **NETRAL** | Mengubah verifikasi kasus desinkronisasi `adv/unclosed.ts` untuk memeriksa rule sintesis `TOKENIZER_DESYNC` secara langsung pada set `desyncFiles`. |
| `templates/enforcement/tests/run.ts` | Hunk 2 | 405 -> 405 | **DIPERKUAT** | Token Base64 pada `SEC-25` (`authToken`) diperkuat dengan padding `=`: `dXNlcm5hbWU6cGFzc3dvcmQ=` untuk menguji deteksi credential Base64 tanpa bergantung pada trailing separator. |
| `templates/enforcement/tests/run.ts` | Hunk 3 | 513 -> 513 | **NETRAL** | Menambahkan pengecekan rule ID khusus `TOKENIZER_DESYNC` pada agregator `categoryStats` agar desinkronisasi EOF terhitung presisi. |
| `templates/enforcement/tests/run.ts` | Hunk 4 | 579 -> 579 | **NETRAL** | Memperbaiki konten fixture CLI desync `cli-desync/unclosed.ts` menjadi unclosed template literal murni untuk mencegah flakiness parsing Windows. |

*Verdict P1:* **PASS** (0 hunk DILEMAHKAN, 1 hunk DIPERKUAT, 3 hunk NETRAL).

---

### 1.2 Pemindaian Proyek Nyata (P2)
Pemindaian mode read-only dilakukan terhadap 2 proyek nyata di luar repo Astesia:
1. **`terminal-portfolio` (18 berkas terpindai):**
   - **Temuan False Positive:** 1 kasus pada `src/hooks/useTheme.ts:11`:
     `const THEME_STORAGE_KEY = 'terminal_portfolio_theme';`
     Dipicu oleh heuristik `ASTESIA-004` karena variabel berakhiran `KEY` dan panjang string $> 12$ karakter.
   - **Temuan Desinkronisasi:** 1 berkas `Dockerfile` memiliki sintaks multiline yang memicu `TOKENIZER_DESYNC`.
2. **`pustaka-sekolah-pwa` (72 berkas terpindai):**
   - **Temuan True Positive:**
     - `ASTESIA-010`: Hardcoded secret di `.env` (`JWT_SECRET=supersecretjwtkey12345`).
     - `ASTESIA-007`: Loop N+1 kueri database berulang di repository `for (const id of bookIds) await db.query(...)`.
     - `ASTESIA-002`: Kueri `SELECT *` mentah.
   - **Kebutuhan Konfigurasi Pengecualian:** Berkas vendor/build pihak ketiga di `dev-dist/` memicu `ASTESIA-008` (workaround) dan `ASTESIA-009` (`setTimeout`), membuktikan keharusan mekanisme `--config <path>` (C1) untuk proyek brownfield.

---

### 1.3 Benchmark Kinerja Berpasangan (P3)
Pengujian performa gate versi lama (`1d66a66`) vs versi baru (`56dd907`) dijalankan secara bergantian (*alternating*) sebanyak 10 pasang pada korpus sintetik 2.000 berkas:

| Pasangan | Lama (ms) | Baru (ms) | Rasio (Baru / Lama) |
|---|---|---|---|
| Pair 1 | 2197.02 | 2039.11 | 0.928x |
| Pair 2 | 2321.68 | 1831.51 | 0.789x |
| Pair 3 | 2252.65 | 2118.00 | 0.940x |
| Pair 4 | 2399.45 | 2133.33 | 0.889x |
| Pair 5 | 2313.47 | 2106.35 | 0.910x |
| Pair 6 | 2236.53 | 2126.17 | 0.951x |
| Pair 7 | 2021.93 | 2513.96 | 1.243x |
| Pair 8 | 2117.82 | 2216.49 | 1.047x |
| Pair 9 | 2247.84 | 2235.24 | 0.994x |
| Pair 10 | 2481.86 | 2296.56 | 0.925x |

**Statistik Agregat:**
- Versi Lama: Min `2021.93 ms`, Max `2481.86 ms`, Median `2250.25 ms`, Range `459.93 ms`.
- Versi Baru: Min `1831.51 ms`, Max `2513.96 ms`, Median `2129.75 ms`, Range `682.45 ms`.
- **Rasio Median:** `0.946x` (versi baru **5.4% lebih cepat** dari versi lama).
- **Kepatuhan:** PASS (Rasio $\le 1.15\times$). Data mentah tersimpan di `.astesia/audit/wave2a/p3-results.json`.

---

## 2. Status Pelaksanaan Tugas

| Kode | Nama Tugas | Status | Bukti Eksekusi & Berkas Terkait |
|---|---|---|---|
| **C1** | Pemulihan `SKIP_DIRS`, `--config <path>`, Observability `files_excluded` | **SELESAI** | Menghapus `tests`, `fixtures`, `__tests__` dari `SKIP_DIRS` default. Mengimplementasikan `loadConfig` dengan validasi skema ketat (POSIX path, no `..`, no `.astesia/plugins`, alasan $\ge 15$ karakter). Dibuat `.astesia/gate-config.json` dan `templates/enforcement/gate-config.template.json`. |
| **C2** | Self-Gate Nol Pelanggaran (`console.log`, `any`, `--max-warn=0`) | **SELESAI** | Menghapus seluruh `console.log` di `astesia-gate.ts` (diganti `process.stdout.write`). Mengeliminasi seluruh explicit `: any` menjadi tipe aman. Self-gate exit 0 bersih: `bun templates/enforcement/astesia-gate.ts --root . --rules templates/enforcement/anti-patterns.json --max-warn 0 --json`. |
| **C3** | Perbaikan Akuntansi Harness & Anti-Double Counting | **SELESAI** | Asersi fail-closed diterapkan: `stat.total === stat.passed + stat.failed + stat.known_gaps` divalidasi per-kategori dan total. Kasus `007-EC2` dipecah bersih menjadi `007-EC2a` (expected pass) dan `007-EC2b` (known gap). |
| **C4** | Ekspor `preprocessSource` & Guard `import.meta.main` | **SELESAI** | `preprocessSource` diekspor langsung dari `astesia-gate.ts`. `main()` dibungkus di dalam `if (import.meta.main)`. Harness mengimpor fungsi langsung tanpa `Bun.Transpiler` / string slicing. |
| **C5** | Integrasi Korpus Independen Verifier (D2, D4, D5) | **SELESAI** | 67 kasus uji independen diimpor ke `templates/enforcement/tests/independent/corpus.ts` dan diintegrasikan sebagai kategori `independent`. |
| **C6** | Fuzzing Ground-Truth Klasifikasi (Seed 7001 & 7002) | **SELESAI** | Dibuat `templates/enforcement/tests/fuzz-truth.ts`. 2.000 file untuk Seed 7001 dan 2.000 file untuk Seed 7002 diuji terhadap oracle independen. **100% PASS (0 counterexample)**. |
| **B1** | Baseline Ratchet Deterministik (`--baseline`, `--update-baseline`) | **SELESAI** | Pelacakan per-(rule, file). Larangan mutlak NEVER_BASELINE (`ASTESIA-000`, `004`, `010`). Kenaikan baseline ditolak kecuali `--allow-raise` + `--reason` $\ge 15$ karakter. Deteksi coverage drop. Lulus 25/25 skenario di `templates/enforcement/tests/baseline-suite.ts`. |
| **B2** | Pencegahan Pelemahan Registri Aturan (`--rules-diff`) | **SELESAI** | Memvalidasi integritas base vs head (pencegahan penghapusan rule, pencegahan downgrade error -> warn, deteksi perubahan pattern & extension). Lulus 10/10 skenario di `templates/enforcement/tests/rules-diff-suite.ts`. |
| **B3** | Keamanan CI Workflow (`astesia-gate.workflow.yml`) | **SELESAI** | Dual-checkout (base tepercaya + pr kode), 40-char SHA pinned, `permissions: contents: read` eksklusif, event `pull_request` (bukan `pull_request_target`), zero bypass. |
| **B4** | Workflow Guard & Mutation Testing (`workflow-guard.ts`) | **SELESAI** | Dibuat `templates/enforcement/tests/workflow-guard.ts`. Workflow otentik LULUS, dan seluruh 8 mutasi keamanan GAGAL sesuai ekspektasi (9/9 pass). |
| **B5** | Template Tata Kelola & Dokumen Dossier | **SELESAI** | Dibuat `templates/enforcement/CODEOWNERS.template`, `templates/enforcement/BRANCH-PROTECTION.md`, serta penambahan Addendum Gelombang 2A di `docs/astesia-audit-dossier.md`. |

---

## 3. Ringkasan Metrik Harness: Before vs After

Data disalin langsung dari output JSON harness (`.astesia/audit/wave2a/harness-before.json` vs `.astesia/audit/wave2a/harness-after.json`):

| Metrik | Harness Before (`56dd907`) | Harness After (`wave2a/ci-ratchet`) | Delta / Keterangan |
|---|---|---|---|
| **Total Kasus Uji** | 131 *(bug akuntansi)* | **245** | +114 kasus (independent, baseline, rules_diff, ci_guard, fuzz_truth, split EC2) |
| **Lulus (Passed)** | 129 | **239** | +110 kasus lulus |
| **Gagal (Failed)** | 0 | **0** | Bersih (0 gagal) |
| **Known Gaps** | 3 | **6** | 3 lama + 3 dari korpus independen verifier |
| **baseline72** | 72 (72 pass, 0 fail, 1 gap) | **73 (72 pass, 0 fail, 1 gap)** | Akuntansi bersih: 73 = 72 + 0 + 1 |
| **regressions** | 15 (15 pass, 0 fail, 0 gap) | **15 (15 pass, 0 fail, 0 gap)** | Stabil |
| **adversarial** | 11 (10 pass, 0 fail, 1 gap) | **11 (10 pass, 0 fail, 1 gap)** | Stabil |
| **security** | 25 (24 pass, 0 fail, 1 gap) | **25 (24 pass, 0 fail, 1 gap)** | Stabil |
| **new** | 8 (8 pass, 0 fail, 0 gap) | **8 (8 pass, 0 fail, 0 gap)** | Stabil |
| **independent** | *(belum ada)* | **67 (64 pass, 0 fail, 3 gap)** | D2, D4, D5 korpus verifier |
| **baseline** | *(belum ada)* | **25 (25 pass, 0 fail, 0 gap)** | b01..b25 baseline suite |
| **rules_diff** | *(belum ada)* | **10 (10 pass, 0 fail, 0 gap)** | rd01..rd10 rules-diff suite |
| **ci_guard** | *(belum ada)* | **9 (9 pass, 0 fail, 0 gap)** | 1 otentik + 8 mutasi |
| **fuzz_truth** | *(belum ada)* | **2 (2 pass, 0 fail, 0 gap)** | Seed 7001 & 7002 (4.000 file) |
| **CLI Tests** | 6/6 passed | **6/6 passed** | Exit 2 pada root invalid, Exit 1 pada desync |
| **Property Test (Seed 1337)** | Invariant passed (2000 file) | **Invariant passed (2000 file)** | 0 error |

### Daftar Known Gaps Resmi (6 Item):
1. `007-EC2b` (`ASTESIA-007`, `r007/ec2b_helper.ts`): Pemanggilan helper fungsi tidak langsung lintas modul (`fetchUserOrdersHelper`) di dalam loop tidak dapat dipetakan ke kueri DB tanpa analisis call-graph.
2. `ADV-BACKTICK-IN-REGEX-GAP` (`ASTESIA-005`, `adv/backtick-in-regex.ts`): Backtick di dalam literal regex (`/`/`) berpotensi memicu pembukaan template literal fiktif.
3. `SEC-23-GAP` (`ASTESIA-004`, `sec/sec23.ts`): Secret snake_case berhuruf kecil murni di bawah kunci berakhiran UI label/field/text lolos dari filter entropi regex.
4. `D2-REG-BACKTICK-GAP` (`ASTESIA-005`, `indep/d2_gap1.ts`): Varian backtick regex dari korpus D2.
5. `D2-PHP-HEREDOC` (`ASTESIA-002`, `indep/d2_gap2.php`): Sintaks PHP heredoc tidak distrip sebagai string literal oleh tokenizer regex sederhana.
6. `D4-21-GAP` (`ASTESIA-004`, `indep/d4_gap.ts`): Varian snake_case UI field secret dari korpus D4.

---

## 4. Hasil Ground-Truth Fuzzing (C6)

Skrip `templates/enforcement/tests/fuzz-truth.ts` dijalankan terhadap generator bertingkat 3 profil bahasa (`TypeScript`, `Python`, `Go`):
- **Seed 7001:**
  - Jumlah berkas diuji: **2.000 berkas**
  - Pelanggaran oracle: **0 counterexample**
  - Status: **100% LULUS**
- **Seed 7002:**
  - Jumlah berkas diuji: **2.000 berkas**
  - Pelanggaran oracle: **0 counterexample**
  - Status: **100% LULUS**
- **Invarian yang dibuktikan:** Tokenizer tidak pernah membiarkan kode aktif terklasifikasi sebagai komentar/string, dan tidak pernah membiarkan token string/komentar bocor sebagai kode yang dapat memicu false positive.

---

## 5. Inventaris Dokumen & Skill untuk Gelombang Berikutnya (Gelombang 2B / 3)

*(Sesuai instruksi, dokumen berikut hanya diinventarisir dan TIDAK dimodifikasi pada Gelombang 2A)*:
1. `rules/engineering-rules.md`: Penataan ulang penjelasan Header Doc (#19) menjadi single line dan pembaruan direktif #22 (dihapus).
2. `rules/quality-rules.md`: Dokumentasi aturan baru `ASTESIA-008`, `ASTESIA-009`, `ASTESIA-010`, serta petunjuk pengoperasian baseline ratchet CLI.
3. `skills/lint-ratchet/SKILL.md`: Sinkronisasi penjelasan ratchet per-(rule, file), pengecualian NEVER_BASELINE, dan flag `--rules-diff`.
4. `skills/architectural-linter/SKILL.md`: Dokumentasi 11 aturan aktif dan panduan konfigurasi pengecualian proyek (`.astesia/gate-config.json`).
5. `skills/github-actions/SKILL.md`: Penambahan arsitektur dual-checkout dan pinning commit SHA permanen sebagai standar keamanan CI Astesia.
6. `workflows/phase4-quality.md`: Penambahan checklist eksekusi verifikasi baseline dan `--max-warn=0`.
7. `workflows/phase5-devops.md`: Penambahan prosedur branch protection dan review baseline raise.

---

## 6. Keputusan Desain, Batasan & Ukuran Berkas

### 6.1 Ukuran Berkas `astesia-gate.ts`
- **Jumlah Baris Saat Ini:** **1.660 baris**
- **Laporan Batas Baris:** Melewati ambang 1.400 baris. Sesuai instruksi mutlak (*"tetap SATU file; jika melewati 1.400 baris, laporkan dan jangan dipecah"*), berkas dipertahankan sebagai SATU unit mandiri tanpa dependensi dan tidak dipecah menjadi modul-modul kecil.

### 6.2 Keputusan Desain Utama
1. **Model Keamanan CI:** CI mengekstrak wasit (`gate`, `rules`, `config`, `baseline`) dari commit branch `base` tepercaya. Kode PR diletakkan di direktori terisolasi `pr/` dan dipindai secara pasif. PR tidak memiliki wewenang memodifikasi mesin gate atau menurunkan baseline miliknya sendiri.
2. **NEVER_BASELINE Rules:** `ASTESIA-000` (import hantu), `ASTESIA-004` (secret code), dan `ASTESIA-010` (secret config) dilarang mutlak dimasukkan ke baseline. Pelanggarannya selalu menggagalkan build demi keamanan fatal.
3. **Ratchet Per-(Rule, File):** Baseline tidak menggunakan kuota angka global untuk mencegah *masking* (mis. menyelesaikan 1 bug lama untuk menyelipkan 1 bug baru).
4. **Coverage Drop Guard:** Rasio berkas terpindai $\ge 0.9$ mencegah trik bypass penghapusan berkas scannable atau manipulasi konfigurasi pengecualian.
