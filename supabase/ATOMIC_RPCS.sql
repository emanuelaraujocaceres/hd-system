-- ══════════════════════════════════════════════════════════════════════
-- ATOMIC RPCs — Server-Side Transactions
-- Prevents race conditions in critical operations
-- ══════════════════════════════════════════════════════════════════════

-- 1. close_cash_session: Atomically close a cash session + update totals
-- Prevents: double-close, stale balance, missing sale totals
CREATE OR REPLACE FUNCTION public.close_cash_session(
  p_session_id UUID,
  p_final_balance NUMERIC,
  p_notes TEXT DEFAULT ''
)
RETURNS JSONB AS $$
DECLARE
  v_session RECORD;
  v_result JSONB;
BEGIN
  -- Lock the session row (SELECT ... FOR UPDATE)
  SELECT * INTO v_session
  FROM public.cash_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  -- Validate
  IF v_session IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sessão não encontrada.');
  END IF;

  IF v_session.status = 'closed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sessão já foi fechada.');
  END IF;

  -- Close atomically
  UPDATE public.cash_sessions
  SET
    status = 'closed',
    closed_at = now(),
    current_cash_balance = p_final_balance,
    notes = CASE WHEN p_notes != '' THEN p_notes ELSE notes END,
    updated_at = now()
  WHERE id = p_session_id;

  -- Return the closed session
  SELECT to_jsonb(cs.*) INTO v_result
  FROM public.cash_sessions cs
  WHERE cs.id = p_session_id;

  RETURN jsonb_build_object('success', true, 'session', v_result);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. process_sale_atomic: Create sale + update stock + update cash session
