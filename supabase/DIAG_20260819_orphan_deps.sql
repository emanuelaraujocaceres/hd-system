-- =====================================================================
-- DIAGNÓSTICO 2026-08-19: Dependências dos órfãos antes de deletar
-- Órfãos (system_users sem auth.users):
--   juninho: d341889d-306f-458f-8f24-f31a0b48d5ce
--   junior:  5a6aedfa-d206-45d5-a885-6cb4eefdb535
-- Verifica se alguma tabela referencia esses IDs antes do DELETE
-- =====================================================================

-- 1. Confirmar que são realmente órfãos (sem auth.users)
SELECT su.id, su.email, su.name,
       (SELECT COUNT(*) FROM auth.users au WHERE au.id = su.id) AS tem_auth
FROM system_users su
WHERE su.id IN (
  'd341889d-306f-458f-8f24-f31a0b48d5ce',
  '5a6aedfa-d206-45d5-a885-6cb4eefdb535'
);

-- 2. Verificar FKs que referenciam system_users (do catálogo)
SELECT
  tc.table_name AS tabela_filha,
  kcu.column_name AS coluna_fk,
  ccu.table_name AS tabela_pai
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND ccu.table_name = 'system_users' AND tc.table_schema = 'public';

-- 3. Contar registros órfãos referenciados em cada tabela filha
SELECT 'cash_sessions' AS tabela, COUNT(*) AS refs_orphan
FROM cash_sessions WHERE user_id IN ('d341889d-306f-458f-8f24-f31a0b48d5ce','5a6aedfa-d206-45d5-a885-6cb4eefdb535')
UNION ALL
SELECT 'sales', COUNT(*) FROM sales WHERE user_id IN ('d341889d-306f-458f-8f24-f31a0b48d5ce','5a6aedfa-d206-45d5-a885-6cb4eefdb535')
UNION ALL
SELECT 'credit_payments', COUNT(*) FROM credit_payments WHERE user_id IN ('d341889d-306f-458f-8f24-f31a0b48d5ce','5a6aedfa-d206-45d5-a885-6cb4eefdb535')
UNION ALL
SELECT 'financial_transactions', COUNT(*) FROM financial_transactions WHERE user_id IN ('d341889d-306f-458f-8f24-f31a0b48d5ce','5a6aedfa-d206-45d5-a885-6cb4eefdb535');