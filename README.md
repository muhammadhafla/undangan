# Dokumentasi Teknis Sistem Undangan Digital & Manajemen Tamu
## Tema: "Toko Ritel x J&T Express (Transaksi Cinta & Tukar Uang Pecahan)"

Selamat datang di repositori dokumentasi teknis untuk pengembangan **Web Undangan Digital Interaktif, Manajemen Buku Tamu, dan WhatsApp Outbox Dispatcher**.

Dokumentasi ini dirancang sangat terperinci, modular, dan siap digunakan oleh developer frontend, backend, maupun tim pengembang integrasi WhatsApp bot (Baileys).

---

### Daftar Dokumen Spesifikasi

| Dokumen | Deskripsi | Target Pembaca |
| :--- | :--- | :--- |
| **[ARCHITECTURE.md](file:///C:/project/undangan/ARCHITECTURE.md)** | Arsitektur sistem menyeluruh, topologi alur unboxing, strategi performa ultra-ringan (< 100 KB), dan diagram interaksi data. | Lead Architect, Fullstack Dev |
| **[SPEC.md](file:///C:/project/undangan/SPEC.md)** | Spesifikasi fungsional dan non-fungsional lengkap: alur tamu publik, fitur dashboard admin, import Excel, QR scanner meja resepsi, dan RSVP realtime. | Frontend Dev, QA / Tester |
| **[DESIGN.md](file:///C:/project/undangan/DESIGN.md)** | Panduan sistem desain visual: metafora amplop kraft & struk kasir thermal J&T, palet warna, tipografi, spesifikasi animasi CSS, dan tata suara *ambience* (Lo-Fi & gemercik air). | UI/UX Designer, Frontend Dev |
| **[DATABASE.md](file:///C:/project/undangan/DATABASE.md)** | Skema DDL Supabase lengkap (tabel `guests`, `wishes`, `wa_outbox`), indeks performa, RLS (Row Level Security), dan fungsi pemicu (*triggers*). | Backend Dev, Database Admin |
| **[INTEGRATION_BAILEYS.md](file:///C:/project/undangan/INTEGRATION_BAILEYS.md)** | Spesifikasi teknis integrasi WhatsApp outbox: listener Supabase Realtime, antrean pesan, template parser, anti-ban rate limiting, dan kode referensi worker Node.js. | WhatsApp Bot Dev, Backend Dev |
| **[DEPLOYMENT.md](file:///C:/project/undangan/DEPLOYMENT.md)** | Panduan setup lokal, konfigurasi *environment variables*, langkah migrasi Supabase, opsi hosting (Vercel / Cloudflare Pages), dan *checklist* keamanan pra-peluncuran. | DevOps, Sysadmin, Fullstack Dev |

---

### Ringkasan Cerita & Nilai Inti Proyek
* **Backstory Unik:** Pertemuan berawal dari kasir toko ritel yang membutuhkan uang kembalian pecahan kecil dengan staf J&T Express yang mengelola uang tunai dari kurir COD.
* **Hobi & Kepribadian:** Pecinta kopi (*coffee shop hopping*), penikmat ketenangan (suara gemercik air di alam terbuka), dan momen santai bermain game di rental PS bersama.
* **Prinsip Utama Rekayasa Web:** **Super Ringan (< 100 KB)**, bebas *bloatware*, transisi CSS murni tanpa library 3D berat, serta zero-cost operational memanfaatkan Supabase gratisan dan client Baileys self-hosted.

---
*Dibuat khusus untuk pengantin dan tim pengembang proyek undangan digital.*
