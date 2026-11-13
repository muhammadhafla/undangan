# ARCHITECTURE.md — Arsitektur Sistem & Performa

Dokumen ini mendefinisikan arsitektur sistem menyeluruh, pola interaksi antar komponen, dan strategi rekayasa performa untuk web undangan pernikahan dan sistem manajemen tamu.

---

## 1. Topologi Sistem & Diagram Komponen

Sistem terdiri dari 4 komponen utama yang terpisah secara modular:

```mermaid
flowchart TD
    subgraph ClientLayer ["Client Layer (Browser HP & Desktop)"]
        GuestApp["Web Undangan Tamu (Mobile-First)\nPayload < 100 KB\n(Buka Amplop + Struk + Doa Restu)"]
        AdminApp["Dashboard Admin & Meja Tamu\n(/admin & /admin/scanner)\n(Import Excel, Blast Trigger, Check-in)"]
    end

    subgraph BackendLayer ["Backend Cloud (Supabase)"]
        DB[(PostgreSQL Database\nguests, wishes, wa_outbox)]
        RealtimeEngine["Supabase Realtime Engine\n(CDC / Postgres Changes on wa_outbox)"]
        PostgREST["PostgREST HTTP API\n(REST API auto-generated)"]
    end

    subgraph AutomationLayer ["WhatsApp Dispatcher (Self-Hosted)"]
        BaileysWorker["Baileys WhatsApp Client (Node.js)\n(Mendengarkan realtime 'wa_outbox' & Kirim Pesan)"]
    end

    GuestApp -->|Fetch Config / Kirim RSVP & Doa| PostgREST
    AdminApp -->|Import Tamu / Trigger Blast / Check-in| PostgREST
    PostgREST --> DB
    DB --> RealtimeEngine
    RealtimeEngine -->|Push event INSERT wa_outbox| BaileysWorker
    BaileysWorker -->|Kirim Pesan WhatsApp personalisasi| WA_Network["Jaringan WhatsApp Resmi (Tamu)"]
    BaileysWorker -->|Update status sent / failed| PostgREST
```

---

## 2. Alur Pengalaman Tamu (Unboxing Amplop J&T)

Tamu menerima tautan personalisasi dengan parameter URL:  
`https://undangan.domain.id/?to=Budi+Santoso&code=JNT-A01B2`

```mermaid
sequenceDiagram
    autonumber
    actor Tamu as Tamu Undangan
    participant Web as Web Frontend Tamu
    participant Audio as Audio Engine (HTML5 Audio)
    participant SB as Supabase REST API

    Tamu->>Web: Akses URL undangan (?to=...&code=...)
    Web->>Web: Render Amplop Cokelat Kraft dengan Label Resi J&T (Nama: Budi Santoso)
    Tamu->>Web: Klik tombol 'Buka Segel Amplop'
    Web->>Audio: Play Lo-Fi + Gemercik Air (Fade-in 2.5 detik)
    Web->>Web: Animasi CSS: Tutup amplop terlipat ke atas (envelope flap open)
    Web->>Web: Item ditarik keluar bertahap (Struk, Foto Polaroid, Tiket Waybill, COD Kado, Form Doa)
    Web->>SB: GET /wishes?order=created_at.desc&limit=20 (Muat ucapan terbaru)
    SB-->>Web: Daftar ucapan tamu lain
    Tamu->>Web: Mengisi Form RSVP & Tulis Doa Restu
    Web->>SB: POST /wishes & PATCH /guests (Update status RSVP)
    SB-->>Web: 201 Created (Doa langsung muncul di layar)
```

---

## 3. Alur WhatsApp Blast & Antrean Pesan (Outbox Pattern)

Untuk menjaga keandalan dan mencegah nomor WhatsApp terblokir akibat *flooding*, digunakan pola **Transactional Outbox**:

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Pengantin / Panitia (/admin)
    participant AdminUI as Dashboard Admin
    participant SB_DB as Supabase Database (wa_outbox)
    participant Worker as Baileys Worker Node.js
    actor Guest as Tamu (WhatsApp)

    Admin->>AdminUI: Upload Excel Tamu (.xlsx) & Pilih Template Pesan
    AdminUI->>SB_DB: INSERT INTO guests (...)
    AdminUI->>SB_DB: INSERT INTO wa_outbox (guest_id, phone, message, status='pending')
    Note over SB_DB,Worker: Supabase Realtime menembakkan notifikasi CDC ke Worker
    Worker->>SB_DB: UPDATE wa_outbox SET status='processing' WHERE id = :id
    Worker->>Guest: Kirim pesan WhatsApp (dengan jeda acak 5-12 detik)
    alt Berhasil Terkirim
        Worker->>SB_DB: UPDATE wa_outbox SET status='sent', sent_at=NOW()
    else Gagal / Nomor Tidak Valid
        Worker->>SB_DB: UPDATE wa_outbox SET status='failed', error_message=:err, retries=retries+1
    end
    AdminUI->>AdminUI: Bar progres blast ter-update realtime di layar admin
