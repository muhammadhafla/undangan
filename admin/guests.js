import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Config & Supabase Credentials
const SUPABASE_URL = import.meta.env?.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// State
let currentPin = sessionStorage.getItem('admin_pin') || '';
let currentGuests = [];
let selectedGuestIds = new Set();
let activeFilters = {
    side: 'all',
    category: 'all',
    rsvp: 'all',
    blast: 'all',
    search: '',
    showDeleted: false
};

// DOM Elements
const pinOverlay = document.getElementById('pin-overlay');
const adminApp = document.getElementById('admin-app');
const formPin = document.getElementById('form-pin');
const inputPin = document.getElementById('input-pin');
const pinError = document.getElementById('pin-error');
const btnLock = document.getElementById('btn-lock');

const guestsTbody = document.getElementById('guests-tbody');
const checkAll = document.getElementById('check-all-guests');
const bulkActionBar = document.getElementById('bulk-action-bar');
const selectedCountEl = document.getElementById('selected-count');

const filterSideBtns = document.querySelectorAll('#filter-side-group .pill-btn');
const filterCategory = document.getElementById('filter-category');
const filterRsvp = document.getElementById('filter-rsvp');
const filterBlast = document.getElementById('filter-blast');
const searchInput = document.getElementById('search-input');
const btnClearSearch = document.getElementById('btn-clear-search');

const statTotal = document.getElementById('stat-total-guests');
const statCpp = document.getElementById('stat-cpp-guests');
const statCpw = document.getElementById('stat-cpw-guests');
const statAttending = document.getElementById('stat-attending-guests');
const statPax = document.getElementById('stat-confirmed-pax');
const statUnblasted = document.getElementById('stat-unblasted');
const statOpened = document.getElementById('stat-opened');
const trashCountEl = document.getElementById('trash-count');

// Modals
const modalGuest = document.getElementById('modal-guest');
const formGuest = document.getElementById('form-guest');
const modalGuestTitle = document.getElementById('modal-guest-title');
const guestIdInput = document.getElementById('guest-id');
const guestNameInput = document.getElementById('guest-name');
const guestPhoneInput = document.getElementById('guest-phone');
const guestPaxInput = document.getElementById('guest-pax');
const guestCategoryInput = document.getElementById('guest-category');
const guestNotesInput = document.getElementById('guest-notes');
const categoryDatalist = document.getElementById('category-datalist');
const duplicateWarning = document.getElementById('duplicate-warning');

const modalImport = document.getElementById('modal-import');
const importTextarea = document.getElementById('import-textarea');
const btnParseImport = document.getElementById('btn-parse-import');
const btnExecuteImport = document.getElementById('btn-execute-import');
const importPreviewBox = document.getElementById('import-preview-box');
const importPreviewCount = document.getElementById('import-preview-count');
let parsedImportList = [];

const modalBulkBlast = document.getElementById('modal-bulk-blast');
const blastRecipientCount = document.getElementById('blast-recipient-count');
const blastTemplateText = document.getElementById('blast-template-text');
const btnConfirmBulkBlast = document.getElementById('btn-confirm-bulk-blast');

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    initClock();
    initFilters();
    initModals();

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
        if (clockEl) clockEl.textContent = now.toLocaleTimeString('id-ID', { hour12: false }) + ' WIB';
    };
    update();
    setInterval(update, 1000);
}

function initFilters() {
    // Side Pills
    filterSideBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterSideBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeFilters.side = btn.getAttribute('data-side');
            loadGuestsData();
        });
    });

    // Dropdowns
    filterCategory.addEventListener('change', () => {
        activeFilters.category = filterCategory.value;
        loadGuestsData();
    });

    filterRsvp.addEventListener('change', () => {
        activeFilters.rsvp = filterRsvp.value;
        loadGuestsData();
    });

    filterBlast.addEventListener('change', () => {
        activeFilters.blast = filterBlast.value;
        loadGuestsData();
    });

    // Search
    let searchDebounce;
    searchInput.addEventListener('input', () => {
        clearTimeout(searchDebounce);
        const val = searchInput.value.trim();
        btnClearSearch.classList.toggle('hidden', val === '');
        searchDebounce = setTimeout(() => {
            activeFilters.search = val;
            loadGuestsData();
        }, 300);
    });

    btnClearSearch.addEventListener('click', () => {
        searchInput.value = '';
        btnClearSearch.classList.add('hidden');
        activeFilters.search = '';
        loadGuestsData();
    });

    // Toggle Trash
    document.getElementById('btn-toggle-trash')?.addEventListener('click', () => {
        activeFilters.showDeleted = !activeFilters.showDeleted;
        const btn = document.getElementById('btn-toggle-trash');
        if (activeFilters.showDeleted) {
            btn.textContent = '📋 Kembali ke Tamu Aktif';
            btn.style.color = '#38bdf8';
        } else {
            btn.textContent = `🗑️ Lihat Sampah (${trashCountEl.textContent})`;
            btn.style.color = '';
        }
        loadGuestsData();
    });

    // Export CSV
    document.getElementById('btn-export-csv')?.addEventListener('click', exportToCSV);
}

