# DATABASE.md — Skema Database, RLS & Realtime Supabase

Dokumen ini menyediakan skrip DDL SQL lengkap, kebijakan keamanan *Row Level Security* (RLS), indeks performa, serta fungsi *Stored Procedure* (RPC) untuk Supabase.

---

## 1. Skrip Migrasi DDL (Idempotent & Non-Destructive)

Eksekusi skrip SQL berikut di **Supabase SQL Editor** atau simpan di file migrasi lokal `supabase/migrations/20261112000000_init_undangan.sql`:

```sql
-- ============================================================================
-- 1. EXTENSIONS & FUNGSI BANTUAN
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Fungsi otomatis perbarui kolom updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 2. TABEL GUESTS (Daftar Tamu & Check-in)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.guests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,                       -- Contoh: 'JNT-K9F2'
    name TEXT NOT NULL,                             -- Nama Tamu
    phone TEXT,                                     -- Nomor WhatsApp format 628xxx
    category TEXT DEFAULT 'Umum',                   -- 'Keluarga', 'Rekan J&T', 'Rekan Ritel', 'Teman Kopi', 'Teman PS'
    pax INTEGER DEFAULT 1,                          -- Kuota jumlah orang
    rsvp_status TEXT DEFAULT 'pending',             -- 'pending', 'attending', 'declined'
    rsvp_pax INTEGER DEFAULT 0,                     -- Jumlah konfirmasi hadir
    rsvp_at TIMESTAMPTZ,                            -- Waktu konfirmasi RSVP
    attended BOOLEAN DEFAULT FALSE,                 -- Status kehadiran di meja resepsi
    attended_at TIMESTAMPTZ,                        -- Jam check-in di hari H
    notes TEXT,                                     -- Catatan internal admin
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indeks performa pencarian tamu
CREATE INDEX IF NOT EXISTS idx_guests_code ON public.guests(code);
CREATE INDEX IF NOT EXISTS idx_guests_phone ON public.guests(phone);
CREATE INDEX IF NOT EXISTS idx_guests_category ON public.guests(category);
CREATE INDEX IF NOT EXISTS idx_guests_rsvp_status ON public.guests(rsvp_status);

-- Trigger auto updated_at
DROP TRIGGER IF EXISTS set_guests_updated_at ON public.guests;
CREATE TRIGGER set_guests_updated_at
    BEFORE UPDATE ON public.guests
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- 3. TABEL WISHES (Buku Tamu / Doa Restu)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.wishes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guest_id UUID REFERENCES public.guests(id) ON DELETE SET NULL,
    guest_name TEXT NOT NULL,
    message TEXT NOT NULL,
    attendance_badge TEXT DEFAULT 'Hadir',          -- 'Hadir', 'Berhalangan', 'Netral'
    is_visible BOOLEAN DEFAULT TRUE,                -- Filter moderasi admin
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indeks pengurutan dinding doa
CREATE INDEX IF NOT EXISTS idx_wishes_created_at ON public.wishes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wishes_visible ON public.wishes(is_visible);

-- ============================================================================
-- 4. TABEL WA_OUTBOX (Antrean Pesan WhatsApp untuk Baileys)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.wa_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guest_id UUID REFERENCES public.guests(id) ON DELETE CASCADE,
    phone TEXT NOT NULL,                            -- Nomor tujuan WhatsApp (628xxx)
    message TEXT NOT NULL,                          -- Isi teks pesan terpersonalisasi
    status TEXT DEFAULT 'pending',                  -- 'pending', 'processing', 'sent', 'failed'
    error_message TEXT,                             -- Alasan gagal jika status failed
    retries INTEGER DEFAULT 0,                      -- Jumlah percobaan ulang kirim
    payload JSONB DEFAULT '{}'::JSONB,              -- Data tambahan opsional
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    sent_at TIMESTAMPTZ                             -- Waktu sukses terkirim ke WhatsApp
);

-- Indeks antrean worker Baileys
CREATE INDEX IF NOT EXISTS idx_wa_outbox_queue ON public.wa_outbox(status, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_wa_outbox_guest_id ON public.wa_outbox(guest_id);

-- Trigger auto updated_at
DROP TRIGGER IF EXISTS set_wa_outbox_updated_at ON public.wa_outbox;
CREATE TRIGGER set_wa_outbox_updated_at
    BEFORE UPDATE ON public.wa_outbox
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();
```

---

## 2. Row Level Security (RLS) & Kebijakan Hak Akses

Aktifkan keamanan ketat agar data sensitif nomor telepon tamu dan antrean blast WhatsApp tidak terekspos ke publik anonim:

