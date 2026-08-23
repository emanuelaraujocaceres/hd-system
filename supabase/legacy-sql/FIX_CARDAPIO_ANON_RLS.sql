-- ============================================================
-- FIX: Cardápio delivery/mesa não abre — RLS bloqueia anon
-- Erro: "Filial de delivery não encontrada"
-- Causa: policy anon SELECT em store_branches e products ausente
-- ============================================================

-- 1. Garantir que anon pode ler store_branches (cardápio lê filial)
GRANT SELECT ON public.store_branches TO anon;
DROP POLICY IF EXISTS "store_branches_select_anon" ON public.store_branches;
CREATE POLICY "store_branches_select_anon" ON public.store_branches
  FOR SELECT TO anon USING (true);

-- 2. Garantir que anon pode ler products (cardápio lê produtos)
GRANT SELECT ON public.products TO anon;
DROP POLICY IF EXISTS "products_select_anon" ON public.products;
CREATE POLICY "products_select_anon" ON public.products
  FOR SELECT TO anon USING (true);

-- 3. Garantir que anon pode ler categories (cardápio lê categorias)
GRANT SELECT ON public.categories TO anon;
DROP POLICY IF EXISTS "categories_select_anon" ON public.categories;
CREATE POLICY "categories_select_anon" ON public.categories
  FOR SELECT TO anon USING (true);

-- 4. Garantir que anon pode ler tables (cardápio mesa lê mesas)
GRANT SELECT ON public.tables TO anon;
DROP POLICY IF EXISTS "tables_select_anon" ON public.tables;
CREATE POLICY "tables_select_anon" ON public.tables
  FOR SELECT TO anon USING (true);

-- 5. Garantir que anon pode ler customer_sessions (cardápio cria sessão)
GRANT SELECT, INSERT ON public.customer_sessions TO anon;
DROP POLICY IF EXISTS "customer_sessions_select_anon" ON public.customer_sessions;
CREATE POLICY "customer_sessions_select_anon" ON public.customer_sessions
  FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "customer_sessions_insert_anon" ON public.customer_sessions;
CREATE POLICY "customer_sessions_insert_anon" ON public.customer_sessions
  FOR INSERT TO anon WITH CHECK (true);

-- 6. Garantir que anon pode criar sales (cardápio faz pedido)
GRANT SELECT, INSERT ON public.sales TO anon;
DROP POLICY IF EXISTS "sales_select_anon" ON public.sales;
CREATE POLICY "sales_select_anon" ON public.sales
  FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "sales_insert_anon" ON public.sales;
CREATE POLICY "sales_insert_anon" ON public.sales
  FOR INSERT TO anon WITH CHECK (true);

-- 7. Garantir que anon pode criar sale_items (cardápio faz pedido)
GRANT SELECT, INSERT ON public.sale_items TO anon;
DROP POLICY IF EXISTS "sale_items_select_anon" ON public.sale_items;
CREATE POLICY "sale_items_select_anon" ON public.sale_items
  FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "sale_items_insert_anon" ON public.sale_items;
CREATE POLICY "sale_items_insert_anon" ON public.sale_items
  FOR INSERT TO anon WITH CHECK (true);

-- 8. Garantir que anon pode ler digital_menu_config
GRANT SELECT ON public.digital_menu_config TO anon;
DROP POLICY IF EXISTS "digital_menu_config_select_anon" ON public.digital_menu_config;
CREATE POLICY "digital_menu_config_select_anon" ON public.digital_menu_config
  FOR SELECT TO anon USING (true);

-- 9. Verificação
DO $$ BEGIN
  RAISE NOTICE '✅ Cardápio anon RLS fix applied — store_branches, products, categories, tables, customer_sessions, sales, sale_items, digital_menu_config';
END $$;
