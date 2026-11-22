## 4. Keterbatasan yang Diketahui

Bagian ini mencatat batasan teknis dari rilis gate enforcement saat ini:

1. **Model Pemindaian Tanpa AST**: Gate menggunakan pemindaian berbasis token karakter kustom, regex per baris, dan penelusuran struktur ringan. Gate TIDAK menggunakan parser berbasis Abstract Syntax Tree (AST) ataupun membentuk representasi pohon sintaksis bahasa secara penuh.
2. **Keterbatasan Evaluasi Statis**: Gate tidak mengevaluasi semantik eksekusi runtime, pengecekan tipe dinamis yang kompleks, pelacakan alur data antar-fungsi, ataupun dependensi pihak ketiga secara interaktif.
3. **Direktif Pembungkaman Inline**: Hanya direktif pembungkaman inline `astesia-allow` (wajib disertai alasan valid) dan penanda utang `astesia-debt` (wajib disertai klausul upgrade konkret) yang didukung. Direktif penonaktifan menyeluruh tidak didukung dalam rancangan gate.
4. **Kebijakan Pengecualian Berkas Generated**: Berkas yang dikenali sebagai artefak buatan generator dikecualikan dari aturan struktur kode umum, namun deteksi rahasia/kredensial dan integritas berkas tetap dipaksakan secara fail-closed.
5. **Integritas Konfigurasi dan Kegagalan Mutlak**: Setiap kegagalan dalam membaca konfigurasi, membaca aturan, atau mendeteksi kerusakan berkas aturan akan menghentikan eksekusi secara langsung (fail-closed dengan kode keluar 2), bukan mengabaikan pemeriksaan atau melanjutkan secara diam-diam.
