import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Config & Supabase Credentials
const SUPABASE_URL = import.meta.env?.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// State
let currentPin = sessionStorage.getItem('admin_pin') || '';
let parsedRecipients = [];
let activeSessionTab = 'cpp';

const TEMPLATES = {
    cpp: `Halo {{nama}},

Ada kabar bahagia dari Hafla & Fifi! 📦
Bukan paket barang kiriman biasa, melainkan kabar bahagia dan undangan pernikahan kami berdua:

Buka paket undanganmu di sini:
👉 {{link}}

No. Resi Pengiriman: {{kode}}

Merupakan suatu kehormatan dan kebahagiaan bagi kami sekeluarga apabila kamu berkenan hadir dan memberikan doa restu.

Salam hangat,
Hafla Maulana (CPP) & Fifi Maghfiroh (CPW)`,

    cpw: `Halo {{nama}},

Ada kabar bahagia dari Fifi & Hafla! 📦
Dari meja kantor ekspedisi dan toko sandal hingga ikrar suci pelaminan, kami ingin berbagi momen bahagia ini bersama kamu:

Buka paket undanganmu di sini:
👉 {{link}}

No. Resi Pengiriman: {{kode}}

Kehadiran serta doa restu kamu adalah kado terindah bagi kami berdua.

Salam hangat,
Fifi Maghfiroh (CPW) & Hafla Maulana (CPP)`
};

// DOM Elements
const pinOverlay = document.getElementById('pin-overlay');
const adminApp = document.getElementById('admin-app');
const formPin = document.getElementById('form-pin');
const inputPin = document.getElementById('input-pin');
const pinError = document.getElementById('pin-error');
const btnLock = document.getElementById('btn-lock');

const tabBtns = document.querySelectorAll('.tab-btn');
const radioCards = document.querySelectorAll('.radio-card');
const messageTemplate = document.getElementById('message-template');
const recipientsInput = document.getElementById('recipients-input');
const btnExampleData = document.getElementById('btn-example-data');
const btnParseContacts = document.getElementById('btn-parse-contacts');
const btnSubmitBlast = document.getElementById('btn-submit-blast');
const previewCount = document.getElementById('preview-count');
const tablePreview = document.querySelector('#table-preview tbody');
const tableOutbox = document.querySelector('#table-outbox tbody');
const btnRefresh = document.getElementById('btn-refresh-dashboard');

const statTotalGuests = document.getElementById('stat-total-guests');
const statAttending = document.getElementById('stat-attending');
const statTotalPax = document.getElementById('stat-total-pax');
const statOutboxSent = document.getElementById('stat-outbox-sent');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initClock();
    initTemplateSelector();
    initTabs();
    initEventListeners();

    if (currentPin) {
        verifyAndUnlock(currentPin);
    }
});

function showToast(msg) {
    const toast = document.getElementById('admin-toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3500);
}

function initClock() {
    const clockEl = document.getElementById('live-clock');
    const update = () => {
        const now = new Date();
        if (clockEl) {
            clockEl.textContent = now.toLocaleTimeString('id-ID', { hour12: false }) + ' WIB';
        }
    };
    update();
    setInterval(update, 1000);
}

function initTabs() {
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeSessionTab = btn.getAttribute('data-tab');

            document.querySelectorAll('.device-panel').forEach(p => p.classList.remove('active'));
            const targetPanel = document.getElementById(`panel-${activeSessionTab}`);
            if (targetPanel) targetPanel.classList.add('active');
        });
    });
}

function initTemplateSelector() {
    if (messageTemplate) {
        messageTemplate.value = TEMPLATES.cpp;
    }

    radioCards.forEach(card => {
        card.addEventListener('click', () => {
            radioCards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            const radio = card.querySelector('input[type="radio"]');
            if (radio) {
                radio.checked = true;
                const role = radio.value;
                if (TEMPLATES[role]) {
                    messageTemplate.value = TEMPLATES[role];
                }
            }
        });
    });
}

