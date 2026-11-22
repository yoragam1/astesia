# Referensi Resmi Astesia Gate Enforcement (Release Candidate)
*Dokumen ini dihasilkan secara otomatis dari sumber kode `templates/enforcement/astesia-gate.ts` dan `templates/enforcement/anti-patterns.json`. JANGAN SUNTING MANUAL.*

---

## 1. Argumen & Flag CLI Astesia Gate
Astesia gate mendukung opsi dan flag CLI berikut:

| Flag / Opsi | Tipe | Deskripsi Kontrak |
| :--- | :--- | :--- |
| `--allow-raise` | Flag | Mengizinkan kenaikan batas baseline ratchet (wajib disertai `--reason`) |
| `--baseline <path>` | Opsi | Menentukan lokasi berkas baseline ratchet |
| `--check-workflow <path>` | Opsi | Memverifikasi workflow GitHub Actions dari mutasi bypass |
| `--config <path>` | Opsi | Menentukan path ke berkas konfigurasi `gate-config.json` |
| `--json` | Flag | Mengeluarkan laporan analisis dalam format JSON terstruktur |
| `--max-warn <n>` | Opsi | Batas maksimum peringatan (*warning*) sebelum gate gagal (exit 1) |
| `--reason "<text>"` | Opsi | Memberikan alasan wajib saat menaikkan baseline ratchet |
| `--root <dir>` | Opsi | Menentukan direktori akar proyek yang dipindai |
| `--rules <path>` | Opsi | Menentukan berkas aturan anti-pattern (`anti-patterns.json`) |
| `--rules-diff <base> <head>` | Opsi | Membandingkan perubahan dua berkas aturan anti-patterns |
| `--update-baseline` | Flag/Opsi | Merekam pelanggaran saat ini sebagai baseline ratchet baru |

---

## 2. Kebijakan Ratchet & Pembungkaman Inline

### NEVER_BASELINE Rules
Aturan-aturan berikut **DILARANG KERAS** dimasukkan ke dalam baseline ratchet:
```json
[
  "ASTESIA-000",
  "ASTESIA-004",
  "ASTESIA-010"
]
```

### NEVER_INLINE_SUPPRESS Rules
Aturan-aturan berikut **DILARANG KERAS** dibungkam menggunakan komentar inline (misal `astesia-allow`):
```json
[
  "ASTESIA-000",
  "ASTESIA-004",
  "ASTESIA-010",
  "TOKENIZER_DESYNC",
  "LONG_LINE_SKIPPED"
]
```

---

## 3. Registri Aturan Anti-Pattern & Severity

| Rule ID | Severity | Deskripsi Aturan |
| :--- | :--- | :--- |
| `ASTESIA-000` | `error` | undefined |
| `ASTESIA-001` | `error` | undefined |
| `ASTESIA-002` | `error` | undefined |
| `ASTESIA-003` | `error` | undefined |
| `ASTESIA-004` | `error` | undefined |
| `ASTESIA-005` | `warn` | undefined |
| `ASTESIA-006` | `warn` | undefined |
| `ASTESIA-007` | `error` | undefined |
| `ASTESIA-008` | `warn` | undefined |
| `ASTESIA-009` | `warn` | undefined |
| `ASTESIA-010` | `error` | undefined |

---

## 4. Keterbatasan yang Diketahui

Bagian ini mencatat secara jujur batasan teknis dari rilis gate enforcement saat ini:

1. **False positive tinggi pada ASTESIA-000 dan ASTESIA-004:** Pada sebagian struktur proyek nyata tertentu (seperti template blade/markup atau konfigurasi dinamis), deteksi berbasis regex dan parser AST lokal dapat menghasilkan false positive.
2. **Validasi platform baru diverifikasi di Windows:** Pengujian menyeluruh suite enforcement dan benchmark gate baru diverifikasi penuh di lingkungan Windows; eksekusi di Linux dan macOS belum diverifikasi secara independen.
3. **Pemeriksaan workflow bertindak sebagai lint:** Flag `--check-workflow` hanya bertindak sebagai pemeriksaan statis (*lint*); kontributor PR dapat menghapus langkah tersebut dari berkas workflow jika tidak dilindungi oleh `CODEOWNERS` dan *required status check*.
4. **Bypass berkas generated dilewati tokenizer:** Berkas yang terdeteksi sebagai artefak *generated* dilewati oleh parser berbasis tokenizer (bypass terbatas yang dikendalikan ratchet baseline).
5. **Heuristik regex terbatas pada scope fungsi:** Deteksi query database dan pola N+1 menggunakan heuristik regex fungsi lokal, sehingga query yang didelegasikan ke helper lintas fungsi tidak terdeteksi.
