# Changelog

## [v3.1.0-rc1] - 2026-11-22

**Tanggal:** `22 November 2026` · **Kandidat:** `91f47b3` (`91f47b3b5c413afa4bbbd52adfe581f42ac70ae8`) · **Jenis:** pre-release (release candidate)

### Ringkasan

v3.1.0-rc1 menerapkan prinsip bahwa kualitas adalah hilir dari infrastruktur. Kesalahan agen yang berulang tidak lagi hanya dilarang di prosa, tetapi dipindahkan ke penegakan mekanis: gate yang bisa dijalankan di CI, ratchet yang menolak kemunduran, dan pemeriksaan otomatis atas kerangka kerja itu sendiri. Rilis ini juga memangkas beban konteks dan memperkeras pemasangan.

### Yang baru

**Enforcement gate (`astesia-gate.ts`)**

- 11 rule (`ASTESIA-000` sampai `ASTESIA-010`): import fiktif, pelanggaran layer, `SELECT *`, utang teknis tak jelas, rahasia hardcoded di kode, `any` eksplisit, `console.log` dan `debugger`, N+1, workaround tanpa pencatatan, `setTimeout` tak terkendali, dan rahasia di berkas konfigurasi.
- Tokenizer yang sadar komentar dan string, termasuk regex literal satu baris, profil khusus berkas konfigurasi (`.env`, Dockerfile, YAML), dan kebijakan berkas generated yang terhitung.
- Ratchet baseline per (rule, berkas) beserta penghitung (utang, supresi, pengecualian, berkas generated, dan lainnya). Rule rahasia dan import fiktif dirancang tidak bisa di-baseline atau dibungkam inline.
- Allowlist beralasan di `.astesia/gate-config.json` untuk rule rahasia, yang di CI diambil dari base branch sehingga agen tidak bisa membungkam dirinya sendiri.
- `--rules-diff` menolak pelemahan registri aturan, dan `--check-workflow` melakukan lint atas workflow.
- Workflow CI memakai model kepercayaan base-checkout: gate, rules, config, dan baseline dari base branch, kode PR hanya dipindai. Aksi dipin ke SHA dan Bun dipin ke versi persis (`1.3.9`).

**Kerangka kerja**

- Beban boot turun sekitar 25% menurut estimasi internal (11.973 menjadi sekitar 8.972 token; hanya bermakna sebagai perbandingan relatif).
- Skill 53 menjadi 50: empat skill digabung atau dihapus, `property-based-testing` ditambahkan, dan `multi-model-routing` berganti nama menjadi `adversarial-review`. Peta pemindahan ada di `.astesia/audit/wave3a/merge-map.json`.
- Aturan konten tidak tepercaya di `AGENTS.md`, guardrail untuk `dynamic-plugins` dan `reverse-engineering`, dan Quality #12 (property-based testing).
- Nama tool diperlakukan sebagai data runtime: skill memakai bahasa kapabilitas, dan nama konkret hidup di `runtime/tool-map.json` dengan status `confirmed`, `unverified`, atau `denied`. Belum ada nama berstatus `confirmed` sampai Anda menguji di IDE.
- Perkakas pemeriksa kerangka kerja: `framework-lint` (FL-001 sampai FL-020), anggaran token dengan ratchet, `retention-check`, `trigger-proxy --paired`, `report-lint`, dan `docs/GATE-REFERENCE.md` yang dihasilkan dari kode gate. Semuanya dirangkai lewat `bun run check:all`.

**Pemasangan**

- `install.ps1` dan `install.sh` idempoten, punya `-DryRun`, `-Uninstall`, dan penanda kepemilikan, serta kode keluar baku. Tidak ada fallback salin; kegagalan tautan dilaporkan.
- `tools/astesia-init.ts` memasang gate ke proyek brownfield dengan manifes hash. Ia tidak membuat baseline, tidak menimpa konfigurasi atau workflow yang sudah ada tanpa `--force`, dan hanya menaruh `CODEOWNERS.template` di `.astesia/docs/`.

### Perubahan yang berdampak

- Header Doc (Direktif #19) kini satu baris opsional, dan Direktif #22 ditandai dihapus tanpa menggeser penomoran.
- Skill yang digabung atau dihapus: `anti-bloat-audit`, `hybrid-search`, `cost-reducer`, `template-caching`. Rujukan lama harus diperbarui.
- Tidak ada angka keras di prosa: jumlah skill dan aturan dirujuk ke `docs/GENERATED-INVENTORY.md`.
- Adopsi memerlukan tindakan owner: inisialisasi baseline, pengisian pemilik CODEOWNERS, dan required status check.

### Cara memperbarui dari v3.0.0

1. Pasang ulang plugin dengan `install.ps1 -DryRun` terlebih dulu, lalu tanpa `-DryRun`.
2. Di proyek yang sudah memakai gate: `bun tools/astesia-init.ts --target <proyek> --upgrade` (berkas yang Anda ubah dilewati dan dilaporkan).
3. Buat baseline awal hanya setelah gate hijau pada kode bersih, dengan `--update-baseline`.
4. Perbarui rujukan ke skill yang digabung dan nama yang diganti.

### Keterbatasan yang diketahui

1. False positive masih tinggi pada `ASTESIA-000` dan `ASTESIA-004` di sebagian proyek nyata yang diuji (data internal, belum diverifikasi independen).
2. Gate divalidasi di Windows. Perilaku di Linux dan macOS belum diverifikasi, termasuk `ASTESIA-000` pada filesystem case-sensitive.
3. `--check-workflow` hanya lint. PR dapat menghapus langkahnya dari workflow-nya sendiri; perlindungan nyata berasal dari CODEOWNERS dan required status check.
4. Berkas yang dikategorikan generated dilewati rule berbasis tokenizer (hanya prefiks rahasia kuat yang tetap diperiksa), dan ratchet baseline membatasi penyalahgunaannya.
5. Pemeriksaan berbasis regex dan heuristik: N+1 lintas fungsi tidak terdeteksi, dan beberapa konstruksi (mis. markup di luar tag PHP) tercatat sebagai known gap.
6. Nama tool belum dikonfirmasi di IDE, dan proksi trigger hanyalah heuristik leksikal.
7. Gate berupa satu berkas besar (sekitar 3.100 baris); modularisasi direncanakan.
8. Dukungan non-JS/TS (Python, Go, PHP) terutama divalidasi lewat fixture, dengan sedikit proyek nyata.

### Tidak termasuk (sengaja)

Loop runner (host sudah punya `/goal`), penegakan batas modul, dan `astesia-state.ts`. Property-based testing baru berupa skill dan aturan prosa, belum ditegakkan mesin.

### Langkah berikutnya

- Modularisasi gate dengan tes diferensial terhadap keluaran beku.
- Perbaikan false positive `ASTESIA-000` dan `ASTESIA-004` berbasis data pemakaian nyata.
- Verifikasi Linux/macOS dan uji nyata guard di GitHub Actions.
- Keputusan `pull_request_target` dengan model ancaman tertulis.

### Umpan balik

Laporkan false positive dengan format: rule, `file:baris`, kutipan satu baris (rahasia diredaksi), dan kelas yang Anda nilai (TP, FP, NOISE). Data seperti ini adalah bahan utama rilis berikutnya.
