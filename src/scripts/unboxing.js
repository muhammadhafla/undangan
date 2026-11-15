import { WEDDING_CONFIG } from '../config.js';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = import.meta.env?.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY || '';

let supabase = null;
try {
    if (SUPABASE_URL && SUPABASE_ANON_KEY) {
        supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
} catch (e) {
    console.warn('Supabase client failed to initialize in unboxing:', e);
}

/**
 * Audio Ambience Engine
 * Mendukung audio file (HTML5 Audio) dan Generative Web Audio API Fallback
 * (Suara Lo-Fi chord hangat + gemercik air alam mengalir)
 */
class AmbienceEngine {
    constructor() {
        this.isPlaying = false;
        this.audioEl = null;
        this.audioCtx = null;
        this.masterGain = null;
        this.isSynthesized = false;
        this.synthNodes = [];
        this.tearBuffer = null;
        this.rustleBuffer = null;
    }

    _ensureAudioContext() {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!this.audioCtx && AudioContext) {
            this.audioCtx = new AudioContext();
        }
        if (this.audioCtx && this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }
        return this.audioCtx;
    }

    _getOrCreateTearBuffer(ctx) {
        if (this.tearBuffer) return this.tearBuffer;
        const duration = 0.58;
        const sampleRate = ctx.sampleRate;
        const buffer = ctx.createBuffer(1, Math.floor(sampleRate * duration), sampleRate);
        const data = buffer.getChannelData(0);

        let b0 = 0, b1 = 0, b2 = 0;
        for (let i = 0; i < buffer.length; i++) {
            const progress = i / buffer.length;
            const white = Math.random() * 2 - 1;
            b0 = 0.99886 * b0 + white * 0.0555179;
            b1 = 0.99332 * b1 + white * 0.0750759;
            b2 = 0.96900 * b2 + white * 0.1538520;
            const pink = b0 + b1 + b2 + white * 0.5362;
            const toothSnap = Math.sin(progress * Math.PI * 48) > 0.88 ? (Math.random() - 0.5) * 4.5 : 0;
            const fiberRip = Math.random() > 0.95 ? (Math.random() - 0.5) * 2.8 : 0;
            data[i] = (pink * 0.35 + toothSnap + fiberRip) * (1 - Math.pow(progress, 1.8));
        }
        this.tearBuffer = buffer;
        return this.tearBuffer;
    }

    _getOrCreateRustleBuffer(ctx) {
        if (this.rustleBuffer) return this.rustleBuffer;
        const duration = 0.55;
        const sampleRate = ctx.sampleRate;
        const buffer = ctx.createBuffer(1, Math.floor(sampleRate * duration), sampleRate);
        const data = buffer.getChannelData(0);

        let lastSample = 0;
        for (let i = 0; i < buffer.length; i++) {
            const white = Math.random() * 2 - 1;
            lastSample = (lastSample + (0.04 * white)) / 1.04;
            const rustle = Math.random() > 0.94 ? (Math.random() - 0.5) * 1.8 : 0;
            const envelope = Math.sin((i / buffer.length) * Math.PI);
            data[i] = (lastSample * 0.45 + rustle) * envelope;
        }
        this.rustleBuffer = buffer;
        return this.rustleBuffer;
    }

    init() {
        // Coba inisialisasi audio element jika ada file
        this.audioEl = new Audio();
        this.audioEl.loop = true;
        this.audioEl.src = 'assets/audio/ambience.opus';

        this.audioEl.addEventListener('error', () => {
            // Jika file audio belum ada, otomatis aktifkan synth audio alam
            this.isSynthesized = true;
        });

        // Pre-warm audio buffers saat idle agar tidak membebani main thread saat tap
        const warmup = () => {
            try {
                const ctx = this._ensureAudioContext();
                if (ctx) {
                    this._getOrCreateTearBuffer(ctx);
                    this._getOrCreateRustleBuffer(ctx);
                }
            } catch (_) {}
        };
        if (typeof window.requestIdleCallback === 'function') {
            window.requestIdleCallback(warmup, { timeout: 1500 });
        } else {
            setTimeout(warmup, 250);
        }
    }

    /**
     * Efek Suara Sobekan Perforasi Kertas Kardus (Cardboard Zipper Tear SFX)
     * Menggunakan buffer yang sudah di-precache tanpa kalkulasi loop berat saat tap
     */
    playCardboardTearSFX() {
        try {
            const ctx = this._ensureAudioContext();
            if (!ctx) return;

            const now = ctx.currentTime;
            const duration = 0.58;
            const buffer = this._getOrCreateTearBuffer(ctx);

            const noiseSource = ctx.createBufferSource();
            noiseSource.buffer = buffer;

            // Filter frekuensi gesekan sobekan serat kardus
            const bpFilter = ctx.createBiquadFilter();
            bpFilter.type = 'bandpass';
            bpFilter.frequency.setValueAtTime(1600, now);
            bpFilter.frequency.exponentialRampToValueAtTime(750, now + duration);
            bpFilter.Q.setValueAtTime(2.2, now);

            const hpFilter = ctx.createBiquadFilter();
            hpFilter.type = 'highpass';
            hpFilter.frequency.setValueAtTime(500, now);

            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0.001, now);
            gain.gain.linearRampToValueAtTime(0.95, now + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

            noiseSource.connect(bpFilter);
            bpFilter.connect(hpFilter);
            hpFilter.connect(gain);
            gain.connect(ctx.destination);

            noiseSource.start(now);
        } catch (e) {
            console.warn('Cardboard tear SFX error:', e);
        }
    }

    /**
     * Micro-pop letupan gigi perforasi saat pita ditarik manual dengan jari
     */
    playTearPop(progress = 0) {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!this.audioCtx) {
                this.audioCtx = new AudioContext();
            }
            if (this.audioCtx.state === 'suspended') {
                this.audioCtx.resume();
            }

            const now = this.audioCtx.currentTime;
            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();

            // Frekuensi pop gigi kardus yang sedikit bervariasi mengikuti tarikan
            const baseFreq = 950 + (progress * 420) + (Math.random() * 160 - 80);
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(baseFreq, now);
            osc.frequency.exponentialRampToValueAtTime(160, now + 0.024);

            gain.gain.setValueAtTime(0.001, now);
            gain.gain.linearRampToValueAtTime(0.18, now + 0.003);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.024);

            osc.connect(gain);
            gain.connect(this.audioCtx.destination);

            osc.start(now);
            osc.stop(now + 0.026);
        } catch (_) {}
    }

    /**
     * Efek Suara Gesekan Serat Kertas (Paper Rustle SFX)
     * Menggunakan buffer yang sudah di-precache tanpa kalkulasi loop berat
     */
    playPaperRustleSFX() {
        try {
            const ctx = this._ensureAudioContext();
            if (!ctx) return;

            const now = ctx.currentTime;
            const duration = 0.55;
            const buffer = this._getOrCreateRustleBuffer(ctx);

            const noise = ctx.createBufferSource();
            noise.buffer = buffer;

            // Bandpass filter frekuensi gesekan kertas (2.2kHz - 4.5kHz)
            const filter = ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(2800, now);
            filter.frequency.exponentialRampToValueAtTime(1900, now + duration);
            filter.Q.setValueAtTime(1.4, now);

            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0.001, now);
            gain.gain.linearRampToValueAtTime(0.28, now + 0.08);
            gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

            noise.connect(filter);
            filter.connect(gain);
            gain.connect(ctx.destination);

            noise.start(now);
        } catch (e) {
            console.warn('Paper rustle SFX error:', e);
        }
    }

    startSynthesizedAmbience() {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!this.audioCtx) {
                this.audioCtx = new AudioContext();
            }
            if (this.audioCtx.state === 'suspended') {
                this.audioCtx.resume();
            }

            this.masterGain = this.audioCtx.createGain();
            this.masterGain.gain.setValueAtTime(0.001, this.audioCtx.currentTime);
            this.masterGain.connect(this.audioCtx.destination);

            // 1. Simulator Gemercik Air Mengalir (Pink/Brownian Noise filtered)
            const bufferSize = this.audioCtx.sampleRate * 2;
            const noiseBuffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
            const output = noiseBuffer.getChannelData(0);
            let lastOut = 0.0;
            for (let i = 0; i < bufferSize; i++) {
                const white = Math.random() * 2 - 1;
                output[i] = (lastOut + (0.02 * white)) / 1.02;
                lastOut = output[i];
                output[i] *= 2.5; // Gain
            }

            const whiteNoise = this.audioCtx.createBufferSource();
            whiteNoise.buffer = noiseBuffer;
            whiteNoise.loop = true;

            const waterFilter = this.audioCtx.createBiquadFilter();
            waterFilter.type = 'bandpass';
            waterFilter.frequency.value = 650;
            waterFilter.Q.value = 1.2;

            // LFO untuk variasi gemercik air
            const lfo = this.audioCtx.createOscillator();
            lfo.frequency.value = 0.25;
            const lfoGain = this.audioCtx.createGain();
            lfoGain.gain.value = 250;
            lfo.connect(lfoGain);
            lfoGain.connect(waterFilter.frequency);
            lfo.start();

            const waterGain = this.audioCtx.createGain();
            waterGain.gain.value = 0.35;

            whiteNoise.connect(waterFilter);
            waterFilter.connect(waterGain);
            waterGain.connect(this.masterGain);
            whiteNoise.start();

            // 2. Chord Lo-Fi Akustik Hangat (Pentatonik D Major 7: D4, F#4, A4, C#5)
            const chordFreqs = [293.66, 369.99, 440.00, 554.37];
            chordFreqs.forEach((freq, idx) => {
                const osc = this.audioCtx.createOscillator();
                osc.type = 'sine';
                osc.frequency.value = freq;

                // Subtle detune
                osc.detune.value = (idx - 1.5) * 4;

                const oscGain = this.audioCtx.createGain();
                oscGain.gain.value = 0.04;

                osc.connect(oscGain);
                oscGain.connect(this.masterGain);
                osc.start();
                this.synthNodes.push(osc);
            });

            this.synthNodes.push(whiteNoise, lfo);

            // Fade-in curve: 0% -> 60% dalam 2.5 detik
            this.masterGain.gain.exponentialRampToValueAtTime(0.45, this.audioCtx.currentTime + 2.5);
            this.isPlaying = true;
        } catch (e) {
            console.warn('Synthesizer audio ambience fallback active:', e);
        }
    }

    play() {
        if (this.isSynthesized || !this.audioEl || !this.audioEl.src) {
            this.startSynthesizedAmbience();
            this.isPlaying = true;
            return;
        }

        this.audioEl.volume = 0;
        const playPromise = this.audioEl.play();
        if (playPromise !== undefined) {
            playPromise.then(() => {
                this.isPlaying = true;
                // Fade-in volume
                let vol = 0;
                const interval = setInterval(() => {
                    vol += 0.05;
                    if (vol >= 0.6) {
                        vol = 0.6;
                        clearInterval(interval);
                    }
                    this.audioEl.volume = vol;
                }, 150);
            }).catch(() => {
                // Jika audio diblokir browser, beralih ke synthesizer
                this.isSynthesized = true;
                this.startSynthesizedAmbience();
            });
        }
    }

    pause() {
        this.isPlaying = false;
        if (this.audioEl && !this.isSynthesized) {
            this.audioEl.pause();
        }
        if (this.masterGain && this.audioCtx) {
            this.masterGain.gain.setValueAtTime(0.001, this.audioCtx.currentTime);
        }
    }

    toggle() {
        if (this.isPlaying) {
            this.pause();
        } else {
            if (this.masterGain && this.audioCtx) {
                this.masterGain.gain.exponentialRampToValueAtTime(0.45, this.audioCtx.currentTime + 0.8);
                this.isPlaying = true;
            } else {
                this.play();
            }
        }
        return this.isPlaying;
    }
}

