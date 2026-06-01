/**
 * presensi.js
 * Pola konsisten dengan kuis.js.
 * Dimuat sebelum presensi-patch.js.
 */

// ── Halaman utama — section 'presensi' di-render oleh presensi-patch.js ──
pages.presensi = [
    {
        section: 'titleHero',
        title:   'Presensi Kehadiran<br>Berbasis Deteksi Wajah',
        description: 'Catat kehadiran otomatis menggunakan kamera &amp; face-api.js — akurat, cepat, tanpa kertas.'
    },
    {
        section: 'presensi'
    }
];


// ── Dataset wajah siswa (seed awal) ──────────────────────────────────────
pages.presensiDb = {

    siswa: [
        { id:'X1001', name:'Andi Saputra',      kelas:'X-IPA 1', enrolledAt:'2026-01-15T07:00:00', active:true,  descriptors:[] },
        { id:'X1021', name:'Vino Ardiansyah',    kelas:'X-IPA 1', enrolledAt:'2026-01-15T07:00:00', active:true,  descriptors:[] }
    ],

    meta: {
        kelas:       'X-IPA 1',
        waliKelas:   'Budi Santoso, S.Pd.',
        tahunAjaran: '2025/2026',
        semester:    'Genap',
        sekolah:     'SMA Negeri 1 DonatJS'
    }
};
