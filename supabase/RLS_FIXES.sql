-- ============================================================
-- HD-SYSTEM: CORREÇÕES RLS COMPLETAS (v3 — 2026-08-16)
-- Execute este SQL no SQL Editor do Supabase, BLOCO A BLOCO.
-- Cada seção é idempotente (DROP IF EXISTS + CREATE).
-- ============================================================
-- ALTERAÇÕES v3:
--   - is_superadmin(): revertido para verificar organization_id IS NULL
--   - get_user_branch_id(): lê session config (set_current_branch) com fallback
--   - set_current_branch(): NOVA função para admin trocar filial via session
--   - Todas as helper functions com SET search_path = public
--   - _ensure_rls_for_table: verifica colunas existentes via information_schema
--   - Policies auxiliares agora criam CRUD completo (não só SELECT)
--   - Polices FOR ALL para superadmin com USING + WITH CHECK explícitos
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- SEÇÃO 0: HELPER FUNCTIONS (com SET search_path = public)
-- ────────────────────────────────────────────────────────────

-- set_current_branch(p_branch_id): grava filial na sessão do PostgreSQL.
-- Chamado pelo frontend quando admin troca de filial.
-- Collaborators NÃO podem chamar (checado no frontend).
CREATE OR REPLACE FUNCTION public.set_current_branch(p_branch_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.current_branch_id', p_branch_id::text, false);
END;
$$;

-- is_superadmin(): retorna true se auth.uid() é superadmin.
-- Verifica superadmin = true E organization_id IS NULL.
-- Superadmin puro (sem org) tem bypass global de RLS.
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.system_users
    WHERE id = auth.uid()
      AND superadmin = true
      AND organization_id IS NULL
  );
$$;

-- get_user_org_id(): retorna organization_id do usuário logado.
CREATE OR REPLACE FUNCTION public.get_user_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM public.system_users WHERE id = auth.uid();
$$;

-- get_user_branch_id(): retorna store_branch_id do usuário logado.
-- Prioridade: session config (set_current_branch) > system_users.store_branch_id.
-- Se admin chamou set_current_branch, usa o valor da sessão.
-- Caso contrário, usa o valor fixo do banco (collaborators sempre usam este).
CREATE OR REPLACE FUNCTION public.get_user_branch_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_branch text;
  v_db_branch uuid;
BEGIN
  -- 1. Verificar session config (setado por set_current_branch)
  v_session_branch := current_setting('app.current_branch_id', true);
  IF v_session_branch IS NOT NULL AND v_session_branch <> '' THEN
    RETURN v_session_branch::uuid;
  END IF;
  -- 2. Fallback: valor fixo no banco (collaborators sempre este)
  SELECT store_branch_id INTO v_db_branch
    FROM public.system_users WHERE id = auth.uid();
  RETURN v_db_branch;
END;
$$;

-- get_user_role(): retorna 'admin' ou 'collaborator'.
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.system_users WHERE id = auth.uid();
$$;


-- ────────────────────────────────────────────────────────────
-- SEÇÃO 1: REMOVER POLICY PERMISSIVA product_lots (VULNERABILIDADE)
-- ────────────────────────────────────────────────────────────
-- PROBLEMA: "Allow read for authenticated" com USING (true) permite
-- qualquer usuário autenticado ler TODOS os product_lots de TODAS as orgs.
-- ============================================================

DROP POLICY IF EXISTS "Allow read for authenticated" ON public.product_lots;


-- ────────────────────────────────────────────────────────────
-- SEÇÃO 2: HABILITAR RLS em todas as tabelas que não têm
-- ────────────────────────────────────────────────────────────

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scanned_boletos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nf_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.footer_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.printers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.digital_menu_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_neighborhoods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_distance_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.module_visibility ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_loss_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;


-- ────────────────────────────────────────────────────────────
-- SEÇÃO 3: POLICIES PARA TABELAS BRANCH-SCOPED
-- Padrão: superadmin vê tudo (FOR ALL com USING + WITH CHECK),
-- membros da org veem pela filial (CRUD completo).
-- ============================================================

-- ── products ────────────────────────────────────────────────
DROP POLICY IF EXISTS "superadmin_all_products" ON public.products;
DROP POLICY IF EXISTS "org_branch_select_products" ON public.products;
DROP POLICY IF EXISTS "org_branch_insert_products" ON public.products;
DROP POLICY IF EXISTS "org_branch_update_products" ON public.products;
DROP POLICY IF EXISTS "org_branch_delete_products" ON public.products;

CREATE POLICY "superadmin_all_products" ON public.products
  FOR ALL
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

