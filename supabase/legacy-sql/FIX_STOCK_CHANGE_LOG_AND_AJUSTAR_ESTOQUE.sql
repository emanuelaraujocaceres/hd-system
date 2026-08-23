-- FIX: stock_change_log RLS + ajustar_estoque RPC missing store_branch_id
-- Data: 2026-08-17
-- Problema 1: stock_change_log não tem org/branch columns → RLS bloqueia INSERT de usuários normais
-- Problema 2: ajustar_estoque não tem p_store_branch_id → trigger fn_validate_store_branch_id rejeita

-- ═══════════════════════════════════════════════════════════════════
-- 1. FIX stock_change_log: adicionar colunas + policies
-- ═══════════════════════════════════════════════════════════════════

-- 1a. Adicionar colunas de isolamento (se não existirem)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stock_change_log' AND column_name='organization_id') THEN
    ALTER TABLE stock_change_log ADD COLUMN organization_id UUID REFERENCES organizations(id);
    RAISE NOTICE 'Added organization_id to stock_change_log';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stock_change_log' AND column_name='store_branch_id') THEN
    ALTER TABLE stock_change_log ADD COLUMN store_branch_id UUID REFERENCES store_branches(id);
    RAISE NOTICE 'Added store_branch_id to stock_change_log';
  END IF;
END $$;

-- 1b. Drop existing policies (superadmin only)
DROP POLICY IF EXISTS "superadmin_all_stock_change_log" ON stock_change_log;
DROP POLICY IF EXISTS "user_insert_stock_change_log" ON stock_change_log;
DROP POLICY IF EXISTS "user_select_stock_change_log" ON stock_change_log;
DROP POLICY IF EXISTS "user_update_stock_change_log" ON stock_change_log;
DROP POLICY IF EXISTS "user_delete_stock_change_log" ON stock_change_log;

-- 1c. Superadmin full access
CREATE POLICY "superadmin_all_stock_change_log" ON stock_change_log
  FOR ALL USING (is_superadmin());

-- 1d. User policies with org + branch isolation
CREATE POLICY "user_insert_stock_change_log" ON stock_change_log
  FOR INSERT WITH CHECK (
    organization_id = get_user_org_id()
    AND store_branch_id = get_user_branch_id()
  );

CREATE POLICY "user_select_stock_change_log" ON stock_change_log
  FOR SELECT USING (
    organization_id = get_user_org_id()
    AND store_branch_id = get_user_branch_id()
  );

CREATE POLICY "user_update_stock_change_log" ON stock_change_log
  FOR UPDATE USING (
    organization_id = get_user_org_id()
    AND store_branch_id = get_user_branch_id()
  );

CREATE POLICY "user_delete_stock_change_log" ON stock_change_log
  FOR DELETE USING (
    organization_id = get_user_org_id()
    AND store_branch_id = get_user_branch_id()
  );


-- ═══════════════════════════════════════════════════════════════════
-- 2. FIX ajustar_estoque: adicionar p_store_branch_id
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION ajustar_estoque(
  p_product_id UUID,
  p_quantity INTEGER,
  p_type TEXT DEFAULT 'in',
  p_reason TEXT DEFAULT 'Ajuste manual',
  p_operator_name TEXT DEFAULT 'Sistema',
  p_organization_id UUID DEFAULT '00000000-0000-0000-0000-000000000001',
  p_store_branch_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_product RECORD;
  v_current_stock INTEGER;
  v_new_stock INTEGER;
  v_final_type TEXT;
BEGIN
  -- Buscar produto
  SELECT * INTO v_product FROM products WHERE id = p_product_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Produto não encontrado');
  END IF;

  v_current_stock := v_product.stock_quantity;

  -- Calcular novo estoque
  IF p_type = 'in' THEN
    v_new_stock := v_current_stock + ABS(p_quantity);
    v_final_type := 'in';
  ELSIF p_type = 'out' THEN
    v_new_stock := GREATEST(0, v_current_stock - ABS(p_quantity));
    v_final_type := 'out';
  ELSE
    RETURN json_build_object('success', false, 'error', 'Tipo inválido: ' || p_type);
  END IF;

  -- Atualizar estoque do produto
  UPDATE products SET stock_quantity = v_new_stock, updated_at = NOW() WHERE id = p_product_id;

  -- Registrar movimentação (COM store_branch_id)
  INSERT INTO stock_movements (
    id, organization_id, store_branch_id, product_id, product_name,
    type, quantity, previous_stock, new_stock,
    reason, operator_name, created_at
  ) VALUES (
    gen_random_uuid(),
    COALESCE(p_organization_id, v_product.organization_id),
    COALESCE(p_store_branch_id, v_product.store_branch_id),
    p_product_id,
    v_product.name,
    v_final_type,
    ABS(p_quantity),
    v_current_stock,
    v_new_stock,
    p_reason,
    p_operator_name,
    NOW()
  );

  RETURN json_build_object(
    'success', true,
    'new_stock', v_new_stock,
    'previous_stock', v_current_stock
  );
END;
$$;


-- ═══════════════════════════════════════════════════════════════════
-- 3. FIX fn_log_stock_changes: incluir store_branch_id no INSERT
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION fn_log_stock_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.stock_quantity IS DISTINCT FROM NEW.stock_quantity THEN
    INSERT INTO stock_movements (
      id, organization_id, store_branch_id, product_id, product_name,
      type, quantity, previous_stock, new_stock,
      reason, operator_name, created_at
    ) VALUES (
      gen_random_uuid(),
      NEW.organization_id,
      NEW.store_branch_id,
      NEW.id,
      NEW.name,
      CASE WHEN NEW.stock_quantity > OLD.stock_quantity THEN 'in' ELSE 'out' END,
      ABS(NEW.stock_quantity - OLD.stock_quantity),
      OLD.stock_quantity,
      NEW.stock_quantity,
      'Ajuste automático (trigger)',
      'system',
      NOW()
    );
  END IF;
  RETURN NEW;
END;
$$;

