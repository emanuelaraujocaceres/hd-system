-- ==============================================================================
-- SCHEMA SQL COMPLETO - HD-SYSTEM ERP / NEXUS SAAS PARA SUPABASE
-- Execute este script no SQL Editor do seu Dashboard Supabase (https://app.supabase.com)
-- ==============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------------------------
-- 1. ESTRUTURA MULTI-TENANT & USUÁRIOS
-- ------------------------------------------------------------------------------

-- Tabela de Organizações/Empresas (Tenants)
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    trade_name VARCHAR(255),
    cnpj VARCHAR(20) UNIQUE,
    phone VARCHAR(30),
    email VARCHAR(255),
    plan VARCHAR(50) DEFAULT 'pro', -- free, starter, pro, enterprise
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de Perfis de Usuários (vinculada à auth.users do Supabase)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'admin', -- admin, collaborator, manager, cashier
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de Configurações da Empresa
CREATE TABLE IF NOT EXISTS public.company_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE UNIQUE,
    company_name VARCHAR(255) NOT NULL,
    trade_name VARCHAR(255),
    cnpj VARCHAR(20),
    ie VARCHAR(30),
    phone VARCHAR(30),
    email VARCHAR(255),
    address TEXT,
    logo_url TEXT,
    primary_color VARCHAR(20) DEFAULT '#4f46e5',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------------------
-- 2. CATEGORIAS & PRODUTOS (ESTOQUE)
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    color VARCHAR(20) DEFAULT '#6366f1',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    barcode VARCHAR(100),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    cost_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    sale_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    stock_quantity INTEGER NOT NULL DEFAULT 0,
    min_stock_quantity INTEGER NOT NULL DEFAULT 5,
    unit VARCHAR(10) DEFAULT 'UN',
    image_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------------------
-- 3. CLIENTES & FORNECEDORES (CRM)
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    cpf_cnpj VARCHAR(20),
    email VARCHAR(255),
    phone VARCHAR(30),
    address TEXT,
    credit_limit NUMERIC(12, 2) DEFAULT 0.00,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.suppliers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    corporate_name VARCHAR(255) NOT NULL,
    trade_name VARCHAR(255),
    cnpj VARCHAR(20),
    email VARCHAR(255),
    phone VARCHAR(30),
    address TEXT,
    contact_person VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------------------
-- 4. VENDAS & PDV (PONTO DE VENDA)
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.sales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    code VARCHAR(50) NOT NULL,
    subtotal NUMERIC(12, 2) NOT NULL,
    discount NUMERIC(12, 2) DEFAULT 0.00,
    total NUMERIC(12, 2) NOT NULL,
    payment_method VARCHAR(50) NOT NULL, -- pix, credit_card, debit_card, cash, money
    status VARCHAR(30) DEFAULT 'completed', -- completed, cancelled, pending
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.sale_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_id UUID REFERENCES public.sales(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL,
    unit_price NUMERIC(12, 2) NOT NULL,
    total_price NUMERIC(12, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------------------
-- 5. FINANCEIRO & FLUXO DE CAIXA
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.financial_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL, -- income (receita), expense (despesa)
    description VARCHAR(255) NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    category VARCHAR(100) NOT NULL,
    due_date DATE NOT NULL,
    payment_date DATE,
    status VARCHAR(30) DEFAULT 'pending', -- paid, pending, overdue, cancelled
    payment_method VARCHAR(50),
    sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de Sessões de Caixa (Abertura / Fechamento PDV)
CREATE TABLE IF NOT EXISTS public.cash_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
    opening_balance NUMERIC(12, 2) NOT NULL,
    closing_balance NUMERIC(12, 2),
    expected_balance NUMERIC(12, 2),
    status VARCHAR(20) DEFAULT 'open', -- open, closed
    opened_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMP WITH TIME ZONE
);

-- ------------------------------------------------------------------------------
-- 6. HABILITAR ROW LEVEL SECURITY (RLS) & POLÍTICAS MULTI-TENANT
-- ------------------------------------------------------------------------------

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_sessions ENABLE ROW LEVEL SECURITY;

-- Exemplo de Função Helper para Obter a Organização do Usuário Autenticado
CREATE OR REPLACE FUNCTION public.get_auth_user_org_id()
RETURNS UUID AS $$
    SELECT organization_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Políticas de RLS Genéricas (Tenant Isolation)
CREATE POLICY "Acesso isolado por organizacao para profiles" ON public.profiles
    FOR ALL USING (id = auth.uid() OR organization_id = public.get_auth_user_org_id());

CREATE POLICY "Acesso isolado por organizacao para products" ON public.products
    FOR ALL USING (organization_id = public.get_auth_user_org_id());

CREATE POLICY "Acesso isolado por organizacao para categories" ON public.categories
    FOR ALL USING (organization_id = public.get_auth_user_org_id());

CREATE POLICY "Acesso isolado por organizacao para sales" ON public.sales
    FOR ALL USING (organization_id = public.get_auth_user_org_id());

CREATE POLICY "Acesso isolado por organizacao para financial_transactions" ON public.financial_transactions
    FOR ALL USING (organization_id = public.get_auth_user_org_id());

CREATE POLICY "Acesso isolado por organizacao para customers" ON public.customers
    FOR ALL USING (organization_id = public.get_auth_user_org_id());

CREATE POLICY "Acesso isolado por organizacao para suppliers" ON public.suppliers
    FOR ALL USING (organization_id = public.get_auth_user_org_id());

-- ------------------------------------------------------------------------------
-- 7. ÍNDICES PARA ALTA PERFORMANCE
-- ------------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_products_org_barcode ON public.products(organization_id, barcode);
CREATE INDEX IF NOT EXISTS idx_sales_org_date ON public.sales(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_financial_org_due ON public.financial_transactions(organization_id, due_date);
CREATE INDEX IF NOT EXISTS idx_profiles_org ON public.profiles(organization_id);

-- ==============================================================================
-- FIM DO SCRIPT DE BANCO DE DADOS
-- ==============================================================================
