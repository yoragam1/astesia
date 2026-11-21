# Astesia Framework v3.0.0 — Dokumen Referensi & Dossier Audit Lengkap

**Versi Framework:** `3.0.0`  
**Status Git Terakhir:** `c0e253e` (`main`)  
**Lokasi Workspace:** `D:\Workspaces\Astesia`

Dokumen ini disusun sebagai panduan referensi menyeluruh sekaligus lembar kerja audit (*Audit Dossier*) untuk memeriksa arsitektur, alur kerja, sistem aturan, mesin verifikasi deterministik, dan katalog skill native (lihat docs/GENERATED-INVENTORY.md) pada **Astesia Framework v3.0.0**.

---

## 1. Identitas, Filosofi & Struktur Direktori

**Astesia** adalah *Multi-Layer Autonomous Software Agency Framework* yang beroperasi sebagai plugin native di atas Google Antigravity ([plugin.json](file:///D:/Workspaces/Astesia/plugin.json), [package.json](file:///D:/Workspaces/Astesia/package.json)). Astesia mencegah perilaku AI yang langsung menulis kode mentah tanpa perencanaan (*Anti Rush-to-Code*) dan menegakkan kualitas kode melalui pendekatan **Verification-First (Trust Pyramid)**.

### Struktur Direktori Utama
```text
D:\Workspaces\Astesia\
├── plugin.json                              # Manifest plugin Google Antigravity (v3.0.0)
├── package.json                             # Metadata paket (astesia-os v3.0.0)
├── install.ps1 / install.sh                 # Installer Live-Mode (junction skills/ & rules/)
├── docs/
│   ├── astesia-persona.md                   # Identitas & temperamen Direktur Agensi
│   ├── astesia-overview.md                  # Gambaran arsitektur 5 layer & matriks keputusan
│   ├── agent-operating-guide.md             # SOP operasional agen (Step 1 s.d. Step 8)
│   └── astesia-audit-dossier.md             # Dokumen referensi & audit ini
├── runtime/
│   ├── boot-sequence.md                     # Prosedur inisialisasi agen (Boot Stage 1 - 5)
│   └── context-map.json                     # Pemetaan skill ke masing-masing layer
├── rules/
│   ├── AGENTS.md                            # Titik masuk aturan global plugin & 4 Mode Operasi
│   ├── coding-standards.md                  # Standar format, TypeScript strict, import & error
│   ├── product-rules.md                     # aturan Layer 1 (Product) (lihat docs/GENERATED-INVENTORY.md)
│   ├── design-rules.md                      # aturan Layer 2 (Design) (lihat docs/GENERATED-INVENTORY.md)
│   ├── engineering-rules.md                 # direktif struktural Layer 3 (Engineering) (lihat docs/GENERATED-INVENTORY.md)
│   ├── quality-rules.md                     # aturan audit & verifikasi Layer 4 (Quality) (lihat docs/GENERATED-INVENTORY.md)
│   └── devops-rules.md                      # aturan infrastruktur & merge Layer 5 (DevOps) (lihat docs/GENERATED-INVENTORY.md)
├── workflows/
│   ├── phase1-product.md                    # Checklist eksekusi fase Product
│   ├── phase2-design.md                     # Checklist eksekusi fase Design
│   ├── phase3-engineering.md                # Checklist eksekusi fase Engineering (Task Waves)
│   ├── phase4-quality.md                    # Checklist eksekusi fase Quality & Gate
│   └── phase5-devops.md                     # Checklist eksekusi fase DevOps & CI
├── templates/
│   ├── astesia-state-template.json          # Skema state machine (.astesia/astesia-state.json)
│   ├── brd-template.md                      # Template Business Requirements Document
│   ├── design-system-template.md            # Template Design Tokens & UI Specs
│   ├── architecture-template.md             # Template Blueprint Arsitektur & ADR
│   ├── system-map-template.md               # Template Peta Navigasi Codebase (Brownfield)
│   ├── qa-test-plan-template.md             # Template Rencana & Laporan Audit QA
│   ├── deployment-template.md               # Template Dokumentasi Deployment
│   └── enforcement/
│       ├── astesia-gate.ts                  # Mesin pemeriksa deterministik (Layer 2 Trust Pyramid)
│       ├── anti-patterns.json               # Registri aturan anti-pattern (append-only)
│       └── astesia-gate.workflow.yml        # Template GitHub Actions CI (rebased-head check)
└── skills/
    ├── SKILL-TEMPLATE.md                    # Standar pembuatan skill baru
    ├── skills-index.md                      # Indeks katalog skill (lihat docs/GENERATED-INVENTORY.md)
    └── <folder skill>/SKILL.md           # Skill native Antigravity (Progressive Disclosure)
```

### Tiga Dokumen Fondasi (`docs/`)
1. **[astesia-persona.md](file:///D:/Workspaces/Astesia/docs/astesia-persona.md):** Menetapkan 4 pilar kepribadian agen:
   * *Baseline (The Polymath Architect):* Penyelarasan bisnis–desain–teknis–kualitas–infra, pemisahan layer ketat, anti *rush-to-code*, serta efisiensi token.
   * *Critique (The Honest Partner & Agency Director):* Bukan *yes-man*; wajib mengevaluasi asumsi, memaparkan *trade-off*, menolak permintaan kabur, adaptif terhadap proyek legacy (*brownfield*), dan menuntut *testability*.
   * *Bias (Quality over Speed):* Lebih takut *technical debt* daripada lambat; membenci abstraksi berlebih (*over-engineering*).
   * *Temperament:* Tajam namun objektif, tidak defensif, mampu mengoreksi diri (*self-correcting*), presisi tinggi (TDD), dan ekstra ringkas (*extreme conciseness*).
2. **[astesia-overview.md](file:///D:/Workspaces/Astesia/docs/astesia-overview.md):** Memuat prinsip inti, definisi 5 layer kognitif, matriks *trade-off* (*Monolith vs Microservices*, *SSR vs CSR*), rekomendasi *default stack* (Bun/Elysia/Hono/Go, Drizzle ORM, PostgreSQL, SvelteKit/Vue, Docker Compose), strategi *scaling* 3 fase (0–1K, 1K–50K, 50K+ user), serta kontrak direktori `.astesia/`.
3. **[agent-operating-guide.md](file:///D:/Workspaces/Astesia/docs/agent-operating-guide.md):** Mengatur 8 langkah operasi agen:
   * *Step 1:* Intersepsi Slash Command (`/astesia-init`, `/astesia-product`, `/astesia-product-audit`, `/astesia-design`, `/astesia-engineering`, `/astesia-quality`, `/astesia-devops`).
   * *Step 1.5:* Klasifikasi skill otomatis & pencatatan ke `active_skills[]`.
   * *Step 2:* Pemuatan aturan layer & verifikasi state (`blocking_issues[]`, `completed_artifacts[]`, `retry_count`).
   * *Step 2.5:* RAG Memory & Semantic Context untuk codebase $>50$ file.
   * *Step 3:* Orkestrasi *Three Brains* (*Planner → Parallel Executors → QA Auditor*) & transisi otomatis antar-fase.
   * *Step 4:* Pemisahan tanggung jawab (*Separation of Concerns*) antar-layer.
   * *Step 5:* *Pre-Handoff Self-Correction Audit* (maksimal 2 siklus koreksi internal).
   * *Step 6:* *Error Recovery & Infinite Loop Protection* (Git Auto-Snapshot, Hash Convergence Guard, batas 3 retry, Auto-Rollback, dan *Anti-Silent Failure Protocol*).
   * *Step 7:* *Extreme Token Efficiency* (Dynamic Skill Pruning, Output Scope Control, Targeted Reading untuk file $>500$ baris).
   * *Step 8:* *Verification-First Principle & Trust Pyramid*.

---

## 2. Alur Inisialisasi (Boot Sequence) & 4 Mode Operasi

```mermaid
flowchart TD
    A["User Request / Slash Command"] --> B["Boot Stage 1: Load Core Docs"]
    B --> C["Boot Stage 1.5: Auto Skill Classification"]
    C --> D["Boot Stage 2: Read .astesia/astesia-state.json"]
    D --> E{"Proyek Brownfield?"}
    E -- "Ya (Tanpa .astesia/)" --> F["Boot Stage 2.5: Brownfield Entry & system-map.md"]
    E -- "Tidak (Greenfield)" --> G["Boot Stage 2.7: Enforcement Bootstrap (astesia-gate)"]
    F --> G
    G --> H["Boot Stage 3 & 4: Load Layer Rules & Navigation Map"]
    H --> I{"Ada blocking_issues / failed?"}
    I -- "Ya" --> J["Boot Stage 4.5: Self-Healing Remediation Mode"]
    I -- "Tidak" --> K["Boot Stage 5: Handoff ke Workflow Fase Aktif"]
```

### Empat Mode Operasi ([AGENTS.md](file:///D:/Workspaces/Astesia/rules/AGENTS.md))
| Mode | Skenario Penggunaan | Urutan Alur Eksekusi |
|---|---|---|
| **Mode A: Full Lifecycle** | Proyek Greenfield Full-Stack (Web/Mobile + Backend) | `Product (L1) → Design (L2) → Engineering (L3) → Quality (L4) → DevOps (L5)` |
| **ModeB: Headless / Backend-First** | REST API, CLI, Microservice, Library (tanpa UI) | `Product (L1) → Engineering (L3) → Quality (L4) → DevOps (L5)` *(Design dilewati)* |
| **Mode C: Surgical / Hotfix** | Perbaikan bug spesifik atau perubahan terisolasi pada proyek Brownfield | `Blast Radius → TDD Unit Test → Minimalist Fix → Verification Gate → Merge Check` |
| **Mode D: Audit & Gardening** | Pembersihan technical debt, peningkatan aturan lint, atau refactoring | `Debt Scanner + Astesia Gate → Codebase Gardening Wave → Ratchet Rules` |

---

## 3. Rincian 5 Layer Kognitif, Aturan, Workflow & Kontrak `.astesia/`

Setiap proyek yang dikelola Astesia wajib memiliki direktori `.astesia/` dengan state yang mengikuti [astesia-state-template.json](file:///D:/Workspaces/Astesia/templates/astesia-state-template.json).

### Layer 1: Product / Business Layer
* **Peran:** Product Manager (PM) & Business Analyst (BA)
* **Berkas:** [product-rules.md](file:///D:/Workspaces/Astesia/rules/product-rules.md) | [phase1-product.md](file:///D:/Workspaces/Astesia/workflows/phase1-product.md) | [brd-template.md](file:///D:/Workspaces/Astesia/templates/brd-template.md)
* **Output Artefak:** `.astesia/brd.md`
* **Aturan Utama (lihat docs/GENERATED-INVENTORY.md):**
  1. Dilarang menulis detail implementasi (kode, SQL, CSS).
  2. Wajib menyertakan *Acceptance Criteria* yang dapat diuji untuk setiap fitur.
  3. Wajib mendefinisikan bagian *Explicit Out-of-Scope* untuk mencegah halusinasi fitur di layer Engineering.
  4. Wajib mendokumentasikan *Edge Cases & Negative Flows* (bukan hanya *happy path*).
  5. **Minimum BRD Acceptance Threshold:** BRD dilarang diserahkan ke layer berikutnya jika belum memiliki Executive Summary, Tabel Target Users & Permission, Fitur Inti + Business Rules + AC + Edge Cases, minimal 1 *Critical User Journey (CUJ)*, *Non-Functional Requirements* (Performa & Keamanan), dan *Out-of-Scope*.
  6. **Product Audit Trigger (`/astesia-product-audit`):** Wajib dijalankan jika manusia memodifikasi BRD untuk mendeteksi *scope creep* atau kontradiksi.

### Layer 2: Design Layer
* **Peran:** UI/UX Designer & Design Systems Architect
* **Berkas:** [design-rules.md](file:///D:/Workspaces/Astesia/rules/design-rules.md) | [phase2-design.md](file:///D:/Workspaces/Astesia/workflows/phase2-design.md) | [design-system-template.md](file:///D:/Workspaces/Astesia/templates/design-system-template.md)
* **Output Artefak:** `.astesia/design-system.md`
* **Aturan Utama (lihat docs/GENERATED-INVENTORY.md):**
  1. *Abstract Tokens First:* Definisi warna (HSL/CSS variables), tipografi, skala spasi (basis 4px), radius, dan bayangan sebelum menyentuh komponen. Dilarang menggunakan hex statis secara acak.
  2. Dilarang mencampur logika bisnis atau skema database ke dalam spesifikasi desain.
  3. Standar aksesibilitas **WCAG AA** wajib terpenuhi untuk kontras warna, ditambah state fokus pada seluruh elemen interaktif.
  4. *Multimodal Visual Inspiration:* Mengekstrak palet warna dan tipografi dari lampiran screenshot atau referensi Figma menjadi Design Tokens.
  5. Format keluaran wajib siap pakai oleh Engineering (variabel CSS, konfigurasi Tailwind, atau JSON token) lengkap dengan state komponen (`default`, `hover`, `focus`, `active`, `disabled`, `loading`, `empty`, `error`).

### Layer 3: Engineering Layer
* **Peran:** Software Architect, Backend Engineer, Frontend Engineer
* **Berkas:** [engineering-rules.md](file:///D:/Workspaces/Astesia/rules/engineering-rules.md) | [coding-standards.md](file:///D:/Workspaces/Astesia/rules/coding-standards.md) | [phase3-engineering.md](file:///D:/Workspaces/Astesia/workflows/phase3-engineering.md) | [architecture-template.md](file:///D:/Workspaces/Astesia/templates/architecture-template.md) | [system-map-template.md](file:///D:/Workspaces/Astesia/templates/system-map-template.md)
* **Output Artefak:** `.astesia/architecture.md`, `.astesia/system-map.md` (brownfield), dan kode sumber di `src/`
* **Standar Kode ([coding-standards.md](file:///D:/Workspaces/Astesia/rules/coding-standards.md)):** Indentasi 2 spasi, panjang baris 80–100 karakter, titik koma wajib, kutip tunggal (`'`), TypeScript `strict: true`, larangan tipe `any` (gunakan `unknown` + narrowing), tipe kembalian eksplisit, urutan import terstandarisasi, *named exports* diutamakan di atas `export default`, larangan meninggalkan `console.log`/`debugger`, serta penggunaan *typed error classes*.
* **Direktif Struktural (lihat docs/GENERATED-INVENTORY.md) ([engineering-rules.md](file:///D:/Workspaces/Astesia/rules/engineering-rules.md)):**
  * **#1 & #1.5:** Layered Architecture (`API/Controller → Service → Repository`) dengan *Adaptive Legacy Fallback* untuk proyek brownfield, serta pemisahan ketat UI dari logika *data fetching* di frontend.
  * **#2–#12:** *Single Responsibility*, *Thin Controllers*, penanganan error terstruktur, penamaan deskriptif, desain modular per domain, isolasi framework HTTP di layer API, akses DB wajib melalui Repository, kesederhanaan di atas trik rumit, pencatatan ADR, dekomposisi tugas (`DB → Service → API`), dan strategi modifikasi aman (*add, don't break*).
  * **#13–#18:** Verifikasi keberadaan file sebelum baca/edit, larangan halusinasi import, isolasi dokumen di `.astesia/`, prinsip *immutability*, **Shift-Left TDD wajib** (RED–GREEN–REFACTOR dengan unit test coverage $\ge 80\%$), validasi skema input di batas aplikasi (Zod) tanpa hardcoded secret, serta Conventional Commits.
  * **#19 (Header Doc):** Setiap file kode sumber disarankan memiliki 1 baris header ringkas (`// Purpose: ...`); format 5 field dihapus pada v3.0.1 untuk mencegah desinkronisasi dokumentasi dan pemborosan token.
  * **#20 (RAG Memory & Navigasi):** Untuk file $>500$ baris, baca tanda tangan AST atau blok fungsi terkait saja; wajib membaca `.astesia/system-map.md` dan melakukan *trace-by-flow* (`Entrypoint → Handler → Service → Repository → DB`).
  * **#21 (DBA-Grade Performance):** Evaluasi penggunaan indeks, kardinalitas, urutan join; larangan keras N+1 query dan `SELECT *`; utamakan operasi batch dan *upsert*.
  * **#22:** *(Dihapus pada v3.0.1)* Sebelumnya mengatur Pre-Edit Trace Note; dihapus karena berlebih dan bertentangan dengan alur task batch di Operating Guide Step 7.2.
  * **#23 (Zero-Downtime Migration):** Perubahan skema DB destruktif dilarang dilakukan dalam satu langkah; wajib menggunakan pola *Expand and Contract*.
  * **#24 (Pre-Handoff Self-Correction Audit):** Pemeriksaan mandiri sebelum menyerahkan artefak (maksimal 2 siklus koreksi internal).
  * **#25 (Polyglot Architecture Check):** Verifikasi kompilasi otomatis pasca-edit (`tsc --noEmit`, `cargo check`, `go vet`, `mypy`) dengan maksimal 3 retry.
  * **#26 (Concurrent File-Lock Safety):** Subagent paralel dilarang menulis ke file yang sama secara bersamaan.
  * **#27 (Auto-Snapshots & Hash Convergence Guard):** Wajib mengambil snapshot Git sebelum gelombang tugas paralel dan menghentikan siklus jika hash output identik berturut-turut.
  * **#28 (Minimalist Execution / YAGNI):** Menaiki *Minimalist Ladder* (apakah benar-benar dibutuhkan? sudah ada helper di codebase? bisa dengan stdlib? bisa dengan fitur native platform? bisa 1 baris?).
  * **#29 (Trust Pyramid):** Aturan ditegakkan melalui tipe & struktur (L1), lalu registri `.astesia/anti-patterns.json` (L2); wajib lolos `astesia-gate.ts` (exit 0) dan diverifikasi oleh Verifier independen.

### Layer 4: Quality Layer
* **Peran:** QA Auditor, Security Reviewer & Verifier Independen
* **Berkas:** [quality-rules.md](file:///D:/Workspaces/Astesia/rules/quality-rules.md) | [phase4-quality.md](file:///D:/Workspaces/Astesia/workflows/phase4-quality.md) | [qa-test-plan-template.md](file:///D:/Workspaces/Astesia/templates/qa-test-plan-template.md)
* **Output Artefak:** `.astesia/qa-test-plan.md`, `.astesia/verification/*.md`, serta pengujian integrasi/E2E di `tests/`
* **Aturan Utama (lihat docs/GENERATED-INVENTORY.md):**
  1. Verifikasi independen atas unit test Engineering serta penulisan Integration & E2E test.
  2. *Strict Traceability:* Setiap tes wajib memetakan kembali ke Acceptance Criterion spesifik di `brd.md`.
  3. *Security Checkpoint:* Menggagalkan pipeline seketika jika ditemukan SQLi, XSS, CSRF, token terekspos, atau ketiadaan validasi input.
  4. *Minimum Coverage Hard-Stop:* Coverage minimal 80%; modul yang sulit diuji ditandai sebagai *Tightly Coupled* untuk direfaktor.
  5. *Documentation Sync Audit:* Memastikan `system-map.md` dan `architecture.md` sinkron dengan kode aktual.
  6. *Database Performance Audit:* Memeriksa N+1 query, `SELECT *`, operasi batch, dan indeks.
  7. *Automated Architectural Linter:* Menolak pelanggaran layer, N+1, dan import fiktif.
  8. *Anti-Bloat Code Deletion:* Mencari kode untuk dihapus menggunakan tag `delete:`, `stdlib:`, `native:`, `yagni:`, dan `shrink:`.
  9. *Deterministic Gate Ownership:* Pemilik tunggal `.astesia/anti-patterns.json`; wajib menjalankan `astesia-gate.ts` pada head yang telah di-rebase.
  10. *Mistake-to-Rule Ratchet:* Setiap kegagalan berpola atau berulang 2 kali wajib dikonversi menjadi aturan baru yang teruji di `.astesia/anti-patterns.json`.
  11. *Independent Verification & Evidence:* Verifikasi wajib dilakukan oleh subagent terpisah, menjalankan aplikasi secara nyata (*behavioral run*), dan menulis bukti ke `.astesia/verification/<id>.md`. Maksimal 3 kegagalan sebelum pipeline dihentikan (`status: "halted"`) untuk eskalasi manusia.

### Layer 5: DevOps / Infrastructure Layer
* **Peran:** DevOps & Release Engineer
* **Berkas:** [devops-rules.md](file:///D:/Workspaces/Astesia/rules/devops-rules.md) | [phase5-devops.md](file:///D:/Workspaces/Astesia/workflows/phase5-devops.md) | [deployment-template.md](file:///D:/Workspaces/Astesia/templates/deployment-template.md)
* **Output Artefak:** `.astesia/deployment.md`, `Dockerfile`, `docker-compose.dev.yml`, `docker-compose.prod.yml`, `.github/workflows/ci.yml`, `.github/workflows/astesia-gate.yml`, `.env.example`
* **Aturan Utama (lihat docs/GENERATED-INVENTORY.md):**
  1. *Immutable Infrastructure:* Seluruh konfigurasi harus deklaratif.
  2. *Security First (Least Privilege):* Container wajib berjalan sebagai non-root user (`appuser`) dan bebas dari kredensial statis.
  3. *Pre-Requisite Checks:* Dilarang menjalankan deployment jika Quality Layer belum berstatus `done`.
  4. *Mandatory Observability:* Logging terstruktur (Pino) dan metrik (Prometheus) wajib dikonfigurasi.
  5. *Earned Merge Authority:* `enforcement.auto_merge` secara default bernilai `false` (`merge_mode: "manual"`). Kenaikan ke `shadow` lalu `auto-merge` memerlukan $\ge 20$ PR berturut-turut yang selaras dengan penilaian manusia tanpa revert, dan otomatis mati jika `revert_rate` $> 2\%$ dalam 50 merge terakhir.

---

## 4. Mesin Penegakan Deterministik (Verification-First Engine)

```mermaid
flowchart LR
    subgraph L1["L1: Types & Architecture"]
        T1["Strict TypeScript / Zod Schemas"]
        T2["Layered Module Boundaries"]
    end
    subgraph L2["L2: Deterministic Gate & CI"]
        G1["astesia-gate.ts + anti-patterns.json"]
        G2["Unit / Integration / E2E + Coverage >= 80%"]
        G3["Rebased-Head GitHub Actions Workflow"]
    end
    subgraph L3["L3: Prose Rules"]
        P1["rules/*.md & SKILL.md (Judgment Only)"]
    end
    subgraph L4["L4: Human Oversight"]
        H1["Post-Merge Sampling (10%) & High-Risk Paths"]
    end
    L1 --> L2 --> L3 --> L4
```

### Registri Aturan Mesin Saat Ini ([anti-patterns.json](file:///D:/Workspaces/Astesia/templates/enforcement/anti-patterns.json) & [astesia-gate.ts](file:///D:/Workspaces/Astesia/templates/enforcement/astesia-gate.ts))

| ID Aturan | Jenis Pemeriksa (`kind`) | Severity | Deskripsi Pelanggaran | Cakupan File |
|---|---|---|---|---|
| `ASTESIA-000` | `relative-import-exists` | `error` | **Hallucinated Import:** Path import relatif (`./`, `../`, `@/`) tidak ditemukan di disk (mendukung `.ts`, `.tsx`, `.svelte`, `.vue`, `.d.ts`, dll.). | `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.svelte`, `.vue` |
| `ASTESIA-001` | `line-regex` | `error` | **Layer Breach:** File controller/route/handler mengimpor ORM/DB client langsung (`drizzle-orm`, `@prisma/client`, `typeorm`, `pg`, `mysql2`, `postgres`, `bun:sqlite`, atau alias `as db`). | Path cocok `(controller\|route\|handler)s?` |
| `ASTESIA-002` | `line-regex` | `error` | **Unbounded Fetch:** Penggunaan `SELECT *`, `table.*`, atau `.select()` tanpa kolom spesifik di kode produksi (mendukung template literal multi-baris). | Semua file sumber kecuali `.test.`, `.spec.`, dan `migrations/` |
| `ASTESIA-003` | `line-regex` | `error` | **Vague Tech Debt:** Komentar `astesia-debt:` ditulis tanpa alasan valid atau klausa `upgrade:` non-kosong (mendukung block comment multi-baris). | Komentar pada semua file sumber |
| `ASTESIA-004` | `line-regex` | `error` | **Hardcoded Secret:** Penugasan variabel credential/token/password atau fallback `process.env.X ?? 'literal'` dengan string $\ge 12$ karakter ber-entropy tinggi. | Semua file sumber kecuali test, `.example`, dan `fixtures/` |
| `ASTESIA-005` | `line-regex` | `warn` | **Explicit `any`:** Penggunaan `: any`, `as any`, `= any`, `<any>`, `Record<string, any>`, atau `Promise<any>`. | `.ts`, `.tsx`, `.svelte`, `.vue` (kecuali test dan `.d.ts`) |
| `ASTESIA-006` | `line-regex` | `warn` | **Raw `console.log`:** Penggunaan `console.log(`, `console.debug(`, `console.info(`, atau `debugger;` di luar skrip/pengujian. | Semua file sumber kecuali test dan `scripts/` |
| `ASTESIA-007` | `nested-loop-call` | `error` | **N+1 Database Query:** Pemanggilan DB/repository di dalam blok perulangan (`for`, `while`, `.map(`, `.forEach(`), mendukung Python indentation dan nama repository camelCase. | Semua file sumber kecuali test |
| `ASTESIA-008` | `line-regex` | `warn` | **Untracked Workaround:** Komentar `TODO`, `FIXME`, `HACK`, `WORKAROUND`, `FOR NOW`, atau `TEMPORARY FIX` yang tidak dilacak dengan marker `astesia-debt:`. | Komentar pada semua file sumber |
| `ASTESIA-009` | `line-regex` | `warn` | **Uncontrolled setTimeout:** Penggunaan `setTimeout(` sembarangan di luar test atau modul debounce/throttle. | Semua file sumber kecuali test dan utilitas debounce/throttle |
| `ASTESIA-010` | `line-regex` | `error` | **Config Hardcoded Secret:** Password atau token statis di dalam file Dockerfile atau docker-compose/env CI (tanpa `${ENV_VAR}`). | File Dockerfile, docker-compose, CI YAML, dan .env |

* **Cara Menjalankan Gate:**
  ```bash
  bun .astesia/enforcement/astesia-gate.ts [--root .] [--rules .astesia/anti-patterns.json] [--json] [--max-warn N]
  ```
* **Observabilitas & Perilaku Tokenizer:**
  * **Isolasi Baris Tokenizer:** Pada bahasa dengan string satu baris (`.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.py`, `.go`) dan blok `<script>` Svelte/Vue, string `'` dan `"` berakhir pada batas baris (`\n`) kecuali ada backslash continuation (`\\\n`), mengisolasi salah-baca regex literal berisi tanda kutip ke baris tunggal.
  * **Fail-Closed Desync Warning:** Unclosed literal multi-baris (backtick template, triple-quote Python, block comment) pada akhir berkas (EOF) memicu pelanggaran sintetis `TOKENIZER_DESYNC` berkategori `warn` dan tercatat pada `desync_files`.
  * **Observabilitas `files_scanned`:** Output teks dan `--json` menyertakan metrik `files_scanned` (total berkas dan perincian per ekstensi). Direktori `tests/`, `fixtures/`, dan `__tests__/` dikecualikan secara mekanis melalui `SKIP_DIRS` agar fixture pengujian tidak terpindai sebagai kode produksi.
* **Format Pengecualian Teraudit (Escape Hatch):**
  ```typescript
  // astesia-allow: ASTESIA-002 -- tabel konfigurasi kecil (< 10 baris, semua kolom dipakai)
  ```

---

## 5. Katalog Lengkap 53 Native Skills (`skills/<nama>/SKILL.md`)

Seluruh skill menggunakan format standar Google Antigravity (`skills/<nama>/SKILL.md` dengan YAML frontmatter `name` dan `description`).

| No | Nama Skill (ID) | Kategori Layer | Berkas `SKILL.md` | Fungsi Utama |
|---|---|---|---|---|
| 1 | `brd-generation` | Product | [SKILL.md](file:///D:/Workspaces/Astesia/skills/brd-generation/SKILL.md) | Penyusunan BRD terstruktur, aturan bisnis, dan Acceptance Criteria. |
| 2 | `cuj-mapping` | Product | [SKILL.md](file:///D:/Workspaces/Astesia/skills/cuj-mapping/SKILL.md) | Pemetaan alur *Critical User Journey* dari ujung ke ujung beserta skenario gagal. |
| 3 | `reverse-engineering` | Product | [SKILL.md](file:///D:/Workspaces/Astesia/skills/reverse-engineering/SKILL.md) | Ekstraksi intelijen kompetitor (API, tech stack, token desain) melalui observasi web. |
| 5 | `ux-systems` | Design | [SKILL.md](file:///D:/Workspaces/Astesia/skills/ux-systems/SKILL.md) | Perancangan sistem desain abstrak, skala tipografi, dan palet warna HSL. |
| 6 | `component-tokens` | Design | [SKILL.md](file:///D:/Workspaces/Astesia/skills/component-tokens/SKILL.md) | Definisi token komponen, *responsive breakpoints*, dan *interactive states*. |
| 7 | `layered-architecture` | Engineering (Arch) | [SKILL.md](file:///D:/Workspaces/Astesia/skills/layered-architecture/SKILL.md) | Penegakan struktur direktori dan pemisahan Controller → Service → Repository. |
| 8 | `adr-management` | Engineering (Arch) | [SKILL.md](file:///D:/Workspaces/Astesia/skills/adr-management/SKILL.md) | Dokumentasi keputusan arsitektur dalam format ADR standar. |
| 9 | `hono-rest-api` | Engineering (BE) | [SKILL.md](file:///D:/Workspaces/Astesia/skills/hono-rest-api/SKILL.md) | Pola pengembangan REST API menggunakan Hono, controller tipis, dan rantai middleware. |
| 10 | `elysia-rest-api` | Engineering (BE) | [SKILL.md](file:///D:/Workspaces/Astesia/skills/elysia-rest-api/SKILL.md) | Pola REST API di atas Bun + Elysia, validasi TypeBox, dan Eden Treaty. |
| 11 | `golang-rest-api` | Engineering (BE) | [SKILL.md](file:///D:/Workspaces/Astesia/skills/golang-rest-api/SKILL.md) | Tata letak standar Go REST API, *dependency injection*, dan konkurensi aman. |
| 12 | `python-fastapi` | Engineering (BE) | [SKILL.md](file:///D:/Workspaces/Astesia/skills/python-fastapi/SKILL.md) | Arsitektur FastAPI dengan Pydantic v2 dan async dependency injection. |
| 13 | `laravel-api` | Engineering (BE) | [SKILL.md](file:///D:/Workspaces/Astesia/skills/laravel-api/SKILL.md) | Pola Laravel REST API dengan Form Request, Service/Action, dan API Resource. |
| 14 | `drizzle-orm` | Engineering (BE) | [SKILL.md](file:///D:/Workspaces/Astesia/skills/drizzle-orm/SKILL.md) | Definisi skema PostgreSQL, migrasi, dan pola repository dengan Drizzle ORM. |
| 15 | `sveltekit-frontend` | Engineering (FE) | [SKILL.md](file:///D:/Workspaces/Astesia/skills/sveltekit-frontend/SKILL.md) | Arsitektur SvelteKit, Svelte 5 Runes, load functions, dan Superforms. |
| 16 | `vue-frontend` | Engineering (FE) | [SKILL.md](file:///D:/Workspaces/Astesia/skills/vue-frontend/SKILL.md) | Arsitektur Vue 3 & Nuxt 3, Composition API, Pinia, dan `useFetch`. |
| 17 | `react-frontend` | Engineering (FE) | [SKILL.md](file:///D:/Workspaces/Astesia/skills/react-frontend/SKILL.md) | Arsitektur React & Next.js App Router, Server vs Client Components. |
| 18 | `react-native-mobile` | Engineering (FE) | [SKILL.md](file:///D:/Workspaces/Astesia/skills/react-native-mobile/SKILL.md) | Arsitektur aplikasi mobile lintas platform dengan React Native & Expo Router. |
| 19 | `frontend-integration` | Engineering (FE) | [SKILL.md](file:///D:/Workspaces/Astesia/skills/frontend-integration/SKILL.md) | Penerjemahan Design Tokens (`design-system.md`) ke dalam kode komponen UI. |
| 20 | `minimalist-executor` | Engineering (Core) | [SKILL.md](file:///D:/Workspaces/Astesia/skills/minimalist-executor/SKILL.md) | Protokol *Minimalist Ladder* (YAGNI, stdlib, fitur native, anti-bloat). |
| 21 | `task-waves` | Engineering (Core) | [SKILL.md](file:///D:/Workspaces/Astesia/skills/task-waves/SKILL.md) | Dekomposisi rencana implementasi ke dalam gelombang eksekusi subagent paralel. |
| 22 | `dversarial-review` | Engineering (Core) | [SKILL.md](file:///D:/Workspaces/Astesia/skills/adversarial-review/SKILL.md) | Tata kelola verifikasi silang antar-subagent dengan persona Red Team / Blue Team. |
| 23 | `worktree-isolation` | Engineering (Core) | [SKILL.md](file:///D:/Workspaces/Astesia/skills/worktree-isolation/SKILL.md) | Isolasi tugas berisiko/paralel di dalam `git worktree` terpisah. |
| 24 | `blast-radius` | Engineering (Core) | [SKILL.md](file:///D:/Workspaces/Astesia/skills/blast-radius/SKILL.md) | Pemetaan grafik dependensi file sebelum memodifikasi layanan inti. |
| 26 | `brownfield-entry` | Engineering (Core) | [SKILL.md](file:///D:/Workspaces/Astesia/skills/brownfield-entry/SKILL.md) | Protokol masuk proyek legacy (*Threat Assessment*, *Scope*, `system-map.md`). |
| 27 | `context-navigation` | Engineering (Core) | [SKILL.md](file:///D:/Workspaces/Astesia/skills/context-navigation/SKILL.md) | Navigasi berbasis tag konseptual dan penghematan anggaran token konteks. |
| 29 | `tdd-workflow` | Engineering (Core) | [SKILL.md](file:///D:/Workspaces/Astesia/skills/tdd-workflow/SKILL.md) | Siklus pengembangan berbasis pengujian ketat (RED → GREEN → REFACTOR). |
| 30 | `zod-validation` | Engineering (Core) | [SKILL.md](file:///D:/Workspaces/Astesia/skills/zod-validation/SKILL.md) | Validasi skema input di batas aplikasi menggunakan Zod. |
| 31 | `self-healing` | Engineering (Core) | [SKILL.md](file:///D:/Workspaces/Astesia/skills/self-healing/SKILL.md) | Debugging otonom, *retry with backoff*, dan pola *circuit breaker*. |
| 32 | `zero-downtime-migration` | Engineering (Core) | [SKILL.md](file:///D:/Workspaces/Astesia/skills/zero-downtime-migration/SKILL.md) | Migrasi skema database tanpa waktu henti dengan pola *Expand and Contract*. |
| 33 | `codebase-gardening` | Engineering (Core) | [SKILL.md](file:///D:/Workspaces/Astesia/skills/codebase-gardening/SKILL.md) | Wave refactoring terisolasi untuk menghapus pola usang agar tidak ditiru agen. |
| 34 | `trust-pyramid` | Quality | [SKILL.md](file:///D:/Workspaces/Astesia/skills/trust-pyramid/SKILL.md) | Protokol penempatan aturan pada lapisan terkeras (Types > Lint/CI > Prose > Human). |
| 35 | `lint-ratchet` | Quality | [SKILL.md](file:///D:/Workspaces/Astesia/skills/lint-ratchet/SKILL.md) | Konversi kesalahan berulang agen menjadi aturan permanen di `anti-patterns.json`. |
| 36 | `independent-verification` | Quality | [SKILL.md](file:///D:/Workspaces/Astesia/skills/independent-verification/SKILL.md) | Verifikasi oleh subagent independen dengan bukti eksekusi di `.astesia/verification/`. |
| 37 | `architectural-linter` | Quality | [SKILL.md](file:///D:/Workspaces/Astesia/skills/architectural-linter/SKILL.md) | Aturan makro pencegah pelanggaran layer, N+1 query, `SELECT *`, dan import fiktif. |
| 38 | `anti-silent-failure` | Quality | [SKILL.md](file:///D:/Workspaces/Astesia/skills/anti-silent-failure/SKILL.md) | Validasi efek samping tool untuk mencegah halusinasi akibat perintah gagal diam-diam. |
| 39 | `anti-bloat-review` | Quality | [SKILL.md](file:///D:/Workspaces/Astesia/skills/anti-bloat-review/SKILL.md) | Review kode yang berfokus menghapus kode dan abstraksi berlebih. |
| 41 | `debt-scanner` | Quality | [SKILL.md](file:///D:/Workspaces/Astesia/skills/debt-scanner/SKILL.md) | Pelacakan dan pelunasan komentar `// astesia-debt: <alasan>, upgrade: <tindakan>`. |
| 42 | `vitest-unit-testing` | Quality | [SKILL.md](file:///D:/Workspaces/Astesia/skills/vitest-unit-testing/SKILL.md) | Konfigurasi dan pola pengujian unit serta mocking lapisan service dengan Vitest. |
| 43 | `e2e-testing` | Quality | [SKILL.md](file:///D:/Workspaces/Astesia/skills/e2e-testing/SKILL.md) | Pengujian End-to-End lintas modul menggunakan Playwright. |
| 44 | `security-review` | Quality | [SKILL.md](file:///D:/Workspaces/Astesia/skills/security-review/SKILL.md) | Audit keamanan aplikasi (SQLi, XSS, CSRF, Auth boundaries, Secrets). |
| 45 | `visual-qa` | Quality | [SKILL.md](file:///D:/Workspaces/Astesia/skills/visual-qa/SKILL.md) | Pengujian visual antarmuka terhadap spesifikasi desain menggunakan headless browser. |
| 46 | `auto-merge-gates` | DevOps | [SKILL.md](file:///D:/Workspaces/Astesia/skills/auto-merge-gates/SKILL.md) | Kriteria kelayakan auto-merge, *shadow mode*, sampling pasca-merge, dan *kill-switch*. |
| 47 | `budget-circuit-breaker` | DevOps | [SKILL.md](file:///D:/Workspaces/Astesia/skills/budget-circuit-breaker/SKILL.md) | Penghentian paksa loop otonom saat pemakaian token melewati ambang batas aman. |
| 48 | `dynamic-plugins` | DevOps | [SKILL.md](file:///D:/Workspaces/Astesia/skills/dynamic-plugins/SKILL.md) | Pembuatan skrip perkakas runtime khusus untuk menjembatani celah kemampuan tool. |
| 49 | `docker-optimization` | DevOps | [SKILL.md](file:///D:/Workspaces/Astesia/skills/docker-optimization/SKILL.md) | Pembuatan image Docker multi-stage yang minimal dan berjalan tanpa hak root. |
| 50 | `docker-compose` | DevOps | [SKILL.md](file:///D:/Workspaces/Astesia/skills/docker-compose/SKILL.md) | Orkestrasi multi-container untuk lingkungan development dan production. |
| 51 | `github-actions` | DevOps | [SKILL.md](file:///D:/Workspaces/Astesia/skills/github-actions/SKILL.md) | Standar pembuatan pipeline CI/CD otomatis di GitHub Actions. |
| 52 | `trigger-dev` | DevOps | [SKILL.md](file:///D:/Workspaces/Astesia/skills/trigger-dev/SKILL.md) | Pengelolaan background jobs dan antrean tugas asinkron dengan Trigger.dev v3. |
| 53 | `n8n-automation` | DevOps | [SKILL.md](file:///D:/Workspaces/Astesia/skills/n8n-automation/SKILL.md) | Integrasi otomasi workflow n8n self-hosted dengan pengamanan webhook HMAC. |

---

## 6. Matriks Self-Audit Jujur (Panduan Evaluasi Anda)

Tabel ini memisahkan fitur yang **sudah ditegakkan secara deterministik oleh kode** (`L1/L2`) dari fitur yang **masih berupa instruksi prosedur bagi agen** (`L3`), sehingga Anda dapat menentukan prioritas penguatan berikutnya:

| Area Audit | Tingkat Penegakan Saat Ini | Bukti Berkas | Catatan & Celah Potensial untuk Anda Audit |
|---|---|---|---|
| **Struktur Skill & Progressive Disclosure** | **L2 — Native Structure** | `skills/*/SKILL.md` (lihat docs/GENERATED-INVENTORY.md) | Seluruh skill telah memiliki frontmatter YAML (`name`, `description`). Anda hanya perlu menjalankan `.\install.ps1` di terminal host agar symlink/junction di `~/.gemini/config/plugins/astesia` aktif. |
| **Deteksi Import Fiktif, Layer Breach, `SELECT *`, Vague Debt, Secret, `any`, `console.log`** | **L2 — Enforced by Code** | [astesia-gate.ts](file:///D:/Workspaces/Astesia/templates/enforcement/astesia-gate.ts), [anti-patterns.json](file:///D:/Workspaces/Astesia/templates/enforcement/anti-patterns.json) | Berjalan deterministik tanpa dependensi eksternal dan mengembalikan `exit 1` jika melanggar. |
| **Deteksi N+1 Database Query (`ASTESIA-007`)** | **L2 — Heuristic Block Scanner** | [astesia-gate.ts](file:///D:/Workspaces/Astesia/templates/enforcement/astesia-gate.ts#L124-L163) | Menggunakan pelacak kedalaman kurung kurawal `{}` untuk menangkap pemanggilan DB di dalam blok `for`/`while`/`.map`/`.forEach`. Efektif untuk pemanggilan langsung, namun belum melacak pemanggilan tidak langsung lintas fungsi helper (membutuhkan parser AST penuh jika ingin 100% kedap). |
| **Kewajiban Header Doc (Direktif #19)** | **L3 — Prose Rule** | [engineering-rules.md](file:///D:/Workspaces/Astesia/rules/engineering-rules.md#L81-L91) | Saat ini diperiksa secara visual oleh Quality Agent, belum dijadikan rule otomatis di `astesia-gate.ts`. |
| **Validasi Skema State `.astesia/astesia-state.json` & Hash Convergence Guard** | **L3 — Prose + JSON Template** | [astesia-state-template.json](file:///D:/Workspaces/Astesia/templates/astesia-state-template.json) | Agen diperintahkan memperbarui JSON dan menghitung konvergensi hash, tetapi belum ada skrip CLI validator khusus (mis. `astesia-state.ts`) yang memvalidasi transisi state secara mekanis. |
| **Orkestrasi Subagent Paralel (Task Waves & Independent Verifier)** | **L3 — Workflow Checklist** | [phase3-engineering.md](file:///D:/Workspaces/Astesia/workflows/phase3-engineering.md#L30-L46) | Mengandalkan kepatuhan agen utama memanggil `invoke_subagent`. Dapat ditingkatkan ke L2 dengan menulis skrip orkestrator Python untuk tool `run_workflow`. |

---

## 7. Addendum: Pembaruan Pasca-Gelombang 2A (Enforcement Hardening & CI Ratchet)

Bagian ini mencatat evolusi mekanis penegakan arsitektur Astesia pasca-audit Gelombang 1, Gelombang 1.1, dan Gelombang 2A tanpa mengubah catatan historis audit awal di atas.

### 7.1 Evolusi Gate (Gelombang 1 → 1.1 → 2A)
1. **Gelombang 1 (`wave1/gate-hardening`):**
   - Penambahan CLI flag `--json`, `--max-warn`, penanganan UTF-8 BOM dan CRLF deterministik, serta `exit 2` untuk kegagalan alat.
   - Pra-pemrosesan tokenizer multi-bahasa (`TS`, `JS`, `Python`, `Go`, `PHP`, `Svelte`, `Vue`) memisahkan kode dari komentar dan string.
   - Penegakan `astesia-allow` ketat ($\ge 15$ karakter alasan) dengan larangan mutlak untuk `ASTESIA-000` dan `ASTESIA-004`.
   - Registri aturan diperluas dari aturan dasar menjadi aturan registri aktif (lihat docs/GENERATED-INVENTORY.md):
     - `ASTESIA-008` (`warn`): Anti-workaround (`workaround|hack|for now|temporary fix`) tanpa penanda utang `astesia-debt:`.
     - `ASTESIA-009` (`warn`): Penggunaan `setTimeout` telanjang di luar berkas pengujian dan modul debounce/throttle.
     - `ASTESIA-010` (`error`): Hardcoded secrets di konfigurasi deployment, Dockerfile, `.env`, dan CI compose YAML.

2. **Gelombang 1.1 (`wave1.1/fixes`):**
   - Tokenizer diperbaiki untuk string berkutip tunggal/ganda yang berakhir di baris baru kecuali diakhiri backslash continuation.
   - Deteksi sintesis desinkronisasi `TOKENIZER_DESYNC` saat EOF ditemukan di state non-normal.
   - Heuristik `ASTESIA-004` diperluas dengan tabel keputusan E1/E2 (penanganan Diceware passphrase, Base64 token, Slack bot tokens, AWS keys, Stripe keys, UI labels, dan nullish coalescing fallbacks).
   - Penegakan `astesia-allow` di dalam komentar blok multiline (`/* ... */`).
   - Penegakan metric observability: `files_scanned` dengan rincian per-ekstensi berkas.

3. **Gelombang 2A (`wave2a/ci-ratchet`):**
   - **Pemulihan `SKIP_DIRS` default:** Mengembalikan direktori `tests`, `fixtures`, `__tests__` ke pemindaian default gate untuk mencegah penyembunyian kode jahat / celah keamanan.
   - **Konfigurasi Pengecualian Proyek (`--config <path>`):** Mendukung pengecualian direktori/berkas yang terjustifikasi secara tertulis melalui skema JSON ketat (`.astesia/gate-config.json` dan template `gate-config.template.json`), dengan validasi alasan minimal 15 karakter dan pelaporan metrik `files_excluded`.
   - **Baseline Ratchet Deterministik (`--baseline <path>`, `--update-baseline`):**
     - Ratchet berbasis pasangan per-pelanggaran `(ruleId, file)` bukan kuota global.
     - Penegakan aturan **NEVER_BASELINE** (`ASTESIA-000`, `ASTESIA-004`, `ASTESIA-010`) yang tidak pernah diizinkan masuk baseline dalam kondisi apa pun.
     - Penurunan metrik pelanggaran secara otomatis memperketat baseline (*ratchet lock-in*).
     - Kenaikan baseline dilarang keras kecuali flag `--allow-raise` disertai `--reason` formal minimal 15 karakter diberikan secara eksplisit.
     - Deteksi penurunan cakupan (*coverage drop guard*): rasio berkas terpindai $< 0.9$ otomatis menggagalkan CI.
   - **Pencegahan Pelemahan Registri Aturan (`--rules-diff <base> <head>`):**
     - Memverifikasi PR tidak menghapus aturan, tidak menurunkan tingkat keparahan (`error` -> `warn`), dan tidak mengosongkan metadata `fix` atau `origin`.
   - **Model Keamanan CI Tepercaya (`astesia-gate.workflow.yml`):**
     - Menggunakan trigger aman `pull_request` (bukan `pull_request_target`) dengan `permissions: contents: read` eksklusif.
     - Dual-checkout: mengekstrak gate, config, dan baseline dari commit branch `base` tepercaya, lalu memindai kode PR pada direktori terisolasi.
     - Seluruh GitHub Actions di-pin menggunakan 40-character commit SHA permanen.
     - Dilengkapi `CODEOWNERS.template` dan panduan `BRANCH-PROTECTION.md`.

### 7.2 Daftar Aturan Registri Aktif (lihat docs/GENERATED-INVENTORY.md)
| Rule ID | Severity | Kind | Scope | Target & Deskripsi |
|---|---|---|---|---|
| `ASTESIA-000` | `error` | `relative-import-exists` | `code` | Import relatif ESM/CJS, re-export, dan alias `@/` wajib menunjuk ke berkas fisik yang eksis. *(NEVER_BASELINE)* |
| `ASTESIA-001` | `error` | `line-regex` | `code` | Controller / Route handler dilarang mengimpor atau memanggil driver database / ORM secara langsung. |
| `ASTESIA-002` | `error` | `line-regex` | `code` | Dilarang menggunakan kueri `SELECT *` mentah di SQL; wajib menyebutkan kolom secara eksplisit. |
| `ASTESIA-003` | `error` | `line-regex` | `comment` | Penanda utang teknis `// astesia-debt:` wajib menyertakan klausul `upgrade: <tindakan>`. |
| `ASTESIA-004` | `error` | `line-regex` | `code` | Dilarang menuliskan kunci API, secret, token JWT, atau password literal dalam kode sumber. *(NEVER_BASELINE)* |
| `ASTESIA-005` | `warn` | `line-regex` | `code` | Hindari tipe data lolos tipe `any` eksplisit di TypeScript; gunakan `unknown` atau skema tipe ketat. |
| `ASTESIA-006` | `warn` | `line-regex` | `code` | Hindari `console.log` / `console.debug` di kode produksi; gunakan structured logger terpusat. |
| `ASTESIA-007` | `error` | `nested-loop-call` | `code` | Hindari pemanggilan kueri database berulang di dalam loop (*N+1 Query*); gunakan batch loading / IN query. |
| `ASTESIA-008` | `warn` | `line-regex` | `comment` | Komentar penanda *workaround* / *hack* / *for now* / *temporary fix* wajib dilacak dengan `astesia-debt:`. |
| `ASTESIA-009` | `warn` | `line-regex` | `code` | Hindari `setTimeout` telanjang di kode produksi tanpa enkapsulasi debounce/throttle atau pengujian terisolasi. |
| `ASTESIA-010` | `error` | `line-regex` | `code` | Dilarang meletakkan secret plaintext di Dockerfile, docker-compose, CI yaml, dan berkas `.env`. *(NEVER_BASELINE)* |

### 7.3 Status 6 Active Known Gaps Terverifikasi (Pasca-Gelombang 2A.5)
Sesuai prinsip transparansi dan pelacakan registri resmi yang disinkronkan dua arah di `templates/enforcement/tests/known-gaps.json` dan `templates/enforcement/tests/verify3/known-gaps.verify3.json` (diverifikasi secara otomatis oleh `META-05` dan `META-06` di `all.ts`), dua celah lama terkait backtick di dalam regex literal (`ADV-BACKTICK-IN-REGEX-GAP` dan `D2-REG-BACKTICK-GAP`) **telah ditutup (`gap -> pass`)** pada Gelombang 2A.5 melalui deteksi regex literal satu baris. Enam batasan deteksi statis aktif saat ini adalah:
1. **`007-EC2b` (`ASTESIA-007`):** Pemanggilan fungsi helper database tidak langsung lintas fungsi (mis. `await fetchUserOrdersHelper(u.id)`) di dalam loop tidak dapat dipetakan ke kueri database tanpa analisis call-graph antar-berkas.
2. **`SEC-23-GAP` (`ASTESIA-004`):** Secret dalam format kata jamak berhuruf kecil murni bergaya snake_case yang berada di bawah kunci bertarget UI (mis. `passwordField = "my_secret_token_words"`) lolos dari filter entropi regex tanpa kamus semantik kata sandi.
3. **`D2-PHP-HEREDOC` (`ASTESIA-002`):** Sintaks PHP heredoc (`<<<TAG`) tidak di-strip sebagai string literal oleh tokenizer tanpa dependensi eksternal.
4. **`D4-21-GAP` (`ASTESIA-004`):** Interpolasi template literal `const password = \`pass_\${userId}\`` pada kode sumber masih memicu heuristik line-regex karena tidak ada evaluasi runtime.
5. **`HELM-KEYNAME-GAP` (`ASTESIA-010`, `helm-keyname-suite.ts#HK-14`):** Passphrase huruf kecil murni di bawah kunci `*PasswordKey` / `*TokenKey` pada berkas YAML cocok dengan pola identifier nama key Helm (`^[a-z][a-z._-]{0,39}$`). Dihitung di `known_gaps` (`13 passed + 1 known_gap = 14`).
6. **`PHP-MARKUP-OUTSIDE-TAG-GAP` (`TOKENIZER_DESYNC`, `wave2a5-cli-config-suite.ts#T4-GAP`):** Apostrof tak berpasangan pada teks HTML di luar blok `<?php ... ?>` pada berkas `.php`/`.blade.php` (frekuensi D2 $< 20\%$ dan $< 3$ berkas; 1 berkas nyata di `SIA` memiliki baris 28.398 karakter sehingga terklasifikasi ke dalam `generated_skipped`).

### 7.4 Gelombang 2A.1 (`wave2a.1/fixes`)
1. **F1: Heuristik ASTESIA-004 Lebih Cerdas & Sensitivitas Kunci:**
   - Memperbaiki deteksi nama kunci: kunci dengan suffix non-sensitif (seperti `THEME_STORAGE_KEY`, `cache_key`, `sort_key`) tidak lagi memicu false positive.
   - Menambahkan pengenalan khusus token autentikasi bertipe `Basic <base64>` dan `Bearer <token>` yang mengandung spasi agar tidak dikecualikan oleh aturan spasi umum (memulihkan `SEC-25-orig`).
   - Mendukung pengecualian format MIME type pada kunci bertipe Type (memulihkan `SEC-21-orig`).
2. **F2: Tokenizer Khusus Berkas Konfigurasi (Config Profile):**
   - Menghilangkan pelacakan string literal pada file `.yml`, `.yaml`, `Dockerfile*`, dan `.env*`. Komentar `#` hanya dikenali di awal baris atau setelah karakter spasi.
   - Mengeliminasi 100% false warning desinkronisasi `TOKENIZER_DESYNC` pada multiline script Dockerfile dan compose block.
3. **F3: Katup Allowlist Terjustifikasi Berbasis Konfigurasi:**
   - Memberikan katup allowlist terkontrol hanya untuk `ASTESIA-004` dan `ASTESIA-010` melalui skema `allow` pada `.astesia/gate-config.json`.
   - Validasi ketat: path relatif spesifik tanpa wildcard (`*`, `?`) atau traversal (`..`), string pencocokan minimal 6 karakter, dan alasan tertulis minimal 15 karakter.
   - Pelaporan otomatis entri allowlist usang (`allow_stale`) dan integrasi counter ke baseline ratchet.
4. **F4: Penanganan Cerdas Berkas `.env` yang Diabaikan Git:**
   - Berkas `.env` yang terdaftar pada `.gitignore` dan berstatus untracked secara otomatis dilewati dari pemindaian rahasia (`env_ignored_skipped`).
   - Berkas `.env` yang sudah terlanjur di-commit ke indeks git tetap dipindai secara tegas (*fail-closed*).
5. **3.4: Workflow Guard CLI Mode & Dokumentasi Trust Boundaries:**
   - Menambahkan kemampuan CLI `workflow-guard.ts <file>` untuk memvalidasi berkas workflow PR sebelum eksekusi gate.
   - Mendokumentasikan batas kepercayaan workflow dan peran sentral CODEOWNERS + Branch Ruleset pada `BRANCH-PROTECTION.md`.
6. **3.5: Deteksi Penyempitan Ekstensi Berkas pada Rules Diff:**
   - `--rules-diff` mendeteksi dan menolak PR yang mempersempit cakupan ekstensi aturan (misalnya menghapus `.py` dari daftar ekstensi).
7. **Metrik Uji Harness 2A.1:**
   - **279 skenario uji total:** 273 passed, 0 failed, 6 known gaps terverifikasi.
   - Invarian akuntansi `total === passed + failed + known_gaps` terpenuhi secara matematis di seluruh 12 kategori pengujian.

### 7.5 Gelombang 2A.2 (`wave2a.2/fixes`)
1. **Penutupan Seluruh 10 Temuan Verifier Independen (VER3-001..010):**
   - **VER3-001 & VER3-002 (Sensitivitas Kunci & Token Boundary):** Tokenisasi nama kunci berbasis delimiter (`_`, `-`), transisi camelCase/PascalCase, dan transisi alpha-digit. Token tunggal `key` tidak lagi dianggap sensitif (menghilangkan FP pada `const key = ...`). Substring `auth` tidak lagi memicu false positive pada nama entitas non-otentikasi seperti `author`, `authorName`, dan `authority`.
   - **VER3-003 & VER3-008 (Shape-based Auth Token Detection & Titik JWT):** `isAuthBearerOrBasic` memvalidasi kredensial HTTP Basic (base64 ter-encode dengan separator `:`) dan JWT Bearer dengan struktur 3-bagian (`header.payload.signature` memuat titik `.`). Pemindaian literal string pada seluruh baris mendeteksi kredensial ini meskipun di-assign ke variabel dengan nama netral (mis. `label`, `description`).
   - **VER3-004 (Preservasi Karakter Hash dalam Nilai Konfigurasi):** Pra-pemroses berkas `.yml`, `.yaml`, dan `.env` mengenali tanda kutip (`'`, `"`) dan menjaga karakter `#` yang berada di dalam kutip, mencegah pemotongan nilai kredensial ke komentar.
   - **VER3-005 (Larangan Tegas Inline Allowlist untuk ASTESIA-010):** Menambahkan `ASTESIA-010` ke dalam himpunan `NEVER_INLINE_SUPPRESS`, menolak tegas penggunaan komentar inline `// astesia-allow: ASTESIA-010` (wajib menggunakan config-based allowlist).
   - **VER3-006 (Workflow Guard Subcommand Terintegrasi & Fail-Closed CI):** Mengintegrasikan validator workflow langsung ke dalam CLI gate melalui `--check-workflow <path>`. Memvalidasi secara eksplisit keberadaan step guard itu sendiri di dalam AST workflow. Shell snippet pada `astesia-gate.workflow.yml` bersikap *fail-closed* jika berkas skrip gate tidak ditemukan.
   - **VER3-007a (Eliminasi ReDoS O(N^2) pada Regex Kandidat):** Mengeliminasi catastrophic backtracking dengan penambahan linear pre-check `hasQuote` dan lookbehind `(?<![\w$])` pada ekspresi reguler kandidat penugasan string, memotong waktu eksekusi baris 500k dari 318,397 ms menjadi 98 ms.
   - **VER3-007b (Batch Git Operations untuk Klasifikasi .env):** Menghilangkan eksekusi individual `spawnSync("git")` per berkas. Klasifikasi berkas `.env` menggunakan batch mode maksimal 2 pemanggilan subprocess (`git ls-files -z` dan `git check-ignore -z --stdin`), dengan 0 spawn jika tidak ada berkas `.env`. Pemindaian 100 berkas `.env` turun dari 5,568 ms menjadi 84.7 ms (peningkatan kecepatan 65x).
   - **VER3-009 (Uji Mutasi M06 Tracked Ignored .env):** Harness pengujian memverifikasi berkas `.env` tracked yang cocok dengan `.gitignore` tetap ditandai sebagai pelanggaran (*fail-closed*).
   - **VER3-010 (Penguncian Corpus Independen & Rekonsiliasi Celah):** Mengunci 67 kasus uji independen asli ke `tests/independent/originals.json`, memulihkan kasus `D4-21-GAP` ber-interpolasi template literal, memperbaiki typo path `r007/ec2b_helper.ts`, dan mendokumentasikan relasi duplikasi gap.
2. **Harness Uji Mutasi 18-Mutan (Mutation Testing Harness):**
   - Implementasi mandiri `templates/enforcement/tests/mutation/run.ts` menguji 18 mutasi kritis (M01..M18).
   - Skor mutasi: **18 / 18 dibunuh (100% kill rate, 0 survived)**.
3. **Hasil Pengujian Harness & Benchmark Performa:**
   - **Harness Implementer:** 284 total kasus (278 passed, 0 failed, 6 known gaps).
   - **Harness Verifier Independen:** 90 total kasus (87 passed, 0 failed, 3 known gaps terdaftar). Invarian matematis $90 = 87 + 0 + 3$ terpenuhi 100%.
   - **Benchmark Performa (15 Pasang Alternating 56dd907 vs Head):**
     - *Realistic Dataset (2,000 berkas: 5 .env, 1,995 kode):* Base Median 474.4 ms vs Head Median 565.4 ms -> Rasio Median **1.192x** (Ambang batas $\le 1.25$x) -> **PASS**.
     - *Stress Dataset (2,000 berkas: 100 .env, 1,900 kode):* Base Median 470.8 ms vs Head Median 556.2 ms -> Rasio Median **1.181x** (Ambang batas $\le 1.25$x) -> **PASS**.
   - **Self-Gate Execution:** Exit code 0, 0 error, 0 warning (`--max-warn 0`), 0 desync, 2 berkas terpindai, 21 berkas dikecualikan.

### 7.6 Gelombang 2A.3 (`wave2a.3/fixes`)
1. **Penutupan Temuan Verifikasi 2A.2 & Penutupan Celah Spesifikasi (T1..T4):**
   - **T1 / VER4-001 (Dispatch Profil Berkas Konsisten):** Fungsi kanonikal `profileFor(filePath)` berbasis `path.basename` POSIX-normalized di seluruh pemanggilan tokenizer dan klasifikasi `.env`. Memastikan path absolut Windows (`C:\...\.env`) tidak lolos dari profil konfigurasi. (Commit `8720438`).
   - **T2 / VER4-002 & VER4-003 (Kontrak Token Kunci Sensitif):** Menambahkan `pwd`, `pwds`, `passphrase`, `passphrases` ke `hasPassword` dan `isDirectSecretKey`. Mengecualikan token tunggal `auth` per kontrak F1 (`tokens.length === 1 && tokens[0] === 'auth'`). (Commit `5fabcd3`).
   - **T3 / V3-06 (Nonaktifkan E1 pada Profil Config & Deteksi Rahasia Berspasi):** E1 (pengecualian string berspasi) dinonaktifkan mutlak pada profil config. `checkConfigSecret` mengevaluasi format mapping (`KEY: v`), list (`- KEY=v`), dotenv, dan Kubernetes env. Interpolasi `${VAR:-fallback}` mengevaluasi nilai fallback. (Commit `6a2c652`).
   - **T4 / V4-06 (Perluasan Cakupan ASTESIA-010 ke Seluruh Konfigurasi & Format List):** `pathRegex` diperluas ke `(Dockerfile|\.dockerfile|\.env|\.ya?ml)`. Konfigurasi docker compose format list (`- KEY=val`) dideteksi penuh. `--rules-diff` membuktikan perubahan tidak melemahkan aturan (exit 0). (Commit `6798f56`).
2. **Penyelesaian Riil Rekonsiliasi & Klasifikasi Proyek Nyata (R1 & R2 / T5..T6):**
   - **T5 / R1 (Programmatic Commit-by-Commit Reconciliation):** Skrip programatis `reconcile.ts` memverifikasi 31 commit historis `56dd907..HEAD` pada salinan bersih `pustaka-sekolah-pwa`. Mengoreksi mitos ASTESIA-001: temuan yang tereliminasi di `b4d7e93` secara empiris adalah ASTESIA-004 pada `storageKey`/`cacheKey` (bukan ASTESIA-001 pada JSDoc/imports). Invarian aritmetika $\Delta\text{error} = 22 - 30 = -8$ dan $\Delta\text{warn} = 38 - 39 = -1$ terbukti mutlak. (Commit `6ebe9b2`).
   - **T6 / R2 (Full Project Classification & Adoption Verification):** Mengklasifikasikan 51 temuan riil pada `pustaka-sekolah-pwa` (TP 51, FP 0, Noise 0, FP Rate 0.0%) dan 0 pelanggaran pada `terminal-portfolio` (Exit 0). Menyusun usulan konfigurasi `.astesia/gate-config.json` mengecualikan aset vendor `dev-dist` dan meng-allowlist kredensial dev. Pembuktian adopsi baseline dan ratchet 100% lulus secara mekanis (`updateBaselineExit=0`, `verifyBaselineExit=0`, `injectedBaselineExit=1` ratchet tertahan, `revertedBaselineExit=0`). (Commit `951e481`).
3. **Penyatuan Entrypoint Pengujian & Meta-Tests Corpus Lock (T7):**
   - Implementasi entrypoint tunggal `templates/enforcement/tests/all.ts` yang mendukung flag `--fast` dan `--json`.
   - Mengonsolidasi Implementer Harness (`run.ts`: 355 kasus), Verifier 2A.1 Harness (`verify/run.ts`: 90 kasus), Verifier 2A.2 Harness (`verify2/run.ts`: 80 kasus), dan 6 suite mandiri (160 kasus).
   - Penemuan dinamis 14 berkas `*-suite.ts`: **0 orphan suites (14/14 dieksekusi)**.
   - Meta-tests integritas corpus mengunci SHA-256 `originals.json` (`2863b919...`), memvalidasi simulasi tampering dan penghapusan ID.
   - Registry known-gaps diperbarui: `verify/known-gaps.verify.json` turun menjadi tepat 1 gap (SEC-23-GAP), `verify2/known-gaps.verify2.json` turun menjadi 0 gap. (Commit `2d1ba00`).
4. **Perluasan Mutation Testing Harness ke 27 Mutan (T8):**
   - Menambahkan 9 mutan baru (M19..M27) yang menguji seluruh logika baru T1..T4.
   - Menerapkan penegakan pergantian teks eksak tunggal (`countMatches === 1`).
   - Skor mutasi: **27 / 27 mutan dibunuh (100% kill rate, 0 survived)**. (Commit `8f71e7c`).
5. **Hasil Pengujian Terkonsolidasi, Benchmark & Self-Gate:**
   - **Total Kasus Uji Unik (`all.ts`):** 689 kasus (682 passed, 0 failed, 7 known gaps terdaftar). Invarian $689 = 682 + 0 + 7$ terpenuhi mutlak.
   - **Benchmark Performa (15 Pasang Alternating):**
     - *Realistic Dataset (2,000 berkas):* Median Head 3,018 ms vs 27fe428 3,000 ms (Rasio **1.006x** $\le 1.10$x) dan vs 56dd907 2,632 ms (Rasio **1.147x** $\le 1.25$x) -> **PASS**.
     - *Stress Dataset (2,000 berkas):* Median Head 3,018 ms vs 27fe428 2,998 ms (Rasio **1.007x** $\le 1.10$x) dan vs 56dd907 2,657 ms (Rasio **1.136x** $\le 1.25$x) -> **PASS**.
   - **Self-Gate Execution:** Exit 0, 0 error, 0 warning (`--max-warn 0`), 2 berkas terpindai, 31 berkas dikecualikan.

### 7.7 Gelombang 2A.4 (`wave2a.4/fixes`, `a9e20cd`)
1. **Penutupan Temuan Verifikasi 2A.3 (VER5-001, VER5-002, VM02, VM05, Hermetic `env_git`):**
   - **VER5-001 (Referensi Variabel Konfigurasi Tak Berkurung):** Mendukung `$VAR` (`^\$[A-Za-z_]\w*$`), `${VAR}`, `${{ ... }}`, dan `{{ ... }}` pada `checkConfigSecret`.
   - **VER5-002 (Aturan Nama Key Helm):** Mengecualikan nama key Helm (`*PasswordKey`, `*TokenKey`, `*CredentialKey`, dll., bukan `secretKey`/`apiKey`/`privateKey`/`accessKey`) yang bernilai identifier murni `^[a-z][a-z._-]{0,39}$`.
   - **Kontrak `profileFor`:** Hanya `.env`, `.env.<suffix>`, `Dockerfile`, `Dockerfile.<suffix>`, `*.Dockerfile`, `.yml`, dan `.yaml` (kecuali `.example`/`.template`/`.sample`) yang masuk profil `config`; `.json`, `.toml`, `.ini`, `.conf`, `.properties`, `.envrc`, dan `.environment` tetap di profil `code`.
   - **Hermetic `env_git` Suite:** Menggunakan flag eksplisit `-c user.name -c user.email -c commit.gpgsign=false -c core.autocrlf=false` dan pra-pemeriksaan status git sebelum menjalankan gate.
   - **Perluasan Uji Mutasi ke 34 Mutan:** Menambahkan mutan `M28..M34` untuk kontrak `profileFor`, referensi variabel `$VAR`, dan aturan Helm.

### 7.8 Gelombang 2A.5 (`wave2a.5/fixes`)
1. **Eliminasi `TOKENIZER_DESYNC` Lintas 7 Proyek Nyata (20 Berkas Desync $\to$ 0 Berkas Desync):**
   - **T1 (Deteksi Konservatif Regex Literal Satu Baris):** Pada `.ts .tsx .js .jsx .mjs .cjs` dan blok `<script>` di `.svelte`/`.vue` (tidak aktif di `.py`/`.go`), `/` membuka regex literal satu baris ($\le 2.000$ karakter) setelah awal berkas, operator/delimiter `( , = : [ ! & | ? { ; + - * % ~ ^` (bukan `++`/`--`), `=>`, atau keyword utuh `return typeof case void delete in of do else throw new yield await instanceof` (bukan properti `.keyword` atau flag regex `/flag`). Isi regex literal di-blank menjadi spasi pada `codeNoStringsLines` sementara pembuka/penutup `/` dan flag dipertahankan di `codeNoStringsLines` dan isi utuh dipertahankan di `codeLines`. Menutup `ADV-BACKTICK-IN-REGEX-GAP` dan `D2-REG-BACKTICK-GAP` (`gap -> pass`).
   - **T2 (Kebijakan Berkas Generated/Minified & Counter Baseline `generated_skipped`):** Berkas terklasifikasi generated bila (a) nama berkas cocok `\.min\.(js|mjs|cjs|css)$`, (b) ada baris $\ge 5.000$ karakter (4.999 bukan generated), atau (c) salah satu dari 10 baris pertama (baris 11 tidak) memuat `@generated`, `DO NOT EDIT`, atau `Code generated`. Berkas generated tidak melewati tokenizer (`0` `TOKENIZER_DESYNC`, tidak dihitung di `files_scanned`), dicatat pada `generated_skipped` dan `generated_files`, diratchet di baseline (`generated_skipped` naik $\to$ exit 1), dan tetap dipindai terhadap prefix rahasia kuat (`sk_live_`, `sk_test_`, `ghp_`, `gho_`, `AKIA`, `xox[abp]-`, JWT `eyJ...`, `-----BEGIN ... PRIVATE KEY-----`) menggunakan satu regex linear tunggal (`ASTESIA-004`, `error`, `NEVER_BASELINE`, tidak dapat disupresi).
   - **T5 (Interpolasi Template Literal `${ ... }` Satu Baris & Teks JSX):** Pelacakan stack kurung kurawal `templateBraceStack` pada `${ ... }` di dalam template literal memungkinkan regex literal dan nested template literal ber-escape (`` \` ``) di dalam `${ ... }` dipindai tanpa kehilangan paritas backtick, sekaligus mempertahankan sifat *fail-closed* (`TOKENIZER_DESYNC` bila `${` tidak tertutup pada EOF).
2. **Pengecualian URL Ketat pada `ASTESIA-004` (T3):**
   - Literal URL dikecualikan dari `ASTESIA-004` **hanya bila kelima syarat terpenuhi sekaligus**: (a) nama variabel LHS maupun variabel `process.env.X` tidak sensitif menurut kontrak token, (b) skema termasuk daftar aman (`http`, `https`, `ws`, `wss`, `libsql`, `postgres`, `postgresql`, `mysql`, `mongodb`, `mongodb+srv`, `redis`, `rediss`, `amqp`, `amqps`), (c) parsing URL berhasil dengan host tak-kosong, (d) tidak ada password hardcoded di userinfo (`user:pass@` atau `:pass@`) kecuali seluruh bagian password adalah referensi variabel (`$VAR`, `${VAR}`, `{{ ... }}`) dan tidak ada prefix rahasia kuat di userinfo, serta (e) tidak ada parameter query/fragment sensitif (`token|key|secret|password|passwd|pwd|auth|authtoken|apikey|api_key|access_token|sig|signature|credential`) maupun prefix rahasia kuat pada path/nilai.
3. **Kontrak CLI `--baseline`, Template Config, Sinkronisasi Known-Gap & 48 Mutan (T6..T10):**
   - **T6:** Mengembalikan kontrak `--baseline` tanpa nilai argumen ke *fail-closed* `exit 2` dengan pesan `"use --baseline <path>"`; path default `.astesia/gate-baseline.json` hanya berlaku untuk `--update-baseline`.
   - **T7 & Fase 3:** Implementasi `stats.ts` (batas atas Wilson 95% satu sisi dengan $z = 1.96$) dan `classify.ts` (sampling deterministik Mulberry32 `seed = 2026 + projectIndex` dan validasi ketat `classification.json` atas 251 temuan yang diklasifikasikan secara individual lintas 7 proyek nyata: `TP=212`, `FP=24`, `NOISE=15`, `TOKENIZER=0`).
   - **T8:** Sinkronisasi dua arah seluruh `known-gaps*.json` dan 9 meta-tes (`META-01..09`) di `all.ts`, termasuk kunci korpus satu arah (`gap -> pass` diizinkan, `pass -> gap` ditolak).
   - **T9:** Perluasan harness uji mutasi dari 34 menjadi **48 mutan (`M01..M48`)** dengan perbaikan hermetik lintas drive untuk `M06: tracked_env_skipped` (**48/48 dibunuh, 0 survived**).
   - **T10:** Penambahan `dev-dist` dan `.vercel/output` beserta alasan $\ge 15$ karakter pada `templates/enforcement/gate-config.template.json`.
   - **Metrik Uji Terkonsolidasi (`all.ts`):** **939 kasus uji unik** (`932 passed + 0 failed + 7 known_gaps`), invarian akuntansi $939 = 932 + 0 + 7$ terpenuhi di seluruh 22 suite (`0` orphan suites), dan **48/48 mutan terbunuh** pada clone bersih terisolasi di `%TEMP%`.

### 7.9 Gelombang 2A.6 (`wave2a.6/fixes`)
1. **Kebijakan Berkas Generated v2 & Baseline Path Ratchet (Task G):**
   - Pengetatan kriteria berkas *generated* (`isGeneratedFileV2`): penanda `@generated` / `DO NOT EDIT` pada 10 baris pertama hanya berlaku jika berkas memiliki panjang baris $\ge 500$ karakter atau berakhiran ekstensi minified (`.min.js`, `.min.css`), mencegah bypass berkas kode sumber biasa.
   - Format baseline v2 menambahkan field `generated_files: string[]` yang mencatat daftar berkas generated secara leksikografis terurut. Penambahan berkas generated baru yang tidak terdaftar di baseline ditolak dengan `exit 1` (*fail-closed*).
2. **Resolusi Impor Case-Sensitive & Dukungan Tsconfig/Config Imports (Task R):**
   - Validasi eksistensi fisik segmen path secara case-sensitive (`resolveCaseSensitivePath`) menggunakan `readdirSync`, mencegah import dengan salah kapitalisasi yang lolos di Windows namun gagal di Linux.
   - Dukungan resolusi alias monorepo via `loadTsconfigRecursive` (mendukung `compilerOptions.paths` dan rantai `extends`) serta integrasi `config.imports.alias` dari `.astesia/gate-config.json` dengan prioritas di atas pemetaan bawaan.
3. **Penurunan False Positive pada Proyek Nyata (Task F):**
   - **`ASTESIA-004`:** URL publik dengan skema aman (`http`, `https`, dll.) yang diparsing tanpa kredensial rahasia dan parameter query sensitif dikecualikan secara deterministik.
   - **`ASTESIA-008`:** Pembatasan frasa *workaround* agar kalimat wajar dalam komentar tidak ditandai sebagai pelanggaran arsitektur kecuali berdiri sebagai instruksi penundaan utuh.
   - Mengeliminasi 101 false positive di proyek nyata `eunectes` dan 6 di `ifrit` dengan mempertahankan 100% true positive rahasia.
4. **Isolasi Lingkungan Pengujian, Portabilitas Linux & CI Pinning (Task L):**
   - Standardisasi eksekusi pengujian menggunakan runner mandiri dengan environment terisolasi (`HOME`, `GIT_CONFIG_GLOBAL=/dev/null`, `LC_ALL=C`).
   - Pinning versi Bun `1.3.9` pada GitHub Actions workflow `astesia-gate.workflow.yml`.
   - Dokumentasi lengkap protokol verifikasi independen di Linux pada `docs/LINUX-VERIFICATION.md`.
5. **Interval Kepercayaan Wilson 95% & Review Pack Otomatis (Task S):**
   - Implementasi perhitungan batas atas Wilson 95% binomial satu sisi ($z = 1.96$) dengan pelaporan rasio cakupan (*coverage ratio*).
   - Pembuatan review pack otomatis `review-pack.md` dengan penyuntingan redaksi rahasia $\ge 6$ karakter menjadi `<redacted>`.
6. **Perluasan Uji Mutasi ke 65 Mutan (Task M):**
   - Menambahkan 17 mutan baru (`M49..M65`) yang menguji seluruh perilaku baru: generated policy v2, case-sensitivity, tsconfig recursive extends, baseline path ratchet, dan keamanan URL.
   - **100% Kill Rate:** 65/65 mutan berhasil dibunuh, 0 bertahan.
7. **Metrik Uji Terkonsolidasi (`all.ts`):**
   - **1.068 kasus uji total:** 1.061 passed, 0 failed, 7 active known gaps terverifikasi.
   - Invarian matematika $1.068 \equiv 1.061 + 0 + 7$ terpenuhi di seluruh 27 suite (0 orphan suites).
   - Pengujian siklus hidup baseline adoption 8 tahap lulus 100% pada proyek `flora-smk` dan `eduNEXA`.
   - Arsitektur single-file zero-dependency dipertahankan pada **3.082 baris** (di bawah batas maksimal 3.100 baris).

### 7.10 Gelombang 2A.7 (`wave2a.7/fixes`)
1. **Investigasi & Penutupan Celah Gelombang 2A.6 (I1–I5):**
   - **I1 (Rekonsiliasi Registri Known-Gaps):** Menginvestigasi klaim kemunculan gap `VER3-001-FP-KEY-SOLO`. Terbukti merupakan kesalahan penulisan/klasifikasi dalam teks laporan 2A.6, di mana perbaikan `VER3-001` (key matching tanpa tanda kutip) telah tuntas sejak 2A.2 via commit `5ed3666` dan diverifikasi dalam `key-sensitivity-suite.ts`. Registri `known-gaps.json` tetap bersih dengan tepat 6 ID aktif.
   - **I2 (Integritas Berkas Verifier Upstream):** Membuktikan 100% berkas dalam `verify/` (`afeacd4`), `verify2/` (`34110e2`), dan `verify3/` (`30a4ced`) identik bit-for-bit dengan hash blob git upstream (0 modifikasi).
   - **I3 (Rekonsiliasi BASE5 vs START):** Pemindaian komparatif pada 10 proyek nyata (3 DESIGN, 7 SEEN) menunjukkan temuan identik 100% (0 regresi, 0 deviasi tak terjelaskan).
   - **I4 (Pra-Pengukuran Proyek FRESH):** Mengukur secara objektif 3 proyek hold-out (`aipkani`, `ecommerce-hp-api`, `cadetspeak_admin`) menggunakan PRNG Mulberry32 (`seed: 0x2A7F00D`) dan membekukannya di `fresh-pre-measurement.json`.
   - **I5 (Konfirmasi Kerentanan Bypass Berkas Generated):** Membuktikan secara empiris bahwa penanda `// @generated` pada START memintas pemindaian seluruh berkas bahkan jika memuat rahasia kredensial aktif (`verify-comparison.json`).
2. **Kebijakan Berkas Generated v3 & Penutupan Bypass Total (Task G):**
   - Menghapus sepenuhnya bypass pemindaian berbasis penanda header (`@generated`, `GENERATED CODE`, dsb.). Penanda tersebut kini hanya memunculkan notice informasional `generated_header_candidates`.
   - Pengabaian fisik berkas generated dibatasi murni pada: (a) nama berkas berakhiran `\.(min|bundle)\.(js|mjs|cjs|css)$`, atau (b) heuristik minifikasi fisik (total karakter $\ge 5.000$ dan $\ge 50\%$ byte berada pada baris $\ge 1.000$ karakter).
   - Ratchet baseline mengunci kuota `generated_skipped`. Lulus 29/29 kasus uji di `generated-policy-v2-suite.ts`.
3. **Determinisme Tsconfig & Penanganan Alias Tak Terverifikasi (Task X):**
   - Melarang mutlak penelusuran `node_modules` saat mengurai `extends` konfigurasi `tsconfig.json`.
   - Konfigurasi yang memperluas modul eksternal mengeluarkan notice `tsconfig_unresolved_extends`. Path alias yang tidak dapat diverifikasi dicatat dalam notice `alias_unverified` dengan 0 false violation.
   - Determinisme terbukti 100% identik dengan vs tanpa `node_modules` melalui `verify-node-modules-determinism.ts`. Lulus 12/12 kasus uji di `tsconfig-determinism-suite.ts`.
4. **Penurunan False Positive & Generator Skema Tunggal (Task F & S):**
   - Mengembangkan generator skema tunggal `generate-comparison.ts` yang memproduksi `phase3-comparison.json` dengan metrik simetris `before` (START) vs `after` (HEAD) serta batas atas interval kepercayaan Wilson 95%.
   - **Disiplin Hold-Out Mutlak:** Menghasilkan 0 perubahan temuan ($\Delta = 0$) pada 7 proyek SEEN (tetap 287 temuan) dan 3 proyek FRESH (tetap 345 temuan).
   - **Penurunan FP Terukur:** Mengeliminasi 1 False Positive pada proyek DESIGN `flora-smk` (`OFFLINE_AUTH_KEY` nama kunci local storage terversi berentropi rendah) tanpa mengorbankan 1 pun True Positive (3 True Positive di `eunectes` tetap 100% terdeteksi).
   - Kepatuhan disiplin hold-out dan redaksi rahasia diverifikasi otomatis oleh `check-fix-evidence.ts`.
5. **Penegakan Pinning Versi Bun Eksak & Rules-Diff (Task W):**
   - Workflow guard GitHub Actions secara ketat mewajibkan semver eksak untuk `oven-sh/setup-bun` (misal `bun-version: 1.3.9`); versi mengambang (`latest`, `1.x`, `~1.3`) ditolak *fail-closed*.
   - Menambahkan opsi CLI `--rules-diff <ref>` untuk membandingkan aturan terhadap commit dasar. Suite `check-workflow-suite.ts` diperluas menjadi 24 pengujian.
6. **Portabilitas Linux & Kejelasan Status Eksekusi (Task L):**
   - Status pengujian lokal dilabeli secara transparan: `TIDAK DIUJI (UNVERIFIABLE)` karena host pengujian berbasis Windows x64.
   - Menyediakan skrip mandiri `templates/enforcement/tests/linux-verify.sh` dan panduan eksekusi Docker/WSL2 di `docs/LINUX-VERIFICATION.md`.
7. **Perluasan Uji Mutasi ke 73 Mutan (Task M):**
   - Menambahkan mutan `M66..M73` untuk menguji generated policy v3, determinisme tsconfig, aturan nama storage offline, dan pinning versi Bun.
   - **100% Kill Rate:** 73/73 mutan berhasil dibunuh, 0 mutan bertahan hidup.
8. **Benchmark Kinerja, Adopsi Baseline & Konsolidasi Harness:**
   - Adopsi baseline 8 tahap lulus 100% pada proyek DESIGN `flora-smk` dan FRESH `cadetspeak_admin`.
   - 15 pengujian triplet acak (Realistic, Stress, Startup, Eunectes) menunjukkan performa stabil tanpa regresi beban kerja ($\le 1.00$x vs START).
   - **Metrik Konsolidasi `all.ts`:**
     - **1.121 kasus uji unik total** (ambang batas $\ge 450$ terpenuhi).
     - 1.114 passed, 0 failed, 7 active known gaps terverifikasi.
     - Invarian matematika $1.121 \equiv 1.114 + 0 + 7$ terpenuhi di seluruh 30 suite (0 orphan suites).
     - Eksekusi klon bersih terisolasi di `%TEMP%` dengan `core.autocrlf=false` lulus 100% (`harness-clean-clone.json`).
   - Arsitektur single-file zero-dependency dipertahankan pada **3.104 baris** (di bawah batas ketat 3.200 baris).






