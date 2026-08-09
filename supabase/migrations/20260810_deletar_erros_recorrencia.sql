-- ==============================================================================
-- DELETAR ERROS DE RECORRÊNCIA COM UUID INVÁLIDO
-- ==============================================================================

-- 1. Deletar erros de recurrence_parent_id inválido (verificando pelo payload)
DELETE FROM movimentacoes_falhas
WHERE error_message LIKE '%uuid%';

-- 2. Verificar se restaram erros
SELECT count(*) as restantes FROM movimentacoes_falhas;
