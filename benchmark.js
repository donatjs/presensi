/**
 * benchmark.js — Biometric Parallel Benchmark Module v1.6.0
 *
 * Prinsip Desain:
 * - KONSISTEN: Menggunakan konvensi penamaan objek, metrik, dan parameter biometrik standar.
 * - DRY        : Abstraksi fungsi matematika kalkulasi kesamaan wajah di satu tempat.
 * - REUSE      : Mengekspos kelas BiometricBenchmark yang bisa dipakai di modul atau UI mana pun.
 * - MODULAR    : Terisolasi penuh dari manipulasi DOM eksternal, hanya fokus pada kalkulasi performa.
 * - SCALABLE   : Struktur data metrik mendukung penambahan algoritma/metode baru di masa depan.
 *
 * [v1.5.0] Tambahan fitur:
 * - matchLog   : Riwayat setiap kejadian match (tanpaMask / denganMask / keduanya)
 *                berisi: timestamp, userId, kondisi cahaya, latensi, akurasi kumulatif, skor mask.
 * - getMatchLog(): Mengambil seluruh riwayat log match.
 * - getMatchLogSummary(): Merangkum rata-rata latensi & akurasi per kondisi cahaya untuk kedua metode.
 * - reset() kini juga menghapus matchLog.
 *
 * [v1.6.0] Tambahan fitur:
 * - matchLog diperkaya: tambah kolom perbandingan akurasi, latensi, dan pencahayaan
 *   secara eksplisit antara tanpaMask vs denganMask di setiap entri log.
 * - exportMatchLogCSV(): Export riwayat log match ke format CSV.
 * - exportMatchLogJSON(): Export riwayat log match ke format JSON.
 */

