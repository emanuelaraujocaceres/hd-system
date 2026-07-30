-- ==============================================================================
-- DIAGNÓSTICO COMPLETO DO BANCO DE DADOS — HD-System ERP/PDV
-- ==============================================================================
-- Execute no SQL Editor do Supabase Dashboard (uma única vez)
-- 
-- Este script verifica TODAS as estruturas que o frontend espera:
--   ✓ 18 tabelas com colunas corretas
--   ✓ 12 funções RPC
--   ✓ RLS policies
--   ✓ Índices
--   ✓ Triggers
--   ✓ Dados da organização padrão
-- ==============================================================================

BEGIN;
SELECT '▶ INICIANDO DIAGNÓSTICO COMPLETO DO BANCO DE DADOS' AS progresso;

-- ==============================================================================
-- PASSO 0: PRÉ-REQUISITOS (EXTENSÕES)
-- ==============================================================================
SELECT '0️⃣  PASSO 0: Verificando extensões...' AS progresso;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- PASSO 1: TABELAS PRINCIPAIS (CRIAÇÃO SE NÃO EXISTIREM)
-- ==============================================================================
SELECT '1️⃣  PASSO 1: Criando tabelas principais (se não existirem)...' AS progresso;

-- 1.1. organizations
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001',
  name TEXT NOT NULL DEFAULT 'HD-System',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 1.2. profiles (vinculada ao auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  role TEXT DEFAULT 'admin',
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 1.3. store_branches
CREATE TABLE IF NOT EXISTS store_branches (
  id UUID PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  cnpj TEXT,
  city TEXT,
  state TEXT,
  address TEXT,
  phone TEXT,
  is_headquarters BOOLEAN DEFAULT FALSE,
  active BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 1.4. products
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  store_branch_id TEXT,
  name TEXT NOT NULL,
  barcode TEXT,
  category TEXT DEFAULT 'Geral',
  unit TEXT DEFAULT 'un',
  cost_price NUMERIC(12,2) DEFAULT 0,
  sale_price NUMERIC(12,2) DEFAULT 0,
  stock_quantity INTEGER DEFAULT 0,
  min_stock_quantity INTEGER DEFAULT 5,
  image_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  show_on_tv BOOLEAN DEFAULT FALSE,
  tv_promo_price NUMERIC(12,2),
  tv_highlight_tag TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 1.5. categories
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6366f1'
);

-- 1.6. customers
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  cpf_cnpj TEXT,
  email TEXT,
  phone TEXT,
  credit_limit NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 1.7. suppliers
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  corporate_name TEXT,
  trade_name TEXT,
  cnpj TEXT,
  contact_person TEXT,
  email TEXT,
  phone TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 1.8. sales
CREATE TABLE IF NOT EXISTS sales (
  id UUID PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  store_branch_id TEXT,
  user_id TEXT,
  customer_id TEXT,
  code TEXT,
  created_at TIMESTAMPTZ,
  operator_name TEXT DEFAULT 'Sistema',
  subtotal NUMERIC(12,2) DEFAULT 0,
  discount NUMERIC(12,2) DEFAULT 0,
  total NUMERIC(12,2) DEFAULT 0,
  payment_method TEXT DEFAULT 'cash',
  status TEXT DEFAULT 'completed',
  notes TEXT,
  customer_name TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 1.9. sale_items
CREATE TABLE IF NOT EXISTS sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID REFERENCES sales(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE RESTRICT,
  product_name TEXT,
  quantity INTEGER DEFAULT 1,
  unit_price NUMERIC(12,2) DEFAULT 0,
  total_price NUMERIC(12,2) DEFAULT 0
);

-- 1.10. financial_transactions
CREATE TABLE IF NOT EXISTS financial_transactions (
  id UUID PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  store_branch_id TEXT,
  type TEXT,
  description TEXT,
  amount NUMERIC(12,2) DEFAULT 0,
  category TEXT,
  due_date DATE,
  payment_date DATE,
  status TEXT DEFAULT 'pending',
  notes TEXT
);

-- 1.11. cash_sessions
CREATE TABLE IF NOT EXISTS cash_sessions (
  id UUID PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  store_branch_id TEXT,
  user_id TEXT,
  operator_name TEXT,
  opening_balance NUMERIC(12,2) DEFAULT 0,
  closing_balance NUMERIC(12,2),
  expected_balance NUMERIC(12,2) DEFAULT 0,
  total_sales_cash NUMERIC(12,2) DEFAULT 0,
  total_sales_pix NUMERIC(12,2) DEFAULT 0,
  total_sales_card NUMERIC(12,2) DEFAULT 0,
  total_sales_credit_account NUMERIC(12,2) DEFAULT 0,
  suprimentos NUMERIC(12,2) DEFAULT 0,
  sangrias NUMERIC(12,2) DEFAULT 0,
  status TEXT DEFAULT 'open',
  opened_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  notes TEXT
);

-- 1.12. stock_movements
CREATE TABLE IF NOT EXISTS stock_movements (
  id UUID PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  store_branch_id TEXT,
  product_id UUID REFERENCES products(id) ON DELETE RESTRICT,
  product_name TEXT,
  type TEXT,
  quantity INTEGER DEFAULT 0,
  previous_stock INTEGER DEFAULT 0,
  new_stock INTEGER DEFAULT 0,
  reason TEXT,
  operator_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 1.13. system_users
CREATE TABLE IF NOT EXISTS system_users (
  id UUID PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  store_branch_id TEXT,
  name TEXT NOT NULL,
  email TEXT,
  role TEXT DEFAULT 'collaborator',
  permissions JSONB DEFAULT '{"pdv":true,"inventory":true,"crm":true,"finance":true,"dashboard":true,"settings":true}',
  avatar_url TEXT,
  active BOOLEAN DEFAULT TRUE,
  superadmin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 1.14. system_settings
CREATE TABLE IF NOT EXISTS system_settings (
  id UUID PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  settings JSONB,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 1.15. movimentacoes_falhas (DLQ)
CREATE TABLE IF NOT EXISTS movimentacoes_falhas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID DEFAULT '00000000-0000-0000-0000-000000000001',
  operation_type TEXT,
  table_name TEXT,
  record_id TEXT,
  payload JSONB,
  error_message TEXT,
  error_code TEXT,
  error_status INTEGER,
  stack_trace TEXT,
  source TEXT DEFAULT 'sync_queue',
  browser_id TEXT,
  user_email TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  next_retry_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  last_retry_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  resolution_notes TEXT
);

-- 1.16. stock_change_log
CREATE TABLE IF NOT EXISTS stock_change_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  field_name TEXT,
  old_value TEXT,
  new_value TEXT,
  changed_at TIMESTAMPTZ DEFAULT now(),
  changed_by TEXT
);

-- 1.17. sync_queue
CREATE TABLE IF NOT EXISTS sync_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID DEFAULT '00000000-0000-0000-0000-000000000001',
  table_name TEXT,
  record_id TEXT,
  operation TEXT,
  payload JSONB,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ
);

-- 1.18. ai_insights
CREATE TABLE IF NOT EXISTS ai_insights (
  id TEXT PRIMARY KEY,
  insights JSONB NOT NULL DEFAULT '[]',
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  today_revenue NUMERIC(10,2) DEFAULT 0,
  total_sales INTEGER DEFAULT 0,
  ticket_medio NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- PASSO 2: CORREÇÃO DE COLUNAS FALTANTES (ADD COLUMN IF NOT EXISTS)
-- ==============================================================================
SELECT '2️⃣  PASSO 2: Corrigindo colunas faltantes em tabelas existentes...' AS progresso;

-- products
ALTER TABLE products ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS store_branch_id TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS max_stock_quantity INTEGER DEFAULT 100;
ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier_id TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS ncm TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS cfop TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS show_on_tv BOOLEAN DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS tv_promo_price NUMERIC(12,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS tv_highlight_tag TEXT;

-- categories
ALTER TABLE categories ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS icon TEXT;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '#6366f1';
ALTER TABLE categories ADD COLUMN IF NOT EXISTS description TEXT;

-- customers (organization_id pode faltar nas tabelas mais antigas)
ALTER TABLE customers ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS current_balance NUMERIC(12,2) DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS loyalty_points INTEGER DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS state TEXT;

-- suppliers
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS store_branch_id TEXT;

-- sales
ALTER TABLE sales ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS store_branch_id TEXT;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS operator_name TEXT DEFAULT 'Sistema';
ALTER TABLE sales ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS notes TEXT;

-- financial_transactions
ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS store_branch_id TEXT;

-- cash_sessions
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS store_branch_id TEXT;
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS total_sales_credit_account NUMERIC(12,2) DEFAULT 0;

-- stock_movements
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS store_branch_id TEXT;

-- system_users
ALTER TABLE system_users ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE system_users ADD COLUMN IF NOT EXISTS store_branch_id TEXT;
ALTER TABLE system_users ADD COLUMN IF NOT EXISTS superadmin BOOLEAN DEFAULT FALSE;
ALTER TABLE system_users ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{"pdv":true,"inventory":true,"crm":true,"finance":true,"dashboard":true,"settings":true}';
ALTER TABLE system_users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- system_settings
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- store_branches
ALTER TABLE store_branches ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE store_branches ADD COLUMN IF NOT EXISTS cnpj TEXT;
ALTER TABLE store_branches ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE store_branches ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE store_branches ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE store_branches ADD COLUMN IF NOT EXISTS phone TEXT;

-- movimentacoes_falhas
ALTER TABLE movimentacoes_falhas ADD COLUMN IF NOT EXISTS record_id TEXT;
ALTER TABLE movimentacoes_falhas ADD COLUMN IF NOT EXISTS error_status INTEGER;
ALTER TABLE movimentacoes_falhas ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'sync_queue';
ALTER TABLE movimentacoes_falhas ADD COLUMN IF NOT EXISTS browser_id TEXT;
ALTER TABLE movimentacoes_falhas ADD COLUMN IF NOT EXISTS user_email TEXT;
ALTER TABLE movimentacoes_falhas ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ;

-- ==============================================================================
-- PASSO 3: FUNÇÕES RPC QUE O FRONTEND CHAMA
-- ==============================================================================
SELECT '3️⃣  PASSO 3: Recriando funções RPC...' AS progresso;

-- 3.1. get_auth_user_org_id — retorna a organização do usuário logado
CREATE OR REPLACE FUNCTION public.get_auth_user_org_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (SELECT organization_id FROM profiles WHERE id = auth.uid()),
    (SELECT organization_id FROM system_users WHERE id = auth.uid())
  );
$$;
GRANT EXECUTE ON FUNCTION public.get_auth_user_org_id TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_auth_user_org_id TO service_role;

-- 3.2. is_superadmin (usada nas RLS policies)
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM system_users
    WHERE id = auth.uid() AND superadmin = TRUE
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_superadmin TO authenticated;

-- 3.3. get_is_superadmin (versão alternativa usada nas RPCs admin)
CREATE OR REPLACE FUNCTION public.get_is_superadmin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(superadmin, FALSE) FROM system_users WHERE id = auth.uid();
$$;
GRANT EXECUTE ON FUNCTION public.get_is_superadmin TO authenticated;

-- 3.4. admin_fetch_organizations (superadmin: lista todas as organizações)
CREATE OR REPLACE FUNCTION public.admin_fetch_organizations()
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  IF NOT get_is_superadmin() THEN RAISE EXCEPTION 'Acesso negado: apenas superadmin'; END IF;
  SELECT COALESCE(json_agg(sub), '[]'::JSON) INTO result
  FROM (
    SELECT o.id, o.name, o.created_at,
      (SELECT COUNT(*)::INTEGER FROM store_branches sb WHERE sb.organization_id = o.id) AS branch_count,
      (SELECT COUNT(*)::INTEGER FROM system_users su WHERE su.organization_id = o.id) AS user_count
    FROM organizations o
    ORDER BY o.created_at DESC
  ) sub;
  RETURN result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_fetch_organizations TO authenticated;

-- 3.5. admin_fetch_branches (superadmin: lista filiais de uma organização)
CREATE OR REPLACE FUNCTION public.admin_fetch_branches(p_org_id UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  IF NOT get_is_superadmin() THEN RAISE EXCEPTION 'Acesso negado: apenas superadmin'; END IF;
  SELECT COALESCE(json_agg(sub), '[]'::JSON) INTO result
  FROM (
    SELECT sb.id, sb.name, sb.code, sb.city, sb.state, sb.is_headquarters, sb.active
    FROM store_branches sb
    WHERE sb.organization_id = p_org_id
    ORDER BY sb.is_headquarters DESC, sb.name
  ) sub;
  RETURN result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_fetch_branches TO authenticated;

-- 3.6. admin_fetch_users (superadmin: lista usuários de uma organização)
CREATE OR REPLACE FUNCTION public.admin_fetch_users(p_org_id UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  IF NOT get_is_superadmin() THEN RAISE EXCEPTION 'Acesso negado: apenas superadmin'; END IF;
  SELECT COALESCE(json_agg(sub), '[]'::JSON) INTO result
  FROM (
    SELECT su.id, su.name, su.email, su.role, su.active
    FROM system_users su
    WHERE su.organization_id = p_org_id
    ORDER BY su.role, su.name
  ) sub;
  RETURN result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_fetch_users TO authenticated;

-- 3.7. admin_create_organization (superadmin: cria org + branch + admin)
CREATE OR REPLACE FUNCTION public.admin_create_organization(
  p_name TEXT, p_admin_email TEXT, p_admin_name TEXT
)
RETURNS TABLE(success BOOLEAN, message TEXT, org_id UUID, admin_id TEXT, password TEXT)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_org_id UUID; v_admin_id UUID; v_password TEXT; v_branch_id UUID;
BEGIN
  IF NOT get_is_superadmin() THEN
    RETURN QUERY SELECT FALSE, 'Acesso negado: apenas superadmin', NULL::UUID, NULL::TEXT, NULL::TEXT; RETURN;
  END IF;
  IF p_name IS NULL OR p_name = '' THEN
    RETURN QUERY SELECT FALSE, 'Nome da organização é obrigatório', NULL::UUID, NULL::TEXT, NULL::TEXT; RETURN;
  END IF;
  v_org_id := gen_random_uuid(); v_admin_id := gen_random_uuid();
  v_branch_id := gen_random_uuid();
  v_password := upper(substr(md5(random()::text), 1, 8));
  INSERT INTO organizations (id, name) VALUES (v_org_id, p_name);
  INSERT INTO store_branches (id, organization_id, name, code, active, is_headquarters)
  VALUES (v_branch_id, v_org_id, p_name || ' - Matriz', 'MTZ-01', TRUE, TRUE);
  INSERT INTO system_users (id, organization_id, name, email, role, active, store_branch_id)
  VALUES (v_admin_id, v_org_id, p_admin_name, p_admin_email, 'admin', TRUE, v_branch_id);
  RETURN QUERY SELECT TRUE, 'Organização criada com sucesso', v_org_id, v_admin_id::TEXT, v_password;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_create_organization TO authenticated;

-- 3.8. admin_add_user (superadmin: adiciona admin a uma org)
CREATE OR REPLACE FUNCTION public.admin_add_user(
  p_org_id UUID, p_branch_id UUID, p_name TEXT, p_email TEXT, p_role TEXT DEFAULT 'admin'
)
RETURNS TABLE(success BOOLEAN, message TEXT, user_id UUID)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  IF NOT get_is_superadmin() THEN
    RETURN QUERY SELECT FALSE, 'Acesso negado: apenas superadmin', NULL::UUID; RETURN;
  END IF;
  IF p_name IS NULL OR p_email IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Nome e e-mail são obrigatórios', NULL::UUID; RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM system_users WHERE email = p_email AND organization_id = p_org_id) THEN
    RETURN QUERY SELECT FALSE, 'Já existe um usuário com este e-mail nesta organização', NULL::UUID; RETURN;
  END IF;
  v_user_id := gen_random_uuid();
  INSERT INTO system_users (id, organization_id, name, email, role, active, store_branch_id)
  VALUES (v_user_id, p_org_id, p_name, p_email, p_role, TRUE, p_branch_id);
  RETURN QUERY SELECT TRUE, 'Usuário criado com sucesso', v_user_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_add_user TO authenticated;

-- 3.9. ajustar_estoque — RPC de ajuste de estoque (usada pelo frontend)
-- Dropar TODAS as sobrecargas existentes (evita "not unique")
DO $$ DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'ajustar_estoque'
  ) LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.signature || ' CASCADE';
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION ajustar_estoque(
  p_product_id UUID,
  p_quantity INTEGER,
  p_type TEXT DEFAULT 'in',
  p_reason TEXT DEFAULT 'Ajuste manual',
  p_operator_name TEXT DEFAULT 'Sistema',
  p_organization_id UUID DEFAULT '00000000-0000-0000-0000-000000000001'
)
RETURNS TABLE(success BOOLEAN, message TEXT, previous_stock INTEGER, new_stock INTEGER)
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_stock INTEGER;
  v_new_stock INTEGER;
  v_product_name TEXT;
  v_final_type TEXT;
BEGIN
  SELECT stock_quantity, name INTO v_current_stock, v_product_name
  FROM products WHERE id = p_product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'Produto nao encontrado: ' || p_product_id::text, 0, 0;
    RETURN;
  END IF;

  v_final_type := LOWER(p_type);
  IF v_final_type NOT IN ('in', 'out', 'adjustment', 'loss') THEN v_final_type := 'in'; END IF;

  v_new_stock := CASE
    WHEN v_final_type = 'in' THEN v_current_stock + ABS(p_quantity)
    WHEN v_final_type IN ('out', 'loss') THEN GREATEST(0, v_current_stock - ABS(p_quantity))
    WHEN v_final_type = 'adjustment' THEN p_quantity
    ELSE v_current_stock
  END;

  UPDATE products SET stock_quantity = v_new_stock, updated_at = NOW() WHERE id = p_product_id;

  INSERT INTO stock_movements (id, organization_id, product_id, product_name, type, quantity, previous_stock, new_stock, reason, operator_name)
  VALUES (gen_random_uuid(), p_organization_id, p_product_id, v_product_name, v_final_type, ABS(p_quantity), v_current_stock, v_new_stock, p_reason, p_operator_name);

  RETURN QUERY SELECT TRUE, 'Estoque ajustado: ' || v_current_stock || ' -> ' || v_new_stock, v_current_stock, v_new_stock;
END;
$$;
GRANT EXECUTE ON FUNCTION ajustar_estoque TO authenticated;

-- 3.10. process_sale_transaction — RPC de venda (usada pelo frontend)
-- ⚠ ATENÇÃO: Esta versão CORRIGE a assinatura para corresponder ao que o
-- frontend (storageService.ts:1702) realmente envia. A versão anterior na
-- migração 20260729 só aceitava 4 parâmetros e estava QUEBRADA.
--
-- Primeiro: dropar TODAS as sobrecargas existentes (pode haver múltiplas
-- assinaturas de migrações anteriores causando "not unique").
DO $$ DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'process_sale_transaction'
  ) LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.signature || ' CASCADE';
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION process_sale_transaction(
  p_sale_id UUID,
  p_product_id TEXT DEFAULT NULL,
  p_quantity INTEGER DEFAULT 0,
  p_unit_price NUMERIC(12,2) DEFAULT 0,
  p_discount NUMERIC(12,2) DEFAULT 0,
  p_total NUMERIC(12,2) DEFAULT 0,
  p_reason TEXT DEFAULT 'Venda PDV',
  p_operator_name TEXT DEFAULT 'Sistema',
  p_organization_id UUID DEFAULT '00000000-0000-0000-0000-000000000001',
  p_store_branch_id UUID DEFAULT NULL,
  p_sale_items JSONB DEFAULT '[]'::JSONB
)
RETURNS TABLE(success BOOLEAN, message TEXT)
LANGUAGE plpgsql
AS $$
DECLARE
  v_item RECORD;
  v_current_stock INTEGER;
  v_new_stock INTEGER;
  v_product_id UUID;
  v_quantity INTEGER;
  v_unit_price NUMERIC(12,2);
BEGIN
  -- Processa cada item da venda
  FOR v_item IN
    SELECT
      (item->>'product_id')::UUID AS product_id,
      (item->>'quantity')::INTEGER AS quantity,
      (item->>'unit_price')::NUMERIC AS unit_price
    FROM jsonb_array_elements(p_sale_items) AS item
  LOOP
    -- Verifica estoque
    SELECT stock_quantity INTO v_current_stock
    FROM products WHERE id = v_item.product_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN QUERY SELECT FALSE, 'Produto nao encontrado: ' || v_item.product_id::text;
      RETURN;
    END IF;

    IF v_current_stock < v_item.quantity THEN
      RETURN QUERY SELECT FALSE, 'Estoque insuficiente para o produto';
      RETURN;
    END IF;

    -- Deduz estoque
    v_new_stock := v_current_stock - v_item.quantity;
    UPDATE products SET stock_quantity = v_new_stock, updated_at = NOW()
    WHERE id = v_item.product_id;

    -- Registra movimentação
    INSERT INTO stock_movements (id, organization_id, product_id, product_name, type, quantity, previous_stock, new_stock, reason, operator_name)
    VALUES (
      gen_random_uuid(), p_organization_id, v_item.product_id,
      (SELECT name FROM products WHERE id = v_item.product_id),
      'out', v_item.quantity, v_current_stock, v_new_stock,
      p_reason, p_operator_name
    );
  END LOOP;

  RETURN QUERY SELECT TRUE, 'Venda processada com sucesso';
END;
$$;
GRANT EXECUTE ON FUNCTION process_sale_transaction TO authenticated;

-- 3.11. fn_insserir_dlq — Dead Letter Queue
CREATE OR REPLACE FUNCTION fn_insserir_dlq(
  p_operation_type TEXT,
  p_table_name TEXT,
  p_record_id TEXT DEFAULT NULL,
  p_payload JSONB DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL,
  p_error_code TEXT DEFAULT NULL,
  p_error_status INTEGER DEFAULT NULL,
  p_stack_trace TEXT DEFAULT NULL,
  p_source TEXT DEFAULT 'sync_queue',
  p_browser_id TEXT DEFAULT NULL,
  p_user_email TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_id UUID;
BEGIN
  v_id := gen_random_uuid();
  INSERT INTO movimentacoes_falhas (
    id, operation_type, table_name, record_id, payload,
    error_message, error_code, error_status, stack_trace,
    source, browser_id, user_email, next_retry_at
  ) VALUES (
    v_id, p_operation_type, p_table_name, p_record_id, p_payload,
    p_error_message, p_error_code, p_error_status, p_stack_trace,
    p_source, p_browser_id, p_user_email, NOW() + INTERVAL '1 minute'
  );
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION fn_insserir_dlq TO authenticated;

-- 3.12. check_stock_consistency — verificação de consistência de estoque
CREATE OR REPLACE FUNCTION check_stock_consistency(p_organization_id UUID DEFAULT NULL)
RETURNS TABLE(product_id UUID, product_name TEXT, current_stock INTEGER, calculated_stock INTEGER, difference INTEGER, status TEXT)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH stock_calc AS (
    SELECT
      p.id,
      p.name,
      COALESCE(p.stock_quantity, 0) AS current_stock,
      COALESCE(SUM(CASE
        WHEN sm.type IN ('in', 'IN') THEN sm.quantity
        WHEN sm.type IN ('out', 'OUT', 'loss', 'LOSS') THEN -sm.quantity
        ELSE 0
      END), 0) AS calculated_stock
    FROM products p
    LEFT JOIN stock_movements sm ON p.id = sm.product_id
    WHERE (p_organization_id IS NULL OR p.organization_id = p_organization_id)
    GROUP BY p.id, p.name, p.stock_quantity
  )
  SELECT
    sc.id,
    sc.name,
    sc.current_stock,
    sc.calculated_stock,
    (sc.current_stock - sc.calculated_stock) AS difference,
    CASE
      WHEN sc.current_stock = sc.calculated_stock THEN 'CONSISTENTE'
      WHEN sc.current_stock > sc.calculated_stock THEN 'SUPERAVIT'
      ELSE 'DEFICIT'
    END AS status
  FROM stock_calc sc
  WHERE sc.current_stock != sc.calculated_stock
  ORDER BY ABS(sc.current_stock - sc.calculated_stock) DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION check_stock_consistency TO authenticated;

-- ==============================================================================
-- PASSO 4: ROW LEVEL SECURITY (RLS)
-- ==============================================================================
SELECT '4️⃣  PASSO 4: Habilitando RLS e recriando policies...' AS progresso;

-- 4.0. Habilitar RLS em todas as tabelas
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_change_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimentacoes_falhas ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Helper: Drop policy se existir (para recriar)
DO $$ BEGIN
  -- organizations
  DROP POLICY IF EXISTS "RLS_organizations_select" ON organizations;
  DROP POLICY IF EXISTS "RLS_organizations_insert" ON organizations;
  DROP POLICY IF EXISTS "RLS_organizations_update" ON organizations;
  DROP POLICY IF EXISTS "RLS_organizations_superadmin" ON organizations;

  -- store_branches
  DROP POLICY IF EXISTS "RLS_store_branches_select" ON store_branches;
  DROP POLICY IF EXISTS "RLS_store_branches_insert" ON store_branches;
  DROP POLICY IF EXISTS "RLS_store_branches_update" ON store_branches;
  DROP POLICY IF EXISTS "RLS_store_branches_delete" ON store_branches;
  DROP POLICY IF EXISTS "RLS_store_branches_superadmin" ON store_branches;

  -- products
  DROP POLICY IF EXISTS "RLS_products_select" ON products;
  DROP POLICY IF EXISTS "RLS_products_insert" ON products;
  DROP POLICY IF EXISTS "RLS_products_update" ON products;
  DROP POLICY IF EXISTS "RLS_products_delete" ON products;
  DROP POLICY IF EXISTS "RLS_products_superadmin" ON products;

  -- categories
  DROP POLICY IF EXISTS "RLS_categories_select" ON categories;
  DROP POLICY IF EXISTS "RLS_categories_insert" ON categories;
  DROP POLICY IF EXISTS "RLS_categories_update" ON categories;
  DROP POLICY IF EXISTS "RLS_categories_delete" ON categories;
  DROP POLICY IF EXISTS "RLS_categories_superadmin" ON categories;

  -- customers
  DROP POLICY IF EXISTS "RLS_customers_select" ON customers;
  DROP POLICY IF EXISTS "RLS_customers_insert" ON customers;
  DROP POLICY IF EXISTS "RLS_customers_update" ON customers;
  DROP POLICY IF EXISTS "RLS_customers_delete" ON customers;
  DROP POLICY IF EXISTS "RLS_customers_superadmin" ON customers;

  -- suppliers
  DROP POLICY IF EXISTS "RLS_suppliers_select" ON suppliers;
  DROP POLICY IF EXISTS "RLS_suppliers_insert" ON suppliers;
  DROP POLICY IF EXISTS "RLS_suppliers_update" ON suppliers;
  DROP POLICY IF EXISTS "RLS_suppliers_delete" ON suppliers;
  DROP POLICY IF EXISTS "RLS_suppliers_superadmin" ON suppliers;

  -- sales
  DROP POLICY IF EXISTS "RLS_sales_select" ON sales;
  DROP POLICY IF EXISTS "RLS_sales_insert" ON sales;
  DROP POLICY IF EXISTS "RLS_sales_update" ON sales;
  DROP POLICY IF EXISTS "RLS_sales_delete" ON sales;
  DROP POLICY IF EXISTS "RLS_sales_superadmin" ON sales;

  -- sale_items
  DROP POLICY IF EXISTS "RLS_sale_items_select" ON sale_items;
  DROP POLICY IF EXISTS "RLS_sale_items_insert" ON sale_items;
  DROP POLICY IF EXISTS "RLS_sale_items_update" ON sale_items;
  DROP POLICY IF EXISTS "RLS_sale_items_delete" ON sale_items;
  DROP POLICY IF EXISTS "RLS_sale_items_superadmin" ON sale_items;

  -- financial_transactions
  DROP POLICY IF EXISTS "RLS_financial_select" ON financial_transactions;
  DROP POLICY IF EXISTS "RLS_financial_insert" ON financial_transactions;
  DROP POLICY IF EXISTS "RLS_financial_update" ON financial_transactions;
  DROP POLICY IF EXISTS "RLS_financial_delete" ON financial_transactions;
  DROP POLICY IF EXISTS "RLS_financial_superadmin" ON financial_transactions;

  -- cash_sessions
  DROP POLICY IF EXISTS "RLS_cash_sessions_select" ON cash_sessions;
  DROP POLICY IF EXISTS "RLS_cash_sessions_insert" ON cash_sessions;
  DROP POLICY IF EXISTS "RLS_cash_sessions_update" ON cash_sessions;
  DROP POLICY IF EXISTS "RLS_cash_sessions_delete" ON cash_sessions;
  DROP POLICY IF EXISTS "RLS_cash_sessions_superadmin" ON cash_sessions;

  -- stock_movements
  DROP POLICY IF EXISTS "RLS_stock_movements_select" ON stock_movements;
  DROP POLICY IF EXISTS "RLS_stock_movements_insert" ON stock_movements;
  DROP POLICY IF EXISTS "RLS_stock_movements_update" ON stock_movements;
  DROP POLICY IF EXISTS "RLS_stock_movements_delete" ON stock_movements;
  DROP POLICY IF EXISTS "RLS_stock_movements_superadmin" ON stock_movements;

  -- system_users
  DROP POLICY IF EXISTS "RLS_system_users_select" ON system_users;
  DROP POLICY IF EXISTS "RLS_system_users_insert" ON system_users;
  DROP POLICY IF EXISTS "RLS_system_users_update" ON system_users;
  DROP POLICY IF EXISTS "RLS_system_users_delete" ON system_users;
  DROP POLICY IF EXISTS "RLS_system_users_superadmin" ON system_users;
  DROP POLICY IF EXISTS "RLS_system_users_self_insert" ON system_users;
  DROP POLICY IF EXISTS "RLS_system_users_self_update" ON system_users;

  -- system_settings
  DROP POLICY IF EXISTS "RLS_system_settings_select" ON system_settings;
  DROP POLICY IF EXISTS "RLS_system_settings_insert" ON system_settings;
  DROP POLICY IF EXISTS "RLS_system_settings_update" ON system_settings;
  DROP POLICY IF EXISTS "RLS_system_settings_delete" ON system_settings;
  DROP POLICY IF EXISTS "RLS_system_settings_superadmin" ON system_settings;
  DROP POLICY IF EXISTS "RLS_system_settings_self_insert" ON system_settings;
  DROP POLICY IF EXISTS "RLS_system_settings_self_update" ON system_settings;

  -- stock_change_log
  DROP POLICY IF EXISTS "RLS_stock_change_log_select" ON stock_change_log;

  -- movimentacoes_falhas
  DROP POLICY IF EXISTS "RLS_movimentacoes_falhas_select" ON movimentacoes_falhas;
  DROP POLICY IF EXISTS "RLS_movimentacoes_falhas_insert" ON movimentacoes_falhas;

  -- sync_queue
  DROP POLICY IF EXISTS "RLS_sync_queue_select" ON sync_queue;

  -- profiles
  DROP POLICY IF EXISTS "RLS_profiles_select" ON profiles;
  DROP POLICY IF EXISTS "RLS_profiles_update" ON profiles;
END $$;

-- 4.1. Políticas de ORGANIZAÇÃO (usuário vê apenas sua org)

-- organizations
CREATE POLICY "RLS_organizations_select" ON organizations FOR SELECT USING (id = get_auth_user_org_id());
CREATE POLICY "RLS_organizations_superadmin" ON organizations FOR ALL USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

-- store_branches
CREATE POLICY "RLS_store_branches_select" ON store_branches FOR SELECT USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_store_branches_insert" ON store_branches FOR INSERT WITH CHECK (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_store_branches_update" ON store_branches FOR UPDATE USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_store_branches_delete" ON store_branches FOR DELETE USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_store_branches_superadmin" ON store_branches FOR ALL USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

-- products
CREATE POLICY "RLS_products_select" ON products FOR SELECT USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_products_insert" ON products FOR INSERT WITH CHECK (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_products_update" ON products FOR UPDATE USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_products_delete" ON products FOR DELETE USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_products_superadmin" ON products FOR ALL USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

-- categories
CREATE POLICY "RLS_categories_select" ON categories FOR SELECT USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_categories_insert" ON categories FOR INSERT WITH CHECK (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_categories_update" ON categories FOR UPDATE USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_categories_delete" ON categories FOR DELETE USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_categories_superadmin" ON categories FOR ALL USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

-- customers
CREATE POLICY "RLS_customers_select" ON customers FOR SELECT USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_customers_insert" ON customers FOR INSERT WITH CHECK (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_customers_update" ON customers FOR UPDATE USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_customers_delete" ON customers FOR DELETE USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_customers_superadmin" ON customers FOR ALL USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

-- suppliers
CREATE POLICY "RLS_suppliers_select" ON suppliers FOR SELECT USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_suppliers_insert" ON suppliers FOR INSERT WITH CHECK (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_suppliers_update" ON suppliers FOR UPDATE USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_suppliers_delete" ON suppliers FOR DELETE USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_suppliers_superadmin" ON suppliers FOR ALL USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

-- sales
CREATE POLICY "RLS_sales_select" ON sales FOR SELECT USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_sales_insert" ON sales FOR INSERT WITH CHECK (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_sales_update" ON sales FOR UPDATE USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_sales_delete" ON sales FOR DELETE USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_sales_superadmin" ON sales FOR ALL USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

-- sale_items (herda org via sales)
CREATE POLICY "RLS_sale_items_select" ON sale_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM sales WHERE sales.id = sale_items.sale_id AND sales.organization_id = get_auth_user_org_id())
);
CREATE POLICY "RLS_sale_items_insert" ON sale_items FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM sales WHERE sales.id = sale_items.sale_id AND sales.organization_id = get_auth_user_org_id())
);
CREATE POLICY "RLS_sale_items_update" ON sale_items FOR UPDATE USING (
  EXISTS (SELECT 1 FROM sales WHERE sales.id = sale_items.sale_id AND sales.organization_id = get_auth_user_org_id())
);
CREATE POLICY "RLS_sale_items_delete" ON sale_items FOR DELETE USING (
  EXISTS (SELECT 1 FROM sales WHERE sales.id = sale_items.sale_id AND sales.organization_id = get_auth_user_org_id())
);
CREATE POLICY "RLS_sale_items_superadmin" ON sale_items FOR ALL USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

