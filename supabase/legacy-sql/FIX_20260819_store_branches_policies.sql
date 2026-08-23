-- =====================================================================
-- FIX 2026-08-19 (v4): FILIAIS INVISÍVEIS PARA USUÁRIO AUTENTICADO (caso Regina)
--
-- v3 falhou porque o DB é **PostgreSQL 14** (Supabase plan antigo) e não
-- suporta `CREATE POLICY IF NOT EXISTS` / `ADD CONSTRAINT IF NOT EXISTS`
-- (ambos PG15+) → 42601 syntax error. v3 usava SQL plano (sem DO/$$) que é
-- split-safe, mas a sintaxe IF NOT EXISTS é incompatível com PG14.
--
-- v4: PG14-compatible. Idempotência via DROP IF EXISTS + re-CREATE
-- (sem DO $$ — o SQL Editor faz split no ';' e não entende $$ quoting;
-- blocos DO com semicolons internos sempre quebram — usar apenas SQL plano).
--
-- ⚠️ Se o app desktop estiver aberto, o DROP POLICY pode dar deadlock
-- transitório (40P01) contra os SELECT da hidratação/Realtime. Feche o app
-- por ~60s antes de rodar, ou rode de novo (colisão é transienta).
-- =====================================================================

-- 1. POLICIES ORG-SCOPED DE store_branches (idempotente: drop+recreate)
--    PG14-compatible (sem IF NOT EXISTS em CREATE POLICY).
DROP POLICY IF EXISTS "org_select_branches"  ON public.store_branches;
CREATE POLICY "org_select_branches"  ON public.store_branches
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_org_id());

DROP POLICY IF EXISTS "org_insert_branches"  ON public.store_branches;
CREATE POLICY "org_insert_branches"  ON public.store_branches
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_org_id());

DROP POLICY IF EXISTS "org_update_branches"  ON public.store_branches;
CREATE POLICY "org_update_branches"  ON public.store_branches
  FOR UPDATE TO authenticated
  USING (organization_id = public.get_user_org_id())
  WITH CHECK (organization_id = public.get_user_org_id());

DROP POLICY IF EXISTS "org_delete_branches"  ON public.store_branches;
CREATE POLICY "org_delete_branches"  ON public.store_branches
  FOR DELETE TO authenticated
  USING (organization_id = public.get_user_org_id());

-- 2. ALINHAR system_users.id → auth.users.id (funcionaria / juninho)
--    A FK fk_cash_sessions_user é verificada também no UPDATE do pai
--    (23503 "chave ainda referenciada"). Solução atômica via transação
--    plana: DROP FK → UPDATE pai → UPDATE filho → re-ADD FK (== original).
--    Hardcoded (estado atual): 1 FK + 2 usuários. Re-executável/idempotente.

-- 2a. Prévia: quem está com mismatch (antes do 2c, para comparar)
SELECT su.id AS old_id, au.id AS new_id, su.email
FROM public.system_users su
JOIN auth.users au ON au.email = su.email
WHERE su.id <> au.id;

-- 2b. FKs que referenciam system_users (confirma o que será dropado/recriado)
SELECT tc.table_name AS tabela_filha, kcu.column_name AS coluna_fk
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND ccu.table_name = 'system_users' AND tc.table_schema = 'public';

-- 2c. Alinhamento atômico (transação plana — split-safe, PG14-compatible)
--     FK original: fk_cash_sessions_user → (user_id) REFERENCES public.system_users(id)
BEGIN;
  ALTER TABLE public.cash_sessions
    DROP CONSTRAINT IF EXISTS fk_cash_sessions_user;

  UPDATE public.system_users
    SET id = 'd341889d-306f-458f-8f24-f31a0b48d5ce'
   WHERE id = '4a10086a-ddf1-44c3-9939-9f52d818bb53';        -- juninho@gmail.com

  UPDATE public.cash_sessions
    SET user_id = 'd341889d-306f-458f-8f24-f31a0b48d5ce'
   WHERE user_id = '4a10086a-ddf1-44c3-9939-9f52d818bb53';

  UPDATE public.system_users
    SET id = '1ae4276c-f34e-45e9-9c5e-f999b1b205c6'
   WHERE id = '9071d153-47fe-4f1a-bdf1-33ebad9dfeee';        -- funcionaria@gmail.com

  UPDATE public.cash_sessions
    SET user_id = '1ae4276c-f34e-45e9-9c5e-f999b1b205c6'
   WHERE user_id = '9071d153-47fe-4f1a-bdf1-33ebad9dfeee';

  ALTER TABLE public.cash_sessions
    ADD CONSTRAINT fk_cash_sessions_user
    FOREIGN KEY (user_id) REFERENCES public.system_users (id);
COMMIT;

-- 2d. Re-checagem: tem que voltar VAZIO (0 linhas = alinhado)
SELECT su.id, su.email, au.id AS auth_id
FROM public.system_users su
JOIN auth.users au ON au.email = su.email
WHERE su.id <> au.id;

-- 3. VERIFICAÇÃO FINAL: policies + filiais por org
SELECT policyname, cmd, roles, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'store_branches'
ORDER BY policyname;

SELECT
  o.name AS org_nome,
  (SELECT COUNT(*) FROM public.store_branches sb WHERE sb.organization_id = o.id) AS filiais
FROM public.organizations o
ORDER BY o.created_at;