/**
 * Inisialisasi Logika Unboxing & Welcome Screen
 */
export function initUnboxing() {
    const ambience = new AmbienceEngine();
    ambience.init();

    // 1. Ekstrak Parameter URL (?to=... &code=...)
    const urlParams = new URLSearchParams(window.location.search);
    const guestNameParam = urlParams.get('to');
    const guestCodeParam = urlParams.get('code');

    const recipientLabelEl = document.getElementById('waybill-recipient-name');
    const stubRecipientLabelEl = document.getElementById('stub-recipient-name');
    const guestCodeLabelEl = document.getElementById('waybill-guest-code');
    const guestCodeBarcodeEl = document.getElementById('barcode-text-display');
    const guestCodeStubBarcodeEl = document.getElementById('barcode-stub-code');

    let displayName = (guestNameParam && guestNameParam.trim() !== '') 
        ? guestNameParam.trim() 
        : 'Sahabat & Kerabat Tercinta';

    // Rapikan duplikasi "Yth." jika ada, karena label atas sudah bertuliskan "KEPADA YTH:"
    const cleanName = displayName.replace(/^yth\.?\s*/i, '');

    if (recipientLabelEl) recipientLabelEl.textContent = cleanName;
    if (stubRecipientLabelEl) stubRecipientLabelEl.textContent = displayName;

    const uniqueCode = guestCodeParam || '200417537039';
    if (guestCodeLabelEl) guestCodeLabelEl.textContent = uniqueCode;
    if (guestCodeBarcodeEl) guestCodeBarcodeEl.textContent = uniqueCode;
    if (guestCodeStubBarcodeEl) guestCodeStubBarcodeEl.textContent = uniqueCode;

    // Simpan di session/local state
    localStorage.setItem('undangan_guest_code', uniqueCode);
    if (guestNameParam) localStorage.setItem('undangan_guest_name', guestNameParam);

    // Pelacakan Asinkron Undangan Dibuka (Link Open Tracking)
    if (guestCodeParam && supabase) {
        supabase.rpc('track_guest_open', { p_code: guestCodeParam })
            .then(({ data, error }) => {
                if (error) {
                    console.debug('Open tracking error:', error.message);
                } else if (data?.success) {
                    console.debug('Invitation open recorded for code:', guestCodeParam);
                }
            })
            .catch(err => console.debug('Open tracking failed:', err));
    }

    // 2. Tombol Floating Audio Player
    const audioBtn = document.getElementById('floating-audio-btn');
    const audioStatusLabel = document.getElementById('audio-status-label');

    if (audioBtn) {
        audioBtn.addEventListener('click', () => {
            const playing = ambience.toggle();
            if (playing) {
                audioBtn.classList.add('playing');
                if (audioStatusLabel) audioStatusLabel.textContent = 'Musik';
            } else {
                audioBtn.classList.remove('playing');
                if (audioStatusLabel) audioStatusLabel.textContent = 'Mute';
            }
        });
    }

    // Kunci event scroll sebelum amplop dibuka
    const preventScroll = (e) => {
        if (document.body.classList.contains('envelope-locked')) {
            e.preventDefault();
        }
    };
    window.addEventListener('touchmove', preventScroll, { passive: false });
    window.addEventListener('wheel', preventScroll, { passive: false });

    // 3. Mekanisme Pembuka Pita Perforasi (Hybrid Real-Time Drag & Single Tap Fallback)
    const sealBtn = document.getElementById('envelope-seal-btn');
    const envelopeWrapper = document.getElementById('envelope-wrapper');
    const envelopeStage = document.getElementById('envelope-stage');
    const unboxedFlow = document.getElementById('unboxed-content-flow');
    const peelingStripLayer = sealBtn ? sealBtn.querySelector('.peeling-strip-layer') : null;
    const cavityEl = sealBtn ? sealBtn.querySelector('.tear-open-cavity') : null;

    if (sealBtn && envelopeWrapper) {
        let isDragging = false;
        let isTearCompleted = false;
        let startX = 0;
        let currentProgress = 0;
        let lastPopProgress = 0;
        let hasMovedSignificant = false;

        const getStripWidth = () => {
            const rect = sealBtn.getBoundingClientRect();
            return rect.width > 0 ? rect.width : (window.innerWidth || 360);
        };

        const completeTear = (isInstantTap = false) => {
            if (isTearCompleted || envelopeWrapper.classList.contains('opened')) return;
            isTearCompleted = true;
            isDragging = false;

            envelopeWrapper.classList.remove('dragging');
            envelopeWrapper.classList.add('tearing');

            // Bunyikan letupan gigi kardus penuh
            ambience.playCardboardTearSFX();

            // Bersihkan styling inline agar transisi animasi CSS berjalan mulus
            if (peelingStripLayer) {
                peelingStripLayer.style.clipPath = '';
                peelingStripLayer.style.transform = '';
                peelingStripLayer.style.opacity = '';
            }
            if (cavityEl) {
                cavityEl.style.opacity = '';
            }

            const tearAnimDuration = isInstantTap ? 440 : 200;

            // FASE 1: Mulut sobekan cokelat terbuka & DOKUMEN MENYEMBUL (Peeking dari dalam celah)
            setTimeout(() => {
                envelopeWrapper.classList.add('peeking');
            }, Math.max(60, tearAnimDuration - 120));

            // FASE 2: DOKUMEN MELESAT, MELAYANG & MENDARAT DALAM 1 LINTASAN FLUID TERPADU (Total 0.95s)
            setTimeout(() => {
                // Sembunyikan pita sobekan permanen
                if (peelingStripLayer) {
                    peelingStripLayer.style.display = 'none';
                    peelingStripLayer.style.opacity = '0';
                    peelingStripLayer.style.pointerEvents = 'none';
                }
                if (cavityEl) {
                    cavityEl.style.opacity = '1';
                }

                envelopeWrapper.classList.remove('tearing', 'peeking');
                envelopeWrapper.classList.add('ejected');
                envelopeStage.classList.add('unboxed');

                // Bunyikan gesekan serat kertas (paper rustle & whoosh)
                ambience.playPaperRustleSFX();

                // Mulai musik ambience fade-in
                ambience.play();
                if (audioBtn) {
                    audioBtn.classList.add('visible', 'playing');
                    if (audioStatusLabel) audioStatusLabel.textContent = 'Musik';
                }

                // Saat dokumen mulai meluncur turun di separuh lintasan (~420ms), tampilkan lembar surat
                setTimeout(() => {
                    // Buka kunci scroll agar konten di bawah dapat diakses
                    document.documentElement.classList.remove('envelope-locked');
                    document.body.classList.remove('envelope-locked');
                    window.removeEventListener('touchmove', preventScroll);
                    window.removeEventListener('wheel', preventScroll);

                    if (unboxedFlow) {
                        unboxedFlow.classList.add('revealed');
                    }
                }, 420);

                // Setelah seluruh gerakan meluncur selesai (950ms): Amplop bersih
                setTimeout(() => {
                    envelopeWrapper.classList.remove('ejected');
                    envelopeWrapper.classList.add('opened');

                    // Beri buffer 150ms agar dokumen stabil sebelum smooth scroll dimulai
                    setTimeout(() => {
                        const storyEl = document.getElementById('story-section');
                        if (storyEl) {
                            storyEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                    }, 150);
                }, 950);

            }, tearAnimDuration);
        };

        // Pintasan interaktif: ketuk dokumen yang melayang untuk langsung meluncur ke isi surat
        const ejectCard = document.getElementById('ejecting-document-card');
        if (ejectCard) {
            ejectCard.addEventListener('click', () => {
                const storyEl = document.getElementById('story-section');
                if (storyEl) {
                    storyEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
        }

        // Pointer Events: Pelacakan Jari Real-Time dengan rAF Throttling
        let rafMoveId = null;

        sealBtn.addEventListener('pointerdown', (e) => {
            if (isTearCompleted || envelopeWrapper.classList.contains('opened')) return;
            isDragging = true;
            startX = e.clientX;
            currentProgress = 0;
            lastPopProgress = 0;
            hasMovedSignificant = false;
            envelopeWrapper.classList.add('dragging');

            try {
                sealBtn.setPointerCapture(e.pointerId);
            } catch (_) {}
        });

        sealBtn.addEventListener('pointermove', (e) => {
            if (!isDragging || isTearCompleted) return;
            const deltaX = e.clientX - startX;

            if (deltaX > 8) {
                hasMovedSignificant = true;
            }

            const width = getStripWidth();
            const progress = Math.max(0, Math.min(1, deltaX / width));
            currentProgress = progress;

            // Throttling update DOM pita via requestAnimationFrame
            if (!rafMoveId) {
                rafMoveId = requestAnimationFrame(() => {
                    rafMoveId = null;
                    if (peelingStripLayer) {
                        const pct = (currentProgress * 100).toFixed(1);
                        peelingStripLayer.style.clipPath = `polygon(${pct}% 0%, 100% 0%, 100% 100%, ${pct}% 100%)`;
                        peelingStripLayer.style.transform = `rotate(${-currentProgress * 12}deg) translate3d(${currentProgress * 14}px, ${-currentProgress * 8}px, 0) scale(${1 - currentProgress * 0.15})`;
                        peelingStripLayer.style.opacity = currentProgress > 0.85 ? String(1 - (currentProgress - 0.85) / 0.15) : '1';
                    }
                    if (cavityEl) {
                        cavityEl.style.opacity = Math.min(1, currentProgress * 2.2).toFixed(2);
                    }
                });
            }

            // Suara micro-pop tiap gigi perforasi yang terlewati (interval 0.08 progress)
            if (progress - lastPopProgress >= 0.08) {
                ambience.playTearPop(progress);
                lastPopProgress = progress;
            }

            // Ambang batas 60%: Jika ditarik >= 60%, otomatis selesaikan robekan
            if (progress >= 0.60) {
                isDragging = false;
                if (rafMoveId) {
                    cancelAnimationFrame(rafMoveId);
                    rafMoveId = null;
                }
                try {
                    sealBtn.releasePointerCapture(e.pointerId);
                } catch (_) {}
                completeTear(false);
            }
        });

        const handlePointerEnd = (e) => {
            if (!isDragging || isTearCompleted) return;
            isDragging = false;
            envelopeWrapper.classList.remove('dragging');

            try {
                sealBtn.releasePointerCapture(e.pointerId);
            } catch (_) {}

            if (currentProgress >= 0.60) {
                completeTear(false);
            } else if (!hasMovedSignificant || currentProgress < 0.06) {
                // Fallback Single Tap
                completeTear(true);
            } else {
                // Snap back perlahan jika tarikan belum mencapai 60%
                if (peelingStripLayer) {
                    peelingStripLayer.style.transition = 'all 0.3s cubic-bezier(0.25, 1, 0.5, 1)';
                    peelingStripLayer.style.clipPath = 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)';
                    peelingStripLayer.style.transform = 'none';
                    peelingStripLayer.style.opacity = '1';
                    setTimeout(() => {
                        if (peelingStripLayer) peelingStripLayer.style.transition = '';
                    }, 300);
                }
                if (cavityEl) {
                    cavityEl.style.transition = 'opacity 0.3s ease';
                    cavityEl.style.opacity = '0';
                    setTimeout(() => {
                        if (cavityEl) cavityEl.style.transition = '';
                    }, 300);
                }
                currentProgress = 0;
                lastPopProgress = 0;
            }
        };

        sealBtn.addEventListener('pointerup', handlePointerEnd);
        sealBtn.addEventListener('pointercancel', handlePointerEnd);

        // Fallback untuk keyboard (Enter / Space)
        sealBtn.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                completeTear(true);
            }
        });
    }

    // 4. Inisialisasi Countdown Timer
    initCountdownTimer(WEDDING_CONFIG.event.date);

    // 5. Inisialisasi Lightbox Modal untuk Foto Polaroid & QRIS
    initLightboxModals();
}

