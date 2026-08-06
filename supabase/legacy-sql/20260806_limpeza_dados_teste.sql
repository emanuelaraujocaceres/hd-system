-- ==============================================================================
-- 20260806_limpeza_dados_teste.sql
-- --------------------------------------------------------------------------------
-- Limpeza CIRÚRGICA dos dados de teste produzidos pela venda:
--   VEN-MSHT761V-XDVL   (R$ 86,80 em PIX — já excluída pela UI do PDV)
--
-- Contextualizado para a filial de teste (store_branch_id: e5085eba-...).
-- Esta venda foi deletada do cloud, mas deixou vestígios:
--   (a) 4 linhas DUPLICADAS em stock_movements  (2x Gin, 2x Lager) — caused by
--       submission duplo de movimentos de estoque pelo syncStockMovement;
--   (b) o estoque dos produtos foi deduzido uma única vez (10->9 Gin; 38->37 Lager),
--       então basta restaurar +1 em cada;
--   (c) a sessão de caixa aberta do operador (pix=86.80) ainda carrega o total
--       absoluto de PIX desta venda → zerar.
--
-- REGRA DE SINCRONIA observada: nada aqui toca contadores do cloud de forma
-- incremental; apenas reverte os resíduos da venda de teste para deixar o cloud
-- idênttico ao estado pré-teste.
--
--  ▶ Como aplicar: copie este script → Supabase SQL Editor → execute.
--    (role: service_role ou administrador, para burlar RLS multi-tenant)
-- ==============================================================================

-- ── 1. DIAGNÓSTICO: veja antes de alterar ──────────────────────────────────────
SELECT product_name, type, quantity, previous_stock, new_stock, created_at
FROM   stock_movements
WHERE  reason LIKE 'Venda PDV #VEN-MSHT761V-XDVL%'
ORDER  BY created_at;

SELECT id, store_branch_id, operator_name, status, total_sales_cash,
       total_sales_pix, total_sales_card, total_sales_credit_account,
       opened_at
FROM   cash_sessions
WHERE  status = 'open' AND total_sales_pix > 0;

SELECT id, name, stock_quantity, store_branch_id
FROM   products
WHERE  id IN ('0ff082a4-ea1f-4b2e-b9dc-f0c2a22edc25',   -- Gin 750 ml — PC-001
              '3ec2d5f5-89bd-4763-afd5-37bcb175d52b');    -- Lager 350 ml — PC-001


-- ── 2. Executa a limpeza (tudo dentro de uma transação) ───────────────────────
BEGIN;

-- (a) Remover DUPLICATAS de stock_movements da venda de teste,
--     mantendo apenas a PRIMEIRA movimentação de cada produto.
DELETE FROM stock_movements
WHERE  reason LIKE 'Venda PDV #VEN-MSHT761V-XDVL%'
  AND  (product_name, created_at) NOT IN (
        SELECT product_name, MIN(created_at)
        FROM   stock_movements
        WHERE  reason LIKE 'Venda PDV #VEN-MSHT761V-XDVL%'
        GROUP  BY product_name
      );

-- (b) RESTAURAR estoque: devolver a quantidade deduzida por item.
--     Depois da deduplicação acima resta 1 linha por produto (qty=1).
UPDATE products p
SET    stock_quantity = p.stock_quantity + m.quantity,
       updated_at = NOW()
FROM   (
        SELECT DISTINCT ON (product_id) product_id, quantity
        FROM   stock_movements
        WHERE  reason LIKE 'Venda PDV #VEN-MSHT761V-XDVL%'
          AND  type = 'out'
        ORDER  BY product_id, created_at
       ) m
WHERE  m.product_id::text = p.id::text;

-- (c) Apagar as movimentações restantes da venda de teste
--     (já usadas para restaurar estoque — não são mais necessárias).
DELETE FROM stock_movements
WHERE  reason LIKE 'Venda PDV #VEN-MSHT761V-XDVL%';

-- (d) Zerar o total de PIX da sessão aberta de teste.
--     A venda foi a única operação PIX dessa sessão (pix=86.80, demais=0).
UPDATE cash_sessions
SET    total_sales_pix = 0
WHERE  status = 'open'
  AND  total_sales_pix > 0
  AND  total_sales_cash = 0
  AND  total_sales_card = 0
  AND  total_sales_credit_account = 0;

COMMIT;

-- ── 3. VERIFICAÇÃO PÓS-CLEANUP ───────────────────────────────────────────────
SELECT product_name, stock_quantity
FROM   products
WHERE  id IN ('0ff082a4-ea1f-4b2e-b9dc-f0c2a22edc25',
              '3ec2d5f5-89bd-4763-afd5-37bcb175d52b');

SELECT COUNT(*) AS movimentos_restantes
FROM   stock_movements
WHERE  reason LIKE 'Venda PDV #VEN-MSHT761V-XDVL%';

SELECT id, operator_name, total_sales_cash, total_sales_pix,
       total_sales_card, total_sales_credit_account
FROM   cash_sessions
WHERE  status = 'open' AND total_sales_pix > 0;
