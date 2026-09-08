-- ═══════════════════════════════════════════════════════════════════════════
-- 20260908_sales_kitchen_status_closing_request.sql
--
-- O fluxo de "Solicitar fechamento" (cardápio → operador) marca as vendas com
-- kitchen_status='closing_request' (RPC solicitar_fechamento_comanda, KDS,
-- banner OrderAlertBanner, badge SOLICITOU CONTA). Mas o CHECK vivo no banco
-- só aceitava pending/preparing/ready/delivered/cancelled → o fechamento caía
-- em 23514 e nunca chegava ao operador.
-- Idempotente: drop + recria o CHECK incluindo 'closing_request'. Sem tocar dados.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_kitchen_status_check;
ALTER TABLE public.sales
  ADD CONSTRAINT sales_kitchen_status_check
  CHECK (kitchen_status = ANY (ARRAY['pending'::text, 'preparing'::text, 'ready'::text, 'delivered'::text, 'cancelled'::text, 'closing_request'::text]));

DO $$
BEGIN
  RAISE NOTICE 'OK: sales_kitchen_status_check com closing_request.';
END;
$$;
