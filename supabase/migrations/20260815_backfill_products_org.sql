-- ============================================================
-- BACKFILL: corrige organization_id dos produtos para a org da filial
-- (tenant mismatch: produto com org != org da sua filial)
-- Idempotente e seguro: só atualiza onde há divergência.
-- Rode no Supabase SQL Editor.
-- ============================================================

UPDATE products p
SET organization_id = sb.organization_id
FROM store_branches sb
WHERE p.store_branch_id = sb.id
  AND p.organization_id IS DISTINCT FROM sb.organization_id;

-- Verificação (deve retornar 0 linhas após o UPDATE):
SELECT p.id, p.name, p.organization_id, p.store_branch_id, sb.organization_id AS branch_org
FROM products p
JOIN store_branches sb ON sb.id = p.store_branch_id
WHERE p.organization_id <> sb.organization_id;
