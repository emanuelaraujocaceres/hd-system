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
  WHEN 'br-01' THEN 'f3265a77-5946-5cd3-b09c-725ac4d26952'::uuid
  WHEN 'br-02' THEN '32b31da2-00e8-570c-8a10-2d6ae23c9eee'::uuid
  WHEN 'br-03' THEN '62a2b07b-4237-559a-a2cd-e0fc7dcbecdc'::uuid
  ELSE store_branch_id
END
WHERE store_branch_id::text IN ('br-01', 'br-02', 'br-03');

SELECT 'sales' AS tabela, COUNT(*) AS linhas_com_uuid_correto
FROM sales
WHERE store_branch_id IN ('f3265a77-5946-5cd3-b09c-725ac4d26952'::uuid, '32b31da2-00e8-570c-8a10-2d6ae23c9eee'::uuid, '62a2b07b-4237-559a-a2cd-e0fc7dcbecdc'::uuid);

-- =============================================================
-- 3. CORRIGIR store_branch_id em cash_sessions
-- =============================================================
UPDATE cash_sessions
SET store_branch_id = CASE store_branch_id::text
  WHEN 'br-01' THEN 'f3265a77-5946-5cd3-b09c-725ac4d26952'::uuid
  WHEN 'br-02' THEN '32b31da2-00e8-570c-8a10-2d6ae23c9eee'::uuid
  WHEN 'br-03' THEN '62a2b07b-4237-559a-a2cd-e0fc7dcbecdc'::uuid
  ELSE store_branch_id
END
WHERE store_branch_id::text IN ('br-01', 'br-02', 'br-03');

SELECT 'cash_sessions' AS tabela, COUNT(*) AS linhas_com_uuid_correto
FROM cash_sessions
WHERE store_branch_id IN ('f3265a77-5946-5cd3-b09c-725ac4d26952'::uuid, '32b31da2-00e8-570c-8a10-2d6ae23c9eee'::uuid, '62a2b07b-4237-559a-a2cd-e0fc7dcbecdc'::uuid);

-- =============================================================
-- 4. CORRIGIR store_branch_id em stock_movements
-- =============================================================
UPDATE stock_movements
SET store_branch_id = CASE store_branch_id::text
  WHEN 'br-01' THEN 'f3265a77-5946-5cd3-b09c-725ac4d26952'::uuid
  WHEN 'br-02' THEN '32b31da2-00e8-570c-8a10-2d6ae23c9eee'::uuid
  WHEN 'br-03' THEN '62a2b07b-4237-559a-a2cd-e0fc7dcbecdc'::uuid
  ELSE store_branch_id
END
WHERE store_branch_id::text IN ('br-01', 'br-02', 'br-03');

SELECT 'stock_movements' AS tabela, COUNT(*) AS linhas_com_uuid_correto
FROM stock_movements
WHERE store_branch_id IN ('f3265a77-5946-5cd3-b09c-725ac4d26952'::uuid, '32b31da2-00e8-570c-8a10-2d6ae23c9eee'::uuid, '62a2b07b-4237-559a-a2cd-e0fc7dcbecdc'::uuid);

-- =============================================================
-- 5. CORRIGIR store_branch_id em financial_transactions
-- =============================================================
UPDATE financial_transactions
SET store_branch_id = CASE store_branch_id::text
  WHEN 'br-01' THEN 'f3265a77-5946-5cd3-b09c-725ac4d26952'::uuid
  WHEN 'br-02' THEN '32b31da2-00e8-570c-8a10-2d6ae23c9eee'::uuid
  WHEN 'br-03' THEN '62a2b07b-4237-559a-a2cd-e0fc7dcbecdc'::uuid
  ELSE store_branch_id
END
WHERE store_branch_id::text IN ('br-01', 'br-02', 'br-03');

SELECT 'financial_transactions' AS tabela, COUNT(*) AS linhas_com_uuid_correto
FROM financial_transactions
WHERE store_branch_id IN ('f3265a77-5946-5cd3-b09c-725ac4d26952'::uuid, '32b31da2-00e8-570c-8a10-2d6ae23c9eee'::uuid, '62a2b07b-4237-559a-a2cd-e0fc7dcbecdc'::uuid);

-- =============================================================
-- 6. CORRIGIR store_branch_id em products
-- =============================================================
UPDATE products
SET store_branch_id = CASE store_branch_id::text
  WHEN 'br-01' THEN 'f3265a77-5946-5cd3-b09c-725ac4d26952'::uuid
  WHEN 'br-02' THEN '32b31da2-00e8-570c-8a10-2d6ae23c9eee'::uuid
  WHEN 'br-03' THEN '62a2b07b-4237-559a-a2cd-e0fc7dcbecdc'::uuid
  ELSE store_branch_id
END
WHERE store_branch_id::text IN ('br-01', 'br-02', 'br-03');

SELECT 'products' AS tabela, COUNT(*) AS linhas_com_uuid_correto
FROM products
WHERE store_branch_id IN ('f3265a77-5946-5cd3-b09c-725ac4d26952'::uuid, '32b31da2-00e8-570c-8a10-2d6ae23c9eee'::uuid, '62a2b07b-4237-559a-a2cd-e0fc7dcbecdc'::uuid);

-- =============================================================
-- 7. VERIFICAR E CORRIGIR PREÇO DO HEINEKEN 269ml
-- =============================================================
SELECT id, name, COALESCE(salePrice, 0) AS salePrice, COALESCE(costPrice, 0) AS costPrice, barcode
FROM products
WHERE LOWER(name) LIKE '%heineken%';

-- Se Heineken 269ml estiver com salePrice = 0, atualizar:
-- ATENÇÃO: substitua 'UUID_AQUI' pelo id correto do produto após consultar acima
-- UPDATE products SET salePrice = 7.50 WHERE id = 'UUID_AQUI';
