# SPEC.md — Spesifikasi Fungsional & Non-Fungsional

Dokumen ini menjelaskan seluruh spesifikasi kebutuhan sistem secara rinci, mencakup sisi tamu publik (*Guest Facing*), dashboard pengelola (*Admin Facing*), dan spesifikasi teknis operasional.

---

## 1. Modul Tamu Publik (Guest Facing)

### 1.1 Welcome Screen (Amplop Dokumen Pengiriman)
* **Kebutuhan URL:**  
  Format URL tamu: `https://domain.id/?to=[Nama+Tamu]&code=[Kode_Tamu]`  
  *Contoh:* `https://domain.id/?to=Budi+Santoso&code=JNT-A01B2`
* **Handling URL Parameter:**
  * Jika parameter `to` ada: Render teks nama pada kolom **"Penerima"** di label thermal J&T.
  * Jika parameter `to` kosong: Tampilkan nilai default: `"Yth. Sahabat & Kerabat Tercinta"`.
  * Parameter `code` disimpan di *Local State* untuk pengisian otomatis form RSVP dan identifikasi QR Code.
* **Elemen Visual Cover (Mobile-First):**
  * Amplop bergaya *Airmail Retro* dengan pinggiran belang-belang diagonal merah dan biru navy klasik.
  * Badan kertas kraft manila hangat dengan tutup atas bersudut lengkung.
  * Mekanisme pengunci kancing merah bulat dan lilitan benang tali merah (*String & Button Closure*) dengan ujung tali menjuntai.
  * Label resi pengiriman resmi J&T Cargo yang bersih & ringkas (hanya lembar atas tanpa potongan bukti bawah):
    * Logo: `J&T CARGO`
    * No. Resi & Barcode: `200417537039` (atau dinamis `[CODE]`)
    * Pengirim: `Rian Pratama (Toko Ritel Kita)`
    * Penerima: `[Nama Tamu]` (Bold, menonjol & terbaca jelas di layar HP)
    * Status: `FastTrack (FT)` & `NON COD - CASHLESS (1/1)`
  * Tombol Interaktif pada pengikat tali: **"Tarik Tali Paket"** (dengan efek denyut halus / *pulse effect*).

### 1.2 Transisi Unboxing & Audio Ambience Engine
* **Pemicu (Trigger):** Tamu menekan kancing / tombol "Tarik Tali Paket".
* **Aksi Transisi:**
  1. Tutup amplop terlipat membuka ke atas (*CSS 3D rotateX 180deg*).
  2. Audio latar otomatis mulai memutar dengan teknik *fade-in volume* dari 0% ke 60% dalam waktu 2.5 detik.
  3. Tombol floating kontrol audio (Ikon speaker / piringan hitam kecil) muncul di pojok kanan atas layar dengan status *Active/Playing*.
  4. Seluruh item dokumen mulai ditarik keluar secara bertahap (*cascading slide-up*).
* **Kontrol Audio:**
  * Tombol floating dapat di-tap kapan saja untuk *Mute* (Pause) atau *Play*.
  * Jika browser memblokir audio policy, sistem tidak boleh crash; tombol cukup menampilkan status *Paused* hingga user menekan tombol speaker secara manual.

### 1.3 Item 1: Lembar Struk Kasir Thermal ("Transaksi Seumur Hidup")
* **Karakteristik Visual:**
  * Kertas putih gading panjang dengan efek sobekan zigzag di atas dan bawah.
  * Font monospace ala printer kasir POS Epson / thermal resi.
* **Konten Teks Struk:**
  * Header: `STRUK PENUKARAN CINTA (BUKAN KEMBALIAN BIASA)`
  * Kasir: `[Nama Mempelai Pria] (Toko Ritel)`
  * Kurir/Admin: `[Nama Mempelai Wanita] (J&T Express)`
  * Tabel Rincian Transaksi:
    * `1x Tukar Uang Pecahan COD Rp 2.000 & Rp 5.000 ........ Rp 0,- (Awal Cerita)`
    * `100+ Cangkir Kopi di Kedai Baru ...................... Tak Ternilai`
    * `50+ Jam Sewa Rental PS (Co-Op Player 1 & 2) .......... Seru Banget`
    * `Suara Gemercik Air di Alam Bebas .................... Adem di Jiwa`
    * `------------------------------------------------------------`
    * `SUBTOTAL: Saling Nyaman & Sepakat Bersama`
    * `PPN (Pajak Penuh Niat): 100% Menuju Pelaminan`
    * `TOTAL PEMBAYARAN: Akad & Resepsi Pernikahan`
  * Bagian Informasi Acara:
    * **Akad Nikah:** Hari, Tanggal, Jam (WIB), Nama Masjid / Venue.
    * **Resepsi:** Hari, Tanggal, Jam (WIB), Nama Gedung / Alamat Lengkap.

