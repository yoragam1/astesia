# Panduan Verifikasi Reproduktif Lingkungan Linux (Astesia Framework v3.0.0)

> **Status Host Audit Windows:** `UNVERIFIABLE` pada host eksekusi Windows lokal saat setup awal (WSL tidak terpasang, Docker daemon/CLI tidak tersedia). Dokumen ini menyajikan protokol deterministik untuk menjalankan verifikasi independen pada Linux (Ubuntu 22.04 LTS / Debian) menggunakan Bun v1.3.9 via WSL2 maupun Docker container `oven/bun:1.3.9`.

---

## 1. Verifikasi Menggunakan Docker (`oven/bun:1.3.9`)

Jalankan container terisolasi dengan me-mount direktori repository Astesia atau melakukan clone bersih:

```bash
# 1. Jalankan container interaktif oven/bun:1.3.9
docker run --rm -it -v "D:/Workspaces/Astesia:/workspace" -w /workspace oven/bun:1.3.9 bash

# 2. Di dalam container Linux, buat direktori clone bersih terisolasi di filesystem Linux native (/tmp)
mkdir -p /tmp/astesia-linux-verify
cd /tmp/astesia-linux-verify
git clone /workspace .
git checkout wave2a.6/fixes

# 3. Pastikan versi Bun tepat
bun --version # Wajib: 1.3.9

# 4. Siapkan environment terisolasi
export HOME=/tmp/astesia-empty-home
export USERPROFILE=/tmp/astesia-empty-home
export XDG_CONFIG_HOME=/tmp/astesia-empty-home
export GIT_CONFIG_GLOBAL=/dev/null
export GIT_CONFIG_SYSTEM=/dev/null
export GIT_CONFIG_NOSYSTEM=1
export LC_ALL=C
mkdir -p $HOME

# 5. Jalankan suite pengujian penuh
bun templates/enforcement/tests/all.ts --json > /workspace/.astesia/audit/wave2a.6/linux-clean-clone-all.json

# 6. Jalankan perbandingan golden terhadap proyek nyata (jika volume proyek nyata di-mount ke /projects)
# docker run --rm -it -v "D:/Workspaces/Astesia:/workspace" -v "D:/Workspaces:/projects" oven/bun:1.3.9 ...
bun .astesia/audit/wave2a.6/tools/golden-verify.ts
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
git checkout wave2a.6/fixes

# 4. Set environment terisolasi
export HOME=/tmp/astesia-empty-home
export USERPROFILE=/tmp/astesia-empty-home
export XDG_CONFIG_HOME=/tmp/astesia-empty-home
export GIT_CONFIG_GLOBAL=/dev/null
export GIT_CONFIG_SYSTEM=/dev/null
export GIT_CONFIG_NOSYSTEM=1
export LC_ALL=C
mkdir -p $HOME

# 5. Jalankan suite penuh
bun templates/enforcement/tests/all.ts --json

# 6. Salin hasil pengujian kembali ke repo Windows jika diperlukan
cp /tmp/astesia-linux-output.json /mnt/d/Workspaces/Astesia/.astesia/audit/wave2a.6/
```

---

## 3. Titik Verifikasi yang Harus Diperiksa di Linux

1. **Case-Sensitivity `ASTESIA-000`:** Pada Linux, filesystem bersifat case-sensitive asli (`ext4`). Resolusi import yang salah kapitalisasi (misal `./foo` untuk berkas `Foo.ts`) harus menghasilkan pelanggaran ASTESIA-000 yang identik dengan Windows.
2. **Ketiadaan Hardcoded `NUL`:** Pemanggilan git dengan `GIT_CONFIG_GLOBAL=/dev/null` dan `GIT_CONFIG_SYSTEM=/dev/null` tidak boleh melempar error I/O atau mencoba membuat berkas bernama `NUL`.
3. **Akuntansi `all.ts`:** Invarian `total === passed + failed + known_gaps` terpenuhi, failed = 0, mutasi seluruhnya terbunuh (killed = 100%).
