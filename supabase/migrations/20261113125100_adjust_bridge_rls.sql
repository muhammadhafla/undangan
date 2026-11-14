-- ============================================================================
-- Migrasi: 20261113125100_adjust_bridge_rls.sql
-- Penyesuaian Hak Akses RLS untuk Worker WA Bridge (Zero-Port Anon Sync)
-- ============================================================================

-- 1. Berikan hak INSERT & UPDATE pada wa_bridge_status agar worker dapat relay QR & heartbeat
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow worker insert wa_bridge_status') THEN
        CREATE POLICY "Allow worker insert wa_bridge_status"
            ON public.wa_bridge_status FOR INSERT
            TO anon, authenticated
            WITH CHECK (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow worker update wa_bridge_status') THEN
        CREATE POLICY "Allow worker update wa_bridge_status"
            ON public.wa_bridge_status FOR UPDATE
            TO anon, authenticated
            USING (true)
            WITH CHECK (true);
    END IF;
END $$;

-- 2. Berikan hak SELECT & UPDATE pada wa_outbox agar worker dapat memproses antrean pesan
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow worker select wa_outbox') THEN
        CREATE POLICY "Allow worker select wa_outbox"
            ON public.wa_outbox FOR SELECT
            TO anon, authenticated
            USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow worker update wa_outbox status') THEN
        CREATE POLICY "Allow worker update wa_outbox status"
            ON public.wa_outbox FOR UPDATE
            TO anon, authenticated
            USING (true)
            WITH CHECK (true);
    END IF;
END $$;
