-- ==============================================================================
-- HD-SYSTEM: SETUP COMPLETO PARA SINCRONIZAÇÃO EM TEMPO REAL
-- Execute este script no SQL Editor do seu Dashboard Supabase
-- https://app.supabase.com > seu projeto > SQL Editor > New Query
-- ==============================================================================

-- 1. CRIAR ORGANIZAÇÃO PADRÃO (empresa dona do sistema)
-- ==========================================================================
INSERT INTO public.organizations (id, name, trade_name, plan)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'HD-System ERP',
  'HD-System',
  'pro'
)
ON CONFLICT (id) DO NOTHING;

-- 2. ADICIONAR COLUNA store_branch_id NAS TABELAS PRINCIPAIS
-- ==========================================================================
-- Products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS store_branch_id VARCHAR(50);
CREATE INDEX IF NOT EXISTS idx_products_branch ON public.products(store_branch_id);

-- Categories
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS store_branch_id VARCHAR(50);
CREATE INDEX IF NOT EXISTS idx_categories_branch ON public.categories(store_branch_id);

-- Customers
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS store_branch_id VARCHAR(50);
CREATE INDEX IF NOT EXISTS idx_customers_branch ON public.customers(store_branch_id);

-- Suppliers
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS store_branch_id VARCHAR(50);
CREATE INDEX IF NOT EXISTS idx_suppliers_branch ON public.suppliers(store_branch_id);

-- Sales
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS store_branch_id VARCHAR(50);
CREATE INDEX IF NOT EXISTS idx_sales_branch ON public.sales(store_branch_id);

-- Financial Transactions
ALTER TABLE public.financial_transactions ADD COLUMN IF NOT EXISTS store_branch_id VARCHAR(50);
CREATE INDEX IF NOT EXISTS idx_financial_branch ON public.financial_transactions(store_branch_id);

-- Cash Sessions
ALTER TABLE public.cash_sessions ADD COLUMN IF NOT EXISTS store_branch_id VARCHAR(50);
CREATE INDEX IF NOT EXISTS idx_cash_sessions_branch ON public.cash_sessions(store_branch_id);

