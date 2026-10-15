-- ============================================================
-- BLOCO 3: Verificar se a tabela sale_items também precisa de grants (se ainda falta)
-- ============================================================
SELECT grantee, privilege_type FROM information_schema.table_privileges
WHERE table_name = 'sale_items' AND table_schema = 'public';
