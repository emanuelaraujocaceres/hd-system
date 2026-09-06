-- ═══════════════════════════════════════════════════════════════════════════
-- 20260906_pix_config_realtime.sql
--
-- PIX por filial (auditoria 2026-09-06): publica `pix_config` no Realtime.
--
-- CONTEXTO: a tabela pix_config já existia (chave PIX por filial, RLS user_*
-- org+branch OK — ver SUPABASE_SCHEMA.md), mas NÃO fazia parte da publicação
-- `supabase_realtime` e tinha REPLICA IDENTITY default. Resultado: a config
-- salva em um dispositivo nunca chegava aos demais via Realtime, e o payload
-- de UPDATE/DELETE não carregava o registro completo.
--
-- Regra 2 do AGENTS.md: TODA tabela nova usada pelo frontend DEVE entrar na
-- publicação (senão o canal inteiro é rejeitado com CHANNEL_ERROR) + REPLICA
-- IDENTITY FULL para payload completo de UPDATE/DELETE.
--
-- Frontend (commit correspondente): pix_config nos 3 caminhos — upsert
-- (storageService.savePixConfig), mapper remoto (updatePixConfigFromRemote em
-- storageService + dispatch em App.tsx) e hidratação (fetchRows em
-- hydrateFromCloud) + syncService (TableName, BRANCH_REQUIRED_TABLES, lista de
-- tabelas do canal). Checkout (PaymentModal) já consumia por filial via
-- pixConfigService.getEffectivePixKey(branchId, settings.pixKey).
--
-- APLICAÇÃO: rodar no SQL Editor do Supabase. Idempotente (DO block verifica
-- pg_publication_tables antes de adicionar; REPLICA IDENTITY FULL é repetível).
-- ROLLBACK: ALTER PUBLICATION supabase_realtime DROP TABLE public.pix_config;
-- ALTER TABLE public.pix_config REPLICA IDENTITY DEFAULT;
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Publicação (idempotente)
-- ───────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'pix_config'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pix_config;
    RAISE NOTICE 'OK: pix_config adicionada à publicação supabase_realtime.';
  ELSE
    RAISE NOTICE 'OK: pix_config já estava na publicação supabase_realtime.';
  END IF;
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. REPLICA IDENTITY FULL (payload completo de UPDATE/DELETE)
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.pix_config REPLICA IDENTITY FULL;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Verificação (RAISE NOTICE)
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_in_pub boolean;
  v_replica text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'pix_config'
  ) INTO v_in_pub;

  SELECT c.relreplident::text INTO v_replica
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'pix_config';

  RAISE NOTICE 'pix_config na publicação supabase_realtime: %', v_in_pub;
  RAISE NOTICE 'pix_config REPLICA IDENTITY: % (esperado: f para FULL)', v_replica;
END;
$$;