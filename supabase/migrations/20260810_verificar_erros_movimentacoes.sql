-- Verificar tipos de erro nas movimentacoes_falhas
SELECT 
  error_message,
  error_code,
  table_name,
  operation_type,
  count(*) as total
FROM movimentacoes_falhas
GROUP BY error_message, error_code, table_name, operation_type
ORDER BY total DESC
LIMIT 20;
