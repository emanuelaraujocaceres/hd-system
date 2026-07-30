-- =============================================================
-- supabase-corrigir-dados-historicos.sql
-- Corrige dados históricos: UUIDs de filial e preço do Heineken 269ml
-- Executar no Supabase SQL Editor
-- =============================================================

-- 1. Mapeamento de UUIDs das filiais
-- br-01 -> f3265a77-5946-5cd3-b09c-725ac4d26952
-- br-02 -> 32b31da2-00e8-570c-8a10-2d6ae23c9eee
-- br-03 -> 62a2b07b-4237-559a-a2cd-e0fc7dcbecdc

-- 2. Corrigir store_branch_id em sales: atualizar códigos curtos para UUIDs
UPDATE sales
SET store_branch_id = CASE store_branch_id
  WHEN 'br-01' THEN 'f3265a77-5946-5cd3-b09c-725ac4d26952'
  WHEN 'br-02' THEN '32b31da2-00e8-570c-8a10-2d6ae23c9eee'
  WHEN 'br-03' THEN '62a2b07b-4237-559a-a2cd-e0fc7dcbecdc'
  ELSE store_branch_id
END
WHERE store_branch_id IN ('br-01', 'br-02', 'br-03');

SELECT 'sales' AS tabela, COUNT(*) AS linhas_atualizadas
FROM sales
WHERE store_branch_id IN ('f3265a77-5946-5cd3-b09c-725ac4d26952', '32b31da2-00e8-570c-8a10-2d6ae23c9eee', '62a2b07b-4237-559a-a2cd-e0fc7dcbecdc');

-- 3. Corrigir store_branch_id em caixa (cash_sessions)
UPDATE cash_sessions
SET store_branch_id = CASE store_branch_id
  WHEN 'br-01' THEN 'f3265a77-5946-5cd3-b09c-725ac4d26952'
  WHEN 'br-02' THEN '32b31da2-00e8-570c-8a10-2d6ae23c9eee'
  WHEN 'br-03' THEN '62a2b07b-4237-559a-a2cd-e0fc7dcbecdc'
  ELSE store_branch_id
END
WHERE store_branch_id IN ('br-01', 'br-02', 'br-03');

SELECT 'cash_sessions' AS tabela, COUNT(*) AS linhas_atualizadas
FROM cash_sessions
WHERE store_branch_id IN ('f3265a77-5946-5cd3-b09c-725ac4d26952', '32b31da2-00e8-570c-8a10-2d6ae23c9eee', '62a2b07b-4237-559a-a2cd-e0fc7dcbecdc');

-- 4. Corrigir store_branch_id em stock_movements
UPDATE stock_movements
SET store_branch_id = CASE store_branch_id
  WHEN 'br-01' THEN 'f3265a77-5946-5cd3-b09c-725ac4d26952'
  WHEN 'br-02' THEN '32b31da2-00e8-570c-8a10-2d6ae23c9eee'
  WHEN 'br-03' THEN '62a2b07b-4237-559a-a2cd-e0fc7dcbecdc'
  ELSE store_branch_id
END
WHERE store_branch_id IN ('br-01', 'br-02', 'br-03');

SELECT 'stock_movements' AS tabela, COUNT(*) AS linhas_atualizadas
FROM stock_movements
WHERE store_branch_id IN ('f3265a77-5946-5cd3-b09c-725ac4d26952', '32b31da2-00e8-570c-8a10-2d6ae23c9eee', '62a2b07b-4237-559a-a2cd-e0fc7dcbecdc');

-- 5. Corrigir store_branch_id em financial_transactions
UPDATE financial_transactions
SET store_branch_id = CASE store_branch_id
  WHEN 'br-01' THEN 'f3265a77-5946-5cd3-b09c-725ac4d26952'
  WHEN 'br-02' THEN '32b31da2-00e8-570c-8a10-2d6ae23c9eee'
  WHEN 'br-03' THEN '62a2b07b-4237-559a-a2cd-e0fc7dcbecdc'
  ELSE store_branch_id
END
WHERE store_branch_id IN ('br-01', 'br-02', 'br-03');

SELECT 'financial_transactions' AS tabela, COUNT(*) AS linhas_atualizadas
FROM financial_transactions
WHERE store_branch_id IN ('f3265a77-5946-5cd3-b09c-725ac4d26952', '32b31da2-00e8-570c-8a10-2d6ae23c9eee', '62a2b07b-4237-559a-a2cd-e0fc7dcbecdc');

-- 6. Corrigir store_branch_id em system_users
UPDATE system_users
SET store_branch_id = CASE store_branch_id
  WHEN 'br-01' THEN 'f3265a77-5946-5cd3-b09c-725ac4d26952'
  WHEN 'br-02' THEN '32b31da2-00e8-570c-8a10-2d6ae23c9eee'
  WHEN 'br-03' THEN '62a2b07b-4237-559a-a2cd-e0fc7dcbecdc'
  ELSE store_branch_id
END
WHERE store_branch_id IN ('br-01', 'br-02', 'br-03');

SELECT 'system_users' AS tabela, COUNT(*) AS linhas_atualizadas
FROM system_users
WHERE store_branch_id IN ('f3265a77-5946-5cd3-b09c-725ac4d26952', '32b31da2-00e8-570c-8a10-2d6ae23c9eee', '62a2b07b-4237-559a-a2cd-e0fc7dcbecdc');

-- 7. Corrigir store_branch_id em products
UPDATE products
SET store_branch_id = CASE store_branch_id
  WHEN 'br-01' THEN 'f3265a77-5946-5cd3-b09c-725ac4d26952'
  WHEN 'br-02' THEN '32b31da2-00e8-570c-8a10-2d6ae23c9eee'
  WHEN 'br-03' THEN '62a2b07b-4237-559a-a2cd-e0fc7dcbecdc'
  ELSE store_branch_id
END
WHERE store_branch_id IN ('br-01', 'br-02', 'br-03');

SELECT 'products' AS tabela, COUNT(*) AS linhas_atualizadas
FROM products
WHERE store_branch_id IN ('f3265a77-5946-5cd3-b09c-725ac4d26952', '32b31da2-00e8-570c-8a10-2d6ae23c9eee', '62a2b07b-4237-559a-a2cd-e0fc7dcbecdc');

-- 8. Corrigir store_branch_id em stock_movements (itens de venda / sale_items)
-- sale_items não tem store_branch_id diretamente, mas a FK é sale_id na sales table

-- =============================================================
-- 9. VERIFICAR E CORRIGIR PREÇO DO HEINEKEN
-- Procurar produto "Heineken" com preço zero e corrigir
-- =============================================================
SELECT id, name, salePrice, costPrice, barcode
FROM products
WHERE LOWER(name) LIKE '%heineken%' AND (salePrice = 0 OR salePrice IS NULL);

-- Se encontrados, atualizar o preço. Ajuste o valor conforme necessário.
-- Exemplo: Heineken Long Neck 330ml unidade (269ml) costo ~R$4.50, venda ~R$7.50
-- ATENÇÃO: Descomente a linha abaixo APÓS confirmar o ID do produto:
/*
UPDATE products
SET salePrice = 7.50, costPrice = 4.50
WHERE id = 'COLE_O_UUID_AQUI' AND LOWER(name) LIKE '%heineken%';
*/

-- =============================================================
-- 10. Se o Heineken 269ml tem código de barras conhecido:
-- Buscar por barcode para encontrar UUID e preço correto
SELECT id, name, barcode, salePrice, costPrice
FROM products
WHERE LOWER(name) LIKE '%heineken%';
