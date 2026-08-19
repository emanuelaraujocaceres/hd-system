-- ============================================================
-- VERIFY_ALL_POLICIES.sql
-- Verificação completa de RLS + Realtime + GRANTs
-- Execute SEÇÃO POR SEÇÃO no Supabase SQL Editor.
-- Todas as seções são READ-ONLY (SELECT/RAISE NOTICE).
-- ============================================================


-- ══════════════════════════════════════════════════════════════
-- SEÇÃO 1: LISTAGEM COMPLETA DE POLICIES (por tabela)
-- ══════════════════════════════════════════════════════════════

SELECT
  tablename AS table_name,
  policyname AS policy_name,
  cmd,
  roles,
  qual AS using_expression,
  with_check AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd, policyname;


-- ══════════════════════════════════════════════════════════════
-- SEÇÃO 2: CONTAGEM DE POLICIES POR TABELA
-- ══════════════════════════════════════════════════════════════

SELECT
  tablename AS table_name,
  count(*) AS total_policies,
  count(*) FILTER (WHERE cmd = 'SELECT') AS select_policies,
  count(*) FILTER (WHERE cmd = 'INSERT') AS insert_policies,
  count(*) FILTER (WHERE cmd = 'UPDATE') AS update_policies,
  count(*) FILTER (WHERE cmd = 'DELETE') AS delete_policies,
  count(*) FILTER (WHERE cmd = 'ALL') AS all_policies
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;


-- ══════════════════════════════════════════════════════════════
-- SEÇÃO 3: SECURITY AUDIT — POLICIES COM USING (true)
-- QUALQUER policy com qual = 'true' que NÃO seja *_anon*
-- é RISCO DE SEGURANÇA
-- ══════════════════════════════════════════════════════════════

SELECT
  tablename AS table_name,
  policyname AS policy_name,
  cmd,
  qual AS using_expression,
  CASE
    WHEN policyname LIKE '%_anon%' THEN 'ALLOWED (anon cardapio)'
    ELSE '!!! SECURITY RISK — USING(true) on non-anon policy !!!'
  END AS risk_assessment
FROM pg_policies
WHERE schemaname = 'public'
  AND qual = 'true'
ORDER BY
  CASE WHEN policyname LIKE '%_anon%' THEN 1 ELSE 0 END,
  tablename, policyname;


-- ══════════════════════════════════════════════════════════════
-- SEÇÃO 4: TABELAS SEM NENHUMA POLICY
-- ══════════════════════════════════════════════════════════════

SELECT
  t.relname AS table_name,
  'NO POLICIES' AS status
FROM pg_class t
JOIN pg_namespace n ON n.oid = t.relnamespace
LEFT JOIN pg_policies p ON p.schemaname = 'public' AND p.tablename = t.relname
WHERE n.nspname = 'public'
  AND t.relkind = 'r'
  AND p.policyname IS NULL
ORDER BY t.relname;


-- ══════════════════════════════════════════════════════════════
-- SEÇÃO 5: TABELAS SÓ COM POLICY SUPERADMIN
-- (collaborators/admins não conseguem acessar)
-- ══════════════════════════════════════════════════════════════

SELECT
  p.tablename AS table_name,
  count(*) AS total_policies,
  'WARNING: only superadmin can access' AS impact
FROM pg_policies p
WHERE p.schemaname = 'public'
GROUP BY p.tablename
HAVING count(*) = count(*) FILTER (WHERE p.policyname LIKE 'superadmin_all_%')
ORDER BY p.tablename;


-- ══════════════════════════════════════════════════════════════
-- SEÇÃO 6: POLICIES ANON DO CARDÁPIO (devem existir)
-- ══════════════════════════════════════════════════════════════

WITH expected_anon AS (
  SELECT unnest(ARRAY[
    'products', 'categories', 'store_branches', 'tables',
    'customer_sessions', 'customer_sessions',
    'sales', 'sales',
    'sale_items', 'sale_items',
    'digital_menu_config'
  ]) AS table_name,
  unnest(ARRAY[
    'products_select_anon', 'categories_select_anon',
    'store_branches_select_anon', 'tables_select_anon',
    'customer_sessions_select_anon', 'customer_sessions_insert_anon',
    'sales_select_anon', 'sales_insert_anon',
    'sale_items_select_anon', 'sale_items_insert_anon',
    'digital_menu_config_select_anon'
  ]) AS expected_policy,
  unnest(ARRAY[
    'SELECT', 'SELECT', 'SELECT', 'SELECT',
    'SELECT', 'INSERT',
    'SELECT', 'INSERT',
    'SELECT', 'INSERT',
    'SELECT'
  ]) AS expected_cmd
)
SELECT
  e.table_name,
  e.expected_policy,
  e.expected_cmd,
  CASE WHEN p.policyname IS NOT NULL THEN 'OK' ELSE '!!! MISSING !!!' END AS status
FROM expected_anon e
LEFT JOIN pg_policies p ON p.schemaname = 'public'
  AND p.tablename = e.table_name AND p.policyname = e.expected_policy
ORDER BY e.table_name, e.expected_policy;


