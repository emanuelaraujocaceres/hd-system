-- ==============================================================================
-- DIAGNÓSTICO DE ISOLAMENTO MULTI-TENANT — HD-System ERP/PDV
-- ==============================================================================
-- Execute no SQL Editor do Supabase Dashboard (é SEGURO: apenas leitura).
-- Nada aqui altera dados. O objetivo é revelar POR QUE o Plantão da Cerveja
-- não sincroniza (403 no cash_sessions) e onde está cada usuário vinculado.
--
-- Depois de rodar, copie TODO o resultado (aba "Results") e cole aqui no chat.
-- ==============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. ORGANIZAÇÕES CADASTRADAS
-- ═══════════════════════════════════════════════════════════════════════════
SELECT '=== 1. ORGANIZAÇÕES ===' AS secao;
SELECT id, name, created_at FROM organizations ORDER BY created_at ASC;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. FILIAIS POR ORGANIZAÇÃO
-- ═══════════════════════════════════════════════════════════════════════════
SELECT '=== 2. FILIAIS ===' AS secao;
SELECT sb.id, sb.name, sb.code, sb.organization_id, o.name AS org_name, sb.active
FROM store_branches sb
LEFT JOIN organizations o ON o.id = sb.organization_id
ORDER BY o.name, sb.name;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. TODOS OS USUÁRIOS: auth.users × system_users × profiles
--    (aqui vemos se os IDs batem com o Auth e qual org cada um tem)
-- ═══════════════════════════════════════════════════════════════════════════
SELECT '=== 3. USUÁRIOS: auth × system_users × profiles ===' AS secao;
SELECT
  au.id            AS auth_user_id,
  au.email         AS email,
  su.id            AS system_user_id,
  (su.id = au.id)  AS id_bate_com_auth,
  su.name          AS nome,
  su.role          AS cargo,
  su.organization_id AS org_no_system_users,
  o.name           AS org_nome,
  su.store_branch_id AS filial_id,
  sb.name          AS filial_nome,
  sb.organization_id AS org_da_filial,
  su.superadmin    AS superadmin,
  p.id             AS profile_id,
  (p.id = au.id)   AS profile_id_bate_com_auth,
  p.organization_id AS org_no_profile
FROM auth.users au
LEFT JOIN system_users su  ON su.email = au.email
LEFT JOIN store_branches sb ON sb.id::text = su.store_branch_id
LEFT JOIN organizations o  ON o.id = su.organization_id
LEFT JOIN profiles p       ON p.id = au.id
ORDER BY au.email;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. USUÁRIOS DO APP SEM CONTA NO AUTH (órfãos)
-- ═══════════════════════════════════════════════════════════════════════════
SELECT '=== 4. system_users SEM conta no Auth ===' AS secao;
SELECT su.id, su.email, su.name, su.organization_id
FROM system_users su
LEFT JOIN auth.users au ON au.email = su.email
WHERE au.id IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. E-MAILS DUPLICADOS EM system_users (causa de "more than one row")
-- ═══════════════════════════════════════════════════════════════════════════
SELECT '=== 5. E-MAILS DUPLICADOS EM system_users ===' AS secao;
SELECT email, COUNT(*) AS qtd, array_agg(id::text) AS ids
FROM system_users
GROUP BY email
HAVING COUNT(*) > 1;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. USUÁRIOS SEM ORGANIZAÇÃO (organization_id NULL)
--    ⚠️ Se aparecer Gustavo/Maria aqui, este é o motivo do 403!
-- ═══════════════════════════════════════════════════════════════════════════
SELECT '=== 6. system_users COM organization_id NULL ===' AS secao;
SELECT id, email, name, role, store_branch_id
FROM system_users
WHERE organization_id IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. PROFILES SEM ORGANIZAÇÃO
-- ═══════════════════════════════════════════════════════════════════════════
SELECT '=== 7. profiles COM organization_id NULL ===' AS secao;
SELECT id, email, name, role FROM profiles WHERE organization_id IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. QUAL ORGANIZAÇÃO CADA USUÁRIO REALMENTE USOU (atividade real)
--    Identifica dados que foram gravados na org errada (poluição cruzada)
-- ═══════════════════════════════════════════════════════════════════════════
SELECT '=== 8. ATIVIDADE POR user_id EM cash_sessions ===' AS secao;
SELECT user_id, COUNT(*) AS qtd, array_agg(DISTINCT organization_id::text) AS orgs_usadas
FROM cash_sessions
GROUP BY user_id
ORDER BY qtd DESC;

