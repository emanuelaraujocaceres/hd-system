-- ============================================================
-- BLOCO 2: Recriar as policies de INSERT corretamente (sem USING no INSERT — só WITH CHECK)
-- Execute após o BLOCO 1
-- ============================================================

-- Remover policies de INSERT com sintaxe errada (se existirem com USING)
DROP POLICY IF EXISTS "org_branch_insert_sale_item_payments" ON public.sale_item_payments;
DROP POLICY IF EXISTS "anon_insert_sale_item_payments" ON public.sale_item_payments;

-- Policy de INSERT para membros da org (com WITH CHECK, sem USING)
CREATE POLICY "org_branch_insert_sale_item_payments" ON public.sale_item_payments
  FOR INSERT TO authenticated WITH CHECK (
    (store_branch_id = public.get_user_branch_id())
    AND (organization_id = public.get_user_org_id())
  );

-- Policy de INSERT anon (apenas para o fluxo cardápio anon — regra 0f)
CREATE POLICY "anon_insert_sale_item_payments" ON public.sale_item_payments
  FOR INSERT TO anon WITH CHECK (true);
