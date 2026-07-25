-- ============================================
-- HD-SYSTEM: Adicionar colunas faltantes
-- Execute no Supabase Dashboard > SQL Editor
-- ============================================

-- Adicionar store_branch_id onde não existe
ALTER TABLE categories ADD COLUMN IF NOT EXISTS store_branch_id TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS store_branch_id TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS store_branch_id TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS store_branch_id TEXT;
ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS store_branch_id TEXT;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS store_branch_id TEXT;
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS store_branch_id TEXT;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS store_branch_id TEXT;
ALTER TABLE system_users ADD COLUMN IF NOT EXISTS store_branch_id TEXT;

-- Adicionar coluna organization_id onde não existe (formato TEXT)
ALTER TABLE categories ADD COLUMN IF NOT EXISTS organization_id TEXT DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS organization_id TEXT DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS organization_id TEXT DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE sales ADD COLUMN IF NOT EXISTS organization_id TEXT DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS organization_id TEXT DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS organization_id TEXT DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS organization_id TEXT DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE system_users ADD COLUMN IF NOT EXISTS organization_id TEXT DEFAULT '00000000-0000-0000-0000-000000000001';

-- Adicionar coluna product_name em sale_items para melhor qualidade de dados
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS product_name TEXT;

-- Adicionar colunas auxiliares que podem estar faltando
ALTER TABLE products ADD COLUMN IF NOT EXISTS sku TEXT DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS max_stock_quantity INTEGER DEFAULT 100;
ALTER TABLE products ADD COLUMN IF NOT EXISTS show_on_tv BOOLEAN DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE customers ADD COLUMN IF NOT EXISTS credit_limit NUMERIC DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS corporate_name TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS trade_name TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS contact_person TEXT;

ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS notes TEXT;

-- Garantir REPLICA IDENTITY FULL para Realtime funcionar corretamente
ALTER TABLE products REPLICA IDENTITY FULL;
ALTER TABLE categories REPLICA IDENTITY FULL;
ALTER TABLE customers REPLICA IDENTITY FULL;
ALTER TABLE suppliers REPLICA IDENTITY FULL;
ALTER TABLE sales REPLICA IDENTITY FULL;
ALTER TABLE sale_items REPLICA IDENTITY FULL;
ALTER TABLE financial_transactions REPLICA IDENTITY FULL;
ALTER TABLE cash_sessions REPLICA IDENTITY FULL;
ALTER TABLE stock_movements REPLICA IDENTITY FULL;
ALTER TABLE store_branches REPLICA IDENTITY FULL;
ALTER TABLE system_users REPLICA IDENTITY FULL;

-- Garantir permissões
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- Garantir que as tabelas estão na publicação Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS products;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS categories;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS customers;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS suppliers;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS sales;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS sale_items;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS financial_transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS cash_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS stock_movements;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS store_branches;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS system_users;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS system_settings;

-- ============================================
-- VERIFICAÇÃO
-- ============================================
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND column_name IN ('store_branch_id', 'organization_id')
ORDER BY table_name, column_name;
