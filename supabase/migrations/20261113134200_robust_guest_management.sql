-- ============================================================================
-- Migrasi: 20261113134200_robust_guest_management.sql
-- Proyek: Undangan Pernikahan Hafla & Fifi (H&F)
-- Fitur: Robust Guest Management (Anti-Double Blast, Link Tracking, Soft Delete,
--        Duplicate Guard, Catalog & CRUD RPCs)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. PENAMBAHAN KOLOM PADA TABEL GUESTS (NON-DESTRUKTIF)
-- ----------------------------------------------------------------------------
ALTER TABLE public.guests
    ADD COLUMN IF NOT EXISTS blast_status VARCHAR(20) DEFAULT 'unblasted',
    ADD COLUMN IF NOT EXISTS last_blasted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS opened_count INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_guests_blast_status ON public.guests(blast_status);
CREATE INDEX IF NOT EXISTS idx_guests_is_deleted ON public.guests(is_deleted);
CREATE INDEX IF NOT EXISTS idx_guests_opened_at ON public.guests(opened_at);

-- ----------------------------------------------------------------------------
-- 2. RPC PELACAKAN UNDANGAN DIBUKA (PUBLIK BEBAS PIN)
-- Dipanggil asinkron dari unboxing.js saat amplop dibuka
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.track_guest_open(p_code TEXT)
RETURNS JSONB AS $$
DECLARE
    v_clean_code TEXT;
BEGIN
    IF p_code IS NULL OR trim(p_code) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Kode tidak valid');
    END IF;

    v_clean_code := upper(trim(p_code));

    UPDATE public.guests
    SET 
        opened_at = coalesce(opened_at, NOW()),
        opened_count = coalesce(opened_count, 0) + 1,
        updated_at = NOW()
    WHERE UPPER(code) = v_clean_code AND is_deleted = FALSE;

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Berikan izin akses publik ke track_guest_open
GRANT EXECUTE ON FUNCTION public.track_guest_open(TEXT) TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3. TRIGGER AUTO-SYNC STATUS BLAST DARI WA_OUTBOX KE GUESTS
-- Saat outbox berstatus 'sent', perbarui blast_status di tabel guests
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_outbox_to_guest_blast_status()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.guest_id IS NOT NULL THEN
        IF NEW.status = 'sent' THEN
            UPDATE public.guests
            SET 
                blast_status = 'sent',
                last_blasted_at = coalesce(NEW.sent_at, NOW()),
                updated_at = NOW()
            WHERE id = NEW.guest_id;
        ELSIF NEW.status = 'processing' THEN
            UPDATE public.guests
            SET 
                blast_status = 'queued',
                updated_at = NOW()
            WHERE id = NEW.guest_id;
        ELSIF NEW.status = 'failed' THEN
            UPDATE public.guests
            SET 
                blast_status = 'failed',
                updated_at = NOW()
            WHERE id = NEW.guest_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_sync_outbox_blast_status'
    ) THEN
        CREATE TRIGGER trg_sync_outbox_blast_status
            AFTER UPDATE OF status ON public.wa_outbox
            FOR EACH ROW
            EXECUTE FUNCTION public.sync_outbox_to_guest_blast_status();
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 4. RPC ADMIN GET GUESTS CATALOG (FILTER DINAMIS & REKAPITULASI)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_guests_catalog(
    p_pin TEXT,
    p_side TEXT DEFAULT NULL,
    p_category TEXT DEFAULT NULL,
    p_rsvp TEXT DEFAULT NULL,
    p_blast_status TEXT DEFAULT NULL,
    p_search TEXT DEFAULT NULL,
    p_show_deleted BOOLEAN DEFAULT FALSE
)
RETURNS JSONB AS $$
DECLARE
    v_guests JSONB;
    v_categories JSONB;
    v_summary JSONB;
    v_search TEXT;
