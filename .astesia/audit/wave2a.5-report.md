# Laporan Implementasi & Evaluasi Empiris Gelombang 2A.5 — Astesia Framework v3.0.0

## 1. Identitas Branch, Ancestry, Versi Runtime, & Ukuran Gate

- **Workspace:** `D:\Workspaces\Astesia`
- **Branch Aktif:** `wave2a.5/fixes` (dibuat langsung dari base commit `a9e20cd`, membiarkan branch `wave2a.4/fixes` tidak tersentuh)
- **Base Commit (`wave2a.4` verified base):** `a9e20cd` (`a9e20cd6a51107af558a09df8348eb4c260ef88a`)
- **Baseline Historis Pembanding:** `56dd907` (`wave1.1/fixes`)
- **Commit Implementasi & Bukti (`wave2a.5/fixes`):** `061afd2` (`061afd2121d54ebe44360d3aa450f57d43a6b957`) *(catatan: commit laporan akhir berada tepat 1 commit di atas `061afd2` dan hanya menambahkan berkas laporan `.astesia/audit/wave2a.5-report.md` ini)*
- **Ancestry Check (`git merge-base --is-ancestor a9e20cd 061afd2`):** Exit code `0` (valid ancestor)
- **Runtime:** Bun `1.3.9` (Windows x64)
- **Ukuran `templates/enforcement/astesia-gate.ts`:**
  - Pada `a9e20cd`: `2.491` baris
  - Pada `061afd2`: `2.763` baris (batas maksimum Keputusan 5: $\le 2.800$ baris, berkas tunggal, zero external dependencies)

### Daftar Commit (`git log --oneline a9e20cd..061afd2`)

| Hash | Pesan Commit | Tugas |
|---|---|---|
| `4fc5d68` | `feat(gate): implement conservative single-line regex literal tokenizer and close backtick gaps (T1)` | T1 |
| `a22e35f` | `feat(gate): implement generated/minified file policy and baseline counter (T2)` | T2 |
| `dd0afca` | `feat(gate): implement strict URL exemption and credentialed URL detection for ASTESIA-004 (T3)` | T3 |
| `289802e` | `fix(gate): require explicit path for --baseline flag and support nested template interpolations (T5/T6)` | T4, T5, T6 |
| `d2565c5` | `feat(config): add dev-dist and .vercel/output exclusions to gate-config.template.json (T10)` | T10 |
| `b0df3cd` | `feat(tests): synchronize known-gap registries, add Wilson stats/classify tools, and enforce bidirectional meta-tests (T7/T8)` | T7, T8 |
| `f416b50` | `test(mutation): add 14 Wave 2A.5 mutants (48 total) and make M06 hermetic across drives (T9)` | T9 |
| `71c1361` | `chore(audit): record Phase 3 snapshots, classifications, goldens, benchmarks, and dossier updates` | Fase 3 & Dossier |
| `061afd2` | `chore(audit): record final clean-clone harness-after and protected-file hashes` | Verifikasi Akhir |

---

## 2. Langkah 0 — Kejujuran Baseline `a9e20cd` & Rekonsiliasi Penyimpangan Laporan 2A.4

