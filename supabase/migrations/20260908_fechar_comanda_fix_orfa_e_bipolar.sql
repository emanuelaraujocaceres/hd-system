-- ═══════════════════════════════════════════════════════════════════════════
-- 20260908_fechar_comanda_fix_orfa_e_bipolar.sql
--
-- FIX 2026-09-08: fechar_comanda não fechava órfãs nem bipolares
-- Auditoria revelou:
--   • Venda "bipolar": table_id = mesa teste mas customer_session_id = sessão da Mesa 1
--     (reuso de sessão por deviceFingerprint sem escopo de mesa).
--   • Órfã: sale sem customer_session_id (criada antes do fluxo de sessão).
-- A versão anterior só fechava WHERE customer_session_id = p_session_id,
-- deixando essas vendas pendentes eternamente (halls fantasma, skol na Mesa 1).
--
-- Esta versão fecha TODAS as pendentes da MESA (table_id) da sessão, além das
-- vinculadas por customer_session_id, com mesmo org+filial. Resolve sem re-baixar
-- estoque (a baixa já ocorreu no addSale). Mantém idempotência/FOR UPDATE/tenant check.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fechar_comanda(
  p_session_id uuid,
  p_payments jsonb DEFAULT '[]'::jsonb,
  p_operator_name text DEFAULT 'Sistema'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session record;
  v_sale record;
  v_total numeric := 0;
  v_count integer := 0;
  v_first_method text;
  v_result jsonb;
BEGIN
  SELECT * INTO v_session
  FROM customer_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Comanda não encontrada.');
  END IF;

  IF NOT public.is_superadmin() THEN
    IF v_session.organization_id IS DISTINCT FROM public.get_user_org_id()
       OR v_session.store_branch_id IS DISTINCT FROM public.get_user_branch_id()
    THEN
      RETURN jsonb_build_object('success', false, 'message', 'Permissão negada: comanda de outra organização ou filial.');
    END IF;
  END IF;

  IF v_session.status = 'completed' THEN
    RETURN jsonb_build_object('success', true, 'already_closed', true, 'message', 'Comanda já estava fechada.');
  END IF;
  IF v_session.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Comanda está cancelada.');
  END IF;

  BEGIN
    v_first_method := p_payments->0->>'method';
  EXCEPTION WHEN OTHERS THEN
    v_first_method := NULL;
  END;

  -- Finaliza pendentes da SESSÃO + órfãs/bipolares da MESMA MESA (table_id)
  -- Mantém filtro org+branch para não fechar dado corrompido de outra filial.
  FOR v_sale IN
    SELECT id, total
    FROM sales
    WHERE status = 'pending'
      AND deleted_at IS NULL
      AND organization_id = v_session.organization_id
      AND store_branch_id = v_session.store_branch_id
      AND (
        customer_session_id = p_session_id
        OR (
          -- órfã ou bipolar: venda fisicamente na mesa da sessão
          table_id = v_session.table_id
          AND v_session.table_id IS NOT NULL
        )
      )
    FOR UPDATE
  LOOP
    UPDATE sales SET
      status = 'completed',
      payments_json = p_payments,
      payment_method = COALESCE(v_first_method, payment_method, 'cash'),
      operator_name = COALESCE(p_operator_name, operator_name),
      updated_at = now()
    WHERE id = v_sale.id;

    v_total := v_total + COALESCE(v_sale.total, 0);
    v_count := v_count + 1;
  END LOOP;

  UPDATE customer_sessions SET
    status = 'completed',
    closed_at = now(),
    updated_at = now()
  WHERE id = p_session_id;

  v_result := jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'total', v_total,
    'finalized_sales', v_count,
    'message', 'Comanda fechada com sucesso.'
  );
  RETURN v_result;
END;
$$;

-- Grants mantidos (authenticated + service_role, nunca anon)
REVOKE ALL ON FUNCTION public.fechar_comanda(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fechar_comanda(uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fechar_comanda(uuid, jsonb, text) TO service_role;

DO $$
BEGIN
  RAISE NOTICE 'OK: fechar_comanda v2 (órfã/bipolar) aplicada.';
  RAISE NOTICE 'GRANT anon: %', (SELECT has_function_privilege('anon', 'public.fechar_comanda(uuid, jsonb, text)', 'EXECUTE'));
END;
$$;