```

---

## 4. Alur Check-in Meja Tamu di Hari H (Hybrid Protocol)

Petugas meja penerima tamu membuka halaman `/admin/scanner` menggunakan browser tablet atau HP:

```mermaid
flowchart TD
    StartCheckin([Tamu Tiba di Meja Resepsi]) --> Decision{Tamu Membuka Undangan di HP?}
    
    Decision -- Ya --> ScanQR[Arahkan Kamera HP Panitia ke QR Code Resi Tamu]
    Decision -- Tidak / Lupa Bawa HP --> ManualSearch[Ketik 2-3 Huruf Nama Tamu di Kotak Pencarian]
    
    ScanQR --> Decode[Browser membaca string: code=JNT-A01B2]
    ManualSearch --> SelectGuest[Pilih Tamu dari Hasil Pencarian Cepat]
    
    Decode --> CallAPI[Kirim PATCH /rpc/checkin_guest]
    SelectGuest --> CallAPI
    
    CallAPI --> CheckDuplicate{Sudah Check-in Sebelumnya?}
    CheckDuplicate -- Sudah Pernah --> ShowWarning["Tampilkan Peringatan: SUDAH CHECK-IN pada pukul 19:15 WIB"]
    CheckDuplicate -- Belum --> Success["Tampilkan Sukses: Budi Santoso (Kategori: Rekan J&T, Kuota: 2 Pax)"]
    
    Success --> PrintOrBadge["Berikan Souvenir / Tanda Tamu"]
```

---

## 5. Strategi Rekayasa Performa Ultra-Ringan (< 100 KB Target)

Untuk memenuhi syarat **"harus ringan"**, berikut batasan teknis wajib (*hard constraints*):

### A. Alokasi Bobot Halaman (Performance Budget)
| Kategori Aset | Batas Maksimal | Strategi Optimasi |
| :--- | :--- | :--- |
| **HTML Document** | $\le 15 \text{ KB}$ | Semantic HTML5, minified, critical CSS inlined. |
| **Styles (CSS)** | $\le 20 \text{ KB}$ | Tailwind CSS purged (hanya class yang dipakai) atau pure custom CSS tanpa framework berat. |
| **JavaScript** | $\le 25 \text{ KB}$ | Vanilla JavaScript murni, no React/Vue/Three.js di halaman tamu publik. |
| **Foto Polaroid (3-4 foto)** | $\le 80 \text{ KB}$ total | Format **WebP** kualitas 75, dimensi $600 \times 600 \text{ px}$, kompresi agresif. |
| **Audio File (Lo-Fi + Air)** | $\le 650 \text{ KB}$ | Audio mono **Opus / AAC 64 kbps**, durasi 1.5 menit looping, di-load secara asinkron (*lazy-fetch* saat user klik buka segel). |
| **Total Initial Load** | **$\le 100 \text{ KB}$** | Terbuka di bawah 0.4 detik pada jaringan 4G standar. |

### B. Anti-Patterns yang Diharamkan
1. **Dilarang memakai `<iframe>` Google Maps:** Satu embed iframe memuat 1.5 MB JS dan 30+ network requests. Sebagai gantinya, gunakan ilustrasi peta minimalis format SVG/WebP berukuran 8 KB dengan deep link langsung ke aplikasi Google Maps dan Waze (`geo:` / `https://maps.google.com/?q=...`).
2. **Dilarang auto-play audio sebelum user berinteraksi:** Browser mobile modern (Chrome, Safari iOS) memblokir autoplay audio tanpa gesture pengguna. Momen klik "Buka Segel Amplop" dimanfaatkan sebagai *user gesture* resmi untuk memulai Web Audio API.
3. **Dilarang mengimpor library icon font (seperti FontAwesome 500 KB):** Seluruh icon (centang, salin rekening, panah, sound on/off) wajib berupa inline SVG murni (< 1 KB per ikon).
