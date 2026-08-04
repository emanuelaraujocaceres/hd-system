-- ==============================================================================
-- 20260809: REMOVE INSERT de stock_movements do RPC process_sale_transaction
-- (movimentação duplicada)
-- ==============================================================================
-- PROBLEMA (confirmado pelo console do PDV com RPC já funcionando):
--   Cada venda gerava DUAS linhas em stock_movements:
--     1. a movimentação local do frontend (deductStockLocal → syncStockMovement,
--        com store_branch_id), enfileirada e enviada via upsert;
--     2. a movimentação do RPC (INSERT com gen_random_uuid()).
--   Log: Remote INSERT on stock_movements: 2179a29f... E 3a1c8883...
--
-- CORREÇÃO: o RPC passa a fazer apenas a verificação atômica de estoque e a
-- dedução (UPDATE products). A linha de movimentação é de responsabilidade
-- única do frontend (syncStockMovement), que já envia store_branch_id — a
-- coluna exigida pela trigger de validação.
-- ==============================================================================

-- 0. Dropar TODAS as sobrecargas antigas
DO $$ DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'process_sale_transaction'
  ) LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.signature || ' CASCADE';
  END LOOP;
END $$;

-- 1. Função corrigida (SEM INSERT em stock_movements)
CREATE OR REPLACE FUNCTION process_sale_transaction(
  p_sale_id UUID,
  p_product_id TEXT DEFAULT NULL,
  p_quantity INTEGER DEFAULT 0,
  p_unit_price NUMERIC(12,2) DEFAULT 0,
  p_discount NUMERIC(12,2) DEFAULT 0,
  p_total NUMERIC(12,2) DEFAULT 0,
  p_reason TEXT DEFAULT 'Venda PDV',
  p_operator_name TEXT DEFAULT 'Sistema',
  p_organization_id UUID DEFAULT '00000000-0000-0000-0000-000000000001',
  p_store_branch_id UUID DEFAULT NULL,
  p_sale_items JSONB DEFAULT '[]'::JSONB
)
RETURNS TABLE(success BOOLEAN, message TEXT)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_item RECORD;
  v_current_stock INTEGER;
  v_new_stock INTEGER;
BEGIN
  -- Processa cada item da venda
  FOR v_item IN
    SELECT
      (item->>'product_id')::UUID AS product_id,
      (item->>'quantity')::INTEGER AS quantity
    FROM jsonb_array_elements(p_sale_items) AS item
  LOOP
    -- Verifica estoque (bloqueio de linha: evita venda duplicada concorrente)
    SELECT stock_quantity INTO v_current_stock
    FROM products WHERE id = v_item.product_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN QUERY SELECT FALSE, 'Produto nao encontrado: ' || v_item.product_id::text;
      RETURN;
    END IF;

    IF v_current_stock < v_item.quantity THEN
      RETURN QUERY SELECT FALSE, 'Estoque insuficiente para o produto';
      RETURN;
    END IF;

    -- Deduz estoque atomicamente
    v_new_stock := v_current_stock - v_item.quantity;
    UPDATE products SET stock_quantity = v_new_stock, updated_at = NOW()
    WHERE id = v_item.product_id;

    -- NOTA: a linha em stock_movements é criada pelo frontend
    -- (syncStockMovement, com store_branch_id). Não inserir aqui — senão
    -- cada venda gera movimentação duplicada.
  END LOOP;

  RETURN QUERY SELECT TRUE, 'Venda processada com sucesso';
END;
$$;

GRANT EXECUTE ON FUNCTION process_sale_transaction TO authenticated;
GRANT EXECUTE ON FUNCTION process_sale_transaction TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. VERIFICAÇÃO
-- ═══════════════════════════════════════════════════════════════════════════
-- SELECT prosrc FROM pg_proc WHERE proname = 'process_sale_transaction';
--   → NÃO deve conter "INSERT INTO stock_movements"
--
-- Teste: uma venda no PDV deve gerar UMA movimentação por item:
-- SELECT count(*) FROM stock_movements WHERE reason LIKE 'Venda PDV #%'
--   AND created_at > NOW() - INTERVAL '1 hour';
