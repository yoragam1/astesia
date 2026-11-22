# Metadata

- Gelombang: 3C
- Branch kerja: `wave3c/fixes`
- START Commit: `10be56edba674b55779d554ce7595423496379df` (`10be56e`)
- BASE 3B: `e7a60d4`
- Status Gate: BEKU (`templates/enforcement/**` 62 berkas identik dengan START, hash blob cocok tanpa perbedaan)
- Lingkungan eksekusi: Windows (PowerShell 5.1, Bun 1.1, Node.js v20)
- Berkas manifes: `.astesia/audit/wave3c/MANIFEST.json`
- Laporan diagnostik awal: `.astesia/audit/wave3c/start-checks.json`

# Diagnosis

Tahap diagnostik awal (Phase 1) mengidentifikasi enam area masalah yang menjadi fokus perbaikan pada gelombang 3C:

1. **D1 - Tata Kelola Nama Tool Runtime:**
   Pada gelombang sebelumnya, nama tool AI didasarkan pada denylist statis dan tebakan nama tool internal. Pendekatan ini rentan drift saat runtime agen berganti dan menyebabkan penolakan keliru. Investigasi runtime mencatat tool aktif yang tersedia dan membagi pengelolaan menjadi tiga status: confirmed (didukung bukti manusia), unverified (terdeteksi tapi belum divalidasi), dan denied (dilarang keras). Artefak: `.astesia/audit/wave3c/agent-tools-raw.json`.

2. **D2 - Diskrepansi Referensi Gate dan Keterbatasan:**
   Dokumentasi `docs/GATE-REFERENCE.md` memuat flag yang tidak diimplementasikan pada kode sumber gate (seperti `--help`), mencantumkan klaim yang keliru mengenai AST parsing (`parser AST`, `syntax invalid`), serta memuat direktif yang tidak didukung (`astesia-disable`). Artefak: `.astesia/audit/wave3c/gate-doc-diff.json`.

3. **D3 - Sasaran Berkas Initializer Brownfield:**
   Skrip `tools/astesia-init.ts` menghasilkan berkas yang tidak sesuai kontrak (misalnya meletakkan `CODEOWNERS` di root direktori alih-alih `.astesia/docs/CODEOWNERS.template`), menimpa konfigurasi pengguna saat forced init tanpa backup otomatis, dan memiliki inkonsistensi skema eksklusi direktori. Artefak: `.astesia/audit/wave3c/init-diag.json`.

4. **D4 - Modus Kegagalan Installer Plugin:**
   Skrip instalasi `install.ps1` dan `install.sh` menggunakan fallback penyalinan berkas ketika pembuatan symlink gagal, menyamarkan kegagalan symlink, serta menggunakan kode keluar yang ambigu. Rollback saat instalasi gagal juga belum mengisolasi berkas yang baru dibuat. Artefak: `.astesia/audit/wave3c/installer-diag.json`.

5. **D5 - Kebersihan Dokumentasi dan Catatan Anggaran Token:**
   Ditemukan pengecualian panjang deskripsi yang usang, tautan dokumen verifikasi tool yang belum terpasang di `README.md`, dan riwayat token budget yang memerlukan sinkronisasi. Artefak: `.astesia/audit/wave3c/debt-diag.json`.

6. **D6 - Klaim Laporan Agen Tanpa Bukti Mekanis:**
   Laporan agen pada siklus sebelumnya sering menggunakan istilah hiperbolis tanpa pemeriksaan mekanis. Dibutuhkan alat linter mekanis untuk memvalidasi teks laporan, memastikan keberadaan berkas audit di disk, dan memastikan eksistensi commit git.

# Tugas

Pelaksanaan tugas dibagi menjadi tujuh modul kerja (M1 hingga M7):

- **M1 - Tata Kelola Nama Tool Runtime (`runtime/tool-map.json`):**
  Mengganti daftar denylist usang dengan model tata kelola berbasis kemampuan (capability phrasing). Menghapus `runtime/denied-tool-names.json` dan `runtime/known-tools.json`, lalu menggantikannya dengan `runtime/tool-map.json`. Menyesuaikan aturan pada `rules/` dan `skills/` agar menggunakan frasa kapabilitas generik. Menguji regresi pemicu skill dengan perbandingan berpasangan 100 sampel tanpa penurunan akurasi (commit `d0ee6e3`). Artefak: `.astesia/audit/wave3c/paired-trigger-after.json` dan `.astesia/audit/wave3c/paired-trigger-comparison.json`.

- **M2 - Penurunan Referensi Gate Secara Mekanis:**
  Menulis ulang `tools/gen-gate-reference.ts` menggunakan pemindai literal string (`--[a-z][a-z-]*`), tabel oracle deskripsi flag resmi `docs/gate-reference-descriptions.json`, berkas batasan statis `docs/gate-limitations.md`, serta ekstraksi fail-closed terhadap `NEVER_BASELINE` dan `NEVER_INLINE_SUPPRESS`. Memperbarui aturan linter FL-014 dan FL-020 untuk mendeteksi klaim keliru. Mengembangkan `tools/tests/gate-contract-suite.ts` dengan 12 mutan yang seluruhnya tereliminasi (commit `c771c6c`).

