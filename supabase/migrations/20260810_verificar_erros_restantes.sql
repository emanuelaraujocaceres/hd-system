-- Verificar os erros restantes
SELECT 
  error_message,
  count(*) as total
FROM movimentacoes_falhas
GROUP BY error_message
ORDER BY total DESC
LIMIT 10;
