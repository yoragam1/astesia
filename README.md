# Astesia Framework v3.1.0-rc1

**Astesia** adalah kerangka kerja *Multi-Layer Autonomous Software Agency & Orchestrator* untuk rekayasa perangkat lunak berbasis agen AI. Versi **v3.1.0-rc1** menerapkan filosofi **Trust Pyramid** dan **Verification-First**: kualitas kode tidak lagi sekadar diimbau melalui instruksi prosa, melainkan ditegakkan secara deterministik melalui *mechanical enforcement gate*, *baseline ratchet*, tata kelola kapabilitas *runtime*, serta rangkaian pengujian mutasi otomatis.

---

## 1. Pilar Utama v3.1.0-rc1

### A. Deterministic Enforcement Gate (`astesia-gate.ts`)
Mesin pemeriksa statis *zero-dependency* berbasis Bun/TypeScript yang memindai repositori secara *fail-closed*:
- **Katalog Aturan Anti-Pattern (`ASTESIA-000` s.d. `ASTESIA-010`)**:
  - `ASTESIA-000` (*error*): *Hallucinated import* (path relatif atau alias lokal `tsconfig` yang tidak ada di disk).
  - `ASTESIA-001` (*error*): *Layer breach* (controller/route/handler mengimpor ORM atau DB client secara langsung).
  - `ASTESIA-002` (*error*): Kueri `SELECT *` tanpa batas kolom di kode produksi.
  - `ASTESIA-003` (*error*): Penanda utang `astesia-debt` tanpa klausul `upgrade:` konkret.
  - `ASTESIA-004` (*error*): Rahasia/kredensial *hardcoded* di kode sumber.
  - `ASTESIA-005` (*warn*): Penggunaan tipe eksplisit `any`.
  - `ASTESIA-006` (*warn*): `console.log` / `debugger` di kode sumber produksi.
  - `ASTESIA-007` (*error*): *N+1 Database Query* di dalam konstruksi perulangan (`.map`, `for`, `while`).
  - `ASTESIA-008` (*warn*): Komentar *workaround/hack/TODO* tanpa pelacakan `astesia-debt`.
  - `ASTESIA-009` (*warn*): `setTimeout` tak terkendali yang berisiko memicu *race condition*.
  - `ASTESIA-010` (*error*): Rahasia/kredensial *hardcoded* di berkas konfigurasi (`.env`, `Dockerfile`, YAML/Compose).
- **Tokenizer Sadar Konteks**: Memisahkan kode, komentar, string literal, dan regex literal satu baris, dilengkapi profil khusus berkas konfigurasi serta kebijakan penghitungan berkas *generated*.
- **Baseline Ratchet & Anti-Self-Suppression**:
  - Mencegah penambahan pelanggaran baru sambil melacak penurunan utang teknis secara bertahap.
  - Aturan kritis (`ASTESIA-000`, `ASTESIA-004`, `ASTESIA-010`) masuk dalam himpunan `NEVER_BASELINE` dan `NEVER_INLINE_SUPPRESS` (tidak dapat dimasukkan ke baseline maupun dibungkam inline).
  - Model CI *Base-Checkout Trust*: workflow GitHub Actions mengambil skrip gate, aturan, konfigurasi allowlist, dan baseline dari *base branch* sehingga PR agen tidak dapat melemahkan aturan untuk meloloskan kodenya sendiri.

### B. 5-Layer SDLC Governance & Progressive Disclosure
Astesia mengatur eksekusi agen melalui 5 lapisan berurutan (**Product → Design → Engineering → Quality → DevOps**):
- **Pemangkasan Beban Konteks Boot (~25%)**: Beban token inisialisasi (*boot set*) dipangkas dari `11.973` menjadi `8.972` token (di bawah batas ratchet `8.976` token) melalui konsolidasi aturan dan pemuatan skill secara *progressive disclosure* lewat `runtime/context-map.json`.
- **Tata Kelola Nama Tool Runtime (`runtime/tool-map.json`)**: Aturan dan skill menggunakan frasa kapabilitas fungsional (bukan tebakan nama tool). Identitas tool konkret dikelola sebagai data runtime dengan status `confirmed`, `unverified`, atau `denied`.
- **Guardrail Konten Tak Tepercaya & Skill Berisiko**: Penegakan batas instruksi vs data pada `rules/AGENTS.md` serta guardrail wajib pada skill berisiko tinggi (`dynamic-plugins`, `reverse-engineering`).

