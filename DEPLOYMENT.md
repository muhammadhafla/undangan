# DEPLOYMENT.md — Panduan Deployment & Konfigurasi Lingkungan

Dokumen ini memuat panduan struktur proyek, konfigurasi variabel lingkungan (*environment variables*), langkah migrasi database, dan *checklist* pra-peluncuran (*pre-flight verification*).

---

## 1. Struktur Direktori Proyek yang Direkomendasikan

Untuk menjaga arsitektur tetap bersih, modular, dan ringan:

```text
C:\project\undangan\
├── README.md                  # Indeks utama dokumentasi proyek
├── ARCHITECTURE.md            # Arsitektur & strategi performa
├── SPEC.md                    # Spesifikasi fungsional & non-fungsional
├── DESIGN.md                  # Sistem desain, warna, & audio
├── DATABASE.md                # Skema SQL, RLS, & Realtime Supabase
├── INTEGRATION_BAILEYS.md     # Panduan worker WhatsApp Baileys
├── DEPLOYMENT.md              # Panduan deployment ini
├── .env.example               # Contoh konfigurasi aman tanpa secret hardcoded
├── .gitignore
├── package.json               # Konfigurasi dependensi (Vite / Tailwind)
├── index.html                 # Halaman utama tamu (Amplop & Struk Unboxing)
├── admin.html                 # Dashboard Admin (Import Excel & WA Blast)
├── scanner.html               # Scanner Meja Resepsi (QR Check-in)
├── src/
│   ├── config.js              # Data acara: nama mempelai, tanggal, rekening, teks
│   ├── styles/
│   │   └── main.css           # Styling Tailwind / CSS amplop & struk
│   └── scripts/
│       ├── unboxing.js        # Logika pembukaan amplop & audio fade-in
│       ├── rsvp.js            # Koneksi Supabase REST untuk RSVP & doa
│       ├── admin.js           # Importer Excel & generator antrean blast
│       └── scanner.js         # Kamera QR scanner & handler check-in
└── public/
    └── assets/
        ├── audio/
        │   └── ambience.opus  # Audio Lo-Fi & gemercik air (~600 KB)
        └── photos/
            ├── photo-1.webp   # Foto candid kedai kopi (~45 KB)
            ├── photo-2.webp   # Foto candid gemercik air alam (~50 KB)
            └── photo-3.webp   # Foto candid rental PS (~40 KB)
```

---

## 2. File Konfigurasi Acara Modular (`src/config.js`)

Untuk menjaga frontend tamu tetap secepat kilat tanpa query berat saat pertama kali dibuka, data konten disimpan di file modular `config.js`:

```javascript
export const WEDDING_CONFIG = {
    groom: {
        nickname: "Nama Pria",
        fullName: "Nama Lengkap Mempelai Pria, S.T.",
        role: "Toko Ritel Kita",
        parents: "Putra dari Bpk. ... & Ibu ..."
    },
    bride: {
        nickname: "Nama Wanita",
        fullName: "Nama Lengkap Mempelai Wanita, S.E.",
        role: "J&T Express",
        parents: "Putri dari Bpk. ... & Ibu ..."
    },
    event: {
        date: "2026-11-20",
        dateFormatted: "Sabtu, 20 November 2026",
        akad: {
            time: "08:00 - 10:00 WIB",
            venue: "Masjid Raya / Rumah Mempelai",
            address: "Jl. Contoh Alamat Lengkap No. 123"
        },
        resepsi: {
            time: "11:00 - 14:00 WIB",
            venue: "Gedung Serbaguna",
            address: "Jl. Alamat Resepsi Gedung No. 456"
        },
        mapsUrl: "https://maps.google.com/?q=-6.200000,106.816666",
        wazeUrl: "https://waze.com/ul?ll=-6.200000,106.816666&navigate=yes"
    },
    digitalGift: {
        bankName: "BCA",
        accountNumber: "1234567890",
        accountHolder: "Nama Mempelai Pria",
        qrisImage: "/assets/photos/qris.webp",
        physicalGiftAddress: "Counter J&T Express / Toko Ritel, Jl. Contoh Alamat No. 12"
    },
    admin: {
        // PIN login admin (dapat diubah sesuai preferensi)
        pin: "202620"
    }
};
```