function initModals() {
    // PIN Form
    formPin.addEventListener('submit', (e) => {
        e.preventDefault();
        verifyAndUnlock(inputPin.value.trim());
    });

    btnLock.addEventListener('click', () => {
        sessionStorage.removeItem('admin_pin');
        currentPin = '';
        pinOverlay.classList.remove('hidden');
        adminApp.classList.add('hidden');
    });

    // Modal Add Guest
    document.getElementById('btn-open-add-modal')?.addEventListener('click', () => {
        modalGuestTitle.textContent = 'Tambah Tamu Baru';
        formGuest.reset();
        guestIdInput.value = '';
        duplicateWarning.classList.add('hidden');
        modalGuest.classList.remove('hidden');
    });

    document.getElementById('btn-close-guest-modal')?.addEventListener('click', () => modalGuest.classList.add('hidden'));
    document.getElementById('btn-cancel-guest')?.addEventListener('click', () => modalGuest.classList.add('hidden'));

    // Modal Side Radio styling
    document.querySelectorAll('.side-label').forEach(label => {
        label.addEventListener('click', () => {
            const container = label.closest('.side-radio-group');
            container.querySelectorAll('.side-label').forEach(l => l.classList.remove('active'));
            label.classList.add('active');
            const radio = label.querySelector('input[type="radio"]');
            if (radio) radio.checked = true;
        });
    });

    // Save Guest Form
    formGuest.addEventListener('submit', handleSaveGuest);

    // Modal Import
    document.getElementById('btn-open-import-modal')?.addEventListener('click', () => {
        modalImport.classList.remove('hidden');
        importTextarea.value = '';
        importPreviewBox.classList.add('hidden');
        btnExecuteImport.disabled = true;
    });

    document.getElementById('btn-close-import-modal')?.addEventListener('click', () => modalImport.classList.add('hidden'));
    document.getElementById('btn-cancel-import')?.addEventListener('click', () => modalImport.classList.add('hidden'));
    btnParseImport.addEventListener('click', handleParseImport);
    btnExecuteImport.addEventListener('click', handleExecuteImport);

    // Multi-Select Checkboxes
    checkAll.addEventListener('change', () => {
        const isChecked = checkAll.checked;
        selectedGuestIds.clear();
        document.querySelectorAll('.guest-row-check').forEach(cb => {
            cb.checked = isChecked;
            if (isChecked) selectedGuestIds.add(cb.value);
        });
        updateBulkBar();
    });

    document.getElementById('btn-clear-selection')?.addEventListener('click', () => {
        selectedGuestIds.clear();
        checkAll.checked = false;
        document.querySelectorAll('.guest-row-check').forEach(cb => cb.checked = false);
        updateBulkBar();
    });

    // Bulk Delete
    document.getElementById('btn-bulk-delete')?.addEventListener('click', handleBulkDelete);

    // Bulk Blast Modal
    document.getElementById('btn-bulk-blast-modal')?.addEventListener('click', openBulkBlastModal);
    document.getElementById('btn-close-blast-modal')?.addEventListener('click', () => modalBulkBlast.classList.add('hidden'));
    document.getElementById('btn-cancel-bulk-blast')?.addEventListener('click', () => modalBulkBlast.classList.add('hidden'));
    btnConfirmBulkBlast.addEventListener('click', handleConfirmBulkBlast);
}

async function verifyAndUnlock(pin) {
    if (pinError) pinError.textContent = 'Memverifikasi...';
    try {
        const { data, error } = await supabase.rpc('admin_get_guests_catalog', {
            p_pin: pin,
            p_side: 'all'
        });

        if (error || !data?.success) {
            if (pinError) pinError.textContent = data?.error || 'PIN Salah.';
            return;
        }

        currentPin = pin;
        sessionStorage.setItem('admin_pin', pin);
        pinOverlay.classList.add('hidden');
        adminApp.classList.remove('hidden');

        renderGuestsCatalog(data);
        subscribeRealtime();
    } catch (err) {
        if (pinError) pinError.textContent = 'Koneksi gagal: ' + err.message;
    }
}

