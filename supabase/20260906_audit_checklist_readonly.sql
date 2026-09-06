-- ============================================================================
-- AUDITORIA HD-SYSTEM — CHECKLIST READ-ONLY (2026-09-06)
-- ----------------------------------------------------------------------------
-- SEGURO PARA RODAR NO SUPABASE SQL EDITOR: SOMENTE SELECT / pg_catalog /
-- information_schema. NAO contem UPDATE, DELETE, ALTER, DROP nem CREATE.
-- Objetivo: confirmar no banco VIVO os achados da auditoria de codigo
-- (regra BUG-036: producao pode diferir do repo — o banco e a verdade).
-- Rodar por secao e verificar os "RESULTADO ESPERADO" de cada bloco.
-- ============================================================================


-- ============================================================
-- SECAO A — RPCs criticos: definicao viva + grants diretos
-- ============================================================

-- A1. Listar TODAS as funcoes criticas com assinatura (overloads) e definir
--     se a versao viva corresponde ao repo. Caso a query de definicao falhe
--     por falta de permissao, nome+args ja bastam para a conferencia exterior.
--     Quais procurar:
--       cancel_sale_atomic        -> deve ter GRANT authenticated+service_role
--                                    (FIX_20260819 revogou; schema doc defende authed)
--       process_sale_transaction  -> authenticated+anon+service_role (excecao 0f)
--       fechar_comanda            -> authenticated+service_role (NUNCA anon)
--       fn_insserir_dlq           -> authenticated+anon+service_role (excecao 0f)
--       process_sale_atomic       -> service_role apenas
SELECT n.nspname AS schema_name, p.proname AS fn,
       pg_get_function_identity_arguments(p.oid) AS args,
       pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('cancel_sale_atomic','process_sale_transaction',
                    'process_sale_atomic','fechar_comanda','fn_insserir_dlq',
                    'create_customer_session','heartbeat_media_device')
ORDER BY p.proname, pg_get_function_identity_arguments(p.oid);

-- A2. GRANTS DIRETOS de EXECUTE (a fonte para a regra 9 do AGENTS.md).
--     RESULTADO ESPERADO:
--       cancel_sale_atomic      : geralmente 2 linhas (authenticated, service_role)
--                                 -> se so houver service_role, a remocao de item
--                                    de comanda restaura estoque para quem? (P0-4)
--       process_sale_transaction: anon, authenticated, service_role (cardapio)
--       fechar_comanda          : authenticated, service_role (SEM anon)
SELECT specific_schema, routine_name,
       pg_get_function_identity_arguments(p.oid) AS args,
       grantee, privilege_type
FROM information_schema.role_routine_grants rg
JOIN pg_proc p ON p.proname = rg.routine_name
JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = rg.specific_schema
WHERE rg.routine_schema = 'public'
  AND rg.routine_name IN ('cancel_sale_atomic','process_sale_transaction',
                          'process_sale_atomic','fechar_comanda','fn_insserir_dlq',
                          'create_customer_session','heartbeat_media_device')
ORDER BY rg.routine_name, rg.grantee;

-- A3. PROVA DO ACHADO P0-4: a definicao VIVA de cancel_sale_atomic usa
--     "v_sale.items" (coluna inexistente em sales) ou o caminho correto
--     via sale_items / ingredients / open_containers?
--     RESULTADO ESPERADO: TRUE = problema confirmado no banco (restaura 0).
SELECT EXISTS (
  SELECT 1 FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'cancel_sale_atomic'
    AND (pg_get_functiondef(p.oid) ILIKE '%v_sale.items%'
         OR pg_get_functiondef(p.oid) ILIKE '%v_sale%items%')
) AS cancel_sale_atomic_usa_v_sale_items;


-- ============================================================
-- SECAO B — Policies RLS ATUAIS (pg_policies = estado real)
-- ============================================================