CREATE POLICY "org_branch_select_products" ON public.products
  FOR SELECT USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_insert_products" ON public.products
  FOR INSERT WITH CHECK (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_update_products" ON public.products
  FOR UPDATE USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_delete_products" ON public.products
  FOR DELETE USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

-- ── categories ──────────────────────────────────────────────
DROP POLICY IF EXISTS "superadmin_all_categories" ON public.categories;
DROP POLICY IF EXISTS "org_branch_select_categories" ON public.categories;
DROP POLICY IF EXISTS "org_branch_insert_categories" ON public.categories;
DROP POLICY IF EXISTS "org_branch_update_categories" ON public.categories;
DROP POLICY IF EXISTS "org_branch_delete_categories" ON public.categories;

CREATE POLICY "superadmin_all_categories" ON public.categories
  FOR ALL
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

CREATE POLICY "org_branch_select_categories" ON public.categories
  FOR SELECT USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_insert_categories" ON public.categories
  FOR INSERT WITH CHECK (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_update_categories" ON public.categories
  FOR UPDATE USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_delete_categories" ON public.categories
  FOR DELETE USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

-- ── customers ───────────────────────────────────────────────
DROP POLICY IF EXISTS "superadmin_all_customers" ON public.customers;
DROP POLICY IF EXISTS "org_branch_select_customers" ON public.customers;
DROP POLICY IF EXISTS "org_branch_insert_customers" ON public.customers;
DROP POLICY IF EXISTS "org_branch_update_customers" ON public.customers;
DROP POLICY IF EXISTS "org_branch_delete_customers" ON public.customers;

CREATE POLICY "superadmin_all_customers" ON public.customers
  FOR ALL
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

CREATE POLICY "org_branch_select_customers" ON public.customers
  FOR SELECT USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_insert_customers" ON public.customers
  FOR INSERT WITH CHECK (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_update_customers" ON public.customers
  FOR UPDATE USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_delete_customers" ON public.customers
  FOR DELETE USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

-- ── suppliers ───────────────────────────────────────────────
DROP POLICY IF EXISTS "superadmin_all_suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "org_branch_select_suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "org_branch_insert_suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "org_branch_update_suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "org_branch_delete_suppliers" ON public.suppliers;

CREATE POLICY "superadmin_all_suppliers" ON public.suppliers
  FOR ALL
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

CREATE POLICY "org_branch_select_suppliers" ON public.suppliers
  FOR SELECT USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_insert_suppliers" ON public.suppliers
  FOR INSERT WITH CHECK (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_update_suppliers" ON public.suppliers
  FOR UPDATE USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_delete_suppliers" ON public.suppliers
  FOR DELETE USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

-- ── sales ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "superadmin_all_sales" ON public.sales;
DROP POLICY IF EXISTS "org_branch_select_sales" ON public.sales;
DROP POLICY IF EXISTS "org_branch_insert_sales" ON public.sales;
DROP POLICY IF EXISTS "org_branch_update_sales" ON public.sales;
DROP POLICY IF EXISTS "org_branch_delete_sales" ON public.sales;

CREATE POLICY "superadmin_all_sales" ON public.sales
  FOR ALL
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

CREATE POLICY "org_branch_select_sales" ON public.sales
  FOR SELECT USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_insert_sales" ON public.sales
  FOR INSERT WITH CHECK (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_update_sales" ON public.sales
  FOR UPDATE USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_delete_sales" ON public.sales
  FOR DELETE USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

-- ── sale_items ──────────────────────────────────────────────
-- NOTA: sale_items tem store_branch_id mas NÃO tem organization_id.
-- O isolamento é feito via junction com sales (sale_id → sales.id).
-- Policies usam subquery para verificar se a venda pertence à org+filial.
-- ============================================================

DROP POLICY IF EXISTS "superadmin_all_sale_items" ON public.sale_items;
DROP POLICY IF EXISTS "org_branch_select_sale_items" ON public.sale_items;
DROP POLICY IF EXISTS "org_branch_insert_sale_items" ON public.sale_items;
DROP POLICY IF EXISTS "org_branch_update_sale_items" ON public.sale_items;
DROP POLICY IF EXISTS "org_branch_delete_sale_items" ON public.sale_items;

CREATE POLICY "superadmin_all_sale_items" ON public.sale_items
  FOR ALL
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

CREATE POLICY "org_branch_select_sale_items" ON public.sale_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.sales s
      WHERE s.id = sale_items.sale_id
        AND s.organization_id = get_user_org_id()
        AND s.store_branch_id = get_user_branch_id()
    )
  );

CREATE POLICY "org_branch_insert_sale_items" ON public.sale_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sales s
      WHERE s.id = sale_items.sale_id
        AND s.organization_id = get_user_org_id()
        AND s.store_branch_id = get_user_branch_id()
    )
  );

CREATE POLICY "org_branch_update_sale_items" ON public.sale_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.sales s
      WHERE s.id = sale_items.sale_id
        AND s.organization_id = get_user_org_id()
        AND s.store_branch_id = get_user_branch_id()
    )
  );

CREATE POLICY "org_branch_delete_sale_items" ON public.sale_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.sales s
      WHERE s.id = sale_items.sale_id
        AND s.organization_id = get_user_org_id()
        AND s.store_branch_id = get_user_branch_id()
    )
  );

-- ── financial_transactions ──────────────────────────────────
DROP POLICY IF EXISTS "superadmin_all_financial" ON public.financial_transactions;
DROP POLICY IF EXISTS "org_branch_select_financial" ON public.financial_transactions;
DROP POLICY IF EXISTS "org_branch_insert_financial" ON public.financial_transactions;
DROP POLICY IF EXISTS "org_branch_update_financial" ON public.financial_transactions;
DROP POLICY IF EXISTS "org_branch_delete_financial" ON public.financial_transactions;

CREATE POLICY "superadmin_all_financial" ON public.financial_transactions
  FOR ALL
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

