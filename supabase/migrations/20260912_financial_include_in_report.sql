-- ==============================================================================
-- INCLUIR FLAG DE CONTABILIZAÇÃO NO RELATÓRIO EM FINANCIAL_TRANSACTIONS
-- Execute este SQL no Supabase SQL Editor
-- Contexto: baixa de conta avulsa (Receber/Pagar) com checkbox "Contabilizar
-- no relatório". A flag viaja no sync e alimenta a seção Contas do Relatório
-- Gerencial. DEFAULT true = conta quitada entra no relatório, salvo opt-out
-- explícito no checkout.
-- Idempotente: pode rodar mais de uma vez.
-- ==============================================================================

-- 1. Adicionar coluna (a coluna payment_method já existe — ver schema)
ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS include_in_report boolean DEFAULT true;

-- 2. Backfill: contas já quitadas contam (comportamento padrão)
UPDATE public.financial_transactions
SET include_in_report = true
WHERE include_in_report IS NULL;

-- 3. Verificar
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'financial_transactions'
  AND column_name IN ('include_in_report', 'payment_method')
ORDER BY ordinal_position;
