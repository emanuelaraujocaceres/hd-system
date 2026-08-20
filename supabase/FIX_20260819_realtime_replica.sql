-- =====================================================================
-- FIX 2026-08-19 (v3): Realtime Publication + REPLICA IDENTITY
-- Garante que todas as 32 tables do frontend estão na publication
-- supabase_realtime E têm REPLICA IDENTITY FULL (payload completo)
-- PG14-compatible: ADD TABLE IF NOT EXISTS é PG15+, usar bloco DO para checar
-- =====================================================================

-- 1. ADICIONAR tables à publication supabase_realtime (idempotente via DO)
DO $$
DECLARE
  v_tables TEXT[] := ARRAY[
    'products', 'categories', 'customers', 'suppliers',
    'sales', 'sale_items', 'financial_transactions',
    'cash_sessions', 'stock_movements', 'store_branches',
    'system_users', 'system_settings', 'scanned_boletos',
    'credit_payments', 'nf_records', 'footer_messages',
    'media_devices', 'printers', 'tables', 'customer_sessions',
    'digital_menu_config', 'branch_themes', 'api_keys',
    'delivery_settings', 'delivery_neighborhoods', 'delivery_distance_rates',
    'delivery_orders', 'delivery_worker_earnings', 'module_visibility',
    'product_lots', 'product_recipes', 'stock_loss_log'
  ];
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

-- 2. REPLICA IDENTITY FULL em todas as 32 tables (payload completo p/ UPDATE/DELETE)
--    PG14: coluna é relreplident (não relreplidentity)
DO $$
DECLARE
  v_tables TEXT[] := ARRAY[
    'products', 'categories', 'customers', 'suppliers',
    'sales', 'sale_items', 'financial_transactions',
    'cash_sessions', 'stock_movements', 'store_branches',
    'system_users', 'system_settings', 'scanned_boletos',
    'credit_payments', 'nf_records', 'footer_messages',
    'media_devices', 'printers', 'tables', 'customer_sessions',
    'digital_menu_config', 'branch_themes', 'api_keys',
    'delivery_settings', 'delivery_neighborhoods', 'delivery_distance_rates',
    'delivery_orders', 'delivery_worker_earnings', 'module_visibility',
    'product_lots', 'product_recipes', 'stock_loss_log',
    'audit_log', 'webhook_events', 'profiles', 'sessions',
    'sync_queue', 'user_permissions'
  ];
  v_t TEXT;
  v_current CHAR;
BEGIN
  FOREACH v_t IN ARRAY v_tables LOOP
    SELECT relreplident INTO v_current
    FROM pg_class WHERE relname = v_t AND relnamespace = 'public'::regnamespace;

    IF v_current IS DISTINCT FROM 'f' THEN
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', v_t);
      RAISE NOTICE '✅ REPLICA IDENTITY FULL: %', v_t;
    ELSE
      RAISE NOTICE '⏭️  Já FULL: %', v_t;
    END IF;
  END LOOP;
END $$;

-- 3. VERIFICAÇÃO: todas devem aparecer com replica_identity = full
SELECT
  c.relname AS tabela,
  CASE c.relreplident
    WHEN 'd' THEN 'default'
    WHEN 'n' THEN 'nothing'
    WHEN 'f' THEN 'full'
    WHEN 'i' THEN 'index'
  END AS replica_identity,
  CASE WHEN pt.tablename IS NOT NULL THEN 'SIM' ELSE 'NÃO' END AS na_realtime
FROM pg_class c
LEFT JOIN pg_publication_tables pt
  ON pt.pubname = 'supabase_realtime' AND pt.tablename = c.relname
WHERE c.relnamespace = 'public'::regnamespace
  AND c.relkind = 'r'
  AND c.relname IN (
    'products', 'categories', 'customers', 'suppliers',
    'sales', 'sale_items', 'financial_transactions',
    'cash_sessions', 'stock_movements', 'store_branches',
    'system_users', 'system_settings', 'scanned_boletos',
    'credit_payments', 'nf_records', 'footer_messages',
    'media_devices', 'printers', 'tables', 'customer_sessions',
    'digital_menu_config', 'branch_themes', 'api_keys',
    'delivery_settings', 'delivery_neighborhoods', 'delivery_distance_rates',
    'delivery_orders', 'delivery_worker_earnings', 'module_visibility',
    'product_lots', 'product_recipes', 'stock_loss_log',
    'audit_log', 'webhook_events', 'profiles', 'sessions',
    'sync_queue', 'user_permissions'
  )
ORDER BY c.relname;