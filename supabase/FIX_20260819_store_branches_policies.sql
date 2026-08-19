-- =====================================================================
-- FIX 2026-08-19: FILIAIS INVISÍVEIS PARA USUÁRIO AUTENTICADO (caso Regina)
--
-- CAUSA RAIZ (confirmada por DIAG_20260819_regina_branch.sql, seção C):
-- a policy org-scoped de store_branches NÃO EXISTE mais no banco — restaram
-- apenas 'store_branches_select_anon' (role anon, USING(true) — exceção
-- documentada do cardápio) e 'superadmin_all_branches' (is_superadmin()).
-- Consequência: SELECT em store_branches com JWT de usuário comum
-- (authenticated) retorna 0 linhas → a hidratação não encontra filiais da
-- org → usuário (não-superadmin) vê ZERO filiais. A org default (Adega)
-- "funcionava" porque o prune da hidratação é pulado quando o fetch volta
-- vazio (INITIAL_BRANCHES sobrevive localmente) — por isso só orgs
-- não-default (Salgados da Regina, Plantão, Consultório, Adega 2) sofrem.
--
-- PARTE 2: funcionaria@gmail.com e juninho@gmail.com têm system_users.id
-- DIFERENTE do auth.users.id (fluxo SQL antigo que gerava UUID aleatório
-- sem criar conta Auth). auth.uid() não acha a linha → get_user_org_id()
-- NULL → não veem dados E o login Supabase (get_my_profile) falha fechado.
-- Alinha os IDs (cuidando de FKs que referenciam system_users).
--
-- Idempotente. Rode depois de DIAG_20260819_regina_branch.sql.
-- =====================================================================

-- ═════════════════════════════════════════════════════════════════════
-- 1. RECRIAR POLICIES ORG-SCOPED DE store_branches (paridade RLS_FIXES)
--    Sem o guard "NOT is_superadmin()": RLS faz OR entre policies e o
--    superadmin já é coberto por superadmin_all_branches (FOR ALL).
-- ═════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "org_select_branches" ON public.store_branches;
DROP POLICY IF EXISTS "org_insert_branches" ON public.store_branches;
DROP POLICY IF EXISTS "org_update_branches" ON public.store_branches;
DROP POLICY IF EXISTS "org_delete_branches" ON public.store_branches;

CREATE POLICY "org_select_branches" ON public.store_branches
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_org_id());

CREATE POLICY "org_insert_branches" ON public.store_branches
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_org_id());

CREATE POLICY "org_update_branches" ON public.store_branches
  FOR UPDATE TO authenticated
  USING (organization_id = public.get_user_org_id())
  WITH CHECK (organization_id = public.get_user_org_id());

CREATE POLICY "org_delete_branches" ON public.store_branches
  FOR DELETE TO authenticated
  USING (organization_id = public.get_user_org_id());

DO $$ BEGIN
  RAISE NOTICE '✅ Policies org-scoped de store_branches recriadas (authenticated)';
END $$;

-- ═════════════════════════════════════════════════════════════════════
-- 2. ALINHAR system_users.id → auth.users.id (mismatch de identidade)
--    Verifica FKs que referenciam system_users(id) e atualiza também.
-- ═════════════════════════════════════════════════════════════════════

-- 2a. Mostrar quem está com mismatch (pré-alinhamento)
SELECT su.id AS old_id, au.id AS new_id, su.email
FROM system_users su
JOIN auth.users au ON au.email = su.email
WHERE su.id <> au.id;

-- 2b. Quais FKs referenciam system_users (para atualizar dependentes)
SELECT
  tc.table_name AS tabela_filha,
  kcu.column_name AS coluna_fk,
  ccu.table_name AS tabela_pai
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND ccu.table_name = 'system_users' AND tc.table_schema = 'public';

-- 2c. Alinhamento: para cada mismatch, atualiza as FKs de dependentes
--     e depois o próprio system_users.id (dentro de transação única —
--     no SQL Editor cada bloco DO acima roda separado; rode TUDO junto).
DO $$
DECLARE
  r RECORD;
  fk RECORD;
  v_depend INTEGER;
BEGIN
  FOR r IN
    SELECT su.id AS old_id, au.id AS new_id, su.email
    FROM system_users su
    JOIN auth.users au ON au.email = su.email
    WHERE su.id <> au.id
  LOOP
    -- Atualizar dependentes (FKs para system_users.id)
    FOR fk IN
      SELECT tc.table_name, kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND ccu.table_name = 'system_users' AND tc.table_schema = 'public'
    LOOP
      EXECUTE format(
        'UPDATE public.%I SET %I = $1 WHERE %I = $2 AND $1 IS DISTINCT FROM $2',
        fk.table_name, fk.column_name, fk.column_name
      ) USING r.new_id, r.old_id;
    END LOOP;

    -- Dependências pendentes no PRÓPRIO system_users (auto-FK, ex.: criado_por)
    EXECUTE 'UPDATE public.system_users SET id = $1 WHERE id = $2'
      USING r.new_id, r.old_id;
    RAISE NOTICE '✅ ID alinhado: % (% → %)', r.email, r.old_id, r.new_id;
  END LOOP;
END $$;

-- 2d. Re-checagem: não deve sobrar mismatch
SELECT su.id, su.email, au.id AS auth_id
FROM system_users su
JOIN auth.users au ON au.email = su.email
WHERE su.id <> au.id;

-- ═════════════════════════════════════════════════════════════════════
-- 3. VERIFICAÇÃO FINAL
-- ═════════════════════════════════════════════════════════════════════
SELECT policyname, cmd, roles, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'store_branches'
ORDER BY policyname;

-- Sanidade: quantas filiais cada org tem (Regina deve ter 1)
SELECT
  o.name AS org_nome,
  (SELECT COUNT(*) FROM store_branches sb WHERE sb.organization_id = o.id) AS filiais
FROM organizations o
ORDER BY o.created_at;