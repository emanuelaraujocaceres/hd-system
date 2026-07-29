-- ==============================================================================
-- FIX COMPLETO: Isolamento Multi-tenant
-- ==============================================================================
-- 1. get_auth_user_org_id() — fallback para system_users
-- 2. RLS policies para system_users e system_settings (self upsert)
-- ==============================================================================

-- ═══════════════════════════════════════════════════════════════════════════════
-- PARTE 1: get_auth_user_org_id com fallback
-- ═══════════════════════════════════════════════════════════════════════════════
-- Antes: só consultava profiles (novos usuários criados via servidor não têm)
-- Depois: COALESCE entre profiles e system_users
CREATE OR REPLACE FUNCTION public.get_auth_user_org_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (SELECT organization_id FROM profiles WHERE id = auth.uid()),
    (SELECT organization_id FROM system_users WHERE id = auth.uid())
  );
$$;
GRANT EXECUTE ON FUNCTION public.get_auth_user_org_id TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PARTE 2: RLS policies para self-upsert
-- ═══════════════════════════════════════════════════════════════════════════════
-- Permite cada usuário inserir/atualizar seu próprio registro em system_users
DROP POLICY IF EXISTS "RLS_system_users_self_insert" ON system_users;
CREATE POLICY "RLS_system_users_self_insert" ON system_users
  FOR INSERT WITH CHECK (id = auth.uid());
DROP POLICY IF EXISTS "RLS_system_users_self_update" ON system_users;
CREATE POLICY "RLS_system_users_self_update" ON system_users
  FOR UPDATE USING (id = auth.uid());

-- Permite cada usuário gerenciar settings da sua organização
DROP POLICY IF EXISTS "RLS_system_settings_self_insert" ON system_settings;
CREATE POLICY "RLS_system_settings_self_insert" ON system_settings
  FOR INSERT WITH CHECK (organization_id = get_auth_user_org_id());
DROP POLICY IF EXISTS "RLS_system_settings_self_update" ON system_settings;
CREATE POLICY "RLS_system_settings_self_update" ON system_settings
  FOR UPDATE USING (organization_id = get_auth_user_org_id());

-- ═══════════════════════════════════════════════════════════════════════════════
-- PARTE 3: Garantir que emanuel@gmail.com seja superadmin
-- ═══════════════════════════════════════════════════════════════════════════════
UPDATE system_users SET superadmin = TRUE WHERE email = 'emanuel@gmail.com';
