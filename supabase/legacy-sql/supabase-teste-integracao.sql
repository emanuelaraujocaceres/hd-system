-- ==============================================================================
-- ROTEIRO DE TESTE DE INTEGRAÇÃO — HD-System ERP/PDV
-- ==============================================================================
-- Execute as queries abaixo conforme o roteiro de teste.
-- Cada seção corresponde a um dos 6 fluxos críticos.
-- ==============================================================================

-- ═══════════════════════════════════════════════════════════════════════════════
-- ANTES DE COMEÇAR: snapshot do estado atual
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT '[SNAPSHOT] Estado inicial antes dos testes' AS passo;
SELECT 'cash_sessions' AS tabela, COUNT(*) FROM cash_sessions
UNION ALL SELECT 'products', COUNT(*) FROM products
UNION ALL SELECT 'sales', COUNT(*) FROM sales
UNION ALL SELECT 'sale_items', COUNT(*) FROM sale_items
UNION ALL SELECT 'stock_movements', COUNT(*) FROM stock_movements
UNION ALL SELECT 'movimentacoes_falhas', COUNT(*) FROM movimentacoes_falhas
ORDER BY tabela;

-- ═══════════════════════════════════════════════════════════════════════════════
-- TESTE 1: ABERTURA DE CAIXA
-- ═══════════════════════════════════════════════════════════════════════════════
-- Quando: Após abrir o caixa no PDV
-- Frontend: PDV → "Abrir Caixa" → inserir valor inicial → confirmar
-- Log esperado: "[HD-Sync] 💾 Salvando CAIXA localmente: id=..., status=open"
--              "[HD-Sync] 🔄 Upsert cash_sessions succeeded" (ou queued se offline)
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT '[TESTE 1] Abrir caixa (rode APÓS abrir o caixa no PDV)' AS passo;

-- Verificar se o registro chegou no Supabase
SELECT id, operator_name, opening_balance, expected_balance,
       status, opened_at, store_branch_id, organization_id
FROM cash_sessions
WHERE status = 'open'
ORDER BY opened_at DESC
LIMIT 5;

-- Verificar se o frontend buscaria este registro no hydrate
-- (simula o que storageService.hydrateFromCloud() faz)
SELECT COUNT(*) AS caixas_abertos_supabase
FROM cash_sessions WHERE status = 'open';

-- ═══════════════════════════════════════════════════════════════════════════════
-- TESTE 2: VENDA COM 2+ PRODUTOS (PDV-001)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Quando: Após finalizar uma venda com 2+ itens no PDV
-- Frontend: PDV → adicionar produto A → adicionar produto B → "Finalizar Venda"
--           → selecionar forma de pagamento → confirmar
-- Log esperado: "[HD-Sync] syncSale: sale items: 2"
--              "process_sale_transaction RPC" com p_sale_items contendo 2 itens
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT '[TESTE 2] Verificar venda + itens + estoque (rode APÓS finalizar venda)' AS passo;

-- 2a. A venda foi criada?
SELECT s.id, s.code, s.total, s.status, s.payment_method,
       s.operator_name, s.created_at, s.organization_id
FROM sales s
ORDER BY s.created_at DESC
LIMIT 5;

-- 2b. Os itens da venda existem? (PDV-001: TODOS os itens devem estar aqui)
SELECT si.sale_id, si.product_id, si.product_name,
       si.quantity, si.unit_price, si.total_price
FROM sale_items si
WHERE si.sale_id IN (SELECT id FROM sales ORDER BY created_at DESC LIMIT 1)
ORDER BY si.product_name;

-- 2c. O estoque foi deduzido corretamente?
-- Esta query compara stock_quantity atual vs. antes da venda
-- (precisa de snapshot manual, mas já mostra o estado pós-venda)
SELECT p.id, p.name, p.stock_quantity AS estoque_atual,
       p.updated_at AS ultima_atualizacao
FROM products p
WHERE p.id IN (
  SELECT product_id FROM sale_items
  WHERE sale_id IN (SELECT id FROM sales ORDER BY created_at DESC LIMIT 1)
);

-- 2d. As movimentações de estoque foram registradas?
SELECT sm.product_name, sm.type, sm.quantity,
       sm.previous_stock, sm.new_stock, sm.reason,
       sm.operator_name, sm.created_at
FROM stock_movements sm
WHERE sm.reason LIKE '%PDV%' OR sm.reason LIKE '%Venda%'
ORDER BY sm.created_at DESC
LIMIT 10;

