Berikut README.md yang sudah diperbaiki dengan format yang benar dan tidak terpotong:

```markdown
# Presensi Mobile — Aplikasi Absensi PWA Berbasis Deteksi Wajah

![PWA Offline-First](https://img.shields.io/badge/PWA-Offline--First-purple)
![Face Recognition](https://img.shields.io/badge/Face_Recognition-MediaPipe-blue)
![IndexedDB](https://img.shields.io/badge/Storage-IndexedDB-green)
![Framework](https://img.shields.io/badge/Framework-DonatJS-orange)
![License: MIT](https://img.shields.io/badge/License-MIT-lightgrey)

Aplikasi presensi mandiri (absensi mobile) open-source berbasis **Progressive Web App (PWA)** dengan arsitektur **Offline-First** yang dilengkapi teknologi **pengenalan wajah (facial recognition)** menggunakan MediaPipe Face Landmarker. Dibangun menggunakan [DonatJS](https://donat.id) — sebuah *zero-dependency, no-build-step, JSON-driven micro-framework*.

---

## ✨ Fitur Utama

- **Face Recognition Real-time** — Deteksi 478 titik landmark wajah, pencocokan vektor Euclidean ternormalisasi
- **Dual Method Benchmark** — Perbandingan simultan: metode vektor murni vs kombinasi vektor + mask tekstur
- **Offline-First Architecture** — Seluruh proses deteksi & pencocokan wajah berjalan di sisi klien tanpa koneksi internet
- **Biometric Vector Storage** — Penyimpanan vektor biometrik di IndexedDB dengan serialisasi Base64
- **Sync Queue** — Antrean data presensi lokal, sinkronisasi otomatis saat online
- **Live Benchmark Panel** — Monitor akurasi, FRR, dan latensi kedua metode secara real-time
- **Export Log** — Ekspor riwayat presensi dan benchmark match ke format CSV/JSON
- **Mobile UX Optimized** — Touch Target 44px, Thumb Zone navigation, Skeleton Screen

---

## 🛠️ Teknologi

| Komponen | Teknologi |
|----------|-----------|
| Face Detection | MediaPipe Face Landmarker v0.10.3 (478 titik) |
| Similarity Metric | Euclidean Distance (IOD-normalized) |
| Mask Similarity | Pearson Correlation Coefficient |
| Storage | IndexedDB + Base64 Binary Codec |
| PWA Core | Service Worker (Cache-First) |
| Framework | DonatJS (JSON-driven CSR) |
| Audit Score | Lighthouse Performance: 98, PWA: 92 |

---

## 📦 Instalasi

```bash
git clone https://github.com/donatjs/presensi.git
cd presensi
# Gunakan server statis (Live Server, Python http.server, dll)
# Buka index.html di browser modern
```

> **Catatan:** Koneksi internet diperlukan saat pertama kali untuk memuat MediaPipe CDN. Setelah itu, aplikasi dapat berjalan offline sepenuhnya.

---

## 🚀 Penggunaan

1. Buka halaman **Presensi Wajah** melalui navigasi menu
2. Izinkan akses kamera browser

### Registrasi Wajah Baru (Tab Registrasi)

- Masukkan nama subjek
- Arahkan wajah ke dalam oval panduan
- Sistem akan mengambil 5 sampel landmark

### Presensi (Tab Presensi Mandiri)

- Arahkan wajah yang sudah terdaftar
- Sistem mencocokkan secara real-time
- Notifikasi sukses tampil dengan data jarak Euclidean

---

## 📊 Benchmark Panel

Sistem menjalankan dua metode identifikasi secara paralel setiap frame:

| Metode | Deskripsi | Threshold |
|--------|-----------|-----------|
| Vektor Murni | Euclidean distance dari 100 titik landmark | 0.016 |
| Vektor + Mask | Kombinasi jarak vektor + korelasi tekstur wajah | 0.022 / 0.72 |

Panel menampilkan:

- Akurasi kumulatif & FRR per metode
- Latensi frame & rata-rata
- Perbandingan unggul akurasi dan kecepatan
- Analisis pengaruh kondisi cahaya

---

## 📁 Struktur Proyek

```
presensi/
├── index.html          # Entry point PWA
├── script.js           # DonatJS core engine + routing
├── style.css           # Styling global & komponen
├── benchmark.js        # Biometric benchmark engine v1.6.0
├── presensi-patch.js   # Face recognition module v1.2.0
├── pages/
│   ├── home.js         # Halaman utama
│   └── presensi.js     # Konfigurasi halaman presensi
└── assets/             # Ikon & aset statis
```

---

## 📝 Cara Sitasi

```bibtex
@software{sismadi_presensi_wajah_2026,
  author       = {Sismadi, Wawan},
  title        = {Presensi Mobile: Aplikasi Absensi PWA Berbasis Deteksi Wajah},
  year         = {2026},
  url          = {https://github.com/donatjs/presensi},
  note         = {MediaPipe Face Landmarker, IndexedDB, Offline-First PWA}
}
```

**Sismadi, W.** (2026). *Presensi Mobile: Aplikasi Absensi PWA Berbasis Deteksi Wajah*. GitHub. https://github.com/donatjs/presensi

---

## 📜 Lisensi

MIT License — © 2026 Wawan Sismadi

---

## 🔗 Tautan Terkait

- [DonatJS Framework](https://donat.id)
- [MediaPipe Face Landmarker](https://developers.google.com/mediapipe/solutions/vision/face_landmarker)
- [Laporan Benchmark](benchmark_matchlog_*.csv)
```
 
