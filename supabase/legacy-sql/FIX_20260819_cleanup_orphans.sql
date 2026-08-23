-- =====================================================================
-- FIX 2026-08-19 (v2): Limpar órfãos de system_users — SEGURO + DINÂMICO
-- Órfãos (system_users sem auth.users):
--   juninho: d341889d-306f-458f-8f24-f31a0b48d5ce
--   junior:  5a6aedfa-d206-45d5-a885-6cb4eefdb535
--
-- Vantagem desta versão: NÃO hardcodeia nomes de coluna. Descobre TODAS
-- as FKs -> system_users via information_schema e conta referências em
-- CADA uma. Se qualquer tabela filha apontar para o órfão, ABORTA (não
-- deleta) — evitando erro 42703 de coluna inexistente.
-- =====================================================================

DO $$
DECLARE
  v_o1 UUID := 'd341889d-306f-458f-8f24-f31a0b48d5ce'; -- juninho órfão
  v_o2 UUID := '5a6aedfa-d206-45d5-a885-6cb4eefdb535'; -- junior órfão
  v_auth1 INTEGER;
  v_auth2 INTEGER;
  v_total INTEGER := 0;
  r RECORD;
  v_cnt INTEGER;
BEGIN
  -- 0. Confirmar que são REALMENTE órfãos (sem auth.users)
  SELECT COUNT(*) INTO v_auth1 FROM auth.users WHERE id = v_o1;
  SELECT COUNT(*) INTO v_auth2 FROM auth.users WHERE id = v_o2;
  IF v_auth1 > 0 OR v_auth2 > 0 THEN
    RAISE NOTICE '⚠️  Um dos IDs tem auth.users — ABORTANDO (não é órfão)';
    RETURN;
  END IF;

  -- 1. Descobrir TODAS as FKs -> system_users e contar referências
  FOR r IN
    SELECT tc.table_name AS tbl, kcu.column_name AS col
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND ccu.table_name = 'system_users'
  LOOP
    EXECUTE format('SELECT COUNT(*) FROM %I WHERE %I IN ($1, $2)', r.tbl, r.col)
      INTO v_cnt USING v_o1, v_o2;
    IF v_cnt > 0 THEN
      RAISE NOTICE '⚠️  % (%): % refs → ABORT', r.tbl, r.col, v_cnt;
      v_total := v_total + v_cnt;
    END IF;
  END LOOP;

  -- 2. Se encontrou dependências, não deleta
  IF v_total > 0 THEN
    RAISE NOTICE '❌ DEPENDÊNCIAS ENCONTRADAS (% refs no total). NÃO deletado. Reatribua primeiro.', v_total;
    RETURN;
  END IF;

  -- 3. Seguro para deletar
  DELETE FROM system_users WHERE id IN (v_o1, v_o2);
  RAISE NOTICE '✅ % órfãos deletados com segurança (juninho + junior)', 2;
END $$;

-- Verificação pós-delete: juninho e junior devem SUMIR da tabela.
-- (Antes do delete, aparecem 1x cada como órfãos; após, 0 linhas.)
SELECT su.email, su.id,
       (SELECT COUNT(*) FROM auth.users au WHERE au.id = su.id) AS tem_auth
FROM system_users su
WHERE su.email IN ('juninho@gmail.com', 'junior@gmail.com')
ORDER BY su.email;
