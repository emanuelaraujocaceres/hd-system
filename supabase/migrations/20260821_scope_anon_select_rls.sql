-- =====================================================================
-- ESCOPEAR policies SELECT anon do cardápio (eliminar USING true) — ESTADO FINAL SEGURO
-- ---------------------------------------------------------------------
-- LEITURAS (SELECT anon): escopadas por x-branch-id (o app PublicMenuView
--   agora envia o header x-branch-id = store_branch_id resolvido da rota
--   #/delivery/<id> ou #/mesa em TODAS as leituras anon de produtos/config).
--   Isso fecha o vazamento de leitura entre filiais.
--
-- ESCRITAS (INSERT/UPDATE anon): PERMANECEM WITH CHECK (true) / USING (true).
--   Motivo: o app faz as escritas do cardápio (venda, item, sessão, estoque)
--   via Supabase JS client (upsertRow), que NÃO envia o header x-branch-id;
--   a filial vai no PAYLOAD (store_branch_id), não no header. Escopar o
--   WITH CHECK do INSERT por header QUEBRARIA o pedido do cliente anon.
--   O app já carimba o store_branch_id correto no payload, então o risco de
--   escrita cross-branch é mitigado no app. (Se no futuro o cliente JS enviar
--   o header nas escritas, estas policies podem ser escopadas também.)
--
-- EXCEÇÕES deliberadas (NÃO escopadas, permanecem USING true):
--   * store_branches (anon SELECT): fallback legado lista TODAS as filiais
--     quando a URL não traz o id (GET sem header). Escopar quebraria o fallback.
--   * tables (anon SELECT): lookup por qr_token ocorre ANTES de se conhecer a
--     filial, não pode ser escopado por header (qr_token é token não adivinhável;
--     seguimento: incluir filial na URL da mesa e aí escopar).
--
-- Policies de SELECT para authenticated (org+branch) e INSERT/UPSERT WITH CHECK
-- (org+branch) para todas as tabelas branch-scoped ficam a cargo da 2ª inspeção
-- da IA do Supabase (inventário de pg_policies).
-- =====================================================================

-- Branch enviado pelo cardápio via header x-branch-id.
-- NULL se ausente -> nenhuma linha retornada (nega acesso sem header).
CREATE OR REPLACE FUNCTION public.cardapio_branch_from_header()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.headers', true)::json->>'x-branch-id', '')::uuid;
$$;

GRANT EXECUTE ON FUNCTION public.cardapio_branch_from_header() TO anon, authenticated;

-- ── SELECT anon ESCOPADO por x-branch-id ─────────────────────────────
-- products
DROP POLICY IF EXISTS "products_select_anon" ON public.products;
CREATE POLICY "products_select_anon" ON public.products
  FOR SELECT TO anon
  USING (store_branch_id = public.cardapio_branch_from_header());

-- categories
DROP POLICY IF EXISTS "categories_select_anon" ON public.categories;
CREATE POLICY "categories_select_anon" ON public.categories
  FOR SELECT TO anon
  USING (store_branch_id = public.cardapio_branch_from_header());

-- customer_sessions (SELECT escopado; INSERT/UPDATE permanecem permissivos)
DROP POLICY IF EXISTS "customer_sessions_select_anon" ON public.customer_sessions;
CREATE POLICY "customer_sessions_select_anon" ON public.customer_sessions
  FOR SELECT TO anon
  USING (store_branch_id = public.cardapio_branch_from_header());

-- digital_menu_config
DROP POLICY IF EXISTS "digital_menu_config_select_anon" ON public.digital_menu_config;
CREATE POLICY "digital_menu_config_select_anon" ON public.digital_menu_config
  FOR SELECT TO anon
  USING (store_branch_id = public.cardapio_branch_from_header());

-- sale_items (SELECT escopado; INSERT permanece permissivo)
DROP POLICY IF EXISTS "sale_items_select_anon" ON public.sale_items;
CREATE POLICY "sale_items_select_anon" ON public.sale_items
  FOR SELECT TO anon
  USING (store_branch_id = public.cardapio_branch_from_header());

-- sales (SELECT escopado; INSERT permanece permissivo)
DROP POLICY IF EXISTS "sales_select_anon" ON public.sales;
CREATE POLICY "sales_select_anon" ON public.sales
  FOR SELECT TO anon
  USING (store_branch_id = public.cardapio_branch_from_header());

-- ── ESCRITAS anon PERMISSIVAS (não escopar por header — vide motivo acima) ──
-- customer_sessions
DROP POLICY IF EXISTS "customer_sessions_insert_anon" ON public.customer_sessions;
CREATE POLICY "customer_sessions_insert_anon" ON public.customer_sessions
  FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "customer_sessions_update_anon" ON public.customer_sessions;
CREATE POLICY "customer_sessions_update_anon" ON public.customer_sessions
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- sales
DROP POLICY IF EXISTS "sales_insert_anon" ON public.sales;
CREATE POLICY "sales_insert_anon" ON public.sales
  FOR INSERT TO anon WITH CHECK (true);

-- sale_items
DROP POLICY IF EXISTS "sale_items_insert_anon" ON public.sale_items;
CREATE POLICY "sale_items_insert_anon" ON public.sale_items
  FOR INSERT TO anon WITH CHECK (true);

-- stock_movements (escrita do cardápio também; manter permissiva)
DROP POLICY IF EXISTS "stock_movements_insert_anon" ON public.stock_movements;
CREATE POLICY "stock_movements_insert_anon" ON public.stock_movements
  FOR INSERT TO anon WITH CHECK (true);

-- tables (anon SELECT permanece permissiva para lookup por qr_token)
-- store_branches (anon SELECT permanece permissiva para fallback legado)
-- (não são tocadas nesta migration)

DO $$ BEGIN
  RAISE NOTICE '✅ SELECT anon escopado por x-branch-id (products, categories, customer_sessions, digital_menu_config, sale_items, sales). INSERT/UPDATE anon permanecem permissivos (app carimba store_branch_id no payload). store_branches/tables anon permanecem por necessidade do fluxo.';
END $$;
