-- ============================================================
-- BLOCO 4: GRANTs + REPLICA IDENTITY + REALTIME PUBLICATION
-- PG14-compatible
-- ============================================================

-- 4a. Grants (se não estiverem corretos)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sale_item_payments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sale_item_payments TO service_role;

-- Se ainda não tiver anon (para cardápio anon — exceção documentada):
-- Nota: as ESCRITAS do cardápio anon NÃO usam header x-branch-id (ver regra 0f)
-- e as policies de INSERT anon permanecem permissivas (USING true) por design.
-- Se você precisa de INSERT anon, mantenha uma policy separada:
DROP POLICY IF EXISTS "anon_insert_sale_item_payments" ON public.sale_item_payments;
CREATE POLICY "anon_insert_sale_item_payments" ON public.sale_item_payments
  FOR INSERT TO anon USING (true) WITH CHECK (true);
-- NOTA: esta policy permissiva só para INSERT é intencional (regra 0f) — as
-- LEITURAS anon continuam escopadas por x-branch-id (se aplicável).

-- 4b. Replica identity (se ainda não estiver FULL)
ALTER TABLE public.sale_item_payments REPLICA IDENTITY FULL;

-- 4c. Publicação realtime (se faltando no canal)
-- Verificar se a tabela está no canal:
SELECT 'sale_item_payments está no canal supabase_realtime?' AS info,
       EXISTS (SELECT 1 FROM supabase_realtime.publication_tables WHERE table_name='sale_item_payments') AS no_canal;

-- Se não estiver, adicionar (requer superuser/service_role — pode não ser permitido via SQL Editor; confirme e eu forneço o comando alternativo):
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.sale_item_payments;
