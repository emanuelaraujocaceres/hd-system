-- ==============================================================================
-- 20260806_limpeza_dados_teste.sql
-- --------------------------------------------------------------------------------
-- Limpeza CIRÚRGICA dos dados de teste da venda:
--   VEN-MSHT761V-XDVL   (R$ 86,80 em PIX — já excluída pela UI do PDV)
--
-- Contextualizado para a filial de teste (store_branch_id: e5085eba).
-- A venda foi deletada do cloud (sales) e do localStorage (storageService.deleteSale
--   remove do cache local), mas sobrou:
--   (a) movimentações de estoque DUPLICADAS em stock_movements
--   (motivo: retry de syncStockMovement — o RPC process_sale_transaction já NÃO
--    insere movimentos desde 20260809; o frontend é o único produtor);
--   (b) o estoque dos produtos foi deduzido (10->9 Gin, 38->37 Lager);
--   (c) total_sales_pix na sessão aberta do Gustavo = 86.80 (única venda PIX).
--
-- IMPORTANTE (AGENTS.md #5): ao contrário de um RESET de dados, o delete da
--   venda já foi refletido no localStorage (removeSaleFromRemote / deleteSale
--   fazem this.set(KEYS.SALES, ...) sem a venda), portanto NÃO há risco de
--   ressurreição via hidratação. Não é preciso limpar localStorage antes.
--
-- IDEMPOTENTE: pode rodar quantas vezes quiser; se já dedupou, é no-op.
-- EXECUTAR no Supabase SQL Editor (role: service_role/admin, para burlar RLS).
-- ==============================================================================

-- ── 1. DIAGNÓSTICO (leitura) antes de qualquer alteração ─────────────────────
SELECT id, product_name, type, quantity, previous_stock, new_stock, created_at
FROM   stock_movements
WHERE  reason LIKE 'Venda PDV #VEN-MSHT761V-XDVL%'
ORDER  BY product_name, created_at;

SELECT id, store_branch_id, operator_name, status,
       total_sales_cash, total_sales_pix, total_sales_card, total_sales_credit_account
FROM   cash_sessions
WHERE  status = 'open';

SELECT id, name, stock_quantity, store_branch_id
FROM   products
WHERE  id IN ('0ff082a4-ea1f-4b2e-b9dc-f0c2a22edc25',   -- Gin 750 ml — PC-001
              '3ec2d5f5-89bd-4763-afd5-37bcb175d52b');    -- Lager 350 ml — PC-001


-- ── 2. LIMPEZA (transacional, por filial) ─────────────────────────────────────
BEGIN;

-- (a) Deduplicar movimentações: manter apenas a primeira (menor created_at) de
--     cada produto. Remove dups idempotentemente.
DELETE FROM stock_movements
WHERE  reason LIKE 'Venda PDV #VEN-MSHT761V-XDVL%'
  AND  ctid NOT IN (
        SELECT MIN(ctid)
        FROM   stock_movements
        WHERE  reason LIKE 'Venda PDV #VEN-MSHT761V-XDVL%'
        GROUP  BY product_id, quantity, type
      );

-- (b) RESTAURAR estoque devolvendo a quantidade efetivamente deduzida.
--     DISTINCT ON (product_id) garante +1 por produto mesmo com linhas remanescentes.
WITH dedup AS (
  SELECT DISTINCT ON (product_id) product_id, quantity
  FROM   stock_movements
  WHERE  reason LIKE 'Venda PDV #VEN-MSHT761V-XDVL%'
    AND  type = 'out'
  ORDER  BY product_id, created_at
)
UPDATE products p
SET    stock_quantity = p.stock_quantity + d.quantity,
       updated_at = NOW()
FROM   dedup d
WHERE  d.product_id::text = p.id::text;

-- (c) Apagar todas as movimentações da venda de teste
--     (já foram usadas para restaurar estoque acima).
DELETE FROM stock_movements
WHERE  reason LIKE 'Venda PDV #VEN-MSHT761V-XDVL%';

-- (d) Zerar o total de PIX da sessão aberta de teste.
--     Segurança: apenas sessões onde PIX é o ÚNICO total (cash/card/credit=0),
--     que é exatamente a sessão do teste (uma única venda PIX = 86.80).
UPDATE cash_sessions
SET    total_sales_pix = 0
WHERE  status = 'open'
  AND  total_sales_cash = 0
  AND  total_sales_card = 0
  AND  total_sales_credit_account = 0
  AND  total_sales_pix > 0;

COMMIT;


-- ── 3. VERIFICAÇÃO PÓS-LIMPEZA ───────────────────────────────────────────────
-- Estoque deve voltar a 10 (Gin) e 38 (Lager)
SELECT id, name, stock_quantity
FROM   products
WHERE  id IN ('0ff082a4-ea1f-4b2e-b9dc-f0c2a22edc25',
              '3ec2d5f5-89bd-4763-afd5-37bcb175d52b');

-- Movimentações da venda de teste devem ser zero
SELECT COUNT(*) AS movimentos_restantes
FROM   stock_movements
WHERE  reason LIKE 'Venda PDV #VEN-MSHT761V-XDVL%';

-- total_sales_pix da sessão aberta deve ser 0
SELECT id, operator_name, total_sales_cash, total_sales_pix,
       total_sales_card, total_sales_credit_account
FROM   cash_sessions
WHERE  status = 'open';
