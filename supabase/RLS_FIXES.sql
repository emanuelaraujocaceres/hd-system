-- ============================================================
-- HD-SYSTEM: CORREÇÕES RLS COMPLETAS
-- Execute este SQL no SQL Editor do Supabase, BLOCO A BLOCO.
-- Cada seção é idempotente (DROP IF EXISTS + CREATE).
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- PRÉ-REQUISITO: Garantir que helper functions existam
-- ────────────────────────────────────────────────────────────

-- is_superadmin(): retorna true se auth.uid() é superadmin
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.system_users
    WHERE id = auth.uid()
      AND superadmin = true
      AND organization_id IS NULL
  );
$$;

-- get_user_org_id(): retorna organization_id do usuário logado
CREATE OR REPLACE FUNCTION public.get_user_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT organization_id FROM public.system_users WHERE id = auth.uid();
$$;

-- get_user_branch_id(): retorna store_branch_id do usuário logado
CREATE OR REPLACE FUNCTION public.get_user_branch_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT store_branch_id FROM public.system_users WHERE id = auth.uid();
$$;

-- get_user_role(): retorna 'admin' ou 'collaborator'
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
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
-- Padrão: superadmin vê tudo, membros da org veem pela filial.
-- ============================================================
-- Helper macro: para cada tabela branch-scoped, criar 4 policies:
--   1. superadmin_select: superadmin lê tudo
--   2. org_branch_select: membro lê pela sua org+filial
--   3. superadmin_insert: superadmin insere em qualquer org+filial
--   4. org_branch_insert: membro insere na sua org+filial
--   5. superadmin_update: superadmin atualiza qualquer org+filial
--   6. org_branch_update: membro atualiza pela sua org+filial
--   7. superadmin_delete: superadmin deleta de qualquer org+filial
--   8. org_branch_delete: membro deleta pela sua org+filial
-- ============================================================

-- ── products ────────────────────────────────────────────────
DROP POLICY IF EXISTS "superadmin_all_products" ON public.products;
DROP POLICY IF EXISTS "org_branch_select_products" ON public.products;
DROP POLICY IF EXISTS "org_branch_insert_products" ON public.products;
DROP POLICY IF EXISTS "org_branch_update_products" ON public.products;
DROP POLICY IF EXISTS "org_branch_delete_products" ON public.products;

CREATE POLICY "superadmin_all_products" ON public.products
  FOR ALL USING (is_superadmin());

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
  FOR ALL USING (is_superadmin());

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
  FOR ALL USING (is_superadmin());

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
  FOR ALL USING (is_superadmin());

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
  FOR ALL USING (is_superadmin());

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
-- NOTA: sale_items NÃO tem organization_id nem store_branch_id.
-- O isolamento é feito via junction com sales (sale_id → sales.id).
-- Policies usam subquery para verificar se a venda pertence à org+filial.
-- ============================================================

DROP POLICY IF EXISTS "superadmin_all_sale_items" ON public.sale_items;
DROP POLICY IF EXISTS "org_branch_select_sale_items" ON public.sale_items;
DROP POLICY IF EXISTS "org_branch_insert_sale_items" ON public.sale_items;
DROP POLICY IF EXISTS "org_branch_update_sale_items" ON public.sale_items;
DROP POLICY IF EXISTS "org_branch_delete_sale_items" ON public.sale_items;

CREATE POLICY "superadmin_all_sale_items" ON public.sale_items
  FOR ALL USING (is_superadmin());

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
  FOR ALL USING (is_superadmin());

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
  FOR ALL USING (is_superadmin());

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
  FOR ALL USING (is_superadmin());

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
  FOR ALL USING (is_superadmin());

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
  FOR ALL USING (is_superadmin());

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
  FOR ALL USING (is_superadmin());

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
  FOR ALL USING (is_superadmin());

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
  FOR ALL USING (is_superadmin());

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
  FOR ALL USING (is_superadmin());

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
DROP POLICY IF EXISTS "superadmin_all_tables" ON public.tables;
DROP POLICY IF EXISTS "org_branch_select_tables" ON public.tables;
DROP POLICY IF EXISTS "org_branch_insert_tables" ON public.tables;
DROP POLICY IF EXISTS "org_branch_update_tables" ON public.tables;
DROP POLICY IF EXISTS "org_branch_delete_tables" ON public.tables;

CREATE POLICY "superadmin_all_tables" ON public.tables
  FOR ALL USING (is_superadmin());

CREATE POLICY "org_branch_select_tables" ON public.tables
  FOR SELECT USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_insert_tables" ON public.tables
  FOR INSERT WITH CHECK (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_update_tables" ON public.tables
  FOR UPDATE USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );

CREATE POLICY "org_branch_delete_tables" ON public.tables
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
  FOR ALL USING (is_superadmin());

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
  FOR ALL USING (is_superadmin());

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
  FOR ALL USING (is_superadmin());

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
  FOR ALL USING (is_superadmin());

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
  FOR ALL USING (is_superadmin());

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
  FOR ALL USING (is_superadmin());

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
  FOR ALL USING (is_superadmin());

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
  FOR ALL USING (is_superadmin());

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
  FOR ALL USING (is_superadmin());

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
  FOR ALL USING (is_superadmin());

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
  FOR ALL USING (is_superadmin());

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
  FOR ALL USING (is_superadmin());

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
  FOR ALL USING (is_superadmin());

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
  FOR ALL USING (is_superadmin());

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
  FOR ALL USING (is_superadmin());

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
CREATE INDEX IF NOT EXISTS idx_tables_org_branch ON public.tables (organization_id, store_branch_id);
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
-- FIM DO RLS_FIXES.sql
-- Execute e cole a resposta aqui para verificação.
-- ────────────────────────────────────────────────────────────
