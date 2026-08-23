-- =====================================================================
-- FIX 2026-08-19: RESTAURAR EXECUTE ANON das RPCs do CARDÁPIO (exceção documentada)
--
-- CONTEXTO: o hardening de RPCs (FIX_20260819_rpc_hardening_v2) revogou
-- EXECUTE de anon em process_sale_transaction e fn_insserir_dlq seguindo
-- a regra geral. PORÉM o cardápio digital/delivery roda no CELULAR DO
-- CLIENTE SEM sessão autenticada (apenas chave anon) e a migration
-- migrations/20260815_cardapio_anon_rls.sql documenta que essas DUAS
-- funções PRECISAM do GRANT EXECUTE anon:
--   - process_sale_transaction: única via de estoque atômico server-side
--     (o front anon NÃO tem UPDATE em products — RLS não permite)
--   - fn_insserir_dlq: registro da falha para reprocessamento
-- Revogar anon dessas duas = pedido do cardápio salva, mas o estoque do
-- cloud NÃO é deduzido e a falha NÃO entra na DLQ.
--
-- EXCEÇÃO ÚNICA E DOCUMENTADA (ver AGENTS.md regra 9). NUNCA revogar de novo.
--
-- Idempotente. Não especifica assinatura fixa → usa pg_get_function_identity_arguments,
-- imune ao erro 42725 de overload.
-- =====================================================================

-- ─── 1. RESTAURAR EXECUTE ANON ────────────────────────────────────────
DO $$
DECLARE
  r RECORD;
  v_count integer := 0;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('process_sale_transaction', 'fn_insserir_dlq')
      AND p.prokind = 'f'  -- apenas funções, não procedures
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO anon', r.proname, r.args);
    RAISE NOTICE '🔓 GRANT anon EXECUTE: %(%)', r.proname, r.args;
    v_count := v_count + 1;
  END LOOP;
  RAISE NOTICE '✅ % função(ões) cardápio com EXECUTE anon restaurado', v_count;
END $$;

-- ─── 2. VERIFICAÇÃO — quem tem EXECUTE em cada função ─────────────────
-- Deve mostrar anon=true para as duas (e authenticated/service_role=true).
-- NOTA: role_routine_grants.specific_name não casa com p.oid::text (o
-- sql_identifier tem aspas) — usar has_function_privilege() de forma direta.
SELECT
  p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS funcao,
  has_function_privilege('anon', p.oid, 'EXECUTE')         AS anon_exec,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
  has_function_privilege('service_role', p.oid, 'EXECUTE')  AS svc_exec
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('process_sale_transaction', 'fn_insserir_dlq')
  AND p.prokind = 'f'
ORDER BY p.proname;

-- ─── 3. SANIDADE: garantir que NENHUMA OUTRA função tem EXECUTE anon ──
-- Esperado: apenas process_sale_transaction e fn_insserir_dlq.
-- (ajustar_estoque/admin_*/debug_auth/reprocessar/etc. devem ter anon=false)
SELECT
  p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS funcao
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prokind = 'f'
  AND has_function_privilege('anon', p.oid, 'EXECUTE')
ORDER BY p.proname;