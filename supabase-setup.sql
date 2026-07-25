-- ============================================
-- HD-SYSTEM: Setup completo do Supabase
-- Cole este script no Supabase Dashboard > SQL Editor e clique em "Run"
-- Execute uma vez para criar/corrigir todas as tabelas e permissões
-- ============================================

-- ============================================
-- 0. ORGANIZATION DEFAULT
-- ============================================
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001',
  name TEXT NOT NULL DEFAULT 'HD-System',
  created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO organizations (id, name) VALUES ('00000000-0000-0000-0000-000000000001', 'HD-System')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 1. PRODUTOS
-- ============================================
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  organization_id UUID DEFAULT '00000000-0000-0000-0000-000000000001',
  store_branch_id TEXT,
  name TEXT NOT NULL,
  barcode TEXT,
  sku TEXT,
  category TEXT DEFAULT 'Geral',
  cost_price NUMERIC DEFAULT 0,
  sale_price NUMERIC DEFAULT 0,
  stock_quantity INTEGER DEFAULT 0,
  min_stock_quantity INTEGER DEFAULT 5,
  max_stock_quantity INTEGER DEFAULT 100,
  unit TEXT DEFAULT 'un',
  image_url TEXT,
  is_active BOOLEAN DEFAULT true,
  show_on_tv BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 2. CATEGORIAS
-- ============================================
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  organization_id UUID DEFAULT '00000000-0000-0000-0000-000000000001',
  store_branch_id TEXT,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6366f1',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 3. CLIENTES
-- ============================================
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  organization_id UUID DEFAULT '00000000-0000-0000-0000-000000000001',
  store_branch_id TEXT,
  name TEXT NOT NULL,
  cpf_cnpj TEXT,
  email TEXT,
  phone TEXT,
  credit_limit NUMERIC DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 4. FORNECEDORES
-- ============================================
CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  organization_id UUID DEFAULT '00000000-0000-0000-0000-000000000001',
  store_branch_id TEXT,
  corporate_name TEXT,
  trade_name TEXT,
  cnpj TEXT,
  contact_person TEXT,
  email TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 5. VENDAS
-- ============================================
CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  organization_id UUID DEFAULT '00000000-0000-0000-0000-000000000001',
  store_branch_id TEXT,
  user_id TEXT,
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
CREATE TABLE IF NOT EXISTS sale_items (
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
CREATE TABLE IF NOT EXISTS financial_transactions (
  id TEXT PRIMARY KEY,
  organization_id UUID DEFAULT '00000000-0000-0000-0000-000000000001',
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
CREATE TABLE IF NOT EXISTS cash_sessions (
  id TEXT PRIMARY KEY,
  organization_id UUID DEFAULT '00000000-0000-0000-0000-000000000001',
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
CREATE TABLE IF NOT EXISTS stock_movements (
  id TEXT PRIMARY KEY,
  organization_id UUID DEFAULT '00000000-0000-0000-0000-000000000001',
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
CREATE TABLE IF NOT EXISTS store_branches (
  id TEXT PRIMARY KEY,
  organization_id UUID DEFAULT '00000000-0000-0000-0000-000000000001',
  name TEXT NOT NULL,
  code TEXT,
  cnpj TEXT,
  city TEXT,
  state TEXT,
  address TEXT,
  phone TEXT,
  is_headquarters BOOLEAN DEFAULT false,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 11. USUÁRIOS DO SISTEMA
-- ============================================
CREATE TABLE IF NOT EXISTS system_users (
  id TEXT PRIMARY KEY,
  organization_id UUID DEFAULT '00000000-0000-0000-0000-000000000001',
  store_branch_id TEXT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
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
CREATE TABLE IF NOT EXISTS system_settings (
  id TEXT PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001',
  organization_id UUID DEFAULT '00000000-0000-0000-0000-000000000001',
  settings JSONB,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- PERMISSÕES: GRANT para service_role e anon
-- ============================================

-- service_role precisa de acesso TOTAL (bypass RLS)
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- anon precisa de SELECT + INSERT + UPDATE + DELETE (app usa anon key via browser)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon;

-- authenticated (se usar Supabase Auth)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- ============================================
-- RLS: Desabilitar ou criar policies abertas
-- Como o app usa a service_role key no servidor e anon no browser,
-- a abordagem mais simples é DESABILITAR RLS para service_role.
-- Mas para anon, criar policies permissivas.
-- ============================================

-- Desabilitar RLS em todas as tabelas (service_role bypassa, e anon é controlado pelas tabelas)
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
ALTER TABLE organizations DISABLE ROW LEVEL SECURITY;

-- ============================================
-- REALTIME: Habilitar publicação para todas as tabelas
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
-- VERIFICAÇÃO FINAL
-- ============================================
SELECT 
  tablename,
  rowsecurity as rls_enabled,
  pg_size_pretty(pg_total_relation_size('public.' || tablename)) as tamanho
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;