### C. Self-Verifying Framework Tooling
Kerangka kerja Astesia memeriksa integritas dirinya sendiri secara mekanis:
- **`framework-lint.ts` (`FL-001` s.d. `FL-020`)**: Memeriksa struktur frontmatter skill, konsistensi indeks & `context-map.json`, tautan markdown, nomor direktif/stage, tata kelola tool, sinkronisasi `docs/GATE-REFERENCE.md` terhadap kode gate, anggaran token, dan keselarasan versi.
- **`report-lint.ts` (`RL-001` s.d. `RL-005`)**: Linter mekanis atas laporan audit agen yang menolak klaim hiperbolis tanpa bukti, mewajibkan struktur 7 bab standar termasuk deklarasi `UNVERIFIABLE`, serta memverifikasi keberadaan berkas artefak di disk dan hash commit di database Git.

---

## 2. Instalasi Plugin (Live Mode)

Untuk memasang Astesia ke direktori plugin Antigravity (`~/.gemini/antigravity/plugins/astesia`) menggunakan tautan direktori (*junction* di Windows tanpa perlu hak Administrator, atau *symlink* di POSIX) tanpa fallback penyalinan diam-diam:

### A. Windows (PowerShell 5.1+)
```powershell
# Pratinjau instalasi (tanpa menyentuh disk)
.\install.ps1 -DryRun

# Instalasi langsung
.\install.ps1
```
Opsi `install.ps1`:
- `-Target <path>`: Menentukan direktori tujuan khusus.
- `-DryRun`: Menampilkan rencana perubahan tanpa memodifikasi disk.
- `-Uninstall`: Menghapus instalasi plugin secara aman (memeriksa penanda kepemilikan `.astesia-install.json`).
- `-Force`: Mencadangkan direktori asing yang berkonflik ke `.bak-<timestamp>` sebelum memasang.

### B. POSIX (Linux / macOS / WSL)
```bash
# Pratinjau instalasi
./install.sh --dry-run

# Instalasi langsung
./install.sh
```
Opsi `install.sh`: `--target <path>`, `--dry-run`, `--uninstall`, `--force`.

### Kode Keluar Baku Installer
| Kode | Arti |
| :--- | :--- |
| `0` | Sukses atau kondisi sudah terpasang (*idempotent*) |
| `2` | Argumen CLI tidak valid atau target berada di dalam repositori sumber Astesia |
| `3` | Penolakan `-Uninstall` karena target bukan milik Astesia / penanda rusak |
| `4` | Konflik direktori asing saat instalasi tanpa `-Force` / `--force` |
| `5` | Kegagalan verifikasi pasca-instalasi (otomatis *rollback* berkas buatan installer) |
| `6` | Kegagalan I/O pembuatan tautan *junction/symlink* (otomatis *rollback*, tanpa *copy fallback*) |

Detail verifikasi instalasi: [docs/INSTALL-VERIFICATION.md](docs/INSTALL-VERIFICATION.md).

---

## 3. Inisialisasi Gate pada Proyek Brownfield (`astesia-init.ts`)

Untuk memasang Astesia Gate beserta workflow CI dan template tata kelola ke repositori proyek yang sudah ada:

```bash
# Pratinjau berkas yang akan dipasang
bun tools/astesia-init.ts --target /path/ke/proyek --dry-run

# Pemasangan ke proyek target
bun tools/astesia-init.ts --target /path/ke/proyek
```

Berkas yang dipasang pada proyek target:
- `.astesia/enforcement/astesia-gate.ts`
- `.astesia/enforcement/anti-patterns.json`
- `.astesia/gate-config.json`
- `.github/workflows/astesia-gate.yml`
- `.astesia/docs/CODEOWNERS.template`
- `.astesia/docs/BRANCH-PROTECTION.md`
- `.astesia/install-manifest.json` (pelacak hash SHA-256 berkas terpasang)

