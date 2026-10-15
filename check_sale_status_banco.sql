-- ============================================================
-- BLOCO: Verificar status da venda no banco (sem alterar nada)
-- Para confirmar se fechar_comanda marcou completed ou se ainda está pending
-- ============================================================
SELECT s.id, s.status, s.store_branch_id, s.customer_session_id, s.order_source, s.code,
  cs.status AS sessao_status, cs.table_id
FROM sales s
LEFT JOIN customer_sessions cs ON cs.id = s.customer_session_id
WHERE s.id IN (
  SELECT id FROM sales WHERE customer_session_id IS NOT NULL AND status IN ('pending','completed','cancelled') ORDER BY created_at DESC LIMIT 5
)
ORDER BY s.created_at DESC;
