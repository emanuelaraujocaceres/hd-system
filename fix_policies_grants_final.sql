-- ============================================================
-- BLOCO CORRIGIDO: Policies + Grants para sale_item_payments
-- PG14-compatible, split-safe (cada bloco roda separadamente)
-- ============================================================

-- 1. Verificar as policies existentes (para confirmar o erro)
SELECT policyname, cmd, permissive, roles FROM pg_policies
WHERE tablename = 'sale_item_payments';
