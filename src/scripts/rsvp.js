import { WEDDING_CONFIG } from '../config.js';

// Kamus Doa Default Awal (Mock / Seed Data)
const INITIAL_WISHES = [
    {
        id: '1',
        guest_name: 'Budi Santoso',
        message: 'Selamat Aflan & Fifi! Masih ingat dulu Aflan sering ke Drop Point J&T buat tukar receh, sampai momen sandal putus pas pagi hujan. Ternyata jodoh sejati! Sakinah mawaddah warahmah ya bro!',
        attendance_badge: 'Hadir',
        created_at: '2026-05-12T10:30:00Z'
    },
    {
        id: '2',
        guest_name: 'Siti Sarah & Suami',
        message: 'Barakallah Fifi sayang! Dari obrolan di Drop Point J&T hingga ikrar suci pelaminan bersama Mas Aflan. Semoga sakinah mawaddah warahmah selalu.',
        attendance_badge: 'Hadir',
        created_at: '2026-05-12T09:15:00Z'
    },
    {
        id: '3',
        guest_name: 'Dimas (Sahabat Semarang)',
        message: 'Masya Allah, dari jawaban manis di bianglala Semarang akhirnya sah bersanding di pelaminan. Berkah dan bahagia selalu untuk Hafla & Fifi!',
        attendance_badge: 'Hadir',
        created_at: '2026-05-12T08:00:00Z'
    }
];

// Kata-kata terlarang sederhana
const PROFANITY_WORDS = ['anjing', 'babi', 'bangsat', 'kontol', 'memek', 'kampret', 'tolol'];

export function initRSVP() {
    // 1. Inisialisasi Tombol Salin Clipboard
    initClipboardButtons();

    // 2. Inisialisasi Integrasi Kalender (Google Calendar & .ics)
    initCalendarActions();

    // 3. Inisialisasi Form RSVP & Dinding Doa
    initRSVPForm();

    // 4. Render Dinding Doa Pertama Kali
    renderWishesWall();
}

/**
 * Toast Notification Feedback
 */
function showToast(message) {
    const toast = document.getElementById('toast-notice');
    if (!toast) return;

    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 2500);
}

/**
 * Tombol Salin Nomor Rekening & Alamat
 */
function initClipboardButtons() {
    // Tombol Salin BCA
    const copyBcaBtn = document.getElementById('btn-copy-bca');
    if (copyBcaBtn) {
        copyBcaBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(WEDDING_CONFIG.digitalGift.accountNumber).then(() => {
                copyBcaBtn.classList.add('copied');
                copyBcaBtn.innerHTML = `✓ Tersalin`;
                showToast('Nomor Rekening BCA berhasil disalin!');
                setTimeout(() => {
                    copyBcaBtn.classList.remove('copied');
                    copyBcaBtn.innerHTML = `Salin`;
                }, 2000);
            });
        });
    }

    // Tombol Salin BSI
    const copyBsiBtn = document.getElementById('btn-copy-bsi');
    if (copyBsiBtn) {
        copyBsiBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(WEDDING_CONFIG.digitalGift.accountNumberSecond).then(() => {
                copyBsiBtn.classList.add('copied');
                copyBsiBtn.innerHTML = `✓ Tersalin`;
                showToast('Nomor Rekening BSI berhasil disalin!');
                setTimeout(() => {
                    copyBsiBtn.classList.remove('copied');
                    copyBsiBtn.innerHTML = `Salin`;
                }, 2000);
            });
        });
    }

    // Tombol Salin Alamat Fisik
    const copyAddrBtn = document.getElementById('btn-copy-address');
    if (copyAddrBtn) {
        copyAddrBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(WEDDING_CONFIG.digitalGift.physicalGiftAddress).then(() => {
                copyAddrBtn.textContent = '✓ Alamat Tersalin!';
                showToast('Alamat Drop Point J&T berhasil disalin!');
                setTimeout(() => {
                    copyAddrBtn.textContent = 'Salin Alamat Lengkap';
                }, 2000);
            });
        });
    }
}

/**
 * Tombol Simpan ke Kalender
 */