---

## 3. Konfigurasi Variabel Lingkungan (`.env.example`)

> [!CAUTION]
> **Zero Hardcoded Secrets Rule:** Jangan pernah menuliskan API Secret Key, JWT Secret, atau Private Key ke dalam file kode sumber atau git repository.

### File `.env.example` (Untuk Frontend & Admin Web):
```bash
# URL Project Supabase Anda
VITE_SUPABASE_URL=https://your-project-id.supabase.co

# Kunci Anon Publik (Aman diekspos di browser untuk fetch publik & insert doa)
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key-here

# PIN Akses Cepat Dashboard Admin
VITE_ADMIN_PIN=202620
```

### File `.env` (Hanya untuk Worker Baileys - Sisi Server / Lokal):
```bash
SUPABASE_URL=https://your-project-id.supabase.co
# Kunci Service Role (HANYA untuk worker, jangan pernah terekspos ke frontend)
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key-here
```

---

## 4. Langkah Migrasi Supabase

1. Buka dashboard proyek Anda di [https://supabase.com](https://supabase.com).
2. Masuk ke menu **SQL Editor**.
3. Buka file **`DATABASE.md`** di repositori ini, salin seluruh blok DDL SQL.
4. Tempelkan ke SQL Editor Supabase dan jalankan (**Run**).
5. Verifikasi bahwa tabel `guests`, `wishes`, dan `wa_outbox` telah terbentuk dan publikasi Realtime aktif.

---

## 5. Opsi Deployment Hosting Frontend

Frontend bersifat statis (*JAMstack*) dengan performa tinggi. Dapat di-deploy secara gratis dengan *zero-cost*:

### Opsi A: Cloudflare Pages (Sangat Direkomendasikan untuk Kecepatan Global & Indo)
1. Sambungkan repositori Git ke Cloudflare Pages.
2. Build command: `npm run build` (atau kosongkan jika menggunakan HTML statis murni).
3. Output directory: `dist` (atau root `/`).
4. Atur Environment Variables di menu Settings Cloudflare Pages (`VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY`).

### Opsi B: Vercel / Netlify
1. Impor repositori Git ke Vercel/Netlify.
2. Tambahkan Environment Variables yang sama.
3. Klik **Deploy**.

---

## 6. Checklist Verifikasi Pra-Peluncuran (Pre-Flight Checklist)

Sebelum membagikan tautan undangan ke para tamu:

- [ ] **Uji Parameter URL:** Buka `https://domain.id/?to=Keluarga+Budi&code=JNT-0001` dan pastikan nama muncul di resi amplop.
- [ ] **Uji Audio di Mobile:** Buka di Safari iOS dan Chrome Android. Pastikan suara mengalun halus setelah tombol segel diklik.
- [ ] **Uji Salin Rekening:** Klik tombol "Salin Nomor Rekening", pastikan teks di clipboard sudah benar.
- [ ] **Uji RSVP & Doa Restu:** Masukkan ucapan tes, verifikasi bahwa ucapan langsung muncul di dinding doa tanpa refresh.
- [ ] **Uji Impor Excel Admin:** Di `/admin`, upload file Excel contoh dan pastikan daftar tamu masuk ke tabel Supabase.
- [ ] **Uji Kamera Scanner:** Di `/admin/scanner`, arahkan kamera HP panitia ke QR code resi tamu, pastikan status berhasil check-in.
- [ ] **Uji Worker Baileys:** Jalankan antrean 1 nomor tes, pastikan pesan terkirim ke WhatsApp tujuan dan status di tabel `wa_outbox` berubah menjadi `'sent'`.
