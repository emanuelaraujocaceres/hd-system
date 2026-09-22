-- ═══════════════════════════════════════════════════════════════════════════
-- 20260906_excluir_mesa.sql
--
-- Guard de exclusão de mesa/comanda (auditoria 2026-09-06, seção C).
--
-- PROBLEMA: `sales.table_id` e `customer_sessions.table_id` são FK -> tables.id
-- com regra NO ACTION. O frontend (deleteTable) removia a mesa localmente e
-- mandava `DELETE FROM tables` — com QUALQUER referência (inclusive vendas
-- soft-deleted/tombstone, que continuam físicas no banco), o DELETE falhava
-- 23503 e a operação ia para a DLQ `movimentacoes_falhas` ou era dropada em
-- silêncio; a mesa "ressuscitava" na hidratação seguinte (merge safeCloud).
--
-- SOLUÇÃO: RPC `excluir_mesa(p_table_id uuid)` SECURITY DEFINER que, numa
-- transação: (1) valida org+filial (regra 9), (2) BLOQUEIA mesa ocupada
-- (sessão `active` — o operador fecha a comanda primeiro via `fechar_comanda`),
-- (3) desvincula table_id de TODAS as linhas de sales/customer_sessions da mesa
-- (qualquer status, inclusive tombstones — NULL em FK NO ACTION é permitido,
-- histórico preservado), (4) DELETE físico da mesa. Idempotente.
--
-- FRONTEND correspondente: `storageService.deleteTable` agora usa o guard
-- local (sessão ativa / venda pendente → throw com mensagem amigável) e, online,
-- chama esta RPC em vez de `syncService.deleteRow` (sem enfileirar — nunca
-- polui a DLQ). Offline mantém o comportamento legado (remove local + fila).
--
-- GRANTS: somente authenticated + service_role (ação OPERACIONAL do operador/
-- admin — NUNCA anon; regra 9). Sem policy UPDATE permissiva em sales (0b).
--
-- APLICAÇÃO: rodar no SQL Editor do Supabase. Idempotente (CREATE OR REPLACE).
-- ROLLBACK: DROP FUNCTION public.excluir_mesa(uuid);
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Função
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.excluir_mesa(p_table_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table public.tables%ROWTYPE;
  v_org uuid;
  v_branch uuid;
  v_sales_detached integer := 0;
  v_sessions_detached integer := 0;
  v_nome text;
BEGIN
  -- 1) Localiza a mesa (org/filial/nome vêm da própria linha)
  SELECT * INTO v_table FROM public.tables WHERE id = p_table_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Mesa não encontrada.');
  END IF;

  v_org := v_table.organization_id;
  v_branch := v_table.store_branch_id;
  v_nome := v_table.name;

  -- 2) Isolamento multi-tenant (regra 9): SECURITY DEFINER roda como owner;
  --    RLS não basta. service_role/superadmin bypass; demais validam org e,
  --    para colaborador, a filial da mesa.
  IF current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
     OR public.is_superadmin() THEN
    NULL; -- trusted (servidor / superadmin)
  ELSE
    IF public.get_user_org_id() IS NULL
       OR v_org IS DISTINCT FROM public.get_user_org_id() THEN
      RETURN jsonb_build_object(
        'success', false,
        'message', 'Permissão negada: mesa de outra organização.'
      );
    END IF;
    -- Colaborador de filial: só exclui mesa da PRÓPRIA filial
    IF public.get_user_role() = 'collaborator'
       AND v_branch IS DISTINCT FROM public.get_user_branch_id() THEN
      RETURN jsonb_build_object(
        'success', false,
        'message', 'Permissão negada: colaborador só exclui mesa da própria filial.'
      );
    END IF;
  END IF;

  -- 3) Guard: mesa OCUPADA (sessão ativa) → BLOQUEIA. O operador fecha a
  --    comanda (fechar_comanda) antes de excluir a mesa. Escopo org+branch.
  IF EXISTS (
    SELECT 1 FROM public.customer_sessions
    WHERE table_id = p_table_id AND status = 'active'
      AND organization_id = v_org AND store_branch_id = v_branch
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'MESA_OCUPADA: Feche a comanda ativa da mesa "' || COALESCE(v_nome, '') || '" antes de excluí-la.'
    );
  END IF;

  -- 4) Desvincula TODAS as referências históricas (qualquer status, inclusive
  --    tombstones com deleted_at) — NULL em FK NO ACTION é permitido; o
  --    histórico de vendas/sessões permanece intacto (mesmo estado de domínio
  --    do delivery: table_id NULL).
  UPDATE public.sales
  SET table_id = NULL, updated_at = now()
  WHERE table_id = p_table_id
    AND organization_id = v_org
    AND store_branch_id = v_branch;
  GET DIAGNOSTICS v_sales_detached = ROW_COUNT;

  UPDATE public.customer_sessions
  SET table_id = NULL, updated_at = now()
  WHERE table_id = p_table_id
    AND organization_id = v_org
    AND store_branch_id = v_branch;
  GET DIAGNOSTICS v_sessions_detached = ROW_COUNT;

  -- 5) DELETE físico (agora seguro: nenhuma FK referencia a mesa)
  DELETE FROM public.tables WHERE id = p_table_id;

  RETURN jsonb_build_object(
    'success', true,
    'table_id', p_table_id,
    'detached_sales', v_sales_detached,
    'detached_sessions', v_sessions_detached,
    'message', 'Mesa excluída com sucesso; referências históricas preservadas.'
  );
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. GRANTs (somente authenticated + service_role — regra 9; NUNCA anon)
-- ───────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.excluir_mesa(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.excluir_mesa(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.excluir_mesa(uuid) TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Verificação (RAISE NOTICE)
-- ───────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  RAISE NOTICE 'GRANT anon (deve ser false): %',
    (SELECT has_function_privilege('anon', 'public.excluir_mesa(uuid)', 'EXECUTE'));
  RAISE NOTICE 'GRANT authenticated (deve ser true): %',
    (SELECT has_function_privilege('authenticated', 'public.excluir_mesa(uuid)', 'EXECUTE'));
  RAISE NOTICE 'GRANT service_role (deve ser true): %',
    (SELECT has_function_privilege('service_role', 'public.excluir_mesa(uuid)', 'EXECUTE'));
END;
$$;