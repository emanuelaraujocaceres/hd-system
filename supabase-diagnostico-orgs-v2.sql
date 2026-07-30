-- DIAGNÓSTICO: Mostra tudo sem depender de colunas específicas

SELECT '--- ORGANIZATIONS ---' as info;
SELECT * FROM organizations;

SELECT '--- SYSTEM_USERS ---' as info;
SELECT * FROM system_users;

SELECT '--- PROFILES ---' as info;
SELECT * FROM profiles;

SELECT '--- PRODUCTS (amostra 5) ---' as info;
SELECT * FROM products LIMIT 5;

SELECT '--- CUSTOMERS (amostra 5) ---' as info;
SELECT * FROM customers LIMIT 5;

SELECT '--- SALES (amostra 5) ---' as info;
SELECT * FROM sales LIMIT 5;