### 1.4 Item 2: Photo-Strip Polaroid Analog
* **Karakteristik Visual:**
  * Bingkai polaroid putih klasik dengan 3–4 foto candid momen santai:
    1. Foto sedang ngopi santai di kedai kopi.
    2. Foto suasana santai di alam terbuka dengan latar air mengalir.
    3. Foto bermain stik game bersama di rental PS.
  * Efek kemiringan acak (*subtle rotation* $-2^\circ$ hingga $+2^\circ$) layaknya foto cetak asli yang diselipkan di kertas.
* **Interaksi Lightbox:**
  * Setiap foto dapat di-tap oleh tamu untuk membuka modal *view-fullscreen* berlatar gelap transparan.
  * Tap di luar area foto atau tombol close `✕` akan menutup modal.

### 1.5 Item 3: Kartu Rute Pengiriman (Waybill Card)
* **Karakteristik Visual:**
  * Kartu bergaya tiket jalan pengiriman paket.
  * Dilengkapi ilustrasi/tangkapan peta estetik berukuran mini.
  * Hitung mundur (*Countdown Timer*) menuju hari H acara.
* **Aksi Navigasi:**
  * Tombol **"Buka di Google Maps"**: membuka URL langsung `https://www.google.com/maps/search/?api=1&query=[Latitude],[Longitude]`.
  * Tombol **"Buka di Waze"**: membuka URL `https://waze.com/ul?ll=[Lat],[Long]&navigate=yes`.
  * Tombol **"Simpan ke Kalender"**: membuka Google Calendar event creator link dan opsi download file `.ics`.

### 1.6 Item 4: Slip "Cash on Delivery (COD) & Kembalian"
* **Karakteristik Visual:**
  * Amplop mini berlabel *"Titipan Uang Kembalian / Kado Pernikahan"*.
* **Fitur Amplop Digital:**
  * Menampilkan nama bank (BCA / Mandiri / BSI), nomor rekening, dan nama pemilik rekening.
  * Tombol **"Salin Nomor Rekening"**: menyalin nomor ke clipboard dan memunculkan tooltip centang *"Tersalin!"*.
  * Tampilan gambar QRIS statis yang bisa di-tap untuk perbesar jika ingin transfer via Gopay/OVO/ShopeePay/BCA Mobile.
  * Opsi *"Kirim Kado Fisik"*: Alamat lengkap counter pengiriman kado fisik beserta tombol *"Salin Alamat"*.

### 1.7 Item 5: Form Konfirmasi Kehadiran (RSVP) & Dinding Doa
* **Form Input:**
  * `Nama Tamu` (Otomatis terisi jika ada param `?to=...`, tetap bisa disunting).
  * `Konfirmasi Kehadiran` (Radio button: "Pasti Hadir" / "Maaf, Berhalangan").
  * `Jumlah Kehadiran (Pax)` (Dropdown: 1 Orang / 2 Orang, disesuaikan dengan kuota tamu).
  * `Doa & Pesan Hangat` (Textarea).
* **Aturan Bisnis & Filter Kata:**
  * Validasi wajib isi untuk nama, konfirmasi, dan pesan.
  * *Profanity Filter*: Menyaring kata-kata kasar / spam menggunakan kamus kata lokal sederhana sebelum dikirim.
* **Dinding Doa Realtime:**
  * Menampilkan daftar ucapan tamu yang sudah tersimpan di tabel `wishes` (diurutkan dari yang paling baru).
  * Efek kartu ucapan mini dengan nama, waktu kirim, dan badge status kehadiran.

---

## 2. Modul Pengelola & Meja Tamu (Admin Facing)

### 2.1 Autentikasi Masuk Admin (`/admin`)
* **Mekanisme Login:**
  * Input kode PIN praktis (default: 6 angka, dapat dikonfigurasi).
  * Saat PIN cocok, simpan token sesi di `sessionStorage` browser.
  * Halaman aman: Jika token tidak valid, arahkan ke layar input PIN.

### 2.2 Importer Tamu via Excel (`.xlsx` / `.csv`)
* **Spesifikasi Kolom File:**
  File spreadsheet wajib memiliki header kolom:
  1. `nama` (Wajib, teks nama tamu)
  2. `nomor_wa` (Wajib, format 08xx atau 628xx)
  3. `kategori` (Opsional: 'Keluarga', 'Rekan J&T', 'Rekan Ritel', 'Teman Kopi', 'Teman PS')
  4. `pax` (Opsional, integer: default 1 atau 2)
