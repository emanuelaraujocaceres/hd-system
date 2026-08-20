-- =====================================================================
-- AUDITORIA COMPLETA HD-SYSTEM (Supabase)
-- Executar no SQL Editor. Cada bloco é um SELECT independente.
-- Objetivo: confirmar se o banco está 100% correto após o endurecimento
-- de RLS/realtime e a limpeza de órfãos.
--
-- Como ler: cada seção tem um cabeçalho "ESPERADO:" indicando o resultado
-- correto. Qualquer linha fora do esperado = pendência.
-- =====================================================================


-- =====================================================================
-- PARTE 1 — CONSISTÊNCIA DE USUÁRIOS (system_users <-> auth.users)
-- Mostra todos os usuários e se têm conta Auth + senha (para login real).
-- ESPERADO: nenhum "❌ SEM CONTA AUTH" exceto os 2 órfãos que vamos deletar.
-- =====================================================================
SELECT
  su.email,
  su.id AS system_user_id,
  au.id AS auth_user_id,
  CASE
    WHEN au.id IS NULL THEN 'SEM CONTA AUTH (orfan)'
    WHEN su.id <> au.id THEN 'ID DIVERGENTE'
    WHEN au.encrypted_password IS NULL OR au.encrypted_password = '' THEN 'AUTH SEM SENHA (login local only)'
    ELSE 'OK (auth + senha + id ok)'
  END AS status_auth,
  su.superadmin,
  su.active,
  (su.organization_id IS NOT NULL) AS tem_org,
  au.last_sign_in_at
FROM system_users su
LEFT JOIN auth.users au ON au.id = su.id
ORDER BY (au.id IS NULL), su.email;


-- =====================================================================
-- PARTE 2 — DESCOBERTA DINÂMICA DE FKs -> system_users
-- Lista TODAS as tabelas/colunas que referenciam system_users.id.
-- (Usado para saber o que bloqueia a deleção de órfãos.)
-- ESPEARADO: pelo menos sales.user_id, cash_sessions.user_id,
--            delivery_worker_earnings.worker_id.
-- =====================================================================
SELECT
  tc.table_name  AS tabela_filha,
  kcu.column_name AS coluna_fk,
  ccu.table_name AS tabela_pai
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND ccu.table_name = 'system_users'
ORDER BY tc.table_name;


-- =====================================================================
-- PARTE 3 — DEPENDÊNCIAS DOS 2 ÓRFÃOS (junior / juninho)
-- Conta registros que apontam para os IDs órfãos nas tabelas filhas
-- conhecidas (colunas verificadas no SUPABASE_SCHEMA.md).
-- ESPERADO: todas as contagens = 0 → seguro deletar.
-- (Se alguma > 0, NÃO delete — reatribua primeiro. A lista completa de
--  FKs está na PARTE 2; se houver outra tabela lá, conte-a manualmente.)
-- =====================================================================
SELECT 'sales' AS tabela, COUNT(*) AS refs_orphan
FROM sales WHERE user_id IN ('d341889d-306f-458f-8f24-f31a0b48d5ce','5a6aedfa-d206-45d5-a885-6cb4eefdb535')
UNION ALL
SELECT 'cash_sessions', COUNT(*) FROM cash_sessions WHERE user_id IN ('d341889d-306f-458f-8f24-f31a0b48d5ce','5a6aedfa-d206-45d5-a885-6cb4eefdb535')
UNION ALL
SELECT 'delivery_worker_earnings', COUNT(*) FROM delivery_worker_earnings WHERE worker_id IN ('d341889d-306f-458f-8f24-f31a0b48d5ce','5a6aedfa-d206-45d5-a885-6cb4eefdb535');


-- =====================================================================
-- PARTE 4 — RLS HABILITADO EM TODAS AS TABELAS
-- ESPERADO: relrowsecurity = true para TODAS as tabelas public.
-- Qualquer 'f' (false) = tabela sem RLS = vazamento.
-- =====================================================================
SELECT c.relname AS tabela,
       CASE WHEN c.relrowsecurity THEN 'SIM' ELSE 'NAO (RISCO)' END AS rls_habilitado
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY rls_habilitado, c.relname;


-- =====================================================================
-- PARTE 5 — TABELAS COM RLS MAS SEM POLICIES (bloqueiam tudo)
-- ESPERADO: 0 linhas. Se aparecer, a tabela tem RLS on mas nenhuma
-- policy → ninguém consegue ler/escrever (bug de "lista vazia").
-- =====================================================================
SELECT c.relname AS tabela_rls_sem_policy
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
  AND c.relrowsecurity = true
  AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.tablename = c.relname)