function initCalendarActions() {
    const calBtn = document.getElementById('btn-save-calendar');
    if (!calBtn) return;

    calBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const ev = WEDDING_CONFIG.event.calendarEvent;
        const gCalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(ev.title)}&dates=${ev.startDate}/${ev.endDate}&details=${encodeURIComponent(ev.description)}&location=${encodeURIComponent(ev.location)}`;
        window.open(gCalUrl, '_blank');
    });
}

/**
 * Form RSVP Handler
 */
function initRSVPForm() {
    const form = document.getElementById('rsvp-form');
    const nameInput = document.getElementById('rsvp-input-name');
    const radioCards = document.querySelectorAll('.radio-attendance-card');

    if (!form) return;

    // Prefill nama jika ada di URL / local storage
    const storedName = localStorage.getItem('undangan_guest_name');
    if (storedName && nameInput) {
        nameInput.value = storedName;
    }

    // Interactive radio styling
    radioCards.forEach(card => {
        card.addEventListener('click', () => {
            radioCards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            const radio = card.querySelector('input[type="radio"]');
            if (radio) radio.checked = true;
        });
    });

    form.addEventListener('submit', (e) => {
        e.preventDefault();

        const name = nameInput ? nameInput.value.trim() : '';
        const attendanceRadio = document.querySelector('input[name="attendance"]:checked');
        const attendance = attendanceRadio ? attendanceRadio.value : 'attending';
        const paxSelect = document.getElementById('rsvp-select-pax');
        const pax = paxSelect ? paxSelect.value : '1';
        const messageInput = document.getElementById('rsvp-input-message');
        const message = messageInput ? messageInput.value.trim() : '';

        if (!name) {
            showToast('Mohon masukkan nama Anda.');
            return;
        }

        if (!message) {
            showToast('Mohon tuliskan doa atau ucapan selamat.');
            return;
        }

        // Profanity Check
        const lowerMsg = message.toLowerCase();
        const containsProfanity = PROFANITY_WORDS.some(badWord => lowerMsg.includes(badWord));
        if (containsProfanity) {
            showToast('Mohon gunakan bahasa yang sopan dan santun.');
            return;
        }

        const badgeLabel = attendance === 'attending' ? 'Hadir' : 'Berhalangan';

        const newWish = {
            id: Date.now().toString(),
            guest_name: name,
            message: message,
            attendance_badge: badgeLabel,
            pax: pax,
            created_at: new Date().toISOString()
        };

        // Simpan ke LocalStorage
        saveWishLocally(newWish);

        // Reset form
        if (messageInput) messageInput.value = '';
        showToast('Terima kasih! Doa restu Anda telah tersimpan.');

        // Re-render dinding doa
        renderWishesWall();

        // Jika Konfirmasi "Pasti Hadir", tampilkan Tiket Check-in Digital (Guest Pass)
        if (attendance === 'attending') {
            setTimeout(() => {
                showGuestPassModal(name, pax);
            }, 600);
        }
    });
}

/**
 * Tampilkan Modal Tiket Pas Masuk Meja Tamu (Guest Pass)
 */
export function showGuestPassModal(name, pax) {
    const modal = document.getElementById('guest-pass-modal');
    const nameEl = document.getElementById('guest-pass-name-display');
    const paxEl = document.getElementById('guest-pass-pax-display');
    const codeEl = document.getElementById('guest-pass-code-display');
    const closeBtn = document.getElementById('guest-pass-close-btn');
    const saveBtn = document.getElementById('btn-save-pass-ticket');

    if (!modal) return;

    if (nameEl) nameEl.textContent = name.toUpperCase();
    if (paxEl) paxEl.textContent = `${pax} Orang Tamu Terdaftar`;

    const storedCode = localStorage.getItem('undangan_guest_code') || '200417537039';
    if (codeEl) codeEl.textContent = `FT-${storedCode}`;

    modal.classList.add('open');
    modal.classList.add('active');

    const closeModal = () => {
        modal.classList.remove('open');
        modal.classList.remove('active');
    };

    if (closeBtn) {
        closeBtn.onclick = closeModal;
    }

    modal.onclick = (e) => {
        if (e.target === modal) {
            closeModal();
        }
    };

    if (saveBtn) {
        saveBtn.onclick = () => {
            saveBtn.textContent = '✓ Bukti Check-in Siap!';
            showToast('Silakan screenshot tiket ini untuk registrasi di meja resepsi.');
            setTimeout(() => {
                saveBtn.innerHTML = '<span>📸</span> Simpan Bukti Check-in';
            }, 3000);
        };
    }
}

function saveWishLocally(wish) {
    const saved = localStorage.getItem('undangan_local_wishes');
    const wishesList = saved ? JSON.parse(saved) : [];
    wishesList.unshift(wish);
    localStorage.setItem('undangan_local_wishes', JSON.stringify(wishesList));
}

function getStoredWishes() {
    const saved = localStorage.getItem('undangan_local_wishes');
    const userWishes = saved ? JSON.parse(saved) : [];
    return [...userWishes, ...INITIAL_WISHES];
}

/**
 * Render Dinding Doa Restu
 */
export function renderWishesWall() {
    const container = document.getElementById('wishes-list-container');
    const countBadge = document.getElementById('wishes-count-badge');
    if (!container) return;

    const wishes = getStoredWishes();
    if (countBadge) countBadge.textContent = `${wishes.length} Pesan`;

    container.innerHTML = '';

    wishes.forEach(wish => {
        const item = document.createElement('div');
        item.className = 'wish-item-card';

        const isAttending = wish.attendance_badge === 'Hadir';
        const badgeClass = isAttending ? 'attending' : 'declined';
        const badgeIcon = isAttending ? '✓ Hadir' : '✕ Berhalangan';

        // Format waktu
        const dateObj = new Date(wish.created_at);
        const timeFormatted = dateObj.toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });

        item.innerHTML = `
            <div class="wish-item-top">
                <span class="wish-sender-name">${escapeHtml(wish.guest_name)}</span>
                <span class="wish-badge-status ${badgeClass}">${badgeIcon}</span>
            </div>
            <div class="wish-message-body">${escapeHtml(wish.message)}</div>
            <div class="wish-time-ago">${timeFormatted}</div>
        `;

        container.appendChild(item);
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
