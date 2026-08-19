-- =====================================================================
-- FIX 2026-08-19 (v3): FILIAIS INVISÍVEIS PARA USUÁRIO AUTENTICADO (caso Regina)
--
-- v2 falhou por 2 motivos confirmados no SQL Editor:
--   1. DEADLOCK (40P01) no DROP/CREATE POLICY: a hidratação/Realtime do app
--      aberto segura AccessShareLock em store_branches; o DDL quer lock
--      exclusivo → colisão transitória. Solução: criar policy SÓ SE FALTAR
--      (guarda em pg_policies), sem DROP, e em statement curto.
--   2. 23503 no alinhamento de IDs: a FK fk_cash_sessions_user é verificada
--      TAMBÉM no UPDATE do pai (system_users) — "chave ainda referenciada".
--      Solução: DROPA a FK, atualiza pai+cash_sessions, RECRIA a FK com a
--      definição original (pg_get_constraintdef) — tudo num único DO atômico.
--
-- Idempotente. Se o Passo 1 der deadlock e o app estiver aberto: rode de
-- novo (colisão transitória) ou feche/deslogue o app por 1 minuto.
-- =====================================================================

-- ═════════════════════════════════════════════════════════════════════
-- 1. POLICIES ORG-SCOPED DE store_branches (cria apenas as ausentes)
-- ═════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'store_branches'
      AND policyname = 'org_select_branches'
  ) THEN
    CREATE POLICY "org_select_branches" ON public.store_branches
      FOR SELECT TO authenticated
      USING (organization_id = public.get_user_org_id());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'store_branches'
      AND policyname = 'org_insert_branches'
  ) THEN
    CREATE POLICY "org_insert_branches" ON public.store_branches
      FOR INSERT TO authenticated
      WITH CHECK (organization_id = public.get_user_org_id());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'store_branches'
      AND policyname = 'org_update_branches'
  ) THEN
    CREATE POLICY "org_update_branches" ON public.store_branches
      FOR UPDATE TO authenticated
      USING (organization_id = public.get_user_org_id())
      WITH CHECK (organization_id = public.get_user_org_id());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'store_branches'
      AND policyname = 'org_delete_branches'
  ) THEN
    CREATE POLICY "org_delete_branches" ON public.store_branches
      FOR DELETE TO authenticated
      USING (organization_id = public.get_user_org_id());
  END IF;

  RAISE NOTICE '✅ Policies org-scoped de store_branches garantidas (authenticated)';
END $$;

-- ═════════════════════════════════════════════════════════════════════
-- 2. ALINHAR system_users.id → auth.users.id (funcionaria / juninho)
--    Um único DO atômico: captura+dropa FKs → atualiza pai → atualiza
--    filhos → recria FKs. Se qualquer passo falhar, nada é aplicado.
-- ═════════════════════════════════════════════════════════════════════

-- 2a. Prévia: quem está com mismatch
SELECT su.id AS old_id, au.id AS new_id, su.email
FROM system_users su
JOIN auth.users au ON au.email = su.email
WHERE su.id <> au.id;

-- 2b. FKs que referenciam system_users (o que será dropado/recriado)
SELECT tc.table_name AS tabela_filha, kcu.column_name AS coluna_fk
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND ccu.table_name = 'system_users' AND tc.table_schema = 'public';

-- 2c. ALINHAMENTO ATÔMICO (drop FK → update pai → update filhos → re-add FK)
-- Pré-requisito: temp table com as FKs que referenciam system_users
-- (SEM ON COMMIT DROP: o SQL Editor pode commitar por statement e droparia
--  a tabela na hora; o DROP explícito está no fim deste bloco).
CREATE TEMP TABLE IF NOT EXISTS _system_users_fks (
  conname TEXT, tbl TEXT, col TEXT, def TEXT
);

TRUNCATE _system_users_fks;

INSERT INTO _system_users_fks (conname, tbl, col, def)
SELECT
  c.conname,
  cl.relname AS tbl,
  kcu.column_name AS col,
  pg_get_constraintdef(c.oid) AS def
FROM pg_constraint c
JOIN pg_class cl ON cl.oid = c.conrelid
JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = 'public'
JOIN information_schema.table_constraints tc
  ON tc.constraint_name = c.conname AND tc.table_schema = n.nspname
JOIN information_schema.key_column_usage kcu
  ON kcu.constraint_name = c.conname
 AND kcu.table_schema = n.nspname
 AND kcu.table_name = cl.relname
WHERE c.contype = 'f'
  AND c.confrelid = 'system_users'::regclass;

DO $$
DECLARE
  r RECORD;
  fk RECORD;
BEGIN
  -- 1) DROPA as FKs (libera a troca de id no pai)
  FOR fk IN SELECT * FROM _system_users_fks LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', fk.tbl, fk.conname);
  END LOOP;

  -- 2) Atualiza o PAI (agora sem FK bloqueando) e depois os FILHOS
  FOR r IN
    SELECT su.id AS old_id, au.id AS new_id, su.email
    FROM system_users su
    JOIN auth.users au ON au.email = su.email
    WHERE su.id <> au.id
  LOOP
    UPDATE public.system_users SET id = r.new_id WHERE id = r.old_id;

    FOR fk IN SELECT * FROM _system_users_fks LOOP
      EXECUTE format(
        'UPDATE public.%I SET %I = $1 WHERE %I = $2 AND $1 IS DISTINCT FROM $2',
        fk.tbl, fk.col, fk.col
      ) USING r.new_id, r.old_id;
    END LOOP;

    RAISE NOTICE '✅ ID alinhado: % (% → %)', r.email, r.old_id, r.new_id;
  END LOOP;

  -- 3) RECRIA as FKs com a definição original
  FOR fk IN SELECT * FROM _system_users_fks LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = fk.conname AND conrelid = (fk.tbl)::regclass
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I %s', fk.tbl, fk.conname, fk.def);
    END IF;
  END LOOP;

  RAISE NOTICE '✅ Alinhamento concluído — % FK(s) recriada(s)',
    (SELECT COUNT(*) FROM _system_users_fks);
END $$;

DROP TABLE IF EXISTS _system_users_fks;

-- 2d. Re-checagem: tem que voltar VAZIO
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

-- Sanidade: filiais por org (Regina deve ter 1; Plantão/Consultório/Adega idem)
SELECT
  o.name AS org_nome,
  (SELECT COUNT(*) FROM store_branches sb WHERE sb.organization_id = o.id) AS filiais
FROM organizations o
ORDER BY o.created_at;