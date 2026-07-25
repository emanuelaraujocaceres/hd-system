-- ============================================
-- HD-SYSTEM: Recriar tabelas com schema correto
-- Execute no Supabase Dashboard > SQL Editor
-- IMPORTANTE: Isso vai DROPAR e recriar todas as tabelas
-- ============================================

-- Desabilitar publicação realtime das tabelas antigas (ignorar erros)
DO $$ BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE products; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE categories; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE customers; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE suppliers; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE sales; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE sale_items; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE financial_transactions; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE cash_sessions; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE stock_movements; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE store_branches; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE system_users; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE system_settings; EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Dropar tabelas antigas (ordem por dependências)
DROP TABLE IF EXISTS sale_items CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS categories CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS suppliers CASCADE;
DROP TABLE IF EXISTS sales CASCADE;
DROP TABLE IF EXISTS financial_transactions CASCADE;
DROP TABLE IF EXISTS cash_sessions CASCADE;
DROP TABLE IF EXISTS stock_movements CASCADE;
DROP TABLE IF EXISTS store_branches CASCADE;
DROP TABLE IF EXISTS system_users CASCADE;
DROP TABLE IF EXISTS system_settings CASCADE;

-- ============================================
-- 1. PRODUTOS (id TEXT, não UUID)
-- ============================================
CREATE TABLE products (
  id TEXT PRIMARY KEY,
  organization_id TEXT DEFAULT '00000000-0000-0000-0000-000000000001',
  store_branch_id TEXT,
  name TEXT NOT NULL,
  sku TEXT DEFAULT '',
  barcode TEXT DEFAULT '',
  category TEXT DEFAULT 'Geral',
  cost_price NUMERIC DEFAULT 0,
  sale_price NUMERIC DEFAULT 0,
  stock_quantity INTEGER DEFAULT 0,
  min_stock_quantity INTEGER DEFAULT 5,
  max_stock_quantity INTEGER DEFAULT 100,
  unit TEXT DEFAULT 'un',
  image_url TEXT DEFAULT '',
  is_active BOOLEAN DEFAULT true,
  show_on_tv BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 2. CATEGORIAS
-- ============================================
CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  organization_id TEXT DEFAULT '00000000-0000-0000-0000-000000000001',
  store_branch_id TEXT,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6366f1',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 3. CLIENTES
-- ============================================
CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  organization_id TEXT DEFAULT '00000000-0000-0000-0000-000000000001',
  store_branch_id TEXT,
  name TEXT NOT NULL,
  cpf_cnpj TEXT DEFAULT '',
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  credit_limit NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 4. FORNECEDORES
-- ============================================
CREATE TABLE suppliers (
  id TEXT PRIMARY KEY,
  organization_id TEXT DEFAULT '00000000-0000-0000-0000-000000000001',
  store_branch_id TEXT,
  corporate_name TEXT DEFAULT '',
  trade_name TEXT DEFAULT '',
  cnpj TEXT DEFAULT '',
  contact_person TEXT DEFAULT '',
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 5. VENDAS
-- ============================================
CREATE TABLE sales (
  id TEXT PRIMARY KEY,
  organization_id TEXT DEFAULT '00000000-0000-0000-0000-000000000001',
  store_branch_id TEXT DEFAULT '',
  user_id TEXT DEFAULT '',
  customer_id TEXT,
  code TEXT,
  subtotal NUMERIC DEFAULT 0,
  discount NUMERIC DEFAULT 0,
  total NUMERIC DEFAULT 0,
  payment_method TEXT DEFAULT 'cash',
  status TEXT DEFAULT 'completed',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 6. ITENS DA VENDA
-- ============================================
CREATE TABLE sale_items (
  id TEXT PRIMARY KEY,
  sale_id TEXT REFERENCES sales(id) ON DELETE CASCADE,
  product_id TEXT,
  quantity INTEGER DEFAULT 1,
  unit_price NUMERIC DEFAULT 0,
  total_price NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 7. TRANSAÇÕES FINANCEIRAS
-- ============================================
CREATE TABLE financial_transactions (
  id TEXT PRIMARY KEY,
  organization_id TEXT DEFAULT '00000000-0000-0000-0000-000000000001',
  store_branch_id TEXT,
  type TEXT DEFAULT 'payable',
  description TEXT,
  amount NUMERIC DEFAULT 0,
  category TEXT,
  due_date TEXT,
  payment_date TEXT,
  status TEXT DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 8. SESSÕES CAIXA
-- ============================================
CREATE TABLE cash_sessions (
  id TEXT PRIMARY KEY,
  organization_id TEXT DEFAULT '00000000-0000-0000-0000-000000000001',
  store_branch_id TEXT,
  user_id TEXT,
  opening_balance NUMERIC DEFAULT 0,
  closing_balance NUMERIC,
  expected_balance NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'open',
  opened_at TIMESTAMPTZ DEFAULT now(),
  closed_at TIMESTAMPTZ
);

-- ============================================
-- 9. MOVIMENTAÇÕES DE ESTOQUE
-- ============================================
CREATE TABLE stock_movements (
  id TEXT PRIMARY KEY,
  organization_id TEXT DEFAULT '00000000-0000-0000-0000-000000000001',
  store_branch_id TEXT,
  product_id TEXT,
  product_name TEXT,
  type TEXT,
  quantity INTEGER DEFAULT 0,
  previous_stock INTEGER DEFAULT 0,
  new_stock INTEGER DEFAULT 0,
  reason TEXT,
  operator_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 10. FILIAIS
-- ============================================
CREATE TABLE store_branches (
  id TEXT PRIMARY KEY,
  organization_id TEXT DEFAULT '00000000-0000-0000-0000-000000000001',
  name TEXT NOT NULL,
  code TEXT DEFAULT '',
  cnpj TEXT DEFAULT '',
  city TEXT DEFAULT '',
  state TEXT DEFAULT '',
  address TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  is_headquarters BOOLEAN DEFAULT false,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 11. USUÁRIOS DO SISTEMA
-- ============================================
CREATE TABLE system_users (
  id TEXT PRIMARY KEY,
  organization_id TEXT DEFAULT '00000000-0000-0000-0000-000000000001',
  store_branch_id TEXT DEFAULT '',
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT DEFAULT 'collaborator',
  permissions JSONB DEFAULT '{"pdv":true,"inventory":true,"crm":true,"finance":true,"dashboard":true,"settings":true}',
  avatar_url TEXT,
  active BOOLEAN DEFAULT true,
  password TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 12. CONFIGURAÇÕES DO SISTEMA
-- ============================================
CREATE TABLE system_settings (
  id TEXT PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001',
  organization_id TEXT DEFAULT '00000000-0000-0000-0000-000000000001',
  settings JSONB,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- ORGANIZATIONS (manter)
-- ============================================
-- organizations já existe e está OK

-- ============================================
-- PERMISSÕES
-- ============================================
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Desabilitar RLS
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE customers DISABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers DISABLE ROW LEVEL SECURITY;
ALTER TABLE sales DISABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE financial_transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE cash_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements DISABLE ROW LEVEL SECURITY;
ALTER TABLE store_branches DISABLE ROW LEVEL SECURITY;
ALTER TABLE system_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings DISABLE ROW LEVEL SECURITY;

-- ============================================
-- REALTIME
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE products;
ALTER PUBLICATION supabase_realtime ADD TABLE categories;
ALTER PUBLICATION supabase_realtime ADD TABLE customers;
ALTER PUBLICATION supabase_realtime ADD TABLE suppliers;
ALTER PUBLICATION supabase_realtime ADD TABLE sales;
ALTER PUBLICATION supabase_realtime ADD TABLE sale_items;
ALTER PUBLICATION supabase_realtime ADD TABLE financial_transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE cash_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE stock_movements;
ALTER PUBLICATION supabase_realtime ADD TABLE store_branches;
ALTER PUBLICATION supabase_realtime ADD TABLE system_users;
ALTER TABLE system_settings REPLICA IDENTITY FULL;

-- ============================================
-- VERIFICAÇÃO
-- ============================================
SELECT
  tablename,
  pg_size_pretty(pg_total_relation_size('public.' || tablename)) as tamanho
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('products','categories','customers','suppliers','sales','sale_items','financial_transactions','cash_sessions','stock_movements','store_branches','system_users','system_settings','organizations')
ORDER BY tablename;
