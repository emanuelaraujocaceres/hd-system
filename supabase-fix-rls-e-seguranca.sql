-- ================================================================
-- CORREÇÃO COMPLETA: RLS + SECURITY DEFINER + TRIGGERS
-- ================================================================
-- Problemas diagnosticados:
-- 1. stock_change_log só tem política SELECT → sem INSERT/UPDATE/DELETE,
--    qualquer tentativa de escrita é bloqueada (RLS padrão nega tudo)
-- 2. fn_insserir_dlq NÃO insere organization_id → RLS policy de INSERT
--    compara DEFAULT ('00000000-...') com get_auth_user_org_id() → 403
-- 3. ajustar_estoque e process_sale_transaction são SECURITY INVOKER →
--    executam como usuário e RLS se aplica a UPDATE/INSERT internos
-- 4. movimentacoes_falhas sem política DELETE
-- 5. Possível trigger trg_log_stock_changes recriado pela migração
-- ================================================================

-- ================================================================
-- 1. GARANTIR QUE TRIGGER DE LOG ESTOQUE NÃO EXISTE
-- ================================================================
-- A migração 20260729 recriou este trigger. Já o removemos antes,
-- mas garantir que continua removido.
DROP TRIGGER IF EXISTS trg_log_stock_changes ON products;
DROP FUNCTION IF EXISTS fn_log_stock_changes;

-- ================================================================
-- 2. POLÍTICAS FALTANTES: stock_change_log
-- ================================================================
-- Antes: só SELECT. Adicionar INSERT, UPDATE, DELETE.
CREATE POLICY "RLS_stock_change_log_insert" ON stock_change_log
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM products WHERE products.id = stock_change_log.product_id AND products.organization_id = get_auth_user_org_id())
  );

CREATE POLICY "RLS_stock_change_log_update" ON stock_change_log
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM products WHERE products.id = stock_change_log.product_id AND products.organization_id = get_auth_user_org_id())
  );

CREATE POLICY "RLS_stock_change_log_delete" ON stock_change_log
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM products WHERE products.id = stock_change_log.product_id AND products.organization_id = get_auth_user_org_id())
  );

-- ================================================================
-- 3. POLÍTICA DELETE: movimentacoes_falhas
-- ================================================================
-- Antes: SELECT + INSERT. Falta DELETE para gestão da DLQ.
CREATE POLICY "RLS_movimentacoes_falhas_delete" ON movimentacoes_falhas
  FOR DELETE USING (organization_id = get_auth_user_org_id());

-- ================================================================
-- 4. RECRIAR fn_insserir_dlq COMO SECURITY DEFINER
-- ================================================================
-- A DLQ precisa funcionar mesmo quando há erros de permissão.
-- SECURITY DEFINER → executa como dono (postgres), ignora RLS.
-- Também explicitamos organization_id via get_auth_user_org_id().
DROP FUNCTION IF EXISTS fn_insserir_dlq;