BEGIN
    IF p_pin IS NULL OR trim(p_pin) != '202620' THEN
        RETURN jsonb_build_object('success', false, 'error', 'PIN Admin salah.');
    END IF;

    v_search := nullif(trim(p_search), '');

    -- 1. Ambil daftar tamu terfilter
    SELECT jsonb_agg(to_jsonb(g) ORDER BY g.created_at DESC)
    INTO v_guests
    FROM (
        SELECT 
            id,
            code,
            name,
            phone,
            side,
            category,
            pax,
            rsvp_status,
            rsvp_pax,
            rsvp_at,
            blast_status,
            last_blasted_at,
            opened_at,
            opened_count,
            notes,
            is_deleted,
            created_at,
            updated_at
        FROM public.guests
        WHERE 
            (is_deleted = coalesce(p_show_deleted, false))
            AND (p_side IS NULL OR p_side = 'all' OR side = p_side)
            AND (p_category IS NULL OR p_category = 'all' OR category = p_category)
            AND (p_rsvp IS NULL OR p_rsvp = 'all' OR rsvp_status = p_rsvp)
            AND (
                p_blast_status IS NULL OR p_blast_status = 'all'
                OR (p_blast_status = 'unblasted' AND (blast_status IS NULL OR blast_status = 'unblasted'))
                OR (blast_status = p_blast_status)
            )
            AND (
                v_search IS NULL 
                OR name ILIKE '%' || v_search || '%'
                OR coalesce(phone, '') ILIKE '%' || v_search || '%'
                OR coalesce(code, '') ILIKE '%' || v_search || '%'
                OR coalesce(category, '') ILIKE '%' || v_search || '%'
            )
        ORDER BY created_at DESC
        LIMIT 300
    ) g;

    -- 2. Ambil seluruh kategori unik yang aktif
    SELECT jsonb_agg(cat ORDER BY cat ASC)
    INTO v_categories
    FROM (
        SELECT DISTINCT category AS cat
        FROM public.guests
        WHERE category IS NOT NULL AND trim(category) != '' AND is_deleted = FALSE
    ) c;

    -- 3. Agregat Rekapitulasi Tamu
    SELECT jsonb_build_object(
        'total_guests', count(*) FILTER (WHERE is_deleted = FALSE),
        'cpp_guests', count(*) FILTER (WHERE side = 'cpp' AND is_deleted = FALSE),
        'cpw_guests', count(*) FILTER (WHERE side = 'cpw' AND is_deleted = FALSE),
        'attending_guests', count(*) FILTER (WHERE rsvp_status = 'attending' AND is_deleted = FALSE),
        'declined_guests', count(*) FILTER (WHERE rsvp_status = 'declined' AND is_deleted = FALSE),
        'pending_guests', count(*) FILTER (WHERE (rsvp_status = 'pending' OR rsvp_status IS NULL) AND is_deleted = FALSE),
        'total_pax', coalesce(sum(pax) FILTER (WHERE is_deleted = FALSE), 0),
        'confirmed_pax', coalesce(sum(rsvp_pax) FILTER (WHERE rsvp_status = 'attending' AND is_deleted = FALSE), 0),
        'unblasted_count', count(*) FILTER (WHERE (blast_status IS NULL OR blast_status = 'unblasted') AND is_deleted = FALSE),
        'opened_count', count(*) FILTER (WHERE opened_at IS NOT NULL AND is_deleted = FALSE),
        'deleted_count', count(*) FILTER (WHERE is_deleted = TRUE)
    )
    INTO v_summary
    FROM public.guests;

    RETURN jsonb_build_object(
        'success', true,
        'guests', coalesce(v_guests, '[]'::JSONB),
        'categories', coalesce(v_categories, '[]'::JSONB),
        'summary', coalesce(v_summary, '{}'::JSONB)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 5. RPC ADMIN MANAGE GUEST (CRUD & DUPLICATE GUARD)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_manage_guest(
    p_pin TEXT,
    p_action TEXT,
    p_payload JSONB
)
RETURNS JSONB AS $$
DECLARE
    v_clean_phone TEXT;
    v_raw_phone TEXT;
    v_name TEXT;
    v_side TEXT;
    v_category TEXT;
    v_pax INTEGER;
    v_notes TEXT;
    v_code TEXT;
    v_id UUID;
    v_existing RECORD;
BEGIN
    IF p_pin IS NULL OR trim(p_pin) != '202620' THEN
        RETURN jsonb_build_object('success', false, 'error', 'PIN Admin salah.');
    END IF;

    -- A. INSERT TAMU BARU (DENGAN DUPLICATE GUARD)
    IF upper(p_action) = 'INSERT' THEN
        v_name := trim(coalesce(p_payload->>'name', ''));
        IF length(v_name) < 2 THEN
            RETURN jsonb_build_object('success', false, 'error', 'Nama tamu wajib diisi.');
        END IF;

        v_raw_phone := coalesce(p_payload->>'phone', '');
        v_clean_phone := regexp_replace(v_raw_phone, '\D', '', 'g');
        IF starts_with(v_clean_phone, '0') THEN
            v_clean_phone := '62' || substr(v_clean_phone, 2);
        ELSIF starts_with(v_clean_phone, '8') THEN
            v_clean_phone := '628' || substr(v_clean_phone, 2);
        END IF;

        -- Duplicate Guard: Cek apakah nomor sudah ada
        IF length(v_clean_phone) >= 10 AND coalesce(p_payload->>'force_update', 'false') != 'true' THEN
            SELECT id, name, side, category INTO v_existing
            FROM public.guests
            WHERE phone = v_clean_phone AND is_deleted = FALSE
            LIMIT 1;

            IF FOUND THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'already_exists', true,
                    'existing_id', v_existing.id,
                    'existing_name', v_existing.name,
                    'existing_side', v_existing.side,
                    'existing_category', v_existing.category,
                    'error', format('Nomor %s sudah terdaftar atas nama "%s" (%s - %s).', v_clean_phone, v_existing.name, upper(v_existing.side), v_existing.category)
                );
            END IF;
        END IF;

        v_side := lower(coalesce(p_payload->>'side', 'cpp'));
        IF v_side NOT IN ('cpp', 'cpw') THEN v_side := 'cpp'; END IF;

        v_category := trim(coalesce(p_payload->>'category', 'Umum'));
        IF v_category = '' THEN v_category := 'Umum'; END IF;

        v_pax := coalesce((p_payload->>'pax')::INTEGER, 1);
        IF v_pax < 1 THEN v_pax := 1; END IF;

        v_notes := trim(coalesce(p_payload->>'notes', ''));
        v_code := 'JNT-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));

        INSERT INTO public.guests (
            code,
            name,
            phone,
            side,
            category,
            pax,
            notes,
            blast_status,
            is_deleted
        ) VALUES (
            v_code,
            v_name,
            nullif(v_clean_phone, ''),
            v_side,
            v_category,
            v_pax,
            nullif(v_notes, ''),
            'unblasted',
            FALSE
        )
        RETURNING id INTO v_id;

        RETURN jsonb_build_object(
            'success', true,
            'id', v_id,
            'code', v_code,
            'message', format('Tamu "%s" berhasil ditambahkan.', v_name)
        );

    -- B. UPDATE TAMU
    ELSIF upper(p_action) = 'UPDATE' THEN
        v_id := (p_payload->>'id')::UUID;
        IF v_id IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'ID Tamu tidak valid.');
        END IF;

        v_name := trim(coalesce(p_payload->>'name', ''));
        v_raw_phone := coalesce(p_payload->>'phone', '');
        v_clean_phone := regexp_replace(v_raw_phone, '\D', '', 'g');
        IF starts_with(v_clean_phone, '0') THEN
            v_clean_phone := '62' || substr(v_clean_phone, 2);
        ELSIF starts_with(v_clean_phone, '8') THEN
            v_clean_phone := '628' || substr(v_clean_phone, 2);
        END IF;

        v_side := lower(coalesce(p_payload->>'side', 'cpp'));
        v_category := trim(coalesce(p_payload->>'category', 'Umum'));
        v_pax := coalesce((p_payload->>'pax')::INTEGER, 1);
        v_notes := trim(coalesce(p_payload->>'notes', ''));

        UPDATE public.guests
        SET 
            name = coalesce(nullif(v_name, ''), name),
            phone = nullif(v_clean_phone, ''),
            side = v_side,
            category = v_category,
            pax = v_pax,
            notes = nullif(v_notes, ''),
            updated_at = NOW()
        WHERE id = v_id;

        RETURN jsonb_build_object('success', true, 'message', 'Data tamu berhasil diperbarui.');

    -- C. SOFT DELETE (PINDAHKAN KE TEMPAT SAMPAH)
    ELSIF upper(p_action) = 'SOFT_DELETE' THEN
        v_id := (p_payload->>'id')::UUID;
        UPDATE public.guests SET is_deleted = TRUE, updated_at = NOW() WHERE id = v_id;
        RETURN jsonb_build_object('success', true, 'message', 'Tamu dipindahkan ke tempat sampah.');

    -- D. BULK SOFT DELETE
    ELSIF upper(p_action) = 'BULK_SOFT_DELETE' THEN
        UPDATE public.guests
        SET is_deleted = TRUE, updated_at = NOW()
        WHERE id IN (
            SELECT (jsonb_array_elements_text(p_payload->'ids'))::UUID
        );
        RETURN jsonb_build_object('success', true, 'message', 'Tamu terpilih berhasil dipindahkan ke tempat sampah.');

    -- E. RESTORE DARI TEMPAT SAMPAH
    ELSIF upper(p_action) = 'RESTORE' THEN
        v_id := (p_payload->>'id')::UUID;
        UPDATE public.guests SET is_deleted = FALSE, updated_at = NOW() WHERE id = v_id;
        RETURN jsonb_build_object('success', true, 'message', 'Tamu berhasil dipulihkan.');

    -- F. PURGE / NON-ACTIVE
    ELSIF upper(p_action) = 'PURGE' THEN
        v_id := (p_payload->>'id')::UUID;
        UPDATE public.guests SET is_deleted = TRUE, notes = '[PURGED] ' || coalesce(notes, '') WHERE id = v_id;
        RETURN jsonb_build_object('success', true, 'message', 'Tamu berhasil dibersihkan.');

    ELSE
        RETURN jsonb_build_object('success', false, 'error', 'Action tidak dikenal.');
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 6. RPC ADMIN BULK IMPORT GUESTS (DENGAN NORMALISASI & DUPLICATE SKIP)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_bulk_import_guests(
    p_pin TEXT,
    p_guests JSONB
)
RETURNS JSONB AS $$
DECLARE
    v_item JSONB;
    v_name TEXT;
    v_raw_phone TEXT;
    v_clean_phone TEXT;
    v_side TEXT;
    v_category TEXT;
    v_pax INTEGER;
    v_code TEXT;
    v_imported_count INTEGER := 0;
    v_skipped_count INTEGER := 0;
