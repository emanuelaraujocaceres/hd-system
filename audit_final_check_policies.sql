-- ============================================================
-- BLOCO: Verificar o estado REAL das policies de sale_item_payments
-- (sem alterar — só SELECT para confirmar se ainda estão PERMISSIVE)
-- ============================================================
SELECT policyname, cmd, permissive, roles, qual AS check_expr
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'sale_item_payments'
ORDER BY cmd, policyname;
