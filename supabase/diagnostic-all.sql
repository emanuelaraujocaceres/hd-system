-- ==============================================================================
-- HD-SYSTEM: Dashboard Completo de Diagnóstico
-- Cole este script inteiro no SQL Editor do Supabase e execute (Ctrl+Enter)
-- ==============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. RESUMO GERAL — contagem de linhas por tabela
-- ═══════════════════════════════════════════════════════════════════════════
SELECT 'organizations' AS tabela, COUNT(*) AS linhas FROM public.organizations
UNION ALL SELECT 'profiles', COUNT(*) FROM public.profiles
UNION ALL SELECT 'company_settings', COUNT(*) FROM public.company_settings
UNION ALL SELECT 'categories', COUNT(*) FROM public.categories
UNION ALL SELECT 'products', COUNT(*) FROM public.products
UNION ALL SELECT 'customers', COUNT(*) FROM public.customers
UNION ALL SELECT 'suppliers', COUNT(*) FROM public.suppliers
UNION ALL SELECT 'sales', COUNT(*) FROM public.sales
UNION ALL SELECT 'sale_items', COUNT(*) FROM public.sale_items
UNION ALL SELECT 'financial_transactions', COUNT(*) FROM public.financial_transactions
UNION ALL SELECT 'cash_sessions', COUNT(*) FROM public.cash_sessions
UNION ALL SELECT 'stock_movements', COUNT(*) FROM public.stock_movements
UNION ALL SELECT 'store_branches', COUNT(*) FROM public.store_branches
UNION ALL SELECT 'system_users', COUNT(*) FROM public.system_users
UNION ALL SELECT 'system_settings', COUNT(*) FROM public.system_settings
UNION ALL SELECT 'ai_insights', COUNT(*) FROM public.ai_insights
UNION ALL SELECT 'movimentacoes_falhas', COUNT(*) FROM public.movimentacoes_falhas
UNION ALL SELECT 'stock_change_log', COUNT(*) FROM public.stock_change_log
UNION ALL SELECT 'sync_queue', COUNT(*) FROM public.sync_queue
ORDER BY tabela;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. ORGANIZAÇÕES + FILIAIS
-- ═══════════════════════════════════════════════════════════════════════════
SELECT
  o.id AS org_id,
  o.name AS organizacao,
  o.trade_name,
  o.cnpj,
  o.plan,
  sb.id AS branch_id,
  sb.name AS filial,
  sb.code AS filial_code,
  sb.cnpj AS filial_cnpj,
  sb.city,
  sb.state,
  sb.is_headquarters,
  sb.active AS filial_ativa
FROM public.organizations o
LEFT JOIN public.store_branches sb ON sb.organization_id = o.id
ORDER BY o.name, sb.name;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. USUÁRIOS + FILIAL + ORGANIZAÇÃO
-- ═══════════════════════════════════════════════════════════════════════════
SELECT
  su.id AS user_id,
  su.name AS usuario,
  su.email,
  su.role AS cargo,
  su.superadmin,
  su.active AS ativo,
  sb.id AS branch_id,
  sb.name AS filial,
  sb.code AS filial_code,
  o.name AS organizacao
FROM public.system_users su
LEFT JOIN public.store_branches sb ON sb.id = su.store_branch_id
LEFT JOIN public.organizations o ON o.id = su.organization_id
ORDER BY o.name, sb.name, su.name;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. PRODUTOS COM CATEGORIA, ESTOQUE E FILIAL
-- ═══════════════════════════════════════════════════════════════════════════
SELECT
  p.id AS product_id,
  p.barcode,
  p.name AS produto,
  c.name AS categoria,
  p.cost_price AS custo,
  p.sale_price AS venda,
  p.stock_quantity AS estoque,
  p.min_stock_quantity AS estoque_minimo,
  CASE
    WHEN p.stock_quantity <= 0 THEN '🔴 SEM ESTOQUE'
    WHEN p.stock_quantity <= p.min_stock_quantity THEN '🟡 ABAIXO DO MÍNIMO'
    ELSE '🟢 OK'
  END AS status_estoque,
  p.unit AS unidade,
  p.is_ativo AS ativo,
  sb.name AS filial,
  sb.code AS filial_code,
  p.show_on_tv AS no_tv,
  p.tv_promo_price AS promo_tv
