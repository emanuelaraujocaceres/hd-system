-- ============================================================
-- DIAGNÓSTICO DE ISOLAMENTO DE PRODUTOS  (Supabase SQL Editor)
-- Objetivo: provar se algum produto vaza entre filiais.
-- Rode bloco a bloco e copie o resultado p/ o assistente.
-- ============================================================

-- A) TODAS as filiais (mapear nome -> id -> org)
SELECT id, organization_id, name, is_active
FROM store_branches
ORDER BY organization_id, name;

-- B) TODOS os produtos de TODAS as filiais de TODAS as orgs
--    (com nome da filial e da org para facilitar a leitura)
SELECT
  p.id,
  p.name,
  p.is_active,
  p.organization_id,
  o.name        AS org_name,
  p.store_branch_id,
  sb.name       AS branch_name,
  p.created_at
FROM products p
LEFT JOIN organizations o  ON o.id  = p.organization_id
LEFT JOIN store_branches sb ON sb.id = p.store_branch_id
ORDER BY o.name, sb.name, p.name;

-- C) Produtos SEM filial (store_branch_id nulo/vazio)
--    Estes NUNCA aparecem no app quando uma filial está selecionada,
--    mas listamos para garantir que não há "órfãos" vazando.
SELECT id, name, organization_id, store_branch_id, created_at
FROM products
WHERE store_branch_id IS NULL OR store_branch_id::text = '';

-- D) Produtos com store_branch_id que NÃO existe em store_branches (órfão)
SELECT p.id, p.name, p.organization_id, p.store_branch_id
FROM products p
LEFT JOIN store_branches sb ON sb.id = p.store_branch_id
WHERE p.store_branch_id IS NOT NULL AND sb.id IS NULL;

-- E) Produtos cuja filial pertence a OUTRA organização (inconsistência de tenant)
SELECT p.id, p.name, p.organization_id, p.store_branch_id, sb.organization_id AS branch_org
FROM products p
JOIN store_branches sb ON sb.id = p.store_branch_id
WHERE p.organization_id <> sb.organization_id;

-- F1) Foco: produtos MARCADOS para a filial "Matriz do Consultório"
--     (se aparecerem produtos que você acha que são de OUTRA filial,
--      então estão etiquetados na Matriz por engano -> precisa backfill)
SELECT p.id, p.name, p.is_active, p.organization_id, p.store_branch_id, sb.name AS branch_name
FROM products p
LEFT JOIN store_branches sb ON sb.id = p.store_branch_id
WHERE p.store_branch_id = (
  SELECT id FROM store_branches WHERE name ILIKE '%matriz%consult%' LIMIT 1
)
ORDER BY p.name;

-- F2) Produtos de OUTRAS filiais DENTRO da MESMA org da Matriz
--     (confirmar que existem produtos "da outra filial" e ver para qual branch apontam)
SELECT p.id, p.name, sb.name AS branch_name, p.store_branch_id, p.organization_id
FROM products p
JOIN store_branches sb ON sb.id = p.store_branch_id
WHERE sb.organization_id = (
  SELECT organization_id FROM store_branches WHERE name ILIKE '%matriz%consult%' LIMIT 1
)
AND sb.name NOT ILIKE '%matriz%consult%'
ORDER BY sb.name, p.name;

-- G) Contagem de produtos por filial (resumo rápido)
SELECT sb.name AS branch_name,
       sb.organization_id,
       COUNT(p.id) AS total_produtos
FROM store_branches sb
LEFT JOIN products p ON p.store_branch_id = sb.id
GROUP BY sb.id, sb.name, sb.organization_id
ORDER BY sb.organization_id, sb.name;
