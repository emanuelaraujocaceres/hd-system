-- ============================================================
-- Remove trigger duplicador de stock_movements
-- 
-- Problema: A trigger fn_log_stock_changes dispara em todo
-- UPDATE de stock_quantity, criando registros extras com
-- reason='Ajuste automático (trigger)' e operator='system'.
-- 
-- As RPCs já criam stock_movements corretos:
--   - ajustar_estoque() → 1 registro com motivo real + operador
--   - process_sale_transaction() → 1 registro por item
--
-- Cada operação gerava 4-5 registros em vez de 1-2.
-- ============================================================

BEGIN;

-- 1. Remove a trigger
DROP TRIGGER IF EXISTS trg_log_stock_changes ON products;

-- 2. Remove a função da trigger
DROP FUNCTION IF EXISTS fn_log_stock_changes();

-- 3. Remove os registros duplicados genéricos criados pela trigger
--    (reason='Ajuste automático (trigger)' nunca é usado pelas RPCs)
DELETE FROM stock_movements
WHERE reason = 'Ajuste automático (trigger)';

-- 4. Remove duplicatas remanescentes em stock_movements:
--    para cada (product_id, reason, quantity, created_at::date),
--    mantém apenas o registro mais antigo
DELETE FROM stock_movements
WHERE id NOT IN (
  SELECT DISTINCT ON (product_id, reason, quantity, created_at::date) id
  FROM stock_movements
  ORDER BY product_id, reason, quantity, created_at::date, id
);

-- 5. Limpa a DLQ (todos os erros são de antes das correções de schema/RLS)
DELETE FROM movimentacoes_falhas;

-- 6. Verifica resultados
SELECT COUNT(*) AS stock_movements_restantes FROM stock_movements;
SELECT COUNT(*) AS dlq_restante FROM movimentacoes_falhas;

COMMIT;
