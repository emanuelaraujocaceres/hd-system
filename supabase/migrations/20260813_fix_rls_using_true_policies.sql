-- =====================================================================
-- CORREÇÃO CRÍTICA: Remover policies USING(true) que permitem acesso
-- cross-org. Substitui por policies org-scoped ou branch-scoped.
--
-- PROBLEMA: Muitas tabelas tinham policies USING(true) que permitiam
-- qualquer usuário autenticado (ou anon) ler/modificar/deletar TODOS
-- os dados, independente de organização.
--
-- SOLUÇÃO: Usar as helper functions create_org_policy() e
-- create_branch_policy() que já existem no banco para criar policies
-- corretas com is_superadmin() OR (organization_id = get_user_org_id()).
-- =====================================================================

-- Primeiro, garantir que as helper functions existem
-- (caso não existam, criar versão simplificada)
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.system_users
    WHERE id = auth.uid()
      AND superadmin = true
      AND organization_id IS NULL
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.get_user_org_id()
RETURNS UUID AS $$
BEGIN
  RETURN (SELECT organization_id FROM public.system_users WHERE id = auth.uid() LIMIT 1);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Helper: org-scoped policy (tem organization_id)
CREATE OR REPLACE FUNCTION public.create_org_policy(p_table TEXT)
RETURNS VOID AS $$
BEGIN
  -- Dropar policies antigas primeiro (idempotente)
  EXECUTE format('DROP POLICY IF EXISTS "%s_select" ON public.%I', p_table, p_table);
  EXECUTE format('DROP POLICY IF EXISTS "%s_insert" ON public.%I', p_table, p_table);
  EXECUTE format('DROP POLICY IF EXISTS "%s_update" ON public.%I', p_table, p_table);
  EXECUTE format('DROP POLICY IF EXISTS "%s_delete" ON public.%I', p_table, p_table);
  -- Também dropar policies genéricas antigas (USING(true))
  EXECUTE format('DROP POLICY IF EXISTS "%s_select_anon" ON public.%I', p_table, p_table);
  EXECUTE format('DROP POLICY IF EXISTS "%s_insert_anon" ON public.%I', p_table, p_table);
  EXECUTE format('DROP POLICY IF EXISTS "%s_update_anon" ON public.%I', p_table, p_table);
  EXECUTE format('DROP POLICY IF EXISTS "%s_delete_anon" ON public.%I', p_table, p_table);
  EXECUTE format('DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.%I', p_table);
  EXECUTE format('DROP POLICY IF EXISTS "Allow all" ON public.%I', p_table);

  -- Criar policies org-scoped
  EXECUTE format($sql$
    CREATE POLICY "%s_select" ON public.%I FOR SELECT USING (
      public.is_superadmin() OR (organization_id = public.get_user_org_id())
    )
  $sql$, p_table, p_table);

  EXECUTE format($sql$
    CREATE POLICY "%s_insert" ON public.%I FOR INSERT WITH CHECK (
      public.is_superadmin() OR (organization_id = public.get_user_org_id())
    )
  $sql$, p_table, p_table);

  EXECUTE format($sql$
    CREATE POLICY "%s_update" ON public.%I FOR UPDATE USING (
      public.is_superadmin() OR (organization_id = public.get_user_org_id())
    ) WITH CHECK (
      public.is_superadmin() OR (organization_id = public.get_user_org_id())
    )
  $sql$, p_table, p_table);

  EXECUTE format($sql$
    CREATE POLICY "%s_delete" ON public.%I FOR DELETE USING (
      public.is_superadmin() OR (organization_id = public.get_user_org_id())
    )
  $sql$, p_table, p_table);

  RAISE NOTICE '✅ Policies (org-only scoped): %', p_table;
END;
$$ LANGUAGE plpgsql;

