-- Mostrar TODAS as policies com seus USING/CHECK statements
SELECT 
  schemaname,
  tablename,
  policyname,
  cmd,
  using_expr,
  check_expr
FROM pg_policies 
WHERE schemaname = 'public'
  AND tablename IN (
    'products', 'categories', 'customers', 'suppliers',
    'sales', 'sale_items', 'financial_transactions',
    'cash_sessions', 'stock_movements', 'store_branches',
    'profiles', 'organizations', 'system_users', 'system_settings'
  )
ORDER BY tablename, cmd, policyname;
