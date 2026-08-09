-- Verificar distribuição de datas das movimentacoes_falhas
SELECT 
  date_trunc('day', created_at) as dia,
  count(*) as total
FROM movimentacoes_falhas
GROUP BY date_trunc('day', created_at)
ORDER BY dia DESC
LIMIT 10;
