pages.home = [
    // 1. HERO
    {
        section: 'hero',
        title: 'Sistem Presensi Mobile Offline-First',
        tagline: 'Aplikasi Absensi Mandiri berbasis PWA — Cepat, Ringan, dan Andal Tanpa Sinyal.',
        description: 'Platform presensi mobile berbasis open-source yang dirancang menggunakan arsitektur Offline-First. Mendukung pencatatan kehadiran instan menggunakan IndexedDB dan Sync Queue, memastikan data presensi aman tersimpan secara lokal dan otomatis tersinkronisasi saat kembali online.',
        badges: [
            'PWA Offline-First',
            'Presensi Mandiri',
            'Sync Queue + IndexedDB',
            'Zero Dependency',
            'License: MIT',
            'DOI: 10.5281/figshare.XXXXXXXX'
        ],
        cta: {
            text: 'Mulai Presensi',
            link: 'learn'
        },
        imgClass: 'di-donat'
    },

    // 2. KEY FEATURES
    {
        section: 'features',
        items: [
            {
                icon: 'di-web',
                title: 'Akses Instan & Reliable',
                content: 'Menggunakan Service Worker dan strategi caching optimal untuk memastikan aplikasi presensi dapat dimuat dalam waktu kurang dari satu detik, bahkan di area dengan koneksi internet buruk.',
                linkText: 'Lihat Sistem Caching &raquo;',
                linkTarget: 'learn/modul01'
            },
            {
                icon: 'di-setting',
                title: 'Arsitektur Offline-First',
                content: 'Karyawan atau mahasiswa dapat melakukan clock-in/clock-out tanpa koneksi internet. Data presensi masuk ke antrean lokal dengan penanda waktu (timestamp) yang valid.',
                linkText: 'Pelajari Mekanisme Offline &raquo;',
                linkTarget: 'learn/modul05'
            },
            {
                icon: 'di-code',
                title: 'Sinkronisasi Otomatis',
                content: 'Memanfaatkan kombinasi IndexedDB dan Sync Queue untuk resolusi konflik data. Proses sinkronisasi otomatis berjalan di latar belakang (background sync) begitu perangkat mendeteksi sinyal internet.',
                linkText: 'Eksplorasi Sinkronisasi Data &raquo;',
                linkTarget: 'learn/modul09'
            }
        ]
    },

    // 3. STRUKTUR SISTEM & SITASI
    {
        section: 'article',
        leftCol: {
            subtitle: 'Komponen Arsitektur Sistem',
            lines: [
                '### Bagian 1: Antarmuka & PWA Shell',
                '**K1** — App Shell Architecture & Manifest',
                '**K2** — Service Worker Lifecycle & Activation',
                '**K3** — Cache-First Strategy untuk Aset Statis',
                '**K4** — Komponen Antarmuka UI Presensi Responsif',
                '---',
                '### Bagian 2: Manajemen Data Lokal',
                '**K5** — Integrasi IndexedDB untuk Penyimpanan Presensi',
                '**K6** — Skema Data Log Kehadiran & Timestamping',
                '**K7** — Penanganan Validasi Koordinat Lokasi Dasar',
                '**K8** — Pengujian Storage Quota di Browser Mobile',
                '---',
                '### Bagian 3: Sinkronisasi & Komunikasi',
                '**K9** — Implementasi Antrean Perubahan (Sync Queue)',
                '**K10** — Deteksi Status Jaringan (Online/Offline Indicator)',
                '**K11** — Mekanisme Auto-Sync Background Processing',
                '---',
                '### Bagian 4: Keamanan & Dasbor Pelaporan',
                '**K12** — Validasi Integritas Data Presensi Lokal',
                '**K13** — Ekspor Log Presensi ke Format CSV/JSON',
                '**K14** — Optimasi Touch Target & Desain Thumb-Zone',
                '**K15** — Review Performa via Lighthouse Audit',
                '**K16** — Deployment & Integrasi Endpoint API'
            ]
        },
        rightCol: {
            subtitle: 'Target Aplikasi & Cara Sitasi',
            lines: [
                '### Spesifikasi Teknis Aplikasi',
                'Aplikasi **Presensi Mobile** wajib memenuhi standar PWA Offline-First berikut:',
                '```javascript',
                '// Spesifikasi Teknis Utama:\n// ✅ PWA Installable (manifest.json + Service Worker)\n// ✅ Offline Clock-In/Out: CRUD berjalan tanpa koneksi\n// ✅ Sync Queue: antrean presensi lokal saat offline\n// ✅ Auto-Sync: pengiriman otomatis saat kembali online\n// ✅ Mobile UX: Touch Target 44px + Thumb Zone Nav\n// ✅ UI Feedback: Skeleton Screen & Status Indikator Jaringan\n// ✅ Lighthouse PWA Score ≥ 80',
                '```',
                '---',
                '### Matriks Kualitas Aplikasi',
                'skill:30%:Fungsionalitas PWA & Offline (Service Worker + Cache):Utama',
                'skill:30%:Manajemen Data & Sinkronisasi (IndexedDB + Sync Queue):Core',
                'skill:20%:Responsivitas UI & Pengalaman Pengguna (Mobile UX):Desain',
                'skill:20%:Validasi Penanda Waktu & Keamanan Kode:Profesional',
                '---',
                '### How to Cite This Software',
                '**Wawan Sismadi.** (2026). *Presensi Mobile: Aplikasi Absensi PWA Berbasis Offline-First*. Figshare. DOI: 10.5281/figshare.XXXXXXXX'
            ]
        }
    }
];
