-- =====================================================================
-- FIX 2026-08-19: FECHAR EXECUTE anon/PUBLIC das funções fora do cardápio
--
-- CONTEXTO: o diagnóstico (DIAG_20260819_anon_functions.sql) mostrou 33
-- funções com EXECUTE anon — a esmagadora maioria herdou o PUBLIC default
-- do Postgres (nunca recebeu REVOKE), não um GRANT explícito. Anon pode
-- chamar hoje: helpers SECURITY DEFINER de permissão/RLS (leitura
-- cross-org via security definer), set_current_branch, trigger functions,
-- e reprocessadores (process_dlq) — superfície desnecessária.
--
-- REGRA (AGENTS.md regra 9): sem GRANT PUBLIC/anon exceto a exceção
-- documentada do cardápio. Fechamento usa assinatura dinâmica
-- (pg_get_function_identity_arguments) → imune ao erro 42725 de overload.
--
-- ⚠️ NÃO fechar estas 4 (anon NÃO pode perder):
--   process_sale_transaction, fn_insserir_dlq        → exceção cardápio
--   fn_update_updated_at, fn_validate_store_branch_id → triggers nas
--     tabelas que o anon ESCREVE (sales, sale_items, stock_movements) —
--     o INSERT do pedido do cardápio dispara essas triggers; sem EXECUTE
--     anon, o pedido falha com permisssão negada.
-- =====================================================================

-- ─── 1. LISTA A: fecha anon+PUBLIC, mantém authenticated + service_role ─
-- Helpers de RLS/permissão (lidos por policies como o usuário que executa
-- a query), trigger functions de tabelas que o anon NÃO escreve, e
-- set_current_branch (frontend chama como usuário autenticado).
DO $$
DECLARE
  r RECORD;
  v_count integer := 0;
  v_auth_svc TEXT[] := ARRAY[
    'can_access_branch', 'can_access_module', 'can_perform_action',
    'get_access_level_label', 'get_is_superadmin', 'get_my_profile',
    'get_user_access_level', 'get_user_branch_id', 'get_user_org_id',
    'get_user_role', 'has_permission', 'is_collaborator', 'is_developer',
    'is_org_admin', 'is_superadmin', 'set_current_branch',
    'alert_missing_branch', 'fn_bump_version', 'fn_ensure_system_user_org',
    'fn_log_stock_changes', 'fn_prevent_negative_stock', 'fn_sync_product_name'
  ];
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.proname = ANY (v_auth_svc)
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC', r.proname, r.args);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM anon', r.proname, r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role', r.proname, r.args);
    RAISE NOTICE '🔒 Fechado anon/PUBLIC → authenticated+service_role: %(%)', r.proname, r.args;
    v_count := v_count + 1;
  END LOOP;
  RAISE NOTICE '✅ Lista A: % função(ões) fechadas (anon/PUBLIC revogado)', v_count;
END $$;

-- ─── 2. LISTA B: fecha anon+PUBLIC, mantém SÓ service_role ─────────────
-- Sem chamadores no frontend/server.ts — migração/diagnóstico/administração.
DO $$
DECLARE
  r RECORD;
  v_count integer := 0;
  v_svc_only TEXT[] := ARRAY[
    'process_dlq', 'daily_health_check', 'check_stock_consistency',
    'health_check_branch_isolation', 'fn_add_to_realtime',
    'create_org_policy', 'create_branch_policy'
  ];
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.proname = ANY (v_svc_only)
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC', r.proname, r.args);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM anon', r.proname, r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role', r.proname, r.args);
    RAISE NOTICE '🔒 Fechado anon/PUBLIC → service_role apenas: %(%)', r.proname, r.args;
    v_count := v_count + 1;
  END LOOP;
  RAISE NOTICE '✅ Lista B: % função(ões) restrita(s) a service_role', v_count;
END $$;

-- ─── 3. GARANTIR as 4 exceções (idempotente) ─────────────────────────
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.proname IN ('process_sale_transaction', 'fn_insserir_dlq',
                        'fn_update_updated_at', 'fn_validate_store_branch_id')
  LOOP
    -- REVOKE ALL FROM PUBLIC/anon primeiro (desfaz qualquer PUBLIC default)
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC', r.proname, r.args);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM anon', r.proname, r.args);
    -- Depois GRANT explícito para todos os roles que precisam
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO anon, authenticated, service_role', r.proname, r.args);
    RAISE NOTICE '🔓 EXCEÇÃO CARDÁPIO mantida (anon+auth+svc): %(%)', r.proname, r.args;
  END LOOP;
END $$;

-- ─── 4. VERIFICAÇÃO FINAL ─────────────────────────────────────────────
-- Esperado APENAS 4 funções com anon_exec=true (as exceções documentadas)
SELECT
  p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS funcao,
  has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon_exec,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
  has_function_privilege('service_role', p.oid, 'EXECUTE')  AS svc_exec
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prokind = 'f'
  AND has_function_privilege('anon', p.oid, 'EXECUTE')
ORDER BY p.proname;

-- ─── 5. SANIDADE: authenticated mantém acesso aos helpers de RLS ──────
-- is_superadmin/get_user_org_id/get_user_branch_id/get_user_role etc.
-- precisam continuar true para authenticated (policies chamam como o
-- usuário que executa a query) — listar todas p/ conferência rápida.
SELECT
  p.proname,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prokind = 'f'
  AND p.proname IN ('is_superadmin','get_user_org_id','get_user_branch_id',
                    'get_user_role','fn_update_updated_at',
                    'fn_validate_store_branch_id','fn_prevent_negative_stock',
                    'fn_bump_version','set_current_branch')
ORDER BY p.proname;