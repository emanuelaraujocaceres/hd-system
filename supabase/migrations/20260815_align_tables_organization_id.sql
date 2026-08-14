-- =====================================================================
-- Corrige inconsistência de organization_id nas mesas (tables).
--
-- PROBLEMA: mesas criadas/importadas com organization_id = DEFAULT_ORG_ID
-- (00000000-0000-0000-0000-000000000001) enquanto a filial (store_branch_id)
-- pertence à organização REAL do operador. O cardápio digital marca a venda
-- com a org da mesa, e views que filtram por organization_id acabam perdendo
-- os pedidos do cardápio (eles caem sob DEFAULT_ORG_ID).
--
-- SOLUÇÃO: alinhar tables.organization_id com a organization_id da própria
-- filial (store_branches). Idempotente e seguro: só toca linhas que já são
-- DEFAULT_ORG_ID e cuja filial tem org definida.
-- =====================================================================

DO $$
DECLARE
  v_default_org UUID := '00000000-0000-0000-0000-000000000001';
  v_updated INT;
BEGIN
  UPDATE tables t
  SET organization_id = b.organization_id
  FROM store_branches b
  WHERE t.store_branch_id = b.id
    AND b.organization_id IS NOT NULL
    AND t.organization_id = v_default_org;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RAISE NOTICE '✅ tables.organization_id alinhado com a filial: % linha(s) atualizada(s)', v_updated;
END $$;
