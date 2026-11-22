# Laporan Implementasi & Verifikasi Gelombang 2A.1: Astesia Gate Engine Hardening

**Tanggal:** 18 November 2026  
**Status:** SELESAI & TERVERIFIKASI  
**Branch:** `wave2a.1/fixes`  
**Base Commit Snapshot:** `4bc9ff4` (berakar dari `56dd907` pada commit snapshot `b7013f2`, `d055144`, `4f90ffb`, `4bc9ff4`)  
**Head Commit:** `bbdfa88` (dan commit dokumentasi terkait)  
**Tujuan:** Menutup kekurangan laporan Gelombang 2A, mengaudit ulang perubahan fixture 56dd907, menyelesaikan tiga temuan dari proyek nyata (F1-F4), mengintegrasikan registri resmi known-gaps, dan memvalidasi batas kepercayaan CI/Workflow Guard (3.4, 3.5).

---

## 1. Ringkasan Eksekutif & Status Verifikasi

Gelombang 2A.1 berhasil menuntaskan seluruh pekerjaan penambalan kritis sebelum verifikasi independen dengan mematuhi prinsip **Verification-First**, **Fail-Closed**, **Zero-Dependency**, dan **YAGNI (Direktif #28)**.

### Ringkasan Pencapaian Utama:
1. **Audit Ulang Fixture 56dd907:** Mengungkap inkonsistensi dokumentasi commit 56dd907 di laporan 2A dan menemukan *Hidden False Negative* pada `SEC-25` lama (`Basic <credentials>`), yang diperbaiki secara mekanis melalui penanganan token autentikasi sebelum pengecekan spasi umum.
2. **Eliminasi False Positive & Desync Proyek Nyata (F1, F2):**
   - Memperbaiki heuristik sensitivitas kunci `isSensitiveKey` sehingga nama kunci non-sensitif (seperti `THEME_STORAGE_KEY`, `cache_key`) tidak memicu false positive ASTESIA-004.
   - Membangun *Config Profile Tokenizer* khusus untuk `.yml`, `.yaml`, `Dockerfile*`, dan `.env*` yang mengeliminasi 100% false desync `TOKENIZER_DESYNC` pada Dockerfile multiline command tanpa merusak presisi baris kode.
3. **Katup Allowlist Terjustifikasi Berbasis Konfigurasi (F3):**
   - Membangun skema `allow` pada `.astesia/gate-config.json` yang secara eksklusif hanya mengizinkan penanganan `ASTESIA-004` dan `ASTESIA-010`.
   - Memvalidasi parameter secara ketat (schema 1, relative path tanpa wildcard `*` atau traversal `..`, match $\ge 6$ karakter, reason $\ge 15$ karakter).
   - Mendeteksi entri usang (`allow_stale`) dan mengintegrasikan metrik `allowlisted` ke dalam baseline ratchet.
4. **Penanganan Cerdas Berkas `.env` yang Diabaikan Git (F4):**
   - Berkas `.env` yang terabaikan oleh `.gitignore` dan berstatus untracked secara otomatis dilewati dari pemindaian (`env_ignored_skipped`).
   - Berkas `.env` yang terlanjur ter-commit di indeks git tetap dipindai secara tegas (*fail-closed*).
5. **Keamanan Workflow & Rules Diff (3.4, 3.5):**
   - `workflow-guard.ts` kini mendukung CLI mode (`bun workflow-guard.ts <file>`) dengan exit codes 0/1/2 dan diintegrasikan ke `astesia-gate.workflow.yml`.
   - `BRANCH-PROTECTION.md` diperbarui dengan batasan kepercayaan (*trust boundaries*) CI.
   - `--rules-diff` kini mendeteksi dan menolak penyempitan ekstensi aturan (*narrowing extensions*) dengan exit code 1.
6. **Registri Resmi Known Gaps & Invarian Akuntansi:**
   - 6 celah deteksi terdokumentasi di `templates/enforcement/tests/known-gaps.json` dan diverifikasi secara bidirectional oleh harness.
   - Invarian akuntansi `total === passed + failed + known_gaps` terpenuhi di seluruh 12 kategori.
   - Benchmark performa 15 pasang bergantian menunjukkan rasio median **1.074x** (sangat aman di bawah batas toleransi $\le 1.25$x).

---

## 2. Audit Ulang Fixture & Analisis Commit `56dd907`

### 2.1 Diskrepansi Dokumentasi Commit `56dd907`
Laporan Wave 2A sebelumnya menyatakan commit `56dd907` memiliki pesan:
> `"test(harness): fix flaky CLI and desync tests on Windows"`

Setelah diaudit langsung terhadap riwayat git riil (`git log -1 56dd907`), commit tersebut sebenarnya adalah:
- **Pesan Commit Riil:** `test(gate): align fixture tokens with decision table specification`
- **Author:** `yoragam1 <aryookumura@gmail.com>`
- **Tanggal:** `Tue Nov 17 21:44:26 2026 +0800`

### 2.2 Analisis 4 Hunks `git diff 86ed448 56dd907`
Pemeriksaan diff antara `86ed448` dan `56dd907` pada direktori tes menunjukkan 4 perubahan:
1. `adv/unclosed.ts`: String double quote `"this string is never closed;\n` diubah menjadi template literal backtick `` `this template is never closed;\n ``.
   * *Analisis:* Perubahan ini dilakukan karena tokenizer Gelombang 1.1 menetapkan bahwa string kutip tunggal/ganda baris tunggal berakhir di newline dan tidak boleh mendesinkronisasi tokenizer hingga EOF.
2. `sec/sec21.ts`: `const tokenType = "application/json";` diubah menjadi `const tokenType = "Bearer-Token-Type";`.
   * *Akar Masalah:* Nilai `"application/json"` mengandung karakter garis miring `/`, yang gagal pada pengecekan `^[A-Za-z_-]+$`, sehingga memicu false positive. Alih-alih memperbaiki penanganan MIME type, fixture saat itu diubah.
3. `sec/sec25.ts`: `const authHeader = "Basic dXNlcm5hbWU6cGFzc3dvcmQ=";` diubah menjadi `const authToken = "dXNlcm5hbWU6cGFzc3dvcmQ=";`.
   * *Akar Masalah & Hidden False Negative (FN):* Nilai `"Basic dXNlcm5hbWU6cGFzc3dvcmQ="` memiliki spasi (`Basic `). Pada gerbang lama, aturan E1 mengecualikan nilai yang memiliki spasi (`val.includes(" ")`), sehingga secret `authHeader` tersebut **secara diam-diam gagal terdeteksi (Hidden FN)**!
4. `cli-desync/unclosed.ts`: Penyelarasan fixture CLI dari double quote menjadi backtick.

### 2.3 Solusi Tanpa Pelemahan (Restored & Preserved)
Di Gelombang 2A.1, seluruh kasus asli dipulihkan dan diverifikasi:
- **`SEC-25-orig`:** Ditambahkan sebagai pengujian resmi `sec/sec25-orig.ts` dengan nilai `const authHeader = "Basic dXNlcm5hbWU6cGFzc3dvcmQ=";`. Logika `isAuthBearerOrBasic` diimplementasikan sehingga header `Basic` dan `Bearer` dengan panjang token $\ge 12$ selalu dideteksi sebagai secret sebelum aturan spasi E1 berlaku.
- **`SEC-21-orig`:** Ditambahkan sebagai pengujian resmi `sec/sec21-orig.ts` dengan nilai `const tokenType = "application/json";`. Format MIME type `/^[a-zA-Z0-9_+.-]+\/[a-zA-Z0-9_+.-]+$/` pada kunci berakhiran `Type` dikecualikan secara sah dari tuduhan secret.
- **`ADV-07-DOUBLE-QUOTE`:** Ditambahkan ke kategori adversarial untuk membuktikan secara mekanis bahwa kutip ganda yang tidak ditutup pada satu baris tidak menyebabkan `TOKENIZER_DESYNC` dan tetap mendeteksi pelanggaran di baris berikutnya.

---

## 3. Detail Implementasi F1, F2, F3, F4, 3.4, dan 3.5

### 3.1 F1: Heuristik ASTESIA-004 & Sensitivitas Kunci (`isSensitiveKey`)
Untuk menghentikan false positive pada nama kunci seperti `THEME_STORAGE_KEY = "terminal_portfolio_theme"` pada proyek terminal-portfolio, fungsi `isSensitiveKey` dibangun:
- Kunci yang berakhiran dengan modifier non-sensitif (`storage_key`, `cache_key`, `sort_key`, `primary_key`, `foreign_key`, `routing_key`, `theme_key`, dll.) segera dinyatakan **non-sensitif** (`false`).
- Kunci yang mengandung term sensitif sejati (`secret`, `password`, `passwd`, `token`, `auth`, `credential`, `api_key`, `client_secret`, `private_key`) dinyatakan **sensitif** (`true`).
- Kunci berbentuk `apiKey`, `privateKey`, `secretKey` (camelCase) atau `key` tunggal dikenali sebagai kunci sensitif.
- Penanganan `Basic <base64>` dan `Bearer <token>`: Regex `/^(?:Basic|Bearer)\s+[A-Za-z0-9+/=_-]{12,}$/i` memastikan kredensial berformat header HTTP selalu memicu `ASTESIA-004`.

### 3.2 F2: Config Profile Tokenizer untuk Berkas Non-Kode
Berkas `.yml`, `.yaml`, `Dockerfile*`, dan `.env*` diproses melalui jalur *Config Profile*:
- Karakter kutip (`"`, `'`) tidak dilacak sebagai pembuka multiline literal kode.
- Karakter `#` dikenali sebagai komentar **hanya jika berada di awal baris atau didahului oleh spasi (whitespace)**. Ini mencegah karakter `#` di dalam URL, selector, atau variabel dipotong secara keliru.
- Presisi nomor baris (`rawLines.length === codeLines.length`) dan panjang tiap baris (`line.length === cLine.length`) dipertahankan 100% menggunakan padding spasi.
- **Hasil:** 0 false warning `TOKENIZER_DESYNC` pada Dockerfile multiline command di `terminal-portfolio` dan `pustaka-sekolah-pwa`.

### 3.3 F3: Katup Allowlist Terjustifikasi Berbasis Konfigurasi
Untuk menangani kasus legacy atau mock test yang sah tanpa melemahkan aturan default, katup allowlist disediakan di `.astesia/gate-config.json`:
- **Aturan yang Diizinkan:** HANYA `ASTESIA-004` dan `ASTESIA-010`. Rule lain (seperti `ASTESIA-000`, `ASTESIA-001`, `ASTESIA-005`, dll.) otomatis ditolak dengan exit code 2.
- **Validasi Path:** Wajib berupa path relatif spesifik tanpa wildcard (`*`, `?`) dan tanpa traversal (`..`) atau awalan `/`.
- **Validasi Pencocokan & Alasan:** `match` minimal 6 karakter; `reason` minimal 15 karakter.
- **Deteksi Stale:** Entri allowlist yang tidak pernah cocok dengan pelanggaran dilaporkan di dalam array `allow_stale` pada `--json` dan memunculkan notice di stdout.
- **Baseline Ratchet:** Peningkatan jumlah entri `allowlisted` dicatat sebagai counter regresi di baseline ratchet dan mewajibkan `--allow-raise` jika ingin di-update.

### 3.4 F4: Penanganan Cerdas Berkas `.env` yang Diabaikan Git
Fungsi `isGitIgnoredEnv(root, rel)` memeriksa status git file `.env`:
- Menjalankan `git -C <root> check-ignore -q <rel>` untuk mengecek apakah berkas diabaikan oleh `.gitignore`.
- Menjalankan `git -C <root> ls-files --error-unmatch <rel>` untuk memastikan berkas berstatus untracked (belum pernah di-commit).
- Jika keduanya terpenuhi, berkas dilewati dari pemindaian dan dicatat dalam metrik `env_ignored_skipped`.
- **Fail-Closed:** Jika berkas `.env` sudah terlanjur di-commit di repositori git (status code 0 pada `ls-files`), berkas **TETAP DIPINDAI** dan memicu pelanggaran `ASTESIA-010`. Jika bukan repositori git, berkas juga tetap dipindai.

### 3.5 3.4: Workflow Guard CLI Mode & CI Trust Boundaries
- Berkas `templates/enforcement/tests/workflow-guard.ts` diperbarui: jika menerima argumen file (`bun workflow-guard.ts <path>`), skrip bertindak sebagai CLI validator:
  - Validasi berhasil: cetak status dan exit 0.
  - Pelanggaran keamanan ditemukan: cetak `[WORKFLOW_GUARD_ERROR: ...]` dan exit 1.
  - Berkas tidak ditemukan: cetak `[TOOL_FAILED: ...]` dan exit 2.
- `templates/enforcement/astesia-gate.workflow.yml` kini memuat langkah:
  ```yaml
  - name: Validate PR Workflow Security Guard
    run: |
      GUARD_SCRIPT=""
      if [ -f "trusted/templates/enforcement/tests/workflow-guard.ts" ]; then
        GUARD_SCRIPT="trusted/templates/enforcement/tests/workflow-guard.ts"
      elif [ -f "trusted/.astesia/enforcement/tests/workflow-guard.ts" ]; then
        GUARD_SCRIPT="trusted/.astesia/enforcement/tests/workflow-guard.ts"
      fi
      if [ -n "$GUARD_SCRIPT" ] && [ -f "pr/.github/workflows/astesia-gate.yml" ]; then
        bun "$GUARD_SCRIPT" pr/.github/workflows/astesia-gate.yml
      fi
  ```
- Dokumen `templates/enforcement/BRANCH-PROTECTION.md` ditambahkan seksi **"Batas yang Tidak Bisa Ditutup oleh Workflow"** yang menjelaskan batasan GitHub Actions dan perlunya kombinasi CODEOWNERS + Branch Protection Ruleset.

### 3.6 3.5: Deteksi Penyempitan Ekstensi Berkas pada Rules Diff
Fungsi `handleRulesDiff` di `astesia-gate.ts` membandingkan `base.extensions` dan `head.extensions`:
- Jika head menghapus ekstensi dari base (penyempitan cakupan), gate mencetak error `[RULES_DIFF: rule '...' narrowed extensions (removed: ...)]` dan keluar dengan **exit code 1**.
- Jika head menambah ekstensi (perluasan cakupan), gate mencetak notice ke stderr dan mengizinkan perubahan (exit code 0).
- Jika urutan ekstensi berubah namun set-nya sama, perubahan diizinkan (exit code 0).

---

## 4. Registri Resmi Known Gaps (`known-gaps.json`)

Berkas `templates/enforcement/tests/known-gaps.json` mendokumentasikan 6 batasan deteksi zero-dependency regex yang telah terverifikasi secara resmi:

| ID Celah | Aturan | Fixture | Alasan Teknis | Sumber Laporan |
|---|---|---|---|---|
| `007-EC2b` | `ASTESIA-007` | `r007/ec2b_cross_function_helper.ts` | Pemanggilan fungsi helper `fetchUserOrdersHelper` di dalam loop tidak dapat dipetakan ke kueri database tanpa analisis call-graph AST. | `wave1.1-report` |
| `ADV-BACKTICK-IN-REGEX-GAP` | `ASTESIA-005` | `adv/backtick-in-regex.ts` | Karakter backtick di dalam regex literal (`/`/`) membuka template literal fiktif pada tokenizer baris tunggal. | `wave1.1-report` |
| `SEC-23-GAP` | `ASTESIA-004` | `sec/sec23.ts` | Secret berupa kata snake_case lowercase di bawah kunci suffix UI field/text/name lolos dari filter entropi regex. | `wave1.1-report` |
| `D2-REG-BACKTICK-GAP` | `ASTESIA-005` | `indep/d2_gap1.ts` | Backtick di dalam regex literal pada tes adversarial independen verifier. | `wave1.1-verification` |
| `D2-PHP-HEREDOC` | `ASTESIA-002` | `indep/d2_gap2.php` | Sintaks PHP heredoc (`<<<TAG`) tidak di-strip sebagai string literal oleh tokenizer regex tanpa parser bahasa penuh. | `wave1.1-verification` |
| `D4-21-GAP` | `ASTESIA-004` | `indep/d4_gap.ts` | Secret snake_case lowercase di bawah kunci suffix UI field/text/name pada tes security independen verifier. | `wave1.1-verification` |

**Validasi Bidirectional:** Harness `templates/enforcement/tests/run.ts` memverifikasi secara bidirectional:
1. Setiap entri di `known-gaps.json` wajib dieksekusi oleh test runner.
2. Setiap celah yang ditemui selama eksekusi harness wajib terdaftar di `known-gaps.json`.
3. Diskrepansi apa pun otomatis memicu exit code 2 (fatal).

---

## 5. Benchmark Performa (3.1)

Pengujian performa dilakukan secara bergantian (alternating runs) sebanyak 15 pasang pada dataset 2,000 berkas sintesis multi-bahasa (`.ts`, `.js`, `.py`, `.go`, `.php`, `.vue`, `.svelte`, `.yml`, `.sql`, `.md`).

- **Skrip Benchmark:** `.astesia/audit/wave2a.1/p3-perf.ts`
- **Output Hasil:** `.astesia/audit/wave2a.1/p3-results.json`
- **Base Gate:** Commit `56dd907`
- **Head Gate:** Commit `bbdfa88` (Wave 2A.1)

### Ringkasan Hasil 15 Pasang Pengukuran:

| Metrik | Base Gate (`56dd907`) | Head Gate (`bbdfa88`) | Keterangan |
|---|---|---|---|
| **Minimum** | 492.9 ms | 549.2 ms | Waktu tercepat |
| **Median** | **527.4 ms** | **566.4 ms** | Titik tengah |
| **Maksimum** | 624.2 ms | 586.5 ms | Waktu terlama |
| **Rentang (Range)** | 131.3 ms | **37.3 ms** | Head jauh lebih stabil (variansi rendah) |
| **Rasio Median (Head / Base)** | — | **1.074x** | **PATUH** ($\le 1.25$x) |

Overhead performa hanya sebesar **+7.4%** (jauh di bawah batas toleransi maksimal +25%), dengan variansi eksekusi yang jauh lebih stabil karena eliminasi regex desinkronisasi pada file konfigurasi.

---

## 6. Hasil Pemindaian Proyek Nyata (Fase 5)

### 6.1 Pemindaian `terminal-portfolio` (`D:\Workspaces\terminal-portfolio`)
Perintah eksekusi:
```bash
bun Astesia/templates/enforcement/astesia-gate.ts --root D:/Workspaces/terminal-portfolio --rules D:/Workspaces/Astesia/templates/enforcement/anti-patterns.json --json
```
**Hasil:**
- Berkas terpindai: 18 berkas (`.ts`: 7, `.tsx`: 6, `.js`: 2, `.yml`: 2, `Dockerfile`: 1).
- `errors`: 0
- `warnings`: 0
- `desync_files`: `[]` (KOSONG — Dockerfile multiline command tidak lagi desync).
- `violations`: `[]` (KOSONG — `THEME_STORAGE_KEY` tidak lagi memicu false positive ASTESIA-004).
- Exit Code: **0** (BERSIH).

### 6.2 Pemindaian `pustaka-sekolah-pwa` (`D:\Workspaces\pustaka-sekolah-pwa`)
Perintah eksekusi:
```bash
bun Astesia/templates/enforcement/astesia-gate.ts --root D:/Workspaces/pustaka-sekolah-pwa --rules D:/Workspaces/Astesia/templates/enforcement/anti-patterns.json --json
```
**Hasil:**
- Berkas terpindai: 77 berkas.
- `env_ignored_skipped`: **1** (Berkas `.env` yang berada di `.gitignore` dan untracked berhasil dilewati secara otomatis).
- `desync_files`: `[]` (KOSONG — tidak ada desinkronisasi).
- Pelanggaran riil yang ditemukan:
  - 22 errors (N+1 queries pada `loan.repository.ts`, `auth.service.ts`; `SELECT *` pada `user.repository.ts`; hardcoded secret pada `docker-compose.yml`).
  - 38 warnings (tipe `any` pada `api/index.ts` dan service worker artifact di `dev-dist/`).

### 6.3 Usulan `.astesia/gate-config.json` untuk `pustaka-sekolah-pwa`
*(Disajikan hanya sebagai rekomendasi teks dalam laporan ini, tanpa mengubah repositori pustaka-sekolah-pwa)*:
```json
{
  "schema": 1,
  "exclude": [
    {
      "path": "dev-dist",
      "reason": "Generated distribution and service worker build artifacts"
    }
  ],
  "allow": [
    {
      "rule": "ASTESIA-010",
      "path": "docker-compose.yml",
      "match": "POSTGRES_PASSWORD",
      "reason": "Local development docker-compose default container credential"
    }
  ]
}
```

---

## 7. Matriks Pengujian & Invarian Akuntansi Lengkap

Data diekstrak langsung dari berkas bukti eksekusi `.astesia/audit/wave2a.1/harness-after.json`:

```json
{
  "summary": {
    "total": 279,
    "passed": 273,
    "failed": 0,
    "known_gaps": 6,
    "by_category": {
      "baseline72": { "total": 73, "passed": 72, "failed": 0, "known_gaps": 1 },
      "regressions": { "total": 15, "passed": 15, "failed": 0, "known_gaps": 0 },
      "adversarial": { "total": 12, "passed": 11, "failed": 0, "known_gaps": 1 },
      "security": { "total": 29, "passed": 28, "failed": 0, "known_gaps": 1 },
      "new": { "total": 13, "passed": 13, "failed": 0, "known_gaps": 0 },
      "independent": { "total": 67, "passed": 64, "failed": 0, "known_gaps": 3 },
      "baseline": { "total": 25, "passed": 25, "failed": 0, "known_gaps": 0 },
      "rules_diff": { "total": 13, "passed": 13, "failed": 0, "known_gaps": 0 },
      "ci_guard": { "total": 9, "passed": 9, "failed": 0, "known_gaps": 0 },
      "fuzz_truth": { "total": 3, "passed": 3, "failed": 0, "known_gaps": 0 },
      "allowlist": { "total": 15, "passed": 15, "failed": 0, "known_gaps": 0 },
      "env_git": { "total": 5, "passed": 5, "failed": 0, "known_gaps": 0 }
    }
  }
}
```

### 7.1 Tabel Rincian Kategori Pengujian
| No | Kategori | Total | Passed | Failed | Known Gaps | Invarian Matematis | Status |
|:--:|---|:---:|:---:|:---:|:---:|:---:|:---:|
| 1 | `baseline72` | 73 | 72 | 0 | 1 | $73 = 72 + 0 + 1$ | **LULUS** |
| 2 | `regressions` | 15 | 15 | 0 | 0 | $15 = 15 + 0 + 0$ | **LULUS** |
| 3 | `adversarial` | 12 | 11 | 0 | 1 | $12 = 11 + 0 + 1$ | **LULUS** |
| 4 | `security` | 29 | 28 | 0 | 1 | $29 = 28 + 0 + 1$ | **LULUS** |
| 5 | `new` | 13 | 13 | 0 | 0 | $13 = 13 + 0 + 0$ | **LULUS** |
| 6 | `independent` | 67 | 64 | 0 | 3 | $67 = 64 + 0 + 3$ | **LULUS** |
| 7 | `baseline` | 25 | 25 | 0 | 0 | $25 = 25 + 0 + 0$ | **LULUS** |
| 8 | `rules_diff` | 13 | 13 | 0 | 0 | $13 = 13 + 0 + 0$ | **LULUS** |
| 9 | `ci_guard` | 9 | 9 | 0 | 0 | $9 = 9 + 0 + 0$ | **LULUS** |
| 10 | `fuzz_truth` | 3 | 3 | 0 | 0 | $3 = 3 + 0 + 0$ | **LULUS** |
| 11 | `allowlist` | 15 | 15 | 0 | 0 | $15 = 15 + 0 + 0$ | **LULUS** |
| 12 | `env_git` | 5 | 5 | 0 | 0 | $5 = 5 + 0 + 0$ | **LULUS** |
| **TOTAL** | **Semua Kategori** | **279** | **273** | **0** | **6** | **$279 = 273 + 0 + 6$** | **LULUS 100%** |

### 7.2 Uji Ketahanan CLI & Property Fuzzing:
- **CLI Resilience Tests:** 6/6 lulus (termasuk exit 2 pada non-existent root, exit 1 pada desync dengan max-warn=0, validasi max-warn negatif dan NaN).
- **Property Invariant Fuzzing:** Seed 1337 menguji 2,000 berkas sintesis; invarian panjang karakter baris kode vs baris asli lulus 100% tanpa error.
- **Ground Truth Fuzzing:** Seed 7001, 7002, dan 7003 masing-masing menguji 2,000 berkas; 3/3 lulus.

---

## 8. Status Akhir & Rekomendasi Verifikasi

1. Seluruh kode `astesia-gate.ts` tetap berada dalam **SATU berkas tunggal** (1,906 baris) tanpa dependensi eksternal.
2. Tidak ada aturan registri atau fixture pengujian yang dilemahkan; kasus tepi dipulihkan dan dibuktikan lulus.
3. Branch `wave2a.1/fixes` berada dalam kondisi siap diverifikasi secara buta (*blind verification*) oleh Verifier Independen.
