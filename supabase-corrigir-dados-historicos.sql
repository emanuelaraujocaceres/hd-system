-- =============================================================
-- supabase-corrigir-dados-historicos.sql
-- Corrige dados históricos: UUIDs de filial e preço do Heineken 269ml
-- Executar no Supabase SQL Editor
-- =============================================================

-- 1. Mapeamento de UUIDs das filiais
-- br-01 -> f3265a77-5946-5cd3-b09c-725ac4d26952
-- br-02 -> 32b31da2-00e8-570c-8a10-2d6ae23c9eee
-- br-03 -> 62a2b07b-4237-559a-a2cd-e0fc7dcbecdc

-- =============================================================
-- 2. CORRIGIR store_branch_id em SALES
-- =============================================================
UPDATE sales
SET store_branch_id = CASE store_branch_id::text
  WHEN 'br-01' THEN 'f3265a77-5946-5cd3-b09c-725ac4d26952'
  WHEN 'br-02' THEN '32b31da2-00e8-570c-8a10-2d6ae23c9eee'
  WHEN 'br-03' THEN '62a2b07b-4237-559a-a2cd-e0fc7dcbecdc'
  ELSE store_branch_id
END
WHERE store_branch_id::text IN ('br-01', 'br-02', 'br-03');

SELECT 'sales' AS tabela, COUNT(*) AS linhas_com_uuid_correto
FROM sales
WHERE store_branch_id::text IN ('f3265a77-5946-5cd3-b09c-725ac4d26952', '32b31da2-00e8-570c-8a10-2d6ae23c9eee', '62a2b07b-4237-559a-a2cd-e0fc7dcbecdc');

-- =============================================================
-- 3. CORRIGIR store_branch_id em cash_sessions
-- =============================================================
UPDATE cash_sessions
SET store_branch_id = CASE store_branch_id::text
  WHEN 'br-01' THEN 'f3265a77-5946-5cd3-b09c-725ac4d26952'
  WHEN 'br-02' THEN '32b31da2-00e8-570c-8a10-2d6ae23c9eee'
  WHEN 'br-03' THEN '62a2b07b-4237-559a-a2cd-e0fc7dcbecdc'
  ELSE store_branch_id
END
WHERE store_branch_id::text IN ('br-01', 'br-02', 'br-03');

SELECT 'cash_sessions' AS tabela, COUNT(*) AS linhas_com_uuid_correto
FROM cash_sessions
WHERE store_branch_id::text IN ('f3265a77-5946-5cd3-b09c-725ac4d26952', '32b31da2-00e8-570c-8a10-2d6ae23c9eee', '62a2b07b-4237-559a-a2cd-e0fc7dcbecdc');

-- =============================================================
-- 4. CORRIGIR store_branch_id em stock_movements
-- =============================================================
UPDATE stock_movements
SET store_branch_id = CASE store_branch_id::text
  WHEN 'br-01' THEN 'f3265a77-5946-5cd3-b09c-725ac4d26952'
  WHEN 'br-02' THEN '32b31da2-00e8-570c-8a10-2d6ae23c9eee'
  WHEN 'br-03' THEN '62a2b07b-4237-559a-a2cd-e0fc7dcbecdc'
  ELSE store_branch_id
END
WHERE store_branch_id::text IN ('br-01', 'br-02', 'br-03');

SELECT 'stock_movements' AS tabela, COUNT(*) AS linhas_com_uuid_correto
FROM stock_movements
WHERE store_branch_id::text IN ('f3265a77-5946-5cd3-b09c-725ac4d26952', '32b31da2-00e8-570c-8a10-2d6ae23c9eee', '62a2b07b-4237-559a-a2cd-e0fc7dcbecdc');

-- =============================================================
-- 5. CORRIGIR store_branch_id em financial_transactions
-- =============================================================
UPDATE financial_transactions
SET store_branch_id = CASE store_branch_id::text
  WHEN 'br-01' THEN 'f3265a77-5946-5cd3-b09c-725ac4d26952'
  WHEN 'br-02' THEN '32b31da2-00e8-570c-8a10-2d6ae23c9eee'
  WHEN 'br-03' THEN '62a2b07b-4237-559a-a2cd-e0fc7dcbecdc'
  ELSE store_branch_id
END
WHERE store_branch_id::text IN ('br-01', 'br-02', 'br-03');

SELECT 'financial_transactions' AS tabela, COUNT(*) AS linhas_com_uuid_correto
FROM financial_transactions
WHERE store_branch_id::text IN ('f3265a77-5946-5cd3-b09c-725ac4d26952', '32b31da2-00e8-570c-8a10-2d6ae23c9eee', '62a2b07b-4237-559a-a2cd-e0fc7dcbecdc');

-- =============================================================
-- 6. CORRIGIR store_branch_id em products
-- =============================================================
UPDATE products
SET store_branch_id = CASE store_branch_id::text
  WHEN 'br-01' THEN 'f3265a77-5946-5cd3-b09c-725ac4d26952'
  WHEN 'br-02' THEN '32b31da2-00e8-570c-8a10-2d6ae23c9eee'
  WHEN 'br-03' THEN '62a2b07b-4237-559a-a2cd-e0fc7dcbecdc'
  ELSE store_branch_id
END
WHERE store_branch_id::text IN ('br-01', 'br-02', 'br-03');

SELECT 'products' AS tabela, COUNT(*) AS linhas_com_uuid_correto
FROM products
WHERE store_branch_id::text IN ('f3265a77-5946-5cd3-b09c-725ac4d26952', '32b31da2-00e8-570c-8a10-2d6ae23c9eee', '62a2b07b-4237-559a-a2cd-e0fc7dcbecdc');

-- =============================================================
-- 7. VERIFICAR E CORRIGIR PREÇO DO HEINEKEN 269ml
-- =============================================================
SELECT id, name, COALESCE(sale_price, 0) AS sale_price, COALESCE(cost_price, 0) AS cost_price, barcode
FROM products
WHERE LOWER(name) LIKE '%heineken%';

-- Resultado atual (executado pelo usuário — 2026-07-30):
-- Heineken 269ml (eb6b4a69-...) está com sale_price = 5.00 — OK, não precisa de correção.
-- "cerveja heineken" (3198586d-..., barcode 123123) parece produto de teste — considerar remover.