BEGIN
    IF p_pin IS NULL OR trim(p_pin) != '202620' THEN
        RETURN jsonb_build_object('success', false, 'error', 'PIN Admin salah.');
    END IF;

    IF p_guests IS NULL OR jsonb_array_length(p_guests) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Daftar tamu import kosong.');
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_guests)
    LOOP
        v_name := trim(coalesce(v_item->>'name', ''));
        IF length(v_name) >= 2 THEN
            v_raw_phone := coalesce(v_item->>'phone', '');
            v_clean_phone := regexp_replace(v_raw_phone, '\D', '', 'g');
            IF starts_with(v_clean_phone, '0') THEN
                v_clean_phone := '62' || substr(v_clean_phone, 2);
            ELSIF starts_with(v_clean_phone, '8') THEN
                v_clean_phone := '628' || substr(v_clean_phone, 2);
            END IF;

            v_side := lower(coalesce(v_item->>'side', 'cpp'));
            IF v_side NOT IN ('cpp', 'cpw') THEN v_side := 'cpp'; END IF;

            v_category := trim(coalesce(v_item->>'category', 'Umum'));
            IF v_category = '' THEN v_category := 'Umum'; END IF;

            v_pax := coalesce((v_item->>'pax')::INTEGER, 1);
            IF v_pax < 1 THEN v_pax := 1; END IF;

            -- Cek duplikasi nomor jika nomor valid
            IF length(v_clean_phone) >= 10 THEN
                IF EXISTS (SELECT 1 FROM public.guests WHERE phone = v_clean_phone AND is_deleted = FALSE) THEN
                    v_skipped_count := v_skipped_count + 1;
                    CONTINUE;
                END IF;
            END IF;

            v_code := 'JNT-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));

            INSERT INTO public.guests (
                code,
                name,
                phone,
                side,
                category,
                pax,
                blast_status,
                is_deleted
            ) VALUES (
                v_code,
                v_name,
                nullif(v_clean_phone, ''),
                v_side,
                v_category,
                v_pax,
                'unblasted',
                FALSE
            );

            v_imported_count := v_imported_count + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'imported_count', v_imported_count,
        'skipped_count', v_skipped_count,
        'message', format('Berhasil mengimpor %s tamu (%s duplikat dilewati).', v_imported_count, v_skipped_count)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
