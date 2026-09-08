-- ═══════════════════════════════════════════════════════════════════════════
-- AUDITORIA 2026-09-08 — Cardápio por QR x Comandas x Pedidos
-- Branch: Adega - Matriz (160e38a2-a896-4d6b-a6ea-52d4362abf55) — juninho@gmail.com
-- Objetivo: reproduzir no SQL Editor os fantasmas da auditoria e limpar.
-- Como usar: rode BLOCO a BLOCO (um SELECT por vez) no Supabase > SQL Editor.
-- Não rode os blocos de LIMPEZA (seção Z) sem ler os resultados de A..Y.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 0) Quem sou e qual filial estou vendo (confirma branch)
-- ───────────────────────────────────────────────────────────────────────────
SELECT id, name, code, organization_id, is_active
FROM store_branches
WHERE id = '160e38a2-a896-4d6b-a6ea-52d4362abf55';

-- Lista todas as mesas da filial (7 esperadas)
SELECT id, name, number, qr_token, status, store_branch_id, organization_id, created_at
FROM tables
WHERE store_branch_id = '160e38a2-a896-4d6b-a6ea-52d4362abf55'
ORDER BY number NULLS LAST, name;

-- ───────────────────────────────────────────────────────────────────────────
-- A) Sessões ativas por mesa (a fonte da verdade de "mesa ocupada")
-- ───────────────────────────────────────────────────────────────────────────
SELECT cs.id as session_id, t.name as mesa, cs.table_id, cs.session_token, cs.status,
       cs.opened_at, cs.device_fingerprint, cs.customer_name, cs.organization_id, cs.store_branch_id
FROM customer_sessions cs
JOIN tables t ON t.id = cs.table_id
WHERE cs.store_branch_id = '160e38a2-a896-4d6b-a6ea-52d4362abf55'
  AND cs.status = 'active'
ORDER BY t.number, cs.opened_at;

-- Contagem: deve ser 7 ativas (header do print). Se >7, há sessão duplicada por mesa (violação one_active_session_per_table).
SELECT table_id, count(*) as ativas
FROM customer_sessions
WHERE store_branch_id = '160e38a2-a896-4d6b-a6ea-52d4362abf55' AND status='active'
GROUP BY table_id HAVING count(*)>1;

-- ───────────────────────────────────────────────────────────────────────────
-- B) Vendas pendentes agrupadas por mesa (o que a ComandaView soma)
-- ───────────────────────────────────────────────────────────────────────────
SELECT t.name as mesa, t.id as table_id, count(s.id) as qtd_vendas, string_agg(s.code, ', ') as codes,
       sum(s.total) as total_mesa, string_agg(distinct s.order_source, ',') as sources,
       string_agg(distinct s.kitchen_status, ',') as kitchen_statuses
FROM sales s
LEFT JOIN tables t ON t.id = s.table_id
WHERE s.store_branch_id = '160e38a2-a896-4d6b-a6ea-52d4362abf55'
  AND s.status = 'pending' AND s.deleted_at IS NULL
GROUP BY t.name, t.id
ORDER BY total_mesa DESC NULLS LAST;

-- Esperado após fix: só Mesa 1 com R$4,50 antes da limpeza. Mesa teste deve estar 0.
-- Se mesa teste aparece com 2 vendas (R$4,50), são as do print (cigarro+halls).

-- ───────────────────────────────────────────────────────────────────────────
-- C) Detalhe das 2 vendas fantasmas citadas
-- ───────────────────────────────────────────────────────────────────────────
-- Procura por "halls" e "chesterfield" e "skol" nas pendentes
SELECT s.id, s.code, s.table_id, t.name as mesa, s.customer_session_id, cs.table_id as sess_mesa,
       s.total, s.status, s.kitchen_status, s.order_source, s.organization_id, s.store_branch_id,
       s.operator_name, s.created_at, s.date,
       (SELECT json_agg(json_build_object('product', si.product_name, 'q', si.quantity, 'total', si.total_price))
        FROM sale_items si WHERE si.sale_id = s.id) as itens
FROM sales s
LEFT JOIN tables t ON t.id = s.table_id
LEFT JOIN customer_sessions cs ON cs.id = s.customer_session_id
WHERE s.store_branch_id = '160e38a2-a896-4d6b-a6ea-52d4362abf55'
  AND s.status='pending' AND s.deleted_at IS NULL
  AND (
    s.code ILIKE '%MTR%' OR s.code ILIKE '%MTSJ%'
    OR EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id=s.id AND si.product_name ILIKE '%halls%')
    OR EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id=s.id AND si.product_name ILIKE '%chesterfield%')
    OR EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id=s.id AND si.product_name ILIKE '%skol%')
  )
