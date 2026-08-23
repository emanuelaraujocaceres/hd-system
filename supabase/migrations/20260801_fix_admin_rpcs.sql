-- ==============================================================================
-- FIX: Substitui funções RETURNS TABLE por RETURNS JSON
-- ==============================================================================
-- Problema: O cache do PostgreSQL não atualiza a assinatura de RETURNS TABLE
-- corretamente com CREATE OR REPLACE, gerando "structure of query does not match
-- function result type".
--
-- Solução: Usar RETURNS JSON em vez de RETURNS TABLE. JSON não tem schema fixo
-- para dar mismatch, e o frontend faz o parse normalmente.
-- ==============================================================================

-- 0. DROP de TODAS as funções antigas
DROP FUNCTION IF EXISTS public.admin_add_user(UUID, UUID, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.admin_create_organization(TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.admin_list_users(UUID);
DROP FUNCTION IF EXISTS public.admin_list_branches(UUID);
DROP FUNCTION IF EXISTS public.admin_get_organization(UUID);
DROP FUNCTION IF EXISTS public.admin_list_organizations();
DROP FUNCTION IF EXISTS public.admin_fetch_organizations();
DROP FUNCTION IF EXISTS public.admin_fetch_branches(UUID);
DROP FUNCTION IF EXISTS public.admin_fetch_users(UUID);
DROP FUNCTION IF EXISTS public.get_is_superadmin();

-- ==============================================================================
-- FUNÇÕES DE LEITURA (RETORNAM JSON → imunes a type mismatch)
-- ==============================================================================

-- 1. Verificar se o usuário atual é superadmin
CREATE OR REPLACE FUNCTION public.get_is_superadmin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(superadmin, FALSE) FROM system_users WHERE id = auth.uid();
$$;

-- 2. Listar organizações (retorna JSON array)
CREATE OR REPLACE FUNCTION public.admin_fetch_organizations()
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  IF NOT get_is_superadmin() THEN RAISE EXCEPTION 'Acesso negado: apenas superadmin'; END IF;
  SELECT COALESCE(json_agg(sub), '[]'::JSON) INTO result
  FROM (
    SELECT o.id, o.name, o.created_at,
      (SELECT COUNT(*)::INTEGER FROM store_branches sb WHERE sb.organization_id = o.id) AS branch_count,
      (SELECT COUNT(*)::INTEGER FROM system_users su WHERE su.organization_id = o.id) AS user_count
    FROM organizations o
    ORDER BY o.created_at DESC
  ) sub;
  RETURN result;
END;
$$;

-- 3. Listar filiais de uma organização (retorna JSON array)
CREATE OR REPLACE FUNCTION public.admin_fetch_branches(p_org_id UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  IF NOT get_is_superadmin() THEN RAISE EXCEPTION 'Acesso negado: apenas superadmin'; END IF;
  SELECT COALESCE(json_agg(sub), '[]'::JSON) INTO result
  FROM (
    SELECT sb.id, sb.name, sb.code, sb.city, sb.state, sb.is_headquarters, sb.active
    FROM store_branches sb
    WHERE sb.organization_id = p_org_id
    ORDER BY sb.is_headquarters DESC, sb.name
  ) sub;
  RETURN result;
END;
$$;

-- 4. Listar usuários de uma organização (retorna JSON array)
CREATE OR REPLACE FUNCTION public.admin_fetch_users(p_org_id UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  IF NOT get_is_superadmin() THEN RAISE EXCEPTION 'Acesso negado: apenas superadmin'; END IF;
  SELECT COALESCE(json_agg(sub), '[]'::JSON) INTO result
  FROM (
    SELECT su.id, su.name, su.email, su.role, su.active
    FROM system_users su
    WHERE su.organization_id = p_org_id
    ORDER BY su.role, su.name
  ) sub;
  RETURN result;
END;
$$;

-- ==============================================================================
-- FUNÇÕES DE ESCRITA (mantêm RETURNS TABLE – raramente causam problema)
-- ==============================================================================

-- 5. Criar nova organização
CREATE OR REPLACE FUNCTION public.admin_create_organization(
  p_name TEXT, p_admin_email TEXT, p_admin_name TEXT
)
RETURNS TABLE(success BOOLEAN, message TEXT, org_id UUID, admin_id TEXT, password TEXT)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_org_id UUID; v_admin_id UUID; v_password TEXT; v_branch_id UUID;
BEGIN
  IF NOT get_is_superadmin() THEN
    RETURN QUERY SELECT FALSE, 'Acesso negado: apenas superadmin', NULL::UUID, NULL::TEXT, NULL::TEXT; RETURN;
  END IF;
  IF p_name IS NULL OR p_name = '' THEN
    RETURN QUERY SELECT FALSE, 'Nome da organização é obrigatório', NULL::UUID, NULL::TEXT, NULL::TEXT; RETURN;
  END IF;
  v_org_id := gen_random_uuid(); v_admin_id := gen_random_uuid();
  v_branch_id := gen_random_uuid();
  v_password := upper(substr(md5(random()::text), 1, 8));
  INSERT INTO organizations (id, name) VALUES (v_org_id, p_name);
  INSERT INTO store_branches (id, organization_id, name, code, active, is_headquarters)
  VALUES (v_branch_id, v_org_id, p_name || ' - Matriz', 'MTZ-01', TRUE, TRUE);
  INSERT INTO system_users (id, organization_id, name, email, role, active, store_branch_id)
  VALUES (v_admin_id, v_org_id, p_admin_name, p_admin_email, 'admin', TRUE, v_branch_id);
  RETURN QUERY SELECT TRUE, 'Organização criada com sucesso', v_org_id, v_admin_id::TEXT, v_password;
END;
$$;

-- 6. Adicionar usuário admin a uma organização/filial
CREATE OR REPLACE FUNCTION public.admin_add_user(
  p_org_id UUID, p_branch_id UUID, p_name TEXT, p_email TEXT, p_role TEXT DEFAULT 'admin'
)
RETURNS TABLE(success BOOLEAN, message TEXT, user_id UUID)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  IF NOT get_is_superadmin() THEN
    RETURN QUERY SELECT FALSE, 'Acesso negado: apenas superadmin', NULL::UUID; RETURN;
  END IF;
  IF p_name IS NULL OR p_email IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Nome e e-mail são obrigatórios', NULL::UUID; RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM system_users WHERE email = p_email AND organization_id = p_org_id) THEN
    RETURN QUERY SELECT FALSE, 'Já existe um usuário com este e-mail nesta organização', NULL::UUID; RETURN;
  END IF;
  v_user_id := gen_random_uuid();
  INSERT INTO system_users (id, organization_id, name, email, role, active, store_branch_id)
  VALUES (v_user_id, p_org_id, p_name, p_email, p_role, TRUE, p_branch_id);
  RETURN QUERY SELECT TRUE, 'Usuário criado com sucesso', v_user_id;
END;
$$;

-- ==============================================================================
-- PERMISSÕES
-- ==============================================================================
GRANT EXECUTE ON FUNCTION public.get_is_superadmin TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_fetch_organizations TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_fetch_branches TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_fetch_users TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_organization TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_add_user TO authenticated;