-- financial_transactions
CREATE POLICY "RLS_financial_select" ON financial_transactions FOR SELECT USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_financial_insert" ON financial_transactions FOR INSERT WITH CHECK (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_financial_update" ON financial_transactions FOR UPDATE USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_financial_delete" ON financial_transactions FOR DELETE USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_financial_superadmin" ON financial_transactions FOR ALL USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

-- cash_sessions
CREATE POLICY "RLS_cash_sessions_select" ON cash_sessions FOR SELECT USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_cash_sessions_insert" ON cash_sessions FOR INSERT WITH CHECK (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_cash_sessions_update" ON cash_sessions FOR UPDATE USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_cash_sessions_delete" ON cash_sessions FOR DELETE USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_cash_sessions_superadmin" ON cash_sessions FOR ALL USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

-- stock_movements
CREATE POLICY "RLS_stock_movements_select" ON stock_movements FOR SELECT USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_stock_movements_insert" ON stock_movements FOR INSERT WITH CHECK (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_stock_movements_update" ON stock_movements FOR UPDATE USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_stock_movements_delete" ON stock_movements FOR DELETE USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_stock_movements_superadmin" ON stock_movements FOR ALL USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

-- system_users
CREATE POLICY "RLS_system_users_select" ON system_users FOR SELECT USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_system_users_insert" ON system_users FOR INSERT WITH CHECK (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_system_users_update" ON system_users FOR UPDATE USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_system_users_delete" ON system_users FOR DELETE USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_system_users_superadmin" ON system_users FOR ALL USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());
-- Self-service: permite o usuário criar/atualizar seu próprio registro (sync)
CREATE POLICY "RLS_system_users_self_insert" ON system_users FOR INSERT WITH CHECK (id = auth.uid());
CREATE POLICY "RLS_system_users_self_update" ON system_users FOR UPDATE USING (id = auth.uid());

