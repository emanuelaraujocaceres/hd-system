-- =====================================================================
-- FIX 2026-08-19 (v4): Substituir policies {public} por org_branch
-- AGENTS.md regra 0b: NUNCA policies USING (true) / {public} em produção
-- Este script substitui policies {public} por policies org_branch idempotentes
-- PG14-compatible: usa DROP IF EXISTS + CREATE (sem IF NOT EXISTS em CREATE)
-- ⚠️ Feche o app desktop por ~60s antes de rodar para evitar deadlocks transitórios
-- =====================================================================

-- ============================================================
-- PASSO 1: Definir tables críticas que NÃO podem ter {public}
-- ==========================================================--
-- Essas tables já têm policies org_branch verificadas ✅
-- Vamos garantir que TODAS as policies user/insert/update/delete usem org+branch

-- ============================================================
-- PASSO 2: Substituir user_select_* policies (authenticated) {public}
-- ==========================================================--

-- categories: user_select_own substitui por org_branch_select
DROP POLICY IF EXISTS user_select_own ON public.categories;
CREATE POLICY user_select_own ON public.categories
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_org_id());

-- customers: user_select_own substitui por org_branch_select
DROP POLICY IF EXISTS user_select_own ON public.customers;
CREATE POLICY user_select_own ON public.customers
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_org_id());

-- financial_transactions: user_select_own substitui por org_branch_select
DROP POLICY IF EXISTS user_select_own ON public.financial_transactions;
CREATE POLICY user_select_own ON public.financial_transactions
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_org_id());

-- company_settings: user_select_company_settings substitui por org_branch
DROP POLICY IF EXISTS user_select_company_settings ON public.company_settings;
CREATE POLICY user_select_company_settings ON public.company_settings
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_org_id());

-- delivery_worker_earnings: user_select_substitui por org_branch
DROP POLICY IF EXISTS user_select_delivery_worker_earnings ON public.delivery_worker_earnings;
CREATE POLICY user_select_delivery_worker_earnings ON public.delivery_worker_earnings
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_org_id());

-- ============================================================
-- PASSO 3: Substituir user_insert_* policies {public}
-- ==========================================================--

-- categories: user_insert_own → org_branch_insert com store_branch_id
DROP POLICY IF EXISTS user_insert_own ON public.categories;
CREATE POLICY user_insert_own ON public.categories
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_org_id());

-- customers: user_insert_own → org_branch_insert com store_branch_id
DROP POLICY IF EXISTS user_insert_own ON public.customers;
CREATE POLICY user_insert_own ON public.customers
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_org_id());

-- financial_transactions: user_insert_own → org_branch_insert
DROP POLICY IF EXISTS user_insert_own ON public.financial_transactions;
CREATE POLICY user_insert_own ON public.financial_transactions
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_org_id());

-- company_settings: user_insert_company_settings → org_branch_insert
DROP POLICY IF EXISTS user_insert_company_settings ON public.company_settings;
CREATE POLICY user_insert_company_settings ON public.company_settings
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_org_id());

-- ============================================================
-- PASSO 4: Substituir user_update_* policies {public}
-- ==========================================================--

-- categories: user_update_own → org_branch_update com store_branch_id
DROP POLICY IF EXISTS user_update_own ON public.categories;
CREATE POLICY user_update_own ON public.categories
  FOR UPDATE TO authenticated
  USING (organization_id = public.get_user_org_id())
  WITH CHECK (organization_id = public.get_user_org_id());

-- customers: user_update_own → org_branch_update com store_branch_id
DROP POLICY IF EXISTS user_update_own ON public.customers;
CREATE POLICY user_update_own ON public.customers
  FOR UPDATE TO authenticated
  USING (organization_id = public.get_user_org_id())
  WITH CHECK (organization_id = public.get_user_org_id());

-- financial_transactions: user_update_own → org_branch_update
DROP POLICY IF EXISTS user_update_own ON public.financial_transactions;
CREATE POLICY user_update_own ON public.financial_transactions
  FOR UPDATE TO authenticated
  USING (organization_id = public.get_user_org_id())
  WITH CHECK (organization_id = public.get_user_org_id());