- **M3 - Pengerasan Initializer Brownfield (`tools/astesia-init.ts`):**
  Menyelaraskan target berkas sesuai spesifikasi: `.astesia/enforcement/astesia-gate.ts`, `.astesia/enforcement/anti-patterns.json`, `.astesia/gate-config.json`, `.github/workflows/astesia-gate.yml`, `.astesia/docs/CODEOWNERS.template`, `.astesia/docs/BRANCH-PROTECTION.md`, dan `.astesia/install-manifest.json`. Memastikan workflow yang sudah ada dipertahankan tanpa `--force`, dan dicadangkan ke `.bak-<timestamp>` saat `--force` diberikan. Menambahkan pengujian eksklusi direktori dan 14 mutan pada `tools/tests/init-suite.ts` (commit `92955d6`).

- **M4 - Pengerasan Installer Plugin (`install.ps1` dan `install.sh`):**
  Menerapkan kode keluar baku (0: sukses/idempoten, 2: argumen keliru/repo sumber, 3: target foreign, 4: konflik tanpa `-Force`, 5: kegagalan verifikasi, 6: kegagalan I/O symlink). Menghapus fallback copy agar kegagalan tautan sistem terdeteksi secara fail-closed. Menerapkan fungsi rollback yang hanya menghapus berkas yang dibuat oleh installer (`plugin.json`, `skills`, `rules`, `.astesia-install.json`). Mengembangkan 14 mutan installer pada `tools/tests/installer-ps1.test.ts` (commit `1dce5f1`).

- **M5 - Pembersihan Kebersihan Framework:**
  Memastikan `description_length_exemptions` kosong pada konfigurasi linter. Memasang tautan `docs/TOOL-VERIFICATION.md` pada `README.md`. Memvalidasi riwayat token budget (commit `be9daa3`).

- **M6 - Pemasangan Linter Laporan Mekanis (`tools/report-lint.ts`):**
  Mengimplementasikan aturan RL-001 hingga RL-005: melarang istilah hiperbolis pada teks narasi, mewajibkan 7 judul bab terstruktur, memeriksa keberadaan kata kunci `UNVERIFIABLE` pada bab pengujian yang belum terlaksana, memeriksa keberadaan berkas audit pada disk, dan memeriksa eksistensi objek commit git melalui `git cat-file`. Menambahkan suite pengujian 18 kasus uji dan 6 mutan (commit `615e40e`).

- **M7 - Verifikasi Akhir dan Audit Pack:**
  Menghasilkan inventaris mutakhir `docs/GENERATED-INVENTORY.md` (commit `4a8815e`), memperbarui otomatisasi manifes audit pada `tools/verify-manifest.ts` (commit `bb8b108`), menjalankan pengujian gate pada isolated clean clone dengan `core.autocrlf=false` (`.astesia/audit/wave3c/clean-clone-end.json`), serta merekam seluruh luaran pemeriksaan pada `.astesia/audit/wave3c/checks-after.json`.

# Pengukuran

Hasil pengukuran kuantitatif pada akhir gelombang 3C:

1. **Pengujian Gate pada Isolated Clean Clone:**
   - Direktori terisolasi dengan repositori clone murni dan konfigurasi `core.autocrlf=false`.
   - Total pengujian: 1121 kasus uji.
   - Lolos uji: 1114 kasus uji.
   - Gagal: 0 kasus uji.
   - Active Known Gaps: 7 kasus uji (sesuai registri acuan).
   - Invariant check: lolos (total 1121 = 1114 passed + 0 failed + 7 known gaps).
   - Bukti mentah: `.astesia/audit/wave3c/clean-clone-end.json` dan `.astesia/audit/wave3c/clean-clone-start.json`.

2. **Integritas Frozen Gate:**
   - 62 berkas di dalam `templates/enforcement/**` diperiksa terhadap rekaman blob awal pada `.astesia/audit/wave3c/frozen-blobs-start.json`.
   - Hasil pemeriksaan: 62 dari 62 berkas identik tanpa perbedaan hash blob.

3. **Pengujian Rangkaian Perkakas Framework (Unified Test Runner):**
   - Total pengujian: 258 kasus uji pada 7 suite pengujian.
   - Suite 1 (Rules Suite): 53/53 lolos.
   - Suite 2 (Linter Mutation Suite): 30/30 mutan tereliminasi.
   - Suite 3 (Retention Suite): 7/7 lolos.
   - Suite 4 (Installer Suite): 69/69 lolos.
   - Suite 5 (Init Suite): 69/69 lolos.
   - Suite 6 (Gate Contract Suite): 12/12 mutan tereliminasi.
   - Suite 7 (Report Lint Suite): 18/18 lolos (termasuk 6 mutan tereliminasi).
   - Total kegagalan: 0.
   - Bukti mentah: `.astesia/audit/wave3c/checks-after.json`.