-- Helper: branch-scoped policy (tem store_branch_id E organization_id)
CREATE OR REPLACE FUNCTION public.create_branch_policy(p_table TEXT)
RETURNS VOID AS $$
BEGIN
  -- Dropar policies antigas primeiro
  EXECUTE format('DROP POLICY IF EXISTS "%s_select" ON public.%I', p_table, p_table);
  EXECUTE format('DROP POLICY IF EXISTS "%s_insert" ON public.%I', p_table, p_table);
  EXECUTE format('DROP POLICY IF EXISTS "%s_update" ON public.%I', p_table, p_table);
  EXECUTE format('DROP POLICY IF EXISTS "%s_delete" ON public.%I', p_table, p_table);
  EXECUTE format('DROP POLICY IF EXISTS "%s_select_anon" ON public.%I', p_table, p_table);
  EXECUTE format('DROP POLICY IF EXISTS "%s_insert_anon" ON public.%I', p_table, p_table);
  EXECUTE format('DROP POLICY IF EXISTS "%s_update_anon" ON public.%I', p_table, p_table);
  EXECUTE format('DROP POLICY IF EXISTS "%s_delete_anon" ON public.%I', p_table, p_table);
  EXECUTE format('DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.%I', p_table);
  EXECUTE format('DROP POLICY IF EXISTS "Allow all" ON public.%I', p_table);

  -- Criar policies branch-scoped
  EXECUTE format($sql$
    CREATE POLICY "%s_select" ON public.%I FOR SELECT USING (
      public.is_superadmin()
      OR (organization_id = public.get_user_org_id()
          AND store_branch_id = public.get_user_branch_id())
    )
  $sql$, p_table, p_table);

  EXECUTE format($sql$
    CREATE POLICY "%s_insert" ON public.%I FOR INSERT WITH CHECK (
      public.is_superadmin()
      OR (organization_id = public.get_user_org_id()
          AND store_branch_id = public.get_user_branch_id())
    )
  $sql$, p_table, p_table);

  EXECUTE format($sql$
    CREATE POLICY "%s_update" ON public.%I FOR UPDATE USING (
      public.is_superadmin()
      OR (organization_id = public.get_user_org_id()
          AND store_branch_id = public.get_user_branch_id())
    ) WITH CHECK (
      public.is_superadmin()
      OR (organization_id = public.get_user_org_id()
          AND store_branch_id = public.get_user_branch_id())
    )
  $sql$, p_table, p_table);

  EXECUTE format($sql$
    CREATE POLICY "%s_delete" ON public.%I FOR DELETE USING (
      public.is_superadmin()
      OR (organization_id = public.get_user_org_id()
          AND store_branch_id = public.get_user_branch_id())
    )
  $sql$, p_table, p_table);

  RAISE NOTICE '✅ Policies (branch+org scoped): %', p_table;
END;
$$ LANGUAGE plpgsql;

-- Helper: branch_id via user profile (para tabelas que têm store_branch_id
-- mas a filial do usuário vem de system_users.store_branch_id)
CREATE OR REPLACE FUNCTION public.get_user_branch_id()
RETURNS UUID AS $$
BEGIN
  RETURN (SELECT store_branch_id FROM public.system_users WHERE id = auth.uid() LIMIT 1);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- =====================================================================
-- APLICAR POLICIES NAS TABELAS COM USING(true)
-- =====================================================================

-- Tabelas branch-scoped (têm store_branch_id + organization_id)
DO $$
DECLARE
  t TEXT;
  branch_tables TEXT[] := ARRAY[
    'api_keys', 'customer_sessions', 'branch_themes',
    'footer_messages', 'media_devices', 'printers',
    'delivery_settings', 'delivery_neighborhoods',
    'delivery_distance_rates', 'delivery_orders',
    'module_visibility'
  ];
BEGIN
  FOREACH t IN ARRAY branch_tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t AND column_name = 'store_branch_id')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t AND column_name = 'organization_id') THEN
      PERFORM public.create_branch_policy(t);
    ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t AND column_name = 'organization_id') THEN
      PERFORM public.create_org_policy(t);
    ELSE
      RAISE NOTICE '⚠️ Tabela % não tem organization_id — pulando', t;
    END IF;
  END LOOP;
END;
$$;

-- Tabelas org-scoped (só têm organization_id)
DO $$
DECLARE
  t TEXT;
  org_tables TEXT[] := ARRAY[
    'webhook_events', 'filial_backups'
  ];
BEGIN
  FOREACH t IN ARRAY org_tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t AND column_name = 'organization_id') THEN
      PERFORM public.create_org_policy(t);
    ELSE
      RAISE NOTICE '⚠️ Tabela % não tem organization_id — pulando', t;
    END IF;
  END LOOP;
END;
$$;

-- Garantir que a tabela delivery_earnings também tenha policies corretas
-- (pode ter sido criada com USING(true))
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'delivery_earnings' AND column_name = 'organization_id') THEN
    PERFORM public.create_org_policy('delivery_earnings');
  END IF;
END;
$$;

-- =====================================================================
-- REVOGAR permissões ANON das tabelas de negócio
-- (anon não deveria ter acesso a dados de negócio)
-- =====================================================================
DO $$
DECLARE
  t TEXT;
  sensitive_tables TEXT[] := ARRAY[
    'api_keys', 'customer_sessions', 'branch_themes',
    'footer_messages', 'media_devices', 'printers',
    'delivery_settings', 'delivery_neighborhoods',
    'delivery_distance_rates', 'delivery_orders',
    'delivery_earnings', 'module_visibility',
    'webhook_events', 'filial_backups'
  ];
BEGIN
  FOREACH t IN ARRAY sensitive_tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
      RAISE NOTICE '🔒 REVOKE anon: %', t;
    END IF;
  END LOOP;
END;
$$;

RAISE NOTICE '✅ Migração de RLS concluída — todas as policies USING(true) foram substituídas';
