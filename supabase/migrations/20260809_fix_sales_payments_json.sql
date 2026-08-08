-- ==============================================================================
-- 20260809_fix_sales_payments_json.sql
-- Adiciona coluna payments_json na tabela sales para armazenar array completo
-- de payments (cash + credit_account + etc). Necessário porque o campo
-- payment_method (text) só armazena um método, perdendo dados de vendas split.
-- ==============================================================================

-- 1. Adicionar coluna payments_json (JSONB) na tabela sales
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS payments_json JSONB DEFAULT '[]'::jsonb;

-- 2. Migrar dados existentes: converter payment_method + total para JSON
UPDATE public.sales
SET payments_json = jsonb_build_array(
  jsonb_build_object(
    'method', COALESCE(payment_method, 'cash'),
    'amount', COALESCE(total, 0)
  )
)
WHERE payments_json = '[]'::jsonb::jsonb
  AND payment_method IS NOT NULL;

-- 3. Adicionar coluna à publicação supabase_realtime
DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.sales';
  EXCEPTION WHEN OTHERS THEN
    -- Já está na publicação
  END;
END $$;

-- 4. Garantir REPLICA IDENTITY FULL para payload completo
ALTER TABLE public.sales REPLICA IDENTITY FULL;

-- 5. Verificação
SELECT id, code, total, payment_method, payments_json
FROM public.sales
WHERE payments_json IS NOT NULL
  AND jsonb_array_length(payments_json) > 1
LIMIT 10;