CREATE OR REPLACE FUNCTION fn_insserir_dlq(
  p_operation_type TEXT,
  p_table_name TEXT,
  p_record_id TEXT DEFAULT NULL,
  p_payload JSONB DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL,
  p_error_code TEXT DEFAULT NULL,
  p_error_status INTEGER DEFAULT NULL,
  p_stack_trace TEXT DEFAULT NULL,
  p_source TEXT DEFAULT 'sync_queue',
  p_browser_id TEXT DEFAULT NULL,
  p_user_email TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
  v_org_id UUID;
BEGIN
  v_id := gen_random_uuid();
  v_org_id := COALESCE(get_auth_user_org_id(), '00000000-0000-0000-0000-000000000001');

  INSERT INTO movimentacoes_falhas (
    id, organization_id, operation_type, table_name, record_id, payload,
    error_message, error_code, error_status, stack_trace,
    source, browser_id, user_email, next_retry_at
  ) VALUES (
    v_id, v_org_id, p_operation_type, p_table_name, p_record_id, p_payload,
    p_error_message, p_error_code, p_error_status, p_stack_trace,
    p_source, p_browser_id, p_user_email, NOW() + INTERVAL '1 minute'
  );
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_insserir_dlq TO authenticated;

-- ================================================================
-- 5. RECRIAR ajustar_estoque COMO SECURITY DEFINER
-- ================================================================
-- Necessário para que UPDATE products e INSERT stock_movements
-- não sejam bloqueados por RLS quando executados via RPC.
DROP FUNCTION IF EXISTS ajustar_estoque;

CREATE OR REPLACE FUNCTION ajustar_estoque(
  p_product_id UUID,
  p_quantity INTEGER,
  p_type TEXT DEFAULT 'in',
  p_reason TEXT DEFAULT 'Ajuste manual',
  p_operator_name TEXT DEFAULT 'Sistema',
  p_organization_id UUID DEFAULT '00000000-0000-0000-0000-000000000001'
)
RETURNS TABLE(success BOOLEAN, message TEXT, previous_stock INTEGER, new_stock INTEGER)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_current_stock INTEGER;
  v_new_stock INTEGER;
  v_product_name TEXT;
  v_final_type TEXT;
BEGIN
  SELECT stock_quantity, name INTO v_current_stock, v_product_name
  FROM products WHERE id = p_product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'Produto nao encontrado: ' || p_product_id::text, 0, 0;
    RETURN;
  END IF;

  v_final_type := LOWER(p_type);
  IF v_final_type NOT IN ('in', 'out', 'adjustment', 'loss') THEN v_final_type := 'in'; END IF;

  v_new_stock := CASE
    WHEN v_final_type = 'in' THEN v_current_stock + ABS(p_quantity)
    WHEN v_final_type IN ('out', 'loss') THEN GREATEST(0, v_current_stock - ABS(p_quantity))
    WHEN v_final_type = 'adjustment' THEN p_quantity
    ELSE v_current_stock
  END;

  UPDATE products SET stock_quantity = v_new_stock, updated_at = NOW() WHERE id = p_product_id;

  INSERT INTO stock_movements (id, organization_id, product_id, product_name, type, quantity, previous_stock, new_stock, reason, operator_name)
  VALUES (gen_random_uuid(), p_organization_id, p_product_id, v_product_name, v_final_type, ABS(p_quantity), v_current_stock, v_new_stock, p_reason, p_operator_name);

  RETURN QUERY SELECT TRUE, 'Estoque ajustado: ' || v_current_stock || ' -> ' || v_new_stock, v_current_stock, v_new_stock;
END;
$$;

GRANT EXECUTE ON FUNCTION ajustar_estoque TO authenticated;

-- ================================================================
-- 6. RECRIAR process_sale_transaction COMO SECURITY DEFINER
-- ================================================================
-- Primeiro dropar TODAS as sobrecargas existentes
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

    -- Registra movimentação
    INSERT INTO stock_movements (id, organization_id, product_id, product_name, type, quantity, previous_stock, new_stock, reason, operator_name)
    VALUES (
      gen_random_uuid(), p_organization_id, v_item.product_id,
      (SELECT name FROM products WHERE id = v_item.product_id),
      'out', v_item.quantity, v_current_stock, v_new_stock,
      p_reason, p_operator_name
    );
  END LOOP;

  RETURN QUERY SELECT TRUE, 'Venda processada com sucesso';
END;
$$;

GRANT EXECUTE ON FUNCTION process_sale_transaction TO authenticated;

-- ================================================================
-- 7. GARANTIR PERMISSÕES EM TODAS AS FUNÇÕES
-- ================================================================
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- ================================================================
-- 8. DIAGNÓSTICO FINAL
-- ================================================================
SELECT 'stock_change_log policies' AS item, COUNT(*)::text AS value FROM pg_policies WHERE tablename = 'stock_change_log'
UNION ALL
SELECT 'movimentacoes_falhas policies', COUNT(*)::text FROM pg_policies WHERE tablename = 'movimentacoes_falhas'
UNION ALL
SELECT 'trg_log_stock_changes exists',
  CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_log_stock_changes') THEN 'YES (!!!)' ELSE 'removed' END
UNION ALL
SELECT 'Fn fn_insserir_dlq secdef',
  (SELECT CASE WHEN prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END FROM pg_proc WHERE proname = 'fn_insserir_dlq')
UNION ALL
SELECT 'Fn ajustar_estoque secdef',
  (SELECT CASE WHEN prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END FROM pg_proc WHERE proname = 'ajustar_estoque')
UNION ALL
SELECT 'Fn process_sale_transaction secdef',
  (SELECT CASE WHEN prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END FROM pg_proc WHERE proname = 'process_sale_transaction');

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'CORREÇÃO RLS + SECURITY DEFINER CONCLUÍDA';
  RAISE NOTICE '1. stock_change_log: INSERT/UPDATE/DELETE policies adicionadas';
  RAISE NOTICE '2. movimentacoes_falhas: DELETE policy adicionada';
  RAISE NOTICE '3. fn_insserir_dlq: SECURITY DEFINER + organization_id explícito';
  RAISE NOTICE '4. ajustar_estoque: SECURITY DEFINER';
  RAISE NOTICE '5. process_sale_transaction: SECURITY DEFINER';
  RAISE NOTICE '6. trg_log_stock_changes: removido (garantia)';
  RAISE NOTICE '========================================';
END $$;
