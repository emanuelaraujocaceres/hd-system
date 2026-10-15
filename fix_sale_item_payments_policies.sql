-- ============================================================
-- BLOCO 3: RLS POLICIES para sale_item_payments
-- PG14: DROP IF EXISTS + CREATE (sem IF NOT EXISTS)
-- ============================================================

-- Limpar políticas existentes (idempotente)
DROP POLICY IF EXISTS "superadmin_all_sale_item_payments" ON public.sale_item_payments;
DROP POLICY IF EXISTS "org_branch_select_sale_item_payments" ON public.sale_item_payments;
DROP POLICY IF EXISTS "org_branch_insert_sale_item_payments" ON public.sale_item_payments;
DROP POLICY IF EXISTS "org_branch_update_sale_item_payments" ON public.sale_item_payments;
DROP POLICY IF EXISTS "org_branch_delete_sale_item_payments" ON public.sale_item_payments;

-- Superadmin: acesso total
CREATE POLICY "superadmin_all_sale_item_payments" ON public.sale_item_payments
  FOR ALL USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

-- Membros da org: SELECT apenas registros da própria filial/org
CREATE POLICY "org_branch_select_sale_item_payments" ON public.sale_item_payments
  FOR SELECT USING (
    (store_branch_id = public.get_user_branch_id())
    AND (organization_id = public.get_user_org_id())
  );

-- Membros da org: INSERT com check de filial/org
CREATE POLICY "org_branch_insert_sale_item_payments" ON public.sale_item_payments
  FOR INSERT WITH CHECK (
    (store_branch_id = public.get_user_branch_id())
    AND (organization_id = public.get_user_org_id())
  );

-- Membros da org: UPDATE com check
CREATE POLICY "org_branch_update_sale_item_payments" ON public.sale_item_payments
  FOR UPDATE USING (
    (store_branch_id = public.get_user_branch_id())
    AND (organization_id = public.get_user_org_id())
  ) WITH CHECK (
    (store_branch_id = public.get_user_branch_id())
    AND (organization_id = public.get_user_org_id())
  );

-- Membros da org: DELETE
CREATE POLICY "org_branch_delete_sale_item_payments" ON public.sale_item_payments
  FOR DELETE USING (
    (store_branch_id = public.get_user_branch_id())
    AND (organization_id = public.get_user_org_id())
  );
