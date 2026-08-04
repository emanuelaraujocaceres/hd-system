-- ==============================================================================
-- 20260808: CORRIGE RPC process_sale_transaction — INSERT de stock_movements
-- sem store_branch_id
-- ==============================================================================
-- PROBLEMA (confirmado pelo console do PDV após o fix do 22P02):
--   [HD-Sync] process_sale_transaction RPC failed: Tentativa de salvar
--   stock_movements sem store_branch_id!
--
--   A função (assinatura de 11 params usada pelo frontend em
--   storageService.addSale) insere em stock_movements SEM a coluna
--   store_branch_id. Como stock_movements é uma das tabelas com validação
--   obrigatória (fn_validate_store_branch_id), a trigger rejeita o INSERT.
--   A venda ainda sincroniza pela rota de upsert por tabela (fallback), mas o
--   RPC (dedução atômica de estoque) sempre falha e gera ruído na DLQ.
--
-- CORREÇÃO: adicionar store_branch_id ao INSERT de stock_movements,
-- usando o parâmetro p_store_branch_id que o frontend já envia.
-- ==============================================================================

-- 0. Dropar TODAS as sobrecargas antigas (evita ambiguidade com versões TEXT)
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

-- 1. Função corrigida (SECURITY DEFINER, igual à versão do frontend)
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
  v_product_id UUID;
  v_quantity INTEGER;
  v_unit_price NUMERIC(12,2);
BEGIN
  -- Processa cada item da venda
  FOR v_item IN
    SELECT
      (item->>'product_id')::UUID AS product_id,
      (item->>'quantity')::INTEGER AS quantity,
      (item->>'unit_price')::NUMERIC AS unit_price
    FROM jsonb_array_elements(p_sale_items) AS item
  LOOP
    -- Verifica estoque
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

    -- Deduz estoque
    v_new_stock := v_current_stock - v_item.quantity;
    UPDATE products SET stock_quantity = v_new_stock, updated_at = NOW()
    WHERE id = v_item.product_id;

    -- Registra movimentação (com store_branch_id — exigido pela trigger)
    INSERT INTO stock_movements (id, organization_id, store_branch_id, product_id, product_name, type, quantity, previous_stock, new_stock, reason, operator_name)
    VALUES (
      gen_random_uuid(), p_organization_id, p_store_branch_id, v_item.product_id,
      (SELECT name FROM products WHERE id = v_item.product_id),
      'out', v_item.quantity, v_current_stock, v_new_stock,
      p_reason, p_operator_name
    );
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
--   → o INSERT de stock_movements deve conter "store_branch_id"
--
-- Teste direto:
-- SELECT * FROM process_sale_transaction(
--   p_sale_id => '00000000-0000-0000-0000-000000000000'::UUID,
--   p_organization_id => '361fb95a-3e9f-43be-a43c-0dc91f851f31'::UUID,
--   p_store_branch_id => 'e5085eba-4398-4c31-ae13-8082b46561ee'::UUID,
--   p_quantity => 1, p_unit_price => 1.00, p_total => 1.00,
--   p_sale_items => '[{"product_id":"e15a9f80-2e15-4557-8dad-cc2884ab1d05","quantity":1,"unit_price":5.5}]'::jsonb
-- );
