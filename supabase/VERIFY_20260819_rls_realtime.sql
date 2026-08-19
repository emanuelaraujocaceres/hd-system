-- ═══════════════════════════════════════════════════════════════════
-- VERIFY_20260819_rls_realtime.sql — DIAGNÓSTICO 2: RLS + REALTIME
-- Auditoria total do Supabase (2026-08-19)
-- READ-ONLY: só SELECTs. Rode no SQL Editor — cada bloco é uma aba de resultado.
-- ═══════════════════════════════════════════════════════════════════

-- ── 2.1 POLICIES POR TABELA (visão completa) ───────────────────────
-- Formato: nome [CMD PERMISSIVE/restrictive] roles="..." USING:... CHECK:...
-- Regras de ouro (AGENTS.md):
--   • Toda tabela de negócio DEVE ter policies org+branch (ou org p/ tabelas org-scoped)
--   • superadmin_all_<t> (FOR ALL) = esperado para bypass
--   • USING(true)/WITH CHECK(true) fora de tabelas anônimas (cardápio) = ⚠️ VULNERABILIDADE
SELECT tablename AS tabela,
       string_agg(
         format('%s [%s %s] roles=%s USING:%s CHECK:%s',
           policyname, cmd, upper(permissive::text), roles::text,
           COALESCE(qual, '∅'), COALESCE(with_check, '∅')),
         E'\n' ORDER BY cmd, policyname
       ) AS policies
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;

-- ── 2.2 FLAG: POLICIES PERMISSIVAS (USING true / CHECK true) ───────
-- Lista TODAS as policies permissivas com a role. Só podem existir:
--   • nas tabelas anônimas do cardápio (products/categories/tables/customer_sessions/
--     sales/sale_items/stock_movements/digital_menu_config/store_branches — role=anon)
--   • audit_log_insert_system (authenticated, CHECK true — documentada)
-- Qualquer outra = precisa correção.
SELECT schemaname, tablename AS tabela, policyname, cmd, roles::text AS roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND ((qual IS NOT NULL AND qual ILIKE '%true%')
    OR (with_check IS NOT NULL AND with_check ILIKE '%true%'))
ORDER BY tablename, policyname;

-- ── 2.3 REALTIME: TABELAS NA PUBLICAÇÃO + REPLICA IDENTITY ─────────
-- Esperado: TODAS as tabelas usadas pelo frontend na publicação supabase_realtime,
-- com REPLICA IDENTITY FULL ('f'). Publish sem a tabela → CHANNEL_ERROR em loop.
-- Legenda replica_identity: f=FULL, d=default, n=nothing, i=index
SELECT c.relname AS tabela,
       p.pubname AS publicacao,
       CASE c.relreplident
         WHEN 'f' THEN 'FULL'
         WHEN 'd' THEN 'default'
         WHEN 'n' THEN 'nothing'
         WHEN 'i' THEN 'index'
         ELSE c.relreplident::text
       END AS replica_identity
FROM pg_publication p
JOIN pg_publication_rel pr ON pr.prpubid = p.oid
JOIN pg_class c ON c.oid = pr.prrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
ORDER BY c.relname;

-- ── 2.4 PRIVILÉGIOS: o que anon e authenticated PODEM acessar ──────
-- (Visão por tabela: GRANTs ativos para anon e authenticated)
SELECT c.relname AS tabela,
       (SELECT string_agg(DISTINCT privilege_type, ',') FROM information_schema.role_table_grants g
         WHERE g.table_name = c.relname AND g.grantee = 'anon') AS anon_privileges,
       (SELECT string_agg(DISTINCT privilege_type, ',') FROM information_schema.role_table_grants g
         WHERE g.table_name = c.relname AND g.grantee = 'authenticated') AS authenticated_privileges
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relname;

-- ── 2.5 FUNÇÕES: GRANT EXECUTE para anon/authenticated ─────────────
SELECT p.proname AS funcao,
       (SELECT string_agg(DISTINCT privilege_type, ',') FROM information_schema.role_routine_grants g
         WHERE g.routine_name = p.proname AND g.grantee IN ('anon','authenticated')) AS grants
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prokind = 'f'
  AND EXISTS (SELECT 1 FROM information_schema.role_routine_grants g
              WHERE g.routine_name = p.proname AND g.grantee IN ('anon','authenticated'))
ORDER BY p.proname;