async function loadGuestsData() {
    if (!currentPin) return;
    try {
        const { data, error } = await supabase.rpc('admin_get_guests_catalog', {
            p_pin: currentPin,
            p_side: activeFilters.side,
            p_category: activeFilters.category,
            p_rsvp: activeFilters.rsvp,
            p_blast_status: activeFilters.blast,
            p_search: activeFilters.search,
            p_show_deleted: activeFilters.showDeleted
        });

        if (!error && data?.success) {
            renderGuestsCatalog(data);
        }
    } catch (_) {}
}

function renderGuestsCatalog(data) {
    currentGuests = data.guests || [];
    const summary = data.summary || {};
    const categories = data.categories || [];

    // 1. Stats Bar
    statTotal.textContent = summary.total_guests || 0;
    statCpp.textContent = summary.cpp_guests || 0;
    statCpw.textContent = summary.cpw_guests || 0;
    statAttending.textContent = summary.attending_guests || 0;
    statPax.textContent = summary.confirmed_pax || 0;
    statUnblasted.textContent = summary.unblasted_count || 0;
    statOpened.textContent = summary.opened_count || 0;
    trashCountEl.textContent = summary.deleted_count || 0;

    // 2. Populate Categories Dropdown & Datalist
    updateCategoryOptions(categories);

    // 3. Render Table
    renderTable();
}

function updateCategoryOptions(categories) {
    const currentVal = filterCategory.value;
    filterCategory.innerHTML = '<option value="all">Semua Kategori</option>';
    categoryDatalist.innerHTML = '';

    categories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        if (cat === currentVal) opt.selected = true;
        filterCategory.appendChild(opt);

        const dataOpt = document.createElement('option');
        dataOpt.value = cat;
        categoryDatalist.appendChild(dataOpt);
    });
}

function renderTable() {
    if (currentGuests.length === 0) {
        guestsTbody.innerHTML = `<tr><td colspan="10" class="text-center text-muted" style="padding: 30px;">Tidak ada data tamu yang cocok dengan filter.</td></tr>`;
        return;
    }

    guestsTbody.innerHTML = currentGuests.map(g => {
        const isChecked = selectedGuestIds.has(g.id);
        const sideClass = g.side === 'cpw' ? 'side-cpw' : 'side-cpp';
        const sideLabel = g.side === 'cpw' ? '👗 CPW' : '👔 CPP';
        const categoryLabel = g.category || 'Umum';

        // RSVP Badge
        let rsvpBadge = '<span class="rsvp-badge rsvp-pending">🟡 Belum Respon</span>';
        if (g.rsvp_status === 'attending') {
            rsvpBadge = `<span class="rsvp-badge rsvp-attending">🟢 Hadir (${g.rsvp_pax || g.pax} Pax)</span>`;
        } else if (g.rsvp_status === 'declined') {
            rsvpBadge = '<span class="rsvp-badge rsvp-declined">🔴 Berhalangan</span>';
        }

        // Blast Status Badge
        let blastBadge = '<span class="blast-pill blast-unblasted">⚪ Belum Di-blast</span>';
        if (g.blast_status === 'sent') blastBadge = '<span class="blast-pill blast-sent">✓ Terkirim</span>';
        else if (g.blast_status === 'queued') blastBadge = '<span class="blast-pill blast-queued">⏳ Antrean</span>';
        else if (g.blast_status === 'failed') blastBadge = '<span class="blast-pill blast-failed">✕ Gagal</span>';

        // Opened Badge
        let openedBadge = '<span class="opened-none">-</span>';
        if (g.opened_at) {
            openedBadge = `<span class="opened-badge">👀 Dibuka (${g.opened_count}x)</span>`;
        }

        // Action Buttons
        const actionButtons = activeFilters.showDeleted ? `
            <button class="btn-icon btn-restore" data-id="${g.id}" title="Pulihkan Data">♻️</button>
            <button class="btn-icon btn-delete" data-id="${g.id}" data-permanent="true" title="Hapus Permanen">🗑️</button>
        ` : `
            <button class="btn-icon btn-copy-link" data-code="${g.code || ''}" data-name="${escapeHtml(g.name)}" title="Salin Link Undangan">🔗</button>
            <button class="btn-icon btn-wa" data-phone="${g.phone || ''}" data-name="${escapeHtml(g.name)}" data-code="${g.code || ''}" title="Chat WhatsApp Personal">💬</button>
            <button class="btn-icon btn-edit" data-id="${g.id}" title="Edit Data">✏️</button>
            <button class="btn-icon btn-delete" data-id="${g.id}" title="Pindahkan ke Sampah">🗑️</button>
        `;

        return `
            <tr>
                <td><input type="checkbox" class="guest-row-check" value="${g.id}" ${isChecked ? 'checked' : ''}></td>
                <td>
                    <strong>${escapeHtml(g.name)}</strong>
                    <div style="font-size: 11px; color: var(--text-muted); font-family: 'Space Mono', monospace;">${g.code || '-'}</div>
                </td>
                <td><code>${g.phone ? '+' + g.phone : '<span class="text-muted">-</span>'}</code></td>
                <td><span class="side-badge ${sideClass}">${sideLabel}</span></td>
                <td><span class="category-pill">${escapeHtml(categoryLabel)}</span></td>
                <td class="text-center"><strong>${g.pax}</strong></td>
                <td>${rsvpBadge}</td>
                <td>${blastBadge}</td>
                <td>${openedBadge}</td>
                <td><div class="row-actions">${actionButtons}</div></td>
            </tr>
        `;
    }).join('');

    attachRowEvents();
}

