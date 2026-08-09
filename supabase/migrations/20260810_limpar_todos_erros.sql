-- ==============================================================================
-- DELETAR TODOS OS ERROS ANTIGOS DE MOVIMENTACOES
-- ==============================================================================

-- Deletar todos os erros (são histórico antigo)
DELETE FROM movimentacoes_falhas;

-- Verificar se foi limpo
SELECT count(*) as restantes FROM movimentacoes_falhas;
