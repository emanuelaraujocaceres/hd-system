-- ============================================================
-- Cleanup: deduplicate sale_items
-- Problema: syncSale() omitia o campo `id` no upsert, então
-- cada chamada criava um novo INSERT em vez de atualizar a linha
-- existente. Resultado: 18.763 rows para 49 vendas (média ~383
-- itens/venda) quando o correto é ~150 (média 3 itens/venda).
--
-- Esta query mantém apenas o registro mais antigo por
-- (sale_id, product_id), que é o registro original de cada venda.
-- ============================================================

BEGIN;

-- Remove linhas duplicadas mantendo um ID por (sale_id, product_id).
-- Usamos DISTINCT ON (PostgreSQL) porque MIN/MAX não funcionam em UUID.
DELETE FROM sale_items
WHERE id NOT IN (
  SELECT DISTINCT ON (sale_id, product_id) id
  FROM sale_items
  ORDER BY sale_id, product_id, id
);

-- Verifica resultado
SELECT COUNT(*) AS remaining_items FROM sale_items;

-- (opcional) Confere a média de itens por venda
SELECT ROUND(COUNT(*)::numeric / NULLIF(
  (SELECT COUNT(*) FROM sales WHERE status IN ('completed', 'pending')), 0
), 1) AS avg_items_per_sale
FROM sale_items;

COMMIT;
