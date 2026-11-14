-- ============================================================================
-- Migrasi: 20261113124000_init_flexible_undangan_wa.sql
-- Proyek: Undangan Pernikahan Hafla & Fifi (H&F)
-- Fitur: Open URL, Dual-Session WA Bridge (CPP & CPW), Admin RPC & Realtime
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. FUNGSI AUTO-UPDATE TIMESTAMP
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- 2. TABEL GUESTS (Daftar Tamu & Check-in Fleksibel)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.guests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE,                                -- Kode resi unik (opsional / auto-generate)
    name TEXT NOT NULL,                             -- Nama Tamu
    phone TEXT,                                     -- Nomor WhatsApp format 628xxx
    side VARCHAR(10) DEFAULT 'cpp',                 -- 'cpp' (Pria), 'cpw' (Wanita), 'umum'
    category TEXT DEFAULT 'Umum',                   -- 'Keluarga', 'Rekan Kerja', 'Teman', dll.
    pax INTEGER DEFAULT 1,                          -- Kuota jumlah tamu
    rsvp_status TEXT DEFAULT 'pending',             -- 'pending', 'attending', 'declined'
    rsvp_pax INTEGER DEFAULT 0,                     -- Konfirmasi jumlah hadir
    rsvp_at TIMESTAMPTZ,                            -- Waktu submit RSVP
    attended BOOLEAN DEFAULT FALSE,                 -- Status kehadiran di meja tamu
    attended_at TIMESTAMPTZ,                        -- Jam check-in
    notes TEXT,                                     -- Catatan admin
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_guests_code ON public.guests(code);
CREATE INDEX IF NOT EXISTS idx_guests_phone ON public.guests(phone);
CREATE INDEX IF NOT EXISTS idx_guests_side ON public.guests(side);
CREATE INDEX IF NOT EXISTS idx_guests_rsvp_status ON public.guests(rsvp_status);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_guests_updated_at'
    ) THEN
        CREATE TRIGGER trg_guests_updated_at
            BEFORE UPDATE ON public.guests
            FOR EACH ROW
            EXECUTE FUNCTION public.handle_updated_at();
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3. TABEL WISHES (Buku Tamu / Doa Restu)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wishes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guest_id UUID REFERENCES public.guests(id) ON DELETE SET NULL,
    guest_name TEXT NOT NULL,
    message TEXT NOT NULL,
    attendance_badge TEXT DEFAULT 'Hadir',          -- 'Hadir', 'Berhalangan'
    pax INTEGER DEFAULT 1,
    is_visible BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wishes_created_at ON public.wishes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wishes_visible ON public.wishes(is_visible);

-- ----------------------------------------------------------------------------
-- 4. TABEL WA_BRIDGE_STATUS (Relay Status Dual-Session: CPP & CPW)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wa_bridge_status (
    session_id VARCHAR(10) PRIMARY KEY,              -- 'cpp' atau 'cpw'
    label VARCHAR(50) NOT NULL,                     -- Nama Tampilan (CPP Hafla / CPW Fifi)
    connected BOOLEAN DEFAULT FALSE,                -- Status login WhatsApp
    phone VARCHAR(25),                              -- Nomor pengirim aktif
    name VARCHAR(100),                              -- Nama profil WhatsApp
    qr_base64 TEXT,                                 -- Data URL gambar QR Code PNG
    qr_expires_at TIMESTAMPTZ,                      -- Waktu kadaluwarsa QR
    is_session_corrupted BOOLEAN DEFAULT FALSE,     -- Status kesehatan sesi
    queue_stats JSONB DEFAULT '{}'::JSONB,          -- Snapshot statistik antrean
    updated_at TIMESTAMPTZ DEFAULT NOW()            -- Heartbeat timestamp
);

-- Seed baris default untuk sesi 'cpp' dan 'cpw'
INSERT INTO public.wa_bridge_status (session_id, label, connected)
VALUES 
    ('cpp', 'Pengantin Pria (CPP - Hafla)', false),
    ('cpw', 'Pengantin Wanita (CPW - Fifi)', false)