function initEventListeners() {
    // Form PIN
    if (formPin) {
        formPin.addEventListener('submit', (e) => {
            e.preventDefault();
            const pin = inputPin.value.trim();
            verifyAndUnlock(pin);
        });
    }

    // Lock Button
    if (btnLock) {
        btnLock.addEventListener('click', () => {
            sessionStorage.removeItem('admin_pin');
            currentPin = '';
            pinOverlay.classList.remove('hidden');
            adminApp.classList.add('hidden');
            if (inputPin) inputPin.value = '';
        });
    }

    // Example Data
    if (btnExampleData) {
        btnExampleData.addEventListener('click', () => {
            recipientsInput.value = `Budi Santoso & Partner, 081234567890\nSiti Sarah, 085712345678\nDimas (Sahabat Semarang), 081398765432`;
            parseContacts();
        });
    }

    // Parse Contacts
    if (btnParseContacts) {
        btnParseContacts.addEventListener('click', parseContacts);
    }

    // Submit Blast
    if (btnSubmitBlast) {
        btnSubmitBlast.addEventListener('click', submitBlast);
    }

    // Refresh Dashboard
    if (btnRefresh) {
        btnRefresh.addEventListener('click', () => {
            loadDashboardData();
            showToast('Data dashboard disinkronkan.');
        });
    }

    // Device Actions (Reset & Logout)
    document.getElementById('btn-reset-cpp')?.addEventListener('click', () => sendDeviceCmd('cpp', 'RESET_SESSION'));
    document.getElementById('btn-logout-cpp')?.addEventListener('click', () => sendDeviceCmd('cpp', 'LOGOUT'));
    document.getElementById('btn-reset-cpw')?.addEventListener('click', () => sendDeviceCmd('cpw', 'RESET_SESSION'));
    document.getElementById('btn-logout-cpw')?.addEventListener('click', () => sendDeviceCmd('cpw', 'LOGOUT'));
}

async function verifyAndUnlock(pin) {
    if (pinError) pinError.textContent = 'Memverifikasi...';

    try {
        const { data, error } = await supabase.rpc('admin_get_dashboard_data', { p_pin: pin });

        if (error || !data?.success) {
            if (pinError) pinError.textContent = data?.error || 'PIN Salah. Silakan coba lagi.';
            return;
        }

        currentPin = pin;
        sessionStorage.setItem('admin_pin', pin);
        pinOverlay.classList.add('hidden');
        adminApp.classList.remove('hidden');

        // Render data pertama kali
        renderDashboard(data);

        // Langganan Realtime Supabase
        subscribeRealtime();

        // Polling status tiap 8 detik
        setInterval(loadDashboardData, 8000);

    } catch (err) {
        if (pinError) pinError.textContent = 'Koneksi gagal: ' + err.message;
    }
}

async function loadDashboardData() {
    if (!currentPin) return;
    try {
        const { data } = await supabase.rpc('admin_get_dashboard_data', { p_pin: currentPin });
        if (data?.success) {
            renderDashboard(data);
        }
    } catch (_) {}
}

function renderDashboard(data) {
    // 1. Render Dual Device Hub
    if (data.bridge_status && Array.isArray(data.bridge_status)) {
        data.bridge_status.forEach(status => {
            renderDeviceHub(status.session_id, status);
        });
    }

    // 2. Render Guest Stats
    if (data.guest_summary) {
        statTotalGuests.textContent = data.guest_summary.total_guests || 0;
        statAttending.textContent = data.guest_summary.attending || 0;
        statTotalPax.textContent = data.guest_summary.total_pax || 0;
    }

    // 3. Render Outbox Stats
    if (data.outbox_stats) {
        const sentCpp = data.outbox_stats['cpp_sent'] || 0;
        const sentCpw = data.outbox_stats['cpw_sent'] || 0;
        statOutboxSent.textContent = sentCpp + sentCpw;
    }

    // 4. Render Recent Outbox Table
    if (data.recent_outbox) {
        renderOutboxTable(data.recent_outbox);
    }
}