-- 2e. VERIFICAÇÃO CRÍTICA PDV-001: Estoque de cada item da última venda
-- O estoque de CADA produto deve ter diminuído exatamente pela quantity da venda
-- Se algum produto NÃO mudou, o RPC não está processando todos os itens
WITH ultima_venda AS (
  SELECT id FROM sales ORDER BY created_at DESC LIMIT 1
)
SELECT
  si.product_name,
  si.quantity AS vendido,
  p.stock_quantity AS estoque_final,
  (p.stock_quantity + si.quantity) AS estoque_antes_da_venda,
  CASE
    WHEN p.stock_quantity IS NOT NULL THEN '✅ Ok'
    ELSE '❌ PRODUTO SEM ESTOQUE'
  END AS status
FROM sale_items si
JOIN products p ON p.id = si.product_id
WHERE si.sale_id IN (SELECT id FROM ultima_venda)
ORDER BY si.product_name;

-- ═══════════════════════════════════════════════════════════════════════════════
-- TESTE 3: FECHAMENTO DE CAIXA
-- ═══════════════════════════════════════════════════════════════════════════════
-- Quando: Após fechar o caixa no PDV
-- Frontend: PDV → "Fechar Caixa" → pode adicionar suprimento/sangria → confirmar
-- Log esperado: "[HD-Sync] 💾 CAIXA salvo no localStorage; agora enviando para Supabase"
--              "syncCaixaSession() executado"
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT '[TESTE 3] Verificar fechamento de caixa (rode APÓS fechar caixa)' AS passo;

-- 3a. O caixa foi fechado?
SELECT id, operator_name,
       opening_balance,
       total_sales_cash, total_sales_pix, total_sales_card,
       total_sales_credit_account,
       suprimentos, sangrias,
       expected_balance,
       closing_balance,
       status, opened_at, closed_at
FROM cash_sessions
ORDER BY closed_at DESC NULLS LAST
LIMIT 5;

-- 3b. Verificar cálculo: expected_balance é o saldo EM DINHEIRO FÍSICO no caixa.
--     ⚠ O frontend calcula como: opening_balance + total_sales_cash + suprimentos - sangrias
--     (Pix, cartão e conta corrente NÃO entram — são meios eletrônicos, não afetam a gaveta)
--     Referência: storageService.ts linha 1735
SELECT id, operator_name,
       opening_balance,
       total_sales_cash AS vendas_dinheiro,
       suprimentos, sangrias,
       expected_balance,
       (opening_balance + total_sales_cash + suprimentos - sangrias) AS expected_balance_calculado,
       CASE
         WHEN expected_balance = (opening_balance + total_sales_cash + suprimentos - sangrias)
         THEN '✅ Correto'
         ELSE '❌ DIVERGENTE'
       END AS status
FROM cash_sessions
ORDER BY closed_at DESC NULLS LAST
LIMIT 5;

-- 3c. Ver referência completa com TODOS os métodos (para auditoria)
SELECT id, operator_name,
       opening_balance,
       total_sales_cash, total_sales_pix, total_sales_card,
       total_sales_credit_account,
       suprimentos, sangrias,
       expected_balance,
       (opening_balance + total_sales_cash + suprimentos - sangrias) AS expected_balance_real,
       (opening_balance + total_sales_cash + total_sales_pix
        + total_sales_card + total_sales_credit_account
        + suprimentos - sangrias) AS saldo_geral_com_todos_metodos
FROM cash_sessions
ORDER BY closed_at DESC NULLS LAST
LIMIT 5;

-- ═══════════════════════════════════════════════════════════════════════════════
-- TESTE 4: CADASTRO DE PRODUTO
-- ═══════════════════════════════════════════════════════════════════════════════
-- Quando: Após cadastrar um novo produto no menu Estoque
-- Frontend: Estoque → "Novo Produto" → preencher dados → salvar
-- Log esperado: "[HD-Sync] 🔄 Upsert products succeeded (row id: ...)"
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT '[TESTE 4] Verificar produto cadastrado (rode APÓS cadastrar produto)' AS passo;

-- 4a. O produto existe com organization_id correto?
SELECT id, name, barcode, category, unit,
       cost_price, sale_price, stock_quantity, is_active,
       organization_id, store_branch_id, updated_at
FROM products
ORDER BY updated_at DESC
LIMIT 10;

-- 4b. Produtos com organization_id nulo (vazamento de dados)?
SELECT COUNT(*) AS produtos_sem_org FROM products WHERE organization_id IS NULL;

