import { WEDDING_CONFIG } from '../config.js';

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
    }

    /**
     * Efek Suara Taktil Kertas (Paper Rustle SFX)
     * Mensintesis desau gesekan kertas & benang saat amplop dibuka
     */
    playPaperRustleSFX() {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!this.audioCtx) {
                this.audioCtx = new AudioContext();
            }
            if (this.audioCtx.state === 'suspended') {
                this.audioCtx.resume();
            }

            const now = this.audioCtx.currentTime;
            const duration = 0.55;
            const sampleRate = this.audioCtx.sampleRate;
            const buffer = this.audioCtx.createBuffer(1, Math.floor(sampleRate * duration), sampleRate);
            const data = buffer.getChannelData(0);

            // Brownian & Pink friction noise dengan letupan renyah tekstur kertas
            let b0 = 0, b1 = 0, b2 = 0;
            for (let i = 0; i < buffer.length; i++) {
                const white = Math.random() * 2 - 1;
                b0 = 0.99886 * b0 + white * 0.0555179;
                b1 = 0.99332 * b1 + white * 0.0750759;
                b2 = 0.96900 * b2 + white * 0.1538520;
                const pink = b0 + b1 + b2 + white * 0.5362;
                const crinkle = Math.random() > 0.98 ? (Math.random() - 0.5) * 3 : 0;
                data[i] = (pink * 0.25 + crinkle) * (1 - (i / buffer.length));
            }

            const noiseSource = this.audioCtx.createBufferSource();
            noiseSource.buffer = buffer;

            // Bandpass filter gesekan amplop kertas kraft
            const bpFilter = this.audioCtx.createBiquadFilter();
            bpFilter.type = 'bandpass';
            bpFilter.frequency.setValueAtTime(1400, now);
            bpFilter.frequency.exponentialRampToValueAtTime(650, now + duration);
            bpFilter.Q.setValueAtTime(1.5, now);

            // Highpass filter membuang frekuensi rendah (thump)
            const hpFilter = this.audioCtx.createBiquadFilter();
            hpFilter.type = 'highpass';
            hpFilter.frequency.setValueAtTime(400, now);

            const gain = this.audioCtx.createGain();
            gain.gain.setValueAtTime(0.001, now);
            gain.gain.linearRampToValueAtTime(0.85, now + 0.03);
            gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

            noiseSource.connect(bpFilter);
            bpFilter.connect(hpFilter);
            hpFilter.connect(gain);
            gain.connect(this.audioCtx.destination);

            noiseSource.start(now);
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

    const displayName = (guestNameParam && guestNameParam.trim() !== '') 
        ? guestNameParam.trim() 
        : 'Yth. Sahabat & Kerabat Tercinta';

    if (recipientLabelEl) recipientLabelEl.textContent = displayName;
    if (stubRecipientLabelEl) stubRecipientLabelEl.textContent = displayName;

    const uniqueCode = guestCodeParam || '200417537039';
    if (guestCodeLabelEl) guestCodeLabelEl.textContent = uniqueCode;
    if (guestCodeBarcodeEl) guestCodeBarcodeEl.textContent = uniqueCode;
    if (guestCodeStubBarcodeEl) guestCodeStubBarcodeEl.textContent = uniqueCode;

    // Simpan di session/local state
    localStorage.setItem('undangan_guest_code', uniqueCode);
    if (guestNameParam) localStorage.setItem('undangan_guest_name', guestNameParam);

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

    // 3. Tombol Segel Merah "Buka Segel Amplop"
    const sealBtn = document.getElementById('envelope-seal-btn');
    const envelopeWrapper = document.getElementById('envelope-wrapper');
    const envelopeStage = document.getElementById('envelope-stage');
    const unboxedFlow = document.getElementById('unboxed-content-flow');

    if (sealBtn && envelopeWrapper) {
        sealBtn.addEventListener('click', () => {
            // Mainkan SFX gesekan kertas taktil & tali saat amplop ditarik
            ambience.playPaperRustleSFX();

            // A. Animasi Buka Flap Amplop
            envelopeWrapper.classList.add('opened');
            envelopeStage.classList.add('unboxed');

            // B. Putar Audio Ambience
            ambience.play();
            if (audioBtn) {
                audioBtn.classList.add('visible');
                audioBtn.classList.add('playing');
                if (audioStatusLabel) audioStatusLabel.textContent = 'Musik';
            }

            // C. Buka Kunci Scroll & Keluarkan Dokumen Isi Amplop
            setTimeout(() => {
                document.documentElement.classList.remove('envelope-locked');
                document.body.classList.remove('envelope-locked');
                window.removeEventListener('touchmove', preventScroll);
                window.removeEventListener('wheel', preventScroll);

                if (unboxedFlow) {
                    requestAnimationFrame(() => {
                        unboxedFlow.classList.add('revealed');
                        // Scroll perlahan menuju dokumen pertama: Surat Cerita
                        setTimeout(() => {
                            const storyEl = document.getElementById('story-section');
                            if (storyEl) {
                                storyEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            }
                        }, 120);
                    });
                }
            }, 500);
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

    const targetDate = new Date(`${targetDateStr}T08:00:00+07:00`).getTime();

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
        if (modalImg) modalImg.src = imgSrc;
        if (modalCaption) modalCaption.textContent = caption || '';
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

    // Pasang listener pada QRIS trigger
    const qrisTrigger = document.getElementById('qris-zoom-trigger');
    if (qrisTrigger) {
        qrisTrigger.addEventListener('click', () => {
            openModal('assets/photos/qris.svg', 'Pindai QRIS untuk Tanda Kasih / Angpao Digital');
        });
    }
}
