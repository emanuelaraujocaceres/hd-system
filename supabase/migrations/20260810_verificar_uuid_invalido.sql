-- Verificar se há registros recentes com UUID inválido
SELECT 
  created_at,
  payload->>'id' as sale_id,
  error_message
FROM movimentacoes_falhas
WHERE error_message LIKE '%uuid%'
  AND created_at > now() - interval '1 hour'
ORDER BY created_at DESC
LIMIT 10;
