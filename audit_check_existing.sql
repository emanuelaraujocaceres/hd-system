-- ============================================================
-- BLOCO A: VERIFICAR O QUE EXISTE (sem criar/alterar nada)
-- Execute no SQL Editor do Supabase (PG14)
-- ============================================================

SELECT '=== TABELAS RELEVANTES ===' AS secao;
SELECT 'sale_item_payments' AS tabela,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='sale_item_payments') AS colunas,
  (SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='sale_item_payments')) AS existe,
  (SELECT relrowsecurity FROM pg_class WHERE relname='sale_item_payments' AND relnamespace=(SELECT oid FROM pg_namespace WHERE nspname='public')) AS rls_on;

SELECT 'sales' AS tabela,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='sales') AS colunas,
  (SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='sales')) AS existe,
  (SELECT relrowsecurity FROM pg_class WHERE relname='sales' AND relnamespace=(SELECT oid FROM pg_namespace WHERE nspname='public')) AS rls_on;

SELECT 'credit_payments' AS tabela,
  (SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='credit_payments')) AS existe,
  (SELECT relrowsecurity FROM pg_class WHERE relname='credit_payments' AND relnamespace=(SELECT oid FROM pg_namespace WHERE nspname='public')) AS rls_on;

SELECT 'financial_transactions' AS tabela,
  (SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='financial_transactions')) AS existe,
  (SELECT relrowsecurity FROM pg_class WHERE relname='financial_transactions' AND relnamespace=(SELECT oid FROM pg_namespace WHERE nspname='public')) AS rls_on;

SELECT '=== POLICIES ===' AS secao;
SELECT tablename, COUNT(*) AS policies
FROM pg_policies WHERE schemaname='public'
GROUP BY tablename
ORDER BY tablename;

SELECT tablename, policyname, cmd, permissive, roles
FROM pg_policies
WHERE schemaname='public' AND tablename IN ('sale_item_payments','sales','sale_items','credit_payments','financial_transactions','customer_sessions')
ORDER BY tablename, policyname;

SELECT '=== GRANTS NA TABELA sale_item_payments ===' AS secao;
SELECT grantee, privilege_type
FROM information_schema.table_privileges
WHERE table_name='sale_item_payments' AND table_schema='public'
ORDER BY grantee, privilege_type;

SELECT '=== COLUNAS sale_item_payments ===' AS secao;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='sale_item_payments'
ORDER BY ordinal_position;

SELECT '=== REPLICA IDENTITY ===' AS secao;
SELECT relname, relreplicaidentity
FROM pg_class WHERE relname='sale_item_payments';