function attachRowEvents() {
    // Checkbox Events
    document.querySelectorAll('.guest-row-check').forEach(cb => {
        cb.addEventListener('change', () => {
            if (cb.checked) selectedGuestIds.add(cb.value);
            else selectedGuestIds.delete(cb.value);
            updateBulkBar();
        });
    });

    // Copy Link Button
    document.querySelectorAll('.btn-copy-link').forEach(btn => {
        btn.addEventListener('click', () => {
            const name = btn.getAttribute('data-name');
            const code = btn.getAttribute('data-code');
            const link = `${window.location.origin}/?to=${encodeURIComponent(name)}&code=${code}`;
            navigator.clipboard.writeText(link).then(() => {
                showToast(`✓ Link undangan untuk "${name}" tersalin ke clipboard!`);
            });
        });
    });

    // Direct WA Button
    document.querySelectorAll('.btn-wa').forEach(btn => {
        btn.addEventListener('click', () => {
            const phone = btn.getAttribute('data-phone');
            const name = btn.getAttribute('data-name');
            const code = btn.getAttribute('data-code');

            if (!phone) {
                showToast('Nomor WhatsApp belum diisi untuk tamu ini.');
                return;
            }

            const link = `${window.location.origin}/?to=${encodeURIComponent(name)}&code=${code}`;
            const text = `Halo ${name},\n\nKabar bahagia dari kami! Buka paket undangan pernikahan kami di sini:\n👉 ${link}\n\nNo. Resi: ${code}`;
            const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
            window.open(waUrl, '_blank');
        });
    });

    // Edit Button
    document.querySelectorAll('.btn-edit').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            const guest = currentGuests.find(g => g.id === id);
            if (guest) openEditModal(guest);
        });
    });

    // Delete / Soft Delete Button
    document.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-id');
            const isPermanent = btn.getAttribute('data-permanent') === 'true';
            const action = isPermanent ? 'PURGE' : 'SOFT_DELETE';
            const confirmMsg = isPermanent ? 'Hapus permanen tamu ini?' : 'Pindahkan tamu ini ke tempat sampah?';

            if (!confirm(confirmMsg)) return;

            try {
                const { data } = await supabase.rpc('admin_manage_guest', {
                    p_pin: currentPin,
                    p_action: action,
                    p_payload: { id }
                });
                if (data?.success) {
                    showToast(data.message);
                    loadGuestsData();
                }
            } catch (err) {
                showToast('Gagal menghapus: ' + err.message);
            }
        });
    });

    // Restore Button
    document.querySelectorAll('.btn-restore').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-id');
            try {
                const { data } = await supabase.rpc('admin_manage_guest', {
                    p_pin: currentPin,
                    p_action: 'RESTORE',
                    p_payload: { id }
                });
                if (data?.success) {
                    showToast(data.message);
                    loadGuestsData();
                }
            } catch (err) {
                showToast('Gagal memulihkan: ' + err.message);
            }
        });
    });
}

function updateBulkBar() {
    const count = selectedGuestIds.size;
    selectedCountEl.textContent = count;
    bulkActionBar.classList.toggle('hidden', count === 0);
}

