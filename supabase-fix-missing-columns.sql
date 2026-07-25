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

-- Adicionar colunas de detalhamento do caixa em cash_sessions
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS operator_name TEXT;
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS total_sales_cash NUMERIC DEFAULT 0;
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS total_sales_pix NUMERIC DEFAULT 0;
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS total_sales_card NUMERIC DEFAULT 0;
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS total_sales_credit_account NUMERIC DEFAULT 0;
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS suprimentos NUMERIC DEFAULT 0;
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS sangrias NUMERIC DEFAULT 0;

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
DO $$
BEGIN
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE products; EXCEPTION WHEN duplicate_object THEN END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE categories; EXCEPTION WHEN duplicate_object THEN END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE customers; EXCEPTION WHEN duplicate_object THEN END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE suppliers; EXCEPTION WHEN duplicate_object THEN END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE sales; EXCEPTION WHEN duplicate_object THEN END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE sale_items; EXCEPTION WHEN duplicate_object THEN END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE financial_transactions; EXCEPTION WHEN duplicate_object THEN END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE cash_sessions; EXCEPTION WHEN duplicate_object THEN END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE stock_movements; EXCEPTION WHEN duplicate_object THEN END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE store_branches; EXCEPTION WHEN duplicate_object THEN END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE system_users; EXCEPTION WHEN duplicate_object THEN END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE system_settings; EXCEPTION WHEN duplicate_object THEN END;
END $$;

-- ============================================
-- VERIFICAÇÃO
-- ============================================
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND column_name IN ('store_branch_id', 'organization_id')
ORDER BY table_name, column_name;