/**
 * Hitung Mundur Menuju Hari H
 */
function initCountdownTimer(targetDateStr) {
    const daysEl = document.getElementById('count-days');
    const hoursEl = document.getElementById('count-hours');
    const minsEl = document.getElementById('count-mins');
    const secsEl = document.getElementById('count-secs');

    if (!daysEl) return;

    const targetDate = new Date(`${targetDateStr}T14:00:00+07:00`).getTime();

    function update() {
        const now = new Date().getTime();
        const diff = targetDate - now;

        if (diff <= 0) {
            daysEl.textContent = '00';
            hoursEl.textContent = '00';
            minsEl.textContent = '00';
            secsEl.textContent = '00';
            return;
        }

        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const secs = Math.floor((diff % (1000 * 60)) / 1000);

        daysEl.textContent = String(days).padStart(2, '0');
        hoursEl.textContent = String(hours).padStart(2, '0');
        minsEl.textContent = String(mins).padStart(2, '0');
        secsEl.textContent = String(secs).padStart(2, '0');
    }

    update();
    setInterval(update, 1000);
}

/**
 * Lightbox Modal Handler
 */
function initLightboxModals() {
    const modal = document.getElementById('media-lightbox-modal');
    const modalImg = document.getElementById('modal-img-display');
    const modalCaption = document.getElementById('modal-caption-display');
    const closeBtn = document.getElementById('modal-close-btn');

    if (!modal) return;

    function openModal(imgSrc, caption) {
        if (modalCaption) modalCaption.textContent = caption || '';
        if (modalImg && modalImg.src !== imgSrc) {
            modalImg.src = imgSrc;
        }
        modal.classList.add('open');
    }

    function closeModal() {
        modal.classList.remove('open');
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', closeModal);
    }

    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    // Pasang listener pada seluruh kartu polaroid
    const polaroidCards = document.querySelectorAll('.polaroid-card');
    polaroidCards.forEach(card => {
        card.addEventListener('click', () => {
            const img = card.querySelector('img');
            const caption = card.querySelector('.polaroid-caption');
            if (img) {
                openModal(img.src, caption ? caption.textContent : '');
            }
        });
    });

    // Pasang listener pada QRIS trigger (Otomatis mengikuti sumber gambar .png / .svg)
    const qrisTrigger = document.getElementById('qris-zoom-trigger');
    if (qrisTrigger) {
        qrisTrigger.addEventListener('click', () => {
            openModal(qrisTrigger.src || 'assets/photos/qris.svg', 'Pindai QRIS untuk Tanda Kasih / Angpao Digital');
        });
    }
}
