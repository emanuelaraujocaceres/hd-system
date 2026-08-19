-- ═══════════════════════════════════════════════════════════════════
-- VERIFY_20260819_helpers_superadmin.sql — DIAGNÓSTICO 3: HELPERS + SUPERADMIN
-- Auditoria total do Supabase (2026-08-19)
-- READ-ONLY: só SELECTs.
-- ═══════════════════════════════════════════════════════════════════

-- ── 3.1 CORPO DAS FUNÇÕES HELPER (definição completa) ─────────────
-- Confirma qual is_superadmin() está ATIVA no banco:
--   • v3 org-NULL:  WHERE superadmin = true AND organization_id IS NULL   ← exige org NULL
--   • BUG-026:      WHERE superadmin = true                              ← correto p/ AGENTS.md
-- Se system_users não tiver coluna superadmin, a função quebra em runtime.
SELECT p.proname AS funcao,
       pg_get_function_identity_arguments(p.oid) AS argumentos,
       p.prosecdef AS security_definer,
       pg_get_functiondef(p.oid) AS definicao
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prokind = 'f'
  AND p.proname IN (
    'is_superadmin', 'get_user_org_id', 'get_user_branch_id', 'get_user_role',
    'set_current_branch', 'get_auth_user_org_id', 'user_branch_filter',
    'fn_insserir_dlq', 'process_dlq', 'fn_validate_store_branch_id',
    'create_branch_policy', 'create_org_policy', 'fn_add_to_realtime'
  )
ORDER BY p.proname;

-- ── 3.2 COLUNAS DE system_users E profiles ─────────────────────────
-- system_users precisa ter: superadmin? role? store_branch_id?
-- profiles precisa ter: organization_id? (usado por helpers antigos)
SELECT table_name AS tabela,
       string_agg(column_name, ', ' ORDER BY ordinal_position) AS colunas,
       bool_or(column_name = 'superadmin') AS tem_superadmin,
       bool_or(column_name = 'store_branch_id') AS tem_store_branch_id,
       bool_or(column_name = 'organization_id') AS tem_organization_id,
       bool_or(column_name = 'role') AS tem_role
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name IN ('system_users', 'profiles')
GROUP BY table_name
ORDER BY table_name;

-- ── 3.3 USUÁRIOS: quem é superadmin e em qual org está ─────────────
-- CRÍTICO: se is_superadmin() ativo exige organization_id IS NULL e o
-- superadmin tem org setada, o bypass RLS morre e ele fica bloqueado.
-- (Colunas `superadmin` podem não existir — resultado da 3.2 confirma.)
SELECT id, email, name, organization_id, role, store_branch_id, is_active
FROM system_users
ORDER BY email;

-- ── 3.4 FUNÇÕES DLQ EXISTEM? (404 no log do frontend) ──────────────
SELECT proname AS funcao, pg_get_function_identity_arguments(oid) AS argumentos
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname ILIKE '%dlq%'
ORDER BY proname;

-- ── 3.5 ORGANIZAÇÕES E FILIAIS (para conferir os contextos reais) ──
SELECT id, name, active, subscription_expires_at
FROM organizations
ORDER BY name;

-- store_branches: só colunas 100% presentes no doc (code/city/state/cnpj
-- podem não existir — o doc pode estar defasado; confirmar em 1.3 caso error)
SELECT id, name, organization_id
FROM store_branches
ORDER BY name;