function openEditModal(guest) {
    modalGuestTitle.textContent = 'Edit Data Tamu';
    guestIdInput.value = guest.id;
    guestNameInput.value = guest.name;
    guestPhoneInput.value = guest.phone ? '0' + guest.phone.slice(2) : '';
    guestPaxInput.value = guest.pax || 1;
    guestCategoryInput.value = guest.category || 'Umum';
    guestNotesInput.value = guest.notes || '';
    duplicateWarning.classList.add('hidden');

    const sideRadio = document.querySelector(`input[name="modal_side"][value="${guest.side || 'cpp'}"]`);
    if (sideRadio) {
        sideRadio.checked = true;
        const container = sideRadio.closest('.side-radio-group');
        container.querySelectorAll('.side-label').forEach(l => l.classList.remove('active'));
        sideRadio.closest('.side-label').classList.add('active');
    }

    modalGuest.classList.remove('hidden');
}

async function handleSaveGuest(e) {
    e.preventDefault();
    const id = guestIdInput.value;
    const isEdit = !!id;
    const sideRadio = document.querySelector('input[name="modal_side"]:checked');

    const payload = {
        id: id || undefined,
        name: guestNameInput.value.trim(),
        phone: guestPhoneInput.value.trim(),
        side: sideRadio ? sideRadio.value : 'cpp',
        category: guestCategoryInput.value.trim() || 'Umum',
        pax: parseInt(guestPaxInput.value, 10) || 1,
        notes: guestNotesInput.value.trim()
    };

    const action = isEdit ? 'UPDATE' : 'INSERT';

    try {
        const { data, error } = await supabase.rpc('admin_manage_guest', {
            p_pin: currentPin,
            p_action: action,
            p_payload: payload
        });

        if (error || !data?.success) {
            if (data?.already_exists) {
                duplicateWarning.innerHTML = `
                    <strong>⚠️ Nomor Sudah Terdaftar!</strong><br>
                    ${data.error}<br>
                    <button type="button" id="btn-force-update" class="btn-warning btn-sm" style="margin-top: 8px;">
                        Tetap Simpan / Perbarui Data Ini
                    </button>
                `;
                duplicateWarning.classList.remove('hidden');

                document.getElementById('btn-force-update')?.addEventListener('click', async () => {
                    payload.force_update = 'true';
                    const res = await supabase.rpc('admin_manage_guest', {
                        p_pin: currentPin,
                        p_action: action,
                        p_payload: payload
                    });
                    if (res.data?.success) {
                        showToast(res.data.message);
                        modalGuest.classList.add('hidden');
                        loadGuestsData();
                    }
                });
                return;
            }

            showToast(data?.error || error.message);
            return;
        }

        showToast(data.message);
        modalGuest.classList.add('hidden');
        loadGuestsData();
    } catch (err) {
        showToast('Gagal menyimpan: ' + err.message);
    }
}

async function handleBulkDelete() {
    if (selectedGuestIds.size === 0) return;
    if (!confirm(`Pindahkan ${selectedGuestIds.size} tamu terpilih ke tempat sampah?`)) return;

    try {
        const { data } = await supabase.rpc('admin_manage_guest', {
            p_pin: currentPin,
            p_action: 'BULK_SOFT_DELETE',
            p_payload: { ids: Array.from(selectedGuestIds) }
        });

        if (data?.success) {
            showToast(data.message);
            selectedGuestIds.clear();
            updateBulkBar();
            loadGuestsData();
        }
    } catch (err) {
        showToast('Gagal menghapus massal: ' + err.message);
    }
}

function handleParseImport() {
    const raw = importTextarea.value.trim();
    if (!raw) {
        showToast('Masukkan data teks terlebih dahulu.');
        return;
    }

    const lines = raw.split('\n');
    parsedImportList = [];

    lines.forEach(line => {
        const parts = line.split(/[,;\t]/).map(s => s.trim());
        if (parts.length >= 2) {
            const name = parts[0];
            const phone = parts[1];
            const category = parts[2] || 'Umum';
            const side = (parts[3] || 'cpp').toLowerCase() === 'cpw' ? 'cpw' : 'cpp';
            const pax = parseInt(parts[4] || '1', 10) || 1;

            if (name && phone) {
                parsedImportList.push({ name, phone, category, side, pax });
            }
        }
    });

    importPreviewCount.textContent = `${parsedImportList.length} data tamu valid terdeteksi siap diimpor.`;
    importPreviewBox.classList.remove('hidden');
    btnExecuteImport.disabled = parsedImportList.length === 0;
}

