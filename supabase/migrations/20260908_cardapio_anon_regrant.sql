-- ═══════════════════════════════════════════════════════════════════════════
-- 20260908_cardapio_anon_regrant.sql
--
-- REGRESSÃO (auditoria 2026-09-08): a migration 20260831_version_rpc_fracionados
-- fez REVOKE ALL + GRANT só authenticated/service_role na
-- process_sale_transaction(uuid, text, ...) — removendo o GRANT anon da
-- 20260815_cardapio_anon_rls. Desde então o QR público (#/mesa/) cai em
-- 401/42501 no upsert e na RPC, e o pedido fica preso no aparelho.
-- Este re-grant restaura a exceção anon 0f (cardápio sem login).
-- Idempotente: REVOKE só anon + GRANT de volta; authenticated/service_role intactos.
-- ═══════════════════════════════════════════════════════════════════════════

REVOKE ALL ON FUNCTION public.process_sale_transaction(uuid, text, integer, numeric, numeric, numeric, text, text, uuid, uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.process_sale_transaction(uuid, text, integer, numeric, numeric, numeric, text, text, uuid, uuid, jsonb) TO anon;

-- fn_insserir_dlq também é via anon no cardápio (log de falha sem login)
DO $$
DECLARE
  v_args text;
BEGIN
  SELECT pg_get_function_identity_arguments(oid) INTO v_args
  FROM pg_proc WHERE proname = 'fn_insserir_dlq' AND pronamespace = 'public'::regnamespace
  LIMIT 1;
  IF v_args IS NOT NULL THEN
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.fn_insserir_dlq(%s) TO anon', v_args);
    RAISE NOTICE 'OK: fn_insserir_dlq anon re-grant (%).', v_args;
  ELSE
    RAISE WARNING 'fn_insserir_dlq ausente — pular re-grant.';
  END IF;
END;
$$;

DO $$
BEGIN
  RAISE NOTICE 'GRANT anon process_sale_transaction: %',
    (SELECT has_function_privilege('anon', 'public.process_sale_transaction(uuid, text, integer, numeric, numeric, numeric, text, text, uuid, uuid, jsonb)', 'EXECUTE'));
END;
$$;
