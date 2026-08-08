-- ==============================================================================
-- DELETAR REGISTROS ANTIGOS DE RECORRÊNCIAS (formato "X/Y")
-- Execute este SQL no Supabase SQL Editor para remover os 1000 registros antigos
-- ==============================================================================

-- 1. Verificar quantos registros serão deletados
SELECT count(*) as total_antigos
FROM financial_transactions
WHERE title ~ '\(\d+/\d+\)';

-- 2. Deletar registros antigos (formato "aluguel (X/Y)")
DELETE FROM financial_transactions
WHERE title ~ '\(\d+/\d+\)';

-- 3. Verificar se sobrou algum
SELECT count(*) as restante
FROM financial_transactions
WHERE title ~ '\(\d+/\d+\)';
