-- ==============================================================================
-- 20260902_fix_sales_delivery_payment_columns.sql
-- Colunas novas enviadas pelo frontend no syncSale (payment_details em 28d2f75
-- e delivery_order_id em e484952) NUNCA foram criadas na tabela sales do banco.
-- Resultado: o upsert de TODA venda falhava com PGRST204
-- ("Could not find the 'delivery_order_id' column of 'sales' in the schema
--  cache"), deixando vendas presas no dispositivo onde foram criadas — nunca
-- chegavam ao cloud nem aos outros dispositivos via Realtime/hidratação.
-- ==============================================================================

-- 0. Backup prévio das colunas que serão alteradas (rollback / auditoria)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema = 'public' AND table_name = 'sales_columns_backup_20260902') THEN
    CREATE TABLE public.sales_columns_backup_20260902 AS
    SELECT id, payment_details, delivery_order_id
    FROM public.sales;
  END IF;
END $$;

-- 1. Coluna payment_details (JSONB) — espelho de payments_json para relatórios
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS payment_details JSONB;

-- 2. Coluna delivery_order_id (UUID) — vínculo da venda nativa com o pedido de
--    entrega finalizado (DELIVERY_FLOW nativo). FK opcional para delivery_orders.
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS delivery_order_id UUID REFERENCES public.delivery_orders(id);

-- 3. Índice para lookups por delivery_order_id (vendas vinculadas a pedidos)
CREATE INDEX IF NOT EXISTS idx_sales_delivery_order_id
  ON public.sales(delivery_order_id)
  WHERE delivery_order_id IS NOT NULL;

-- 4. Como a tabela já está na publicação supabase_realtime (criada em
--    20260809_fix_sales_payments_json.sql), apenas garantimos REPLICA IDENTITY
--    FULL para payload completo de UPDATE/DELETE.
ALTER TABLE public.sales REPLICA IDENTITY FULL;

-- 5. Verificação das colunas criadas
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'sales'
  AND column_name IN ('payment_details', 'delivery_order_id')
ORDER BY column_name;