FROM public.products p
LEFT JOIN public.categories c ON c.id = p.category_id
LEFT JOIN public.store_branches sb ON sb.id = p.store_branch_id
ORDER BY p.stock_quantity ASC, p.name;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. CLIENTES
-- ═══════════════════════════════════════════════════════════════════════════
SELECT
  cu.id AS customer_id,
  cu.name AS cliente,
  cu.cpf_cnpj,
  cu.email,
  cu.phone,
  cu.credit_limit AS limite_credito,
  cu.notes AS observacoes,
  sb.name AS filial,
  sb.code AS filial_code,
  cu.created_at
FROM public.customers cu
LEFT JOIN public.store_branches sb ON sb.id = cu.store_branch_id
ORDER BY cu.created_at DESC;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. FORNECEDORES
-- ═══════════════════════════════════════════════════════════════════════════
SELECT
  s.id AS supplier_id,
  s.corporate_name AS razao_social,
  s.trade_name AS nome_fantasia,
  s.cnpj,
  s.email,
  s.phone,
  s.contact_person AS contato,
  sb.name AS filial,
  sb.code AS filial_code,
  s.created_at
FROM public.suppliers s
LEFT JOIN public.store_branches sb ON sb.id = s.store_branch_id
ORDER BY s.created_at DESC;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. VENDAS RECENTES COM ITENS
-- ═══════════════════════════════════════════════════════════════════════════
SELECT
  s.id AS sale_id,
  s.code AS codigo_venda,
  s.customer_name AS cliente,
  s.operator_name AS operador,
  s.payment_method AS forma_pagamento,
  s.subtotal,
  s.discount AS desconto,
  s.total AS total,
  s.status,
  s.store_branch_id AS branch_id,
  sb.name AS filial,
  s.created_at AS data_venda,
  si.id AS item_id,
  si.product_name AS produto,
  si.quantity AS qtd,
  si.unit_price AS preco_unit,
  si.total_price AS total_item
FROM public.sales s
LEFT JOIN public.sale_items si ON si.sale_id = s.id
LEFT JOIN public.store_branches sb ON sb.id = s.store_branch_id
ORDER BY s.created_at DESC
LIMIT 50;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. SESSÕES DE CAIXA
-- ═══════════════════════════════════════════════════════════════════════════
SELECT
  cs.id AS session_id,
  cs.status,
  cs.operator_name AS operador,
  cs.opening_balance AS abertura,
  cs.closing_balance AS fechamento,
  cs.expected_balance AS esperado,
  cs.total_sales_cash AS vendas_dinheiro,
  cs.total_sales_pix AS vendas_pix,
  cs.total_sales_card AS vendas_cartao,
  cs.total_sales_credit_account AS vendas_crediario,
  cs.suprimentos,
  cs.sangrias,
  cs.opening_balance + COALESCE(cs.total_sales_cash, 0) + COALESCE(cs.suprimentos, 0)
    - COALESCE(cs.sangrias, 0) AS calculo_esperado,
  sb.name AS filial,
  sb.code AS filial_code,
  o.name AS organizacao,
  cs.opened_at,
  cs.closed_at
FROM public.cash_sessions cs
LEFT JOIN public.store_branches sb ON sb.id = cs.store_branch_id
LEFT JOIN public.organizations o ON o.id = cs.organization_id
ORDER BY cs.opened_at DESC;

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. TRANSAÇÕES FINANCEIRAS (RESUMO)
-- ═══════════════════════════════════════════════════════════════════════════
SELECT
  ft.id AS txn_id,
  ft.type AS tipo,
  ft.description AS descricao,
  ft.amount AS valor,
  ft.category AS categoria,
  ft.status,
  ft.payment_method AS forma_pagamento,
  ft.due_date AS vencimento,
  ft.payment_date AS pagamento,
  s.code AS venda_ref,
  sb.name AS filial,
  o.name AS organizacao,
  ft.created_at
FROM public.financial_transactions ft
LEFT JOIN public.sales s ON s.id = ft.sale_id
LEFT JOIN public.store_branches sb ON sb.id = ft.store_branch_id
LEFT JOIN public.organizations o ON o.id = ft.organization_id
ORDER BY ft.created_at DESC
LIMIT 50;

