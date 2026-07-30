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

-- Remove linhas duplicadas mantendo a mais antiga (menor created_at
-- ou menor id como fallback)
DELETE FROM sale_items
WHERE id NOT IN (
  SELECT MIN(id)
  FROM sale_items
  GROUP BY sale_id, product_id
);

-- Verifica resultado
SELECT COUNT(*) AS remaining_items FROM sale_items;

-- (opcional) Confere a média de itens por venda
SELECT ROUND(COUNT(*)::numeric / NULLIF(
  (SELECT COUNT(*) FROM sales WHERE status IN ('completed', 'pending')), 0
), 1) AS avg_items_per_sale
FROM sale_items;

COMMIT;
