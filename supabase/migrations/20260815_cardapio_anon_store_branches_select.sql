-- =====================================================================
-- Cardápio Delivery (interface PÚBLICA / chave anon) precisa LER a filial
-- (store_branches) para obter o organization_id REAL e exibir dados da loja.
-- A Mesa lê tables/products (já liberados); o Delivery lê store_branches,
-- que ainda não tinha acesso anon → "Filial de delivery não encontrada".
--
-- EXCEÇÃO documentada à regra de "sem policies permissivas" do AGENTS.md:
-- o cardápio digital é público e não tem sessão autenticada (ver
-- 20260815_cardapio_anon_rls.sql). Dados de filial (nome/cidade/endereço)
-- são de diretório público do estabelecimento — leitura anon é intencional.
-- =====================================================================

GRANT SELECT ON public.store_branches TO anon;
GRANT SELECT ON public.store_branches TO authenticated;

DROP POLICY IF EXISTS "store_branches_select_anon" ON public.store_branches;
CREATE POLICY "store_branches_select_anon" ON public.store_branches
  FOR SELECT TO anon USING (true);

DO $$ BEGIN
  RAISE NOTICE '✅ SELECT anon liberado em store_branches (cardápio delivery lê a filial)';
END $$;
