-- =====================================================================
-- HD-SYSTEM — DIAGNÓSTICO READ-ONLY (Etapas 1 + 2)
-- Autor: PawWork  |  Data: 2026-08-27
-- ---------------------------------------------------------------------
-- SOMENTE LEITURA. Não contém DDL nem DML de escrita (nenhum
-- INSERT/UPDATE/DELETE/ALTER/DROP). Execute no SQL Editor do Supabase
-- (role postgres). Cole o bloco inteiro de uma vez; cada seção vira um
-- result set (ou NOTICE, na 2C).
-- =====================================================================


-- =========================================================
-- ETAPA 1 — REALIDADE DO BANCO
-- =========================================================

-- 1) Quantidade de usuários em auth.users
SELECT count(*) AS auth_users_count FROM auth.users;

-- 2) Quantidade de usuários em system_users
SELECT count(*) AS system_users_count FROM public.system_users;

-- 3) Vinculação: system_users.id = auth.users.id
SELECT count(*) AS matched_by_id
FROM public.system_users su
JOIN auth.users au ON au.id = su.id;

-- 4) Vinculação: system_users.id != auth.users.id
SELECT count(*) AS mismatched_by_id
FROM public.system_users su
LEFT JOIN auth.users au ON au.id = su.id
WHERE au.id IS NULL;

-- 5) Dos quebrados, quantos DÃO para consertar por e-mail vs órfãos
WITH mism AS (
  SELECT su.id AS su_id, su.email AS su_email
  FROM public.system_users su
  LEFT JOIN auth.users au ON au.id = su.id
  WHERE au.id IS NULL
)
SELECT
  count(*) FILTER (WHERE EXISTS (SELECT 1 FROM auth.users a WHERE a.email = m.su_email)) AS fixable_by_email,
  count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.email = m.su_email)) AS truly_orphan
FROM mism m;

-- 6) Exemplos dos quebrados consertáveis (old id -> target auth id)
SELECT su.id AS old_system_users_id, su.email, su.name, su.organization_id,
       a.id AS target_auth_id
FROM public.system_users su
LEFT JOIN auth.users a ON a.email = su.email
WHERE NOT EXISTS (SELECT 1 FROM auth.users x WHERE x.id = su.id)
  AND a.id IS NOT NULL
ORDER BY su.email
LIMIT 100;

-- 7) Superadmin (quem é, org, branch, role, permissões)
SELECT id, email, name, organization_id, store_branch_id, role, superadmin, permissions, active
FROM public.system_users
WHERE superadmin = true;

-- 8) Funções SQL: existência + definição atual
SELECT p.proname,
       pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('get_my_profile','get_user_org_id','get_user_branch_id','is_superadmin');

-- 9) RLS — policies das 4 tabelas
SELECT schemaname, tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename IN ('system_users','organizations','store_branches','module_visibility')
ORDER BY tablename, policyname;


-- =========================================================
-- ETAPA 2 — MAPA DE DEPENDÊNCIAS
-- =========================================================

-- 10) FOREIGN KEYS formais que referenciam system_users (ou auth.users)
SELECT tc.constraint_name,
       kcu.table_name  AS referencing_table,
       kcu.column_name AS referencing_column,
       ccu.table_name  AS referenced_table,
       ccu.column_name AS referenced_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND ccu.table_name IN ('system_users','auth','users')
ORDER BY referencing_table, referencing_column;

-- 11) Referências INDIRETAS (colunas que apontam p/ usuário sem FK formal)
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name IN (
        'user_id','created_by','operator_id','cashier_id','attendant_id',
        'system_user_id','vendedor_id','responsavel_id','superadmin_id',
        'updated_by','assigned_to','seller_id'
      )
ORDER BY table_name, column_name;

-- 12) Para cada FK que aponta para system_users, conta quantas linhas
--     referenciam ids "quebrados" (system_users.id sem auth correspondente).
--     Read-only: só faz SELECT count dentro de EXECUTE.
DO $$
DECLARE
  r RECORD;
  cnt BIGINT;
BEGIN
  FOR r IN
    SELECT kcu.table_name AS tbl, kcu.column_name AS col
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND ccu.table_name = 'system_users'
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM %I WHERE %I IN (SELECT su.id FROM public.system_users su LEFT JOIN auth.users au ON au.id = su.id WHERE au.id IS NULL)',
      r.tbl, r.col
    ) INTO cnt;
    RAISE NOTICE '%-%.% => % linhas apontando para ids quebrados', r.tbl, r.col, cnt;
  END LOOP;
END $$;
