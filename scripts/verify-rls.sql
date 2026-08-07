-- Verificação RLS e policies aplicadas
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT tablename FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename IN (
      'products', 'categories', 'customers', 'suppliers',
      'sales', 'sale_items', 'financial_transactions',
      'cash_sessions', 'stock_movements', 'store_branches',
      'system_users', 'system_settings',
      'scanned_boletos', 'credit_payments', 'nf_records',
      'footer_messages', 'media_devices', 'printers',
      'tables', 'customer_sessions', 'digital_menu_config',
      'branch_themes', 'api_keys', 'profiles', 'organizations'
    )
  LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=r.tablename AND rowsecurity=true) THEN
      RAISE NOTICE '✅ %: RLS OK', r.tablename;
    ELSE
      RAISE NOTICE '❌ %: sem RLS', r.tablename;
    END IF;
  END LOOP;
END $$;

-- Verificar policies criadas
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename IN (
      'products', 'categories', 'customers', 'suppliers',
      'sales', 'sale_items', 'profiles', 'store_branches', 'organizations'
    )
  LOOP
    EXECUTE format('SELECT count(*) FROM pg_policies WHERE tablename = %L', r.tablename);
    -- Não posso usar EXECUTE assim, vou fazer de outra forma
  END LOOP;
END $$;

-- Query simples para mostrar todas as policies
SELECT 
  schemaname,
  tablename,
  policyname,
  cmd
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