function renderDeviceHub(sessionId, status) {
    const badge = document.getElementById(`${sessionId}-conn-badge`);
    const badgeText = document.getElementById(`${sessionId}-conn-text`);
    const nameEl = document.getElementById(`${sessionId}-account-name`);
    const phoneEl = document.getElementById(`${sessionId}-account-phone`);
    const lastSyncEl = document.getElementById(`${sessionId}-last-sync`);
    const qrBox = document.getElementById(`${sessionId}-qr-box`);

    if (!badge) return;

    if (status.connected) {
        badge.className = 'badge-connection connected';
        badgeText.textContent = 'Terhubung';
        nameEl.textContent = status.name || status.label;
        phoneEl.textContent = status.phone ? `+${status.phone}` : 'Nomor Aktif';
        qrBox.innerHTML = `
            <div style="color: #34d399; font-size: 40px; margin-bottom: 8px;">✓</div>
            <p style="font-weight: 700; color: #34d399;">WhatsApp Siap Kirim</p>
            <p style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">Perangkat tertaut & antrean aktif</p>
        `;
    } else if (status.qr_base64) {
        badge.className = 'badge-connection waiting';
        badgeText.textContent = 'Menunggu Scan QR';
        nameEl.textContent = status.label;
        phoneEl.textContent = 'Belum Tertaut';
        qrBox.innerHTML = `
            <img src="${status.qr_base64}" alt="QR Code WhatsApp ${sessionId.toUpperCase()}">
            <p style="font-size: 11px; color: var(--text-muted); margin-top: 8px;">Scan dari WhatsApp: Perangkat Tertaut</p>
        `;
    } else {
        badge.className = 'badge-connection';
        badgeText.textContent = 'Offline / Inisialisasi';
        nameEl.textContent = status.label;
        phoneEl.textContent = '-';
        qrBox.innerHTML = `
            <div class="qr-placeholder">
                <div class="spinner"></div>
                <p>Menunggu respon worker bridge...</p>
            </div>
        `;
    }

    if (status.updated_at) {
        const d = new Date(status.updated_at);
        lastSyncEl.textContent = `Sinkron: ${d.toLocaleTimeString('id-ID')}`;
    }
}