-- system_settings
CREATE POLICY "RLS_system_settings_select" ON system_settings FOR SELECT USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_system_settings_insert" ON system_settings FOR INSERT WITH CHECK (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_system_settings_update" ON system_settings FOR UPDATE USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_system_settings_delete" ON system_settings FOR DELETE USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_system_settings_superadmin" ON system_settings FOR ALL USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());
-- Self-service: permite upsert via sync
CREATE POLICY "RLS_system_settings_self_insert" ON system_settings FOR INSERT WITH CHECK (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_system_settings_self_update" ON system_settings FOR UPDATE USING (organization_id = get_auth_user_org_id());

-- stock_change_log
CREATE POLICY "RLS_stock_change_log_select" ON stock_change_log FOR SELECT USING (
  EXISTS (SELECT 1 FROM products WHERE products.id = stock_change_log.product_id AND products.organization_id = get_auth_user_org_id())
);

-- movimentacoes_falhas (DLQ)
CREATE POLICY "RLS_movimentacoes_falhas_select" ON movimentacoes_falhas FOR SELECT USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_movimentacoes_falhas_insert" ON movimentacoes_falhas FOR INSERT WITH CHECK (organization_id = get_auth_user_org_id());

-- sync_queue
CREATE POLICY "RLS_sync_queue_select" ON sync_queue FOR SELECT USING (organization_id = get_auth_user_org_id());

-- profiles
CREATE POLICY "RLS_profiles_select" ON profiles FOR SELECT USING (
  id = auth.uid() OR organization_id = get_auth_user_org_id()
);
CREATE POLICY "RLS_profiles_update" ON profiles FOR UPDATE USING (id = auth.uid());

-- ==============================================================================
-- PASSO 5: ÍNDICES
-- ==============================================================================
SELECT '5️⃣  PASSO 5: Recriando índices...' AS progresso;

-- organization_id indexes
CREATE INDEX IF NOT EXISTS idx_products_org_id ON products(organization_id);
CREATE INDEX IF NOT EXISTS idx_categories_org_id ON categories(organization_id);
CREATE INDEX IF NOT EXISTS idx_customers_org_id ON customers(organization_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_org_id ON suppliers(organization_id);
CREATE INDEX IF NOT EXISTS idx_sales_org_id ON sales(organization_id);
CREATE INDEX IF NOT EXISTS idx_financial_org_id ON financial_transactions(organization_id);
CREATE INDEX IF NOT EXISTS idx_cash_sessions_org_id ON cash_sessions(organization_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_org_id ON stock_movements(organization_id);
CREATE INDEX IF NOT EXISTS idx_system_users_org_id ON system_users(organization_id);

-- search indexes
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode) WHERE barcode IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE INDEX IF NOT EXISTS idx_products_org_name ON products(organization_id, name);
CREATE INDEX IF NOT EXISTS idx_products_org_barcode ON products(organization_id, barcode);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_cpf_cnpj ON customers(cpf_cnpj) WHERE cpf_cnpj IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_suppliers_cnpj ON suppliers(cnpj) WHERE cnpj IS NOT NULL;

-- date/sort indexes
CREATE INDEX IF NOT EXISTS idx_sales_org_created ON sales(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_org_status ON sales(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_financial_due_date ON financial_transactions(due_date);
CREATE INDEX IF NOT EXISTS idx_financial_org_status ON financial_transactions(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_financial_org_due ON financial_transactions(organization_id, due_date);
CREATE INDEX IF NOT EXISTS idx_stock_movements_org_date ON stock_movements(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_cash_sessions_status ON cash_sessions(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_cash_sessions_operator ON cash_sessions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items(product_id);

-- full-text search indexes (gin_trgm_ops)
-- Requires: CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- Descomente se quiser busca textual fuzzy:
-- CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON products USING gin (name gin_trgm_ops);
-- CREATE INDEX IF NOT EXISTS idx_customers_name_trgm ON customers USING gin (name gin_trgm_ops);

-- ==============================================================================
-- PASSO 6: TRIGGERS
-- ==============================================================================
SELECT '6️⃣  PASSO 6: Recriando triggers...' AS progresso;

-- 6.0. Função genérica para updated_at
CREATE OR REPLACE FUNCTION fn_update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- 6.1. Triggers de updated_at
DROP TRIGGER IF EXISTS trg_products_updated_at ON products;
CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW
  WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION fn_update_updated_at();

DROP TRIGGER IF EXISTS trg_store_branches_updated_at ON store_branches;
CREATE TRIGGER trg_store_branches_updated_at
  BEFORE UPDATE ON store_branches
  FOR EACH ROW
  WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION fn_update_updated_at();

DROP TRIGGER IF EXISTS trg_customers_updated_at ON customers;
CREATE TRIGGER trg_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW
  WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION fn_update_updated_at();

DROP TRIGGER IF EXISTS trg_suppliers_updated_at ON suppliers;
CREATE TRIGGER trg_suppliers_updated_at
  BEFORE UPDATE ON suppliers
  FOR EACH ROW
  WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION fn_update_updated_at();

DROP TRIGGER IF EXISTS trg_sales_updated_at ON sales;
CREATE TRIGGER trg_sales_updated_at
  BEFORE UPDATE ON sales
  FOR EACH ROW
  WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION fn_update_updated_at();

DROP TRIGGER IF EXISTS trg_system_users_updated_at ON system_users;
CREATE TRIGGER trg_system_users_updated_at
  BEFORE UPDATE ON system_users
  FOR EACH ROW
  WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION fn_update_updated_at();

-- 6.2. Trigger: Impedir estoque negativo
CREATE OR REPLACE FUNCTION fn_prevent_negative_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.stock_quantity < 0 THEN
    RAISE EXCEPTION 'Estoque nao pode ser negativo. Produto: %, Tentativa: %', NEW.name, NEW.stock_quantity;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stock_not_negative ON products;
CREATE TRIGGER trg_stock_not_negative
  BEFORE UPDATE OF stock_quantity ON products
  FOR EACH ROW
  WHEN (NEW.stock_quantity < 0)
  EXECUTE FUNCTION fn_prevent_negative_stock();

-- 6.3. Trigger: Log de mudanças de estoque
-- REMOVIDA: as RPCs ajustar_estoque() e process_sale_transaction() já criam
-- stock_movements com contexto real (operador, motivo, referência). A trigger
-- gerava duplicatas com reason='Ajuste automático (trigger)' genérico.
-- DROP TRIGGER IF EXISTS trg_log_stock_changes ON products;
-- DROP FUNCTION IF EXISTS fn_log_stock_changes();

-- 6.4. Trigger: Sincronizar product_name em sale_items e stock_movements
CREATE OR REPLACE FUNCTION fn_sync_product_name()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.name IS DISTINCT FROM NEW.name THEN
    UPDATE sale_items SET product_name = NEW.name WHERE product_id = NEW.id;
    UPDATE stock_movements SET product_name = NEW.name WHERE product_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_product_name ON products;
CREATE TRIGGER trg_sync_product_name
  AFTER UPDATE OF name ON products
  FOR EACH ROW
  EXECUTE FUNCTION fn_sync_product_name();

-- ==============================================================================
-- PASSO 7: REALTIME PUBLICATION
-- ==============================================================================
SELECT '7️⃣  PASSO 7: Garantindo Realtime publication...' AS progresso;

DO $$
DECLARE
  tables TEXT[] := ARRAY[
    'products','categories','customers','suppliers','sales','sale_items',
    'financial_transactions','cash_sessions','stock_movements',
    'store_branches','system_users','system_settings'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    EXCEPTION WHEN OTHERS THEN
      -- Tabela já está na publicação
    END;
  END LOOP;
END $$;

-- ==============================================================================
-- PASSO 8: DADOS INICIAIS (ORGANIZAÇÃO PADRÃO + SUPERADMIN)
-- ==============================================================================
SELECT '8️⃣  PASSO 8: Garantindo dados iniciais...' AS progresso;

-- Organização padrão HD-System
INSERT INTO organizations (id, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'HD-System')
ON CONFLICT (id) DO NOTHING;

-- Se existir usuário emanuel@gmail.com, garantir superadmin
UPDATE system_users SET superadmin = TRUE WHERE email = 'emanuel@gmail.com';

-- Criar filial padrão se não existir (para a org padrão)
INSERT INTO store_branches (id, organization_id, name, code, is_headquarters, active)
SELECT gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'HD-System - Matriz', 'MTZ-01', TRUE, TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM store_branches WHERE organization_id = '00000000-0000-0000-0000-000000000001'
);

-- ==============================================================================
-- PASSO 9: VERIFICAÇÃO FINAL
-- ==============================================================================
SELECT '9️⃣  PASSO 9: Rodando verificações...' AS progresso;

-- 9.1. Tabelas existentes
SELECT '9.1. TABELAS' AS verificacao;
SELECT tablename AS tabela,
  pg_size_pretty(pg_total_relation_size('public.' || tablename)) AS tamanho
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename NOT LIKE 'backup_%'
ORDER BY tablename;

-- 9.2. RLS ativo
SELECT '9.2. RLS ATIVO' AS verificacao;
SELECT relname AS tabela, relrowsecurity AS rls_ativo
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relkind = 'r'
  AND relname NOT LIKE 'backup_%'
ORDER BY relname;

-- 9.3. Funções RPC
SELECT '9.3. FUNÇÕES RPC' AS verificacao;
SELECT p.proname AS funcao,
  pg_get_function_arguments(p.oid) AS parametros,
  CASE WHEN p.prorettype = 0 THEN 'TRIGGER' ELSE 'FUNCTION' END AS tipo
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname IN (
    'get_auth_user_org_id', 'is_superadmin', 'get_is_superadmin',
    'admin_fetch_organizations', 'admin_fetch_branches', 'admin_fetch_users',
    'admin_create_organization', 'admin_add_user',
    'ajustar_estoque', 'process_sale_transaction',
    'fn_insserir_dlq', 'check_stock_consistency',
    'fn_update_updated_at', 'fn_prevent_negative_stock',
    'fn_sync_product_name'
  )
ORDER BY p.proname;

-- 9.4. FKs
SELECT '9.4. FOREIGN KEYS' AS verificacao;
SELECT conname AS constraint_name,
  conrelid::regclass AS tabela_origem,
  confrelid::regclass AS tabela_destino
FROM pg_constraint
WHERE contype = 'f'
  AND connamespace = 'public'::regnamespace
ORDER BY conname;

-- 9.5. Índices
SELECT '9.5. ÍNDICES' AS verificacao;
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname NOT LIKE '%pkey%'
ORDER BY tablename, indexname;

-- 9.6. Triggers ativos
SELECT '9.6. TRIGGERS' AS verificacao;
SELECT tgname AS trigger_name, tgrelid::regclass AS tabela
FROM pg_trigger
WHERE tgname IN (
  'trg_products_updated_at', 'trg_store_branches_updated_at',
  'trg_customers_updated_at', 'trg_suppliers_updated_at',
  'trg_sales_updated_at', 'trg_system_users_updated_at',
  'trg_stock_not_negative',
  'trg_sync_product_name'
)
ORDER BY tgname;

-- 9.7. Contagem de registros
SELECT '9.7. REGISTROS POR TABELA' AS verificacao;
SELECT 'products' AS tabela, COUNT(*) FROM products
UNION ALL SELECT 'categories', COUNT(*) FROM categories
UNION ALL SELECT 'customers', COUNT(*) FROM customers
UNION ALL SELECT 'suppliers', COUNT(*) FROM suppliers
UNION ALL SELECT 'sales', COUNT(*) FROM sales
UNION ALL SELECT 'sale_items', COUNT(*) FROM sale_items
UNION ALL SELECT 'financial_transactions', COUNT(*) FROM financial_transactions
UNION ALL SELECT 'cash_sessions', COUNT(*) FROM cash_sessions
UNION ALL SELECT 'stock_movements', COUNT(*) FROM stock_movements
UNION ALL SELECT 'store_branches', COUNT(*) FROM store_branches
UNION ALL SELECT 'system_users', COUNT(*) FROM system_users
UNION ALL SELECT 'system_settings', COUNT(*) FROM system_settings
UNION ALL SELECT 'organizations', COUNT(*) FROM organizations
UNION ALL SELECT 'movimentacoes_falhas', COUNT(*) FROM movimentacoes_falhas
ORDER BY tabela;

-- 9.8. Superadmin
SELECT '9.8. SUPERADMIN' AS verificacao;
SELECT email, name, role, superadmin FROM system_users WHERE superadmin = TRUE;

-- 9.9. Organizações
SELECT '9.9. ORGANIZAÇÕES' AS verificacao;
SELECT id, name, created_at FROM organizations ORDER BY created_at DESC;

COMMIT;

-- ==============================================================================
-- RESUMO
-- ==============================================================================
DO $$
BEGIN
  RAISE NOTICE '╔══════════════════════════════════════════════════════════════╗';
  RAISE NOTICE '║    DIAGNÓSTICO COMPLETO EXECUTADO COM SUCESSO!            ║';
  RAISE NOTICE '║                                                          ║';
  RAISE NOTICE '║  ✓ 18 tabelas verificadas/criadas                        ║';
  RAISE NOTICE '║  ✓ 12 funções RPC recriadas                              ║';
  RAISE NOTICE '║  ✓ RLS policies recriadas (com superadmin bypass)        ║';
  RAISE NOTICE '║  ✓ Índices de performance criados                        ║';
  RAISE NOTICE '║  ✓ Triggers de updated_at + estoque + sync recriados     ║';
  RAISE NOTICE '║  ✓ Realtime publication configurada                      ║';
  RAISE NOTICE '║  ✓ Organização padrão + superadmin garantidos            ║';
  RAISE NOTICE '║                                                          ║';
  RAISE NOTICE '║  ⚠ CORREÇÃO CRÍTICA: process_sale_transaction            ║';
  RAISE NOTICE '║    Assinatura corrigida para 11 parâmetros (frontend)    ║';
  RAISE NOTICE '╚══════════════════════════════════════════════════════════════╝';
END $$;
