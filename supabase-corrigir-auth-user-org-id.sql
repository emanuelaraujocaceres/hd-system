-- ==============================================================================
-- CORREÇÃO: get_auth_user_org_id() com fallback por email do JWT
-- ==============================================================================
-- O problema: system_users.id e profiles.id foram gerados pelo frontend
-- (StorageService.newId()), mas auth.uid() retorna o UUID do Supabase Auth,
-- que é diferente. A função atual nunca encontra o usuário e retorna NULL,
-- fazendo com que TODAS as RLS policies bloqueiem SELECT/INSERT/UPDATE.
-- 
-- A solução: adicionar fallback por email extraído do JWT do usuário logado.
-- Como o email é único em system_users, isso resolve o mismatch de UUIDs.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.get_auth_user_org_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(
    -- 1. Tenta pelo ID (se profiles.id == auth.uid())
    (SELECT organization_id FROM profiles WHERE id = auth.uid()),
    -- 2. Tenta pelo ID em system_users
    (SELECT organization_id FROM system_users WHERE id = auth.uid()),
    -- 3. Fallback: email do JWT (resolve mismatch frontend vs Supabase Auth)
    (SELECT organization_id FROM system_users WHERE email = (auth.jwt() ->> 'email'))
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_auth_user_org_id TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_auth_user_org_id TO service_role;

-- ==============================================================================
-- Também criar profiles para os usuários existentes (para consistência futura)
-- ==============================================================================
INSERT INTO profiles (id, organization_id, name, email, role)
SELECT
  id,                          -- mantém o mesmo ID do system_users
  organization_id,
  name,
  email,
  COALESCE(role, 'admin')
FROM system_users
ON CONFLICT (id) DO NOTHING;

-- ==============================================================================
-- VERIFICAÇÃO
-- ==============================================================================
SELECT current_user AS usuario_atual,
       auth.uid() AS auth_uid,
       auth.jwt() ->> 'email' AS auth_email,
       public.get_auth_user_org_id() AS minha_org;

-- Se minha_org não for NULL, o RLS vai funcionar.
-- Se ainda for NULL, o usuário do Supabase Auth não tem email cadastrado
-- em system_users. Rode o bloco abaixo com o email correto.
