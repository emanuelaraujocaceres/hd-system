-- DIAGNÓSTICO: estado atual das organizações
-- Mostra o que temos no banco para podermos restaurar

-- 1. Todas as organizações existentes
SELECT 'organizations' AS tabela, id::text, name
FROM organizations
ORDER BY name;

-- 2. state atual dos system_users (com orgs ERRADAS depois da correção)
SELECT 'system_users' AS tabela, id::text, name, email, organization_id::text
FROM system_users
ORDER BY name;

-- 3. Todas as outras tabelas que podem ter os UUIDs ORIGINAIS das organizações
-- (essas NÃO foram alteradas pelos meus SQLs de correção)
SELECT 'products - orgs distintas' AS info, organization_id::text
FROM products
WHERE organization_id IS NOT NULL
GROUP BY organization_id;

SELECT 'customers - orgs distintas' AS info, organization_id::text
FROM customers
WHERE organization_id IS NOT NULL
GROUP BY organization_id;

SELECT 'sales - orgs distintas' AS info, organization_id::text  
FROM sales
WHERE organization_id IS NOT NULL
GROUP BY organization_id;

SELECT 'cash_sessions - orgs distintas' AS info, organization_id::text
FROM cash_sessions
WHERE organization_id IS NOT NULL
GROUP BY organization_id;
