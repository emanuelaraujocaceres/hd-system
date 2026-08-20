-- =====================================================================
-- FIX 2026-08-19 (v2): Corrigir todas as policies faltantes/incorretas
-- Baseado nos diagnósticos:
--   1. audit_log: RLS habilitado, SEM policies → bloqueia tudo
--   2. profiles, sessions, sync_queue, user_permissions, webhook_events: sem policies
--   3. ai_insights: user_* só checa store_branch_id (sem org_id) → cross-org
--   4. company_settings: user_* só checa org_id (sem branch) → inconsistente
-- PG14-compatible: DROP IF EXISTS + CREATE (idempotente)
-- ⚠️ Feche o app desktop por ~60s antes de rodar (evita deadlock transitório)
-- =====================================================================

-- ============================================================
-- PARTE 1: Criar org_branch policies para tables sem policies
-- ============================================================
DO $$
DECLARE
  v_tables TEXT[] := ARRAY['audit_log', 'profiles', 'sessions', 'sync_queue', 'user_permissions', 'webhook_events'];
  v_t TEXT;
  v_has_org BOOLEAN;
  v_has_branch BOOLEAN;
  v_using TEXT;
  v_with_check TEXT;
  v_rls_enabled BOOLEAN;
BEGIN
  FOREACH v_t IN ARRAY v_tables LOOP
    -- Check columns + RLS status
    SELECT
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=v_t AND column_name='organization_id'),
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=v_t AND column_name='store_branch_id'),
      (SELECT relrowsecurity FROM pg_class WHERE relname=v_t AND relnamespace='public'::regnamespace)
    INTO v_has_org, v_has_branch, v_rls_enabled;

    -- Enable RLS if not enabled
    IF NOT v_rls_enabled THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_t);
      RAISE NOTICE '🔒 RLS habilitado: %', v_t;
    END IF;

    -- Skip if no scoping columns
    IF NOT v_has_org AND NOT v_has_branch THEN
      RAISE NOTICE '⚠️  % sem org/branch columns - pulando policies', v_t;
      CONTINUE;
    END IF;

    -- Determine expressions
    IF v_has_org AND v_has_branch THEN
      v_using := 'organization_id = get_user_org_id() AND store_branch_id = get_user_branch_id()';
      v_with_check := 'organization_id = get_user_org_id() AND store_branch_id = get_user_branch_id()';
    ELSIF v_has_org THEN
      v_using := 'organization_id = get_user_org_id()';
      v_with_check := 'organization_id = get_user_org_id()';
    ELSE
      v_using := 'store_branch_id = get_user_branch_id()';
      v_with_check := 'store_branch_id = get_user_branch_id()';
    END IF;

    -- Create 4 policies (idempotent)
    EXECUTE format('DROP POLICY IF EXISTS org_branch_select_%I ON public.%I', v_t, v_t);
    EXECUTE format('CREATE POLICY org_branch_select_%I ON public.%I FOR SELECT TO authenticated USING (%s)', v_t, v_t, v_using);

    EXECUTE format('DROP POLICY IF EXISTS org_branch_insert_%I ON public.%I', v_t, v_t);
    EXECUTE format('CREATE POLICY org_branch_insert_%I ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)', v_t, v_t, v_with_check);

    EXECUTE format('DROP POLICY IF EXISTS org_branch_update_%I ON public.%I', v_t, v_t);
    EXECUTE format('CREATE POLICY org_branch_update_%I ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)', v_t, v_t, v_using, v_with_check);

    EXECUTE format('DROP POLICY IF EXISTS org_branch_delete_%I ON public.%I', v_t, v_t);
    EXECUTE format('CREATE POLICY org_branch_delete_%I ON public.%I FOR DELETE TO authenticated USING (%s)', v_t, v_t, v_using);

    RAISE NOTICE '✅ Criadas 4 policies org_branch: %', v_t;
  END LOOP;
END $$;

-- ============================================================
-- PARTE 2: Corrigir ai_insights (adicionar org_id se existir)
-- ============================================================
DO $$
DECLARE
  v_has_org BOOLEAN;
  v_has_branch BOOLEAN;