4. **Anggaran Token Boot Set:**
   - Estimasi token boot set saat ini: 8.972 token.
   - Batas maksimum anggaran: 8.976 token.
   - Selisih aman: -4 token (dalam batas toleransi).

5. **Evaluasi Proksi Pemicu Skill (Trigger Proxy):**
   - Sampel evaluasi: 100 sampel prompt berpasangan.
   - Akurasi sebelum perubahan (baseline): 73 dari 100 sampel (73.00%).
   - Akurasi setelah pembaruan frase kemampuan: 73 dari 100 sampel (73.00%).
   - Degradasi pemicu: 0 sampel mengalami penurunan.
   - Bukti mentah: `.astesia/audit/wave3c/paired-trigger-comparison.json`.

# Keputusan dan Asumsi

1. **Pemisahan Frase Kemampuan dari Identitas Tool Konkret:**
   Aturan dan panduan skill menggunakan bahasa kemampuan fungsional untuk mencegah ketergantungan rapuh terhadap nama tool runtime AI tertentu. Identitas tool konkret hanya dipetakan pada `runtime/tool-map.json`.

2. **Pemindaian Literal untuk Flag CLI Gate:**
   Dokumentasi referensi gate diturunkan secara langsung dari kode sumber `astesia-gate.ts` dengan mendeteksi pola argumen CLI dan mencocokkannya dengan oracle deskripsi resmi `docs/gate-reference-descriptions.json`. Jika ada flag baru yang tidak terdaftar pada oracle, proses pembuatan referensi keluar dengan status fail-closed.

3. **Keamanan Alur Kerja Brownfield:**
   Skrip `tools/astesia-init.ts` dilarang menimpa alur kerja GitHub Actions `.github/workflows/astesia-gate.yml` yang sudah ada kecuali flag `--force` diberikan secara eksplisit. Jika opsi paksa digunakan, berkas lama dicadangkan ke `.bak-<timestamp>`.

4. **Penolakan Fallback Copy pada Installer Symlink:**
   Installer plugin tidak lagi menyediakan mode fallback penyalinan folder ketika pembuatan symlink gagal. Hal ini menjamin bahwa kegagalan lingkungan sistem berkas dilaporkan secara transparan melalui kode keluar 6.

5. **Isolasi Rollback Kegagalan:**
   Ketika proses verifikasi pasca-instalasi gagal, fungsi pembersihan hanya menghapus berkas dan tautan yang dibuat pada sesi tersebut (`plugin.json`, `skills`, `rules`, `.astesia-install.json`) tanpa menghapus direktori atau data milik pengguna di sekitarnya.

# Keterbatasan yang Diketahui

1. **Tokenisasi Gate Berbasis Ekspresi Reguler:**
   Pemeriksa gate (`astesia-gate.ts`) beroperasi dengan pendekatan zero-dependency menggunakan pemindaian berbasis regex dan heuristik baris. Pendekatan ini tidak melakukan pembentukan pohon sintaksis abstrak (AST) penuh, sehingga konstruksi bahasa yang dinamis (seperti interpolasi template literal kompleks atau konkatenasi variabel string dinamis) tidak dapat diurai secara semantik.

2. **Tujuh Kesenjangan Terdaftar (Known Gaps):**
   Tujuh kasus batas pada rangkaian pengujian gate tetap berstatus known gap yang dicatat secara eksplisit pada `templates/enforcement/tests/known-gaps.json` (termasuk deteksi rekursif lintas fungsi pada ASTESIA-007, rahasia format snake_case pada ASTESIA-004, dan parsing markup di luar blok PHP).

3. **Ketergantungan Heuristik Baris:**
   Pendeteksian pola anti-pattern pada gate mengandalkan aturan pencocokan baris dan jendela konteks terbatas. Pemecahan ekspresi menjadi multibaris yang tidak terduga dapat mempengaruhi deteksi.

# Hal yang Tidak Bisa atau Tidak Sempat Diuji

Pengujian instalasi native pada sistem operasi Linux murni dan macOS murni tercatat sebagai `UNVERIFIABLE`. Pengujian implementasi pada gelombang ini dilaksanakan secara menyeluruh pada lingkungan host Windows dengan PowerShell 5.1 dan Bun runtime. Sintaksis skrip shell `install.sh` telah divalidasi secara statis dan logika fallback diuji menggunakan mocking, namun pembuatan tautan simbolik direktori kernel native Linux (menggunakan `ln -s`) dan izin sistem berkas POSIX secara riil tidak dapat dieksekusi secara langsung tanpa ketersediaan runner atau lingkungan virtual Linux/macOS pada mesin pengembang saat ini.
