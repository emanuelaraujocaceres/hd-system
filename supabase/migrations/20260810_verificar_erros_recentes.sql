-- Verificar os 2 erros recentes em detalhes
SELECT 
  id,
  created_at,
  table_name,
  operation_type,
  error_message,
  error_code,
  payload,
  retry_count,
  status
FROM movimentacoes_falhas
ORDER BY created_at DESC
LIMIT 5;