SELECT '=== 8b. ATIVIDADE POR user_id EM sales ===' AS secao;
SELECT user_id, COUNT(*) AS qtd, array_agg(DISTINCT organization_id::text) AS orgs_usadas
FROM sales
GROUP BY user_id
ORDER BY qtd DESC;

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. DADOS POR ORGANIZAÇÃO (quanto cada org tem em cada tabela)
-- ═══════════════════════════════════════════════════════════════════════════
SELECT '=== 9. QUANTIDADE DE DADOS POR ORGANIZAÇÃO ===' AS secao;
SELECT 'sales' AS tabela, organization_id, COUNT(*) AS qtd FROM sales GROUP BY organization_id
UNION ALL SELECT 'cash_sessions', organization_id, COUNT(*) FROM cash_sessions GROUP BY organization_id
UNION ALL SELECT 'products', organization_id, COUNT(*) FROM products GROUP BY organization_id
UNION ALL SELECT 'stock_movements', organization_id, COUNT(*) FROM stock_movements GROUP BY organization_id
UNION ALL SELECT 'financial_transactions', organization_id, COUNT(*) FROM financial_transactions GROUP BY organization_id
UNION ALL SELECT 'system_users', organization_id, COUNT(*) FROM system_users GROUP BY organization_id
ORDER BY tabela, organization_id;

-- ═══════════════════════════════════════════════════════════════════════════
-- 10. DEFINIÇÃO ATUAL DAS FUNÇÕES DE ISOLAMENTO
--     (mostra qual versão está instalada no banco agora)
-- ═══════════════════════════════════════════════════════════════════════════
SELECT '=== 10. FUNÇÕES ATUAIS ===' AS secao;
SELECT p.proname AS funcao, pg_get_functiondef(p.oid) AS definicao
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname IN ('get_auth_user_org_id', 'is_superadmin', 'get_is_superadmin')
ORDER BY p.proname;

-- ═══════════════════════════════════════════════════════════════════════════
-- 11. POLICIES RLS ATIVAS (cash_sessions, system_users, profiles, sales)
-- ═══════════════════════════════════════════════════════════════════════════
SELECT '=== 11. POLICIES RLS ===' AS secao;
SELECT tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('cash_sessions', 'system_users', 'profiles', 'sales', 'organizations')
ORDER BY tablename, policyname;

-- ═══════════════════════════════════════════════════════════════════════════
-- 12. TRIGGERS DE GARANTIA DE ORGANIZAÇÃO (se existirem)
-- ═══════════════════════════════════════════════════════════════════════════
SELECT '=== 12. TRIGGERS ===' AS secao;
SELECT tgname, tgrelid::regclass AS tabela
FROM pg_trigger
WHERE NOT tgisinternal
  AND tgname IN ('trg_ensure_cash_session_org', 'trg_ensure_system_user_org', 'on_auth_user_created');

-- ═══════════════════════════════════════════════════════════════════════════
-- 13. RLS ATIVO POR TABELA
-- ═══════════════════════════════════════════════════════════════════════════
SELECT '=== 13. RLS ATIVO POR TABELA ===' AS secao;
SELECT relname AS tabela, relrowsecurity AS rls_ativo
FROM pg_class
WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'
ORDER BY relname;

-- ═══════════════════════════════════════════════════════════════════════════
-- 14. REALTIME PUBLICATION (tabelas que disparam eventos em tempo real)
-- ═══════════════════════════════════════════════════════════════════════════
SELECT '=== 14. REALTIME PUBLICATION ===' AS secao;
SELECT tablename FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;

-- ═══════════════════════════════════════════════════════════════════════════
-- 15. CONTA DE ACESSO SUPERVISOR (superadmin)
-- ═══════════════════════════════════════════════════════════════════════════
SELECT '=== 15. SUPERADMIN ===' AS secao;
SELECT id, email, name, superadmin, organization_id
FROM system_users
WHERE superadmin = TRUE;

-- ═══════════════════════════════════════════════════════════════════════════
-- FIM DO DIAGNÓSTICO
-- Cole o resultado completo (abas "Results" / "Data Output") no chat.
-- ═══════════════════════════════════════════════════════════════════════════