-- ═══════════════════════════════════════════════════════════════════════════
-- 10. MOVIMENTAÇÕES DE ESTOQUE
-- ═══════════════════════════════════════════════════════════════════════════
SELECT
  sm.id AS movement_id,
  sm.product_name AS produto,
  sm.type AS tipo,
  sm.quantity AS quantidade,
  sm.previous_stock AS estoque_anterior,
  sm.new_stock AS estoque_novo,
  sm.reason AS motivo,
  sm.operator_name AS operador,
  sb.name AS filial,
  o.name AS organizacao,
  sm.date AS data_mov
FROM public.stock_movements sm
LEFT JOIN public.store_branches sb ON sb.id = sm.store_branch_id
LEFT JOIN public.organizations o ON o.id = sm.organization_id
ORDER BY sm.date DESC
LIMIT 50;

-- ═══════════════════════════════════════════════════════════════════════════
-- 11. MOVIMENTAÇÕES FALHAS (DLQ) — operações que não sincronizaram
-- ═══════════════════════════════════════════════════════════════════════════
SELECT
  mf.id AS falha_id,
  mf.operation_type AS operacao,
  mf.table_name AS tabela,
  mf.record_id AS registro_id,
  mf.error_message AS erro,
  mf.error_code AS codigo_erro,
  mf.status AS status_falha,
  mf.retry_count AS tentativas,
  mf.max_retries AS max_tentativas,
  mf.next_retry_at AS proxima_tentativa,
  mf.created_at
FROM public.movimentacoes_falhas mf
ORDER BY mf.created_at DESC
LIMIT 50;

-- ═══════════════════════════════════════════════════════════════════════════
-- 12. FILA DE SINCRONIZAÇÃO (SYNC QUEUE)
-- ═══════════════════════════════════════════════════════════════════════════
SELECT
  sq.id AS queue_id,
  sq.table_name AS tabela,
  sq.record_id AS registro_id,
  sq.operation AS operacao,
  sq.status AS status,
  sq.created_at,
  sq.processed_at
FROM public.sync_queue sq
ORDER BY sq.created_at DESC
LIMIT 50;

-- ═══════════════════════════════════════════════════════════════════════════
-- 13. CONFIGURAÇÕES DO SISTEMA
-- ═══════════════════════════════════════════════════════════════════════════
SELECT
  ss.id AS settings_id,
  ss.organization_id,
  o.name AS organizacao,
  ss.settings AS configuracoes,
  ss.updated_at
FROM public.system_settings ss
LEFT JOIN public.organizations o ON o.id = ss.organization_id
ORDER BY ss.updated_at DESC;

-- ═══════════════════════════════════════════════════════════════════════════
-- 14. AI INSIGHTS (últimos 7 dias)
-- ═══════════════════════════════════════════════════════════════════════════
SELECT
  ai.id,
  ai.today_revenue AS receita_dia,
  ai.total_sales AS total_vendas,
  ai.ticket_medio AS ticket_medio,
  ai.generated_at,
  ai.insights
FROM public.ai_insights ai
ORDER BY ai.generated_at DESC
LIMIT 14;

-- ═══════════════════════════════════════════════════════════════════════════
-- 15. PROBLEMAS DE DADOS — registros com store_branch_id NULL
-- ═══════════════════════════════════════════════════════════════════════════
SELECT 'products' AS tabela, COUNT(*) AS registros_com_branch_null
FROM public.products WHERE store_branch_id IS NULL
UNION ALL
SELECT 'customers', COUNT(*) FROM public.customers WHERE store_branch_id IS NULL
UNION ALL
SELECT 'suppliers', COUNT(*) FROM public.suppliers WHERE store_branch_id IS NULL
UNION ALL
SELECT 'sales', COUNT(*) FROM public.sales WHERE store_branch_id IS NULL
UNION ALL
SELECT 'cash_sessions', COUNT(*) FROM public.cash_sessions WHERE store_branch_id IS NULL
UNION ALL
SELECT 'financial_transactions', COUNT(*) FROM public.financial_transactions WHERE store_branch_id IS NULL
UNION ALL
SELECT 'stock_movements', COUNT(*) FROM public.stock_movements WHERE store_branch_id IS NULL
UNION ALL
SELECT 'system_users', COUNT(*) FROM public.system_users WHERE store_branch_id IS NULL
ORDER BY tabela;

