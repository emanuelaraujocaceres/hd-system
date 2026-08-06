-- ==============================================================================
-- 20260815_frentes_tv_impressora.sql
-- Frentes 1, 2, 3 e 5 (impressora, conectar TV, vitrine de TV, relatório):
--   * 3 tabelas novas: footer_messages, media_devices, printers
--   * Triggers: updated_at, validação de filial, version bump (otimista)
--   * RLS por organização (padrão das demais) + grants PostgREST
--   * Publicação supabase_realtime + REPLICA IDENTITY FULL
--   * system_users.commission_rate (comissão no relatório)
--   * RPC heartbeat_media_device (status online/offline da TV)
--   * View vw_report_sale_items (base do relatório gerencial)
--
-- NOTA: este arquivo documenta o estado que já está no banco (executado via
-- SQL Editor / IA do Supabase). É idempotente: pode rodar em ambiente novo.
-- Colunas conferidas contra o catálogo real (information_schema).
-- ==============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- PASSO 1: TABELAS
-- ═══════════════════════════════════════════════════════════════════════════
-- Colunas confirmadas no catálogo do projeto:
--   footer_messages: id, organization_id, store_branch_id, message,
--                    sort_order, active, version, created_at, updated_at
--   media_devices:   id, organization_id, store_branch_id, name, device_type,
--                    address, pairing_code, is_active, last_seen_at,
--                    version, created_at, updated_at
--   printers:        id, organization_id, store_branch_id, name, model,
--                    transport, ip_address, port, is_default, status,
--                    last_seen_at, version, created_at, updated_at

CREATE TABLE IF NOT EXISTS public.footer_messages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL,
  store_branch_id  UUID NOT NULL,
  message          TEXT NOT NULL,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  active           BOOLEAN NOT NULL DEFAULT TRUE,
  version          INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.media_devices (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL,
  store_branch_id  UUID NOT NULL,
  name             TEXT NOT NULL,
  device_type      TEXT NOT NULL DEFAULT 'tv',
  address          TEXT,
  pairing_code     TEXT NOT NULL,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_at     TIMESTAMPTZ,
  version          INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_media_device_type CHECK (device_type IN ('tv', 'vitrine'))
);

CREATE TABLE IF NOT EXISTS public.printers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL,
  store_branch_id  UUID NOT NULL,
  name             TEXT NOT NULL,
  model            TEXT,
  transport        TEXT NOT NULL DEFAULT 'network',
  ip_address       TEXT,
  port             INTEGER,
  is_default       BOOLEAN NOT NULL DEFAULT FALSE,
  status           TEXT NOT NULL DEFAULT 'offline',
  last_seen_at     TIMESTAMPTZ,
  version          INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_printer_transport CHECK (transport IN ('webusb', 'serial', 'network', 'os'))
);

-- Índices de isolamento por filial
CREATE INDEX IF NOT EXISTS idx_footer_messages_branch
  ON public.footer_messages (store_branch_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_media_devices_branch
  ON public.media_devices (store_branch_id);
CREATE INDEX IF NOT EXISTS idx_printers_branch
  ON public.printers (store_branch_id);

-- Uma única impressora PADRÃO por filial
CREATE UNIQUE INDEX IF NOT EXISTS uq_printers_default_per_branch
  ON public.printers (store_branch_id) WHERE is_default = TRUE;

-- ═══════════════════════════════════════════════════════════════════════════
-- PASSO 2: TRIGGERS (updated_at + filial + version bump)
-- ═══════════════════════════════════════════════════════════════════════════

-- 2.1. updated_at (função já existe desde 20260729 — create or replace é seguro)
CREATE OR REPLACE FUNCTION public.fn_update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- 2.2. Version bump — concorrência otimista (nível 2 do design de sync).
-- O guard WHEN (OLD.* IS DISTINCT FROM NEW.*) evita que o eco do Realtime
-- (UPDATE sem mudança real) infle a versão em loop.
CREATE OR REPLACE FUNCTION public.fn_bump_version()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.version := COALESCE(OLD.version, 0) + 1;
  RETURN NEW;
END;
$$;

-- 2.3. Aplicar triggers nas 3 tabelas (updated_at + validação de filial + version)
DO $$
DECLARE
  target_tables TEXT[] := ARRAY['footer_messages', 'media_devices', 'printers'];
  tbl TEXT;
  col_exists BOOLEAN;
BEGIN
  FOREACH tbl IN ARRAY target_tables LOOP
    -- updated_at
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON public.%I', tbl, tbl);
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at
       BEFORE UPDATE ON public.%I
       FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*)
       EXECUTE FUNCTION public.fn_update_updated_at()',
      tbl, tbl
    );
    -- validação de filial (fn_validate_store_branch_id existe desde 20260806)
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'store_branch_id'
    ) INTO col_exists;
    IF col_exists THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_validate_store_branch_id ON public.%I', tbl);
      EXECUTE format(
        'CREATE TRIGGER trg_validate_store_branch_id
         BEFORE INSERT OR UPDATE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.fn_validate_store_branch_id()',
        tbl
      );
    END IF;
    -- version bump
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_bump_version ON public.%I', tbl, tbl);
    EXECUTE format(
      'CREATE TRIGGER trg_%s_bump_version
       BEFORE UPDATE ON public.%I
       FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*)
       EXECUTE FUNCTION public.fn_bump_version()',
      tbl, tbl
    );
    RAISE NOTICE '✅ Triggers aplicadas em %', tbl;
  END LOOP;