-- B1. branch_themes: procurar policies PERMISSIVAS (qual true) fora das
--     excecoes 0f — criadas por 20260810_fix_rls_api_keys_sessions_themes.sql
--     e NAO dropadas pelo RLS_FIXES.sql.
--     RESULTADO ESPERADO: se aparecer qual 'true'/'USING (true)' em policy
--     branch_themes_* -> RISCO de leitura/escrita cross-org confirmado.
--     Ideal: apenas org_branch_select/insert/update/delete_branch_themes
--     (org+branch) e superadmin_all_branch_themes.
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE tablename = 'branch_themes'
ORDER BY policyname;

-- B2. sales / customer_sessions / sale_items / tables / products:
--     conferir (a) escopo org+branch nas policies autenticadas;
--     (b) excecoes anon documentadas (0f) SAO apenas as esperadas;
--     (c) sales_update_anon NAO existe (achado P0-3 do closing_request).
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE tablename IN ('sales','sale_items','customer_sessions','tables','products','stock_movements')
ORDER BY tablename, policyname;

-- B3. CHECK PONTUAL: existe policy de UPDATE anon em sales?
--     RESULTADO ESPERADO: false (confirmaria 42501 no closing_request -> DLQ).
SELECT EXISTS (
  SELECT 1 FROM pg_policies
  WHERE tablename = 'sales' AND cmd = 'UPDATE' AND 'anon' = ANY(roles)
) AS existe_sales_update_anon;

-- B4. EXCECOES 0f documentadas — devem existir EXATAMENTE estas:
--     tables_select_anon USING(true) e store_branches_select_anon USING(true)
--     (fallback legado sem header / lookup por qr_token antes de conhecer filial).
SELECT tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE policyname IN ('tables_select_anon','store_branches_select_anon')
ORDER BY policyname;

-- B5. Grants de TABELA em branch_themes (procurar GRANT a anon/public —
--     20260810 concedia GRANT TO anon; fora da excecao 0f).
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_name = 'branch_themes'
ORDER BY grantee, privilege_type;


-- ============================================================
-- SECAO C — Integridade referencial (exclusao de mesa/comanda)
-- ============================================================

-- C1. Quem referencia tables e customer_sessions via FK?
--     RESULTADO ESPERADO: sales.table_id e customer_sessions.table_id -> tables;
--     sale_items.sale_id -> sales. Se DELETE de mesa com comanda ativa for
--     tentado, a FK pode falhar (23503 -> DLQ) OU a exclusao cascateia.
SELECT tc.table_name AS referencing_table,
       kcu.column_name AS referencing_column,
       ccu.table_name AS referenced_table,
       rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
JOIN information_schema.referential_constraints rc
  ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND ccu.table_name IN ('tables','customer_sessions','sales')
ORDER BY ccu.table_name, tc.table_name;

-- C2. TIPO das colunas table_id (prova do achado P0-1 — delivery 22P02):
--     sales.table_id e customer_sessions.table_id devem ser uuid.
--     O frontend envia 'delivery-<uuid>' como table_id -> 22P02 na DLQ.
SELECT table_name, column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_name IN ('sales','customer_sessions')
  AND column_name IN ('table_id','customer_session_id')
ORDER BY table_name, column_name;


-- ============================================================
-- SECAO D — Triggers vivos (regra BUG-036: producao pode ter
--           triggers/funcoes que nao estao no repo)
-- ============================================================

-- D1. Triggers nas tabelas criticas + funcao que executam.
--     RESULTADO ESPERADO: prevent_multiple_cash_sessions() deve usar LIMIT 1
--     (versao SA; a versao com MAX(uuid) foi a causa do BUG-036).
SELECT event_object_table AS tabela, trigger_name,
       action_timing || ' ' || event_manipulation AS quando,
       pg_get_functiondef(p.oid) AS funcao_do_trigger
