# Panduan Verifikasi Reproduktif Lingkungan Linux (Astesia Framework v3.0.0)

> **Status Host Audit Windows:** `TIDAK DIUJI (UNVERIFIABLE)` pada host eksekusi Windows lokal (WSL tidak terpasang, Docker daemon/CLI tidak tersedia pada sesi implementer). Dokumen ini menyajikan protokol deterministik untuk menjalankan verifikasi independen pada Linux (Ubuntu 22.04 LTS / Debian) menggunakan Bun v1.3.9 via WSL2 maupun Docker container `oven/bun:1.3.9` melalui skrip otomatis `templates/enforcement/tests/linux-verify.sh`.

---

## 1. Verifikasi Menggunakan Docker (`oven/bun:1.3.9`)

Jalankan container terisolasi secara one-shot langsung menggunakan skrip verifikasi Linux resmi:

```bash
# Eksekusi one-shot runner otomatis:
docker run --rm -v $(pwd):/workspace -w /workspace oven/bun:1.3.9 sh templates/enforcement/tests/linux-verify.sh
```

Atau lakukan verifikasi interaktif di dalam container:

```bash
# 1. Jalankan container interaktif oven/bun:1.3.9
docker run --rm -it -v "D:/Workspaces/Astesia:/workspace" -w /workspace oven/bun:1.3.9 bash

# 2. Di dalam container Linux, buat direktori clone bersih terisolasi di filesystem Linux native (/tmp)
mkdir -p /tmp/astesia-linux-verify
cd /tmp/astesia-linux-verify
git clone /workspace .
git checkout wave2a.7/fixes

# 3. Jalankan skrip verifikasi otomatis
sh templates/enforcement/tests/linux-verify.sh
```

---

## 2. Verifikasi Menggunakan WSL2 (Windows Subsystem for Linux)

```bash
# 1. Buka shell WSL2 (Ubuntu)
wsl

# 2. Pastikan Bun terpasang dengan versi 1.3.9
curl -fsSL https://bun.sh/install | bash -s "bun-v1.3.9"
source ~/.bashrc
bun --version # Wajib 1.3.9

# 3. Salin repository ke filesystem Linux asli (BUKAN di /mnt/d/... untuk menghindari latensi dan perbedaan case-sensitivity 9P)
mkdir -p ~/astesia-verify
cd ~/astesia-verify
git clone /mnt/d/Workspaces/Astesia .
git checkout wave2a.7/fixes

# 4. Jalankan skrip verifikasi terisolasi
sh templates/enforcement/tests/linux-verify.sh
```

---

## 3. Titik Verifikasi yang Harus Diperiksa di Linux

1. **Case-Sensitivity `ASTESIA-000`:** Pada Linux, filesystem bersifat case-sensitive asli (`ext4`). Resolusi import yang salah kapitalisasi (misal `./foo` untuk berkas `Foo.ts`) harus menghasilkan pelanggaran ASTESIA-000 yang identik dengan Windows.
2. **Ketiadaan Hardcoded `NUL`:** Pemanggilan git dengan `GIT_CONFIG_GLOBAL=/dev/null` dan `GIT_CONFIG_SYSTEM=/dev/null` tidak boleh melempar error I/O atau mencoba membuat berkas bernama `NUL`.
3. **Akuntansi `all.ts`:** Invarian `total === passed + failed + known_gaps` terpenuhi, failed = 0, mutasi seluruhnya terbunuh (killed = 100%).
