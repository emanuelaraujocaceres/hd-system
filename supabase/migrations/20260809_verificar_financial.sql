-- ==============================================================================
-- VERIFICAR REGISTROS EXISTENTES NO SUPABASE
-- Execute este SQL no Supabase SQL Editor para ver quais registros existem
-- ==============================================================================

-- Ver todos os registros da tabela financial_transactions
SELECT id, description, amount, created_at, store_branch_id
FROM financial_transactions
ORDER BY created_at DESC;
