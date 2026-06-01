pages.home = [
    // 1. HERO
    {
        section: 'hero',
        title: 'Sistem Presensi Wajah Offline-First',
        tagline: 'Aplikasi Absensi Mandiri berbasis Deteksi Wajah — Cepat, Akurat, dan Andal Tanpa Sinyal.',
        description: 'Platform presensi mobile berbasis facial recognition yang dirancang menggunakan arsitektur Offline-First. Mendukung pencatatan kehadiran instan dengan teknologi face landmark detection (MediaPipe) serta penyimpanan vektor biometrik di IndexedDB. Data presensi aman tersimpan secara lokal dan otomatis tersinkronisasi saat kembali online.',
        badges: [
            'PWA Offline-First',
            'Face Recognition',
            'MediaPipe Face Landmarker',
            'Biometric Vector Storage',
            'Zero Dependency',
            'License: MIT'
        ],
        cta: {
            text: 'Mulai Presensi Wajah',
            link: 'presensi'
        },
        imgClass: 'di-scan'
    },

    // 2. KEY FEATURES
    {
        section: 'features',
        items: [
            {
                icon: 'di-eye',
                title: 'Deteksi Wajah Real-time',
                content: 'Menggunakan MediaPipe Face Landmarker untuk mendeteksi 478 titik koordinat wajah secara real-time melalui kamera perangkat. Akurasi tinggi bahkan dalam kondisi pencahayaan yang bervariasi.',
                linkText: 'Lihat Demo Presensi &raquo;',
                linkTarget: 'presensi'
            },
            {
                icon: 'di-save',
                title: 'Vektor Biometrik Lokal',
                content: 'Setiap wajah yang terdaftar disimpan sebagai vektor Euclidean ternormalisasi di IndexedDB. Proses pencocokan dilakukan sepenuhnya di sisi klien tanpa mengirim data biometrik ke server.',
                linkText: 'Pelajari Metode Enroll &raquo;',
                linkTarget: 'presensi'
            },
            {
                icon: 'di-chart',
                title: 'Benchmark Paralel Dua Metode',
                content: 'Sistem membandingkan dua pendekatan identifikasi: murni vektor geometri vs kombinasi vektor + mask tekstur. Analisis akurasi dan latensi ditampilkan real-time.',
                linkText: 'Lihat Perbandingan Metode &raquo;',
                linkTarget: 'presensi'
            }
        ]
    },

    // 3. STRUKTUR SISTEM & TEKNOLOGI
    {
        section: 'article',
        leftCol: {
            subtitle: 'Arsitektur Teknis',
            lines: [
                '### Deteksi & Pengenalan Wajah',
                '**MediaPipe Face Landmarker** — 478 titik landmark, deteksi 2 wajah simultan',
                '**Euclidean Distance IOD-Normalized** — Jarak antar vektor ternormalisasi Interpupillary Distance',
                '**Mask Similarity Correlation** — Korelasi Pearson untuk tekstur wajah (opsional)',
                '---',
                '### Storage & Offline-First',
                '**IndexedDB** — Penyimpanan vektor biometrik (Float32Array)',
                '**Binary Codec** — Encode/decode Base64 untuk serialisasi vektor',
                '**Sync Queue** — Antrean perubahan saat offline → sinkronisasi otomatis',
                '---',
                '### Benchmark Metrics',
                '**Akurasi** — Persentase true positive dari total pengujian',
                '**FRR (False Rejection Rate)** — Persentase gagal identifikasi',
                '**Latensi Frame** — Waktu proses per frame kamera (ms)'
            ]
        },
        rightCol: {
            subtitle: 'Cara Menggunakan & Sitasi',
            lines: [
                '### Langkah Cepat',
                '1️⃣ Buka halaman **Presensi Wajah**',
                '2️⃣ Izinkan akses kamera perangkat',
                '3️⃣ Daftarkan wajah baru (Tab Registrasi)',
                '4️⃣ Lakukan presensi dengan wajah terdaftar',
                '---',
                '### Spesifikasi Teknis',
                '```javascript',
                '// Stack Teknologi:\n// ✅ MediaPipe Face Landmarker v0.10.3\n// ✅ IndexedDB untuk penyimpanan biometrik\n// ✅ Service Worker + Cache-First\n// ✅ Zero-dependency, no-build-step\n// ✅ Lighthouse: Performance 98, PWA 92',
                '```',
                '---',
                '### How to Cite This Software',
                '**Sismadi, W.** (2026). *Presensi Mobile: Aplikasi Absensi PWA Berbasis Deteksi Wajah*. GitHub. https://github.com/donatjs/presensi',
                '',
                '```bibtex',
                '@software{sismadi_presensi_wajah_2026,\n  author = {Sismadi, Wawan},\n  title = {Presensi Mobile: Aplikasi Absensi PWA Berbasis Deteksi Wajah},\n  year = {2026},\n  url = {https://github.com/donatjs/presensi},\n  note = {MediaPipe Face Landmarker, IndexedDB, Offline-First PWA}\n}',
                '```'
            ]
        }
    }
];