ORDER BY s.date DESC;

-- ───────────────────────────────────────────────────────────────────────────
-- D) Vendas BIPOLARES — table_id diverge de customer_sessions.table_id
--    (causa raiz do bug A: reuso de sessão por deviceFingerprint sem mesa)
-- ───────────────────────────────────────────────────────────────────────────
SELECT s.id, s.code, t1.name as venda_mesa, t2.name as sessao_mesa,
       s.table_id, s.customer_session_id, cs.table_id as cs_table, cs.status as cs_status,
       s.total, s.kitchen_status, s.created_at
FROM sales s
JOIN customer_sessions cs ON cs.id = s.customer_session_id
LEFT JOIN tables t1 ON t1.id = s.table_id
LEFT JOIN tables t2 ON t2.id = cs.table_id
WHERE s.store_branch_id = '160e38a2-a896-4d6b-a6ea-52d4362abf55'
  AND s.status='pending' AND s.deleted_at IS NULL
  AND s.table_id IS DISTINCT FROM cs.table_id;

-- Se este SELECT retorna as 2 linhas do celular, confirmou o bipolar.

-- ───────────────────────────────────────────────────────────────────────────
-- E) Vendas ÓRFÃS — sem customer_session_id mas com table_id (criadas antes do fluxo)
-- ───────────────────────────────────────────────────────────────────────────
SELECT s.id, s.code, t.name as mesa, s.table_id, s.total, s.kitchen_status, s.order_source, s.date
FROM sales s
LEFT JOIN tables t ON t.id = s.table_id
WHERE s.store_branch_id = '160e38a2-a896-4d6b-a6ea-52d4362abf55'
  AND s.customer_session_id IS NULL
  AND s.table_id IS NOT NULL
  AND s.status='pending' AND s.deleted_at IS NULL
ORDER BY s.date DESC;

-- Este é o "skol fininha" da Mesa 1 (se for órfã).

-- ───────────────────────────────────────────────────────────────────────────
-- F) Sessão 17:14 da mesa teste (vazia no PC) — por que vazia?
-- ───────────────────────────────────────────────────────────────────────────
SELECT cs.*, t.name
FROM customer_sessions cs JOIN tables t ON t.id=cs.table_id
WHERE cs.store_branch_id='160e38a2-a896-4d6b-a6ea-52d4362abf55'
  AND t.name ILIKE '%mesa teste%'
ORDER BY cs.opened_at DESC LIMIT 5;

-- Agora as vendas que deveriam estar nessa sessão:
SELECT s.id, s.code, s.customer_session_id, s.table_id, s.total, s.kitchen_status
FROM sales s
WHERE s.store_branch_id='160e38a2-a896-4d6b-a6ea-52d4362abf55'
  AND s.table_id = (SELECT id FROM tables WHERE store_branch_id='160e38a2-a896-4d6b-a6ea-52d4362abf55' AND name ILIKE '%mesa teste%' LIMIT 1)
  AND s.status='pending' AND s.deleted_at IS NULL;

-- Se o 2o SELECT tem linhas mas o session_id delas != id da sessão 17:14, é bipolar/órfã.

-- ───────────────────────────────────────────────────────────────────────────
-- G) KDS — o que o operador vê em Pedidos (cardapio_digital + pending/completed)
-- ───────────────────────────────────────────────────────────────────────────
SELECT s.id, s.code, t.name as mesa, s.kitchen_status, s.status, s.total,
       s.customer_session_id, cs.status as cs_status
FROM sales s
LEFT JOIN tables t ON t.id=s.table_id
LEFT JOIN customer_sessions cs ON cs.id=s.customer_session_id
WHERE s.store_branch_id='160e38a2-a896-4d6b-a6ea-52d4362abf55'
  AND s.order_source IN ('cardapio_digital','delivery')
  AND s.status IN ('pending') -- KDS mostra pending/preparing/ready/delivered/closing_request, não completed
  AND s.deleted_at IS NULL
ORDER BY s.date;

-- ───────────────────────────────────────────────────────────────────────────
-- H) Checks de integridade multi-tenant (org/filial)
-- ───────────────────────────────────────────────────────────────────────────
-- Vendas com org/filial divergente da sessão (dado corrompido)
SELECT s.id, s.code, s.organization_id as sale_org, s.store_branch_id as sale_branch,
       cs.organization_id as sess_org, cs.store_branch_id as sess_branch
FROM sales s JOIN customer_sessions cs ON cs.id=s.customer_session_id
WHERE s.store_branch_id='160e38a2-a896-4d6b-a6ea-52d4362abf55'
  AND (s.organization_id IS DISTINCT FROM cs.organization_id
       OR s.store_branch_id IS DISTINCT FROM cs.store_branch_id)