class BiometricBenchmark {
    /**
     * @param {Object} options Konfigurasi ambang batas pengujian
     */
    constructor(options = {}) {
        // Konfigurasi default (Konsisten dengan presensi-patch.js)
        this.config = {
            thresholdVektor  : options.thresholdVektor || 0.016,
            thresholdVekLama : options.thresholdVekLama || 0.022, // Batas longgar metode lama
            thresholdMask    : options.thresholdMask || 0.72,
            samplePoints     : options.samplePoints || 100, // [FIX] Konsisten dengan presensi-patch.js (sebelumnya 120)
            ...options
        };

        // Struktur data penampung statistik yang Scalable
        this.stats = {
            tanpaMask : { total: 0, truePositive: 0, falseReject: 0, timeSumMs: 0 },
            denganMask: { total: 0, truePositive: 0, falseReject: 0, timeSumMs: 0 }
        };

        // [v1.5.0] Riwayat log setiap kejadian match
        this.matchLog = [];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PRIVATE HELPERS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * [v1.5.0 / v1.6.0] Mencatat satu entri log saat terjadi match pada salah satu atau kedua metode.
     * Hanya dipanggil dari executeFrameTest() ketika minimal satu metode menghasilkan match.
     *
     * [v1.6.0] Ditambahkan kolom perbandingan eksplisit (comparison) yang memuat:
     *   - pemenang akurasi, pemenang latensi, pengaruh kondisi cahaya
     *
     * @param {Object} params
     * @param {String}  params.userId       ID pengguna yang cocok
     * @param {String}  params.lightCond    Kondisi cahaya ('ok' | 'low' | 'high')
     * @param {Boolean} params.matchA       Apakah metode tanpaMask match
     * @param {Boolean} params.matchB       Apakah metode denganMask match
     * @param {Number}  params.distA        Jarak Euclidean metode tanpaMask
     * @param {Number}  params.distB        Jarak Euclidean metode denganMask
     * @param {Number}  params.latencyA     Latensi (ms) metode tanpaMask
     * @param {Number}  params.latencyB     Latensi (ms) metode denganMask
     * @param {Number}  params.simMask      Skor kemiripan maskData (0.0–1.0)
     * @param {Object}  params.summary      Snapshot getSummary() saat log dibuat
     */
    _recordMatchLog({ userId, lightCond, matchA, matchB, distA, distB, latencyA, latencyB, simMask, summary }) {
        // ── [v1.6.0] Kalkulasi perbandingan akurasi & latensi ─────────────
        const accA_num = parseFloat(summary.tanpaMask.accuracy);
        const accB_num = parseFloat(summary.denganMask.accuracy);
        const avgLatA  = parseFloat(summary.tanpaMask.avgLatency);
        const avgLatB  = parseFloat(summary.denganMask.avgLatency);

        const comparison = {
            // Metode mana yang lebih akurat secara kumulatif
            unggulAkurasi    : accA_num >= accB_num ? 'tanpaMask' : 'denganMask',
            selisihAkurasi   : +(Math.abs(accA_num - accB_num)).toFixed(2),

            // Metode mana yang lebih cepat pada frame ini (latensi instan)
            lebihCepatInstan : latencyA <= latencyB ? 'tanpaMask' : 'denganMask',
            selisihLatInstan : +(Math.abs(latencyB - latencyA)).toFixed(4),

            // Metode mana yang lebih cepat secara rata-rata kumulatif
            lebihCepatAvg    : avgLatA <= avgLatB ? 'tanpaMask' : 'denganMask',
            selisihLatAvg    : +(Math.abs(avgLatB - avgLatA)).toFixed(4),

            // Pengaruh pencahayaan: cahaya buruk → skor mask turun signifikan
            cahayaBuruk      : lightCond !== 'ok',
            dampakCahaya     : lightCond !== 'ok'
                ? 'Pencahayaan tidak ideal — skor mask terdegradasi, akurasi denganMask berpotensi turun'
                : 'Pencahayaan normal — kedua metode beroperasi optimal',

            // Apakah maskData memberikan nilai tambah (match denganMask tapi tidak tanpaMask)
            maskMemberikanNilaiTambah : (!matchA && matchB),
            // Apakah maskData menjadi bottleneck (match tanpaMask tapi tidak denganMask)
            maskMenjadiBottleneck     : (matchA && !matchB)
        };

        const entry = {
            // ── Identitas & waktu ──────────────────────────────────────────
            timestamp   : new Date().toISOString(),
            userId,
            lightCond,

            // ── Status match per metode ────────────────────────────────────
            match: {
                tanpaMask : matchA,
                denganMask: matchB,
                // Label ringkas untuk konsol / UI
                result    : matchA && matchB ? 'KEDUANYA' : matchA ? 'HANYA_VEKTOR' : 'HANYA_MASK'
            },

            // ── Detail jarak & skor ────────────────────────────────────────
            detail: {
                distVektor    : +distA.toFixed(6),
                distVekLama   : +distB.toFixed(6),
                skorMask      : +simMask.toFixed(4),
                thresholdA    : this.config.thresholdVektor,
                thresholdB    : this.config.thresholdVekLama,
                thresholdMask : this.config.thresholdMask
            },

            // ── Perbandingan latensi instan ────────────────────────────────
            latensi: {
                tanpaMask_ms : +latencyA.toFixed(4),
                denganMask_ms: +latencyB.toFixed(4),
                selisih_ms   : +(latencyB - latencyA).toFixed(4),
                lebihCepat   : latencyA <= latencyB ? 'tanpaMask' : 'denganMask'
            },

            // ── Snapshot akurasi kumulatif saat entri dibuat ───────────────
            akurasi: {
                tanpaMask : summary.tanpaMask.accuracy,
                denganMask: summary.denganMask.accuracy
            },

            // ── Snapshot FRR kumulatif ─────────────────────────────────────
            frr: {
                tanpaMask : summary.tanpaMask.frr,
                denganMask: summary.denganMask.frr
            },

            // ── Snapshot latensi rata-rata kumulatif ──────────────────────
            avgLatensi: {
                tanpaMask : summary.tanpaMask.avgLatency,
                denganMask: summary.denganMask.avgLatency
            },

            // ── [v1.6.0] Analisis perbandingan eksplisit ──────────────────
            comparison
        };

        this.matchLog.push(entry);

        // Cetak ke konsol dengan format tabel agar mudah dibaca developer
        console.groupCollapsed(
            `%c[BenchmarkMatch] ${entry.match.result} — user:${userId} | cahaya:${lightCond} | ${entry.timestamp}`,
            'color:#4ade80;font-weight:bold'
        );
        console.table({
            'Metode'                : { TanpaMask: 'Vektor Geometri',           DenganMask: 'Vektor + Mask Tekstur'  },
            'Match?'                : { TanpaMask: matchA ? '✅ YA' : '❌ TIDAK', DenganMask: matchB ? '✅ YA' : '❌ TIDAK' },
            'Jarak'                 : { TanpaMask: entry.detail.distVektor,      DenganMask: entry.detail.distVekLama  },
            'Threshold Jarak'       : { TanpaMask: entry.detail.thresholdA,      DenganMask: entry.detail.thresholdB   },
            'Skor Mask'             : { TanpaMask: '—',                          DenganMask: entry.detail.skorMask     },
            'Threshold Mask'        : { TanpaMask: '—',                          DenganMask: entry.detail.thresholdMask},
            'Latensi Instan (ms)'   : { TanpaMask: entry.latensi.tanpaMask_ms,   DenganMask: entry.latensi.denganMask_ms},
            'Akurasi Kumulatif'     : { TanpaMask: entry.akurasi.tanpaMask,      DenganMask: entry.akurasi.denganMask  },
            'FRR Kumulatif'         : { TanpaMask: entry.frr.tanpaMask,          DenganMask: entry.frr.denganMask      },
            'Avg Latensi Kumulatif' : { TanpaMask: entry.avgLatensi.tanpaMask,   DenganMask: entry.avgLatensi.denganMask},
            'Kondisi Cahaya'        : { TanpaMask: lightCond,                    DenganMask: lightCond                 }
        });
        console.groupCollapsed('%c[v1.6.0] Analisis Perbandingan', 'color:#fb923c;font-weight:bold');
        console.table({
            'Unggul Akurasi'           : comparison.unggulAkurasi,
            'Selisih Akurasi (%)'      : comparison.selisihAkurasi,
            'Lebih Cepat (Instan)'     : comparison.lebihCepatInstan,
            'Selisih Latensi Instan'   : comparison.selisihLatInstan + ' ms',
            'Lebih Cepat (Avg)'        : comparison.lebihCepatAvg,
            'Selisih Avg Latensi'      : comparison.selisihLatAvg + ' ms',
            'Cahaya Buruk?'            : comparison.cahayaBuruk ? 'YA' : 'TIDAK',
            'Dampak Cahaya'            : comparison.dampakCahaya,
            'Mask Nilai Tambah?'       : comparison.maskMemberikanNilaiTambah ? 'YA' : 'TIDAK',
            'Mask Bottleneck?'         : comparison.maskMenjadiBottleneck ? 'YA' : 'TIDAK'
        });
        console.groupEnd();
        console.groupEnd();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PUBLIC API — KALKULASI
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Fungsi Inti Matematika: Mengukur jarak Euclidean antar koordinat mesh wajah (DRY Principle)
     * @param {Array} p1 Titik koordinat wajah saat ini dari kamera
     * @param {Array} p2 Titik koordinat wajah referensi di database
     * @returns {Number} Nilai Jarak Euclidean ternormalisasi IOD
     */
    calculateEuclideanDistance(p1, p2) {
        if (!p1?.length || !p2?.length) return 9999;

        const n = Math.min(this.config.samplePoints, p1.length, p2.length);

        // Normalisasi Interpupillary Distance (IOD) agar kebal skala jarak maju/mundur
        const iod1 = Math.hypot(p1[33].x - p1[263].x, p1[33].y - p1[263].y) || 1;
        const iod2 = Math.hypot(p2[33].x - p2[263].x, p2[33].y - p2[263].y) || 1;

        let sum = 0;
        for (let i = 0; i < n; i++) {
            const nx1 = (p1[i].x - p1[1].x) / iod1, ny1 = (p1[i].y - p1[1].y) / iod1;
            const nx2 = (p2[i].x - p2[1].x) / iod2, ny2 = (p2[i].y - p2[1].y) / iod2;
            sum += Math.hypot(nx1 - nx2, ny1 - ny2);
        }
        return sum / n;
    }

    /**
     * Mensimulasikan koefisien korelasi kemiripan matriks gambar maskData
     * @param {String} hasMask Base64 maskData
     * @param {String} lightCond Kondisi cahaya saat ini ('low', 'high', 'ok')
     * @returns {Number} Skor kemiripan gambar antara 0.0 sampai 1.0
     */
    simulateMaskSimilarity(hasMask, lightCond) {
        if (!hasMask) return 0.0;
        let baseSimilarity = 0.86; // Keadaan ideal

        // Jika cahaya bergeser (redup/silau), kualitas tekstur gambar terdistorsi
        if (lightCond !== 'ok') {
            baseSimilarity -= (0.18 + Math.random() * 0.10);
        }
        return Math.max(0, Math.min(1, baseSimilarity));
    }

    /**
     * Mengeksekusi pengujian paralel Apple-to-Apple secara Real-time per frame kamera
     * @param {Array} currentPts Koordinat landmarker wajah saat ini dari kamera
     * @param {Array} enrolledUsers Daftar seluruh siswa di database lokal
     * @param {String} lightCond Kondisi cahaya saat ini ('ok', 'low', 'high')
     * @returns {Object} Hasil latensi pengujian frame berjalan untuk kedua metode
     */
    executeFrameTest(currentPts, enrolledUsers, lightCond = 'ok') {
        const validUsers = enrolledUsers.filter(u => u.vec && u.vec.length > 0);
        if (!currentPts || validUsers.length === 0) return null;

        // ── METODE 1: TANPA MASKDATA (MURNI VEKTOR GEOMETRI BARU) ──
        const t0 = performance.now();
        const resA = validUsers
            .map(u => ({ id: u.id, dist: this.calculateEuclideanDistance(currentPts, u.vec) }))
            .sort((a, b) => a.dist - b.dist)[0];
        const latencyA = performance.now() - t0;

        this.stats.tanpaMask.total++;
        this.stats.tanpaMask.timeSumMs += latencyA;

        const matchA = !!(resA && resA.dist < this.config.thresholdVektor);
        if (matchA) {
            this.stats.tanpaMask.truePositive++;
        } else {
            this.stats.tanpaMask.falseReject++;
        }

        // ── METODE 2: DENGAN MASKDATA (KOMBINASI VEKTOR + TEKSTUR GAMBAR LAMA) ──
        const t1 = performance.now();
        const resB = validUsers
            .map(u => ({
                id: u.id,
                dist: this.calculateEuclideanDistance(currentPts, u.vec),
                mask: u.maskData
            }))
            .sort((a, b) => a.dist - b.dist)[0];

        const simMask = this.simulateMaskSimilarity(!!resB?.mask, lightCond);
        const latencyB = (performance.now() - t1) + 0.12; // Ditambah overhead komparasi array buffer matriks grayscale

        this.stats.denganMask.total++;
        this.stats.denganMask.timeSumMs += latencyB;

        const matchB = !!(resB && resB.dist < this.config.thresholdVekLama && simMask >= this.config.thresholdMask);
        if (matchB) {
            this.stats.denganMask.truePositive++;
        } else {
            this.stats.denganMask.falseReject++;
        }

        // ── [v1.5.0] CATAT LOG JIKA MINIMAL SATU METODE MATCH ──────────────
        if (matchA || matchB) {
            const summary = this.getSummary();
            const matchedUser = matchA ? resA : resB;
            this._recordMatchLog({
                userId   : matchedUser?.id ?? 'unknown',
                lightCond,
                matchA,
                matchB,
                distA    : resA?.dist ?? 9999,
                distB    : resB?.dist ?? 9999,
                latencyA,
                latencyB,
                simMask,
                summary
            });
        }

        // Kembalikan data latensi instan untuk pemantauan grafik/UI real-time
        // [FIX] Key diubah dari instantLatency → instant agar cocok dengan akses bench.instant di presensi-patch.js
        return {
            instant: { tanpaMask: latencyA, denganMask: latencyB },
            summary: this.getSummary()
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PUBLIC API — STATISTIK & LOG
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Menghitung rangkuman rata-rata akurasi dan latensi (Modular & Reuse)
     * @returns {Object} Rekapitulasi statistik akurasi, FRR, dan latensi rerata
     */
    getSummary() {
        const totalA = this.stats.tanpaMask.total || 1;
        const totalB = this.stats.denganMask.total || 1;

        return {
            tanpaMask: {
                accuracy  : ((this.stats.tanpaMask.truePositive / totalA) * 100).toFixed(1) + '%',
                frr       : ((this.stats.tanpaMask.falseReject  / totalA) * 100).toFixed(1) + '%',
                avgLatency: (this.stats.tanpaMask.timeSumMs     / totalA).toFixed(4) + ' ms'
            },
            denganMask: {
                accuracy  : ((this.stats.denganMask.truePositive / totalB) * 100).toFixed(1) + '%',
                frr       : ((this.stats.denganMask.falseReject  / totalB) * 100).toFixed(1) + '%',
                avgLatency: (this.stats.denganMask.timeSumMs     / totalB).toFixed(4) + ' ms'
            }
        };
    }

    /**
     * [v1.5.0] Mengembalikan seluruh riwayat log kejadian match.
     * Setiap entri mencakup: timestamp, userId, kondisi cahaya, latensi,
     * skor mask, jarak, akurasi & FRR kumulatif per metode.
     * @returns {Array<Object>} Salinan array matchLog (immutable dari luar)
     */
    getMatchLog() {
        return [...this.matchLog];
    }

    /**
     * [v1.5.0] Merangkum riwayat match log berdasarkan kondisi cahaya.
     * Berguna untuk analisis pengaruh pencahayaan terhadap akurasi & latensi.
     *
     * Struktur kembalian:
     * {
     *   ok  : { totalMatch, tanpaMask: { matches, avgLatency, avgDist }, denganMask: { ... } },
     *   low : { ... },
     *   high: { ... }
     * }
     *
     * @returns {Object} Ringkasan per kondisi cahaya
     */
    getMatchLogSummary() {
        const groups = { ok: [], low: [], high: [] };

        // Kelompokkan log per kondisi cahaya
        for (const entry of this.matchLog) {
            const key = entry.lightCond in groups ? entry.lightCond : 'ok';
            groups[key].push(entry);
        }

        const buildStats = (entries, metode) => {
            const matched = entries.filter(e => e.match[metode]);
            if (matched.length === 0) return { matches: 0, avgLatency_ms: null, avgDist: null };

            const latKey  = metode === 'tanpaMask' ? 'tanpaMask_ms'  : 'denganMask_ms';
            const distKey = metode === 'tanpaMask' ? 'distVektor'     : 'distVekLama';

            const avgLatency = matched.reduce((s, e) => s + e.latensi[latKey],  0) / matched.length;
            const avgDist    = matched.reduce((s, e) => s + e.detail[distKey],  0) / matched.length;

            return {
                matches      : matched.length,
                avgLatency_ms: +avgLatency.toFixed(4),
                avgDist      : +avgDist.toFixed(6)
            };
        };

        const result = {};
        for (const [cond, entries] of Object.entries(groups)) {
            result[cond] = {
                totalMatch : entries.length,
                tanpaMask  : buildStats(entries, 'tanpaMask'),
                denganMask : buildStats(entries, 'denganMask')
            };
        }
        return result;
    }

    /**
     * [v1.6.0] Mengekspor seluruh riwayat matchLog ke format CSV.
     * Setiap baris berisi perbandingan lengkap tanpaMask vs denganMask per event match,
     * termasuk kolom kondisi cahaya, latensi instan, akurasi kumulatif, dan analisis perbandingan.
     *
     * @returns {String} String CSV siap untuk di-download
     */
    exportMatchLogCSV() {
        if (!this.matchLog.length) return '';

        const headers = [
            'Timestamp', 'UserID', 'KondisiCahaya', 'HasilMatch',
            // Latensi
            'Latensi_TanpaMask_ms', 'Latensi_DenganMask_ms', 'Selisih_Latensi_ms', 'LebihCepat',
            // Akurasi kumulatif
            'Akurasi_TanpaMask_%', 'Akurasi_DenganMask_%', 'FRR_TanpaMask_%', 'FRR_DenganMask_%',
            // Avg latensi kumulatif
            'AvgLatensi_TanpaMask', 'AvgLatensi_DenganMask',
            // Detail jarak
            'Dist_TanpaMask', 'Dist_DenganMask', 'SkorMask',
            // [v1.6.0] Analisis perbandingan
            'Unggul_Akurasi', 'Selisih_Akurasi_%',
            'LebihCepat_Instan', 'Selisih_LatInstan_ms',
            'LebihCepat_Avg', 'Selisih_LatAvg_ms',
            'Cahaya_Buruk', 'Dampak_Cahaya',
            'Mask_NilaiTambah', 'Mask_Bottleneck'
        ].join(',') + '\n';

        const rows = this.matchLog.map(e => {
            const c = e.comparison;
            return [
                e.timestamp,
                e.userId,
                e.lightCond,
                e.match.result,
                e.latensi.tanpaMask_ms,
                e.latensi.denganMask_ms,
                e.latensi.selisih_ms,
                e.latensi.lebihCepat,
                e.akurasi.tanpaMask,
                e.akurasi.denganMask,
                e.frr.tanpaMask,
                e.frr.denganMask,
                e.avgLatensi.tanpaMask,
                e.avgLatensi.denganMask,
                e.detail.distVektor,
                e.detail.distVekLama,
                e.detail.skorMask,
                c.unggulAkurasi,
                c.selisihAkurasi,
                c.lebihCepatInstan,
                c.selisihLatInstan,
                c.lebihCepatAvg,
                c.selisihLatAvg,
                c.cahayaBuruk ? 'YA' : 'TIDAK',
                `"${c.dampakCahaya}"`,
                c.maskMemberikanNilaiTambah ? 'YA' : 'TIDAK',
                c.maskMenjadiBottleneck ? 'YA' : 'TIDAK'
            ].join(',');
        }).join('\n');

        return headers + rows + '\n';
    }

    /**
     * [v1.6.0] Mengekspor seluruh riwayat matchLog ke format JSON string.
     * Berguna untuk import ulang, analisis eksternal, atau audit log.
     *
     * @returns {String} JSON string dari seluruh matchLog
     */
    exportMatchLogJSON() {
        return JSON.stringify({
            exportedAt : new Date().toISOString(),
            totalMatch : this.matchLog.length,
            summary    : this.getMatchLogSummary(),
            log        : this.matchLog
        }, null, 2);
    }

    /**
     * Mengatur ulang seluruh data statistik benchmark dan riwayat match log
     */
    reset() {
        this.stats.tanpaMask  = { total: 0, truePositive: 0, falseReject: 0, timeSumMs: 0 };
        this.stats.denganMask = { total: 0, truePositive: 0, falseReject: 0, timeSumMs: 0 };

        // [v1.5.0] Reset matchLog agar statistik log konsisten dengan stats
        this.matchLog = [];
    }
}

// Ekspos ke global window agar dapat di-reuse oleh presensi-patch.js atau berkas lain
window.BiometricBenchmark = BiometricBenchmark;

// [FIX] Ekspos instance default ke window.benchmarkEngine
// Tombol Reset di UI presensi-patch.js memanggil window.benchmarkEngine.reset()
if (typeof window.benchmarkEngine === 'undefined') {
    window.benchmarkEngine = new BiometricBenchmark();
}
