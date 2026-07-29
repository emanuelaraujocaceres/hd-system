-- ==============================================================================
-- FIX: get_auth_user_org_id() — fallback para system_users
-- ==============================================================================
-- Problema: Esta função só consultava profiles, mas novos usuários criados via
-- servidor (POST /api/admin/create-user) NÃO têm entrada em profiles — apenas
-- em system_users.
--
-- Consequência: RLS retornava NULL para novos usuários → login quebrava →
-- fallback para org errada → dados vazando entre organizações.
--
-- Solução: COALESCE entre profiles e system_users.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.get_auth_user_org_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (SELECT organization_id FROM profiles WHERE id = auth.uid()),
    (SELECT organization_id FROM system_users WHERE id = auth.uid())
  );
$$;

-- Garantir que authenticated pode executar
GRANT EXECUTE ON FUNCTION public.get_auth_user_org_id TO authenticated;