LIMIT 20;

-- ───────────────────────────────────────────────────────────────────────────
-- I) Funções e policies
-- ───────────────────────────────────────────────────────────────────────────
SELECT proname, pg_get_functiondef(oid) FROM pg_proc WHERE proname IN ('fechar_comanda','solicitar_fechamento_comanda','process_sale_transaction');

-- Policies anon de escrita (devem ser WITH CHECK true, exceção 0f)
SELECT policyname, cmd, roles, with_check FROM pg_policies WHERE tablename IN ('sales','customer_sessions','sale_items','stock_movements') AND policyname ILIKE '%anon%';

-- Verifica se fechar_comanda tem grant anon (NÃO deve ter) e authenticated (deve ter)
SELECT has_function_privilege('anon', 'public.fechar_comanda(uuid, jsonb, text)', 'EXECUTE') as anon_can_fechar,
       has_function_privilege('authenticated', 'public.fechar_comanda(uuid, jsonb, text)', 'EXECUTE') as auth_can_fechar,
       has_function_privilege('anon', 'public.solicitar_fechamento_comanda(uuid[], text, text)', 'EXECUTE') as anon_can_solicitar;

-- ───────────────────────────────────────────────────────────────────────────
-- J) DLQ — vendas que caíram na fila de falhas (42501, 22P02)
-- ───────────────────────────────────────────────────────────────────────────
SELECT id, table_name, record_id, status, error_message, created_at
FROM movimentacoes_falhas
WHERE store_branch_id='160e38a2-a896-4d6b-a6ea-52d4362abf55'
ORDER BY created_at DESC LIMIT 20;

-- Se houver "42501" em sales/customer_sessions após 2026-09-08, é o bug de solicitar_fechamento antigo.

-- ═══════════════════════════════════════════════════════════════════════════
-- Z) LIMPEZA — rode APENAS depois de conferir A..J e com backup
-- Cada bloco é idempotente. Escolha Z1 OU Z2, não ambos.
-- ═══════════════════════════════════════════════════════════════════════════

-- Z0) Backup rápido (opcional): exporte as 2 tabelas antes de mexer
-- No SQL Editor, rode e baixe CSV:
-- SELECT * FROM sales WHERE store_branch_id='160e38a2-a896-4d6b-a6ea-52d4362abf55' AND status='pending';
-- SELECT * FROM customer_sessions WHERE store_branch_id='160e38a2-a896-4d6b-a6ea-52d4362abf55' AND status='active';

-- Z1) FECHAR corretamente as 2 vendas fantasmas via RPC (recomendado, mantém histórico)
-- Use o id da SESSÃO 17:14 da mesa teste (copie do SELECT F) e rode:
-- SELECT public.fechar_comanda('SESSAO_MESA_TESTE_UUID'::uuid, '[{"method":"pix","amount":4.50}]'::jsonb, 'juninho@gmail.com');
-- Se precisar fechar a Mesa 1 órfã "skol":
-- SELECT public.fechar_comanda((SELECT id FROM customer_sessions WHERE store_branch_id='160e38a2-a896-4d6b-a6ea-52d4362abf55' AND table_id=(SELECT id FROM tables WHERE store_branch_id='160e38a2-a896-4d6b-a6ea-52d4362abf55' AND name='Mesa 1' LIMIT 1) AND status='active' LIMIT 1), '[{"method":"pix","amount":4.50}]'::jsonb, 'juninho@gmail.com');

-- Z2) Se preferir CANCELAR (restaura estoque) as órfãs/bipolares antigas:
-- (descomente e ajuste WHERE para os ids vistos em D/E)
-- SELECT public.cancel_sale_atomic('ID_DA_VENDA_FANTASMA'::uuid); -- restaura estoque composto/fração
-- Ou, se cancel_sale_atomic não existir, use o helper do app (KDS > X) que chama cancelSaleWithStockRestore.

-- Z3) Se uma mesa ficou travada com 2 sessões ativas (violação da constraint):
-- Cancele a mais antiga:
-- UPDATE customer_sessions SET status='cancelled', closed_at=now(), updated_at=now()
-- WHERE id='SESSAO_ANTIGA_UUID' AND status='active';

-- Z4) Aplicar o fix da RPC fechar_comanda (se ainda não aplicado via migration)
-- Copie o arquivo supabase/migrations/20260908_fechar_comanda_fix_orfa_e_bipolar.sql inteiro e rode aqui.
-- Depois confirme:
-- SELECT has_function_privilege('authenticated','public.fechar_comanda(uuid, jsonb, text)','EXECUTE');

-- FIM
