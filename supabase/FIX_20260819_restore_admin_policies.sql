-- ============================================================
-- FIX_20260819_restore_admin_policies.sql
-- Corrige policies admin/collaborator dropadas por engano
-- durante a limpeza de 2026-08-19.
-- Execute no Supabase SQL Editor.
-- ============================================================


-- ══════════════════════════════════════════════════════════════
-- 1. system_users — restaurar policies admin + collaborator
-- ══════════════════════════════════════════════════════════════

-- Admin pode ler todos os usuários da sua organização
DROP POLICY IF EXISTS "admin_select_org_users" ON public.system_users;
CREATE POLICY "admin_select_org_users" ON public.system_users
  FOR SELECT
  USING (organization_id = get_user_org_id());

-- Admin pode criar usuários na sua organização
DROP POLICY IF EXISTS "admin_insert_org_users" ON public.system_users;
CREATE POLICY "admin_insert_org_users" ON public.system_users
  FOR INSERT
  WITH CHECK (organization_id = get_user_org_id());

-- Admin pode atualizar usuários da sua organização
DROP POLICY IF EXISTS "admin_update_org_users" ON public.system_users;
CREATE POLICY "admin_update_org_users" ON public.system_users
  FOR UPDATE
  USING (organization_id = get_user_org_id())
  WITH CHECK (organization_id = get_user_org_id());

-- Admin pode deletar usuários da sua organização
DROP POLICY IF EXISTS "admin_delete_org_users" ON public.system_users;
CREATE POLICY "admin_delete_org_users" ON public.system_users
  FOR DELETE
  USING (organization_id = get_user_org_id());

-- Collaborator pode ler apenas a si mesmo
DROP POLICY IF EXISTS "collaborator_select_self" ON public.system_users;
CREATE POLICY "collaborator_select_self" ON public.system_users
  FOR SELECT
  USING (id = auth.uid());

-- Collaborator pode atualizar apenas a si mesmo (nome, senha)
DROP POLICY IF EXISTS "collaborator_update_self" ON public.system_users;
CREATE POLICY "collaborator_update_self" ON public.system_users
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());


-- ══════════════════════════════════════════════════════════════
-- 2. organizations — restaurar policy admin read
-- ══════════════════════════════════════════════════════════════

-- Admin pode ler sua própria organização
DROP POLICY IF EXISTS "admin_select_own_organization" ON public.organizations;
CREATE POLICY "admin_select_own_organization" ON public.organizations
  FOR SELECT
  USING (id = get_user_org_id());

-- Admin pode atualizar sua própria organização
DROP POLICY IF EXISTS "admin_update_own_organization" ON public.organizations;
CREATE POLICY "admin_update_own_organization" ON public.organizations
  FOR UPDATE
  USING (id = get_user_org_id())
  WITH CHECK (id = get_user_org_id());


-- ══════════════════════════════════════════════════════════════
-- 3. system_settings — restaurar policy admin read
-- ══════════════════════════════════════════════════════════════

-- Admin pode ler configurações da sua organização
DROP POLICY IF EXISTS "admin_select_org_settings" ON public.system_settings;
CREATE POLICY "admin_select_org_settings" ON public.system_settings
  FOR SELECT
  USING (organization_id = get_user_org_id());

-- Admin pode atualizar configurações da sua organização
DROP POLICY IF EXISTS "admin_update_org_settings" ON public.system_settings;
CREATE POLICY "admin_update_org_settings" ON public.system_settings
  FOR UPDATE
  USING (organization_id = get_user_org_id())
  WITH CHECK (organization_id = get_user_org_id());


-- ══════════════════════════════════════════════════════════════
-- 4. profiles — restaurar policy self read (já existia)
-- ══════════════════════════════════════════════════════════════

-- User pode ler seu próprio profile
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT
  USING (id = auth.uid());

-- User pode atualizar seu próprio profile
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());


-- ══════════════════════════════════════════════════════════════
-- 5. vw_dlq_pendentes — adicionar store_branch_id
-- ══════════════════════════════════════════════════════════════

