-- ==============================================================================
-- DELETAR REGISTROS ANTIGOS DO SUPABASE
-- Execute este SQL no Supabase SQL Editor
-- ==============================================================================

-- 1. Verificar registros existentes
SELECT id, description, created_at, store_branch_id
FROM financial_transactions
ORDER BY created_at DESC;

-- 2. Deletar registros antigos (deixar apenas o mais recente)
-- SUBSTITUA 'ID_DO_REGISTRO_MAIS_RECENTE' pelo ID do registro que você quer manter
DELETE FROM financial_transactions
WHERE id != 'ID_DO_REGISTRO_MAIS_RECENTE';

-- OU deletar todos (se quiser começar do zero)
-- DELETE FROM financial_transactions;
