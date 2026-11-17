# Branch Protection & CI Security Guide

Petunjuk konfigurasi repositori GitHub untuk mencegah agen AI atau kontributor melakukan bypass terhadap aturan penegakan Astesia Gate. Konfigurasi ini **TIDAK DAPAT** dilakukan secara otomatis oleh agen dan wajib disetel manual oleh pemilik repositori (Repository Owner).

---

## 1. Pengaturan Wajib di GitHub Repository Settings

Buka **Settings** -> **Branches** -> **Add branch ruleset** (atau **Branch protection rule**) untuk branch `main` (atau target default):

1. **Require status checks to pass before merging:**
   * Aktifkan check wajib untuk status check: `gate` (nama job dari workflow `astesia-gate.workflow.yml`).
   * Aktifkan **"Require branches to be up to date before merging"** (strict branch protection).
2. **Require a pull request before merging:**
   * Aktifkan **"Require review from Code Owners"**.
   * Tetapkan review minimal 1 approval manusia.
3. **Restrict who can push to matching branches:**
   * Larang push langsung ke `main` (semua perubahan wajib melalui Pull Request).
4. **Do not allow bypassing the above settings:**
   * Jangan beri izin bypass, termasuk untuk administrator repositori jika ingin penegakan absolut.
5. **Ruleset Proteksi File Sensitif (`.github/workflows/`):**
   * Buat Ruleset tambahan yang melarang modifikasi berkas di `.github/workflows/**`, `.astesia/enforcement/**`, `.astesia/gate-baseline.json`, `.astesia/gate-config.json` tanpa persetujuan eksplisit dari Code Owner.

---

## 2. Keterbatasan & Realitas Praktis (Jujur & Transparan)

1. **Evaluasi Workflow PR pada GitHub Actions:**
   * Untuk event `pull_request`, GitHub Actions mengeksekusi definisi file workflow dari branch PR. Meskipun PR yang memodifikasi workflow terisolasi di sandbox dengan read-only permissions, integritas workflow sangat bergantung pada **CODEOWNERS** dan **Ruleset**. Tanpa review Code Owner wajib, PR dapat mengubah skrip CI yang dijalankan.
2. **Skenario Pengembang Tunggal (Solo Developer):**
   * GitHub melarang pembuat PR menyetujui (approve) PR-nya sendiri. Jika agen AI bertindak atas nama pengguna atau menggunakan Personal Access Token (PAT) milik pengembang tunggal, agen tidak bisa me-review PR sendiri. Solusi: agen perlu akun bot terpisah (machine user) atau aturan ruleset dengan bypass terkontrol untuk merge manual oleh pemilik.
3. **PR Transisi Pertama (Bootstrapping Friction):**
   * PR pertama yang memperkenalkan flag baru (`--baseline`, `--rules-diff`, `--config`) akan gagal merah di CI jika base branch belum memiliki fitur tersebut di skrip `astesia-gate.ts` versi base. PR bootstrap pertama ini harus di-merge secara sadar oleh pemilik repositori.
4. **Menaikkan Baseline adalah Friksi yang Disengaja:**
   * Saat baseline dinaikkan (`raise` action dengan `--allow-raise`), status CI pada PR akan memerah secara desain (*friction by design*). Tindakan menambah hutang teknis atau menaikkan pelanggaran tidak boleh terjadi secara mulus; pemilik repositori wajib meninjau diff baseline secara sadar sebelum melakukan merge.
