# Protokol Verifikasi Nama Tool Runtime (Human Verification Protocol)

Dokumen ini mendefinisikan prosedur verifikasi manual oleh **manusia** untuk mengonfirmasi ketersediaan nama kakas (tools) pada runtime Antigravity IDE atau antarmuka agen yang digunakan.

> **PENTING (KEPUTUSAN 1):** Agen AI **DILARANG KERAS** menetapkan status `"confirmed"` secara otomatis. Status `"confirmed"` HANYA boleh ditetapkan oleh manusia setelah pengujian nyata pada IDE pengguna.

---

## 1. Latar Belakang & Prinsip Dasar
Nama kakas (seperti `read_file`, `write_file`, `edit_file`, `run_command`, `list_dir`, `view_file`) adalah **data runtime spesifik lingkungan host**, bukan kebenaran absolut yang universal. Lingkungan runtime CLI, IDE extension, dan web interface dapat mengekspos schema kakas yang berbeda.

Oleh karena itu:
- Framework Astesia dalam instruksi keterampilan (*skills*) dan aturan (*rules*) menggunakan **bahasa kapabilitas** (misal: "baca isi berkas", "buat/timpa berkas", "jalankan perintah shell"), tanpa menyebut nama kakas konkret secara spekulatif.
- Pemetaan nama kakas konkret dicatat secara netral di `runtime/tool-map.json`.
- Status kakas terbagi menjadi tiga kategori:
  1. `confirmed`: Telah diuji secara langsung oleh manusia pada IDE dan terbukti berhasil. Wajib memuat `confirmed_by: "human"` dan `evidence_ref`.
  2. `unverified`: Ditemukan dalam deklarasi skema runtime agen atau merupakan sinonim potensial, tetapi belum diverifikasi oleh manusia di IDE pengguna.
  3. `denied`: Nama fiktif yang terbukti halusinasi dan tidak ada pada skema agen (`visual_audit`, `grep_codebase`).

---

## 2. Prosedur Pengujian Oleh Manusia

Untuk setiap kakas yang ingin diverifikasi ke status `confirmed`:

### Langkah 1: Pengujian Baca Berkas
Instruksikan agen di chat IDE:
```text
Coba panggil tool <nama_tool> untuk membaca 5 baris pertama dari file README.md
```
Catat respons agen:
- Jika kakas dieksekusi dan menampilkan isi `README.md`, catat keluaran mentah.
- Jika kakas ditolak oleh host/runtime ("tool not found"), catat pesan kesalahan tersebut.

### Langkah 2: Pengujian Perintah Shell
Instruksikan agen di chat IDE:
```text
Coba panggil tool <nama_tool> untuk menjalankan perintah: echo verification_probe
```
Catat apakah perintah berhasil dijalankan dengan kode keluar 0 dan keluaran teks `verification_probe`.

### Langkah 3: Pengujian Tulis Berkas (Sandbox Terisolasi)
Instruksikan agen di chat IDE:
```text
Coba panggil tool <nama_tool> untuk menulis teks "probe_human" ke file sementara di folder temporer
```
Periksa apakah berkas berhasil dibuat di disk.

---

## 3. Dokumentasi Bukti & Pembaruan `runtime/tool-map.json`

Setelah pengujian manual selesai:

1. Simpan salinan keluaran mentah pengujian ke berkas bukti, misalnya `docs/evidence/tool-verification-<tanggal>.md`.
2. Buka berkas `runtime/tool-map.json`.
3. Pada entri kakas yang bersangkutan, perbarui bidang-bidang berikut:
   ```json
   {
     "name": "read_file",
     "runtime": "antigravity-ide",
     "status": "confirmed",
     "confirmed_by": "human",
     "provenance": "manual-test-on-ide",
     "evidence_ref": "docs/evidence/tool-verification-2026-11-22.md",
     "date": "2026-11-22T00:00:00Z"
   }
   ```
4. Jalankan validasi skema:
   ```bash
   bun tools/framework-lint.ts
   ```
   Linter `FL-019` akan memverifikasi bahwa entri `confirmed` memiliki bukti `confirmed_by: "human"` dan referensi bukti yang valid.
