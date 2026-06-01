Berikut adalah perbaikan dari README yang terpotong:

# Presensi Mobile: Aplikasi Absensi PWA Berbasis Offline-First

![PWA Offline-First](https://img.shields.io/badge/PWA-Offline--First-purple)
![Sync Queue](https://img.shields.io/badge/Sync_Queue-IndexedDB-green)
![Framework](https://img.shields.io/badge/Framework-DonatJS-orange)
![License: MIT](https://img.shields.io/badge/License-MIT-lightgrey)
![DOI](https://img.shields.io/badge/DOI-10.5281%2Ffigshare.XXXXXXXX-blue)

Aplikasi presensi mandiri (absensi mobile) open-source berbasis Progressive Web App (PWA) dengan arsitektur **Offline-First**. Dibangun menggunakan [DonatJS](https://donat.id) — sebuah *zero-dependency, no-build-step, JSON-driven micro-framework*. Aplikasi ini memungkinkan pengguna melakukan pencatatan kehadiran (clock-in/clock-out) kapan saja meskipun tanpa koneksi internet, menyimpan data secara aman di penyimpanan lokal, dan menyinkronkannya secara otomatis saat jaringan kembali tersedia.

---

## Key Features

- **Offline-First Architecture** — Pengguna tetap dapat melakukan presensi tanpa sinyal. Data disimpan langsung di browser perangkat menggunakan `IndexedDB`.
- **Background Sync Queue** — Mengantrekan data presensi lokal saat offline dan otomatis mengirimkannya ke server backend via background processing begitu mendeteksi koneksi internet stabil.
- **JSON-Driven UI Component** — Seluruh struktur halaman dan komponen didefinisikan secara deklaratif sebagai objek JavaScript biasa (`pages.home`). Tanpa *bundler*, tanpa CMS backend yang rumit.
- **Zero-Dependency Runtime** — Berjalan langsung di peramban (browser) modern tanpa memerlukan Node.js, Webpack, Babel, atau pustaka eksternal lainnya.
- **Lighthouse Optimized** — Memenuhi standar audit Progressive Web App tinggi dengan indikator jaringan, *skeleton screen*, dan optimasi navigasi zona jempol (*thumb-zone*).
- **Integrated Certificate & Quiz Engine** — Menyediakan modul kuis terproteksi sandi dan modul verifikasi sertifikat internal menggunakan ID unik (`SLS-YYYY-NNN`).

---

## Prerequisites & Installation

Hanya memerlukan browser modern yang mendukung standar ES6+.

1. Clone repositori ini:
   ```bash
   git clone https://github.com/donatjs/presensi.git
   cd presensi
   ```

2. Jalankan menggunakan server file statis apa pun (misal: VS Code Live Server, Python http.server, atau Nginx).

3. Buka `index.html` di browser Anda. Tidak memerlukan langkah kompilasi atau build.

> **Catatan:** Berkas `script.js` dan `svg.js` dimuat langsung dari DonatJS Core CDN (`https://donatjs.github.io/core/`). Diperlukan koneksi internet pada pemuatan pertama, atau unduh berkas tersebut untuk kebutuhan full-self-hosting.

---

## Usage & Configuration

### Komponen Arsitektur Utama

| Bagian | Cakupan Teknis | Deskripsi |
|--------|----------------|-----------|
| 1: PWA Shell | Service Worker, Cache, Manifest | Menangani performa load instan, instalasi aplikasi ke homescreen, dan caching aset inti. |
| 2: Storage Lokal | IndexedDB, Log Presensi | Mengelola penyimpanan log kehadiran secara offline lengkap dengan koordinat dan timestamp aman. |
| 3: Sinkronisasi | Sync Queue, Network Detector | Mengelola antrean data presensi yang tertunda dan melakukan push otomatis saat status beralih ke online. |
| 4: Mobile UX | Touch Target, Layout Responsif | Desain antarmuka presensi yang ramah satu tangan, indikator status online/offline, dan ekspor data. |

### Contoh Struktur Data Presensi (`pages.home`)

```javascript
pages.home = [
    {
        section: 'hero',
        title: 'Sistem Presensi Mobile Offline-First',
        description: 'Aplikasi Absensi Mandiri berbasis PWA — Cepat, Ringan, dan Andal Tanpa Sinyal.'
    }
];
```

---

## How to Cite

```bibtex
@software{sismadi_presensi_mobile_2026,
  author       = {Sismadi, Wawan},
  title        = {{Presensi Mobile: Aplikasi Absensi PWA Berbasis Offline-First}},
  year         = {2026},
  publisher    = {Figshare},
  doi          = {10.5281/figshare.XXXXXXXX},
  url          = {https://github.com/donatjs/presensi},
  note         = {Sistem presensi mobile mandiri dengan arsitektur Offline-First.
                  Mendukung Service Worker caching, IndexedDB log, dan Sync Queue.
                  Dibangun di atas micro-framework DonatJS tanpa dependensi pihak ketiga.}
}
```

---

## License

Distributed under the MIT License. See `LICENSE` file for more information.