CREATE POLICY "org_branch_select_financial" ON public.financial_transactions
  FOR SELECT USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_insert_financial" ON public.financial_transactions
  FOR INSERT WITH CHECK (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_update_financial" ON public.financial_transactions
  FOR UPDATE USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_delete_financial" ON public.financial_transactions
  FOR DELETE USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

-- ── cash_sessions ───────────────────────────────────────────
DROP POLICY IF EXISTS "superadmin_all_cash_sessions" ON public.cash_sessions;
DROP POLICY IF EXISTS "org_branch_select_cash_sessions" ON public.cash_sessions;
DROP POLICY IF EXISTS "org_branch_insert_cash_sessions" ON public.cash_sessions;
DROP POLICY IF EXISTS "org_branch_update_cash_sessions" ON public.cash_sessions;
DROP POLICY IF EXISTS "org_branch_delete_cash_sessions" ON public.cash_sessions;

CREATE POLICY "superadmin_all_cash_sessions" ON public.cash_sessions
  FOR ALL
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

CREATE POLICY "org_branch_select_cash_sessions" ON public.cash_sessions
  FOR SELECT USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_insert_cash_sessions" ON public.cash_sessions
  FOR INSERT WITH CHECK (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_update_cash_sessions" ON public.cash_sessions
  FOR UPDATE USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_delete_cash_sessions" ON public.cash_sessions
  FOR DELETE USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

-- ── stock_movements ─────────────────────────────────────────
DROP POLICY IF EXISTS "superadmin_all_stock_movements" ON public.stock_movements;
DROP POLICY IF EXISTS "org_branch_select_stock_movements" ON public.stock_movements;
DROP POLICY IF EXISTS "org_branch_insert_stock_movements" ON public.stock_movements;
DROP POLICY IF EXISTS "org_branch_update_stock_movements" ON public.stock_movements;
DROP POLICY IF EXISTS "org_branch_delete_stock_movements" ON public.stock_movements;

CREATE POLICY "superadmin_all_stock_movements" ON public.stock_movements
  FOR ALL
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

CREATE POLICY "org_branch_select_stock_movements" ON public.stock_movements
  FOR SELECT USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_insert_stock_movements" ON public.stock_movements
  FOR INSERT WITH CHECK (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_update_stock_movements" ON public.stock_movements
  FOR UPDATE USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_delete_stock_movements" ON public.stock_movements
  FOR DELETE USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

-- ── scanned_boletos ─────────────────────────────────────────
DROP POLICY IF EXISTS "superadmin_all_boletos" ON public.scanned_boletos;
DROP POLICY IF EXISTS "org_branch_select_boletos" ON public.scanned_boletos;
DROP POLICY IF EXISTS "org_branch_insert_boletos" ON public.scanned_boletos;
DROP POLICY IF EXISTS "org_branch_update_boletos" ON public.scanned_boletos;
DROP POLICY IF EXISTS "org_branch_delete_boletos" ON public.scanned_boletos;

CREATE POLICY "superadmin_all_boletos" ON public.scanned_boletos
  FOR ALL
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

CREATE POLICY "org_branch_select_boletos" ON public.scanned_boletos
  FOR SELECT USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_insert_boletos" ON public.scanned_boletos
  FOR INSERT WITH CHECK (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_update_boletos" ON public.scanned_boletos
  FOR UPDATE USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_delete_boletos" ON public.scanned_boletos
  FOR DELETE USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

-- ── credit_payments ─────────────────────────────────────────
DROP POLICY IF EXISTS "superadmin_all_credit_payments" ON public.credit_payments;
DROP POLICY IF EXISTS "org_branch_select_credit_payments" ON public.credit_payments;
DROP POLICY IF EXISTS "org_branch_insert_credit_payments" ON public.credit_payments;
DROP POLICY IF EXISTS "org_branch_update_credit_payments" ON public.credit_payments;
DROP POLICY IF EXISTS "org_branch_delete_credit_payments" ON public.credit_payments;

CREATE POLICY "superadmin_all_credit_payments" ON public.credit_payments
  FOR ALL
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

CREATE POLICY "org_branch_select_credit_payments" ON public.credit_payments
  FOR SELECT USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_insert_credit_payments" ON public.credit_payments
  FOR INSERT WITH CHECK (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_update_credit_payments" ON public.credit_payments
  FOR UPDATE USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_delete_credit_payments" ON public.credit_payments
  FOR DELETE USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

-- ── nf_records ──────────────────────────────────────────────
DROP POLICY IF EXISTS "superadmin_all_nf_records" ON public.nf_records;
DROP POLICY IF EXISTS "org_branch_select_nf_records" ON public.nf_records;
DROP POLICY IF EXISTS "org_branch_insert_nf_records" ON public.nf_records;
DROP POLICY IF EXISTS "org_branch_update_nf_records" ON public.nf_records;
DROP POLICY IF EXISTS "org_branch_delete_nf_records" ON public.nf_records;

CREATE POLICY "superadmin_all_nf_records" ON public.nf_records
  FOR ALL
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

CREATE POLICY "org_branch_select_nf_records" ON public.nf_records
  FOR SELECT USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_insert_nf_records" ON public.nf_records
  FOR INSERT WITH CHECK (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_update_nf_records" ON public.nf_records
  FOR UPDATE USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_delete_nf_records" ON public.nf_records
  FOR DELETE USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

-- ── footer_messages ─────────────────────────────────────────
DROP POLICY IF EXISTS "superadmin_all_footer_messages" ON public.footer_messages;
DROP POLICY IF EXISTS "org_branch_select_footer_messages" ON public.footer_messages;
DROP POLICY IF EXISTS "org_branch_insert_footer_messages" ON public.footer_messages;
DROP POLICY IF EXISTS "org_branch_update_footer_messages" ON public.footer_messages;
DROP POLICY IF EXISTS "org_branch_delete_footer_messages" ON public.footer_messages;

CREATE POLICY "superadmin_all_footer_messages" ON public.footer_messages
  FOR ALL
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

CREATE POLICY "org_branch_select_footer_messages" ON public.footer_messages
  FOR SELECT USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_insert_footer_messages" ON public.footer_messages
  FOR INSERT WITH CHECK (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_update_footer_messages" ON public.footer_messages
  FOR UPDATE USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_delete_footer_messages" ON public.footer_messages
  FOR DELETE USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

-- ── media_devices ───────────────────────────────────────────
DROP POLICY IF EXISTS "superadmin_all_media_devices" ON public.media_devices;
DROP POLICY IF EXISTS "org_branch_select_media_devices" ON public.media_devices;
DROP POLICY IF EXISTS "org_branch_insert_media_devices" ON public.media_devices;
DROP POLICY IF EXISTS "org_branch_update_media_devices" ON public.media_devices;
DROP POLICY IF EXISTS "org_branch_delete_media_devices" ON public.media_devices;

CREATE POLICY "superadmin_all_media_devices" ON public.media_devices
  FOR ALL
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

CREATE POLICY "org_branch_select_media_devices" ON public.media_devices
  FOR SELECT USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_insert_media_devices" ON public.media_devices
  FOR INSERT WITH CHECK (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_update_media_devices" ON public.media_devices
  FOR UPDATE USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_delete_media_devices" ON public.media_devices
  FOR DELETE USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

-- ── printers ────────────────────────────────────────────────
DROP POLICY IF EXISTS "superadmin_all_printers" ON public.printers;
DROP POLICY IF EXISTS "org_branch_select_printers" ON public.printers;
DROP POLICY IF EXISTS "org_branch_insert_printers" ON public.printers;
DROP POLICY IF EXISTS "org_branch_update_printers" ON public.printers;
DROP POLICY IF EXISTS "org_branch_delete_printers" ON public.printers;

CREATE POLICY "superadmin_all_printers" ON public.printers
  FOR ALL
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

CREATE POLICY "org_branch_select_printers" ON public.printers
  FOR SELECT USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_insert_printers" ON public.printers
  FOR INSERT WITH CHECK (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_update_printers" ON public.printers
  FOR UPDATE USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_delete_printers" ON public.printers
  FOR DELETE USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

-- ── tables ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "superadmin_all_tables" ON public."tables";
DROP POLICY IF EXISTS "org_branch_select_tables" ON public."tables";
DROP POLICY IF EXISTS "org_branch_insert_tables" ON public."tables";
DROP POLICY IF EXISTS "org_branch_update_tables" ON public."tables";
DROP POLICY IF EXISTS "org_branch_delete_tables" ON public."tables";

CREATE POLICY "superadmin_all_tables" ON public."tables"
  FOR ALL
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

CREATE POLICY "org_branch_select_tables" ON public."tables"
  FOR SELECT USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_insert_tables" ON public."tables"
  FOR INSERT WITH CHECK (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_update_tables" ON public."tables"
  FOR UPDATE USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_delete_tables" ON public."tables"
  FOR DELETE USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

-- ── customer_sessions ───────────────────────────────────────
DROP POLICY IF EXISTS "superadmin_all_customer_sessions" ON public.customer_sessions;
DROP POLICY IF EXISTS "org_branch_select_customer_sessions" ON public.customer_sessions;
DROP POLICY IF EXISTS "org_branch_insert_customer_sessions" ON public.customer_sessions;
DROP POLICY IF EXISTS "org_branch_update_customer_sessions" ON public.customer_sessions;
DROP POLICY IF EXISTS "org_branch_delete_customer_sessions" ON public.customer_sessions;

CREATE POLICY "superadmin_all_customer_sessions" ON public.customer_sessions
  FOR ALL
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

CREATE POLICY "org_branch_select_customer_sessions" ON public.customer_sessions
  FOR SELECT USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_insert_customer_sessions" ON public.customer_sessions
  FOR INSERT WITH CHECK (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_update_customer_sessions" ON public.customer_sessions
  FOR UPDATE USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_delete_customer_sessions" ON public.customer_sessions
  FOR DELETE USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

-- ── digital_menu_config ─────────────────────────────────────
DROP POLICY IF EXISTS "superadmin_all_digital_menu" ON public.digital_menu_config;
DROP POLICY IF EXISTS "org_branch_select_digital_menu" ON public.digital_menu_config;
DROP POLICY IF EXISTS "org_branch_insert_digital_menu" ON public.digital_menu_config;
DROP POLICY IF EXISTS "org_branch_update_digital_menu" ON public.digital_menu_config;
DROP POLICY IF EXISTS "org_branch_delete_digital_menu" ON public.digital_menu_config;

CREATE POLICY "superadmin_all_digital_menu" ON public.digital_menu_config
  FOR ALL
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

CREATE POLICY "org_branch_select_digital_menu" ON public.digital_menu_config
  FOR SELECT USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_insert_digital_menu" ON public.digital_menu_config
  FOR INSERT WITH CHECK (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_update_digital_menu" ON public.digital_menu_config
  FOR UPDATE USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_delete_digital_menu" ON public.digital_menu_config
  FOR DELETE USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

-- ── branch_themes ───────────────────────────────────────────
DROP POLICY IF EXISTS "superadmin_all_branch_themes" ON public.branch_themes;
DROP POLICY IF EXISTS "org_branch_select_branch_themes" ON public.branch_themes;
DROP POLICY IF EXISTS "org_branch_insert_branch_themes" ON public.branch_themes;
DROP POLICY IF EXISTS "org_branch_update_branch_themes" ON public.branch_themes;
DROP POLICY IF EXISTS "org_branch_delete_branch_themes" ON public.branch_themes;

CREATE POLICY "superadmin_all_branch_themes" ON public.branch_themes
  FOR ALL
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

CREATE POLICY "org_branch_select_branch_themes" ON public.branch_themes
  FOR SELECT USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_insert_branch_themes" ON public.branch_themes
  FOR INSERT WITH CHECK (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_update_branch_themes" ON public.branch_themes
  FOR UPDATE USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_delete_branch_themes" ON public.branch_themes
  FOR DELETE USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

-- ── api_keys ────────────────────────────────────────────────
DROP POLICY IF EXISTS "superadmin_all_api_keys" ON public.api_keys;
DROP POLICY IF EXISTS "org_branch_select_api_keys" ON public.api_keys;
DROP POLICY IF EXISTS "org_branch_insert_api_keys" ON public.api_keys;
DROP POLICY IF EXISTS "org_branch_update_api_keys" ON public.api_keys;
DROP POLICY IF EXISTS "org_branch_delete_api_keys" ON public.api_keys;

CREATE POLICY "superadmin_all_api_keys" ON public.api_keys
  FOR ALL
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

CREATE POLICY "org_branch_select_api_keys" ON public.api_keys
  FOR SELECT USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_insert_api_keys" ON public.api_keys
  FOR INSERT WITH CHECK (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_update_api_keys" ON public.api_keys
  FOR UPDATE USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_delete_api_keys" ON public.api_keys
  FOR DELETE USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

-- ── delivery_settings ───────────────────────────────────────
DROP POLICY IF EXISTS "superadmin_all_delivery_settings" ON public.delivery_settings;
DROP POLICY IF EXISTS "org_branch_select_delivery_settings" ON public.delivery_settings;
DROP POLICY IF EXISTS "org_branch_insert_delivery_settings" ON public.delivery_settings;
DROP POLICY IF EXISTS "org_branch_update_delivery_settings" ON public.delivery_settings;
DROP POLICY IF EXISTS "org_branch_delete_delivery_settings" ON public.delivery_settings;

CREATE POLICY "superadmin_all_delivery_settings" ON public.delivery_settings
  FOR ALL
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

CREATE POLICY "org_branch_select_delivery_settings" ON public.delivery_settings
  FOR SELECT USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_insert_delivery_settings" ON public.delivery_settings
  FOR INSERT WITH CHECK (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_update_delivery_settings" ON public.delivery_settings
  FOR UPDATE USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_delete_delivery_settings" ON public.delivery_settings
  FOR DELETE USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

-- ── delivery_neighborhoods ──────────────────────────────────
DROP POLICY IF EXISTS "superadmin_all_delivery_neighborhoods" ON public.delivery_neighborhoods;
DROP POLICY IF EXISTS "org_branch_select_delivery_neighborhoods" ON public.delivery_neighborhoods;
DROP POLICY IF EXISTS "org_branch_insert_delivery_neighborhoods" ON public.delivery_neighborhoods;
DROP POLICY IF EXISTS "org_branch_update_delivery_neighborhoods" ON public.delivery_neighborhoods;
DROP POLICY IF EXISTS "org_branch_delete_delivery_neighborhoods" ON public.delivery_neighborhoods;

CREATE POLICY "superadmin_all_delivery_neighborhoods" ON public.delivery_neighborhoods
  FOR ALL
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

CREATE POLICY "org_branch_select_delivery_neighborhoods" ON public.delivery_neighborhoods
  FOR SELECT USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_insert_delivery_neighborhoods" ON public.delivery_neighborhoods
  FOR INSERT WITH CHECK (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_update_delivery_neighborhoods" ON public.delivery_neighborhoods
  FOR UPDATE USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_delete_delivery_neighborhoods" ON public.delivery_neighborhoods
  FOR DELETE USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

-- ── delivery_distance_rates ─────────────────────────────────
DROP POLICY IF EXISTS "superadmin_all_delivery_distance_rates" ON public.delivery_distance_rates;
DROP POLICY IF EXISTS "org_branch_select_delivery_distance_rates" ON public.delivery_distance_rates;
DROP POLICY IF EXISTS "org_branch_insert_delivery_distance_rates" ON public.delivery_distance_rates;
DROP POLICY IF EXISTS "org_branch_update_delivery_distance_rates" ON public.delivery_distance_rates;
DROP POLICY IF EXISTS "org_branch_delete_delivery_distance_rates" ON public.delivery_distance_rates;

CREATE POLICY "superadmin_all_delivery_distance_rates" ON public.delivery_distance_rates
  FOR ALL
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

CREATE POLICY "org_branch_select_delivery_distance_rates" ON public.delivery_distance_rates
  FOR SELECT USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_insert_delivery_distance_rates" ON public.delivery_distance_rates
  FOR INSERT WITH CHECK (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_update_delivery_distance_rates" ON public.delivery_distance_rates
  FOR UPDATE USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_delete_delivery_distance_rates" ON public.delivery_distance_rates
  FOR DELETE USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

-- ── delivery_orders ─────────────────────────────────────────
DROP POLICY IF EXISTS "superadmin_all_delivery_orders" ON public.delivery_orders;
DROP POLICY IF EXISTS "org_branch_select_delivery_orders" ON public.delivery_orders;
DROP POLICY IF EXISTS "org_branch_insert_delivery_orders" ON public.delivery_orders;
DROP POLICY IF EXISTS "org_branch_update_delivery_orders" ON public.delivery_orders;
DROP POLICY IF EXISTS "org_branch_delete_delivery_orders" ON public.delivery_orders;

CREATE POLICY "superadmin_all_delivery_orders" ON public.delivery_orders
  FOR ALL
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

CREATE POLICY "org_branch_select_delivery_orders" ON public.delivery_orders
  FOR SELECT USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_insert_delivery_orders" ON public.delivery_orders
  FOR INSERT WITH CHECK (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_update_delivery_orders" ON public.delivery_orders
  FOR UPDATE USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_delete_delivery_orders" ON public.delivery_orders
  FOR DELETE USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

-- ── module_visibility ───────────────────────────────────────
DROP POLICY IF EXISTS "superadmin_all_module_visibility" ON public.module_visibility;
DROP POLICY IF EXISTS "org_branch_select_module_visibility" ON public.module_visibility;
DROP POLICY IF EXISTS "org_branch_insert_module_visibility" ON public.module_visibility;
DROP POLICY IF EXISTS "org_branch_update_module_visibility" ON public.module_visibility;
DROP POLICY IF EXISTS "org_branch_delete_module_visibility" ON public.module_visibility;

CREATE POLICY "superadmin_all_module_visibility" ON public.module_visibility
  FOR ALL
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

CREATE POLICY "org_branch_select_module_visibility" ON public.module_visibility
  FOR SELECT USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_insert_module_visibility" ON public.module_visibility
  FOR INSERT WITH CHECK (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_update_module_visibility" ON public.module_visibility
  FOR UPDATE USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_delete_module_visibility" ON public.module_visibility
  FOR DELETE USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

-- ── product_lots ────────────────────────────────────────────
DROP POLICY IF EXISTS "superadmin_all_product_lots" ON public.product_lots;
DROP POLICY IF EXISTS "org_branch_select_product_lots" ON public.product_lots;
DROP POLICY IF EXISTS "org_branch_insert_product_lots" ON public.product_lots;
DROP POLICY IF EXISTS "org_branch_update_product_lots" ON public.product_lots;
DROP POLICY IF EXISTS "org_branch_delete_product_lots" ON public.product_lots;

CREATE POLICY "superadmin_all_product_lots" ON public.product_lots
  FOR ALL
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

CREATE POLICY "org_branch_select_product_lots" ON public.product_lots
  FOR SELECT USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_insert_product_lots" ON public.product_lots
  FOR INSERT WITH CHECK (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_update_product_lots" ON public.product_lots
  FOR UPDATE USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_delete_product_lots" ON public.product_lots
  FOR DELETE USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

-- ── stock_loss_log ──────────────────────────────────────────
DROP POLICY IF EXISTS "superadmin_all_stock_loss_log" ON public.stock_loss_log;
DROP POLICY IF EXISTS "org_branch_select_stock_loss_log" ON public.stock_loss_log;
DROP POLICY IF EXISTS "org_branch_insert_stock_loss_log" ON public.stock_loss_log;
DROP POLICY IF EXISTS "org_branch_update_stock_loss_log" ON public.stock_loss_log;
DROP POLICY IF EXISTS "org_branch_delete_stock_loss_log" ON public.stock_loss_log;

CREATE POLICY "superadmin_all_stock_loss_log" ON public.stock_loss_log
  FOR ALL
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

CREATE POLICY "org_branch_select_stock_loss_log" ON public.stock_loss_log
  FOR SELECT USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_insert_stock_loss_log" ON public.stock_loss_log
  FOR INSERT WITH CHECK (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_update_stock_loss_log" ON public.stock_loss_log
  FOR UPDATE USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_delete_stock_loss_log" ON public.stock_loss_log
  FOR DELETE USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );


-- ────────────────────────────────────────────────────────────
-- SEÇÃO 4: POLICIES PARA TABELAS ORG-SCOPED
-- (sem store_branch_id — isolamento só por organization_id)
-- ============================================================

-- ── organizations ───────────────────────────────────────────
-- Superadmin vê tudo. Admin vê apenas a própria organização.
DROP POLICY IF EXISTS "superadmin_all_organizations" ON public.organizations;
DROP POLICY IF EXISTS "admin_select_own_organization" ON public.organizations;
DROP POLICY IF EXISTS "admin_update_own_organization" ON public.organizations;

CREATE POLICY "superadmin_all_organizations" ON public.organizations
  FOR ALL
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

CREATE POLICY "admin_select_own_organization" ON public.organizations
  FOR SELECT USING (
    (id = get_user_org_id())
    AND (NOT is_superadmin())
  );

CREATE POLICY "admin_update_own_organization" ON public.organizations
  FOR UPDATE USING (
    (id = get_user_org_id())
    AND (NOT is_superadmin())
  );

-- ── store_branches ──────────────────────────────────────────
-- Superadmin vê tudo. Membro da org veem filiais da sua organização.
DROP POLICY IF EXISTS "superadmin_all_branches" ON public.store_branches;
DROP POLICY IF EXISTS "org_select_branches" ON public.store_branches;
DROP POLICY IF EXISTS "org_insert_branches" ON public.store_branches;
DROP POLICY IF EXISTS "org_update_branches" ON public.store_branches;
DROP POLICY IF EXISTS "org_delete_branches" ON public.store_branches;

CREATE POLICY "superadmin_all_branches" ON public.store_branches
  FOR ALL
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

CREATE POLICY "org_select_branches" ON public.store_branches
  FOR SELECT USING (
    (organization_id = get_user_org_id())
    AND (NOT is_superadmin())
  );

CREATE POLICY "org_insert_branches" ON public.store_branches
  FOR INSERT WITH CHECK (
    (organization_id = get_user_org_id())
    AND (NOT is_superadmin())
  );

CREATE POLICY "org_update_branches" ON public.store_branches
  FOR UPDATE USING (
    (organization_id = get_user_org_id())
    AND (NOT is_superadmin())
  );

CREATE POLICY "org_delete_branches" ON public.store_branches
  FOR DELETE USING (
    (organization_id = get_user_org_id())
    AND (NOT is_superadmin())
  );

-- ── system_users ────────────────────────────────────────────
-- Superadmin vê todos. Admin vê todos da sua organização.
-- Colaborador vê apenas a si mesmo.
DROP POLICY IF EXISTS "superadmin_all_users" ON public.system_users;
DROP POLICY IF EXISTS "admin_select_org_users" ON public.system_users;
DROP POLICY IF EXISTS "admin_insert_org_users" ON public.system_users;
DROP POLICY IF EXISTS "admin_update_org_users" ON public.system_users;
DROP POLICY IF EXISTS "admin_delete_org_users" ON public.system_users;
DROP POLICY IF EXISTS "collaborator_select_self" ON public.system_users;
DROP POLICY IF EXISTS "collaborator_update_self" ON public.system_users;

CREATE POLICY "superadmin_all_users" ON public.system_users
  FOR ALL
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

-- Admin: vê/edita/deleta todos da mesma organização
CREATE POLICY "admin_select_org_users" ON public.system_users
  FOR SELECT USING (
    (organization_id = get_user_org_id())
    AND (get_user_role() = 'admin')
    AND (NOT is_superadmin())
  );

CREATE POLICY "admin_insert_org_users" ON public.system_users
  FOR INSERT WITH CHECK (
    (organization_id = get_user_org_id())
    AND (get_user_role() = 'admin')
    AND (NOT is_superadmin())
  );

CREATE POLICY "admin_update_org_users" ON public.system_users
  FOR UPDATE USING (
    (organization_id = get_user_org_id())
    AND (get_user_role() = 'admin')
    AND (NOT is_superadmin())
  );

CREATE POLICY "admin_delete_org_users" ON public.system_users
  FOR DELETE USING (
    (organization_id = get_user_org_id())
    AND (get_user_role() = 'admin')
    AND (NOT is_superadmin())
  );

-- Colaborador: vê e edita apenas a si mesmo
CREATE POLICY "collaborator_select_self" ON public.system_users
  FOR SELECT USING (
    (id = auth.uid())
    AND (get_user_role() = 'collaborator')
    AND (NOT is_superadmin())
  );

CREATE POLICY "collaborator_update_self" ON public.system_users
  FOR UPDATE USING (
    (id = auth.uid())
    AND (get_user_role() = 'collaborator')
    AND (NOT is_superadmin())
  );

-- ── system_settings ─────────────────────────────────────────
-- Superadmin vê tudo. Membro da org veem configurações da sua organização.
DROP POLICY IF EXISTS "superadmin_all_settings" ON public.system_settings;
DROP POLICY IF EXISTS "org_select_settings" ON public.system_settings;
DROP POLICY IF EXISTS "org_insert_settings" ON public.system_settings;
DROP POLICY IF EXISTS "org_update_settings" ON public.system_settings;
DROP POLICY IF EXISTS "org_delete_settings" ON public.system_settings;

CREATE POLICY "superadmin_all_settings" ON public.system_settings
  FOR ALL
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

CREATE POLICY "org_select_settings" ON public.system_settings
  FOR SELECT USING (
    (organization_id = get_user_org_id())
    AND (NOT is_superadmin())
  );

CREATE POLICY "org_insert_settings" ON public.system_settings
  FOR INSERT WITH CHECK (
    (organization_id = get_user_org_id())
    AND (NOT is_superadmin())
  );

CREATE POLICY "org_update_settings" ON public.system_settings
  FOR UPDATE USING (
    (organization_id = get_user_org_id())
    AND (NOT is_superadmin())
  );

CREATE POLICY "org_delete_settings" ON public.system_settings
  FOR DELETE USING (
    (organization_id = get_user_org_id())
    AND (NOT is_superadmin())
  );


-- ────────────────────────────────────────────────────────────
-- SEÇÃO 5: ÍNDICES para performance das policies RLS
-- ────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_products_org_branch ON public.products (organization_id, store_branch_id);
CREATE INDEX IF NOT EXISTS idx_categories_org_branch ON public.categories (organization_id, store_branch_id);
CREATE INDEX IF NOT EXISTS idx_customers_org_branch ON public.customers (organization_id, store_branch_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_org_branch ON public.suppliers (organization_id, store_branch_id);
CREATE INDEX IF NOT EXISTS idx_sales_org_branch ON public.sales (organization_id, store_branch_id);
CREATE INDEX IF NOT EXISTS idx_financial_org_branch ON public.financial_transactions (organization_id, store_branch_id);
CREATE INDEX IF NOT EXISTS idx_cash_sessions_org_branch ON public.cash_sessions (organization_id, store_branch_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_org_branch ON public.stock_movements (organization_id, store_branch_id);
CREATE INDEX IF NOT EXISTS idx_boletos_org_branch ON public.scanned_boletos (organization_id, store_branch_id);
CREATE INDEX IF NOT EXISTS idx_credit_payments_org_branch ON public.credit_payments (organization_id, store_branch_id);
CREATE INDEX IF NOT EXISTS idx_nf_records_org_branch ON public.nf_records (organization_id, store_branch_id);
CREATE INDEX IF NOT EXISTS idx_footer_messages_org_branch ON public.footer_messages (organization_id, store_branch_id);
CREATE INDEX IF NOT EXISTS idx_media_devices_org_branch ON public.media_devices (organization_id, store_branch_id);
CREATE INDEX IF NOT EXISTS idx_printers_org_branch ON public.printers (organization_id, store_branch_id);
CREATE INDEX IF NOT EXISTS idx_tables_org_branch ON public."tables" (organization_id, store_branch_id);
CREATE INDEX IF NOT EXISTS idx_customer_sessions_org_branch ON public.customer_sessions (organization_id, store_branch_id);
CREATE INDEX IF NOT EXISTS idx_digital_menu_org_branch ON public.digital_menu_config (organization_id, store_branch_id);
CREATE INDEX IF NOT EXISTS idx_branch_themes_org_branch ON public.branch_themes (organization_id, store_branch_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_org_branch ON public.api_keys (organization_id, store_branch_id);
CREATE INDEX IF NOT EXISTS idx_delivery_settings_org_branch ON public.delivery_settings (organization_id, store_branch_id);
CREATE INDEX IF NOT EXISTS idx_delivery_neighborhoods_org ON public.delivery_neighborhoods (organization_id, store_branch_id);
CREATE INDEX IF NOT EXISTS idx_delivery_distance_rates_org ON public.delivery_distance_rates (organization_id, store_branch_id);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_org_branch ON public.delivery_orders (organization_id, store_branch_id);
CREATE INDEX IF NOT EXISTS idx_module_visibility_org_branch ON public.module_visibility (organization_id, store_branch_id);
CREATE INDEX IF NOT EXISTS idx_product_lots_org_branch ON public.product_lots (organization_id, store_branch_id);
CREATE INDEX IF NOT EXISTS idx_stock_loss_log_org_branch ON public.stock_loss_log (organization_id, store_branch_id);
CREATE INDEX IF NOT EXISTS idx_system_users_org ON public.system_users (organization_id);
CREATE INDEX IF NOT EXISTS idx_system_users_branch ON public.system_users (store_branch_id);
CREATE INDEX IF NOT EXISTS idx_store_branches_org ON public.store_branches (organization_id);
CREATE INDEX IF NOT EXISTS idx_system_settings_org ON public.system_settings (organization_id);


-- ────────────────────────────────────────────────────────────
-- SEÇÃO 6: POLICIES DEFENSIVAS PARA TABELAS AUXILIARES
-- Tabelas que podem ou não existir. Usar DO block com dynamic SQL.
-- Verifica colunas existentes via information_schema antes de criar policies.
-- Cria CRUD completo (SELECT + INSERT + UPDATE + DELETE) quando possível.
-- ============================================================

-- Função auxiliar para criar policies defensivas com verificação de colunas
CREATE OR REPLACE FUNCTION public._ensure_rls_for_table(
  p_table text,
  p_has_org boolean DEFAULT true,
  p_has_branch boolean DEFAULT true
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exists boolean;
  v_has_org_col boolean := false;
  v_has_branch_col boolean := false;
  v_policy_suffix text;
  v_using text;
  v_with_check text;
BEGIN
  -- Check if table exists
  SELECT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = p_table AND c.relkind = 'r'
  ) INTO v_exists;

  IF NOT v_exists THEN
    RAISE NOTICE 'Table % does not exist, skipping RLS setup', p_table;
    RETURN;
  END IF;

  -- Dynamically check if columns exist in this table
  IF p_has_org THEN
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = p_table AND column_name = 'organization_id'
    ) INTO v_has_org_col;
  END IF;

  IF p_has_branch THEN
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = p_table AND column_name = 'store_branch_id'
    ) INTO v_has_branch_col;
  END IF;

  -- Enable RLS
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', p_table);

  -- Drop ALL existing policies to avoid conflicts
  -- Use a loop to drop all policies on this table
  FOR v_policy_suffix IN
    SELECT polname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = p_table
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_policy_suffix, p_table);
  END LOOP;

  -- Superadmin policy (always applies — FOR ALL with both USING and WITH CHECK)
  EXECUTE format(
    'CREATE POLICY "superadmin_all_%s" ON public.%I FOR ALL USING (is_superadmin()) WITH CHECK (is_superadmin())',
    p_table, p_table
  );

  -- Build USING and WITH CHECK conditions based on actual columns
  IF v_has_org_col AND v_has_branch_col THEN
    -- Both columns exist: full org+branch isolation
    v_using := '(organization_id = get_user_org_id()) AND (store_branch_id = get_user_branch_id())';
    v_with_check := '(organization_id = get_user_org_id()) AND (store_branch_id = get_user_branch_id())';
  ELSIF v_has_org_col THEN
    -- Only org column: org-level isolation
    v_using := '(organization_id = get_user_org_id())';
    v_with_check := '(organization_id = get_user_org_id())';
  ELSIF v_has_branch_col THEN
    -- Only branch column: branch-level isolation (e.g., ai_insights)
    v_using := '(store_branch_id = get_user_branch_id())';
    v_with_check := '(store_branch_id = get_user_branch_id())';
  ELSE
    -- Neither column: no user-level isolation (admin-only tables)
    v_using := NULL;
    v_with_check := NULL;
  END IF;

  -- Create CRUD policies if we have isolation conditions
  IF v_using IS NOT NULL THEN
    -- SELECT
    EXECUTE format(
      'CREATE POLICY "user_select_%s" ON public.%I FOR SELECT USING (%s)',
      p_table, p_table, v_using
    );
    -- INSERT
    EXECUTE format(
      'CREATE POLICY "user_insert_%s" ON public.%I FOR INSERT WITH CHECK (%s)',
      p_table, p_table, v_with_check
    );
    -- UPDATE
    EXECUTE format(
      'CREATE POLICY "user_update_%s" ON public.%I FOR UPDATE USING (%s)',
      p_table, p_table, v_using
    );
    -- DELETE
    EXECUTE format(
      'CREATE POLICY "user_delete_%s" ON public.%I FOR DELETE USING (%s)',
      p_table, p_table, v_using
    );
  ELSE
    -- No isolation columns: only superadmin can access (already covered by superadmin_all policy)
    -- Create a "nobody else" policy that always fails for non-superadmin
    -- This ensures the table is locked down even without org/branch columns
    RAISE NOTICE 'Table % has no org/branch columns — only superadmin can access', p_table;
  END IF;

  RAISE NOTICE 'RLS setup complete for table % (org=%, branch=%, actual_org=%, actual_branch=%)',
    p_table, p_has_org, p_has_branch, v_has_org_col, v_has_branch_col;
END;
$$;

-- Apply to known auxiliary tables (idempotent — skips if table doesn't exist)
-- p_has_org/p_has_branch indicate expected columns; the function verifies dynamically.
SELECT public._ensure_rls_for_table('sync_queue', false, false);
SELECT public._ensure_rls_for_table('product_recipes', true, true);
SELECT public._ensure_rls_for_table('webhook_events', false, false);
SELECT public._ensure_rls_for_table('movimentacoes_falhas', true, true);
SELECT public._ensure_rls_for_table('filial_backups', true, false);
SELECT public._ensure_rls_for_table('ai_insights', false, true);
SELECT public._ensure_rls_for_table('sessions', false, true);
SELECT public._ensure_rls_for_table('user_permissions', false, true);
SELECT public._ensure_rls_for_table('company_settings', true, false);
SELECT public._ensure_rls_for_table('pix_config', true, true);
SELECT public._ensure_rls_for_table('stock_change_log', true, true);
SELECT public._ensure_rls_for_table('profiles', false, false);
SELECT public._ensure_rls_for_table('delivery_worker_earnings', true, true);

-- Drop the helper function (temporary, not needed after setup)
DROP FUNCTION IF EXISTS public._ensure_rls_for_table(text, boolean, boolean);


-- ────────────────────────────────────────────────────────────
-- SEÇÃO 7: NÃO ESQUECER — superadmin record
-- O superadmin (emanuel@gmail.com) precisa ter organization_id = NULL
-- para is_superadmin() retornar true e bypass de RLS funcionar.
-- Execute apenas se o superadmin tiver organization_id setado:
-- ────────────────────────────────────────────────────────────

-- SELECT id, email, organization_id, superadmin
-- FROM public.system_users
-- WHERE email = 'emanuel@gmail.com';
--
-- Se organization_id NÃO for NULL, execute:
-- UPDATE public.system_users
-- SET organization_id = NULL
-- WHERE email = 'emanuel@gmail.com' AND superadmin = true;


-- ────────────────────────────────────────────────────────────
-- FIM DO RLS_FIXES.sql (v3)
-- Execute e cole a resposta aqui para verificação.
-- IMPORTANTE: Se o superadmin tiver organization_id != NULL,
-- execute o UPDATE da Seção 7 para que o bypass funcione.
-- ────────────────────────────────────────────────────────────