END $$;

-- system_settings ganhou version (concorrência otimista no update de config)
ALTER TABLE public.system_settings ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 0;
DROP TRIGGER IF EXISTS trg_system_settings_bump_version ON public.system_settings;
CREATE TRIGGER trg_system_settings_bump_version
  BEFORE UPDATE ON public.system_settings
  FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION public.fn_bump_version();

-- ═══════════════════════════════════════════════════════════════════════════
-- PASSO 3: RLS (mesmo padrão das demais tabelas — superadmin vê tudo)
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.footer_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.printers ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  target_tables TEXT[] := ARRAY['footer_messages', 'media_devices', 'printers'];
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY target_tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = tbl
        AND policyname = 'RLS_' || tbl || '_select_org'
    ) THEN
      EXECUTE format(
        'CREATE POLICY "RLS_%s_select_org" ON public.%I
         FOR SELECT USING (
           public.is_superadmin() OR organization_id = public.get_auth_user_org_id()
         )', tbl, tbl
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = tbl
        AND policyname = 'RLS_' || tbl || '_insert_org'
    ) THEN
      EXECUTE format(
        'CREATE POLICY "RLS_%s_insert_org" ON public.%I
         FOR INSERT WITH CHECK (
           public.is_superadmin() OR organization_id = public.get_auth_user_org_id()
         )', tbl, tbl
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = tbl
        AND policyname = 'RLS_' || tbl || '_update_org'
    ) THEN
      EXECUTE format(
        'CREATE POLICY "RLS_%s_update_org" ON public.%I
         FOR UPDATE USING (
           public.is_superadmin() OR organization_id = public.get_auth_user_org_id()
         ) WITH CHECK (
           public.is_superadmin() OR organization_id = public.get_auth_user_org_id()
         )', tbl, tbl
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = tbl
        AND policyname = 'RLS_' || tbl || '_delete_org'
    ) THEN
      EXECUTE format(
        'CREATE POLICY "RLS_%s_delete_org" ON public.%I
         FOR DELETE USING (
           public.is_superadmin() OR organization_id = public.get_auth_user_org_id()
         )', tbl, tbl
      );
    END IF;
    RAISE NOTICE '✅ Policies RLS de % garantidas', tbl;
  END LOOP;
END $$;

-- Privilégios PostgREST (sem isso o app autenticado recebe 403)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.footer_messages TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.media_devices TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.printers TO anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- PASSO 4: REALTIME — publicação + payload completo
-- (regra do AGENTS.md: tabela nova SEMPRE entra na publicação senão o canal
-- inteiro é rejeitado com CHANNEL_ERROR em loop)
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  tables TEXT[] := ARRAY['footer_messages', 'media_devices', 'printers'];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Realtime: % já na publicação', t;
    END;
  END LOOP;
END $$;

