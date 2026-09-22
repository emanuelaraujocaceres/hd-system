-- ==============================================================================
-- ADICIONAR COLUNAS DE RECORRÊNCIA NA TABELA FINANCIAL_TRANSACTIONS
-- Execute este SQL no Supabase SQL Editor
-- ==============================================================================

-- 1. Adicionar colunas de recorrência
ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS is_recurring boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_installment boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurrence_type text,
  ADD COLUMN IF NOT EXISTS recurrence_count integer,
  ADD COLUMN IF NOT EXISTS recurrences_json JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS installments_json JSONB DEFAULT '[]'::jsonb;

-- 2. Verificar se as colunas foram adicionadas
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'financial_transactions'
ORDER BY ordinal_position;
