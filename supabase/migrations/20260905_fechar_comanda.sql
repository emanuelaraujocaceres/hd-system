-- ═══════════════════════════════════════════════════════════════════════════
-- 20260905_fechar_comanda.sql
--
-- FECHA UMA COMANDA (customer_sessions) DE FORMA IDEMPOTENTE E ATÔMICA.
--
-- CONTEXTO / ARQUITETURA (mapeamento verificado 2026-09-05):
--   • No HD-System NÃO existe tabela `comandas`. A comanda é a tabela
--     `customer_sessions` (sessão de cliente); os itens vivem em `sales` +
--     `sale_items`, agrupados por `customer_session_id`.
--   • O ESTOQUE já é deduzido atomicamente no momento em que o item é
--     adicionado — via RPC `process_sale_transaction` (chamada pelo frontend
--     em `addSale`), tanto no cardápio anon quanto no PDV. Cada "rodada" do
--     cardápio cria uma venda `status='pending'` cuja baixa já aconteceu.
--   • Portanto esta RPC é um FINALIZADOR: NÃO re-baixa estoque e NÃO insere
--     `stock_movements` (o trigger fn_log_stock_changes / process_sale_
--     transaction já registram). Re-baixar aqui duplicaria a baixa (Problema 4
--     do diagnóstico do Supabase) — PROIBIDO.
--   • "Mesa livre/ocupada" no frontend é determinada pela EXISTÊNCIA de uma
--     sessão `active` para a mesa, NÃO por `tables.status` (que só tem
--     `active`/`inactive` e significa "mesa existe/habilitada"). Fechar a
--     sessão é o que libera a mesa. NÃO mexer em `tables.status`.
--
-- GARANTIAS:
--   • Idempotente: sessão já `completed` retorna o estado atual sem re-fazer.
--   • Concorrência: `FOR UPDATE` na sessão e nas vendas pendentes (sem duplo
--     fechamento / dupla marcação).
--   • Isolamento multi-tenant: SECURITY DEFINER com validação de ORG + FILIAL
--     no corpo (regra 9 do AGENTS.md: get_user_org_id() + get_user_branch_id());
--     superadmin (is_superadmin()) bypass.
--   • Uso: chama-se APÓS o frontend ter baixado estoque via `addSale`
--     (híbrido: adota vendas pending já baixadas + novas vendas do operador).
--
-- RLS/GRANT: apenas authenticated + service_role (NAO anon — o fechamento é
-- operação do operador, não do cliente). Regra 9.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Função
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fechar_comanda(
  p_session_id uuid,
  p_payments jsonb DEFAULT '[]'::jsonb,          -- array [{method, amount, ...}]
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
  -- 1) Trava a sessão (impede fechamento concorrente)
  SELECT * INTO v_session
  FROM customer_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Comanda não encontrada.');
  END IF;

  -- 2) Isolamento multi-tenant (SECURITY DEFINER roda como owner; RLS não basta).
  --    Regra 9 do AGENTS.md: validação de ORG + FILIAL no corpo, com guard de
  --    superadmin. O frontend seta a filial ativa via set_current_branch a cada
  --    troca, então get_user_branch_id() reflete a filial que o operador está
  --    usando (collaborator = store_branch_id fixo; admin = branch da sessão).
  IF NOT public.is_superadmin() THEN
    IF v_session.organization_id IS DISTINCT FROM public.get_user_org_id()
       OR v_session.store_branch_id IS DISTINCT FROM public.get_user_branch_id()
    THEN
      RETURN jsonb_build_object(
        'success', false,
        'message', 'Permissão negada: comanda de outra organização ou filial.'
      );
    END IF;
  END IF;

  -- 3) Idempotência: já fechada → retorna estado atual (sem dupla finalização)
  IF v_session.status = 'completed' THEN
    RETURN jsonb_build_object(
      'success', true, 'already_closed', true,
      'message', 'Comanda já estava fechada.'
    );
  END IF;
  IF v_session.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Comanda está cancelada.');
  END IF;

  -- Método preferido do primeiro pagamento (para payment_method legado)
  BEGIN
    v_first_method := p_payments->0->>'method';
  EXCEPTION WHEN OTHERS THEN
    v_first_method := NULL;
  END;

  -- 4) Finaliza TODAS as vendas 'pending' da sessão (já baixaram estoque via
  --    addSale no frontend). Trava cada uma p/ evitar corrida. Escopo por
  --    org+branch da sessão (defesa extra contra dado corrompido).
  FOR v_sale IN
    SELECT id, total
    FROM sales
    WHERE customer_session_id = p_session_id
      AND status = 'pending'
      AND deleted_at IS NULL
      AND organization_id = v_session.organization_id
      AND store_branch_id = v_session.store_branch_id
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

  -- 5) Fecha a sessão → a mesa fica "livre" no frontend (ocupação = sessão ativa)
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

-- ───────────────────────────────────────────────────────────────────────────
-- 2. GRANTs (somente authenticated + service_role; NUNCA anon)
-- ───────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.fechar_comanda(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fechar_comanda(uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fechar_comanda(uuid, jsonb, text) TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Verificação (RAISE NOTICE)
-- ───────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fechar_comanda'
  ) THEN
    RAISE NOTICE 'OK: fechar_comanda presente.';
  ELSE
    RAISE WARNING 'ERRO: fechar_comanda ausente!';
  END IF;

  RAISE NOTICE 'GRANT anon: %',
    (SELECT has_function_privilege('anon', 'public.fechar_comanda(uuid, jsonb, text)', 'EXECUTE'));
  RAISE NOTICE 'GRANT authenticated: %',
    (SELECT has_function_privilege('authenticated', 'public.fechar_comanda(uuid, jsonb, text)', 'EXECUTE'));
END;
$$;