-- ══════════════════════════════════════════════════════════════
-- SEÇÃO 7: TABELAS INTERNAS NÃO DEVEM TER ACCESSO ANON
-- ══════════════════════════════════════════════════════════════

SELECT
  p.tablename AS table_name,
  p.policyname AS policy_name,
  '!!! VIOLATION: internal table has anon policy !!!' AS risk
FROM pg_policies p
WHERE p.schemaname = 'public'
  AND p.policyname LIKE '%_anon%'
  AND p.tablename IN (
    'footer_messages', 'media_devices', 'printers', 'api_keys',
    'filial_backups', 'module_visibility', 'delivery_settings',
    'delivery_neighborhoods', 'delivery_distance_rates',
    'delivery_orders', 'scanned_boletos', 'credit_payments',
    'nf_records', 'webhook_events'
  )
ORDER BY p.tablename, p.policyname;


-- ══════════════════════════════════════════════════════════════
-- SEÇÃO 8: VIEW vw_dlq_resumo — security + branch isolation
-- ══════════════════════════════════════════════════════════════

SELECT
  c.relname AS view_name,
  c.reloptions,
  CASE WHEN c.reloptions::text LIKE '%security_definer%'
    THEN '!!! DANGER: HAS security_definer !!!'
    ELSE 'OK: no security_definer'
  END AS security_status
FROM pg_class c
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE c.relkind = 'v'
  AND n.nspname = 'public'
  AND c.relname IN ('vw_dlq_resumo', 'vw_dlq_pendentes');

SELECT
  viewname,
  CASE WHEN definition LIKE '%GROUP BY%store_branch_id%'
    THEN 'OK: groups by store_branch_id'
    ELSE '!!! WARNING: does NOT group by store_branch_id !!!'
  END AS branch_isolation
FROM pg_views
WHERE schemaname = 'public'
  AND viewname IN ('vw_dlq_resumo', 'vw_dlq_pendentes');


-- ══════════════════════════════════════════════════════════════
-- SEÇÃO 9: HELPER FUNCTIONS
-- ══════════════════════════════════════════════════════════════

SELECT
  p.proname AS function_name,
  CASE WHEN p.proname IS NOT NULL THEN 'EXISTS' ELSE '!!! MISSING !!!' END AS status,
  pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname IN (
    'is_superadmin', 'get_user_org_id', 'get_user_branch_id',
    'get_user_role', 'set_current_branch'
  )
ORDER BY p.proname;

-- Check for orphan function
SELECT
  p.proname AS function_name,
  'ORPHAN: should be consolidated into get_user_org_id()' AS issue
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' AND p.proname = 'get_auth_user_org_id';


-- ══════════════════════════════════════════════════════════════
-- SEÇÃO 10: ORPHAN POLICIES (nomes fora do padrão)
-- ══════════════════════════════════════════════════════════════

SELECT
  tablename AS table_name,
  policyname AS policy_name,
  cmd,
  'ORPHAN: non-standard name' AS classification
FROM pg_policies
WHERE schemaname = 'public'
  AND NOT (
    policyname LIKE 'superadmin_all_%'
    OR policyname LIKE 'org_branch_%'
    OR policyname LIKE 'user_%'
    OR policyname LIKE '%_anon%'
    OR policyname LIKE 'org_select_%'
    OR policyname LIKE 'org_insert_%'
    OR policyname LIKE 'org_update_%'
    OR policyname LIKE 'org_delete_%'
    OR policyname LIKE 'admin_%'
    OR policyname LIKE 'collaborator_%'
  )
ORDER BY tablename, policyname;


-- ══════════════════════════════════════════════════════════════
-- SEÇÃO 11: REALTIME — tabelas na publicação sem RLS
-- ══════════════════════════════════════════════════════════════

SELECT
  pt.tablename AS table_name,
  CASE WHEN c.reloptions::text LIKE '%rowsecurity%'
    THEN 'RLS enabled' ELSE '!!! RLS NOT ENABLED !!!'
  END AS rls_status,
  CASE c.relreplident
    WHEN 'd' THEN 'default'
    WHEN 'n' THEN 'nothing'
    WHEN 'f' THEN 'FULL'
    WHEN 'i' THEN 'index'
  END AS replica_identity
FROM pg_publication_tables pt
JOIN pg_class c ON c.relname = pt.tablename
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
WHERE pt.pubname = 'supabase_realtime'
ORDER BY pt.tablename;


-- ══════════════════════════════════════════════════════════════
-- SEÇÃO 12: GRANTs TO ANON — flag internal table access
-- ══════════════════════════════════════════════════════════════

SELECT
  table_name,
  privilege_type,
  CASE
    WHEN table_name IN ('store_branches', 'products', 'categories', 'tables')
         AND privilege_type = 'SELECT'
      THEN 'OK (cardapio)'
    WHEN table_name = 'customer_sessions'
         AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE')
      THEN 'OK (cardapio)'
    WHEN table_name = 'sales'
         AND privilege_type IN ('SELECT', 'INSERT')
      THEN 'OK (cardapio)'
    WHEN table_name = 'sale_items'
         AND privilege_type IN ('SELECT', 'INSERT')
      THEN 'OK (cardapio)'
    WHEN table_name = 'digital_menu_config'
         AND privilege_type = 'SELECT'
      THEN 'OK (cardapio)'
    WHEN table_name = 'stock_movements'
         AND privilege_type = 'INSERT'
      THEN 'OK (cardapio)'
    ELSE '!!! FLAG: verify anon need for ' || table_name || '.' || privilege_type
  END AS verdict
