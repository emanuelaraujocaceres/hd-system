-- ==============================================================================
-- FIX COMPLETO: Isolamento Multi-tenant
-- ==============================================================================
-- 1. get_auth_user_org_id() — fallback profiles → system_users(id) → system_users(email)
-- 2. RLS policies para system_users e system_settings (por email, não por id)
-- 3. Garantir superadmin
-- ==============================================================================

-- ═══════════════════════════════════════════════════════════════════════════════
-- PARTE 1: get_auth_user_org_id com fallback por email
-- ═══════════════════════════════════════════════════════════════════════════════
-- Antes: só profiles(id) → fallback system_users(id)
--   Problema: system_users.id podia ser UUID determinístico (frontend) ou real
--   auth.uid (servidor) — nunca batiam. get_auth_user_org_id() retornava NULL.
-- Depois: 3 tentativas — profiles(id), system_users(id), system_users(email)
CREATE OR REPLACE FUNCTION public.get_auth_user_org_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (SELECT organization_id FROM profiles WHERE id = auth.uid()),
    (SELECT organization_id FROM system_users WHERE id = auth.uid()),
    (SELECT organization_id FROM system_users WHERE email = auth.email())
  );
$$;
GRANT EXECUTE ON FUNCTION public.get_auth_user_org_id TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PARTE 2: RLS policies para self-upsert (por email, não por id)
-- ═══════════════════════════════════════════════════════════════════════════════
-- NOTA: Usamos email = auth.email() em vez de id = auth.uid() porque:
--   - O frontend gera UUIDs determinísticos (v5) para registros locais
--   - O servidor usa o UUID real do Supabase Auth para novos registros
--   - O email é o único campo consistente entre as duas fontes
DROP POLICY IF EXISTS "RLS_system_users_self_insert" ON system_users;
CREATE POLICY "RLS_system_users_self_insert" ON system_users
  FOR INSERT WITH CHECK (email = auth.email());
DROP POLICY IF EXISTS "RLS_system_users_self_update" ON system_users;
CREATE POLICY "RLS_system_users_self_update" ON system_users
  FOR UPDATE USING (email = auth.email());

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