-- 3. CRIAR TABELA DE LOJAS/FILIAIS (se não existir)
-- ==========================================================================
CREATE TABLE IF NOT EXISTS public.store_branches (
    id VARCHAR(50) PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000001',
    name VARCHAR(255) NOT NULL,
    code VARCHAR(20) NOT NULL,
    cnpj VARCHAR(20),
    city VARCHAR(100),
    state VARCHAR(10),
    address TEXT,
    phone VARCHAR(30),
    is_headquarters BOOLEAN DEFAULT FALSE,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE public.store_branches ENABLE ROW LEVEL SECURITY;

-- 4. CRIAR TABELA DE MOVIMENTOS DE ESTOQUE (se não existir)
-- ==========================================================================
CREATE TABLE IF NOT EXISTS public.stock_movements (
    id VARCHAR(100) PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000001',
    store_branch_id VARCHAR(50),
    product_id VARCHAR(100) NOT NULL,
    product_name VARCHAR(255),
    type VARCHAR(20) NOT NULL,
    quantity INTEGER NOT NULL,
    previous_stock INTEGER,
    new_stock INTEGER,
    reason TEXT,
    operator_name VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

-- 5. CRIAR TABELA DE CONFIGURAÇÕES DO SISTEMA (se não existir)
-- ==========================================================================
CREATE TABLE IF NOT EXISTS public.system_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE UNIQUE DEFAULT '00000000-0000-0000-0000-000000000001',
    settings JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- 6. CRIAR TABELA DE USUÁRIOS DO SISTEMA (lista de usuários, não auth)
-- ==========================================================================
CREATE TABLE IF NOT EXISTS public.system_users (
    id VARCHAR(100) PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000001',
    store_branch_id VARCHAR(50),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'collaborator',
    permissions JSONB DEFAULT '{}',
    avatar_url TEXT,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE public.system_users ENABLE ROW LEVEL SECURITY;

-- 7. REMOVER RLS ANTERIOR (restritivo) E CRIAR NOVO RLS PERMISSIVO
-- ==========================================================================
-- Drop old restrictive policies
DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN SELECT unnest(ARRAY[
        'organizations', 'profiles', 'categories', 'products', 
        'customers', 'suppliers', 'sales', 'sale_items',
        'financial_transactions', 'cash_sessions',
        'store_branches', 'stock_movements', 'system_settings', 'system_users'
    ])
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS "%s" ON public.%I', 'Acesso isolado por organizacao para ' || tbl, tbl);
        -- Drop any other existing policies
        EXECUTE (
            SELECT string_agg(format('DROP POLICY IF EXISTS "%s" ON public.%I', polname, tablename), '; ')
            FROM pg_policy
            JOIN pg_class ON pg_class.oid = polrelid
            JOIN pg_namespace ON pg_namespace.oid = relnamespace
            WHERE pg_namespace.nspname = 'public' AND tablename = tbl
        );
    END LOOP;
END $$;

-- 8. CRIAR RLS POLICIES PERMISSIVAS (anon pode ler/escrever tudo)
-- ==========================================================================

-- Organizations: read all
CREATE POLICY "anon_read_organizations" ON public.organizations
    FOR SELECT USING (true);

CREATE POLICY "anon_insert_organizations" ON public.organizations
    FOR INSERT WITH CHECK (true);

CREATE POLICY "anon_update_organizations" ON public.organizations
    FOR UPDATE USING (true);

-- Store Branches
CREATE POLICY "anon_all_store_branches" ON public.store_branches
    FOR ALL USING (true) WITH CHECK (true);

-- Categories
CREATE POLICY "anon_all_categories" ON public.categories
    FOR ALL USING (true) WITH CHECK (true);

-- Products
CREATE POLICY "anon_all_products" ON public.products
    FOR ALL USING (true) WITH CHECK (true);

-- Customers
CREATE POLICY "anon_all_customers" ON public.customers
    FOR ALL USING (true) WITH CHECK (true);

-- Suppliers
CREATE POLICY "anon_all_suppliers" ON public.suppliers
    FOR ALL USING (true) WITH CHECK (true);

-- Sales
CREATE POLICY "anon_all_sales" ON public.sales
    FOR ALL USING (true) WITH CHECK (true);

-- Sale Items
CREATE POLICY "anon_all_sale_items" ON public.sale_items
    FOR ALL USING (true) WITH CHECK (true);

-- Financial Transactions
CREATE POLICY "anon_all_financial_transactions" ON public.financial_transactions
    FOR ALL USING (true) WITH CHECK (true);

-- Cash Sessions
CREATE POLICY "anon_all_cash_sessions" ON public.cash_sessions
    FOR ALL USING (true) WITH CHECK (true);

-- Stock Movements
CREATE POLICY "anon_all_stock_movements" ON public.stock_movements
    FOR ALL USING (true) WITH CHECK (true);

-- System Settings
CREATE POLICY "anon_all_system_settings" ON public.system_settings
    FOR ALL USING (true) WITH CHECK (true);

-- System Users
CREATE POLICY "anon_all_system_users" ON public.system_users
    FOR ALL USING (true) WITH CHECK (true);

-- Profiles (keep auth-aware)
CREATE POLICY "anon_all_profiles" ON public.profiles
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "anon_all_company_settings" ON public.company_settings
    FOR ALL USING (true) WITH CHECK (true);

-- 9. HABILITAR REALTIME NAS TABELAS PRINCIPAIS
-- ==========================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
ALTER PUBLICATION supabase_realtime ADD TABLE public.categories;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sales;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sale_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.customers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.suppliers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.financial_transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cash_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.stock_movements;
ALTER PUBLICATION supabase_realtime ADD TABLE public.store_branches;
ALTER PUBLICATION supabase_realtime ADD TABLE public.system_users;
ALTER PUBLICATION supabase_realtime ADD TABLE public.system_settings;

-- 10. CRIAR ÍNDICES PARA PERFORMANCE
-- ==========================================================================
CREATE INDEX IF NOT EXISTS idx_stock_movements_branch ON public.stock_movements(store_branch_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON public.stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_system_users_branch ON public.system_users(store_branch_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON public.sale_items(sale_id);

-- 11. GRANT PERMISSÕES PARA O ROLE ANON
-- ==========================================================================
GRANT USAGE ON SCHEMA public TO anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon;

-- ==============================================================================
-- PRONTO! Agora o HD-System pode sincronizar dados em tempo real.
-- ==============================================================================
