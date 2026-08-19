-- ============================================================
-- FIX de Segurança: stock_change_log RLS + anon GRANTs
-- Execute no Supabase SQL Editor
-- ============================================================

-- 1. HABILITAR RLS em stock_change_log (estava DESABILITADO)
ALTER TABLE public.stock_change_log ENABLE ROW LEVEL SECURITY;

-- 2. Criar policies para stock_change_log
DROP POLICY IF EXISTS "stock_change_log_superadmin" ON public.stock_change_log;
CREATE POLICY "stock_change_log_superadmin" ON public.stock_change_log
  FOR ALL USING (is_superadmin()) WITH CHECK (is_superadmin());

DROP POLICY IF EXISTS "stock_change_log_org_branch" ON public.stock_change_log;
CREATE POLICY "stock_change_log_org_branch" ON public.stock_change_log
  FOR ALL USING (
    (organization_id = get_user_org_id()) AND (store_branch_id = get_user_branch_id())
  ) WITH CHECK (
    (organization_id = get_user_org_id()) AND (store_branch_id = get_user_branch_id())
  );

-- 3. REVOGAR GRANTs excessivos de anon em tabelas sensíveis
-- (anon só deve ter acesso às tabelas do cardápio público)
REVOKE ALL ON public.cash_sessions FROM anon;
REVOKE ALL ON public.financial_transactions FROM anon;
REVOKE ALL ON public.customers FROM anon;
REVOKE ALL ON public.organizations FROM anon;
REVOKE ALL ON public.company_settings FROM anon;
REVOKE ALL ON public.credit_payments FROM anon;
REVOKE ALL ON public.nf_records FROM anon;
REVOKE ALL ON public.movimentacoes_falhas FROM anon;
REVOKE ALL ON public.ai_insights FROM anon;
REVOKE ALL ON public.profiles FROM anon;

-- Manter apenas SELECT para anon nas tabelas do cardápio
GRANT SELECT ON public.store_branches TO anon;
GRANT SELECT ON public.products TO anon;
GRANT SELECT ON public.categories TO anon;
GRANT SELECT ON public.tables TO anon;
GRANT SELECT, INSERT ON public.customer_sessions TO anon;
GRANT SELECT, INSERT ON public.sales TO anon;
GRANT SELECT, INSERT ON public.sale_items TO anon;
GRANT SELECT ON public.digital_menu_config TO anon;

-- 4. Verificar REPLICA IDENTITY (correção da query que errou)
SELECT
  c.relname AS table_name,
  CASE c.relreplident
    WHEN 'd' THEN 'default'
    WHEN 'n' THEN 'nothing'
    WHEN 'f' THEN 'full'
    WHEN 'i' THEN 'index'
  END AS replica_identity
FROM pg_class c
WHERE c.relnamespace = 'public'::regnamespace
  AND c.relkind = 'r'
ORDER BY c.relname;

-- 5. Fix: garantir REPLICA IDENTITY FULL nas tabelas Realtime que precisam
DO $$
DECLARE
  tbl TEXT;
  must_full TEXT[] := ARRAY[
    'products', 'categories', 'customers', 'suppliers', 'sales', 'sale_items',
    'financial_transactions', 'cash_sessions', 'stock_movements', 'store_branches',
    'system_users', 'system_settings', 'printers', 'tables', 'customer_sessions',
    'digital_menu_config', 'branch_themes', 'api_keys', 'footer_messages',
    'media_devices', 'module_visibility', 'scanned_boletos', 'credit_payments',
    'nf_records', 'delivery_settings', 'delivery_neighborhoods',
    'delivery_distance_rates', 'delivery_orders', 'product_lots', 'product_recipes',
    'stock_loss_log', 'delivery_worker_earnings', 'audit_log', 'webhook_events',
    'stock_change_log'
  ];
BEGIN
  FOREACH tbl IN ARRAY must_full LOOP
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', tbl);
  END LOOP;
  RAISE NOTICE '✅ REPLICA IDENTITY FULL applied to all Realtime tables';
END $$;

-- 6. Verificação final
DO $$ BEGIN
  RAISE NOTICE '✅ Security fix applied: stock_change_log RLS enabled + anon GRANTs revoked';
END $$;
