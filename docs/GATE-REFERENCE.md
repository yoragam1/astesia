# Referensi Resmi Astesia Gate Enforcement (Release Candidate)
*Dokumen ini dihasilkan secara otomatis dari sumber kode `templates/enforcement/astesia-gate.ts` dan `templates/enforcement/anti-patterns.json`. JANGAN SUNTING MANUAL.*

---

## 1. Argumen & Flag CLI Astesia Gate
Astesia gate mendukung opsi dan flag CLI berikut:

| Flag / Opsi | Tipe | Deskripsi Kontrak |
| :--- | :--- | :--- |
| `--allow-raise` | Flag | Mengizinkan kenaikan batas baseline ratchet (wajib disertai --reason minimal 15 karakter). |
| `--baseline <path>` | Opsi | Menentukan lokasi berkas baseline ratchet. |
| `--check-workflow <path>` | Opsi | Memverifikasi workflow GitHub Actions dari mutasi bypass. |
| `--config <path>` | Opsi | Menentukan path ke berkas konfigurasi gate-config.json. |
| `--json` | Flag | Mengeluarkan laporan analisis dalam format JSON terstruktur. |
| `--max-warn <n>` | Opsi | Batas maksimum peringatan (warning) sebelum gate gagal (exit 1). |
| `--reason "<text>"` | Opsi | Memberikan alasan wajib saat menaikkan baseline ratchet (minimal 15 karakter). |
| `--root <dir>` | Opsi | Menentukan direktori akar proyek yang dipindai. |
| `--rules <path>` | Opsi | Menentukan berkas aturan anti-pattern (anti-patterns.json). |
| `--rules-diff <base> <head>` | Opsi | Membandingkan perubahan dua berkas aturan anti-patterns. |
| `--update-baseline` | Flag | Merekam pelanggaran saat ini sebagai baseline ratchet baru. |

### Subprocess Arguments (Excluded)
Argumen berikut terdeteksi di dalam kode sumber namun BUKAN bagian dari antarmuka CLI gate:

| Argumen | Lokasi Kode | Keterangan Pengecualian |
| :--- | :--- | :--- |
| `--stdin` | Baris 2464 | Argumen subprocess yang diteruskan ke `git check-ignore -z --stdin` di dalam `classifyEnvFiles`, bukan argumen CLI gate. |

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

### Supported Inline Directives
Hanya direktif inline berikut yang didukung oleh pemindai kode gate:
- `astesia-allow`: Pembungkaman peringatan inline untuk satu baris, wajib disertai alasan yang jelas setelah tanda titik dua.
- `astesia-debt`: Penanda utang teknis untuk satu baris, wajib disertai klausul `upgrade:` konkret.

*Catatan: Direktif penonaktifan menyeluruh tidak didukung oleh Astesia gate.*

---

## 3. Registri Aturan Anti-Pattern & Severity

| Rule ID | Severity | Deskripsi Aturan |
| :--- | :--- | :--- |
| `ASTESIA-000` | `error` | Hallucinated import: relative path or local alias does not exist on disk. |
| `ASTESIA-001` | `error` | Layer breach: controller/route/handler imports an ORM or DB client directly. |
| `ASTESIA-002` | `error` | Unbounded column fetch: SELECT * is banned in production code. |
| `ASTESIA-003` | `error` | astesia-debt marker without an `upgrade:` clause (vague debt). |
| `ASTESIA-004` | `error` | Probable hardcoded secret. |
| `ASTESIA-005` | `warn` | Explicit `any` weakens the type system (Trust Pyramid L1). |
| `ASTESIA-006` | `warn` | console.log in source; use the structured logger. |
| `ASTESIA-007` | `error` | N+1 Database Query: database or repository call executed inside a loop (.map, for, while). |
| `ASTESIA-008` | `warn` | Untracked workaround or hack comment without an astesia-debt tracking marker. |
| `ASTESIA-009` | `warn` | Uncontrolled setTimeout: potential race condition or uncoordinated delay. |
| `ASTESIA-010` | `error` | Hardcoded secret in configuration, Dockerfile, or CI compose file. |

---

## 4. Keterbatasan yang Diketahui

Bagian ini mencatat batasan teknis dari rilis gate enforcement saat ini:

1. **Model Pemindaian Tanpa AST**: Gate menggunakan pemindaian berbasis token karakter kustom, regex per baris, dan penelusuran struktur ringan. Gate TIDAK menggunakan parser berbasis Abstract Syntax Tree (AST) ataupun membentuk representasi pohon sintaksis bahasa secara penuh.
2. **Keterbatasan Evaluasi Statis**: Gate tidak mengevaluasi semantik eksekusi runtime, pengecekan tipe dinamis yang kompleks, pelacakan alur data antar-fungsi, ataupun dependensi pihak ketiga secara interaktif.
3. **Direktif Pembungkaman Inline**: Hanya direktif pembungkaman inline `astesia-allow` (wajib disertai alasan valid) dan penanda utang `astesia-debt` (wajib disertai klausul upgrade konkret) yang didukung. Direktif penonaktifan menyeluruh tidak didukung dalam rancangan gate.
4. **Kebijakan Pengecualian Berkas Generated**: Berkas yang dikenali sebagai artefak buatan generator dikecualikan dari aturan struktur kode umum, namun deteksi rahasia/kredensial dan integritas berkas tetap dipaksakan secara fail-closed.
5. **Integritas Konfigurasi dan Kegagalan Mutlak**: Setiap kegagalan dalam membaca konfigurasi, membaca aturan, atau mendeteksi kerusakan berkas aturan akan menghentikan eksekusi secara langsung (fail-closed dengan kode keluar 2), bukan mengabaikan pemeriksaan atau melanjutkan secara diam-diam.