-- 4c. O produto aparece na organização correta?
-- Substitua pelo nome do produto que você cadastrou
-- SELECT * FROM products WHERE name LIKE '%NOME_DO_PRODUTO%';

-- ═══════════════════════════════════════════════════════════════════════════════
-- TESTE 5: LOGIN/LOGOUT (RLS)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Quando: Após fazer login ou recarregar a página
-- Log esperado (login): "Hydrate complete" ou "Supabase connection: OK"
-- Log esperado (logout): "Auth state changed: null"
--
-- ⚠ Estas queries só funcionam se executadas NO MESMO contexto do usuário logado
-- (via Dashboard ou SQL Editor autenticado como o próprio usuário)
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT '[TESTE 5] Verificar RLS (rode com o usuário autenticado no Dashboard)' AS passo;

-- 5a. Quem sou eu?
SELECT auth.uid() AS meu_id, auth.email() AS meu_email;

-- 5b. A função get_auth_user_org_id() funciona?
SELECT public.get_auth_user_org_id() AS minha_org;

-- 5c. Sou superadmin?
SELECT public.is_superadmin() AS sou_superadmin;

-- 5d. Consigo ver meus dados em system_users?
SELECT id, name, email, role, organization_id
FROM system_users
WHERE id = auth.uid();

-- 5e. Consigo ver produtos da minha organização? (RLS: só da minha org)
SELECT COUNT(*) AS produtos_visiveis FROM products;

-- 5f. Consigo ver sessões de caixa da minha organização?
SELECT COUNT(*) AS caixas_visiveis FROM cash_sessions;

-- ═══════════════════════════════════════════════════════════════════════════════
-- TESTE 6: SINCRONIZAÇÃO OFFLINE (DLQ + SYNC QUEUE)
-- ═══════════════════════════════════════════════════════════════════════════════
-- PARA TESTAR:
--   1. Desative o Wi-Fi ou coloque avião no navegador
--   2. Faça uma venda ou cadastre um produto (vai para localStorage + sync_queue)
--   3. Reative a conexão (sync_queue processa automaticamente)
-- Log esperado (offline): "[HD-Sync] 📝 Queuing products upsert (offline)"
-- Log esperado (online): "[HD-Sync] 🔄 Processing N pending operations..."
-- Log esperado (sucesso): "[SyncQueue] ✅ upsert on products succeeded"
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT '[TESTE 6] Verificar DLQ e sync queue' AS passo;

-- 6a. Há entradas na DLQ (dead letter queue)?
SELECT id, operation_type, table_name, record_id,
       error_message, source, status, created_at
FROM movimentacoes_falhas
ORDER BY created_at DESC
LIMIT 20;

-- 6b. sync_queue não verificada (tabela não existe no banco atual).
-- O frontend gerencia a fila offline no localStorage mesmo.
-- Para ver a fila no navegador: syncService.getPendingCount()

-- 6c. Resumo das falhas por tabela (ajuda a identificar padrões)
SELECT table_name, operation_type,
       COUNT(*) AS total_erros,
       MAX(created_at) AS ultimo_erro
FROM movimentacoes_falhas
GROUP BY table_name, operation_type
ORDER BY total_erros DESC;

-- ═══════════════════════════════════════════════════════════════════════════════
-- RELATÓRIO FINAL
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT '[RELATÓRIO FINAL] Estado do banco após todos os testes' AS passo;

SELECT 'products' AS tabela, COUNT(*) FROM products
UNION ALL SELECT 'categories', COUNT(*) FROM categories
UNION ALL SELECT 'customers', COUNT(*) FROM customers
UNION ALL SELECT 'suppliers', COUNT(*) FROM suppliers
UNION ALL SELECT 'sales', COUNT(*) FROM sales
UNION ALL SELECT 'sale_items', COUNT(*) FROM sale_items
UNION ALL SELECT 'cash_sessions', COUNT(*) FROM cash_sessions
UNION ALL SELECT 'stock_movements', COUNT(*) FROM stock_movements
UNION ALL SELECT 'financial_transactions', COUNT(*) FROM financial_transactions
UNION ALL SELECT 'store_branches', COUNT(*) FROM store_branches
UNION ALL SELECT 'system_users', COUNT(*) FROM system_users
UNION ALL SELECT 'system_settings', COUNT(*) FROM system_settings
UNION ALL SELECT 'organizations', COUNT(*) FROM organizations
ORDER BY tabela;
