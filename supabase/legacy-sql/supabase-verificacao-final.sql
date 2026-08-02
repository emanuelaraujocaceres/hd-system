-- ============================================
-- HD-SYSTEM: Verificação e Correção Final
-- Execute no Supabase Dashboard > SQL Editor
-- ============================================

-- 1️⃣ VERIFICAR se cash_sessions tem colunas de detalhamento
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'cash_sessions'
  AND column_name IN ('operator_name','total_sales_cash','total_sales_pix',
                       'total_sales_card','total_sales_credit_account',
                       'suprimentos','sangrias')
ORDER BY column_name;

-- Adiciona colunas faltantes (ignora se já existirem)
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS operator_name TEXT;
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS total_sales_cash NUMERIC DEFAULT 0;
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS total_sales_pix NUMERIC DEFAULT 0;
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS total_sales_card NUMERIC DEFAULT 0;
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS total_sales_credit_account NUMERIC DEFAULT 0;
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS suprimentos NUMERIC DEFAULT 0;
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS sangrias NUMERIC DEFAULT 0;

-- 2️⃣ GARANTIR REPLICA IDENTITY FULL (necessário para Realtime DELETE)
DO $$
BEGIN
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
    ALTER TABLE system_settings REPLICA IDENTITY FULL;
END $$;

-- 3️⃣ GARANTIR que todas as 12 tabelas estão na publicação Realtime
DO $$
BEGIN
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE products; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE categories; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE customers; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE suppliers; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE sales; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE sale_items; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE financial_transactions; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE cash_sessions; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE stock_movements; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE store_branches; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE system_users; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE system_settings; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- 4️⃣ VERIFICAR resultado final
SELECT 
  c.relname as tabela,
  CASE c.relreplident
    WHEN 'f' THEN '✅ FULL'
    ELSE '❌ ' || CASE c.relreplident
      WHEN 'd' THEN 'default'
      WHEN 'n' THEN 'nothing'
      WHEN 'i' THEN 'index'
    END
  END as replica_identity
FROM pg_class c
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public' 
  AND c.relkind = 'r'
  AND c.relname IN ('products','categories','customers','suppliers','sales',
                    'sale_items','financial_transactions','cash_sessions',
                    'stock_movements','store_branches','system_users','system_settings')
ORDER BY c.relname;

SELECT '✅ VERIFICAÇÃO CONCLUÍDA — todas as 12 tabelas configuradas para Realtime' as resultado;
