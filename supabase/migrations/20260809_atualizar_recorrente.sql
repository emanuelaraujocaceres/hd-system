-- ==============================================================================
-- ATUALIZAR REGISTRO DE RECORRÊNCIA NO SUPABASE
-- Execute este SQL no Supabase SQL Editor
-- ==============================================================================

-- Atualizar o registro mais recente de "aluguel" com dados de recorrência
UPDATE public.financial_transactions
SET
  is_recurring = true,
  is_installment = false,
  recurrence_type = 'monthly',
  recurrence_count = 1000,
  recurrences_json = '[]'::jsonb  -- Será preenchido pelo sync do app
WHERE id = '547bb019-ffdf-4bc4-b775-bfbd0266b98d';

-- Verificar se foi atualizado
SELECT id, description, is_recurring, recurrence_count, recurrences_json
FROM public.financial_transactions
WHERE id = '547bb019-ffdf-4bc4-b775-bfbd0266b98d';