BEGIN
  SELECT
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ai_insights' AND column_name='organization_id'),
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ai_insights' AND column_name='store_branch_id')
  INTO v_has_org, v_has_branch;

  IF v_has_org AND v_has_branch THEN
    EXECUTE 'DROP POLICY IF EXISTS user_select_ai_insights ON public.ai_insights';
    EXECUTE 'DROP POLICY IF EXISTS user_insert_ai_insights ON public.ai_insights';
    EXECUTE 'DROP POLICY IF EXISTS user_update_ai_insights ON public.ai_insights';
    EXECUTE 'DROP POLICY IF EXISTS user_delete_ai_insights ON public.ai_insights';

    EXECUTE 'CREATE POLICY org_branch_select_ai_insights ON public.ai_insights FOR SELECT TO authenticated USING (organization_id = get_user_org_id() AND store_branch_id = get_user_branch_id())';
    EXECUTE 'CREATE POLICY org_branch_insert_ai_insights ON public.ai_insights FOR INSERT TO authenticated WITH CHECK (organization_id = get_user_org_id() AND store_branch_id = get_user_branch_id())';
    EXECUTE 'CREATE POLICY org_branch_update_ai_insights ON public.ai_insights FOR UPDATE TO authenticated USING (organization_id = get_user_org_id() AND store_branch_id = get_user_branch_id()) WITH CHECK (organization_id = get_user_org_id() AND store_branch_id = get_user_branch_id())';
    EXECUTE 'CREATE POLICY org_branch_delete_ai_insights ON public.ai_insights FOR DELETE TO authenticated USING (organization_id = get_user_org_id() AND store_branch_id = get_user_branch_id())';
    RAISE NOTICE '✅ ai_insights: policies atualizadas com org+branch';
  ELSE
    RAISE NOTICE '⏭️  ai_insights: mantendo policies atuais (sem org_id ou branch_id)';
  END IF;
END $$;

-- ============================================================
-- PARTE 3: Corrigir company_settings (adicionar branch se existir)
-- ============================================================
DO $$
DECLARE
  v_has_org BOOLEAN;
  v_has_branch BOOLEAN;
BEGIN
  SELECT
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='company_settings' AND column_name='organization_id'),
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='company_settings' AND column_name='store_branch_id')
  INTO v_has_org, v_has_branch;

  IF v_has_org AND v_has_branch THEN
    EXECUTE 'DROP POLICY IF EXISTS user_select_company_settings ON public.company_settings';
    EXECUTE 'DROP POLICY IF EXISTS user_insert_company_settings ON public.company_settings';
    EXECUTE 'DROP POLICY IF EXISTS user_update_company_settings ON public.company_settings';
    EXECUTE 'DROP POLICY IF EXISTS user_delete_company_settings ON public.company_settings';

    EXECUTE 'CREATE POLICY org_branch_select_company_settings ON public.company_settings FOR SELECT TO authenticated USING (organization_id = get_user_org_id() AND store_branch_id = get_user_branch_id())';
    EXECUTE 'CREATE POLICY org_branch_insert_company_settings ON public.company_settings FOR INSERT TO authenticated WITH CHECK (organization_id = get_user_org_id() AND store_branch_id = get_user_branch_id())';
    EXECUTE 'CREATE POLICY org_branch_update_company_settings ON public.company_settings FOR UPDATE TO authenticated USING (organization_id = get_user_org_id() AND store_branch_id = get_user_branch_id()) WITH CHECK (organization_id = get_user_org_id() AND store_branch_id = get_user_branch_id())';
    EXECUTE 'CREATE POLICY org_branch_delete_company_settings ON public.company_settings FOR DELETE TO authenticated USING (organization_id = get_user_org_id() AND store_branch_id = get_user_branch_id())';
    RAISE NOTICE '✅ company_settings: policies atualizadas com org+branch';
  ELSE
    RAISE NOTICE '⏭️  company_settings: mantendo policies atuais (sem org_id ou branch_id)';
  END IF;
END $$;

-- ============================================================
-- PARTE 4: Verificação final
-- ============================================================
SELECT COUNT(DISTINCT tablename) AS tables_com_org_branch
FROM pg_policies
WHERE schemaname='public'
  AND qual LIKE '%organization_id%'
  AND qual LIKE '%store_branch_id%';

-- Tabelas que AINDA têm RLS habilitado mas sem policies
SELECT c.relname AS tabela_rls_sem_policies
FROM pg_class c
WHERE c.relnamespace = 'public'::regnamespace
  AND c.relkind = 'r'
  AND c.relrowsecurity = true
  AND NOT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname = 'public' AND p.tablename = c.relname
  )
ORDER BY c.relname;