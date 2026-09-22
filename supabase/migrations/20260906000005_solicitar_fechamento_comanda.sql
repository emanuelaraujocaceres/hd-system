-- ═══════════════════════════════════════════════════════════════════════════
-- 20260906_solicitar_fechamento_comanda.sql
--
-- P0-3 (auditoria 2026-09-06): "Pedir a conta" do cardápio anon caia na DLQ
-- com 42501 (RLS). Causa: o cliente SOLICITA o fechamento atualizando a venda
-- via upsert (`saveSale` → `syncService.upsertRow`), mas NÃO existe policy de
-- UPDATE anon em `sales` (`sales_update_anon` ausente) — INSERT anon existe
-- (exceção 0f), UPDATE não. O UPSERT faz `INSERT ... ON CONFLICT DO UPDATE`,
-- então a via de UPDATE é negada → nenhuma atualização de fechamento chegava.
--
-- SOLUÇÃO ESCOLHIDA: RPC `solicitar_fechamento_comanda` (SECURITY DEFINER) com
-- GRANT EXECUTE anon. NÃO criar policy `sales_update_anon` permissiva (regra 0b
-- proíbe USING(true) em produção): uma policy permissiva deixaria o anon
-- UPDATEAR QUALQUER venda de qualquer org (marcar completed, apagar payments…).
-- A RPC valida posse via `session_token` da `customer_sessions` ATIVA + escopo
-- org/filial no corpo (regra 9), e só permite o conjunto mínimo de mutações:
-- status='pending', kitchen_status='closing_request', payments_json/payment_
-- method com a FORMA solicitada (whitelist) e total REAL da venda (s.total,
-- nunca o amount enviado pelo cliente).
--
-- EXCEÇÃO ANON DOCUMENTADA (estende 0f/0e): o cardápio digital/delivery roda
-- SEM sessão autenticada no celular do cliente (chave anon), idem
-- `process_sale_transaction` e `fn_insserir_dlq`. Ao endurecer RPCs, NUNCA
-- revogar anon desta função — senão "Pedir a conta" volta a quebrar.
--
-- NÃO re-baixa estoque, NÃO fecha sessão, NÃO mexe em cash_sessions: é apenas o
-- SINALIZADOR de pedido de fechamento; o operador finaliza via `fechar_comanda`
-- (que é o FINALIZADOR idempotente) no PDV/Comandas.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Função
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.solicitar_fechamento_comanda(
  p_sale_ids uuid[],
  p_session_token text,
  p_payment_method text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owned integer;
  v_total numeric := 0;
  v_updated integer := 0;
  v_sale record;
BEGIN
  -- 1) Argumentos obrigatórios (fail-closed)
  IF p_sale_ids IS NULL OR array_length(p_sale_ids, 1) IS NULL OR array_length(p_sale_ids, 1) = 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Nenhuma venda informada.');
  END IF;
  IF p_session_token IS NULL OR btrim(p_session_token) = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Token de sessão inválido.');
  END IF;
  IF p_payment_method IS NULL OR p_payment_method NOT IN ('cash', 'pix', 'credit_card', 'debit_card') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Forma de pagamento inválida.');
  END IF;

  -- 2) Posse: TODAS as vendas devem pertencer à MESMA sessão ATIVA com o token
  --    informado (o cliente anon não tem auth.uid() — o token é a âncora de
  --    identidade). Escopo org+branch da sessão vs venda por defesa em camadas
  --    (impede casamento cruzado de org/filial). Se QUALQUER venda não for
  --    vinculada, a operação inteira falha (sem atualização parcial/probe).
  SELECT count(*) INTO v_owned
  FROM public.sales s
  JOIN public.customer_sessions cs ON cs.id = s.customer_session_id
  WHERE s.id = ANY(p_sale_ids)
    AND s.deleted_at IS NULL
    AND cs.session_token = p_session_token
    AND cs.status = 'active'
    AND cs.organization_id = s.organization_id
    AND cs.store_branch_id = s.store_branch_id;

  IF v_owned <> array_length(p_sale_ids, 1) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Alguma venda não pertence à sessão ativa informada.'
    );
  END IF;

  -- 3) Marca cada venda como pedido de fechamento. NÃO toca estoque /
  --    stock_movements / cash_sessions (a baixa já ocorreu no addSale via
  --    process_sale_transaction; o fechamento final é do operador via
  --    fechar_comanda). Amount derivado do total REAL da venda (s.total), não
  --    do payload do cliente.
  FOR v_sale IN
    SELECT s.id, s.total
    FROM public.sales s
    JOIN public.customer_sessions cs ON cs.id = s.customer_session_id
    WHERE s.id = ANY(p_sale_ids)
      AND s.deleted_at IS NULL
      AND cs.session_token = p_session_token
      AND cs.status = 'active'
    FOR UPDATE OF s
  LOOP
    UPDATE public.sales SET
      status = 'pending',
      kitchen_status = 'closing_request',
      payments_json = jsonb_build_array(
        jsonb_build_object('method', p_payment_method, 'amount', COALESCE(v_sale.total, 0))
      ),
      payment_method = p_payment_method,
      updated_at = now()
    WHERE id = v_sale.id;

    v_total := v_total + COALESCE(v_sale.total, 0);
    v_updated := v_updated + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'updated_sales', v_updated,
    'total', v_total,
    'message', 'Pedido de fechamento enviado.'
  );
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. GRANTs (exceção anon documentada no cabeçalho; idem process_sale_transaction)
-- ───────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.solicitar_fechamento_comanda(uuid[], text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.solicitar_fechamento_comanda(uuid[], text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.solicitar_fechamento_comanda(uuid[], text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.solicitar_fechamento_comanda(uuid[], text, text) TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Verificação (RAISE NOTICE)
-- ───────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'solicitar_fechamento_comanda'
  ) THEN
    RAISE NOTICE 'OK: solicitar_fechamento_comanda presente.';
  ELSE
    RAISE WARNING 'ERRO: solicitar_fechamento_comanda ausente!';
  END IF;

  RAISE NOTICE 'GRANT anon: %',
    (SELECT has_function_privilege('anon', 'public.solicitar_fechamento_comanda(uuid[], text, text)', 'EXECUTE'));
  RAISE NOTICE 'GRANT authenticated: %',
    (SELECT has_function_privilege('authenticated', 'public.solicitar_fechamento_comanda(uuid[], text, text)', 'EXECUTE'));
END;
$$;