ORDER BY c.relname;


-- =====================================================================
-- PARTE 6 — POLICIES PERMISSIVAS (USING (true)) — VULNERABILIDADE
-- ESPERADO: 0 linhas. USING (true) permite acesso cross-org/cross-branch.
-- (Exceção documentada: cardápio anon NÃO usa USING(true) — usa SECURITY
--  DEFINER nas RPCs. Se aparecer aqui, é bug.)
-- =====================================================================
SELECT schemaname, tablename, policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND qual IS NOT NULL
  AND qual::text = 'true'
ORDER BY tablename, policyname;


-- =====================================================================
-- PARTE 7 — REALTIME: REPLICA IDENTITY + PUBLICAÇÃO
-- ESPERADO: para as tabelas do sync (sales, cash_sessions, products,
-- customers, etc. — as 40 conhecidas), replica_identity = 'f' (full)
-- E na_realtime = 1.
-- 'd' (default) sem realtime = UPDATE/DELETE sem payload completo ou
-- canal rejeitado (CHANNEL_ERROR em loop).
-- =====================================================================
SELECT c.relname AS tabela,
       CASE c.relreplident
         WHEN 'd' THEN 'default'
         WHEN 'f' THEN 'full'
         WHEN 'n' THEN 'nothing'
         WHEN 'i' THEN 'index'
         ELSE c.relreplident::text
       END AS replica_identity,
       (SELECT COUNT(*) FROM pg_publication_tables pt
          WHERE pt.tablename = c.relname AND pt.pubname = 'supabase_realtime') AS na_realtime
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relname;


-- =====================================================================
-- PARTE 8 — GRANTS DE RPC (anon / authenticated / service_role / public)
-- Mostra a ACL de EXECUTE de cada função.
-- REGRA (AGENTS.md regra 9):
--   - RPCs de escrita: SÓ authenticated + service_role. NUNCA public/anon.
--   - EXCEÇÃO cardápio: process_sale_transaction, fn_insserir_dlq MANTÊM
--     anon (são as únicas vias de escrita do cardápio).
--   - fn_update_updated_at, fn_validate_store_branch_id: anon OK (helpers).
-- ESPERADO: nenhuma função com "public=" (grant PUBLIC).
-- =====================================================================
SELECT p.proname AS funcao,
       pg_get_userbyid(p.proowner) AS owner,
       CASE WHEN p.proacl IS NULL THEN '{dono only}' ELSE p.proacl::text END AS acl_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND (p.proname LIKE 'admin_%'
       OR p.proname IN (
            'process_sale_transaction','fn_insserir_dlq','fn_update_updated_at',
            'fn_validate_store_branch_id','get_my_profile','get_user_org_id',
            'is_superadmin','get_user_branch_id','get_user_role'
         ))
ORDER BY p.proname;


-- =====================================================================
-- PARTE 9 — VERIFICAÇÃO DAS 4 EXCEÇÕES ANON (cardápio)
-- ESPERADO:
--   process_sale_transaction, fn_insserir_dlq        → anon = TRUE  (exceção)
--   fn_update_updated_at, fn_validate_store_branch_id → anon = TRUE  (helpers)
--   NENHUMA das 4                                     → public = FALSE
-- =====================================================================
SELECT p.proname AS funcao,
       (p.proacl::text LIKE '%anon=%')        AS anon_tem_exec,
       (p.proacl::text LIKE '%authenticated=%') AS auth_tem_exec,
       (p.proacl::text LIKE '%service_role=%')  AS svc_tem_exec,
       (p.proacl::text LIKE '%public=%')        AS public_tem_exec  -- deve ser FALSE
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
        'process_sale_transaction','fn_insserir_dlq',
        'fn_update_updated_at','fn_validate_store_branch_id'
      )
ORDER BY p.proname;


-- =====================================================================
-- RESUMO FINAL
-- =====================================================================
SELECT
  (SELECT COUNT(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity) AS tabelas_sem_rls,
  (SELECT COUNT(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity
       AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.tablename=c.relname)) AS tabelas_rls_sem_policy,
  (SELECT COUNT(*) FROM pg_policies WHERE schemaname='public' AND qual::text='true') AS policies_permissivas,
  (SELECT COUNT(*) FROM system_users su LEFT JOIN auth.users au ON au.id=su.id
     WHERE au.id IS NULL) AS orfaos_sem_auth;
