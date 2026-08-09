-- ==============================================================================
-- LIMPAR DADOS ANTIGOS E DESNECESSÁRIOS
-- Execute cada bloco separadamente no Supabase SQL Editor
-- ==============================================================================

-- 1. Limpar movimentacoes_falhas com mais de 7 dias
DELETE FROM movimentacoes_falhas 
WHERE created_at < now() - interval '7 days';

-- 2. Verificar quantas movimentacoes_falhas restaram
SELECT count(*) as restantes FROM movimentacoes_falhas;

-- 3. Limpar sync_queue antigo (mais de 30 dias)
DELETE FROM sync_queue 
WHERE created_at < now() - interval '30 days';

-- 4. Verificar sync_queue
SELECT count(*) as restantes FROM sync_queue;

-- 5. Limpar customer_sessions antigas (mais de 30 dias)
DELETE FROM customer_sessions 
WHERE created_at < now() - interval '30 days';

-- 6. Verificar customer_sessions
SELECT count(*) as restantes FROM customer_sessions;

-- 7. Limpar sessions antigas (mais de 30 dias)
DELETE FROM sessions 
WHERE created_at < now() - interval '30 days';

-- 8. Verificar sessions
SELECT count(*) as restantes FROM sessions;