ON CONFLICT (session_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 5. TABEL WA_OUTBOX (Antrean Pesan & Perintah Jarak Jauh)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wa_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_role VARCHAR(10) DEFAULT 'cpp',          -- 'cpp' atau 'cpw'
    guest_id UUID REFERENCES public.guests(id) ON DELETE SET NULL,
    phone VARCHAR(25) NOT NULL,                     -- Nomor tujuan E.164 (628xxx) atau 'system'
    recipient_name VARCHAR(100),                    -- Nama tamu tujuan
    message TEXT NOT NULL,                          -- Teks pesan atau perintah ('RESET_SESSION'/'LOGOUT')
    type VARCHAR(25) DEFAULT 'text',                -- 'text' atau 'system_command'
    status VARCHAR(20) DEFAULT 'pending',           -- 'pending', 'processing', 'sent', 'delivered', 'failed', 'cancelled'
    error_message TEXT,
    retries INTEGER DEFAULT 0,
    payload JSONB DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_wa_outbox_queue ON public.wa_outbox(status, sender_role, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_wa_outbox_guest ON public.wa_outbox(guest_id);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_wa_outbox_updated_at'
    ) THEN
        CREATE TRIGGER trg_wa_outbox_updated_at
            BEFORE UPDATE ON public.wa_outbox
            FOR EACH ROW
            EXECUTE FUNCTION public.handle_updated_at();
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- ----------------------------------------------------------------------------
ALTER TABLE public.guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wishes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_bridge_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_outbox ENABLE ROW LEVEL SECURITY;

-- Policy GUESTS
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public select guests') THEN
        CREATE POLICY "Public select guests" ON public.guests FOR SELECT TO anon, authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public update guest rsvp') THEN
        CREATE POLICY "Public update guest rsvp" ON public.guests FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role all guests') THEN
        CREATE POLICY "Service role all guests" ON public.guests FOR ALL TO service_role USING (true);
    END IF;
END $$;

-- Policy WISHES
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public select visible wishes') THEN
        CREATE POLICY "Public select visible wishes" ON public.wishes FOR SELECT TO anon, authenticated USING (is_visible = true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public insert wishes') THEN
        CREATE POLICY "Public insert wishes" ON public.wishes FOR INSERT TO anon, authenticated
            WITH CHECK (length(trim(message)) >= 2 AND length(trim(guest_name)) >= 2);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role all wishes') THEN
        CREATE POLICY "Service role all wishes" ON public.wishes FOR ALL TO service_role USING (true);
    END IF;
END $$;

-- Policy WA_BRIDGE_STATUS (Anon boleh baca status & QR live untuk admin web)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public select wa_bridge_status') THEN
        CREATE POLICY "Public select wa_bridge_status" ON public.wa_bridge_status FOR SELECT TO anon, authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role all wa_bridge_status') THEN
        CREATE POLICY "Service role all wa_bridge_status" ON public.wa_bridge_status FOR ALL TO service_role USING (true);
    END IF;
END $$;

-- Policy WA_OUTBOX (Tertutup penuh untuk anon; hanya bisa dimanipulasi via RPC ber-PIN atau service_role)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role all wa_outbox') THEN
        CREATE POLICY "Service role all wa_outbox" ON public.wa_outbox FOR ALL TO service_role USING (true);
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 7. STORED PROCEDURES (RPC) BER-PIN UNTUK DASHBOARD ADMIN
-- ----------------------------------------------------------------------------

-- A. Perintah Jarak Jauh WhatsApp (RESET_SESSION / LOGOUT)
CREATE OR REPLACE FUNCTION public.admin_device_command(
    p_pin TEXT,
    p_session_id TEXT,
    p_action TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_clean_action TEXT;
    v_session TEXT;
BEGIN
    IF p_pin IS NULL OR trim(p_pin) != '202620' THEN
        RETURN jsonb_build_object('success', false, 'error', 'PIN Admin salah atau tidak valid.');
    END IF;

    v_session := lower(trim(p_session_id));
    IF v_session NOT IN ('cpp', 'cpw') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Session ID harus "cpp" atau "cpw".');
    END IF;

    v_clean_action := upper(trim(p_action));
    IF v_clean_action NOT IN ('RESET_SESSION', 'LOGOUT') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Perintah tidak dikenal. Harus RESET_SESSION atau LOGOUT.');
    END IF;

    INSERT INTO public.wa_outbox (
        sender_role,
        phone,
        recipient_name,
        message,
        type,
        status
    ) VALUES (
        v_session,
        'system',
        'SYSTEM COMMAND',
        v_clean_action,
        'system_command',
        'pending'
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', format('Perintah %s untuk sesi %s berhasil dikirim ke antrean worker.', v_clean_action, v_session)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- B. Memicu Blast Pengiriman Undangan
CREATE OR REPLACE FUNCTION public.admin_trigger_blast(
    p_pin TEXT,
    p_sender_role TEXT,
    p_recipients JSONB,
    p_template TEXT,
    p_base_url TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_sender TEXT;
    v_item JSONB;
    v_raw_phone TEXT;
    v_clean_phone TEXT;
    v_name TEXT;
    v_code TEXT;
    v_link TEXT;
    v_message TEXT;
    v_guest_id UUID;
    v_queued_count INTEGER := 0;
    v_base_clean TEXT;
BEGIN
    IF p_pin IS NULL OR trim(p_pin) != '202620' THEN
        RETURN jsonb_build_object('success', false, 'error', 'PIN Admin salah.');
    END IF;

    v_sender := lower(trim(p_sender_role));
    IF v_sender NOT IN ('cpp', 'cpw') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Sender role harus "cpp" atau "cpw".');
    END IF;

    IF p_recipients IS NULL OR jsonb_array_length(p_recipients) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Daftar penerima kosong.');
    END IF;

    v_base_clean := rtrim(p_base_url, '/');

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_recipients)
    LOOP
        v_name := trim(coalesce(v_item->>'name', ''));
        v_raw_phone := coalesce(v_item->>'phone', '');

        -- Normalisasi nomor telepon
        v_clean_phone := regexp_replace(v_raw_phone, '\D', '', 'g');
        IF starts_with(v_clean_phone, '0') THEN
            v_clean_phone := '62' || substr(v_clean_phone, 2);
        ELSIF starts_with(v_clean_phone, '8') THEN
            v_clean_phone := '628' || substr(v_clean_phone, 2);
        END IF;

        IF length(v_clean_phone) >= 10 AND length(v_name) >= 1 THEN
            -- Generate kode unik
            v_code := 'JNT-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));

            -- Generate URL personalisasi
            v_link := v_base_clean || '/?to=' || replace(v_name, ' ', '+') || '&code=' || v_code;

            -- Siapkan teks pesan
            v_message := replace(p_template, '{{nama}}', v_name);
            v_message := replace(v_message, '{{link}}', v_link);
            v_message := replace(v_message, '{{kode}}', v_code);

            -- Upsert data tamu ke tabel guests
            INSERT INTO public.guests (
                code,
                name,
                phone,
                side,
                category
            ) VALUES (
                v_code,
                v_name,
                v_clean_phone,
                v_sender,
                coalesce(v_item->>'category', 'Umum')
            )
            RETURNING id INTO v_guest_id;

            -- Sisipkan ke wa_outbox
            INSERT INTO public.wa_outbox (
                sender_role,
                guest_id,
                phone,
                recipient_name,
                message,
                type,
                status
            ) VALUES (
                v_sender,
                v_guest_id,
                v_clean_phone,
                v_name,
                v_message,
                'text',
                'pending'
            );

            v_queued_count := v_queued_count + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'queued_count', v_queued_count,
        'message', format('Berhasil menambahkan %s pesan ke antrean blast (%s).', v_queued_count, v_sender)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- C. Mengambil Data Ringkasan Dashboard Admin
CREATE OR REPLACE FUNCTION public.admin_get_dashboard_data(p_pin TEXT)
RETURNS JSONB AS $$
DECLARE
    v_bridge_status JSONB;
    v_outbox_stats JSONB;
    v_recent_outbox JSONB;
    v_guest_summary JSONB;
    v_recent_wishes JSONB;
BEGIN
    IF p_pin IS NULL OR trim(p_pin) != '202620' THEN
        RETURN jsonb_build_object('success', false, 'error', 'PIN Admin salah.');
    END IF;

    -- 1. Bridge Status
    SELECT jsonb_agg(to_jsonb(b) ORDER BY b.session_id)
    INTO v_bridge_status
    FROM public.wa_bridge_status b;

    -- 2. Outbox Stats
    SELECT jsonb_object_agg(
        status_key,
        total
    )
    INTO v_outbox_stats
    FROM (
        SELECT (sender_role || '_' || status) AS status_key, count(*) AS total
        FROM public.wa_outbox
        WHERE type = 'text'
        GROUP BY sender_role, status
    ) s;

    -- 3. Recent Outbox
    SELECT jsonb_agg(to_jsonb(o))
    INTO v_recent_outbox
    FROM (
        SELECT id, sender_role, phone, recipient_name, status, error_message, created_at, sent_at
        FROM public.wa_outbox
        WHERE type = 'text'
        ORDER BY created_at DESC
        LIMIT 30
    ) o;

    -- 4. Guest Summary
    SELECT jsonb_build_object(
        'total_guests', count(*),
        'attending', count(*) FILTER (WHERE rsvp_status = 'attending'),
        'declined', count(*) FILTER (WHERE rsvp_status = 'declined'),
        'total_pax', coalesce(sum(rsvp_pax) FILTER (WHERE rsvp_status = 'attending'), 0)
    )
    INTO v_guest_summary
    FROM public.guests;

    -- 5. Recent Wishes
    SELECT jsonb_agg(to_jsonb(w))
    INTO v_recent_wishes
    FROM (
        SELECT id, guest_name, message, attendance_badge, created_at
        FROM public.wishes
        ORDER BY created_at DESC
        LIMIT 10
    ) w;

    RETURN jsonb_build_object(
        'success', true,
        'bridge_status', coalesce(v_bridge_status, '[]'::JSONB),
        'outbox_stats', coalesce(v_outbox_stats, '{}'::JSONB),
        'recent_outbox', coalesce(v_recent_outbox, '[]'::JSONB),
        'guest_summary', coalesce(v_guest_summary, '{}'::JSONB),
        'recent_wishes', coalesce(v_recent_wishes, '[]'::JSONB)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 8. PUBLIKASI REALTIME
-- ----------------------------------------------------------------------------
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
        WHERE pubname = 'supabase_realtime' AND tablename = 'wa_bridge_status'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.wa_bridge_status;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'wishes'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.wishes;
    END IF;
END $$;