-- Prevents: partial sale creation, stock desync, double-counting
CREATE OR REPLACE FUNCTION public.process_sale_atomic(
  p_sale_data JSONB,
  p_items JSONB,
  p_payments JSONB,
  p_session_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_sale_id UUID;
  v_item JSONB;
  v_product RECORD;
  v_new_stock NUMERIC;
BEGIN
  -- Generate sale ID
  v_sale_id := gen_random_uuid();

  -- Insert sale
  INSERT INTO public.sales (
    id, organization_id, store_branch_id, code, date,
    operator_id, operator_name, customer_id, customer_name,
    items, subtotal, discount, total, payments, status
  ) VALUES (
    v_sale_id,
    (p_sale_data->>'organization_id')::UUID,
    (p_sale_data->>'store_branch_id')::UUID,
    p_sale_data->>'code',
    COALESCE((p_sale_data->>'date')::TIMESTAMPTZ, now()),
    (p_sale_data->>'operator_id')::UUID,
    p_sale_data->>'operator_name',
    NULLIF(p_sale_data->>'customer_id', '')::UUID,
    p_sale_data->>'customer_name',
    p_items,
    (p_sale_data->>'subtotal')::NUMERIC,
    COALESCE((p_sale_data->>'discount')::NUMERIC, 0),
    (p_sale_data->>'total')::NUMERIC,
    p_payments,
    'completed'
  );

  -- Update stock for each item (with FOR UPDATE lock)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    -- Lock product row
    SELECT * INTO v_product
    FROM public.products
    WHERE id = (v_item->>'product_id')::UUID
    FOR UPDATE;

    IF v_product IS NOT NULL THEN
      v_new_stock := v_product.stock_quantity - (v_item->>'quantity')::NUMERIC;

      -- Prevent negative stock
      IF v_new_stock < 0 THEN
        RAISE EXCEPTION 'Estoque insuficiente para %: disponível %, solicitado %',
          v_product.name, v_product.stock_quantity, (v_item->>'quantity')::NUMERIC;
      END IF;

      UPDATE public.products
      SET stock_quantity = v_new_stock, updated_at = now()
      WHERE id = v_product.id;

      -- Record stock movement
      INSERT INTO public.stock_movements (
        organization_id, store_branch_id, product_id, product_name,
        type, quantity, previous_stock, new_stock, reason, operator_name
      ) VALUES (
        v_product.organization_id, v_product.store_branch_id,
        v_product.id, v_product.name,
        'out', (v_item->>'quantity')::NUMERIC,
        v_product.stock_quantity, v_new_stock,
        'Venda #' || (p_sale_data->>'code'),
        p_sale_data->>'operator_name'
      );
    END IF;
  END LOOP;

  -- Update cash session totals if provided
  IF p_session_id IS NOT NULL THEN
    UPDATE public.cash_sessions
    SET
      total_sales_cash = total_sales_cash + COALESCE(
        (SELECT sum((p->>'amount')::NUMERIC)
         FROM jsonb_array_elements(p_payments) p
         WHERE p->>'method' = 'cash'), 0),
      total_sales_pix = total_sales_pix + COALESCE(
        (SELECT sum((p->>'amount')::NUMERIC)
         FROM jsonb_array_elements(p_payments) p
         WHERE p->>'method' = 'pix'), 0),
      total_sales_card = total_sales_card + COALESCE(
        (SELECT sum((p->>'amount')::NUMERIC)
         FROM jsonb_array_elements(p_payments) p
         WHERE p->>'method' IN ('credit_card', 'debit_card')), 0),
      total_sales_credit_account = total_sales_credit_account + COALESCE(
        (SELECT sum((p->>'amount')::NUMERIC)
         FROM jsonb_array_elements(p_payments) p
         WHERE p->>'method' = 'credit_account'), 0),
      updated_at = now()
    WHERE id = p_session_id AND status = 'open';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'sale_id', v_sale_id,
    'message', 'Venda processada com sucesso.'
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. transfer_table_session: Move a customer session to another table
-- Prevents: double-booking, orphaned sessions
CREATE OR REPLACE FUNCTION public.transfer_table_session(
  p_session_id UUID,
  p_new_table_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_session RECORD;
  v_new_table RECORD;
BEGIN
  -- Lock both tables
  SELECT * INTO v_session
  FROM public.customer_sessions
  WHERE id = p_session_id AND status = 'active'
  FOR UPDATE;

  IF v_session IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sessão ativa não encontrada.');
  END IF;

  -- Check new table availability
  SELECT * INTO v_new_table
  FROM public.tables
  WHERE id = p_new_table_id
  FOR UPDATE;

  IF v_new_table IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Mesa destino não encontrada.');
  END IF;

  -- Check if new table has an active session
  IF EXISTS (
    SELECT 1 FROM public.customer_sessions
    WHERE table_id = p_new_table_id AND status = 'active'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Mesa destino já possui sessão ativa.');
  END IF;

  -- Move session
  UPDATE public.customer_sessions
  SET table_id = p_new_table_id, updated_at = now()
  WHERE id = p_session_id;

  -- Update old table status
  UPDATE public.tables
  SET status = 'available', updated_at = now()
  WHERE id = v_session.table_id;

  -- Update new table status
  UPDATE public.tables
  SET status = 'occupied', updated_at = now()
  WHERE id = p_new_table_id;

  RETURN jsonb_build_object('success', true, 'message', 'Sessão transferida com sucesso.');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. cancel_sale_atomic: Cancel sale + restore stock + update cash session
-- Prevents: partial cancellation, stock inconsistency
CREATE OR REPLACE FUNCTION public.cancel_sale_atomic(
  p_sale_id UUID,
  p_session_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_sale RECORD;
  v_item JSONB;
  v_product RECORD;
BEGIN
  -- Lock sale
  SELECT * INTO v_sale
  FROM public.sales
  WHERE id = p_sale_id
  FOR UPDATE;

  IF v_sale IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Venda não encontrada.');
  END IF;

  IF v_sale.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Venda já foi cancelada.');
  END IF;

  -- Restore stock for each item
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_sale.items)
  LOOP
    SELECT * INTO v_product
    FROM public.products
    WHERE id = (v_item->>'product_id')::UUID
    FOR UPDATE;

    IF v_product IS NOT NULL THEN
      UPDATE public.products
      SET stock_quantity = stock_quantity + (v_item->>'quantity')::NUMERIC,
          updated_at = now()
      WHERE id = v_product.id;

      INSERT INTO public.stock_movements (
        organization_id, store_branch_id, product_id, product_name,
        type, quantity, previous_stock, new_stock, reason, operator_name
      ) VALUES (
        v_product.organization_id, v_product.store_branch_id,
        v_product.id, v_product.name,
        'in', (v_item->>'quantity')::NUMERIC,
        v_product.stock_quantity,
        v_product.stock_quantity + (v_item->>'quantity')::NUMERIC,
        'Cancelamento venda #' || v_sale.code,
        v_sale.operator_name
      );
    END IF;
  END LOOP;

  -- Cancel sale
  UPDATE public.sales
  SET status = 'cancelled', updated_at = now()
  WHERE id = p_sale_id;

  -- Reverse cash session totals if provided
  IF p_session_id IS NOT NULL THEN
    UPDATE public.cash_sessions
    SET
      total_sales_cash = total_sales_cash - COALESCE(
        (SELECT sum((p->>'amount')::NUMERIC)
         FROM jsonb_array_elements(v_sale.payments) p
         WHERE p->>'method' = 'cash'), 0),
      total_sales_pix = total_sales_pix - COALESCE(
        (SELECT sum((p->>'amount')::NUMERIC)
         FROM jsonb_array_elements(v_sale.payments) p
         WHERE p->>'method' = 'pix'), 0),
      total_sales_card = total_sales_card - COALESCE(
        (SELECT sum((p->>'amount')::NUMERIC)
         FROM jsonb_array_elements(v_sale.payments) p
         WHERE p->>'method' IN ('credit_card', 'debit_card')), 0),
      total_sales_credit_account = total_sales_credit_account - COALESCE(
        (SELECT sum((p->>'amount')::NUMERIC)
         FROM jsonb_array_elements(v_sale.payments) p
         WHERE p->>'method' = 'credit_account'), 0),
      updated_at = now()
    WHERE id = p_session_id AND status = 'open';
  END IF;

  RETURN jsonb_build_object('success', true, 'message', 'Venda cancelada e estoque restaurado.');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 5. create_customer_session: Create session + mark table occupied (atomic)
CREATE OR REPLACE FUNCTION public.create_customer_session(
  p_table_id UUID,
  p_customer_name TEXT,
  p_organization_id UUID,
  p_store_branch_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_session_id UUID;
BEGIN
  -- Lock table
  PERFORM 1 FROM public.tables
  WHERE id = p_table_id AND organization_id = p_organization_id
  FOR UPDATE;

  -- Check table exists and is available
  IF NOT EXISTS (
    SELECT 1 FROM public.tables
    WHERE id = p_table_id AND organization_id = p_organization_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Mesa não encontrada.');
  END IF;

  -- Check no active session on this table
  IF EXISTS (
    SELECT 1 FROM public.customer_sessions
    WHERE table_id = p_table_id AND status = 'active'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Mesa já possui sessão ativa.');
  END IF;

  -- Create session
  v_session_id := gen_random_uuid();
  INSERT INTO public.customer_sessions (
    id, organization_id, store_branch_id, table_id,
    customer_name, status, started_at
  ) VALUES (
    v_session_id, p_organization_id, p_store_branch_id, p_table_id,
    p_customer_name, 'active', now()
  );

  -- Mark table as occupied
  UPDATE public.tables
  SET status = 'occupied', updated_at = now()
  WHERE id = p_table_id;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', v_session_id,
    'message', 'Sessão criada com sucesso.'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
