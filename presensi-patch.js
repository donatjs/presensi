/**
 * presensi-patch.js — Face Presence Module v1.2.0
 *
 * Prinsip: Konsisten · Reuse · DRY · Modular · Scalable
 *
 * Perbaikan v1.1.0-fixed:
 * [FIX-MIRROR] Mengoreksi koordinat drawing mask agar sinkron dengan mirror canvas scaleX(-1)
 * [FIX-RESUME] Memperbaiki resumeScan() agar membersihkan cooldown engine & mencatat deteksi ulang
 * [UI-SPLIT]   Memisahkan Mode Presensi dan Mode Enroll menggunakan Tab UI mandiri
 *
 * Tambahan v1.2.0:
 * [BENCH-LOG]  Panel log benchmark match tampil di halaman (UI), menampilkan perbandingan
 *              akurasi, latensi, dan kondisi cahaya antara tanpaMask vs denganMask.
 * [BENCH-EXP]  Export match log benchmark ke CSV dan JSON langsung dari UI.
 * [BENCH-TABEL] Tabel riwayat match log benchmark dengan pagination ringan (tampil 50 terakhir).
 */

// [FIX] Guard: benchmark.js harus di-load lebih dulu; lazy fallback jika class belum ada
const benchmarkEngine = (typeof BiometricBenchmark !== 'undefined')
    ? new BiometricBenchmark()
    : null;
// Ekspos ke window agar tombol Reset di panel UI bisa mengaksesnya
if (benchmarkEngine && typeof window !== 'undefined') window.benchmarkEngine = benchmarkEngine;