Opsi `astesia-init.ts`:
- `--dry-run`: Pratinjau aksi tanpa menulis ke disk.
- `--upgrade`: Memperbarui berkas gate dan aturan yang belum dimodifikasi pengguna, sambil **mempertahankan** konfigurasi lokal (`.astesia/gate-config.json`) yang sudah Anda sesuaikan.
- `--uninstall`: Menghapus berkas gate yang tidak dimodifikasi dan mempertahankan berkas yang telah diubah pengguna.
- `--force`: Menimpa konfigurasi/workflow yang sudah ada (mencadangkan workflow lama ke `.bak-<timestamp>`).

---

## 4. Menjalankan Pemeriksaan & Pengujian

Pastikan Anda menggunakan **Bun `1.3.9`** (sesuai versi yang dipin pada workflow CI).

### Pemeriksaan Kesehatan Kerangka Kerja Menyeluruh
```bash
bun run check:all
```
Perintah di atas menjalankan 4 pemeriksaan secara berurutan:
1. `bun run lint:framework` — Framework Linter (`FL-001` s.d. `FL-020`).
2. `bun run test:tools` — Unified Tools Test Runner (**258 kasus uji & mutasi** pada 7 suite: Rules, Linter Mutation, Retention, Installer, Brownfield Init, Gate Reference Contract, dan Report Linter).
3. `bun run check:budget` — Verifikasi batas anggaran token *boot set* (`8.972 / 8.976` token).
4. `bun run check:manifest` — Verifikasi integritas SHA-256 manifes audit (`.astesia/audit/*/MANIFEST.json`).

### Pemeriksaan Self-Gate & Rangkaian Uji Gate Enforcement
```bash
# Menjalankan Astesia Gate terhadap kode repositori Astesia sendiri (0 error, 0 warning)
bun templates/enforcement/astesia-gate.ts --root . --rules templates/enforcement/anti-patterns.json --max-warn 0

# Menjalankan seluruh suite pengujian & mutasi gate enforcement (1.121 kasus uji, 73 mutan)
bun templates/enforcement/tests/all.ts
```

---

## 5. Struktur Direktori & Referensi Dokumentasi

```text
Astesia/
├── rules/                      # Aturan global & 5-Layer SDLC (AGENTS, product, design, engineering, quality, devops)
├── skills/                     # Katalog skill modular & skills-index.md
├── runtime/                    # Boot sequence, context-map.json, tool-map.json, token-budget.json
├── templates/enforcement/      # Mesin astesia-gate.ts, anti-patterns.json, template CI workflow, & test suites
├── tools/                      # Perkakas framework (framework-lint, astesia-init, report-lint, token-budget, dll.)
├── docs/                       # Dokumentasi arsitektur, kontrak referensi gate, & inventaris otomatis
├── install.ps1 / install.sh    # Installer plugin idempoten untuk Windows & POSIX
└── CHANGELOG.md                # Catatan rilis resmi v3.1.0-rc1
```

### Indeks Dokumentasi Utama
- **Catatan Rilis v3.1.0-rc1**: [CHANGELOG.md](CHANGELOG.md)
- **Referensi Kontrak CLI & Aturan Gate (Otomatis dari Kode)**: [docs/GATE-REFERENCE.md](docs/GATE-REFERENCE.md)
- **Inventaris Skill, Aturan, & Anggaran Token (Otomatis)**: [docs/GENERATED-INVENTORY.md](docs/GENERATED-INVENTORY.md)
- **Protokol Verifikasi Nama Tool Runtime**: [docs/TOOL-VERIFICATION.md](docs/TOOL-VERIFICATION.md)
- **Verifikasi Installer & Matriks Kode Keluar**: [docs/INSTALL-VERIFICATION.md](docs/INSTALL-VERIFICATION.md)
- **Panduan Operasi Agen & Arsitektur**: [docs/agent-operating-guide.md](docs/agent-operating-guide.md) & [docs/architecture.md](docs/architecture.md)
