-- ==============================================================================
-- LIMPAR MOVIMENTACOES FALHAS ANTIGAS
-- Remove registros com mais de 30 dias para não poluir o banco
-- ==============================================================================

-- 1. Verificar quantos registros serão deletados
SELECT 
  count(*) as total_antigos,
  min(created_at) as mais_antigo,
  max(created_at) as mais_recente
FROM movimentacoes_falhas
WHERE created_at < now() - interval '30 days';

-- 2. Deletar registros antigos (execute após confirmar o count acima)
DELETE FROM movimentacoes_falhas
WHERE created_at < now() - interval '30 days';

-- 3. Verificar quantos restaram
SELECT count(*) as restantes FROM movimentacoes_falhas;