(function () {
    'use strict';

    // ═══════════════════════════════════════════════════════════════════════════
    //  KONSTANTA & KONFIGURASI
    // ═══════════════════════════════════════════════════════════════════════════

    const VERSION = '1.2.0';

    const STORAGE_KEYS = {
        DATASET : 'presensi_dataset',
        LOG     : 'presensi_log',
        CONFIG  : 'presensi_config'
    };

    const DEFAULT_CONFIG = {
        matchThreshold   : 0.022,
        ambiguityMargin  : 0.004,
        lightLow         : 25,
        lightHigh        : 230,
        occlusionRatio   : 0.15,
        samplePoints     : 100,
        maskThreshold    : 0.72,
        maskWidth        : 48,
        maskHeight       : 48,
        cooldownMs       : 5000, // Cooldown dikurangi ke 5 detik demi kenyamanan alat scan
        enrollSamples    : 5,
        logMaxEntries    : 500
    };

    const MP_CDN   = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3';
    const MP_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

    // ═══════════════════════════════════════════════════════════════════════════
    //  BINARY CODEC
    // ═══════════════════════════════════════════════════════════════════════════

    const binary = {
        encode(f32) {
            const buf  = f32.buffer;
            const u8   = new Uint8Array(buf);
            let str = '';
            u8.forEach(b => str += String.fromCharCode(b));
            return btoa(str);
        },
        decode(b64) {
            const str = atob(b64);
            const u8  = new Uint8Array(str.length);
            for (let i = 0; i < str.length; i++) u8[i] = str.charCodeAt(i);
            return new Float32Array(u8.buffer);
        },
        isBinary(v) { return typeof v === 'string'; },
        toF32(v) {
            if (!v) return null;
            if (this.isBinary(v)) return this.decode(v);
            if (v instanceof Float32Array) return v;
            return new Float32Array(v);
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    //  STORAGE & CONFIG MODULE
    // ═══════════════════════════════════════════════════════════════════════════

    const storage = {
        get(key, fallback = null) {
            try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch (_) { return fallback; }
        },
        set(key, value) {
            try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (_) { return false; }
        },
        remove(key) { localStorage.removeItem(key); }
    };

    const config = {
        _data: { ...DEFAULT_CONFIG },
        load() { const saved = storage.get(STORAGE_KEYS.CONFIG, {}); this._data = { ...DEFAULT_CONFIG, ...saved }; },
        get(key)      { return this._data[key]; },
        set(key, val) { this._data[key] = val; storage.set(STORAGE_KEYS.CONFIG, this._data); },
        update(obj)   { Object.assign(this._data, obj); storage.set(STORAGE_KEYS.CONFIG, this._data); },
        reset()       { this._data = { ...DEFAULT_CONFIG }; storage.remove(STORAGE_KEYS.CONFIG); }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    //  DATASET MODULE
    // ═══════════════════════════════════════════════════════════════════════════

    const dataset = {
        _data: [],
        load() { this._data = storage.get(STORAGE_KEYS.DATASET, []); },
        save() { storage.set(STORAGE_KEYS.DATASET, this._data); },

        enroll(name, vecSamples, maskSamples = []) {
            const normName = name.trim();
            if (!normName || !vecSamples?.length) throw new Error('Nama dan vektor wajah diperlukan');

            const avgVec = this._averageVectors(vecSamples);
            let avgMaskB64 = null;
            if (maskSamples.length > 0) {
                const n   = maskSamples[0].length;
                const acc = new Float32Array(n);
                maskSamples.forEach(m => {
                    const f = binary.toF32(m);
                    for (let i = 0; i < n; i++) acc[i] += f[i];
                });
                for (let i = 0; i < n; i++) acc[i] /= maskSamples.length;
                avgMaskB64 = binary.encode(acc);
            }

            const existing = this._data.find(u => u.name.toLowerCase() === normName.toLowerCase());

            if (existing) {
                existing.vec         = this._blendVectors(existing.vec, avgVec, 0.3);
                existing.sampleCount = (existing.sampleCount || 1) + vecSamples.length;
                existing.updatedAt   = new Date().toISOString();
                if (avgMaskB64) existing.maskData = avgMaskB64;
            } else {
                this._data.push({
                    id          : `face_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                    name        : normName,
                    vec         : avgVec,
                    maskData    : avgMaskB64,
                    enrolledAt  : new Date().toISOString(),
                    updatedAt   : new Date().toISOString(),
                    sampleCount : vecSamples.length
                });
            }
            this.save();
            return existing ? 'updated' : 'added';
        },

        delete(id) {
            const before = this._data.length;
            this._data   = this._data.filter(u => u.id !== id);
            if (this._data.length < before) { this.save(); return true; }
            return false;
        },

        getAll()    { return [...this._data]; },
        getById(id) { return this._data.find(u => u.id === id) || null; },
        count()     { return this._data.length; },

        _averageVectors(vecs) {
            if (vecs.length === 1) return vecs[0];
            const n   = vecs[0].length;
            const avg = [];
            for (let i = 0; i < n; i++) {
                let sx = 0, sy = 0, sz = 0;
                vecs.forEach(v => { sx += v[i].x; sy += v[i].y; sz += (v[i].z || 0); });
                avg.push({ x: sx / vecs.length, y: sy / vecs.length, z: sz / vecs.length });
            }
            return avg;
        },

        _blendVectors(vecOld, vecNew, weightNew) {
            return vecOld.map((pt, i) => ({
                x: pt.x * (1 - weightNew) + vecNew[i].x * weightNew,
                y: pt.y * (1 - weightNew) + vecNew[i].y * weightNew,
                z: (pt.z || 0) * (1 - weightNew) + (vecNew[i].z || 0) * weightNew
            }));
        },

        exportJSON() { return JSON.stringify({ version: VERSION, exportedAt: new Date().toISOString(), dataset: this._data }, null, 2); },
        importJSON(jsonStr) {
            const parsed = JSON.parse(jsonStr);
            if (!parsed?.dataset?.length) throw new Error('Format import tidak valid');
            const existing = new Map(this._data.map(u => [u.name.toLowerCase(), u]));
            let added = 0, skipped = 0;
            parsed.dataset.forEach(u => {
                if (!existing.has(u.name.toLowerCase())) { this._data.push(u); added++; } else skipped++;
            });
            this.save();
            return { added, skipped };
        },

        seedFromPages() {
            const db = (typeof pages !== 'undefined') ? pages.presensiDb : null;
            if (!db?.siswa?.length) return 0;
            let added = 0;
            db.siswa.forEach(s => {
                const exists = this._data.find(u => u.name.toLowerCase() === s.name.toLowerCase());
                if (!exists) {
                    this._data.push({
                        id          : s.id || `seed_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
                        name        : s.name,
                        vec         : [],
                        maskData    : null,
                        kelas       : s.kelas,
                        active      : s.active !== false,
                        enrolledAt  : s.enrolledAt || new Date().toISOString(),
                        updatedAt   : new Date().toISOString(),
                        sampleCount : 0,
                        seeded      : true
                    });
                    added++;
                }
            });
            if (added > 0) this.save();
            return added;
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    //  LOG MODULE
    // ═══════════════════════════════════════════════════════════════════════════

    const presLog = {
        _buf: [],
        load() { this._buf = storage.get(STORAGE_KEYS.LOG, []); },
        push(type, detail = {}) {
            const entry = { ts: new Date().toISOString(), type, ...detail };
            this._buf.push(entry);
            if (this._buf.length > config.get('logMaxEntries')) this._buf = this._buf.slice(-config.get('logMaxEntries'));
            storage.set(STORAGE_KEYS.LOG, this._buf);
            return entry;
        },
        all()        { return [...this._buf]; },
        clear()      { this._buf = []; storage.remove(STORAGE_KEYS.LOG); },
        exportCSV() {
            const header = 'Timestamp,Tipe,Nama,Jarak,Brightness,Occluded,Ambiguous,Catatan\n';
            const rows = this._buf.map(e =>
                [e.ts, e.type, e.name || '', e.dist?.toFixed(6) || '', e.brightness?.toFixed(1) || '', e.occluded || '', e.ambiguous || '', e.note || '']
                .map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
            ).join('\n');
            return header + rows;
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    //  ANALYSIS MODULE
    // ═══════════════════════════════════════════════════════════════════════════

    const analysis = {
        brightness(imageData) {
            const d = imageData.data;
            let sum = 0;
            for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
            return sum / (d.length / 4);
        },

        lightCondition(brightness) {
            if (brightness < config.get('lightLow'))  return 'low';
            if (brightness > config.get('lightHigh')) return 'high';
            return 'ok';
        },

        occlusionCheck(pts) {
            if (!pts?.length) return { occluded: true, ratio: 0 };
            const leftEye  = pts[33];
            const rightEye = pts[263];
            const nose     = pts[1];
            const chin     = pts[152];
            const forehead = pts[10];

            const eyeDist    = Math.hypot(leftEye.x - rightEye.x, leftEye.y - rightEye.y);
            const faceHeight = Math.hypot(nose.x - chin.x, nose.y - chin.y) + Math.hypot(nose.x - forehead.x, nose.y - forehead.y);
            const ratio = eyeDist > 0 ? faceHeight / eyeDist : 0;
            return {
                occluded : ratio < config.get('occlusionRatio') * 10 || eyeDist < 0.04,
                ratio    : parseFloat(ratio.toFixed(4))
            };
        },

        euclideanDist(p1, p2) {
            if (!p1?.length || !p2?.length) return 9999;
            const n   = Math.min(config.get('samplePoints'), p1.length, p2.length);
            const iod1 = Math.hypot(p1[33].x - p1[263].x, p1[33].y - p1[263].y) || 1;
            const iod2 = Math.hypot(p2[33].x - p2[263].x, p2[33].y - p2[263].y) || 1;
            const cx1  = p1[1].x, cy1 = p1[1].y;
            const cx2  = p2[1].x, cy2 = p2[1].y;
            let sum = 0;
            for (let i = 0; i < n; i++) {
                const nx1 = (p1[i].x - cx1) / iod1, ny1 = (p1[i].y - cy1) / iod1;
                const nx2 = (p2[i].x - cx2) / iod2, ny2 = (p2[i].y - cy2) / iod2;
                sum += Math.hypot(nx1 - nx2, ny1 - ny2);
            }
            return sum / n;
        },

        extractMask(pts, videoEl, maskCtx, maskCv) {
            let minX = 1, minY = 1, maxX = 0, maxY = 0;
            pts.forEach(p => {
                if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
                if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
            });
            const pad = 0.10;
            const sx  = Math.max(0, (minX - pad) * videoEl.videoWidth);
            const sy  = Math.max(0, (minY - pad) * videoEl.videoHeight);
            const sw  = Math.min(videoEl.videoWidth,  (maxX - minX + 2 * pad) * videoEl.videoWidth);
            const sh  = Math.min(videoEl.videoHeight, (maxY - minY + 2 * pad) * videoEl.videoHeight);

            const W = config.get('maskWidth'), H = config.get('maskHeight');
            maskCv.width  = W;
            maskCv.height = H;
            maskCtx.drawImage(videoEl, sx, sy, sw, sh, 0, 0, W, H);
            const d    = maskCtx.getImageData(0, 0, W, H).data;
            const gray = new Float32Array(W * H);
            for (let i = 0; i < gray.length; i++)
                gray[i] = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255;
            return gray;
        },

        maskSimilarity(a, b) {
            const n = a.length;
            let sA = 0, sB = 0;
            for (let i = 0; i < n; i++) { sA += a[i]; sB += b[i]; }
            const mA = sA / n, mB = sB / n;
            let num = 0, dA = 0, dB = 0;
            for (let i = 0; i < n; i++) {
                const da = a[i] - mA, db = b[i] - mB;
                num += da * db; dA += da * da; dB += db * db;
            }
            const denom = Math.sqrt(dA * dB);
            return denom < 1e-8 ? 0 : Math.max(0, num / denom);
        },

        matchAll(pts, users, maskCam = null) {
            const enrolledUsers = users.filter(u => u.vec && u.vec.length > 0);
            if (!pts?.length || !enrolledUsers.length)
                return { candidates: [], match: null, ambiguous: false, maskSim: 0 };

            const threshold  = config.get('matchThreshold');
            const margin     = config.get('ambiguityMargin');
            const maskThresh = config.get('maskThreshold');

            const candidates = enrolledUsers
                .map(u => ({ ...u, dist: this.euclideanDist(pts, u.vec), mSim: 0 }))
                .sort((a, b) => a.dist - b.dist);

            const best   = candidates[0];
            const second = candidates[1];

            let maskSim = 0;
            if (maskCam && best.maskData && best.dist < threshold * 2) {
                const storedF32 = binary.toF32(best.maskData);
                if (storedF32) {
                    maskSim = this.maskSimilarity(maskCam, storedF32);
                    best.mSim = maskSim;
                }
            }

            const ambiguous = second ? (best.dist < threshold && (second.dist - best.dist) < margin) : false;
            const maskOk = !best.maskData || maskSim >= maskThresh;
            const match  = (best.dist < threshold && maskOk) ? best : null;

            return { candidates, match, ambiguous, maskSim };
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    //  FACE OVERLAY DRAWING — Dengan Perbaikan Kompensasi Mirroring (X-Inversion)
    // ═══════════════════════════════════════════════════════════════════════════

    const overlay = {
        // Helper untuk membalikkan koordinat X agar sinkron dengan CSS transform mirror pada canvas
        _mirrorX(xNorm, cw) {
            return (1 - xNorm) * cw;
        },

        drawGuide(ctx, cw, ch, state) {
            const cx   = cw / 2;
            const cy   = ch / 2.1;
            const rx   = cw * 0.18;
            const ry   = ch * 0.30;

            const colors = {
                idle      : { stroke: 'rgba(255,255,255,0.35)', fill: 'rgba(255,255,255,0.03)' },
                detecting : { stroke: 'rgba(8,145,178,0.80)',   fill: 'rgba(8,145,178,0.06)'  },
                match     : { stroke: 'rgba(34,197,94,0.90)',   fill: 'rgba(34,197,94,0.10)'  },
                enroll    : { stroke: 'rgba(245,158,11,0.85)',  fill: 'rgba(245,158,11,0.08)' },
                warn      : { stroke: 'rgba(239,68,68,0.80)',   fill: 'rgba(239,68,68,0.06)'  }
            };
            const col = colors[state] || colors.idle;

            ctx.save();
            ctx.beginPath();
            ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
            ctx.strokeStyle = col.stroke;
            ctx.lineWidth   = 3;
            ctx.setLineDash(state === 'idle' ? [8, 6] : []);
            ctx.stroke();
            ctx.fillStyle   = col.fill;
            ctx.fill();
            ctx.setLineDash([]);

            const bx = cx - rx, by = cy - ry;
            const bw = rx * 2,  bh = ry * 2;
            const bl = 18;
            ctx.strokeStyle = col.stroke;
            ctx.lineWidth   = 3;
            [
                [bx, by, bl, 0, 0, bl],
                [bx + bw, by, -bl, 0, 0, bl],
                [bx, by + bh, bl, 0, 0, -bl],
                [bx + bw, by + bh, -bl, 0, 0, -bl]
            ].forEach(([x, y, dx1, dy1, dx2, dy2]) => {
                ctx.beginPath();
                ctx.moveTo(x + dx1, y);
                ctx.lineTo(x, y);
                ctx.lineTo(x, y + dy2 || dy1 + dy2);
                ctx.stroke();
            });
            ctx.restore();
        },

        drawFaceMask(ctx, pts, cw, ch, label, dist, state) {
            if (!pts?.length) return;

            // FIX: Hitung bounding box dengan koordinat yang telah di-mirror agar tidak tertukar arah kiri-kanannya
            let minX = 1, minY = 1, maxX = 0, maxY = 0;
            pts.forEach(p => {
                const mx = 1 - p.x; // Balikkan sumbu X di sini
                if (mx < minX) minX = mx; if (mx > maxX) maxX = mx;
                if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
            });
            const pad = 0.03;
            const bx  = (minX - pad) * cw;
            const by  = (minY - pad) * ch;
            const bw  = (maxX - minX + 2 * pad) * cw;
            const bh  = (maxY - minY + 2 * pad) * ch;

            const colMap = {
                match   : { box: '#22c55e', text: '#dcfce7', bg: 'rgba(34,197,94,0.15)'  },
                unknown : { box: '#f59e0b', text: '#fef3c7', bg: 'rgba(245,158,11,0.12)' },
                enroll  : { box: '#0891b2', text: '#e0f2fe', bg: 'rgba(8,145,178,0.15)'  }
            };
            const col = colMap[state] || colMap.unknown;

            ctx.save();
            ctx.fillStyle = col.bg;
            ctx.beginPath();
            ctx.roundRect?.(bx, by, bw, bh, 6) || ctx.rect(bx, by, bw, bh);
            ctx.fill();

            ctx.strokeStyle = col.box;
            ctx.lineWidth   = 2;
            ctx.beginPath();
            ctx.roundRect?.(bx, by, bw, bh, 6) || ctx.rect(bx, by, bw, bh);
            ctx.stroke();

            // FIX: Titik landmark utama juga dikompensasi dengan _mirrorX
            const keyPts = [33, 263, 1, 152, 10, 61, 291, 13, 14];
            keyPts.forEach(idx => {
                if (!pts[idx]) return;
                const px = this._mirrorX(pts[idx].x, cw);
                const py = pts[idx].y * ch;
                ctx.beginPath();
                ctx.arc(px, py, 2.5, 0, 2 * Math.PI);
                ctx.fillStyle = col.box;
                ctx.fill();
            });

            const labelText = label ? `${label}  ${dist < 9 ? dist.toFixed(4) : ''}` : `Tidak Dikenal`;
            const fontSize = Math.max(12, Math.min(16, bw / 10));
            ctx.font         = `700 ${fontSize}px system-ui,sans-serif`;
            ctx.textBaseline = 'bottom';
            const tw = ctx.measureText(labelText).width;
            const tx = bx + bw / 2 - tw / 2;
            const ty = by - 4;

            ctx.fillStyle   = col.box;
            ctx.beginPath();
            ctx.roundRect?.(tx - 6, ty - fontSize - 2, tw + 12, fontSize + 6, 4) || ctx.rect(tx - 6, ty - fontSize - 2, tw + 12, fontSize + 6);
            ctx.fill();

            ctx.fillStyle   = col.text;
            ctx.fillText(labelText, tx, ty);
            ctx.restore();
        },

        drawStatus(ctx, cw, ch, msg, state) {
            const colMap = { match: '#22c55e', warn: '#f59e0b', err: '#ef4444', info: '#0891b2' };
            const col = colMap[state] || colMap.info;

            ctx.save();
            const pad = 12;
            ctx.font  = '600 13px system-ui,sans-serif';
            const tw  = ctx.measureText(msg).width;

            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.beginPath();
            ctx.roundRect?.(pad - 6, ch - 38, tw + 28, 28, 5) || ctx.rect(pad - 6, ch - 38, tw + 28, 28);
            ctx.fill();

            ctx.beginPath();
            ctx.arc(pad + 6, ch - 24, 5, 0, 2 * Math.PI);
            ctx.fillStyle = col;
            ctx.fill();

            ctx.fillStyle   = '#fff';
            ctx.textBaseline = 'middle';
            ctx.fillText(msg, pad + 16, ch - 24);
            ctx.restore();
        },

        // Menggambar garis konektor mesh bawaan MediaPipe yang sudah di-mirroring koordinat X-nya
        drawMirroredConnectors(ctx, landmarks, connections, options, cw, ch) {
            ctx.save();
            ctx.strokeStyle = options.color || '#ffffff';
            ctx.lineWidth = options.lineWidth || 1;
            connections.forEach(conn => {
                const p1 = landmarks[conn.start];
                const p2 = landmarks[conn.end];
                if (p1 && p2) {
                    ctx.beginPath();
                    ctx.moveTo((1 - p1.x) * cw, p1.y * ch);
                    ctx.lineTo((1 - p2.x) * cw, p2.y * ch);
                    ctx.stroke();
                }
            });
            ctx.restore();
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    //  ENGINE MODULE
    // ═══════════════════════════════════════════════════════════════════════════

    const engine = {
        _faceLandmarker : null,
        _stream         : null,
        _video          : null,
        _canvas         : null,
        _ctx            : null,
        _brightCanvas   : null,
        _brightCtx      : null,
        _maskCanvas     : null,
        _maskCtx        : null,
        _running        : false,
        _listeners      : {},
        _lastMatchMs    : 0,
        _matchedIds     : new Set(),
        _enrollQueue    : [],
        _isEnrolling    : false,
        _activeTab      : 'presensi', // Mengatur fokus pemicu: 'presensi' atau 'enroll'
        _enrollTarget   : null,
        _enrollProgress : null,
        _overlayState   : 'idle',

        on(event, fn)     { if (!this._listeners[event]) this._listeners[event] = new Set(); this._listeners[event].add(fn); },
        off(event, fn)    { this._listeners[event]?.delete(fn); },
        emit(event, data) { this._listeners[event]?.forEach(fn => fn(data)); },

        async init(videoEl, canvasEl) {
            this._video  = videoEl;
            this._canvas = canvasEl;
            this._ctx    = canvasEl.getContext('2d');

            this._brightCanvas       = document.createElement('canvas');
            this._brightCanvas.width = 160;
            this._brightCanvas.height= 120;
            this._brightCtx = this._brightCanvas.getContext('2d', { willReadFrequently: true });

            this._maskCanvas        = document.createElement('canvas');
            this._maskCanvas.width  = config.get('maskWidth');
            this._maskCanvas.height = config.get('maskHeight');
            this._maskCtx = this._maskCanvas.getContext('2d', { willReadFrequently: true });

            try {
                const { FaceLandmarker, FilesetResolver } = await import(`${MP_CDN}/vision_bundle.mjs`);
                this._FaceLandmarker = FaceLandmarker;

                const vision = await FilesetResolver.forVisionTasks(`${MP_CDN}/wasm`);
                this._faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
                    baseOptions : { modelAssetPath: MP_MODEL, delegate: 'GPU' },
                    runningMode : 'VIDEO',
                    numFaces    : 2
                });

                const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                this._stream         = stream;
                this._video.srcObject = stream;
                await new Promise(r => { this._video.onloadedmetadata = r; });
                this._canvas.width  = this._video.videoWidth;
                this._canvas.height = this._video.videoHeight;

                this.emit('ready', {});
                return true;
            } catch (err) {
                this.emit('error', { message: err.message });
                return false;
            }
        },

        start() { if (this._running) return; this._running = true; this._tick(); },
        stop() { this._running = false; this._stream?.getTracks().forEach(t => t.stop()); },

        startEnroll(name, onProgress) {
            this._enrollTarget   = name;
            this._enrollQueue    = [];
            this._isEnrolling    = true;
            this._enrollProgress = onProgress || (() => {});
        },

        _tick() {
            if (!this._running) return;
            const t0  = performance.now();
            const cw  = this._canvas.width;
            const ch  = this._canvas.height;

            if (this._video.readyState >= 2 && this._faceLandmarker) {
                const result      = this._faceLandmarker.detectForVideo(this._video, t0);
                const allLandmarks = result.faceLandmarks || [];

                this._ctx.clearRect(0, 0, cw, ch);

                // Oval guide selalu digambar di pusat
                overlay.drawGuide(this._ctx, cw, ch, this._overlayState);

                // FIX: Gambar Face Mesh Tesselation bawaan dengan kalkulasi X mirror manual
                if (this._FaceLandmarker && allLandmarks.length > 0) {
                    allLandmarks.forEach(pts => {
                        overlay.drawMirroredConnectors(this._ctx, pts, this._FaceLandmarker.FACE_LANDMARKS_TESSELATION, { color: '#0891b212', lineWidth: 1 }, cw, ch);
                        overlay.drawMirroredConnectors(this._ctx, pts, this._FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE, { color: '#0891b250', lineWidth: 1.5 }, cw, ch);
                        overlay.drawMirroredConnectors(this._ctx, pts, this._FaceLandmarker.FACE_LANDMARKS_LEFT_EYE, { color: '#0891b250', lineWidth: 1.5 }, cw, ch);
                        overlay.drawMirroredConnectors(this._ctx, pts, this._FaceLandmarker.FACE_LANDMARKS_FACE_OVAL, { color: '#0891b235', lineWidth: 1 }, cw, ch);
                    });
                }

                this._brightCtx.drawImage(this._video, 0, 0, 160, 120);
                const imgData    = this._brightCtx.getImageData(0, 0, 160, 120);
                const brightness = analysis.brightness(imgData);
                const lightCond  = analysis.lightCondition(brightness);

                const latencyMs = performance.now() - t0;
                this.emit('frame', { brightness, lightCond, faceCount: allLandmarks.length, latencyMs });

                // [BENCHMARK] Jalankan pengujian paralel apple-to-apple tiap frame kamera
                if (benchmarkEngine && allLandmarks.length > 0) {
                    const primaryForBench = allLandmarks[0];
                    const benchData = benchmarkEngine.executeFrameTest(primaryForBench, dataset.getAll(), lightCond);
                    if (benchData) ui._updateBenchmarkUI(benchData);
                }

                if (lightCond !== 'ok') {
                    this.emit('light_warning', { condition: lightCond, brightness });
                }

                if (allLandmarks.length === 0) {
                    this._overlayState = 'idle';
                    overlay.drawStatus(this._ctx, cw, ch, 'Arahkan wajah ke dalam oval', 'info');
                    this.emit('no_face', {});
                } else {
                    const primaryPts           = allLandmarks[0];
                    const { occluded, ratio }  = analysis.occlusionCheck(primaryPts);

                    if (occluded) {
                        this._overlayState = 'warn';
                        this.emit('occluded', { ratio });
                        overlay.drawFaceMask(this._ctx, primaryPts, cw, ch, null, 9, 'unknown');
                        overlay.drawStatus(this._ctx, cw, ch, `Wajah tertutup (ratio:${ratio})`, 'warn');
                    }

                    // ── [Sesi Terpisah] MODE ENROLL ────────────────────────
                    if (this._activeTab === 'enroll' && this._isEnrolling) {
                        const lightOkForEnroll = lightCond !== 'low' || brightness > 15;
                        if (!occluded && lightOkForEnroll) {
                            this._overlayState = 'enroll';
                            const maskFrame = analysis.extractMask(primaryPts, this._video, this._maskCtx, this._maskCanvas);
                            this._enrollQueue.push({ pts: primaryPts, mask: maskFrame });
                            const needed = config.get('enrollSamples');
                            this._enrollProgress(this._enrollQueue.length, needed);

                            overlay.drawFaceMask(this._ctx, primaryPts, cw, ch, `Enroll: ${this._enrollQueue.length}/${needed}`, 9, 'enroll');
                            overlay.drawStatus(this._ctx, cw, ch, `Mengambil sampel ${this._enrollQueue.length}/${needed}...`, 'info');

                            if (this._enrollQueue.length >= needed) {
                                this._isEnrolling  = false;
                                const name         = this._enrollTarget;
                                const vecSamples   = this._enrollQueue.map(s => s.pts);
                                const maskSamples  = this._enrollQueue.map(s => s.mask);
                                const result       = dataset.enroll(name, vecSamples, maskSamples);
                                this._enrollQueue  = [];
                                this._enrollTarget = null;
                                this._overlayState = 'idle';
                                presLog.push('ENROLL', { name, action: result, hasMask: true });
                                this.emit('enrolled', { name, action: result });
                            }
                        } else {
                            this._overlayState = 'warn';
                            this.emit('enroll_blocked', { reason: occluded ? 'occluded' : lightCond });
                        }
                    }

                    // ── [Sesi Terpisah] MODE MATCH (PRESENSI) ──────────────
                    else if (this._activeTab === 'presensi') {
                        if (Date.now() - this._lastMatchMs > config.get('cooldownMs')) {
                            if (allLandmarks.length > 1) {
                                this._overlayState = 'warn';
                                this.emit('multi_face', { count: allLandmarks.length });
                                overlay.drawStatus(this._ctx, cw, ch, `${allLandmarks.length} wajah — scan satu per satu`, 'warn');
                                requestAnimationFrame(() => this._tick());
                                return;
                            }

                            const maskCam = analysis.extractMask(primaryPts, this._video, this._maskCtx, this._maskCanvas);
                            const { candidates, match, ambiguous, maskSim } = analysis.matchAll(primaryPts, dataset.getAll(), maskCam);
                            const best    = candidates[0];
                            const distVal = best?.dist ?? 1;

                            if (ambiguous) {
                                this._overlayState = 'warn';
                                this.emit('ambiguous', { candidates: candidates.slice(0, 2) });
                                overlay.drawFaceMask(this._ctx, primaryPts, cw, ch, null, distVal, 'unknown');
                                overlay.drawStatus(this._ctx, cw, ch, `Ambigu: ${candidates[0]?.name} / ${candidates[1]?.name}`, 'warn');
                            } else if (match && !this._matchedIds.has(match.id)) {
                                this._overlayState   = 'match';
                                this._lastMatchMs    = Date.now();
                                this._matchedIds.add(match.id);

                                const logEntry = presLog.push('MATCH', {
                                    name: match.name, id: match.id, dist: distVal,
                                    maskSim, brightness, lightCond, occluded, faceCount: allLandmarks.length
                                });
                                overlay.drawFaceMask(this._ctx, primaryPts, cw, ch, match.name, distVal, 'match');
                                overlay.drawStatus(this._ctx, cw, ch, `✓ Hadir: ${match.name}`, 'match');
                                this.emit('match', { user: match, dist: distVal, maskSim, entry: logEntry });
                            } else if (!match) {
                                this._overlayState = 'detecting';
                                overlay.drawFaceMask(this._ctx, primaryPts, cw, ch, null, distVal, 'unknown');
                                overlay.drawStatus(this._ctx, cw, ch, `Wajah tidak dikenal (dist:${distVal.toFixed(4)})`, 'warn');
                                this.emit('no_match', { dist: distVal, candidates: candidates.slice(0, 3) });
                            } else {
                                // Sudah presensi / sedang memunculkan dialog sukses
                                this._overlayState = 'match';
                                overlay.drawFaceMask(this._ctx, primaryPts, cw, ch, match.name + ' ✓', distVal, 'match');
                            }
                        } else {
                            // Dalam masa jeda frame cooldown
                            this._overlayState = 'idle';
                            overlay.drawStatus(this._ctx, cw, ch, `Menunggu giliran scan berikutnya...`, 'info');
                        }
                    }
                }
            }
            requestAnimationFrame(() => this._tick());
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    //  UI MODULE (Dengan Implementasi Pemisahan Tab Sesi Presensi & Enroll)
    //  [v1.2.0] Ditambahkan panel log benchmark match yang menampilkan perbandingan
    //           akurasi, latensi, dan kondisi cahaya tanpaMask vs denganMask.
    // ═══════════════════════════════════════════════════════════════════════════

    const ui = {
        _container: null,

        render(target) {
            const el = typeof target === 'string' ? document.getElementById(target) : target;
            if (!el) { console.warn('[presensi] Target tidak ditemukan:', target); return; }
            this._container = el;
            el.innerHTML    = this._html();
            setTimeout(() => this._bind(), 0);
        },

        _html() {
            return `
<div id="ps-widget" style="font-family:system-ui,-apple-system,sans-serif;max-width:900px;margin:0 auto;color:#1f2937;">
  <style>
    #ps-widget * { box-sizing:border-box; }
    #ps-widget .ps-card   { background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin-bottom:12px;box-shadow:0 1px 3px rgba(0,0,0,0.05); }
    #ps-widget .ps-badge  { display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600; }
    #ps-widget .ps-btn    { padding:8px 16px;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;transition:.15s; }
    #ps-widget .ps-btn-p  { background:#0891b2;color:#fff; }
    #ps-widget .ps-btn-p:hover { background:#0e7490; }
    #ps-widget .ps-btn-d  { background:#ef4444;color:#fff; }
    #ps-widget .ps-btn-d:hover { background:#dc2626; }
    #ps-widget .ps-btn-s  { background:#f3f4f6;color:#374151; }
    #ps-widget .ps-btn-s:hover { background:#e5e7eb; }
    #ps-widget .ps-status { padding:8px 12px;border-radius:6px;font-size:13px;margin-bottom:8px;min-height:32px;font-weight:500; }
    #ps-widget .ps-log-row{ display:flex;gap:6px;align-items:flex-start;padding:6px 0;border-bottom:1px solid #f3f4f6;font-size:12px; }
    #ps-widget .ps-tag    { padding:1px 6px;border-radius:4px;font-size:10px;font-weight:700;white-space:nowrap; }
    #ps-widget .ps-tag-match  { background:#dcfce7;color:#166534; }
    #ps-widget .ps-tag-warn   { background:#fef9c3;color:#854d0e; }
    #ps-widget .ps-tag-err    { background:#fee2e2;color:#991b1b; }
    #ps-widget .ps-tag-info   { background:#e0f2fe;color:#0c4a6e; }
    #ps-widget table  { width:100%;border-collapse:collapse;font-size:13px; }
    #ps-widget th, #ps-widget td { padding:8px 10px;text-align:left;border-bottom:1px solid #f3f4f6; }
    #ps-widget th { background:#f9fafb;font-weight:600;color:#4b5563; }

    /* Navigasi Tab Sesi */
    .ps-tabs { display:flex; gap:4px; margin-bottom:10px; border-bottom:2px solid #e5e7eb; padding-bottom:1px; }
    .ps-tab-btn { padding:10px 20px; border:none; background:none; font-size:14px; font-weight:700; color:#6b7280; cursor:pointer; border-radius:6px 6px 0 0; margin-bottom:-2px; transition:.15s; }
    .ps-tab-btn.active { color:#0891b2; border-bottom:3px solid #0891b2; background:#f0f9ff; }

    .ps-progress      { height:6px;background:#e0e0e0;border-radius:3px;margin-top:4px; }
    .ps-progress-fill { height:6px;background:#0891b2;border-radius:3px;transition:.3s; }

    #ps-cam-wrap { position:relative; overflow:hidden; background:#0f172a; border-radius:10px 10px 0 0; }
    #ps-video    { width:100%; display:block; border-radius:10px 10px 0 0; transform:scaleX(-1); }
    #ps-canvas   { position:absolute; top:0; left:0; width:100%; height:100%; border-radius:10px 10px 0 0; pointer-events:none; }

    #ps-scan-overlay {
      display:none; position:absolute; inset:0;
      background:rgba(15,23,42,0.92); border-radius:10px 10px 0 0;
      flex-direction:column; align-items:center; justify-content:center;
      color:#fff; text-align:center; padding:20px; z-index:10;
    }

    /* [v1.2.0] Tabel log benchmark match */
    #bm-match-log-table { width:100%; border-collapse:collapse; font-size:11px; }
    #bm-match-log-table th { background:#f0f9ff; color:#0369a1; font-weight:700; padding:6px 8px; border-bottom:2px solid #bae6fd; white-space:nowrap; }
    #bm-match-log-table td { padding:5px 8px; border-bottom:1px solid #f3f4f6; vertical-align:top; }
    #bm-match-log-table tr:hover td { background:#f8fafc; }
    .bm-winner { color:#166534; font-weight:700; }
    .bm-loser  { color:#6b7280; }
    .bm-bad-light { color:#b45309; font-weight:600; }
    .bm-ok-light  { color:#059669; }
    .bm-keduanya    { background:#dcfce7; color:#166534; padding:1px 5px; border-radius:3px; font-weight:700; font-size:10px; }
    .bm-hanya-vektor{ background:#e0f2fe; color:#0369a1; padding:1px 5px; border-radius:3px; font-weight:700; font-size:10px; }
    .bm-hanya-mask  { background:#fef9c3; color:#854d0e; padding:1px 5px; border-radius:3px; font-weight:700; font-size:10px; }
  </style>

  <div class="ps-tabs">
    <button id="tab-presensi" class="ps-tab-btn active" onclick="presensi.switchTab('presensi')">🔄 Sesi Presensi Mandiri</button>
    <button id="tab-enroll" class="ps-tab-btn" onclick="presensi.switchTab('enroll')">📷 Sesi Registrasi Wajah (Enroll)</button>
  </div>

  <div class="ps-card" style="padding:0;border-radius:10px;overflow:hidden;">
    <div id="ps-cam-wrap">
      <video id="ps-video" autoplay playsinline muted></video>
      <canvas id="ps-canvas"></canvas>

      <div id="ps-scan-overlay">
        <div style="font-size:56px;margin-bottom:12px;">✅</div>
        <div style="font-size:14px; text-transform:uppercase; letter-spacing:1px; color:#22c55e; font-weight:700;">PRESENSI BERHASIL</div>
        <div id="ps-match-name" style="font-size:26px; font-weight:800; margin:6px 0 2px 0;">—</div>
        <div id="ps-match-dist" style="font-size:13px;opacity:.7;margin-bottom:20px;"></div>
        <button class="ps-btn ps-btn-p" style="background:#22c55e; padding:10px 24px;" onclick="presensi.resumeScan()">Siap, Scan Orang Berikutnya</button>
      </div>
    </div>

    <div style="display:flex;gap:16px;padding:10px 16px;background:#f9fafb;border-top:1px solid #e5e7eb;flex-wrap:wrap;font-size:13px;color:#4b5563;">
      <span>⚡ Latency: <b id="ps-m-lat">—</b> ms</span>
      <span>📏 Distance: <b id="ps-m-dist" style="color:#0891b2;">—</b></span>
      <span>💡 Lux: <b id="ps-m-bright">—</b></span>
      <span>👤 Deteksi Wajah: <b id="ps-m-faces">—</b></span>
    </div>
  </div>

  <div id="ps-status" class="ps-status ps-card">
    ⏳ Menginisialisasi modul MediaPipe Face Mesh...
  </div>

  <div id="panel-enroll" class="ps-card" style="display:none; border-left:4px solid #f59e0b;">
    <div style="font-weight:700;margin-bottom:4px; font-size:14px;">Pendaftaran Anggota / Wajah Baru</div>
    <div style="font-size:12px; color:#6b7280; margin-bottom:12px;">Pastikan pencahayaan cukup dan wajah berada tepat di dalam lingkaran oval pemandu.</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <input id="ps-enroll-name" type="text" placeholder="Masukkan Nama Lengkap Subjek..."
             style="flex:1;min-width:160px;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;">
      <button class="ps-btn ps-btn-p" style="background:#f59e0b;" onclick="presensi.startEnroll()">Mulai Ekstrak Vektor</button>
    </div>
    <div id="ps-enroll-progress" style="display:none;margin-top:12px;">
      <div style="font-size:12px;color:#d97706; font-weight:600;">Proses perekaman landmark wajah...</div>
      <div class="ps-progress"><div id="ps-progress-fill" class="ps-progress-fill" style="width:0%; background:#f59e0b;"></div></div>
    </div>
    <div id="ps-enroll-status" style="font-size:12px;color:#4b5563;margin-top:6px;"></div>
  </div>

  <div class="ps-card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px;">
      <div style="font-weight:700; font-size:14px;">🗃 File Basis Data Terdaftar
        <span id="ps-user-count" class="ps-badge" style="background:#f3f4f6;color:#1f2937;margin-left:6px;">0</span>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <button class="ps-btn ps-btn-s" onclick="presensi.exportDataset()">⬇ Export JSON</button>
        <button class="ps-btn ps-btn-s" onclick="document.getElementById('ps-import-file').click()">⬆ Import JSON</button>
        <input id="ps-import-file" type="file" accept=".json" style="display:none" onchange="presensi.importDataset(this)">
      </div>
    </div>
    <div style="overflow-x:auto;">
      <table>
        <thead><tr><th>Nama Lengkap</th><th>Kelas</th><th>Waktu Registrasi</th><th>Total Sampel</th><th>Status Mask</th><th>Manajemen</th></tr></thead>
        <tbody id="ps-user-tbody"></tbody>
      </table>
    </div>
  </div>

  <div class="ps-card" style="border-top:4px solid #0891b2;background:#fafcfd;">
    <div style="font-weight:700;font-size:13px;color:#0891b2;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;">
      <span>📊 LIVE MONITOR BENCHMARK — Paralel Apple-to-Apple</span>
      <div style="display:flex;gap:6px;align-items:center;">
        <button onclick="presensi.exportBenchmark()" style="background:#0891b2;color:#fff;border:none;border-radius:5px;padding:3px 10px;font-size:11px;cursor:pointer;font-weight:700;">⬇ Export Frame CSV</button>
        <button onclick="presensi.exportBenchmarkMatchLog('csv')" style="background:#0369a1;color:#fff;border:none;border-radius:5px;padding:3px 10px;font-size:11px;cursor:pointer;font-weight:700;">⬇ Export Match Log CSV</button>
        <button onclick="presensi.exportBenchmarkMatchLog('json')" style="background:#1e40af;color:#fff;border:none;border-radius:5px;padding:3px 10px;font-size:11px;cursor:pointer;font-weight:700;">⬇ Export Match Log JSON</button>
        <button onclick="if(window.benchmarkEngine){window.benchmarkEngine.reset();ui._benchRows=[];ui._refreshBenchMatchLog();}" style="background:none;border:none;color:#6b7280;font-size:11px;cursor:pointer;font-weight:700;">🔄 Reset</button>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      <div style="background:#f0f9ff;border:1px solid #bae6fd;padding:12px;border-radius:8px;">
        <div style="font-size:11px;font-weight:800;color:#0369a1;margin-bottom:8px;display:flex;justify-content:space-between;">
          <span>METODE BARU — VEKTOR MURNI</span>
          <span style="background:#bae6fd;padding:1px 5px;border-radius:4px;font-size:9px;">PRODUCTION</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
          <div><div style="font-size:10px;font-weight:700;color:#6b7280;">Akurasi</div><div id="bm-acc-new" style="font-size:18px;font-weight:800;color:#166534;">—</div></div>
          <div><div style="font-size:10px;font-weight:700;color:#6b7280;">FRR (Gagal)</div><div id="bm-frr-new" style="font-size:18px;font-weight:800;color:#991b1b;">—</div></div>
          <div style="grid-column:1/-1;border-top:1px dashed #bae6fd;padding-top:6px;margin-top:2px;">
            <div style="font-size:10px;font-weight:700;color:#6b7280;">Latensi Frame / Rerata</div>
            <div id="bm-lat-new" style="font-size:12px;font-weight:700;color:#0284c7;">—</div>
          </div>
        </div>
      </div>
      <div style="background:#fff7ed;border:1px solid #fed7aa;padding:12px;border-radius:8px;">
        <div style="font-size:11px;font-weight:800;color:#c2410c;margin-bottom:8px;display:flex;justify-content:space-between;">
          <span>METODE LAMA — VEKTOR + MASKDATA</span>
          <span style="background:#ffedd5;padding:1px 5px;border-radius:4px;font-size:9px;color:#9a3412;">PARALEL TEST</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
          <div><div style="font-size:10px;font-weight:700;color:#6b7280;">Akurasi</div><div id="bm-acc-old" style="font-size:18px;font-weight:800;color:#166534;">—</div></div>
          <div><div style="font-size:10px;font-weight:700;color:#6b7280;">FRR (Gagal)</div><div id="bm-frr-old" style="font-size:18px;font-weight:800;color:#991b1b;">—</div></div>
          <div style="grid-column:1/-1;border-top:1px dashed #fed7aa;padding-top:6px;margin-top:2px;">
            <div style="font-size:10px;font-weight:700;color:#6b7280;">Latensi Frame / Rerata</div>
            <div id="bm-lat-old" style="font-size:12px;font-weight:700;color:#b45309;">—</div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- ═══════════════════════════════════════════════════════════════════════
       [v1.2.0] PANEL LOG BENCHMARK MATCH — Tampil di halaman
       Menampilkan perbandingan akurasi, latensi, kondisi cahaya per event match
  ════════════════════════════════════════════════════════════════════════════ -->
  <div class="ps-card" style="border-top:4px solid #7c3aed;background:#faf5ff;">
    <div style="font-weight:700;font-size:13px;color:#7c3aed;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
      <span>🔬 LOG BENCHMARK MATCH — Perbandingan Akurasi · Latensi · Pencahayaan</span>
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
        <span id="bm-match-count" style="background:#ede9fe;color:#5b21b6;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700;">0 match</span>
        <button onclick="presensi.exportBenchmarkMatchLog('csv')" style="background:#7c3aed;color:#fff;border:none;border-radius:5px;padding:3px 10px;font-size:11px;cursor:pointer;font-weight:700;">⬇ CSV</button>
        <button onclick="presensi.exportBenchmarkMatchLog('json')" style="background:#5b21b6;color:#fff;border:none;border-radius:5px;padding:3px 10px;font-size:11px;cursor:pointer;font-weight:700;">⬇ JSON</button>
      </div>
    </div>

    <!-- Ringkasan per kondisi cahaya -->
    <div id="bm-light-summary" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px;">
      <div id="bm-light-ok"   style="background:#f0fdf4;border:1px solid #bbf7d0;padding:8px 10px;border-radius:7px;font-size:11px;">
        <div style="font-weight:800;color:#166534;margin-bottom:4px;">💡 Cahaya NORMAL</div>
        <div id="bm-light-ok-stats" style="color:#374151;">— belum ada data</div>
      </div>
      <div id="bm-light-low"  style="background:#fffbeb;border:1px solid #fde68a;padding:8px 10px;border-radius:7px;font-size:11px;">
        <div style="font-weight:800;color:#92400e;margin-bottom:4px;">🌑 Cahaya RENDAH</div>
        <div id="bm-light-low-stats" style="color:#374151;">— belum ada data</div>
      </div>
      <div id="bm-light-high" style="background:#fff7ed;border:1px solid #fed7aa;padding:8px 10px;border-radius:7px;font-size:11px;">
        <div style="font-weight:800;color:#9a3412;margin-bottom:4px;">☀️ Cahaya BERLEBIH</div>
        <div id="bm-light-high-stats" style="color:#374151;">— belum ada data</div>
      </div>
    </div>

    <!-- Tabel riwayat per event match -->
    <div style="overflow-x:auto;max-height:320px;overflow-y:auto;border:1px solid #ede9fe;border-radius:7px;">
      <table id="bm-match-log-table">
        <thead>
          <tr>
            <th>Waktu</th>
            <th>User</th>
            <th>Cahaya</th>
            <th>Hasil</th>
            <th>Lat Vektor (ms)</th>
            <th>Lat Mask (ms)</th>
            <th>Lebih Cepat</th>
            <th>Acc Vektor</th>
            <th>Acc Mask</th>
            <th>Unggul Akurasi</th>
            <th>Mask Tambah?</th>
            <th>Mask Bottleneck?</th>
          </tr>
        </thead>
        <tbody id="bm-match-log-tbody">
          <tr><td colspan="12" style="text-align:center;color:#9ca3af;padding:16px;">Belum ada event match. Mulai sesi presensi untuk mengisi log.</td></tr>
        </tbody>
      </table>
    </div>
    <div style="font-size:11px;color:#7c3aed;margin-top:6px;opacity:.7;">Menampilkan 50 event match terbaru. Export untuk data lengkap.</div>
  </div>

  <div class="ps-card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px;">
      <div style="font-weight:700; font-size:14px;">📋 Histori Log Presensi Masuk</div>
      <div style="display:flex;gap:6px;">
        <button class="ps-btn ps-btn-s" onclick="presensi.exportLog()">⬇ Simpan CSV</button>
        <button class="ps-btn ps-btn-d" onclick="presensi.clearLog()">🗑 Bersihkan Log</button>
        <button class="ps-btn ps-btn-s" onclick="presensi.resetSession()" title="Kosongkan memori daftar hadir sesi saat ini">🔄 Refresh Sesi Scan</button>
      </div>
    </div>
    <div id="ps-log-box" style="max-height:250px;overflow-y:auto;border:1px solid #f3f4f6; padding:4px 8px; border-radius:6px;"></div>
  </div>
</div>`;
        },

        // [BENCHMARK] Update elemen DOM panel monitor dengan hasil executeFrameTest
        // Buffer histori per-frame untuk keperluan export CSV benchmark
        _benchRows: [],

        _updateBenchmarkUI(bench) {
            const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
            set('bm-acc-new', bench.summary.tanpaMask.accuracy);
            set('bm-frr-new', bench.summary.tanpaMask.frr);
            set('bm-lat-new', `${bench.instant.tanpaMask.toFixed(2)}ms / ${bench.summary.tanpaMask.avgLatency}`);
            set('bm-acc-old', bench.summary.denganMask.accuracy);
            set('bm-frr-old', bench.summary.denganMask.frr);
            set('bm-lat-old', `${bench.instant.denganMask.toFixed(2)}ms / ${bench.summary.denganMask.avgLatency}`);

            // Rekam baris data per-frame ke buffer (maks 5000 baris agar tidak bocor memori)
            this._benchRows.push({
                ts          : new Date().toISOString(),
                frame       : this._benchRows.length + 1,
                latNew      : bench.instant.tanpaMask.toFixed(4),
                latOld      : bench.instant.denganMask.toFixed(4),
                accNew      : bench.summary.tanpaMask.accuracy,
                frrNew      : bench.summary.tanpaMask.frr,
                avgLatNew   : bench.summary.tanpaMask.avgLatency,
                accOld      : bench.summary.denganMask.accuracy,
                frrOld      : bench.summary.denganMask.frr,
                avgLatOld   : bench.summary.denganMask.avgLatency
            });
            if (this._benchRows.length > 5000) this._benchRows.shift();

            // [v1.2.0] Update panel log benchmark match jika ada entri baru
            if (benchmarkEngine) {
                const logCount = benchmarkEngine.getMatchLog().length;
                const prevCount = parseInt(document.getElementById('bm-match-count')?.dataset?.count || '0');
                if (logCount !== prevCount) {
                    this._refreshBenchMatchLog();
                    const countEl = document.getElementById('bm-match-count');
                    if (countEl) { countEl.textContent = `${logCount} match`; countEl.dataset.count = logCount; }
                }
            }
        },

        /**
         * [v1.2.0] Memperbarui tabel log benchmark match dan ringkasan per kondisi cahaya di UI.
         * Dipanggil setiap kali ada entri baru di matchLog benchmarkEngine.
         */
        _refreshBenchMatchLog() {
            if (!benchmarkEngine) return;

            const log     = benchmarkEngine.getMatchLog();
            const summary = benchmarkEngine.getMatchLogSummary();
            const tbody   = document.getElementById('bm-match-log-tbody');

            // ── Update ringkasan per kondisi cahaya ──────────────────────────
            const renderLightStats = (condId, data) => {
                const el = document.getElementById(`bm-light-${condId}-stats`);
                if (!el) return;
                if (!data || data.totalMatch === 0) {
                    el.innerHTML = '— belum ada data';
                    return;
                }
                const tm = data.tanpaMask, dm = data.denganMask;
                el.innerHTML = `
                    <b>Total match:</b> ${data.totalMatch}<br>
                    <b>Vektor:</b> ${tm.matches} match · ${tm.avgLatency_ms ?? '—'} ms avg lat · dist ${tm.avgDist ?? '—'}<br>
                    <b>Mask:</b> ${dm.matches} match · ${dm.avgLatency_ms ?? '—'} ms avg lat · dist ${dm.avgDist ?? '—'}
                `;
            };
            renderLightStats('ok',   summary.ok);
            renderLightStats('low',  summary.low);
            renderLightStats('high', summary.high);

            // ── Update tabel riwayat (50 terbaru, terbaru di atas) ───────────
            if (!tbody) return;
            if (!log.length) {
                tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;color:#9ca3af;padding:16px;">Belum ada event match.</td></tr>';
                return;
            }

            const recent = [...log].reverse().slice(0, 50);
            tbody.innerHTML = recent.map(e => {
                const c = e.comparison;
                const resultClass = e.match.result === 'KEDUANYA' ? 'bm-keduanya'
                    : e.match.result === 'HANYA_VEKTOR' ? 'bm-hanya-vektor' : 'bm-hanya-mask';
                const lightClass = c.cahayaBuruk ? 'bm-bad-light' : 'bm-ok-light';
                const lightLabel = e.lightCond === 'ok' ? '✅ normal' : e.lightCond === 'low' ? '🌑 rendah' : '☀️ berlebih';

                const fmtLat = (v, isWinner) =>
                    `<span class="${isWinner ? 'bm-winner' : 'bm-loser'}">${v}</span>`;
                const fmtAcc = (v, isWinner) =>
                    `<span class="${isWinner ? 'bm-winner' : 'bm-loser'}">${v}</span>`;

                const latWinA = c.lebihCepatInstan === 'tanpaMask';
                const accWinA = c.unggulAkurasi === 'tanpaMask';

                return `<tr>
  <td style="white-space:nowrap;color:#6b7280;">${e.timestamp.slice(11,19)}</td>
  <td style="max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${e.userId}">${e.userId}</td>
  <td class="${lightClass}">${lightLabel}</td>
  <td><span class="${resultClass}">${e.match.result}</span></td>
  <td>${fmtLat(e.latensi.tanpaMask_ms, latWinA)}</td>
  <td>${fmtLat(e.latensi.denganMask_ms, !latWinA)}</td>
  <td style="font-weight:700;color:#0891b2;">${c.lebihCepatInstan === 'tanpaMask' ? '⚡ Vektor' : '⚡ Mask'} <span style="color:#9ca3af;font-weight:400;">(Δ${c.selisihLatInstan}ms)</span></td>
  <td>${fmtAcc(e.akurasi.tanpaMask, accWinA)}</td>
  <td>${fmtAcc(e.akurasi.denganMask, !accWinA)}</td>
  <td style="font-weight:700;color:#7c3aed;">${c.unggulAkurasi === 'tanpaMask' ? '🏆 Vektor' : '🏆 Mask'} <span style="color:#9ca3af;font-weight:400;">(Δ${c.selisihAkurasi}%)</span></td>
  <td style="text-align:center;">${c.maskMemberikanNilaiTambah ? '<span style="color:#166534;font-weight:700;">✅ YA</span>' : '<span style="color:#9ca3af;">—</span>'}</td>
  <td style="text-align:center;">${c.maskMenjadiBottleneck ? '<span style="color:#dc2626;font-weight:700;">⚠️ YA</span>' : '<span style="color:#9ca3af;">—</span>'}</td>
</tr>`;
            }).join('');
        },

        exportBenchmarkCSV() {
            if (!this._benchRows.length) return null;
            const header = [
                'Timestamp','Frame',
                'Latensi_Baru_ms','Latensi_Lama_ms',
                'Akurasi_Baru','FRR_Baru','AvgLat_Baru',
                'Akurasi_Lama','FRR_Lama','AvgLat_Lama'
            ].join(',') + '\n';
            const rows = this._benchRows.map(r =>
                [r.ts, r.frame, r.latNew, r.latOld,
                 r.accNew, r.frrNew, r.avgLatNew,
                 r.accOld, r.frrOld, r.avgLatOld].join(',')
            ).join('\n');

            // Append baris ringkasan di bawah
            const last = this._benchRows[this._benchRows.length - 1];
            const summary = [
                '', 'RINGKASAN', '', '',
                last.accNew, last.frrNew, last.avgLatNew,
                last.accOld, last.frrOld, last.avgLatOld
            ].join(',');

            return header + rows + '\n\n' + summary + '\n';
        },

        _bind() {
            const video  = document.getElementById('ps-video');
            const canvas = document.getElementById('ps-canvas');
            if (!video || !canvas) return;

            engine.on('ready',         ()  => this._onReady());
            engine.on('error',         d   => this._setStatus(`❌ Kesalahan Inisialisasi: ${d.message}`, 'err'));
            engine.on('frame',         d   => this._onFrame(d));
            engine.on('match',         d   => this._onMatch(d));
            engine.on('no_match',      d   => this._onNoMatch(d));
            engine.on('no_face',       ()  => {
                if(engine._activeTab === 'presensi') this._setStatus('👤 Arahkan mata & wajah tepat pada oval panduan', 'info');
            });
            engine.on('light_warning', d   => this._setStatus(d.condition === 'low' ? `🌑 Intensitas cahaya rendah (${d.brightness.toFixed(0)})` : `☀️ Paparan cahaya berlebih (${d.brightness.toFixed(0)})`, 'warn'));
            engine.on('occluded',      d   => this._setStatus(`🙈 Deteksi Terganggu: Sebagian struktur wajah Anda tertutup masker/tangan`, 'warn'));
            engine.on('ambiguous',     d   => this._setStatus(`⚠️ Wajah Ambigu (Kemiripan Ganda): ${d.candidates[0].name} mirip dengan ${d.candidates[1].name}`, 'warn'));
            engine.on('multi_face',    d   => this._setStatus(`👥 Terdeteksi lebih dari 1 wajah. Harap scan bergantian satu per satu`, 'warn'));
            engine.on('enrolled',      d   => {
                this._setStatus(`✅ Sukses: Data biometrik '${d.name}' telah disimpan ke lokal`, 'ok');
                this._hideProgress();
                this._refreshTable();
                this._refreshLog();
                const inp = this._el('ps-enroll-name');
                if (inp) inp.value = '';
            });
            engine.on('enroll_blocked', d => this._setStatus(`⚠️ Pendaftaran Ditunda: Struktur wajah tidak terlihat jelas atau pencahayaan buruk`, 'warn'));

            engine.init(video, canvas).then(ok => { if (ok) engine.start(); });

            this._refreshTable();
            this._refreshLog();
            this._refreshBenchMatchLog();
        },

        _el(id) { return document.getElementById(id); },
        _onReady()  { this._setStatus('🟢 Sistem Siap — Kamera aktif mendeteksi', 'ok'); },
        _onFrame(d) {
            const lat = this._el('ps-m-lat'), faces = this._el('ps-m-faces'), bright = this._el('ps-m-bright');
            if (lat)    lat.textContent   = d.latencyMs.toFixed(1);
            if (faces)  faces.textContent = d.faceCount;
            if (bright) bright.textContent= d.brightness.toFixed(0);
        },

        _onMatch(d) {
            const distEl = this._el('ps-m-dist'), nameEl = this._el('ps-match-name'), distEl2 = this._el('ps-match-dist'), ov = this._el('ps-scan-overlay');
            if (distEl)  distEl.textContent  = d.dist.toFixed(4);
            if (nameEl)  nameEl.textContent  = d.user.name;
            if (distEl2) distEl2.textContent = `Vektor Jarak Euclidean: ${d.dist.toFixed(5)}`;
            if (ov)      ov.style.display    = 'flex';

            this._setStatus(`✅ Presensi Berhasil Dicatat: ${d.user.name}`, 'ok');
            this._refreshLog();
        },

        _onNoMatch(d) {
            const distEl = this._el('ps-m-dist');
            if (distEl) distEl.textContent = d.dist.toFixed(4);
            this._setStatus(`🔍 Mencari kecocokan data... (Akurasi Jarak: ${d.dist.toFixed(4)})`, 'info');
        },

        _setStatus(msg, type = 'info') {
            const el = this._el('ps-status');
            if (!el) return;
            const colorMap = { ok: '#dcfce7', warn: '#fef9c3', err: '#fee2e2', info: '#e0f2fe' };
            el.style.background = colorMap[type] || colorMap.info;
            el.textContent = msg;
        },

        _hideProgress() {
            const el = this._el('ps-enroll-progress');
            if (el) el.style.display = 'none';
        },

        _refreshTable() {
            const tbody = this._el('ps-user-tbody');
            const count = this._el('ps-user-count');
            if (!tbody) return;

            const users = dataset.getAll().sort((a, b) => new Date(b.enrolledAt) - new Date(a.enrolledAt));
            if (count) count.textContent = users.length;

            tbody.innerHTML = users.map(u => {
                const hasVec    = u.vec && u.vec.length > 0;
                const modeLabel = hasVec ? (u.maskData ? '✅ Aktif (Full)' : '⚠️ Vektor Saja') : '🌱 Kosong';
                const modeBg    = hasVec ? (u.maskData ? '#dcfce7' : '#fef9c3') : '#fee2e2';
                const modeColor = hasVec ? (u.maskData ? '#166534' : '#854d0e') : '#991b1b';
                return `<tr>
  <td><strong>${u.name}</strong></td>
  <td>${u.kelas || '—'}</td>
  <td style="color:#4b5563;font-size:12px;">${new Date(u.enrolledAt).toLocaleString('id-ID')}</td>
  <td style="text-align:center;">${u.sampleCount || 0}</td>
  <td><span class="ps-badge" style="background:${modeBg};color:${modeColor}">${modeLabel}</span></td>
  <td>
    <button class="ps-btn ps-btn-d" style="padding:4px 10px;font-size:11px;" onclick="presensi.deleteUser('${u.id}')">Hapus</button>
  </td>
</tr>`;
            }).join('') || '<tr><td colspan="6" style="text-align:center;color:#9ca3af;padding:24px;">Belum ada basis data wajah terdaftar</td></tr>';
        },

        _refreshLog() {
            const box = this._el('ps-log-box');
            if (!box) return;

            const tagMap = { MATCH: 'ps-tag-match', ENROLL: 'ps-tag-info', AMBIGUOUS: 'ps-tag-warn', MULTI_FACE: 'ps-tag-warn', OCCLUDED: 'ps-tag-warn' };
            const entries = presLog.all().slice(-60).reverse();

            box.innerHTML = entries.map(e => {
                const tag   = tagMap[e.type] || 'ps-tag-info';
                const name  = e.name   ? `<b>${e.name}</b>` : '';
                const dist  = e.dist   ? `<span style="color:#0891b2;">dist:${Number(e.dist).toFixed(4)}</span>` : '';
                const extra = [name, dist, e.note].filter(Boolean).join(' · ');
                return `<div class="ps-log-row">
  <span style="color:#6b7280;">${e.ts.slice(11, 19)}</span>
  <span class="ps-tag ${tag}">${e.type}</span>
  <span style="color:#374151;">${extra}</span>
</div>`;
            }).join('') || '<div style="text-align:center;color:#9ca3af;padding:12px;">Belum ada aktivitas presensi masuk</div>';
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    //  DONATJS COMPONENT REGISTRATION
    // ═══════════════════════════════════════════════════════════════════════════

    function registerComponent() {
        if (typeof components === 'undefined') {
            let attempts = 0;
            const poll = setInterval(() => {
                attempts++;
                if (typeof components !== 'undefined') { clearInterval(poll); _register(); }
                else if (attempts > 30) { clearInterval(poll); console.warn('[presensi-patch] Modul komponen DonatJS gagal dimuat.'); }
            }, 100);
        } else { _register(); }
    }

    function _register() {
        components.presensi = function(d) {
            const containerId = `ps-container-${Date.now()}`;
            setTimeout(() => { if (typeof presensi !== 'undefined') { presensi.init(containerId); } }, 80);
            return `<div class="row page" style="padding:0;"><div id="${containerId}" style="width:100%;"></div></div>`;
        };
        console.log('[presensi-patch] components.presensi terdaftar ✓');
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  NAMESPACE PUBLIK — window.presensi
    // ═══════════════════════════════════════════════════════════════════════════

    window.presensi = {
        init(containerId) {
            config.load();
            dataset.load();
            presLog.load();
            dataset.seedFromPages();
            if (containerId) ui.render(containerId);
        },

        switchTab(tabName) {
            engine._activeTab = tabName;

            // Perbarui visual tombol tab di DOM
            const btnPresensi = document.getElementById('tab-presensi');
            const btnEnroll = document.getElementById('tab-enroll');
            const panelEnroll = document.getElementById('panel-enroll');

            if (tabName === 'enroll') {
                btnEnroll?.classList.add('active');
                btnPresensi?.classList.remove('active');
                if (panelEnroll) panelEnroll.style.display = 'block';
                ui._setStatus('🔄 Mode Registrasi Wajah diaktifkan. Silakan input nama subjek.', 'info');
            } else {
                btnPresensi?.classList.add('active');
                btnEnroll?.classList.remove('active');
                if (panelEnroll) panelEnroll.style.display = 'none';
                this.resumeScan();
            }
        },

        resumeScan() {
            // FIX UTAMA: Bersihkan overlay HTML sukses
            const overlayEl = document.getElementById('ps-scan-overlay');
            if (overlayEl) overlayEl.style.display = 'none';

            // FIX ENGINE LOOP: Izinkan deteksi wajah baru dengan menghapus cache ID & mereset timer
            engine._matchedIds.clear();
            engine._lastMatchMs = 0;
            engine._overlayState = 'idle';
            ui._setStatus('🟢 Sistem Siap — Menunggu wajah baru untuk dipindai', 'ok');
        },

        startEnroll() {
            const inp  = document.getElementById('ps-enroll-name');
            const name = inp?.value?.trim();
            if (!name) { alert('Harap isi nama subjek sebelum memulai pemindaian enroll!'); return; }

            const prog = document.getElementById('ps-enroll-progress');
            const fill = document.getElementById('ps-progress-fill');
            if (prog) prog.style.display = 'block';

            engine.startEnroll(name, (done, total) => {
                if (fill) fill.style.width = `${(done / total) * 100}%`;
                const statusEl = document.getElementById('ps-enroll-status');
                if (statusEl) statusEl.textContent = `Mengumpulkan sampel titik: ${done} dari ${total} selesai`;
            });
        },

        deleteUser(id) {
            if (!confirm('Apakah Anda yakin ingin menghapus data biometrik wajah ini?')) return;
            dataset.delete(id);
            ui._refreshTable();
            presLog.push('DELETE', { id });
        },

        exportDataset() {
            const json = dataset.exportJSON();
            const a    = Object.assign(document.createElement('a'), {
                href     : URL.createObjectURL(new Blob([json], { type: 'application/json' })),
                download : `dataset_wajah_${new Date().toISOString().slice(0, 10)}.json`
            });
            a.click();
        },

        importDataset(inputEl) {
            const file = inputEl.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = e => {
                try {
                    const result = dataset.importJSON(e.target.result);
                    alert(`Import Selesai: Berhasil memuat ${result.added} data wajah baru.`);
                    ui._refreshTable();
                } catch (err) { alert('Format file JSON tidak cocok: ' + err.message); }
            };
            reader.readAsText(file);
            inputEl.value = '';
        },

        clearLog()  { if (!confirm('Hapus seluruh riwayat presensi masuk hari ini?')) return; presLog.clear(); ui._refreshLog(); },

        exportBenchmark() {
            const csv = ui.exportBenchmarkCSV();
            if (!csv) { alert('Belum ada data benchmark. Jalankan sesi presensi terlebih dahulu agar data terkumpul.'); return; }
            const a = Object.assign(document.createElement('a'), {
                href     : URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' })),
                download : `benchmark_frame_${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.csv`
            });
            a.click();
        },

        /**
         * [v1.2.0] Export log benchmark match (event match saja) ke CSV atau JSON.
         * Data mencakup perbandingan akurasi, latensi, dan kondisi cahaya per event.
         * @param {'csv'|'json'} format Format output yang diinginkan
         */
        exportBenchmarkMatchLog(format = 'csv') {
            if (!benchmarkEngine) { alert('Benchmark engine tidak tersedia.'); return; }
            if (!benchmarkEngine.getMatchLog().length) {
                alert('Belum ada event match yang tercatat. Jalankan sesi presensi dan tunggu hingga wajah terdeteksi.');
                return;
            }
            if (format === 'json') {
                const json = benchmarkEngine.exportMatchLogJSON();
                const a = Object.assign(document.createElement('a'), {
                    href     : URL.createObjectURL(new Blob([json], { type: 'application/json' })),
                    download : `benchmark_matchlog_${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.json`
                });
                a.click();
            } else {
                const csv = benchmarkEngine.exportMatchLogCSV();
                if (!csv) { alert('Gagal mengekspor data match log.'); return; }
                const a = Object.assign(document.createElement('a'), {
                    href     : URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' })),
                    download : `benchmark_matchlog_${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.csv`
                });
                a.click();
            }
        },

        exportLog() {
            const csv = presLog.exportCSV();
            const a   = Object.assign(document.createElement('a'), {
                href     : URL.createObjectURL(new Blob([csv], { type: 'text/csv' })),
                download : `report_presensi_${new Date().toISOString().slice(0, 10)}.csv`
            });
            a.click();
        },

        resetSession() { this.resumeScan(); },
        stop()         { engine.stop(); },
        version        : VERSION
    };

    registerComponent();
})();