### 2.1 Eksekusi Penuh `all.ts --json` pada Clone Bersih `a9e20cd` di Luar Workspace
Sebelum menyentuh kode apa pun, dibuat clone bersih terisolasi di `C:\Users\alta1r\AppData\Local\Temp\astesia-clean-1795061000` dengan environment terisolasi (`HOME`, `USERPROFILE`, `XDG_CONFIG_HOME` diarahkan ke direktori kosong `C:\Users\alta1r\AppData\Local\Temp\astesia-empty-home`, `GIT_CONFIG_GLOBAL=NUL`, `GIT_CONFIG_SYSTEM=NUL`). Output mentah disimpan di [.astesia/audit/wave2a.5/step0-clean-clone-all.json](file:///D:/Workspaces/Astesia/.astesia/audit/wave2a.5/step0-clean-clone-all.json):
- **Akuntansi `a9e20cd`:** `total = 836`, `passed = 829`, `failed = 0`, `known_gaps = 7` ($836 = 829 + 0 + 7$, `invariant_holds: true`, `zero_orphans: true`).
- **Uji Mutasi pada Clone Bersih `a9e20cd`:** `total = 34`, `killed = 33`, `survived = 1` (**`M06: tracked_env_skipped` bertahan hidup** di `%TEMP%`).
- **Akar Masalah Mengapa `M06` Bertahan Hidup di `%TEMP%`:**
  Di dalam sandbox Windows (dengan workspace aktif `D:\Workspaces`), ketika proses Bun dijalankan dengan `cwd` di drive `C:\Users\alta1r\AppData\Local\Temp\...`, loader environment Bun membaca direktori induk `C:\Users\alta1r` yang berada di luar sandbox sehingga `process.env` di dalam proses anak menjadi kosong (`{}`). Pada `a9e20cd`, `M06` di `templates/enforcement/tests/mutation/run.ts` mengirimkan path gate termutasi hanya melalui `env: { ...process.env, GATE_PATH: mgPath }`. Karena `process.env.GATE_PATH` bernilai `undefined` di dalam `%TEMP%`, `env-git-suite.ts` jatuh ke fallback `join(__dirname, "../astesia-gate.ts")` (gate asli yang tidak termutasi), sehingga mutan `M06` lolos tanpa terbunuh.

### 2.2 Rekonsiliasi Registri `known-gaps*.json` vs Klaim Laporan 2A.4
Hasil rekonsiliasi lengkap disimpan di [.astesia/audit/wave2a.5/step0-known-gaps-reconciliation.json](file:///D:/Workspaces/Astesia/.astesia/audit/wave2a.5/step0-known-gaps-reconciliation.json):
1. **Penyimpangan Laporan 2A.4:** Laporan `.astesia/audit/wave2a.4-report.md` mengklaim 7 known-gap adalah `SEC-05, SEC-06, SEC-12, SEC-14, SEC-18, SEC-23-GAP, V1-09`. Dari 7 ID tersebut, **6 ID (`SEC-05`, `SEC-06`, `SEC-12`, `SEC-14`, `SEC-18`, `V1-09`) tidak ada di registri `known-gaps*.json` mana pun** dan merupakan kasus tes biasa yang sudah lulus (`passed`).
2. **Isi Aktual Registri pada `a9e20cd`:**
   - `templates/enforcement/tests/known-gaps.json` (6 entri aktif): `007-EC2b`, `ADV-BACKTICK-IN-REGEX-GAP`, `SEC-23-GAP`, `D2-REG-BACKTICK-GAP`, `D2-PHP-HEREDOC`, `D4-21-GAP` (menyumbang 6 `known_gaps` dari `run.ts`).
   - `templates/enforcement/tests/verify/v2-secrets.ts` (1 entri aktif di kode): `SEC-23-GAP` (menyumbang 1 `known_gaps` dari `verify/run.ts`, total $6 + 1 = 7$).
   - `templates/enforcement/tests/verify/known-gaps.verify.json`: 8 entri berstatus `RESOLVED_IN_WAVE_2A_2`.
   - `templates/enforcement/tests/verify2/known-gaps.verify2.json`: 3 entri berstatus `RESOLVED_IN_WAVE_2A_3`.
   - `templates/enforcement/tests/verify3/known-gaps.verify3.json`: 1 entri aktif (`SEC-23-GAP`, `DEFERRED_TO_WAVE_3`).
   - **Celah Tak Terdaftar pada `a9e20cd`:** `HELM-KEYNAME-GAP` (`HK-14` di `templates/enforcement/tests/helm-keyname-suite.ts` baris 33) diberi flag `isKnownGap: true`, tetapi memiliki `shouldTrigger: false` sehingga dihitung sebagai `passed` (14/14 passed, 0 known_gaps) dan tidak didaftarkan di `known-gaps.json`.

---

## 3. Fase 1 — Hasil Diagnosis Empiris 7 Proyek Nyata (D1–D4)

Seluruh 7 proyek nyata disalin secara read-only (beserta `.git` dan working tree, tanpa `node_modules`) ke `C:\Users\alta1r\AppData\Local\Temp\astesia-real\<proyek>` oleh [.astesia/audit/wave2a.5/tools/d1-copy-and-snapshot.ts](file:///D:/Workspaces/Astesia/.astesia/audit/wave2a.5/tools/d1-copy-and-snapshot.ts).

### 3.1 D1 — Snapshot Baseline `56dd907` vs `a9e20cd` pada 7 Proyek Nyata
Bukti mentah: [.astesia/audit/wave2a.5/snapshots/d1-metadata.json](file:///D:/Workspaces/Astesia/.astesia/audit/wave2a.5/snapshots/d1-metadata.json). Determinisme `a9e20cd` pada `pustaka-sekolah-pwa` (run 1 vs run 2): SHA-256 identik `068e2e61d34ef04cd6abbdff3fd1ef8ab492c27e8177fc7c92a5449d2732ff50`.

| Proyek | Commit Proyek | `56dd907` Scanned | `56dd907` Desync | `56dd907` Errors / Warns (Total) | `a9e20cd` Scanned | `a9e20cd` Desync | `a9e20cd` Errors / Warns (Total) |
|---|---|---:|---:|---:|---:|---:|---:|
| `pustaka-sekolah-pwa` | `3a8a0c2` | 72 | 1 | 30 / 39 (69) | 77 | 0 | 22 / 38 (60) |
| `terminal-portfolio` | `eb093c4` | 18 | 1 | 1 / 1 (2) | 18 | 0 | 0 / 0 (0) |
| `eunectes` | `a290b60` | 3.218 | 16 | 48 / 371 (419) | 4.108 | 12 | 22 / 409 (431) |
| `flora-smk` | `848f2a9` | 121 | 2 | 21 / 27 (48) | 122 | 2 | 2 / 27 (29) |
| `ifrit` | `b4a5d62` | 233 | 2 | 31 / 325 (356) | 233 | 2 | 7 / 325 (332) |
| `arene` | `6f4b4a8` | 290 | 6 | 14 / 123 (137) | 376 | 3 | 12 / 142 (154) |
| `SIA` | `d64f78c` | 468 | 1 | 2 / 60 (62) | 468 | 1 | 1 / 60 (61) |
| **Total** | — | **4.420** | **29** | **147 / 946 (1.093)** | **5.402** | **20** | **66 / 1.001 (1.067)** |

### 3.2 D2 — Inventaris Lengkap 20 Berkas `TOKENIZER_DESYNC` pada `a9e20cd`
Bukti mentah: [.astesia/audit/wave2a.5/snapshots/d2-desync-inventory.json](file:///D:/Workspaces/Astesia/.astesia/audit/wave2a.5/snapshots/d2-desync-inventory.json).

| No | Proyek | Berkas | Baris Pemicu | Kategori Akar Masalah | Panjang Baris Maks | Ringkasan Pemicu |
|---:|---|---|---:|---|---:|---|
| 1 | `eunectes` | `packages/claude-code-hooks/src/pre-tool-use.ts` | 53 | `regex_backtick` | 124 | Regex literal memuat backtick `` /`[^`]*`/g `` |
| 2 | `eunectes` | `packages/omop-codex/plugin/components/pentest-loop/src/quality-gate-blockers.ts` | 12 | `regex_backtick` | 109 | Regex literal memuat backtick `` /`([^`]+)`/g `` |
| 3 | `eunectes` | `packages/omop-codex/plugin/test/sync-skills-orchestration.test.mjs` | 194 | `regex_backtick` | 108 | Regex literal memuat backtick `` /`([^`]+)`/ `` |
| 4 | `eunectes` | `packages/omop-opencode/src/cli/doctor/checks/config.ts` | 112 | `regex_backtick` | 115 | Regex literal memuat backtick di character class |
| 5 | `eunectes` | `packages/omop-opencode/src/features/background-agent/manager.ts` | 855 | `template_nested` | 139 | Nested template literal dengan `` \` `` di dalam `${ ... }` satu baris |
| 6 | `eunectes` | `packages/omop-opencode/src/features/builtin-commands/commands.ts` | 48 | `regex_backtick` | 118 | Regex literal memuat backtick |
| 7 | `eunectes` | `packages/omop-opencode/src/hooks/auto-slash-command/detector.ts` | 18 | `regex_backtick` | 96 | Regex literal memuat backtick `` /`[^`]*`/g `` |
| 8 | `eunectes` | `packages/omop-opencode/src/hooks/claude-code-hooks/pre-tool-use.ts` | 64 | `regex_backtick` | 124 | Regex literal memuat backtick `` /`[^`]*`/g `` |
| 9 | `eunectes` | `packages/omop-opencode/src/hooks/directory-agents-injector/injector.ts` | 31 | `regex_backtick` | 110 | Regex literal memuat backtick |
| 10 | `eunectes` | `packages/omop-opencode/src/hooks/rules-injector/matcher.ts` | 44 | `regex_backtick` | 104 | Regex literal memuat backtick |
| 11 | `eunectes` | `packages/omop-opencode/src/tools/background-task/create-background-cancel.ts` | 47 | `template_nested` | 114 | Nested template literal `` `${t.sessionID ? `\`${t.sessionID}\`` : "(none)"}` `` |
| 12 | `eunectes` | `packages/omop-opencode/src/tools/slashcommand/slashcommand.ts` | 73 | `regex_backtick` | 112 | Regex literal memuat backtick |
| 13 | `flora-smk` | `.vercel/output/static/_app/immutable/chunks/BzC1P0DO.js` | 1 | `minified_bundle` | 72.066 | Chunk bundle SvelteKit ter-minifikasi ($\ge 5.000$ karakter) |
| 14 | `flora-smk` | `.vercel/output/static/_app/immutable/chunks/C7EYTeg7.js` | 19 | `minified_bundle` | 30.934 | Chunk bundle SvelteKit ter-minifikasi ($\ge 5.000$ karakter) |
| 15 | `ifrit` | `ceobe/src/ai/context/contextCompressor.ts` | 29 | `regex_backtick` | 116 | Regex literal memuat backtick `` /`[^`\n]+`/g `` |
| 16 | `ifrit` | `ceobe/src/telegram/telegramFormatter.ts` | 14 | `regex_backtick` | 108 | Regex literal memuat backtick `` /`([^`]+)`/g `` |
| 17 | `arene` | `scripts/hooks/pre-bash-commit-quality.js` | 91 | `regex_backtick` | 102 | Regex literal memuat backtick |
| 18 | `arene` | `scripts/hooks/pre-bash-dispatcher.js` | 127 | `regex_backtick` | 98 | Regex literal memuat backtick |
| 19 | `arene` | `tests/hooks/hooks.test.js` | 312 | `regex_backtick` | 121 | Regex literal memuat backtick |
| 20 | `SIA` | `resources/views/welcome.blade.php` | 273 | `php_markup` | 28.398 | Apostrof teks HTML di luar `<?php ?>` + baris CSS inline 28.398 karakter |

**Distribusi Akar Masalah D2 (20 Berkas):**
- `regex_backtick`: **15 berkas (75,0%)** $\to$ diselesaikan oleh **T1**.
- `template_nested`: **2 berkas (10,0%)** $\to$ diselesaikan oleh **T5**.
- `minified_bundle`: **2 berkas (10,0%)** $\to$ diselesaikan oleh **T2**.
- `php_markup`: **1 berkas (5,0%)** $\to$ di bawah ambang syarat T4 ($\ge 20\%$ atau $\ge 3$ berkas), dan berkas tersebut memiliki baris 28.398 karakter ($\ge 5.000$) sehingga juga dilewati oleh **T2**; sesuai aturan T4, didaftarkan sebagai known-gap `PHP-MARKUP-OUTSIDE-TAG-GAP`.

### 3.3 D3 — Inventaris Berkas Generated/Minified pada 7 Proyek Nyata
Bukti mentah: [.astesia/audit/wave2a.5/snapshots/d3-generated-candidates.json](file:///D:/Workspaces/Astesia/.astesia/audit/wave2a.5/snapshots/d3-generated-candidates.json).

| Proyek | Jumlah Berkas Generated (T2) | Kriteria Pemicu | Jumlah Temuan dari Berkas Generated pada `a9e20cd` |
|---|---:|---|---:|
| `pustaka-sekolah-pwa` | 0 | (`dev-dist/workbox-61be8b72.js` memiliki baris maks $< 5.000$ dan tanpa marker header; ditangani oleh `gate-config.template.json` T10) | 0 |
| `terminal-portfolio` | 0 | — | 0 |
| `eunectes` | 0 | — | 0 |
| `flora-smk` | 13 | 13 berkas `.vercel/output/static/_app/immutable/{chunks,nodes}/*.js` memiliki baris $\ge 5.000$ karakter (5.388 s.d. 72.066 karakter) | 17 (2 `TOKENIZER_DESYNC` + 15 `ASTESIA-009`) |
| `ifrit` | 0 | — | 0 |
| `arene` | 0 | — | 0 |
| `SIA` | 1 | `resources/views/welcome.blade.php` memiliki baris 28.398 karakter ($\ge 5.000$) | 1 (`TOKENIZER_DESYNC`) |
| **Total** | **14** | — | **18** |

### 3.4 D4 — Inventaris Seluruh 14 Temuan `ASTESIA-004` pada `a9e20cd`
Bukti mentah: [.astesia/audit/wave2a.5/snapshots/d4-astesia004-inventory.json](file:///D:/Workspaces/Astesia/.astesia/audit/wave2a.5/snapshots/d4-astesia004-inventory.json).
- `url_without_credentials` (**2 temuan** — keduanya FP yang dihapus oleh T3):
  1. `pustaka-sekolah-pwa`: `scripts/init-turso.mjs:6` (`url: process.env.TURSO_DATABASE_URL || 'libsql://pustaka-pwa-yoraexe.aws-ap-northeast-1.turso.io'`)
  2. `eunectes`: `tests/hashline/headless.ts:122` (`baseURL: process.env.HASHLINE_TEST_BASE_URL ?? "https://quotio.mengmota.com/v1"`)
- `url_with_credentials`: **0 temuan**.
- `other`: **12 temuan** (3 TP rahasia aktual di `eunectes` + 9 FP non-URL yang tetap dipindai dan diklasifikasikan secara jujur pada Fase 3).

---

## 4. Fase 2 — Implementasi & Bukti Test-First (T1–T10)

Bukti kegagalan suite baru pada gate `a9e20cd` sebelum perubahan gate disimpan di [.astesia/audit/wave2a.5/harness-before.json](file:///D:/Workspaces/Astesia/.astesia/audit/wave2a.5/harness-before.json) (`931 total = 867 passed + 56 failed + 8 known_gaps`).

### 4.1 T1 — Deteksi Konservatif Regex Literal Satu Baris, Penutupan Gap, & Fuzz Baru
- **Implementasi ([astesia-gate.ts](file:///D:/Workspaces/Astesia/templates/enforcement/astesia-gate.ts#L107-L185)):**
  - Fungsi `canOpenRegex(codeNoStringsChars, slashIdx)` dan `tryScanRegexLiteral(text, startIdx, len)` hanya aktif pada `.ts .tsx .js .jsx .mjs .cjs` serta di dalam blok `<script>` pada `.svelte`/`.vue` (tidak aktif pada `.py` atau `.go`).
  - `/` hanya membuka regex literal bila komentar (`//`, `/*`) tidak cocok lebih dulu dan token signifikan sebelumnya di `codeNoStringsChars` adalah awal berkas, salah satu dari `( , = : [ ! & | ? { ; + - * % ~ ^` (mengecualikan `++` dan `--`), `=>`, atau keyword utuh `return typeof case void delete in of do else throw new yield await instanceof` yang tidak didahului oleh `.` atau `/`.
  - `/` **tidak** membuka regex setelah identifier biasa, angka, `)`, `]`, `}`, `++`, `--`, akhir string/template, `<`, atau `>` (kecuali `=>`).
  - Pemindaian isi regex bersifat satu baris dengan batas $\le 2.000$ karakter, mendukung escape `\` dan character class `[...]` (di mana `/` tidak menutup regex). Bila baris berakhir sebelum `/` penutup atau panjang $> 2.000$ karakter, `/` jatuh kembali menjadi operator pembagian tanpa membocorkan state ke baris berikutnya.
  - Pada `codeNoStringsLines`, pembuka `/`, penutup `/`, dan flag `[a-z]*` dipertahankan sedangkan isi regex diganti spasi; pada `codeLines`, seluruh regex dipertahankan utuh.
- **Bukti Test-First ([regex-literal-suite.ts](file:///D:/Workspaces/Astesia/templates/enforcement/tests/regex-literal-suite.ts)):**
  - Sebelum (`a9e20cd`): `20/36 passed (16 failed)`
  - Sesudah (`061afd2`): `36/36 passed (0 failed)`
- **Penutupan Known-Gap & Fuzzing ([fuzz-truth.ts](file:///D:/Workspaces/Astesia/templates/enforcement/tests/fuzz-truth.ts)):**
  - `ADV-BACKTICK-IN-REGEX-GAP` dan `D2-REG-BACKTICK-GAP` dihapus dari `known-gaps.json` dan lulus sebagai kasus tes biasa (`gap -> pass`).
  - `fuzz-truth.ts` diperluas dengan segmen regex literal dan JSX untuk seed baru `7101, 7102, 7103` ($\times 2.000$ berkas = 6.000 berkas) tanpa mengubah seed lama `7001, 7002, 7003` ($\times 2.000$ berkas = 6.000 berkas) maupun property fuzz seed `1337` (2.000 berkas): seluruh **14.000 berkas fuzz** lulus 100%.

### 4.2 T2 — Kebijakan Berkas Generated/Minified, Pemindaian Prefix Kuat, & Counter `generated_skipped`
- **Implementasi ([astesia-gate.ts](file:///D:/Workspaces/Astesia/templates/enforcement/astesia-gate.ts#L675-L710)):**
  - `isGeneratedFile(rawLines, relPath)` mengklasifikasikan berkas sebagai generated bila: (a) basename cocok `\.min\.(js|mjs|cjs|css)$`, (b) terdapat baris dengan panjang $\ge 5.000$ karakter (setelah normalisasi CRLF; `4.999` bukan generated, `5.000` adalah generated), atau (c) salah satu dari 10 baris pertama (baris 11 tidak) memuat `@generated`, `DO NOT EDIT`, atau `Code generated`.
  - Berkas generated tidak melewati tokenizer (`0` `TOKENIZER_DESYNC`, tidak dihitung di `files_scanned`), dicatat pada `generated_skipped` dan `generated_files` (output teks dan `--json`), serta dipindai pada `rawLines` dengan satu regex linear `STRONG_SECRET_RE` untuk prefix rahasia kuat (`sk_live_`, `sk_test_`, `ghp_`, `gho_`, `AKIA`, `xox[abp]-`, JWT `eyJ...`, `-----BEGIN ... PRIVATE KEY-----`) sebagai `ASTESIA-004` (`error`, `NEVER_BASELINE`, tidak dapat disupresi).
  - `generated_skipped` terintegrasi penuh ke dalam `counters` baseline (nilai hilang pada baseline lama dianggap `0`; kenaikan menggagalkan `--baseline` dengan `exit 1` dan menolak `--update-baseline` tanpa `--allow-raise --reason`).
- **Bukti Test-First ([generated-policy-suite.ts](file:///D:/Workspaces/Astesia/templates/enforcement/tests/generated-policy-suite.ts)):**
  - Sebelum (`a9e20cd`): `2/23 passed (21 failed)`
  - Sesudah (`061afd2`): `23/23 passed (0 failed)` (termasuk deteksi secret di tengah dan akhir baris 1.000.000 karakter dalam $< 1.500\text{ ms}$).

### 4.3 T3 — Pengecualian URL Ketat pada `ASTESIA-004`
- **Implementasi ([astesia-gate.ts](file:///D:/Workspaces/Astesia/templates/enforcement/astesia-gate.ts#L1079-L1168)):**
  - `analyzeUrlFor004(val, lhsKey, envKey, isEnvFallback)` menerapkan Keputusan 3 klausa (a)–(e): memeriksa sensitivitas `lhsKey` dan `envKey` menurut kontrak token, memvalidasi skema terhadap 14 skema aman (`http`, `https`, `ws`, `wss`, `libsql`, `postgres`, `postgresql`, `mysql`, `mongodb`, `mongodb+srv`, `redis`, `rediss`, `amqp`, `amqps`), memvalidasi `userinfo` terhadap `STRONG_SECRET_RE` dan password hardcoded (hanya mengizinkan referensi variabel murni `$VAR`, `${VAR}`, atau `{{ ... }}`), mem-parse host/path/query/hash dengan `new URL(...)` (host wajib tak-kosong), serta menolak parameter query maupun fragment bernama sensitif (`token|key|secret|password|passwd|pwd|auth|authtoken|apikey|api_key|access_token|sig|signature|credential`) atau nilai berprefix rahasia kuat.
- **Bukti Test-First ([url-exempt-suite.ts](file:///D:/Workspaces/Astesia/templates/enforcement/tests/url-exempt-suite.ts)):**
  - Sebelum (`a9e20cd`): `13/26 passed (13 failed)`
  - Sesudah (`061afd2`): `26/26 passed (0 failed)`

### 4.4 T4 (`php_markup`), T5 (`template_nested` & JSX Text), T6 (`--baseline` Flag), & T10 (`gate-config.template.json`)
- **T4:** Karena `php_markup` pada D2 hanya 1 dari 20 berkas ($5,0\% < 20\%$ dan $1 < 3$ berkas), sesuai aturan bersyarat T4 tidak ditambahkan parser PHP baru; kasus tersebut didaftarkan sebagai known-gap `PHP-MARKUP-OUTSIDE-TAG-GAP` di `templates/enforcement/tests/known-gaps.json` dengan reproduser sintetis `T4-GAP` di `wave2a5-cli-config-suite.ts`.
- **T5:** `preprocessSource` melacak `templateBraceStack` saat bertemu `${` di dalam `S_STRING_BACKTICK` (pada bahasa regex/markup `<script>`) dan kembali ke `S_STRING_BACKTICK` saat kurung kurawal penutup `}` yang berpasangan ditemukan. Bila EOF tercapai saat `templateBraceStack.length > 0`, `desync` bernilai `true` (*fail-closed*). Apostrof di tengah kata pada JSX/TSX (`/[A-Za-z0-9]/` sebelum `'`, mis. `Don't`) tidak membuka string kutip tunggal.
- **T6:** Flag `--baseline` tanpa nilai argumen mengembalikan `exit 2` dengan pesan `[TOOL_FAILED: missing path for --baseline (use --baseline <path>)]`. Path default `.astesia/gate-baseline.json` hanya berlaku untuk `--update-baseline`.
- **T10:** `templates/enforcement/gate-config.template.json` menyertakan pengecualian `dev-dist` dan `.vercel/output` dengan alasan $\ge 15$ karakter.
- **Bukti Test-First ([wave2a5-cli-config-suite.ts](file:///D:/Workspaces/Astesia/templates/enforcement/tests/wave2a5-cli-config-suite.ts)):**
  - Sebelum (`a9e20cd`): `3/10 passed (6 failed, 1 known_gap)`
  - Sesudah (`061afd2`): `9/10 passed (0 failed, 1 known_gap)`

### 4.5 T7 (`stats.ts` & `classify.ts`) & T8 (Sinkronisasi Known-Gap & 9 Meta-Tes)
- **Self-Test `stats.ts` ([.astesia/audit/wave2a.5/tools/stats.ts](file:///D:/Workspaces/Astesia/.astesia/audit/wave2a.5/tools/stats.ts)):**
  - `wilsonUpper95(0, 0) === "n/a"` (PASS)
  - `wilsonUpper95(0, 30) = 0.1135...` dalam $[0.113, 0.114]$ (PASS)
  - `wilsonUpper95(0, 50) = 0.07135...` dalam $[0.071, 0.072]$ (PASS)
  - `wilsonUpper95(3, 30) = 0.2562...` dalam $[0.256, 0.257]$ (PASS)
  - `wilsonUpper95(5, 5) === 1.0` (PASS)
- **Daftar 6 Known-Gap Aktif Terdaftar (Sinkron 1-ke-1 dengan Eksekusi Harness):**

| ID Known-Gap | Aturan | Sumber / Runner | Alasan Teknis |
|---|---|---|---|
| `007-EC2b` | `ASTESIA-007` | `wave1.1-report` (`run.ts`) | Pemanggilan helper lintas fungsi di dalam loop tidak dapat dipetakan ke query DB tanpa analisis call-graph |
| `SEC-23-GAP` | `ASTESIA-004` | `wave1.1-report` (`run.ts`, `verify/run.ts`) | Secret huruf kecil `snake_case` di bawah key berakhiran `label/field/text/name` lolos heuristik tanpa kamus semantik |
| `D2-PHP-HEREDOC` | `ASTESIA-002` | `wave1.1-verification` (`run.ts`) | Sintaks PHP heredoc (`<<<EOD`) tidak di-strip sebagai string literal oleh tokenizer zero-dependency |
| `D4-21-GAP` | `ASTESIA-004` | `wave1.1-verification` (`run.ts`) | Interpolasi template literal `` `pass_${userId}` `` masih memicu line-regex tanpa evaluasi runtime |
| `HELM-KEYNAME-GAP` | `ASTESIA-010` | `wave2a.4-helm-keyname` (`helm-keyname-suite.ts#HK-14`) | Passphrase huruf kecil murni di bawah `*PasswordKey` cocok dengan pola identifier nama key Helm `^[a-z][a-z._-]{0,39}$` |
| `PHP-MARKUP-OUTSIDE-TAG-GAP` | `TOKENIZER_DESYNC` | `wave2a.5-d2-t4` (`wave2a5-cli-config-suite.ts#T4-GAP`) | Apostrof tak berpasangan pada markup HTML di luar `<?php ?>` pada berkas `.php`/`.blade.php` ($< 20\%$ dan $< 3$ berkas pada D2) |

- **Hasil 9 Meta-Tes di `all.ts`:**
  - `META-01-INTEGRITY`: Authentic `originals.json` matches known SHA-256 (`2863b919...`) $\to$ **PASS**
  - `META-02-TAMPERING-DETECTED`: Tampering simulation rejected by SHA-256 lock $\to$ **PASS**
  - `META-03-ID-DELETION-DETECTED`: ID deletion simulation strictly detected in parsed corpus $\to$ **PASS**
  - `META-04-CORPUS-COMPLETENESS`: Corpus completeness $\ge 60$ cases (actual: 67) $\to$ **PASS**
  - `META-05-GAP-PRINTED-MATCHES-REGISTRY`: Printed active known-gap IDs equal union of active `known-gaps*.json` entries $\to$ **PASS**
  - `META-06-GAP-BIDIRECTIONAL`: 1-to-1 bidirectional correspondence between active gap registries and gap-marked tests $\to$ **PASS**
  - `META-07-HELM-GAP-ACCOUNTING`: `HELM-KEYNAME-GAP` is counted in `known_gaps` (`13 passed + 1 gap = 14`) and registered in `known-gaps.json` $\to$ **PASS**
  - `META-08-SUITE-INVARIANTS`: Every individual suite satisfies `total === passed + failed + known_gaps` $\to$ **PASS**
  - `META-09-CORPUS-LOCK-DIRECTIONAL`: Directional corpus lock permits `gap -> pass` (`D2-REG-BACKTICK-GAP`) and rejects `pass -> gap` $\to$ **PASS**

### 4.6 T9 — Perluasan Uji Mutasi ke 48 Mutan (100% Terbunuh Termasuk `M06` di `%TEMP%`)
- **Perbaikan Hermetik `M06`:** `mutation/run.ts` kini meneruskan `mgPath` sebagai argumen CLI `process.argv[2]` ke `env-git-suite.ts` (selain environment variable `GATE_PATH`), dan `eg04` di `env-git-suite.ts` tidak menimpa `process.env` dengan objek tanpa `SystemRoot` ketika `process.env.PATH` kosong di sandbox `%TEMP%`.
- **14 Mutan Baru Gelombang 2A.5 (`M35..M48`, seluruhnya `count === 1` di `strictReplace`):**

| ID | Nama Mutan | Target Mutasi | Hasil |
|---|---|---|---|
| `M35` | `regex_after_ident_treated_as_regex` | `canOpenRegex` mengembalikan `true` setelah sembarang identifier (merusak pembagian `a / b / c`) | **KILLED** |
| `M36` | `regex_after_return_treated_as_division` | Menghapus `"return"` dari `REGEX_PRECEDING_KEYWORDS` sehingga `return /`/g` memicu desync | **KILLED** |
| `M37` | `regex_char_class_slash_terminates_early` | Menonaktifkan `inClass = true` pada `[` di `tryScanRegexLiteral` sehingga `[/]` menutup regex terlalu dini | **KILLED** |
| `M38` | `regex_disabled_inside_svelte_script` | Menonaktifkan `isMarkupFile && inScriptTag` pada `regexEnabled` di `<script>` `.svelte`/`.vue` | **KILLED** |
| `M39` | `regex_enabled_in_python_or_go` | Menambahkan `.py` dan `.go` ke `REGEX_LANG_EXTS` | **KILLED** |
| `M40` | `generated_threshold_lowered_to_100` | Menurunkan ambang panjang baris `isGeneratedFile` dari `5000` ke `100` | **KILLED** |
| `M41` | `generated_header_checked_after_line_10` | Memeriksa marker `@generated` di seluruh baris berkas, bukan 10 baris pertama | **KILLED** |
| `M42` | `generated_secret_scan_disabled` | Menonaktifkan pemindaian `STRONG_SECRET_RE` pada berkas generated/minified | **KILLED** |
| `M43` | `generated_skipped_ratchet_ignored` | Mengabaikan kenaikan `generated_skipped` pada `evaluateBaseline` | **KILLED** |
| `M44` | `url_exempt_ignores_userinfo_password` | Mengabaikan password hardcoded `user:pass@` pada `userinfo` di `analyzeUrlFor004` | **KILLED** |
| `M45` | `url_exempt_ignores_sensitive_query_param` | Mengabaikan parameter query sensitif (`api_key=`, `token=`) di `analyzeUrlFor004` | **KILLED** |
| `M46` | `url_exempt_ignores_sensitive_key_name` | Mengecualikan URL meskipun nama key/env sensitif (`JWT_SECRET`) | **KILLED** |
| `M47` | `url_parse_failure_treated_as_exempt` | Mengembalikan `"exempt"` saat `new URL(...)` melempar error gagal parse | **KILLED** |
| `M48` | `bare_baseline_flag_uses_default_path` | Mengizinkan `--baseline` tanpa nilai argumen memakai `.astesia/gate-baseline.json` (exit 0, bukan exit 2) | **KILLED** |

**Total Skor Mutasi (`M01..M48`):** **48 / 48 terbunuh (0 survived)** baik di workspace maupun di clone bersih `%TEMP%`.

---

## 5. Fase 3 — Evaluasi Tiga-Arah (`56dd907`, `a9e20cd`, `061afd2`) pada 7 Proyek Nyata

Bukti mentah: [.astesia/audit/wave2a.5/snapshots/phase3-comparison-summary.json](file:///D:/Workspaces/Astesia/.astesia/audit/wave2a.5/snapshots/phase3-comparison-summary.json) dan golden snapshots di `.astesia/audit/wave2a.5/golden/<proyek>.json`.

### 5.1 Tabel Perbandingan Tiga-Arah Lintas 7 Proyek Nyata

| Proyek | Versi Gate | `files_scanned` | `generated_skipped` | `desync_files` | `errors` | `warnings` | Total Temuan | $\Delta$ vs `a9e20cd` (`new` / `lost`) | Determinisme Run 1 vs Run 2 (SHA-256 Golden) |
|---|---|---:|---:|---:|---:|---:|---:|---|
| `pustaka-sekolah-pwa` | `56dd907` / `a9e20cd` / `061afd2` | 72 / 77 / **77** | 0 / 0 / **0** | 1 / 0 / **0** | 30 / 22 / **21** | 39 / 38 / **38** | 69 / 60 / **59** | **-1** (`+0` / `-1`) | `e99070f18e947aee...` (Identik) |
| `terminal-portfolio` | `56dd907` / `a9e20cd` / `061afd2` | 18 / 18 / **18** | 0 / 0 / **0** | 1 / 0 / **0** | 1 / 0 / **0** | 1 / 0 / **0** | 2 / 0 / **0** | **0** (`+0` / `-0`) | `4f5beaea586adadb...` (Identik) |
| `eunectes` | `56dd907` / `a9e20cd` / `061afd2` | 3.218 / 4.108 / **4.108** | 0 / 0 / **0** | 16 / 12 / **0** | 48 / 22 / **21** | 371 / 409 / **398** | 419 / 431 / **419** | **-12** (`+1` / `-13`) | `1d0b8650bf0537d4...` (Identik) |
| `flora-smk` | `56dd907` / `a9e20cd` / `061afd2` | 121 / 122 / **109** | 0 / 0 / **13** | 2 / 2 / **0** | 21 / 2 / **2** | 27 / 27 / **10** | 48 / 29 / **12** | **-17** (`+0` / `-17`) | `8e55799e6a47cb64...` (Identik) |
| `ifrit` | `56dd907` / `a9e20cd` / `061afd2` | 233 / 233 / **233** | 0 / 0 / **0** | 2 / 2 / **0** | 31 / 7 / **7** | 325 / 325 / **323** | 356 / 332 / **330** | **-2** (`+0` / `-2`) | `d341918963857869...` (Identik) |
| `arene` | `56dd907` / `a9e20cd` / `061afd2` | 290 / 376 / **376** | 0 / 0 / **0** | 6 / 3 / **0** | 14 / 12 / **12** | 123 / 142 / **139** | 137 / 154 / **151** | **-3** (`+0` / `-3`) | `e21cf8ad59609c4d...` (Identik) |
| `SIA` | `56dd907` / `a9e20cd` / `061afd2` | 468 / 468 / **467** | 0 / 0 / **1** | 1 / 1 / **0** | 2 / 1 / **1** | 60 / 60 / **59** | 62 / 61 / **60** | **-1** (`+0` / `-1`) | `f497700d1c01893f...` (Identik) |
| **Total 7 Proyek** | `56dd907` / `a9e20cd` / `061afd2` | 4.420 / 5.402 / **5.388** | 0 / 0 / **14** | 29 / 20 / **0** | 147 / 66 / **64** | 946 / 1.001 / **967** | 1.093 / 1.067 / **1.031** | **-36** (`+1` / `-37`) | **7/7 `golden.ts` 0 diff** |

### 5.2 Klasifikasi Seluruh Temuan yang Hilang (`lost = 37`) dan Muncul (`new = 1`) antara `a9e20cd` dan `061afd2`
- **Temuan Hilang (`37` temuan — 0 TP hilang):**
  1. **`20` temuan `TOKENIZER_DESYNC` (`TOKENIZER`):** 15 berkas akibat backtick di dalam regex literal (`eunectes`: 10, `ifrit`: 2, `arene`: 3 — diselesaikan T1), 2 berkas akibat nested template literal di dalam `${ ... }` (`eunectes`: 2 — diselesaikan T5), dan 3 berkas akibat baris $\ge 5.000$ karakter pada bundle/minified view (`flora-smk`: 2, `SIA`: 1 — diselesaikan T2).
  2. **`15` temuan `ASTESIA-009` pada chunk bundle `.vercel/output` di `flora-smk` (`NOISE`):** Berasal dari 11 berkas chunk `.vercel/output/static/_app/immutable/{chunks,nodes}/*.js` yang memiliki baris $\ge 5.000$ karakter dan kini diklasifikasikan sebagai `generated_skipped` oleh T2.
  3. **`2` temuan `ASTESIA-004` pada URL tanpa kredensial (`FP`):**
     - `pustaka-sekolah-pwa`: `scripts/init-turso.mjs:6` (`url: process.env.TURSO_DATABASE_URL || 'libsql://pustaka-pwa-yoraexe.aws-ap-northeast-1.turso.io'`) — dikecualikan secara aman oleh T3.
     - `eunectes`: `tests/hashline/headless.ts:122` (`baseURL: process.env.HASHLINE_TEST_BASE_URL ?? "https://quotio.mengmota.com/v1"`) — dikecualikan secara aman oleh T3 (`tests/hashline/headless.ts:123` yang berisi fallback `apiKey` hardcoded tetap terdeteksi sebagai TP!).
- **Temuan Baru (`1` temuan — 1 TP baru terungkap):**
  1. `eunectes`: `ASTESIA-009` pada `packages/omop-opencode/src/features/background-agent/manager.ts:2332` (`const timer = setTimeout(() => {`) — **True Positive (`TP`)** yang sebelumnya tertutup (blinded) karena tokenizer mengalami desinkronisasi template literal mulai baris 855 pada `a9e20cd`.
- **Penjelasan Riwayat `pustaka-sekolah-pwa` (`69` / `61` $\to$ `60` $\to$ `59`):**
  - Workspace `D:\Workspaces\pustaka-sekolah-pwa` memiliki berkas `.env` untracked yang tercantum di `.gitignore` (`.gitignore:4:.env`).
  - Pada `56dd907` (sebelum fitur skip `.env` gitignored), `.env` ikut dipindai (`69` temuan). Pada laporan 2A.3, penyalinan tanpa `.git` menyebabkan fallback *fail-closed* memindai `.env` (`61` temuan setelah perbaikan `storageKey`/`cacheKey`). Pada `a9e20cd` dengan `.git` utuh, `.env` untracked yang di-ignore dilewati (`env_ignored_skipped: 1`), menghasilkan **`60` temuan** (`22 errors, 38 warnings`).
  - Pada `061afd2` (Gelombang 2A.5), T3 mengecualikan 1 FP URL aman `libsql://` pada `scripts/init-turso.mjs:6`, menurunkan temuan dari **`60` menjadi `59`** (`21 errors, 38 warnings`).

### 5.3 Uji Adopsi Baseline & Ratchet `generated_skipped` pada Salinan Proyek Nyata
Bukti mentah: [.astesia/audit/wave2a.5/snapshots/phase3-baseline-adoption.json](file:///D:/Workspaces/Astesia/.astesia/audit/wave2a.5/snapshots/phase3-baseline-adoption.json).

| Langkah Uji | `pustaka-sekolah-pwa` (salinan) | `flora-smk` (salinan) |
|---|---|---|
| Konfigurasi `.astesia/gate-config.json` | `exclude: ["dev-dist"]`, `allow: [ASTESIA-010 docker-compose.yml]` | `exclude: [".vercel/output"]`, `allow: [ASTESIA-004 auth.repository.ts]` |
| Hasil Pra-Baseline dengan Config | `scanned=75, excluded=2, gen_skipped=0, allowlisted=1, errors=20, warns=29` | `scanned=95, excluded=27, gen_skipped=0, allowlisted=1, errors=1, warns=8` |
| 1. `--update-baseline` (Inisialisasi) | **Exit `0`** | **Exit `0`** |
| 2. `--baseline .astesia/gate-baseline.json` (Clean) | **Exit `0`** | **Exit `0`** |
| 3. Injeksi 1 Pelanggaran Kode (`: any`) + `--baseline` | **Exit `1`** (`new_violations: 1`) | **Exit `1`** (`new_violations: 1`) |
| 4. Injeksi 1 Berkas Bundle ($\ge 5.000$ char) + `--baseline` | **Exit `1`** (`generated_skipped increased (1 > 0)`) | **Exit `1`** (`generated_skipped increased (1 > 0)`) |
| 5. Hapus Injeksi & Verifikasi Ulang `--baseline` | **Exit `0`** | **Exit `0`** |

---

## 6. Klasifikasi Individual 251 Temuan & Statistik Batas Atas Wilson 95%

Seluruh 251 temuan terpilih lintas 7 proyek nyata ditulis satu per satu beserta `quote` ($\le 120$ karakter) dan `reason` ($\ge 15$ karakter) di [.astesia/audit/wave2a.5/classification.json](file:///D:/Workspaces/Astesia/.astesia/audit/wave2a.5/classification.json) dan divalidasi oleh `classify.ts`. Ringkasan metrik disimpan di [.astesia/audit/wave2a.5/classification-metrics.json](file:///D:/Workspaces/Astesia/.astesia/audit/wave2a.5/classification-metrics.json).

### 6.1 Tabel Statistik Per Aturan (`061afd2`)

| ID Aturan | Deskripsi Aturan (`anti-patterns.json`) | Dievaluasi | `TP` | `FP` | `NOISE` | `TOKENIZER` | FP Rate Kode `FP/(TP+FP)` | Wilson 95% Upper (Kode) | FP Rate Total `FP/(TP+FP+NOISE)` | Wilson 95% Upper (Total) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `ASTESIA-000` | Hallucinated import: relative path or local alias does not exist on disk. | 11 | 0 | 10 | 1 | 0 | `10/10` (100,0%) | `1.0000` | `10/11` (90,9%) | `0.9838` |
| `ASTESIA-002` | Unbounded column fetch: SELECT * is banned in production code. | 17 | 17 | 0 | 0 | 0 | `0/17` (0,0%) | `0.1843` | `0/17` (0,0%) | `0.1843` |
| `ASTESIA-004` | Probable hardcoded secret. | 12 | 3 | 9 | 0 | 0 | `9/12` (75,0%) | `0.9111` | `9/12` (75,0%) | `0.9111` |
| `ASTESIA-005` | Explicit `any` weakens the type system (Trust Pyramid L1). | 36 | 36 | 0 | 0 | 0 | `0/36` (0,0%) | `0.0964` | `0/36` (0,0%) | `0.0964` |
| `ASTESIA-006` | console.log in source; use the structured logger. | 128 | 128 | 0 | 0 | 0 | `0/128` (0,0%) | `0.0291` | `0/128` (0,0%) | `0.0291` |
| `ASTESIA-007` | N+1 Database Query: database or repository call executed inside a loop (.map, for, while). | 6 | 6 | 0 | 0 | 0 | `0/6` (0,0%) | `0.3903` | `0/6` (0,0%) | `0.3903` |
| `ASTESIA-008` | Untracked workaround or hack comment without an astesia-debt tracking marker. | 12 | 2 | 3 | 7 | 0 | `3/5` (60,0%) | `0.8824` | `3/12` (25,0%) | `0.5323` |
| `ASTESIA-009` | Uncontrolled setTimeout: potential race condition or uncoordinated delay. | 27 | 19 | 1 | 7 | 0 | `1/20` (5,0%) | `0.2361` | `1/27` (3,7%) | `0.1828` |
| `ASTESIA-010` | Hardcoded secret in configuration, Dockerfile, or CI compose file. | 2 | 1 | 1 | 0 | 0 | `1/2` (50,0%) | `0.9055` | `1/2` (50,0%) | `0.9055` |
| **Total** | — | **251** | **212** | **24** | **15** | **0** | **`24/236` (10,17%)** | **`0.1469`** | **`24/251` (9,56%)** | **`0.1382`** |

*(Catatan: Untuk gabungan `(FP + NOISE) / Total` = `39/251` (15,54%), batas atas Wilson 95% adalah `0.2054`.)*

### 6.2 Tabel Statistik Per Proyek (`061afd2`)

| Proyek | `files_scanned` | `generated_skipped` | `desync_files` | `tokenizer_desync_rate` | Total Temuan | Sampel Dievaluasi | `TP` | `FP` | `NOISE` | `TOKENIZER` | `FP/(TP+FP)` | Wilson 95% Upper (Kode) | `(FP+NOISE)/Total` | Wilson 95% Upper (`FP+NOISE`) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `pustaka-sekolah-pwa` | 77 | 0 | 0 | `0.0000` | 59 | 59 (100%) | 50 | 0 | 9 | 0 | `0/50` | `0.0714` | `9/59` | `0.2652` |
| `terminal-portfolio` | 18 | 0 | 0 | `0.0000` | 0 | 0 (100%) | 0 | 0 | 0 | 0 | `0/0` | `n/a` | `0/0` | `n/a` |
| `eunectes` | 4.108 | 0 | 0 | `0.0000` | 419 | 40 (seed 2028) | 22 | 14 | 4 | 0 | `14/36` | `0.5514` | `18/40` | `0.6017` |
| `flora-smk` | 109 | 13 | 0 | `0.0000` | 12 | 12 (100%) | 9 | 1 | 2 | 0 | `1/10` | `0.4042` | `3/12` | `0.5323` |
| `ifrit` | 233 | 0 | 0 | `0.0000` | 330 | 40 (seed 2030) | 34 | 6 | 0 | 0 | `6/40` | `0.2907` | `6/40` | `0.2907` |
| `arene` | 376 | 0 | 0 | `0.0000` | 151 | 40 (seed 2031) | 38 | 2 | 0 | 0 | `2/40` | `0.1650` | `2/40` | `0.1650` |
| `SIA` | 467 | 1 | 0 | `0.0000` | 60 | 60 (100%) | 59 | 1 | 0 | 0 | `1/60` | `0.0886` | `1/60` | `0.0886` |
| **Total / Agregat** | **5.388** | **14** | **0** | **`0.0000`** | **1.031** | **251** | **212** | **24** | **15** | **0** | **`24/236`** | **`0.1469`** | **`39/251`** | **`0.2054`** |

---

## 7. Benchmark Performa Tiga-Arah (`56dd907`, `a9e20cd`, `061afd2`)

Bukti mentah: [.astesia/audit/wave2a.5/benchmarks.json](file:///D:/Workspaces/Astesia/.astesia/audit/wave2a.5/benchmarks.json).

| Dataset Benchmark | Jumlah Run Terukur | `56dd907` Median / P95 (min–max) | `a9e20cd` Median / P95 (min–max) | `061afd2` (HEAD) Median / P95 (min–max) | Rasio HEAD vs `56dd907` (Batas $\le 1,25\times$) | Rasio HEAD vs `a9e20cd` (Batas $\le 1,15\times$) | Status |
|---|---:|---:|---:|---:|---:|---:|---|
| **Realistic** (2.000 berkas, 5 `.env*`) | 15 pasang alternating (pasang 1 warmup dibuang) | `715,67 ms` / `802,62 ms` (`677,46–802,62`) | `814,18 ms` / `866,64 ms` (`788,00–866,64`) | **`786,15 ms`** / `903,41 ms` (`745,60–903,41`) | **`1,0985x`** | **`0,9656x`** | **PASS** |
| **Stress** (2.000 berkas, 100 `.env*`) | 15 pasang alternating (pasang 1 warmup dibuang) | `726,35 ms` / `797,51 ms` (`713,31–797,51`) | `833,65 ms` / `1.071,61 ms` (`811,55–1.071,61`) | **`790,83 ms`** / `825,35 ms` (`777,53–825,35`) | **`1,0888x`** | **`0,9486x`** | **PASS** |
| **Empty-dir Startup** (0 berkas) | 20 pasang alternating (pasang 1 warmup dibuang) | `81,04 ms` / `82,99 ms` (`77,95–87,71`) | `101,31 ms` / `104,10 ms` (`96,84–104,92`) | **`100,89 ms`** / `106,86 ms` (`98,25–108,77`) | `1,2449x` | `0,9959x` | **PASS** |
| **Proyek Nyata `eunectes`** (4.108 berkas) | 5 pasang alternating | `9.017,52 ms` / `9.146,73 ms` (`8.173,17–9.146,73`) | `8.814,04 ms` / `9.229,41 ms` (`8.645,16–9.229,41`) | **`8.654,03 ms`** / `9.062,71 ms` (`8.282,77–9.062,71`) | **`0,9597x`** | **`0,9818x`** | **PASS** |

---

## 8. Self-Gate, `--rules-diff`, & Verifikasi Clone Bersih Terisolasi (`harness-before.json` vs `harness-after.json`)

Bukti mentah: [.astesia/audit/wave2a.5/final-verification-summary.json](file:///D:/Workspaces/Astesia/.astesia/audit/wave2a.5/final-verification-summary.json), [.astesia/audit/wave2a.5/harness-before.json](file:///D:/Workspaces/Astesia/.astesia/audit/wave2a.5/harness-before.json), dan [.astesia/audit/wave2a.5/harness-after.json](file:///D:/Workspaces/Astesia/.astesia/audit/wave2a.5/harness-after.json).

1. **Self-Gate (`bun templates/enforcement/astesia-gate.ts --root . --rules templates/enforcement/anti-patterns.json --max-warn 0 --json`):**
   - Exit code: **`0`**
   - `errors: 0`, `warnings: 0`, `desync_files: []`, `generated_skipped: 0`, `files_scanned.total: 2`, `files_excluded: 41`.
2. **Rules Diff (`bun templates/enforcement/astesia-gate.ts --rules-diff <a9e20cd:anti-patterns.json> templates/enforcement/anti-patterns.json`):**
   - Exit code: **`0`** (`rules-diff: compatible (rules identical).`)
3. **Verifikasi Clone Bersih Terisolasi di Luar Workspace (`C:\Users\alta1r\AppData\Local\Temp\astesia-clean-final-1795067598514`):**
   - Environment: `HOME`, `USERPROFILE`, `XDG_CONFIG_HOME` diarahkan ke `C:\Users\alta1r\AppData\Local\Temp\astesia-empty-home-final`; `GIT_CONFIG_GLOBAL=NUL`; `GIT_CONFIG_SYSTEM=NUL`.

| Runner / Suite di `all.ts` | `harness-before.json` (Suite Baru pada Gate `a9e20cd`) | `harness-after.json` (Clone Bersih `061afd2` di `%TEMP%`) |
|---|---|---|
| `run.ts` (Implementer Harness + 12.000 Ground-Truth Fuzz + 2.000 Property Fuzz) | `349/355 passed (0 failed, 6 known_gaps)` | **`354/358 passed (0 failed, 4 known_gaps)`** |
| `verify/run.ts` (Verifier 2A.1) | `89/90 passed (0 failed, 1 known_gaps)` | **`89/90 passed (0 failed, 1 known_gaps)`** |
| `verify2/run.ts` (Verifier 2A.2) | `80/80 passed (0 failed, 0 known_gaps)` | **`80/80 passed (0 failed, 0 known_gaps)`** |
| `verify3/run.ts` (Verifier 2A.3) | `80/80 passed (0 failed, 0 known_gaps)` | **`80/80 passed (0 failed, 0 known_gaps)`** |
| `standalone_suites` (14 suite mandiri, 22 total `*-suite.ts`, 0 orphan) | `265/322 passed (56 failed, 1 known_gaps)` | **`320/322 passed (0 failed, 2 known_gaps)`** |
| `meta_tests` (`META-01..09`) | `4/4 passed` | **`9/9 passed (0 failed)`** |
| **Total Akuntansi (`total === passed + failed + known_gaps`)** | `931 === 867 + 56 + 8` (`HOLDS`) | **`939 === 932 + 0 + 7` (`HOLDS`)** |
| **Mutation Testing (`mutation/run.ts`)** | `33/34 killed (1 survived: M06)` pada `step0` | **`48/48 killed (0 survived, termasuk M06)`** |

---

## 9. Verifikasi Integritas SHA-256 17 Berkas Terlindungi (Sebelum vs Sesudah)

Bukti mentah: [.astesia/audit/wave2a.5/protected-files-baseline-sha256.json](file:///D:/Workspaces/Astesia/.astesia/audit/wave2a.5/protected-files-baseline-sha256.json) dan [.astesia/audit/wave2a.5/protected-files-after-sha256.json](file:///D:/Workspaces/Astesia/.astesia/audit/wave2a.5/protected-files-after-sha256.json).

| No | Berkas Terlindungi | SHA-256 Sebelum (`a9e20cd`) | SHA-256 Sesudah (`061afd2`) | Status |
|---:|---|---|---|---|
| 1 | `templates/enforcement/tests/independent/originals.json` | `2863b919b0b3d27c4155ecb61d3f7de71227a078a4b600d1778273caf4596a37` | `2863b919b0b3d27c4155ecb61d3f7de71227a078a4b600d1778273caf4596a37` | **IDENTIK** |
| 2 | `templates/enforcement/tests/verify/known-gaps.verify.json` | `ee133be38706b7b181ba7c002f0bcab213b9269ef9735af52f64af3f260148cb` | `ee133be38706b7b181ba7c002f0bcab213b9269ef9735af52f64af3f260148cb` | **IDENTIK** |
| 3 | `templates/enforcement/tests/verify/run.ts` | `2aafde8a4ab6153e63fd884b3a0b829b8fd7658d686d0ae4aa3477316d690141` | `2aafde8a4ab6153e63fd884b3a0b829b8fd7658d686d0ae4aa3477316d690141` | **IDENTIK** |
| 4 | `templates/enforcement/tests/verify/v2-secrets.ts` | `31465956400eb74daf49902b0733fdc69214618f6f7ded9f2757cd4e84728dfd` | `31465956400eb74daf49902b0733fdc69214618f6f7ded9f2757cd4e84728dfd` | **IDENTIK** |
| 5 | `templates/enforcement/tests/verify/v3-config.ts` | `cd65c5a26652ecea09e064e88fc7349713c5a4c1bcb06c1382e180ea81319828` | `cd65c5a26652ecea09e064e88fc7349713c5a4c1bcb06c1382e180ea81319828` | **IDENTIK** |
| 6 | `templates/enforcement/tests/verify/v4-allowlist.ts` | `fae2019e01d63044102469fc6bafef728756de492c01b5d298b492c92c1a62d0` | `fae2019e01d63044102469fc6bafef728756de492c01b5d298b492c92c1a62d0` | **IDENTIK** |
| 7 | `templates/enforcement/tests/verify/v5-env-git.ts` | `82116615e449272b63f4f380a1eadc291d68464f45a6fd220c076a5f381e6d7d` | `82116615e449272b63f4f380a1eadc291d68464f45a6fd220c076a5f381e6d7d` | **IDENTIK** |
| 8 | `templates/enforcement/tests/verify/v9-rules-diff.ts` | `7a255753fc6999ed8c55a09f8403795a48eb467fc4877c8eb53671f04d8b5370` | `7a255753fc6999ed8c55a09f8403795a48eb467fc4877c8eb53671f04d8b5370` | **IDENTIK** |
| 9 | `templates/enforcement/tests/verify2/allowlist-ratchet-suite.ts` | `a90aed4d3c6dff230e180fa43617113a925cbd5f45085d87811e7300e30ee630` | `a90aed4d3c6dff230e180fa43617113a925cbd5f45085d87811e7300e30ee630` | **IDENTIK** |
| 10 | `templates/enforcement/tests/verify2/config-comments-suite.ts` | `696c992468ebdef67fb9eb7aa5a88bfa6f77aa35e1f1ab1b75273fe80e778da6` | `696c992468ebdef67fb9eb7aa5a88bfa6f77aa35e1f1ab1b75273fe80e778da6` | **IDENTIK** |
| 11 | `templates/enforcement/tests/verify2/key-auth-suite.ts` | `a72fb1213bc67ba65c2f0741a7b2b25d56d8f01ffd8fbef41b77e989c3e492a9` | `a72fb1213bc67ba65c2f0741a7b2b25d56d8f01ffd8fbef41b77e989c3e492a9` | **IDENTIK** |
| 12 | `templates/enforcement/tests/verify2/known-gaps.verify2.json` | `5ef5b0a90695a35cc63555410b9469eac4b207535efd8b167c934aaf7402bf99` | `5ef5b0a90695a35cc63555410b9469eac4b207535efd8b167c934aaf7402bf99` | **IDENTIK** |
| 13 | `templates/enforcement/tests/verify2/run.ts` | `48ce917076b430222472f4ebe54b31941748ed25d5a51de83f6e075c0a4dac99` | `48ce917076b430222472f4ebe54b31941748ed25d5a51de83f6e075c0a4dac99` | **IDENTIK** |
| 14 | `templates/enforcement/tests/verify2/workflow-guard-suite.ts` | `65c0953576dfbad0f987d33a61ecd80429ae5c5519c0c5f8411c01c8f600dd95` | `65c0953576dfbad0f987d33a61ecd80429ae5c5519c0c5f8411c01c8f600dd95` | **IDENTIK** |
| 15 | `templates/enforcement/tests/verify3/cases.ts` | `53ac2ce24cdc613e9711c808ded23369f845503b2bdde7770988aeb84151c197` | `53ac2ce24cdc613e9711c808ded23369f845503b2bdde7770988aeb84151c197` | **IDENTIK** |
| 16 | `templates/enforcement/tests/verify3/known-gaps.verify3.json` | `c89f81d0ac6cfcaed37fbcb3b89eaf968053ec67e8d8695cbc8c36413a76c7f6` | `c89f81d0ac6cfcaed37fbcb3b89eaf968053ec67e8d8695cbc8c36413a76c7f6` | **IDENTIK** |
| 17 | `templates/enforcement/tests/verify3/run.ts` | `c46ac69c0724ee8f21455a0f0eb6b35233f1d163cceaf2c2e54b1a36ecd136cd` | `c46ac69c0724ee8f21455a0f0eb6b35233f1d163cceaf2c2e54b1a36ecd136cd` | **IDENTIK** |
