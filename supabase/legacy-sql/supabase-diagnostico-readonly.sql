-- ==============================================================================
-- DIAGNÓSTICO READ-ONLY: entender as ORGs originais antes de tocar em nada
-- ==============================================================================

-- 1. Todas as organizações existentes
SELECT '=== ORGANIZATIONS ===' AS secao;
SELECT id::text, name FROM organizations ORDER BY name;

-- 2. Todos os system_users (com suas orgs ATUAIS)
SELECT '=== SYSTEM_USERS (atuais) ===' AS secao;
SELECT id::text, name, email, organization_id::text FROM system_users ORDER BY name;

-- 3. Mapeamento ORIGINAL: user_id → organization_id (da tabela sales, NÃO alterada)
SELECT '=== ORG ORIGINAL POR USER_ID (das sales) ===' AS secao;
SELECT DISTINCT
    s.user_id::text,
    s.organization_id::text,
    s.operator_name
FROM sales s
WHERE s.user_id IS NOT NULL
ORDER BY s.operator_name;

-- 4. Mapeamento: user_id → system_user (para confirmar a ligação)
SELECT '=== SISTEMA_USERS x SALES (join) ===' AS secao;
SELECT DISTINCT
    su.id::text,
    su.name,
    su.email,
    su.organization_id::text as current_org,
    s.organization_id::text as original_org_from_sales
FROM system_users su
LEFT JOIN sales s ON su.id::text = s.user_id::text
WHERE s.organization_id IS NOT NULL
ORDER BY su.name;