FROM information_schema.triggers t
JOIN pg_proc p ON p.proname = t.trigger_name
LEFT JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE t.event_object_table IN
      ('tables','customer_sessions','sales','sale_items','products',
       'cash_sessions','stock_movements','pix_config','branch_themes')
ORDER BY t.event_object_table, t.trigger_name;

-- D2. CHECK PONTUAL: versao viva de prevent_multiple_cash_sessions contem MAX(uuid)?
--     RESULTADO ESPERADO: false (BUG-036 corrigido em producao em 05/09).
SELECT EXISTS (
  SELECT 1 FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'prevent_multiple_cash_sessions'
    AND pg_get_functiondef(p.oid) ~* 'max\([a-z_]*\)'
) AS trigger_antigo_com_max;


-- ============================================================
-- SECAO E — Realtime + REPLICA IDENTITY (regras 2/3 do AGENTS.md)
-- ============================================================

-- E1. Quais tabelas estao na publicacao supabase_realtime?
--     RESULTADO ESPERADO: tabelas servidas ao front (products, categories,
--     customers, suppliers, sales, sale_items, customer_sessions, tables,
--     branch_themes, media_devices, api_keys, digital_menu_config,
--     module_visibility, stock_*, financial, ...).
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;

-- E2. REPLICA IDENTITY das tabelas criticas.
--     RESULTADO ESPERADO: 'f' (FULL) nas sincronizadas; 'd' (default/PK) so onde
--     nao for preciso payload completo de UPDATE/DELETE.
SELECT c.relname, c.relreplident
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('tables','customer_sessions','sales','sale_items',
                    'products','branch_themes','pix_config','media_devices',
                    'digital_menu_config','module_visibility','stock_movements')
ORDER BY c.relname;


-- ============================================================
-- SECAO F — pix_config (achado: tabela existe, front nao conecta)
-- ============================================================

-- F1. Tabela existe? QUAL eh o RLS ativo? Esta na publicacao realtime?
SELECT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='pix_config') AS pix_config_existe;

SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE tablename = 'pix_config'
ORDER BY policyname;

SELECT EXISTS (
  SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='pix_config'
) AS pix_config_na_realtime;

-- F2. settings/settings.pixKey: tabela system_settings eh org-scoped?
--     (confirma que settings.pixKey e GLOBAL DA ORG — todas as filiais da org
--      compartilham a mesma chave no checkout atual).
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'system_settings' ORDER BY ordinal_position;


-- ============================================================
-- SECAO G — DLQ (movimentacoes_falhas): o que esta preso hoje?
-- ============================================================

-- G1. Panorama por codigo de erro (22P02 = tipo invalido = delivery table_id;
--     42501 = RLS negou escrita = closing_request / sessao sem acesso).
SELECT error_code, status, COUNT(*) AS qtd,
       MIN(created_at) AS mais_antiga, MAX(created_at) AS mais_recente
FROM movimentacoes_falhas
GROUP BY error_code, status
ORDER BY qtd DESC;

-- G2. Amostra das mensagens pendentes por prefixo (top 20) — procurar
--     'delivery-' + 22P02 e '42501' em sales/customer_sessions.
SELECT LEFT(error_message, 200) AS msg_prefix,
       table_name, COUNT(*) AS qtd
FROM movimentacoes_falhas
WHERE status = 'pending'
GROUP BY LEFT(error_message, 200), table_name
ORDER BY qtd DESC
LIMIT 20;

-- G3. DLQ acumulando nas ultimas 48h? (crescimento = algo ativo quebrando)
SELECT COUNT(*) AS pendentes_ultimas_48h
FROM movimentacoes_falhas
WHERE status = 'pending' AND created_at >= now() - interval '48 hours';


-- ============================================================
-- FIM DO CHECKLIST — nenhum dado foi alterado.
-- Copie os resultados (especialmente A2, A3, B1, B3, D1, E1, F1, G1) para
-- o relatorio da auditoria. Proximas acoes dependem destas confirmacoes.
-- ============================================================