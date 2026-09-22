-- ==============================================================================
-- REPAIR: RLS policies para system_users e system_settings
-- Origem: 20260801000005_fix_rls_system_users.sql (skipada por DROP POLICY sem ON tabela)
-- ==============================================================================

-- system_users: permitir que o próprio usuário gerencie seu registro
DROP POLICY IF EXISTS "RLS_system_users_self_insert" ON public.system_users;
CREATE POLICY "RLS_system_users_self_insert" ON public.system_users
  FOR INSERT WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "RLS_system_users_self_update" ON public.system_users;
CREATE POLICY "RLS_system_users_self_update" ON public.system_users
  FOR UPDATE USING (id = auth.uid());

-- system_settings: permitir que o próprio usuário gerencie settings da sua org
DROP POLICY IF EXISTS "RLS_system_settings_self_insert" ON public.system_settings;
CREATE POLICY "RLS_system_settings_self_insert" ON public.system_settings
  FOR INSERT WITH CHECK (organization_id = get_auth_user_org_id());

DROP POLICY IF EXISTS "RLS_system_settings_self_update" ON public.system_settings;
CREATE POLICY "RLS_system_settings_self_update" ON public.system_settings
  FOR UPDATE USING (organization_id = get_auth_user_org_id());
