-- FIX PERMISSOES SUPABASE - Execute no SQL Editor do Dashboard

-- 1. GRANT para service_role
GRANT ALL ON products TO service_role;
GRANT ALL ON categories TO service_role;
GRANT ALL ON customers TO service_role;
GRANT ALL ON suppliers TO service_role;
GRANT ALL ON sales TO service_role;
GRANT ALL ON sale_items TO service_role;
GRANT ALL ON financial_transactions TO service_role;
GRANT ALL ON cash_sessions TO service_role;
GRANT ALL ON stock_movements TO service_role;
GRANT ALL ON store_branches TO service_role;
GRANT ALL ON system_users TO service_role;
GRANT ALL ON system_settings TO service_role;
GRANT ALL ON organizations TO service_role;

-- 2. GRANT para anon (browser)
GRANT SELECT, INSERT, UPDATE, DELETE ON products TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON categories TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON customers TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON suppliers TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON sales TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON sale_items TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON financial_transactions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON cash_sessions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON stock_movements TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON store_branches TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON system_users TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON system_settings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON organizations TO anon;

-- 3. Sequencias
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon;

-- 4. Se a tabela system_users nao tem coluna password, adicionar:
ALTER TABLE system_users ADD COLUMN IF NOT EXISTS password TEXT;

-- 5. Verificar que tudo esta OK
SELECT
  grantee,
  table_name,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('anon', 'service_role', 'authenticated')
ORDER BY table_name, grantee, privilege_type;
