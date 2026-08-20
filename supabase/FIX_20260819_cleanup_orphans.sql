-- =====================================================================
-- FIX 2026-08-19: Limpar órfãos de system_users (SEGURO)
-- Órfãos (system_users sem auth.users):
--   juninho: d341889d-306f-458f-8f24-f31a0b48d5ce
--   junior:  5a6aedfa-d206-45d5-a885-6cb4eefdb535
-- Só deleta se NENHUMA tabela referenciar esses IDs (senão ABORTA)
-- =====================================================================

DO $$
DECLARE
  v_o1 UUID := 'd341889d-306f-458f-8f24-f31a0b48d5ce'; -- juninho órfão
  v_o2 UUID := '5a6aedfa-d206-45d5-a885-6cb4eefdb535'; -- junior órfão
  v_auth1 INTEGER;
  v_auth2 INTEGER;
  v_deps INTEGER := 0;
  v_t TEXT;
BEGIN
  -- 0. Confirmar que são REALMENTE órfãos (sem auth.users)
  SELECT COUNT(*) INTO v_auth1 FROM auth.users WHERE id = v_o1;
  SELECT COUNT(*) INTO v_auth2 FROM auth.users WHERE id = v_o2;
  IF v_auth1 > 0 OR v_auth2 > 0 THEN
    RAISE NOTICE '⚠️  Um dos IDs tem auth.users — ABORTANDO (não é órfão)';
    RETURN;
  END IF;

  -- 1. Verificar dependências em tabelas que referenciam system_users
  SELECT COUNT(*) INTO v_deps FROM cash_sessions WHERE user_id IN (v_o1, v_o2);
  IF v_deps > 0 THEN RAISE NOTICE '⚠️  cash_sessions: % refs → ABORT', v_deps; END IF;

  SELECT COUNT(*) INTO v_deps FROM sales WHERE user_id IN (v_o1, v_o2);
  IF v_deps > 0 THEN RAISE NOTICE '⚠️  sales: % refs → ABORT', v_deps; END IF;

  SELECT COUNT(*) INTO v_deps FROM credit_payments WHERE user_id IN (v_o1, v_o2);
  IF v_deps > 0 THEN RAISE NOTICE '⚠️  credit_payments: % refs → ABORT', v_deps; END IF;

  SELECT COUNT(*) INTO v_deps FROM financial_transactions WHERE user_id IN (v_o1, v_o2);
  IF v_deps > 0 THEN RAISE NOTICE '⚠️  financial_transactions: % refs → ABORT', v_deps; END IF;

  SELECT COUNT(*) INTO v_deps FROM scanned_boletos WHERE user_id IN (v_o1, v_o2);
  IF v_deps > 0 THEN RAISE NOTICE '⚠️  scanned_boletos: % refs → ABORT', v_deps; END IF;

  -- 2. Se alguma dependência encontrada, aborta (não deleta)
  -- (reconta total para decidir)
  SELECT COALESCE(SUM(c), 0) INTO v_deps FROM (
    SELECT COUNT(*) AS c FROM cash_sessions WHERE user_id IN (v_o1, v_o2)
    UNION ALL SELECT COUNT(*) FROM sales WHERE user_id IN (v_o1, v_o2)
    UNION ALL SELECT COUNT(*) FROM credit_payments WHERE user_id IN (v_o1, v_o2)
    UNION ALL SELECT COUNT(*) FROM financial_transactions WHERE user_id IN (v_o1, v_o2)
    UNION ALL SELECT COUNT(*) FROM scanned_boletos WHERE user_id IN (v_o1, v_o2)
  ) t;

  IF v_deps > 0 THEN
    RAISE NOTICE '❌ DEPENDÊNCIAS ENCONTRADAS (% refs). NÃO deletado. Reatribua primeiro.', v_deps;
    RETURN;
  END IF;

  -- 3. Seguro para deletar
  DELETE FROM system_users WHERE id IN (v_o1, v_o2);
  RAISE NOTICE '✅ % órfãos deletados com segurança (juninho + junior)', 2;
END $$;

-- Verificação: juninho e junior devem aparecer APENAS 1x cada (o válido)
SELECT email, id, 
       (SELECT COUNT(*) FROM auth.users au WHERE au.id = su.id) AS tem_auth
FROM system_users 
WHERE email IN ('juninho@gmail.com', 'junior@gmail.com')
ORDER BY email;