ALTER TABLE public.footer_messages REPLICA IDENTITY FULL;
ALTER TABLE public.media_devices REPLICA IDENTITY FULL;
ALTER TABLE public.printers REPLICA IDENTITY FULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- PASSO 5: COMISSÃO POR OPERADOR (relatório gerencial)
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.system_users ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(5,2) NOT NULL DEFAULT 0;
COMMENT ON COLUMN public.system_users.commission_rate IS
  'Percentual de comissão do operador (0–100). Usado no relatório gerencial.';

-- ═══════════════════════════════════════════════════════════════════════════
-- PASSO 6: HEARTBEAT DA TV (status online/offline)
-- SECURITY DEFINER: atualiza last_seen_at sem depender de RLS da linha.
-- Throttle de 15s: o front envia a cada 30s; o UPDATE só grava se o último
-- heartbeat for mais antigo que 15s (evita spam de versão/updated_at).
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.heartbeat_media_device(p_device_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_updated BOOLEAN := FALSE;
BEGIN
  v_org_id := public.get_auth_user_org_id();
  IF v_org_id IS NULL THEN
    RETURN FALSE; -- sem sessão/org válida
  END IF;

  UPDATE public.media_devices
     SET last_seen_at = NOW()
   WHERE id = p_device_id
     AND organization_id = v_org_id
     AND (
       last_seen_at IS NULL
       OR last_seen_at < NOW() - INTERVAL '15 seconds'
     )
  RETURNING TRUE INTO v_updated;

  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.heartbeat_media_device(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.heartbeat_media_device(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.heartbeat_media_device(UUID) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- PASSO 7: VIEW DO RELATÓRIO GERENCIAL
-- item_discount é DERIVADO (unit_price*qty − total_price): a tabela sale_items
-- não tem coluna de desconto — o desconto por item fica embutido em total_price.
-- security_invoker=true: a view respeita a RLS do chamador.
-- ═══════════════════════════════════════════════════════════════════════════
DROP VIEW IF EXISTS public.vw_report_sale_items;

CREATE VIEW public.vw_report_sale_items
WITH (security_invoker = true) AS
SELECT
  s.id               AS sale_id,
  s.organization_id  AS organization_id,
  s.store_branch_id  AS store_branch_id,
  s.created_at       AS sale_date,
  s.status           AS sale_status,
  s.payment_method   AS payment_method,
  s.user_id          AS operator_id,            -- FK system_users
  s.operator_name    AS operator_name,          -- snapshot no momento da venda
  s.customer_id      AS customer_id,
  s.customer_name    AS customer_name,
  s.total            AS sale_total,
  si.id              AS item_id,
  si.product_id      AS product_id,
  si.product_name    AS product_name,
  si.quantity        AS quantity,
  si.unit_price      AS unit_price,
  si.total_price     AS item_total,
  GREATEST(
    0,
    (COALESCE(si.unit_price, 0) * COALESCE(si.quantity, 0))
    - COALESCE(si.total_price, si.unit_price * si.quantity)
  )                  AS item_discount,          -- nunca negativo; NULL legado → 0
  p.category         AS category_name,
  su.commission_rate AS operator_commission_rate
FROM public.sales s
JOIN public.sale_items si ON si.sale_id = s.id
LEFT JOIN public.products p ON p.id = si.product_id
LEFT JOIN public.system_users su ON su.id = s.user_id;

COMMENT ON VIEW public.vw_report_sale_items IS
  'Base do Relatório Gerencial (Frente 5). item_discount derivado; operador via sales.user_id + commission_rate. security_invoker: respeita RLS do chamador.';

-- Índices de suporte ao relatório (período + filial)
CREATE INDEX IF NOT EXISTS idx_sales_branch_created_at
  ON public.sales (store_branch_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id
  ON public.sale_items (sale_id);

GRANT SELECT ON public.vw_report_sale_items TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO
-- ═══════════════════════════════════════════════════════════════════════════
-- SELECT tablename FROM pg_publication_tables
--   WHERE pubname = 'supabase_realtime' ORDER BY tablename;
-- SELECT table_name, column_name FROM information_schema.columns
--   WHERE table_schema = 'public'
--     AND table_name IN ('footer_messages','media_devices','printers')
--   ORDER BY table_name, ordinal_position;
-- SELECT column_name FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'vw_report_sale_items'
--   ORDER BY ordinal_position;
