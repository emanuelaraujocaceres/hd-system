-- =====================================================================
-- FIX 2026-08-19 (v2): Anon hardening final (4 exceções do cardápio)
-- =====================================================================

-- Garantir que as 4 exceções do cardápio mantêm anon (idempotente)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
      AND p.proname IN ('process_sale_transaction', 'fn_insserir_dlq',
                        'fn_update_updated_at', 'fn_validate_store_branch_id')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC', r.proname, r.args);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM anon', r.proname, r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO anon, authenticated, service_role', r.proname, r.args);
    RAISE NOTICE '🔓 EXCEÇÃO CARDÁPIO mantida: %(%)', r.proname, r.args;
  END LOOP;
END $$;

-- Verificação final: apenas 4 funções com anon_exec
SELECT
  p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS funcao,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prokind = 'f'
  AND has_function_privilege('anon', p.oid, 'EXECUTE')
ORDER BY p.proname;