-- =====================================================================
-- FIX 2026-08-19 (v2): Adicionar 4 tables à realtime publication
-- profiles, sessions, sync_queue, user_permissions não entraram na
-- publicação supabase_realtime (mostraram NÃO na verificação)
-- PG14-compatible: DO block com checagem de existência (sem IF NOT EXISTS)
-- =====================================================================

DO $$
DECLARE
  v_tables TEXT[] := ARRAY['profiles', 'sessions', 'sync_queue', 'user_permissions'];
  v_t TEXT;
  v_in_pub BOOLEAN;
BEGIN
  FOREACH v_t IN ARRAY v_tables LOOP
    SELECT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = v_t
    ) INTO v_in_pub;

    IF NOT v_in_pub THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_t);
      RAISE NOTICE '✅ Adicionada à realtime: %', v_t;
    ELSE
      RAISE NOTICE '⏭️  Já na realtime: %', v_t;
    END IF;
  END LOOP;
END $$;

-- Verificação: devem aparecer como SIM
SELECT
  c.relname AS tabela,
  CASE WHEN pt.tablename IS NOT NULL THEN 'SIM' ELSE 'NÃO' END AS na_realtime,
  CASE c.relreplident
    WHEN 'f' THEN 'full'
    ELSE 'NÃO É FULL'
  END AS replica_identity
FROM pg_class c
LEFT JOIN pg_publication_tables pt
  ON pt.pubname = 'supabase_realtime' AND pt.tablename = c.relname
WHERE c.relname IN ('profiles', 'sessions', 'sync_queue', 'user_permissions')
ORDER BY c.relname;