-- ═══════════════════════════════════════════════════════════════════════════
-- 16. PROBLEMAS DE DADOS — vendas sem customer_id ou user_id
-- ═══════════════════════════════════════════════════════════════════════════
SELECT
  s.id AS sale_id,
  s.code AS codigo,
  s.customer_name AS cliente,
  s.operator_name AS operador,
  s.total,
  s.status,
  s.customer_id AS customer_id_null,
  s.user_id AS user_id_null,
  s.store_branch_id AS branch_id_null,
  s.created_at
FROM public.sales s
WHERE s.customer_id IS NULL
   OR s.user_id IS NULL
   OR s.store_branch_id IS NULL
ORDER BY s.created_at DESC
LIMIT 30;

-- ═══════════════════════════════════════════════════════════════════════════
-- 17. RESUMO FINANCEIRO POR ORGANIZAÇÃO
-- ═══════════════════════════════════════════════════════════════════════════
SELECT
  o.id AS org_id,
  o.name AS organizacao,
  COUNT(DISTINCT s.id) AS total_vendas,
  COALESCE(SUM(s.total), 0) AS receita_total,
  COUNT(DISTINCT ft.id) AS total_transacoes,
  COALESCE(SUM(CASE WHEN ft.type = 'income' THEN ft.amount ELSE 0 END), 0) AS receitas,
  COALESCE(SUM(CASE WHEN ft.type = 'expense' THEN ft.amount ELSE 0 END), 0) AS despesas,
  COUNT(DISTINCT cs.id) AS total_sessoes_caixa,
  COUNT(DISTINCT cu.id) AS total_clientes,
  COUNT(DISTINCT p.id) AS total_produtos
FROM public.organizations o
LEFT JOIN public.sales s ON s.organization_id = o.id
LEFT JOIN public.financial_transactions ft ON ft.organization_id = o.id
LEFT JOIN public.cash_sessions cs ON cs.organization_id = o.id
LEFT JOIN public.customers cu ON cu.organization_id = o.id
LEFT JOIN public.products p ON p.organization_id = o.id
GROUP BY o.id, o.name
ORDER BY o.name;

-- ═══════════════════════════════════════════════════════════════════════════
-- 18. RESUMO DE ESTOQUE POR CATEGORIA
-- ═══════════════════════════════════════════════════════════════════════════
SELECT
  c.name AS categoria,
  COUNT(p.id) AS total_produtos,
  SUM(p.stock_quantity) AS estoque_total,
  ROUND(AVG(p.sale_price), 2) AS preco_venda_medio,
  ROUND(AVG(p.cost_price), 2) AS preco_custo_medio,
  SUM(p.stock_quantity * p.cost_price) AS valor_estoque_custo,
  SUM(p.stock_quantity * p.sale_price) AS valor_estoque_venda
FROM public.categories c
LEFT JOIN public.products p ON p.category_id = c.id AND p.organization_id = c.organization_id
GROUP BY c.id, c.name
ORDER BY c.name;

-- ═══════════════════════════════════════════════════════════════════════════
-- 19. FORMA DE PAGAMENTO — DISTRIBUIÇÃO DAS VENDAS
-- ═══════════════════════════════════════════════════════════════════════════
SELECT
  s.payment_method AS forma_pagamento,
  COUNT(*) AS quantidade_vendas,
  ROUND(SUM(s.total), 2) AS valor_total,
  ROUND(AVG(s.total), 2) AS ticket_medio
FROM public.sales s
GROUP BY s.payment_method
ORDER BY valor_total DESC;

-- ═══════════════════════════════════════════════════════════════════════════
-- 20. STATUS DAS VENDAS
-- ═══════════════════════════════════════════════════════════════════════════
SELECT
  s.status,
  COUNT(*) AS quantidade,
  ROUND(SUM(s.total), 2) AS valor_total
FROM public.sales s
GROUP BY s.status
ORDER BY s.status;
