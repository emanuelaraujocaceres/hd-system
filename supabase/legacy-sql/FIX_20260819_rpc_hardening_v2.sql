-- ==============================================================================
-- FIX_20260819_rpc_hardening_v2.sql
-- Correções de GAPS deixados pela v1 (alguns REVOKE falharam com 42725 porque
-- ajustar_estoque tem DOIS overloads — assinatura ambígua) + fechamento de
-- exposições PUBLIC/anon restantes da auditoria.
--
-- VULNERABILIDADE CRÍTICA encontrada na verificação:
--   gerar_token_e_criar_sessao() forja um JWT signed com segredo HARDCODED
--   ('MINHA_CHAVE_SUPER_SECRETA_DE_TESTE') para QUALQUER user_id/e-mail, com
--   role 'authenticated' → tomar conta de qualquer usuário. Sem chamadores no
--   app (só SQL manual). Restrita a service_role/postgres.
--
-- ⚠️ AÇÃO MANUAL OBRIGATÓRIA (fora deste script): conferir em
--    Supabase → Settings → API → JWT Secret se o segredo NÃO é o hardcoded
--    acima. Se for, GERAR PVT NOVO (invalida todos os tokens).
--
-- Correções:
--   1. ajustar_estoque 6-arg (sem hardening, sem chamadores) → DROP
--   2. ajustar_estoque 7-arg → REVOKE PUBLIC/anon (assinatura explícita) +
--      GRANT authenticated/service_role
--   3. admin_delete_organization → REVOKE PUBLIC/anon (assinatura explícita)
--   4. gerar_token_e_criar_sessao → guard service_role no corpo + REVOKE
--      PUBLIC/anon/authenticated
--   5. process_sale_transaction → REVOKE PUBLIC/anon + GRANT auth/service_role
--   6. fn_insserir_dlq → REVOKE PUBLIC/anon + GRANT auth/service_role
--   7. mark_user_logout → REVOKE PUBLIC/anon + GRANT auth/service_role
--   8. reprocessar_movimentacoes_falhas → service_role/postgres apenas
--   9. debug_auth → service_role/postgres apenas
--  10. handle_new_user / fn_ensure_cash_session_org / rls_auto_enable
--      (funções de trigger) → REVOKE PUBLIC/anon (triggers rodam como owner,
--      não precisam de EXECUTE público)
--  11. Verificação final com assinaturas explícitas
-- ==============================================================================

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. ajustar_estoque 6-arg (sem p_store_branch_id) — SEM chamadores no repo
--    (frontend usa a 7-arg). Corpo antigo SEM validação → remover.
-- ═════════════════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.ajustar_estoque(uuid, integer, text, text, text, uuid);
RAISE NOTICE 'ajustar_estoque 6-arg removida';

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. ajustar_estoque 7-arg → fechar PUBLIC/anon, liberar auth/service_role
--    (assinatura explícita evita o erro 42725 da v1)
-- ═════════════════════════════════════════════════════════════════════════════
REVOKE ALL ON FUNCTION public.ajustar_estoque(uuid, integer, text, text, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ajustar_estoque(uuid, integer, text, text, text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ajustar_estoque(uuid, integer, text, text, text, uuid, uuid) TO service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. admin_delete_organization → fechar PUBLIC (a v1 só revogou authenticated;
--    PUBLIC deixava anon/frontend com EXECUTE — o guard do corpo bloqueia, mas
--    por segurança fechamos também a concessão)
-- ═════════════════════════════════════════════════════════════════════════════
REVOKE ALL ON FUNCTION public.admin_delete_organization(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_organization(uuid) TO service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- 4. gerar_token_e_criar_sessao — CRÍTICO: forja JWT de qualquer usuário
--    ⎧ REVOKE de tudo exceto service_role/postgres
--    ⎩ guard no corpo (defense-in-depth): só service_role executa
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.gerar_token_e_criar_sessao(p_user_id uuid, p_email text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_session_id UUID := gen_random_uuid();
    v_now TIMESTAMPTZ := NOW();
    v_not_after TIMESTAMPTZ := v_now + INTERVAL '7 days';
    v_secret TEXT := current_setting('app.jwt_secret', true);
    v_header TEXT;
    v_payload TEXT;
    v_signature TEXT;
    v_token TEXT;
BEGIN
    -- GUARD: apenas chamadas com role service_role (ou superadmin autenticado)
    -- podem forjar sessão. Qualquer outro papel (incl. anon/authenticated) é
    -- bloqueado mesmo se alguém re-grantuar EXECUTE.
    IF COALESCE(current_setting('request.jwt.claims', true)::json->>'role', '') <> 'service_role'
       AND NOT get_is_superadmin() THEN
        RAISE EXCEPTION 'Acesso negado: apenas service_role pode gerar tokens';
    END IF;

    -- Fallback seguro: se app.jwt_secret não estiver configurado, NÃO usar o
    -- segredo hardcoded da versão antiga. O token precisa ser assinado com o
    -- mesmo segredo JWT do Supabase, que NÃO está disponível via SQL.
    -- Antes: v_secret era 'MINHA_CHAVE_SUPER_SECRETA_DE_TESTE' (vazamento).
    IF v_secret IS NULL OR v_secret = '' OR v_secret LIKE '%MINHA_CHAVE_SUPER_SECRETA_DE_TESTE%' THEN
      RAISE EXCEPTION 'Segredo JWT não configurado via app.jwt_secret — geração de token desabilitada (segurança)';
    END IF;

    -- 1. Construir o Payload do JWT (em JSON)
    v_payload := json_build_object(
        'sub', p_user_id::TEXT,
        'email', p_email,
        'role', 'authenticated',
        'exp', EXTRACT(EPOCH FROM v_not_after)::BIGINT,
        'iat', EXTRACT(EPOCH FROM v_now)::BIGINT
    )::TEXT;

    -- 2. Codificar Header e Payload para Base64 (URL-safe)
    v_header := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
    v_payload := replace(replace(replace(encode(convert_to(v_payload, 'utf8'), 'base64'), '+', '-'), '/', '_'), '=', '');

    -- 3. Assinar (Criar a assinatura HMAC-SHA256)
    v_signature := encode(hmac(v_header || '.' || v_payload, v_secret, 'sha256'), 'base64');
    v_signature := replace(replace(replace(v_signature, '+', '-'), '/', '_'), '=', '');

    -- 4. Montar o Token Final
    v_token := v_header || '.' || v_payload || '.' || v_signature;

    -- 5. Inserir o registro na sua tabela
    INSERT INTO sessions (session_id, user_id, email, created_at, not_after, tag)
    VALUES (v_session_id, p_user_id, p_email, v_now, v_not_after, 'manual-session');

    -- 6. Retornar o Token
    RETURN v_token;
END;
$function$;

REVOKE ALL ON FUNCTION public.gerar_token_e_criar_sessao(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gerar_token_e_criar_sessao(uuid, text) TO service_role;
RAISE NOTICE 'gerar_token_e_criar_sessao restrita a service_role (segredo hardcoded removido)';

-- ═════════════════════════════════════════════════════════════════════════════
-- 5. process_sale_transaction → frontend usa (authenticated) — fechar PUBLIC
-- ═════════════════════════════════════════════════════════════════════════════
REVOKE ALL ON FUNCTION public.process_sale_transaction(uuid, text, integer, numeric, numeric, numeric, text, text, uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_sale_transaction(uuid, text, integer, numeric, numeric, numeric, text, text, uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_sale_transaction(uuid, text, integer, numeric, numeric, numeric, text, text, uuid, uuid, jsonb) TO service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- 6. fn_insserir_dlq → frontend usa (authenticated) — fechar PUBLIC
-- ═════════════════════════════════════════════════════════════════════════════
REVOKE ALL ON FUNCTION public.fn_insserir_dlq(text, text, text, jsonb, text, text, integer, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_insserir_dlq(text, text, text, jsonb, text, text, integer, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_insserir_dlq(text, text, text, jsonb, text, text, integer, text, text, text, text, text) TO service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- 7. mark_user_logout → App.tsx usa (authenticated) — fechar PUBLIC
-- ═════════════════════════════════════════════════════════════════════════════
REVOKE ALL ON FUNCTION public.mark_user_logout() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_user_logout() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_user_logout() TO service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- 8. reprocessar_movimentacoes_falhas → só server.ts (service_role)
-- ═════════════════════════════════════════════════════════════════════════════
REVOKE ALL ON FUNCTION public.reprocessar_movimentacoes_falhas() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reprocessar_movimentacoes_falhas() TO service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- 9. debug_auth → diagnóstica, sem chamadores — só service_role/postgres
-- ═════════════════════════════════════════════════════════════════════════════
REVOKE ALL ON FUNCTION public.debug_auth() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.debug_auth() TO service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- 9b. admin_fetch_* / admin_create_organization / admin_add_user — corpo já
--     exige get_is_superadmin(), mas PUBLIC:EXECUTE continua concedido.
--     Únicos consumidores: OrganizationsView (authenticated/superadmin).
--     Fechar PUBLIC/anon e liberar explicitamente authenticated + service_role.
-- ═════════════════════════════════════════════════════════════════════════════
REVOKE ALL ON FUNCTION public.admin_fetch_organizations() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_fetch_branches(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_fetch_users(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_create_organization(text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_add_user(uuid, uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_fetch_organizations() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_fetch_branches(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_fetch_users(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_organization(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_add_user(uuid, uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_fetch_organizations() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_fetch_branches(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_fetch_users(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_create_organization(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_add_user(uuid, uuid, text, text, text) TO service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- 10. Funções de trigger — fechar PUBLIC/anon apenas (o trigger dispara como o
--     usuário que executa o DDL/DML; authenticated pode criar tabela no schema
--     public → rls_auto_enable precisa de EXECUTE; signup dispara
--     handle_new_user em auth.users) → conceder explicitamente.
-- ═════════════════════════════════════════════════════════════════════════════
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_ensure_cash_session_org() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_ensure_cash_session_org() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ensure_cash_session_org() TO service_role;
GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- 11. VERIFICAÇÃO FINAL (conferir os prints)
-- ═════════════════════════════════════════════════════════════════════════════

-- 11.1. Nenhuma função endurecida deve ter PUBLIC/anon
SELECT routine_name, string_agg(DISTINCT grantee, ', ' ORDER BY grantee) AS grantees
FROM information_schema.role_routine_grants
WHERE routine_schema = 'public'
  AND routine_name IN ('ajustar_estoque', 'admin_delete_organization', 'gerar_token_e_criar_sessao',
                       'process_sale_transaction', 'fn_insserir_dlq', 'mark_user_logout',
                       'reprocessar_movimentacoes_falhas', 'debug_auth', 'handle_new_user',
                       'fn_ensure_cash_session_org', 'rls_auto_enable',
                       'admin_fetch_organizations', 'admin_fetch_branches', 'admin_fetch_users',
                       'admin_create_organization', 'admin_add_user')
GROUP BY routine_name ORDER BY routine_name;

-- 11.2. Semântica de privilégio (assinaturas explícitas)
SELECT 'ajustar_estoque 7-arg' AS fn,
  has_function_privilege('anon', 'public.ajustar_estoque(uuid, integer, text, text, text, uuid, uuid)', 'EXECUTE') AS anon_exec,
  has_function_privilege('authenticated', 'public.ajustar_estoque(uuid, integer, text, text, text, uuid, uuid)', 'EXECUTE') AS auth_exec;

SELECT 'gerar_token_e_criar_sessao' AS fn,
  has_function_privilege('anon', 'public.gerar_token_e_criar_sessao(uuid, text)', 'EXECUTE') AS anon_exec,
  has_function_privilege('authenticated', 'public.gerar_token_e_criar_sessao(uuid, text)', 'EXECUTE') AS auth_exec,
  has_function_privilege('service_role', 'public.gerar_token_e_criar_sessao(uuid, text)', 'EXECUTE') AS service_exec;

SELECT 'process_sale_transaction' AS fn,
  has_function_privilege('anon', 'public.process_sale_transaction(uuid, text, integer, numeric, numeric, numeric, text, text, uuid, uuid, jsonb)', 'EXECUTE') AS anon_exec,
  has_function_privilege('authenticated', 'public.process_sale_transaction(uuid, text, integer, numeric, numeric, numeric, text, text, uuid, uuid, jsonb)', 'EXECUTE') AS auth_exec;

SELECT 'fn_insserir_dlq' AS fn,
  has_function_privilege('anon', 'public.fn_insserir_dlq(text, text, text, jsonb, text, text, integer, text, text, text, text, text)', 'EXECUTE') AS anon_exec,
  has_function_privilege('authenticated', 'public.fn_insserir_dlq(text, text, text, jsonb, text, text, integer, text, text, text, text, text)', 'EXECUTE') AS auth_exec;

-- 11.3. Confirmar que a versão 6-arg do ajustar_estoque NÃO existe mais
SELECT 'ajustar_estoque 6-arg (esperado: 0 linhas)' AS checagem, count(*) AS existe
FROM pg_proc WHERE proname = 'ajustar_estoque'
  AND pronargs = 6 AND pronamespace = 'public'::regnamespace;

-- 11.4. Ajustar_estoque deve ter apenas a assinatura 7-arg (1 linha)
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS assinatura
FROM pg_proc p WHERE p.proname = 'ajustar_estoque' AND p.pronamespace = 'public'::regnamespace;