function renderOutboxTable(items) {
    if (!tableOutbox) return;

    if (!items || items.length === 0) {
        tableOutbox.innerHTML = `<tr><td colspan="6" class="text-center text-muted">Belum ada riwayat antrean blast.</td></tr>`;
        return;
    }

    tableOutbox.innerHTML = items.map(item => {
        const time = new Date(item.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        const roleBadge = item.sender_role === 'cpp' ? '<span class="badge-role">CPP (Pria)</span>' : '<span class="badge-role">CPW (Wanita)</span>';
        
        let statusBadge = `<span class="badge-tag badge-${item.status}">${item.status.toUpperCase()}</span>`;
        if (item.status === 'sent') statusBadge = `<span class="badge-tag badge-sent">✓ SENT</span>`;
        if (item.status === 'delivered') statusBadge = `<span class="badge-tag badge-delivered">✓✓ DELIVERED</span>`;
        if (item.status === 'read') statusBadge = `<span class="badge-tag badge-read">✓✓ READ</span>`;

        return `
            <tr>
                <td>${time}</td>
                <td>${roleBadge}</td>
                <td><strong>${escapeHtml(item.recipient_name || '-')}</strong></td>
                <td><code>+${item.phone}</code></td>
                <td>${statusBadge}</td>
                <td class="text-muted" style="font-size: 11px;">${escapeHtml(item.error_message || (item.status === 'pending' ? 'Dalam antrean' : 'Sukses'))}</td>
            </tr>
        `;
    }).join('');
}

function parseContacts() {
    const raw = recipientsInput.value.trim();
    if (!raw) {
        showToast('Masukkan data kontak terlebih dahulu.');
        return;
    }

    const lines = raw.split('\n');
    parsedRecipients = [];

    lines.forEach(line => {
        const parts = line.split(/[,;\t]/);
        if (parts.length >= 2) {
            const name = parts[0].trim();
            const phone = parts[1].trim();

            if (name && phone) {
                // Normalisasi ke 628xxx
                let cleanPhone = phone.replace(/\D/g, '');
                if (cleanPhone.startsWith('0')) cleanPhone = '62' + cleanPhone.slice(1);
                else if (cleanPhone.startsWith('8')) cleanPhone = '628' + cleanPhone.slice(1);

                parsedRecipients.push({ name, phone: cleanPhone, category: 'Umum' });
            }
        }
    });

    previewCount.textContent = `${parsedRecipients.length} Kontak Siap`;

    if (parsedRecipients.length === 0) {
        tablePreview.innerHTML = `<tr><td colspan="3" class="text-center text-muted">Format tidak sesuai. Gunakan: Nama, NoHP</td></tr>`;
        btnSubmitBlast.disabled = true;
        return;
    }

    tablePreview.innerHTML = parsedRecipients.map(r => `
        <tr>
            <td><strong>${escapeHtml(r.name)}</strong></td>
            <td><code>+${r.phone}</code></td>
            <td><span class="badge-tag badge-sent">Valid</span></td>
        </tr>
    `).join('');

    btnSubmitBlast.disabled = false;
    showToast(`Berhasil memuat ${parsedRecipients.length} kontak penerima.`);
}

async function submitBlast() {
    if (parsedRecipients.length === 0) {
        showToast('Belum ada kontak yang valid.');
        return;
    }

    const senderRadio = document.querySelector('input[name="sender_role"]:checked');
    const senderRole = senderRadio ? senderRadio.value : 'cpp';
    const template = messageTemplate.value.trim();
    const baseUrl = window.location.origin;

    if (!template) {
        showToast('Template pesan tidak boleh kosong.');
        return;
    }

    if (!confirm(`Kirim blast ke ${parsedRecipients.length} tamu menggunakan nomor ${senderRole.toUpperCase()}?`)) {
        return;
    }

    btnSubmitBlast.disabled = true;
    btnSubmitBlast.textContent = 'Memproses...';

    try {
        const { data, error } = await supabase.rpc('admin_trigger_blast', {
            p_pin: currentPin,
            p_sender_role: senderRole,
            p_recipients: parsedRecipients,
            p_template: template,
            p_base_url: baseUrl,
        });

        if (error || !data?.success) {
            showToast(data?.error || error.message);
            return;
        }

        showToast(`🚀 ${data.queued_count} pesan berhasil masuk antrean blast!`);
        recipientsInput.value = '';
        parsedRecipients = [];
        previewCount.textContent = '0 Kontak Siap';
        tablePreview.innerHTML = `<tr><td colspan="3" class="text-center text-muted">Antrean berhasil dikirim. Siap untuk batch berikutnya.</td></tr>`;

        // Refresh dashboard
        loadDashboardData();

    } catch (err) {
        showToast('Gagal memicu blast: ' + err.message);
    } finally {
        btnSubmitBlast.disabled = false;
        btnSubmitBlast.textContent = '🚀 Kirim Blast Antrean';
    }
}

async function sendDeviceCmd(sessionId, action) {
    const actionLabel = action === 'RESET_SESSION' ? 'Ganti Nomor / Scan Ulang' : 'Putuskan Sesi';
    if (!confirm(`Konfirmasi eksekusi ${actionLabel} untuk nomor ${sessionId.toUpperCase()}?`)) {
        return;
    }

    try {
        const { data, error } = await supabase.rpc('admin_device_command', {
            p_pin: currentPin,
            p_session_id: sessionId,
            p_action: action,
        });

        if (error || !data?.success) {
            showToast(data?.error || error.message);
            return;
        }

        showToast(data.message);
        loadDashboardData();
    } catch (err) {
        showToast('Gagal mengirim perintah: ' + err.message);
    }
}

function subscribeRealtime() {
    supabase
        .channel('admin_realtime_channel')
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'wa_bridge_status' },
            (payload) => {
                if (payload.new) {
                    renderDeviceHub(payload.new.session_id, payload.new);
                }
            }
        )
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'wa_outbox' },
            () => {
                loadDashboardData();
            }
        )
        .subscribe();
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
