-- ═══════════════════════════════════════════════════════════════════
-- URGENTE: Fix stock_change_log RLS + ajustar_estoque + trigger
-- Execute no Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- 1. DESABILITAR RLS no stock_change_log (é tabela de auditoria, não precisa de isolamento)
ALTER TABLE stock_change_log DISABLE ROW LEVEL SECURITY;

-- 2. Recriar ajustar_estoque com store_branch_id
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
  SELECT * INTO v_product FROM products WHERE id = p_product_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Produto não encontrado');
  END IF;

  v_current_stock := v_product.stock_quantity;

  IF p_type = 'in' THEN
    v_new_stock := v_current_stock + ABS(p_quantity);
    v_final_type := 'in';
  ELSIF p_type = 'out' THEN
    v_new_stock := GREATEST(0, v_current_stock - ABS(p_quantity));
    v_final_type := 'out';
  ELSE
    RETURN json_build_object('success', false, 'error', 'Tipo inválido: ' || p_type);
  END IF;

  UPDATE products SET stock_quantity = v_new_stock, updated_at = NOW() WHERE id = p_product_id;

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

  RETURN json_build_object('success', true, 'new_stock', v_new_stock, 'previous_stock', v_current_stock);
END;
$$;

-- 3. Fix trigger: incluir store_branch_id no INSERT de stock_movements
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
