-- ==============================================================================
-- 20260902_add_sales_deleted_at.sql
-- Exclusão sincronizada de vendas (tombstone em `sales`).
--
-- PROBLEMA: o cancelamento/remoção de venda fazia DELETE físico na tabela sales
-- (syncService.deleteRow). Em sincronização multi-dispositivo, um device que
-- ainda tinha a venda em cache local re-subia a venda na hidratação
-- (mergeBy re-envia local-only records), fazendo a venda "voltar" para todos.
-- Não existia "tombstone" (marcação de exclusão) propagado entre devices.
--
-- SOLUÇÃO: coluna `deleted_at TIMESTAMPTZ` em sales. Ao cancelar/excluir uma
-- venda, o frontend passa a fazer SOFT-DELETE (upsert setando deleted_at=now())
-- em vez de DELETE físico. A hidratação e o relatório ignoram vendas com
-- deleted_at <> NULL, então a venda cancelada NUNCA volta, independente de qual
-- dispositivo hidratar.
--
-- 1. Cria coluna deleted_at (idempotente).
-- 2. Backfill do LEGADO: vendas com status='cancelled' sem deleted_at ganham
--    deleted_at=now() — limpa cancelamentos antigos que também ressuscitavam.
-- 3. Recria a view vw_report_sale_items filtrando deleted_at IS NULL
--    (relatório não conta vendas apagadas, nem como canceladas).
-- 4. Garante REPLICA IDENTITY FULL (payload completo de UPDATE/DELETE no
--    Realtime — regra 2 do AGENTS.md).
-- ==============================================================================

-- 0. Backup prévio (rollback / auditoria) — mesmo padrão das demais migrations
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema = 'public' AND table_name = 'sales_deleted_at_backup_20260902') THEN
    CREATE TABLE public.sales_deleted_at_backup_20260902 AS
    SELECT id, status, deleted_at, created_at
    FROM public.sales;
  END IF;
END $$;

-- 1. Coluna deleted_at (TIMESTAMPTZ) — soft delete sincronizado
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 2. Índice parcial para vendas não-deletadas (queries de vendas ativas)
CREATE INDEX IF NOT EXISTS idx_sales_deleted_at
  ON public.sales (deleted_at)
  WHERE deleted_at IS NULL;

-- 3. Backfill do LEGADO: vendas canceladas sem tombstone passam a ser tratadas
--    como apagadas (impede que cancelamentos antigos voltem após re-hidratação).
UPDATE public.sales
SET deleted_at = COALESCE(deleted_at, now())
WHERE status = 'cancelled'
  AND deleted_at IS NULL;

-- 4. Recria a view do Relatório Gerencial para NÃO contar vendas apagadas
--    (deleted_at <> NULL), nem como canceladas. Mantém security_invoker e as
--    demais colunas idênticas à definição original (20260815_frentes_tv_impressora.sql).
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
LEFT JOIN public.system_users su ON su.id = s.user_id
WHERE s.deleted_at IS NULL;                     -- NÃO conta vendas apagadas

COMMENT ON VIEW public.vw_report_sale_items IS
  'Base do Relatório Gerencial (Frente 5). item_discount derivado; operador via sales.user_id + commission_rate. security_invoker: respeita RLS do chamador. Filtra sales.deleted_at IS NULL (vendas apagadas não contabilizadas).';

GRANT SELECT ON public.vw_report_sale_items TO authenticated;

-- 5. REPLICA IDENTITY FULL (payload completo de UPDATE/DELETE no Realtime —
--    regra 2 do AGENTS.md: a tabela já está na publicação supabase_realtime).
ALTER TABLE public.sales REPLICA IDENTITY FULL;

-- 6. Verificação das mudanças aplicadas
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'sales'
  AND column_name = 'deleted_at';

SELECT count(*) AS vendas_canceladas_marcadas
FROM public.sales
WHERE status = 'cancelled' AND deleted_at IS NOT NULL;
