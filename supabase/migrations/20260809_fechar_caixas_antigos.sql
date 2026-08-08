-- ==============================================================================
-- FECHAR CAIXAS ANTIGOS (testes anteriores)
-- Execute este SQL no Supabase SQL Editor para fechar caixas abertos de testes
-- ==============================================================================

-- Fechar TODOS os caixas abertos (use com cuidado — apenas em ambiente de teste)
UPDATE cash_sessions
SET status = 'closed', closed_at = now()
WHERE status = 'open';

-- Verificar caixas fechados
SELECT id, status, opening_balance, expected_balance, store_branch_id, opened_at, closed_at
FROM cash_sessions
ORDER BY opened_at DESC
LIMIT 10;
