-- ==============================================================================
-- RECONSTRUIR ORGS ORIGINAIS: usar a tabela `sales` como fonte de verdade
-- A tabela sales NÃO foi alterada pelos meus SQLs, então tem os orgs originais
-- ==============================================================================

-- 1. Todas as organizações existentes
SELECT '--- ORGANIZATIONS ---' as info;
SELECT id::text, name FROM organizations;

-- 2. Mapeamento original: de onde cada usuário vinha (baseado nas sales)
-- user_id na sales = id do system_users
SELECT '--- ORG ORIGINAL POR USUARIO (das sales) ---' as info;
SELECT DISTINCT
    s.user_id::text,
    s.organization_id::text,
    s.operator_name,
    su.email,
    su.id::text as system_user_id
FROM sales s
LEFT JOIN system_users su ON s.user_id::text = su.id::text
WHERE s.user_id IS NOT NULL
ORDER BY s.operator_name;

-- 3. system_users atuais (com org ERRADA - todas DEFAULT_ORG_ID)
SELECT '--- SYSTEM_USERS ATUAIS ---' as info;
SELECT id::text, name, email, organization_id::text
FROM system_users
ORDER BY name;