* **Logika Pemrosesan Importer:**
  * Normalisasi nomor HP: Otomatis membersihkan karakter spasi, strip, atau tanda `+`. Ubah awalan `08` menjadi format standar internasional `628`.
  * Auto-Generate Kode Unik: Buat kode unik format `JNT-` diikuti 4 digit acak alfanumerik (contoh: `JNT-K9F2`).
  * Tampilkan tabel preview validasi data sebelum tombol **"Simpan ke Database"** dieksekusi.

### 2.3 Manajemen Data Tamu
* Tampilan tabel interaktif dengan fitur:
  * Pencarian cepat berdasarkan nama atau nomor HP.
  * Filter berdasarkan kategori tamu dan status RSVP.
  * Kolom: Nama, Kategori, Pax, Link Undangan, Status Blast WA, Status Kehadiran, Aksi.
  * Tombol aksi cepat: Salin tautan undangan personal, atau kirim WA manual via `wa.me`.

### 2.4 WhatsApp Blast Engine (Outbox Trigger)
* **Fitur Generator Antrean Pesan:**
  * Tombol filter: "Kirim ke Semua yang Belum Menerima" atau "Pilih Tamu Tertentu".
  * Template Editor dengan variabel dinamis:
    * `{{nama}}` $\rightarrow$ Nama tamu
    * `{{link}}` $\rightarrow$ Tautan lengkap undangan personal
    * `{{kode}}` $\rightarrow$ Kode resi unik tamu
    * `{{kategori}}` $\rightarrow$ Kategori tamu
  * Template default ramah:
    ```text
    Halo {{nama}},
    
    Ada paket spesial yang siap kamu unboxing!
    Bukan paket kiriman biasa, melainkan kabar bahagia dari kami berdua:
    
    Buka paket undanganmu di sini:
    {{link}}
    
    No. Resi: {{kode}}
    Merupakan suatu kehormatan bagi kami jika kamu dapat hadir.
    
    Salam hangat,
    [Nama Kedua Mempelai]
    ```
  * Saat tombol **"Mulai Masukkan ke Antrean Blast"** diklik, sistem mengeksekusi `INSERT` ke tabel `wa_outbox` dengan status `'pending'`.
  * Terdapat progress bar antrean yang membaca jumlah baris `pending`, `processing`, `sent`, dan `failed`.

### 2.5 Scanner Meja Resepsi (`/admin/scanner`)
* **Antarmuka Scanner Kamera:**
  * Membuka kamera belakang HP/tablet panitia menggunakan WebRTC / HTML5 QR Scanner (`html5-qrcode` yang super ringan).
  * Saat kamera mendeteksi QR Code resi tamu (berisi string kode resi misal `JNT-K9F2`):
    1. Sistem memutar suara *beep* sukses.
    2. Query ke Supabase mencari data tamu dengan `code = 'JNT-K9F2'`.
    3. Update field `attended = true` dan `attended_at = NOW()`.
    4. Tampilkan kartu pop-up data tamu di layar panitia: Nama, Kategori, Kuota Pax, dan status check-in.
  * **Fallback Manual:** Jika tamu tidak membawa HP atau QR rusak, panitia dapat mengetik nama tamu di kolom pencarian cepat di bawah kamera, lalu klik tombol **"Check-in Hadir"**.

---

## 3. Spesifikasi Non-Fungsional

| Aspek | Parameter | Target Batasan |
| :--- | :--- | :--- |
| **Kecepatan Muat (Speed)** | First Contentful Paint (FCP) | $\le 0.4 \text{ detik}$ pada koneksi 4G standar. |
| **Kinerja Browser** | Google Lighthouse Performance | Skor minimal **95/100** pada mode Mobile. |
| **Responsivitas** | Lebar Layar | Dioptimalkan untuk Mobile (360px - 430px) hingga Desktop (1920px). |
| **Kompatibilitas** | Browser Engine | Chrome, Safari iOS 14+, Samsung Internet, Firefox, Edge. |
| **Keandalan Offline** | Service Worker / Cache | Aset audio dan foto di-cache oleh browser setelah pemuatan pertama. |
| **Toleransi Error WA** | Baileys Worker Resiliency | Jika koneksi WA terputus, worker otomatis reconnect dan melanjutkan antrean `wa_outbox` yang berstatus `'pending'` tanpa ada pesan ganda. |