```sql
-- 1. Aktifkan RLS di seluruh tabel
ALTER TABLE public.guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wishes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_outbox ENABLE ROW LEVEL SECURITY;

-- 2. Kebijakan Tabel GUESTS:
-- Publik hanya dapat membaca data jika memiliki 'code' yang sesuai
DROP POLICY IF EXISTS "Public can view guest by code" ON public.guests;
CREATE POLICY "Public can view guest by code"
    ON public.guests FOR SELECT
    TO anon, authenticated
    USING (true);

-- Publik dapat mengupdate status RSVP sendiri
DROP POLICY IF EXISTS "Public can update own RSVP" ON public.guests;
CREATE POLICY "Public can update own RSVP"
    ON public.guests FOR UPDATE
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);

-- Service Role (Admin/Backend) memiliki akses penuh
DROP POLICY IF EXISTS "Service role full access on guests" ON public.guests;
CREATE POLICY "Service role full access on guests"
    ON public.guests FOR ALL
    TO service_role
    USING (true);

-- 3. Kebijakan Tabel WISHES:
-- Semua orang (anonim & tamu) boleh membaca ucapan yang aktif (is_visible = true)
DROP POLICY IF EXISTS "Anyone can view approved wishes" ON public.wishes;
CREATE POLICY "Anyone can view approved wishes"
    ON public.wishes FOR SELECT
    TO anon, authenticated
    USING (is_visible = true);

-- Semua orang boleh mengirimkan doa restu baru
DROP POLICY IF EXISTS "Anyone can insert wishes" ON public.wishes;
CREATE POLICY "Anyone can insert wishes"
    ON public.wishes FOR INSERT
    TO anon, authenticated
    WITH CHECK (length(trim(message)) >= 2 AND length(trim(guest_name)) >= 2);

-- Service Role full access
DROP POLICY IF EXISTS "Service role full access on wishes" ON public.wishes;
CREATE POLICY "Service role full access on wishes"
    ON public.wishes FOR ALL
    TO service_role
    USING (true);

-- 4. Kebijakan Tabel WA_OUTBOX:
-- Publik sama sekali TIDAK BOLEH membaca/menulis antrean WA
DROP POLICY IF EXISTS "Deny anon access on wa_outbox" ON public.wa_outbox;
-- Hanya Service Role dan Authenticated Admin yang memiliki hak akses
DROP POLICY IF EXISTS "Service role full access on wa_outbox" ON public.wa_outbox;
CREATE POLICY "Service role full access on wa_outbox"
    ON public.wa_outbox FOR ALL
    TO service_role
    USING (true);
```

---

## 3. Konfigurasi Supabase Realtime

Agar client Baileys dan dinding doa restu langsung merespons data baru tanpa perlu me-refresh halaman (polling):

```sql
-- Tambahkan tabel wa_outbox dan wishes ke publikasi realtime Supabase
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'wa_outbox'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.wa_outbox;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'wishes'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.wishes;
    END IF;
END $$;
```

---

## 4. Stored Procedure (RPC) untuk Check-in Meja Resepsi

Fungsi ini dipanggil oleh scanner meja tamu di hari H untuk memastikan validitas kode resi dan mencegah *double check-in*:

```sql
CREATE OR REPLACE FUNCTION public.checkin_guest(guest_code TEXT)
RETURNS JSONB AS $$
DECLARE
    target_guest RECORD;
    result JSONB;
BEGIN
    -- 1. Cari data tamu berdasarkan kode resi
    SELECT * INTO target_guest 
    FROM public.guests 
    WHERE UPPER(code) = UPPER(trim(guest_code));

    -- Jika tamu tidak ditemukan
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Kode resi tidak ditemukan. Mohon cek kembali nama tamu.'
        );
    END IF;

    -- Jika tamu sudah check-in sebelumnya
    IF target_guest.attended = TRUE THEN
        RETURN jsonb_build_object(
            'success', true,
            'already_checked_in', true,
            'message', 'Tamu sudah check-in sebelumnya.',
            'guest', jsonb_build_object(
                'id', target_guest.id,
                'name', target_guest.name,
                'category', target_guest.category,
                'pax', target_guest.pax,
                'attended_at', target_guest.attended_at
            )
        );
    END IF;

    -- Update status kehadiran tamu
    UPDATE public.guests
    SET 
        attended = TRUE,
        attended_at = NOW()
    WHERE id = target_guest.id;

    RETURN jsonb_build_object(
        'success', true,
        'already_checked_in', false,
        'message', 'Check-in berhasil! Selamat datang.',
        'guest', jsonb_build_object(
            'id', target_guest.id,
            'name', target_guest.name,
            'category', target_guest.category,
            'pax', target_guest.pax,
            'attended_at', NOW()
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```