async function handleExecuteImport() {
    if (parsedImportList.length === 0) return;

    btnExecuteImport.disabled = true;
    btnExecuteImport.textContent = 'Mengimpor...';

    try {
        const { data, error } = await supabase.rpc('admin_bulk_import_guests', {
            p_pin: currentPin,
            p_guests: parsedImportList
        });

        if (error || !data?.success) {
            showToast(data?.error || error.message);
            return;
        }

        showToast(data.message);
        modalImport.classList.add('hidden');
        loadGuestsData();
    } catch (err) {
        showToast('Gagal import: ' + err.message);
    } finally {
        btnExecuteImport.disabled = false;
        btnExecuteImport.textContent = 'Mulai Import';
    }
}

function openBulkBlastModal() {
    if (selectedGuestIds.size === 0) return;
    const recipients = currentGuests.filter(g => selectedGuestIds.has(g.id) && g.phone);

    if (recipients.length === 0) {
        showToast('Tamu yang dipilih tidak memiliki nomor WhatsApp.');
        return;
    }

    blastRecipientCount.textContent = recipients.length;
    blastTemplateText.value = `Halo {{nama}},\n\nAda kabar bahagia dari Hafla & Fifi! 📦\nBuka paket undangan pernikahan kami di sini:\n👉 {{link}}\n\nNo. Resi Pengiriman: {{kode}}\n\nMerupakan suatu kehormatan bagi kami apabila kamu berkenan hadir dan memberikan doa restu.`;

    modalBulkBlast.classList.remove('hidden');
}

async function handleConfirmBulkBlast() {
    const recipients = currentGuests
        .filter(g => selectedGuestIds.has(g.id) && g.phone)
        .map(g => ({ name: g.name, phone: g.phone, category: g.category }));

    const senderRadio = document.querySelector('input[name="blast_sender_role"]:checked');
    const senderRole = senderRadio ? senderRadio.value : 'cpp';
    const template = blastTemplateText.value.trim();
    const baseUrl = window.location.origin;

    btnConfirmBulkBlast.disabled = true;
    btnConfirmBulkBlast.textContent = 'Mengirim ke Antrean...';

    try {
        const { data, error } = await supabase.rpc('admin_trigger_blast', {
            p_pin: currentPin,
            p_sender_role: senderRole,
            p_recipients: recipients,
            p_template: template,
            p_base_url: baseUrl
        });

        if (error || !data?.success) {
            showToast(data?.error || error.message);
            return;
        }

        showToast(`🚀 ${data.queued_count} tamu berhasil dimasukkan ke antrean blast (${senderRole.toUpperCase()})!`);
        modalBulkBlast.classList.add('hidden');
        selectedGuestIds.clear();
        updateBulkBar();
        loadGuestsData();
    } catch (err) {
        showToast('Gagal mengirim blast: ' + err.message);
    } finally {
        btnConfirmBulkBlast.disabled = false;
        btnConfirmBulkBlast.textContent = 'Kirim ke Antrean WA Bridge';
    }
}

function exportToCSV() {
    if (currentGuests.length === 0) {
        showToast('Tidak ada data tamu untuk diekspor.');
        return;
    }

    const headers = ['Nama', 'No_Resi', 'No_WhatsApp', 'Pihak', 'Kategori', 'Pax', 'Status_RSVP', 'Pax_Hadir', 'Status_Blast', 'Terakhir_Dibuka', 'Catatan'];
    const rows = currentGuests.map(g => [
        `"${(g.name || '').replace(/"/g, '""')}"`,
        `"${g.code || ''}"`,
        `"${g.phone ? '+' + g.phone : ''}"`,
        `"${(g.side || '').toUpperCase()}"`,
        `"${(g.category || 'Umum').replace(/"/g, '""')}"`,
        g.pax || 1,
        `"${g.rsvp_status || 'pending'}"`,
        g.rsvp_pax || 0,
        `"${g.blast_status || 'unblasted'}"`,
        `"${g.opened_at ? new Date(g.opened_at).toLocaleString('id-ID') : 'Belum'}"`,
        `"${(g.notes || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    const dateStr = new Date().toISOString().slice(0, 10);
    link.setAttribute('download', `tamu_undangan_hafla_fifi_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('✓ File CSV daftar tamu berhasil diunduh.');
}

function subscribeRealtime() {
    supabase
        .channel('guests_management_feed')
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'guests' },
            () => {
                loadGuestsData();
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