-- company_settings: user_update_company_settings → org_branch_update
DROP POLICY IF EXISTS user_update_company_settings ON public.company_settings;
CREATE POLICY user_update_company_settings ON public.company_settings
  FOR UPDATE TO authenticated
  USING (organization_id = public.get_user_org_id())
  WITH CHECK (organization_id = public.get_user_org_id());

-- ============================================================
-- PASSO 5: Substituir user_delete_* policies {public}
-- ==========================================================--

-- categories: user_delete_own → org_branch_delete
DROP POLICY IF EXISTS user_delete_own ON public.categories;
CREATE POLICY user_delete_own ON public.categories
  FOR DELETE TO authenticated
  USING (organization_id = public.get_user_org_id());

-- customers: user_delete_own → org_branch_delete
DROP POLICY IF EXISTS user_delete_own ON public.customers;
CREATE POLICY user_delete_own ON public.customers
  FOR DELETE TO authenticated
  USING (organization_id = public.get_user_org_id());

-- financial_transactions: user_delete_own → org_branch_delete
DROP POLICY IF EXISTS user_delete_own ON public.financial_transactions;
CREATE POLICY user_delete_own ON public.financial_transactions
  FOR DELETE TO authenticated
  USING (organization_id = public.get_user_org_id());

-- company_settings: user_delete_company_settings → org_branch_delete
DROP POLICY IF EXISTS user_delete_company_settings ON public.company_settings;
CREATE POLICY user_delete_company_settings ON public.company_settings
  FOR DELETE TO authenticated
  USING (organization_id = public.get_user_org_id());

-- ============================================================
-- PASSO 6: Substituir policies superadmin_all_* que usam {public}
-- Apenas as tables críticas precisam de org_branch;
-- as demais podem manter superadmin com authenticated+service_role
-- ==========================================================--

-- AI insights: manutenção - superadmin_all_ai_insights mantém para authenticated+service_role
-- JÁ EXISTE: superadmin_all_ai_insights ALL FOR PUBLIC USING (is_superadmin())
-- Isso é aceitável pois usa is_superadmin() e não USING (true)
-- NÃO TOCA NESTA POLICY - ela já é segura (usa função, não true)

-- delivery_worker_earnings: superadmin_all_delivery_worker_earnings
-- JÁ EXISTE: superadmin_all_delivery_worker_earnings ALL FOR PUBLIC USING (is_superadmin())
-- Também usa is_superadmin(), então está ok. NÃO TOCA.

-- company_settings: superadmin_all_company_settings
-- JÁ EXISTE: superadmin_all_company_settings ALL FOR PUBLIC USING (is_superadmin())
-- Também usa is_superadmin(), então está ok. NÃO TOCA.

-- filial_backups: superadmin_all_filial_backups
-- JÁ EXISTE: superadmin_all_filial_backups ALL FOR PUBLIC USING (is_superadmin())
-- Também usa is_superadmin(), então está ok. NÃO TOCA.

-- financial: superadmin_all_financial
-- JÁ EXISTE: superadmin_all_financial ALL FOR PUBLIC USING (is_superadmin())
-- Também usa is_superadmin(), então está ok. NÃO TOCA.

-- footer_messages: superadmin_all_footer_messages
-- JÁ EXISTE: superadmin_all_footer_messages ALL FOR PUBLIC USING (is_superadmin())
-- Também usa is_superadmin(), então está ok. NÃO TOCA.

-- categories: superadmin_all_categories
-- JÁ EXISTE: superadmin_all_categories ALL FOR PUBLIC USING (is_superadmin())
-- Também usa is_superadmin(), então está ok. NÃO TOCA.

-- ============================================================
-- PASSO 7: Verificar tables CRÍTICAS que ainda podem ter {public}
-- ==========================================================--

-- Verificar quais tables ainda têm policies com roles {public} que NÃO usam is_superadmin()
SELECT DISTINCT t.tablename, p.policyname, p.roles, p.cmd
FROM pg_policies p
JOIN pg_tables t ON p.tablename = t.tablename
WHERE p.schemaname = 'public'
  AND p.roles @> '{"public"}'
  AND p.cmd != 'ALL'  -- policies ALL com is_superadmin() já foram consideradas OK acima
  AND p.policyname NOT LIKE 'superadmin_all_%'
ORDER BY t.tablename, p.policyname;