FROM information_schema.role_table_grants
WHERE grantee = 'anon' AND table_schema = 'public'
ORDER BY table_name, privilege_type;


-- ══════════════════════════════════════════════════════════════
-- SEÇÃO 13: RESUMO FINAL
-- ══════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_total integer;
  v_using_true integer;
  v_anon_internal integer;
  v_orphan integer;
  v_superadmin_only integer;
  v_no_rls integer;
  v_sec_def_views integer;
BEGIN
  SELECT count(*) INTO v_total
  FROM pg_policies WHERE schemaname = 'public';

  SELECT count(*) INTO v_using_true
  FROM pg_policies WHERE schemaname = 'public'
    AND qual = 'true' AND policyname NOT LIKE '%_anon%';

  SELECT count(*) INTO v_anon_internal
  FROM pg_policies WHERE schemaname = 'public'
    AND policyname LIKE '%_anon%'
    AND tablename IN (
      'footer_messages', 'media_devices', 'printers', 'api_keys',
      'filial_backups', 'module_visibility', 'delivery_settings',
      'delivery_neighborhoods', 'delivery_distance_rates',
      'delivery_orders', 'scanned_boletos', 'credit_payments',
      'nf_records', 'webhook_events'
    );

  SELECT count(*) INTO v_orphan
  FROM pg_policies WHERE schemaname = 'public'
    AND NOT (
      policyname LIKE 'superadmin_all_%' OR policyname LIKE 'org_branch_%'
      OR policyname LIKE 'user_%' OR policyname LIKE '%_anon%'
      OR policyname LIKE 'org_select_%' OR policyname LIKE 'org_insert_%'
      OR policyname LIKE 'org_update_%' OR policyname LIKE 'org_delete_%'
      OR policyname LIKE 'admin_%' OR policyname LIKE 'collaborator_%'
    );

  SELECT count(*) INTO v_superadmin_only FROM (
    SELECT tablename FROM pg_policies WHERE schemaname = 'public'
    GROUP BY tablename
    HAVING count(*) = count(*) FILTER (WHERE policyname LIKE 'superadmin_all_%')
  ) sub;

  SELECT count(*) INTO v_no_rls FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = false;

  SELECT count(*) INTO v_sec_def_views FROM pg_class c
  JOIN pg_namespace n ON c.relnamespace = n.oid
  WHERE c.relkind = 'v' AND c.reloptions::text LIKE '%security_definer%';

  RAISE NOTICE '';
  RAISE NOTICE '╔══════════════════════════════════════════════════════╗';
  RAISE NOTICE '║     HD-SYSTEM RLS VERIFICATION — FINAL VERDICT      ║';
  RAISE NOTICE '╠══════════════════════════════════════════════════════╣';
  RAISE NOTICE '║ Total policies:            %', v_total;
  RAISE NOTICE '║ USING(true) non-anon:      %', v_using_true;
  RAISE NOTICE '║ Anon on internal tables:   %', v_anon_internal;
  RAISE NOTICE '║ Orphan policies:           %', v_orphan;
  RAISE NOTICE '║ Superadmin-only tables:    %', v_superadmin_only;
  RAISE NOTICE '║ Tables without RLS:        %', v_no_rls;
  RAISE NOTICE '║ Views with sec_definer:    %', v_sec_def_views;
  RAISE NOTICE '╠══════════════════════════════════════════════════════╣';

  IF v_using_true = 0 THEN
    RAISE NOTICE '║ PASS: No USING(true) security holes';
  ELSE
    RAISE NOTICE '║ FAIL: % USING(true) non-anon policies', v_using_true;
  END IF;

  IF v_anon_internal = 0 THEN
    RAISE NOTICE '║ PASS: No anon access on internal tables';
  ELSE
    RAISE NOTICE '║ FAIL: % anon policies on internal tables', v_anon_internal;
  END IF;

  IF v_orphan = 0 THEN
    RAISE NOTICE '║ PASS: All policies follow naming conventions';
  ELSE
    RAISE NOTICE '║ WARN: % orphan policy names found', v_orphan;
  END IF;

  IF v_superadmin_only = 0 THEN
    RAISE NOTICE '║ PASS: All tables have user-level access';
  ELSE
    RAISE NOTICE '║ WARN: % table(s) superadmin-only', v_superadmin_only;
  END IF;

  IF v_sec_def_views = 0 THEN
    RAISE NOTICE '║ PASS: No views with security_definer';
  ELSE
    RAISE NOTICE '║ FAIL: % view(s) with security_definer', v_sec_def_views;
  END IF;

  RAISE NOTICE '╚══════════════════════════════════════════════════════╝';
END $$;