DROP VIEW IF EXISTS public.vw_dlq_pendentes;

CREATE OR REPLACE VIEW public.vw_dlq_pendentes AS
SELECT
    id,
    organization_id,
    store_branch_id,
    operation_type,
    table_name,
    record_id,
    error_message,
    error_status,
    retry_count,
    max_retries,
    next_retry_at,
    created_at,
    source,
    user_email
FROM movimentacoes_falhas
WHERE status = 'pending'
  AND (next_retry_at IS NULL OR next_retry_at <= NOW())
ORDER BY created_at ASC;


-- ══════════════════════════════════════════════════════════════
-- 6. Limpar função órfã get_auth_user_org_id()
-- ══════════════════════════════════════════════════════════════

-- Verificar se alguma função (exceto ela mesma) referencia get_auth_user_org_id
-- Simplificado para evitar erro de array_agg em versões específicas do PG
DO $$
DECLARE
  v_refs integer;
BEGIN
  SELECT count(*) INTO v_refs
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname != 'get_auth_user_org_id';

  IF v_refs > 0 THEN
    -- Verifica se alguma dessas referenciam a função
    RAISE NOTICE 'AVISO: Existem % funções públicas — verifique manualmente se alguma referencia get_auth_user_org_id antes de dropar', v_refs;
  END IF;

  -- Dropar com segurança (DROP IF EXISTS não falha)
  DROP FUNCTION IF EXISTS public.get_auth_user_org_id();
  RAISE NOTICE 'OK: get_auth_user_org_id() removida (ou não existia)';
END $$;


-- ══════════════════════════════════════════════════════════════
-- 7. Dropar collab_branch_settings duplicada
-- ══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "collab_branch_settings" ON public.system_settings;


-- ══════════════════════════════════════════════════════════════
-- 8. VERIFICAÇÃO FINAL
-- ══════════════════════════════════════════════════════════════

DO $$
DECLARE
  r RECORD;
  v_total integer;
  v_superadmin_only integer;
BEGIN
  -- Contar policies por tabela
  RAISE NOTICE '';
  RAISE NOTICE '╔══════════════════════════════════════════════════════╗';
  RAISE NOTICE '║     VERIFICAÇÃO PÓS-CORREÇÃO                       ║';
  RAISE NOTICE '╠══════════════════════════════════════════════════════╣';

  -- system_users
  SELECT count(*) INTO v_total FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'system_users';
  RAISE NOTICE '║ system_users:       % policies', v_total;

  -- organizations
  SELECT count(*) INTO v_total FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'organizations';
  RAISE NOTICE '║ organizations:      % policies', v_total;

  -- system_settings
  SELECT count(*) INTO v_total FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'system_settings';
  RAISE NOTICE '║ system_settings:    % policies', v_total;

  -- profiles
  SELECT count(*) INTO v_total FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'profiles';
  RAISE NOTICE '║ profiles:           % policies', v_total;

  -- Tabelas superadmin-only (todas as policies começam com superadmin_all_)
  SELECT count(*) INTO v_superadmin_only FROM (
    SELECT tablename,
           count(*) AS total,
           count(CASE WHEN policyname LIKE 'superadmin_all_%' THEN 1 END) AS sa_count
    FROM pg_policies WHERE schemaname = 'public'
    GROUP BY tablename
    HAVING count(*) = count(CASE WHEN policyname LIKE 'superadmin_all_%' THEN 1 END)
  ) sub;

  RAISE NOTICE '║                                             ║';
  RAISE NOTICE '║ Tabelas superadmin-only:  %', v_superadmin_only;

  IF v_superadmin_only <= 2 THEN
    RAISE NOTICE '║ PASS: Apenas sync_queue + webhook_events (correto)';
  ELSE
    RAISE NOTICE '║ WARN: % tabelas ainda são superadmin-only', v_superadmin_only;
  END IF;

  RAISE NOTICE '╚══════════════════════════════════════════════════════╝';
END $$;
