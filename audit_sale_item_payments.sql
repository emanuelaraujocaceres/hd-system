-- ============================================================
-- BLOCO 1: AUDIT — Verificar tabela sale_item_payments e policies
-- Execute no SQL Editor do Supabase (PG14-compatible, split-safe)
-- ============================================================

SELECT '=== TABELA sale_item_payments ===' AS info;
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'sale_item_payments' AND table_schema = 'public'
ORDER BY ordinal_position;

SELECT '=== POLICIES da tabela sale_item_payments ===' AS info;
SELECT policyname, cmd, permissive, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'sale_item_payments'
ORDER BY policyname;

SELECT '=== RLS habilitado? ===' AS info;
SELECT relname, relrowsecurity
FROM pg_class
WHERE relname = 'sale_item_payments' AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

SELECT '=== GRANTS na tabela ===' AS info;
SELECT grantee, privilege_type
FROM information_schema.table_privileges
WHERE table_name = 'sale_item_payments' AND table_schema = 'public';
