-- ============================================================
-- 20260906_sales_order_source_check
-- FIX de drift em produção (2026-09-06):
--  A constraint `sales_order_source_check` (SÓ no banco vivo, não existia
--  em migration) permitia apenas ('pdv','cardapio_digital','fiado') — faltavam
--  'delivery' e 'comanda'. Resultado: 1216 vendas de comanda + vendas de
--  delivery presas na DLQ movimentacoes_falhas com
--  "violates check constraint sales_order_source_check".
--
--  Também restaura grants anon das RPCs de escrita do cardápio
--  (exceção documentada 0f do AGENTS.md): process_sale_transaction e
--  fn_insserir_dlq MANTÊM anon; cancel_sale_atomic NUNCA (regra 9).
--
-- Idempotente + fail-closed: se a constraint atual permitir um valor FORA
-- dos canônicos, RAISE EXCEPTION aborta sem alterar nada.
-- ============================================================

-- Constraint com os 5 valores canônicos do frontend
-- (pdv, cardapio_digital, delivery, comanda, fiado-legado)
DO $$
DECLARE
  v_def      text;
  v_tokens   text[];
  v_tok      text;
  v_unknown  text := NULL;
  v_allowed  constant text[] := ARRAY['pdv','cardapio_digital','delivery','comanda','fiado'];
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
  FROM pg_constraint
  WHERE conrelid = 'public.sales'::regclass
    AND conname = 'sales_order_source_check';

  RAISE NOTICE 'Definicao atual: %', COALESCE(v_def, '(constraint nao existe — sera criada)');

  IF v_def IS NOT NULL THEN
    SELECT array_agg(m[1]) INTO v_tokens
    FROM (SELECT regexp_matches(v_def, '''([^'']+)''', 'g') AS m) t;

    FOREACH v_tok IN ARRAY v_tokens LOOP
      IF NOT (v_tok = ANY (v_allowed)) THEN
        v_unknown := v_tok;
        EXIT;
      END IF;
    END LOOP;

    IF v_unknown IS NOT NULL THEN
      RAISE EXCEPTION 'ABORTADO: constraint permite valor inesperado "%" — nada foi alterado.', v_unknown;
    END IF;
  END IF;

  ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_order_source_check;
  ALTER TABLE public.sales ADD CONSTRAINT sales_order_source_check
    CHECK (order_source IN ('pdv','cardapio_digital','delivery','comanda','fiado'));
  RAISE NOTICE 'OK: constraint recriada com pdv, cardapio_digital, delivery, comanda, fiado.';
END $$;

-- Grants das RPCs (assinatura exata evita erro 42725 de overload)
-- process_sale_transaction: anon é EXCEÇÃO DOCUMENTADA (0f — cardápio/delivery anon)
REVOKE ALL ON FUNCTION public.process_sale_transaction(uuid, text, integer, numeric, numeric, numeric, text, text, uuid, uuid, jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.process_sale_transaction(uuid, text, integer, numeric, numeric, numeric, text, text, uuid, uuid, jsonb) TO anon, authenticated, service_role;

-- fn_insserir_dlq: anon é EXCEÇÃO DOCUMENTADA (0f — cardápio precisa logar DLQ sem sessão)
REVOKE ALL ON FUNCTION public.fn_insserir_dlq(text, text, text, jsonb, text, text, integer, text, text, text, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_insserir_dlq(text, text, text, jsonb, text, text, integer, text, text, text, text, text) TO anon, authenticated, service_role;

-- cancel_sale_atomic: NUNCA anon (regra 9 — remoção de item da comanda é fluxo do operador)
REVOKE ALL ON FUNCTION public.cancel_sale_atomic(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.cancel_sale_atomic(uuid) TO authenticated, service_role;