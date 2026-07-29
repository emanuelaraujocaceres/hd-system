-- ==============================================================================
-- SUPERADMIN + RPCs DE GESTÃO DE ORGANIZAÇÕES
-- ==============================================================================
-- NOTA: Não mexemos na tabela `profiles` porque ela tem triggers e constraints
-- que causam erro. Usamos apenas `system_users` para a flag superadmin.
-- ==============================================================================

-- 0. Garantir extensão pgcrypto
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Adicionar coluna superadmin APENAS em system_users
ALTER TABLE system_users ADD COLUMN IF NOT EXISTS superadmin BOOLEAN DEFAULT FALSE;

-- 2. Função para verificar se o usuário atual é superadmin
--    Verifica APENAS system_users (profiles tem triggers problemáticos)
CREATE OR REPLACE FUNCTION public.get_is_superadmin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(superadmin, FALSE) FROM system_users WHERE id = auth.uid();
$$;

-- 3. RPC: Listar todas as organizações
CREATE OR REPLACE FUNCTION public.admin_list_organizations()
RETURNS TABLE(id UUID, name TEXT, created_at TIMESTAMPTZ, branch_count BIGINT, user_count BIGINT)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NOT get_is_superadmin() THEN RAISE EXCEPTION 'Acesso negado: apenas superadmin'; END IF;
  RETURN QUERY
  SELECT o.id, o.name, o.created_at,
    (SELECT COUNT(*) FROM store_branches sb WHERE sb.organization_id = o.id) AS branch_count,
    (SELECT COUNT(*) FROM system_users su WHERE su.organization_id = o.id) AS user_count
  FROM organizations o ORDER BY o.created_at DESC;
END;
$$;

-- 4. RPC: Criar nova organização (retorna senha gerada, NÃO salva no banco)
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

-- 5. RPC: Adicionar um usuário admin a uma organização/filial específica
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
  -- Verificar se já existe
  IF EXISTS (SELECT 1 FROM system_users WHERE email = p_email AND organization_id = p_org_id) THEN
    RETURN QUERY SELECT FALSE, 'Já existe um usuário com este e-mail nesta organização', NULL::UUID; RETURN;
  END IF;
  v_user_id := gen_random_uuid();
  INSERT INTO system_users (id, organization_id, name, email, role, active, store_branch_id)
  VALUES (v_user_id, p_org_id, p_name, p_email, p_role, TRUE, p_branch_id);
  RETURN QUERY SELECT TRUE, 'Usuário criado com sucesso', v_user_id;
END;
$$;

-- 6. RPC: Detalhes de uma organização
CREATE OR REPLACE FUNCTION public.admin_get_organization(p_org_id UUID)
RETURNS TABLE(id UUID, name TEXT, created_at TIMESTAMPTZ, branches JSON, users JSON)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT get_is_superadmin() THEN RAISE EXCEPTION 'Acesso negado: apenas superadmin'; END IF;
  RETURN QUERY
  SELECT o.id, o.name, o.created_at,
    (SELECT json_agg(row_to_json(sb.*)) FROM store_branches sb WHERE sb.organization_id = o.id),
    (SELECT json_agg(json_build_object('id', su.id, 'name', su.name, 'email', su.email, 'role', su.role, 'active', su.active))
     FROM system_users su WHERE su.organization_id = o.id)
  FROM organizations o WHERE o.id = p_org_id;
END;
$$;

-- 7. RPC: Listar filiais de uma organização
CREATE OR REPLACE FUNCTION public.admin_list_branches(p_org_id UUID)
RETURNS TABLE(id UUID, name TEXT, code TEXT, city TEXT, state TEXT, is_headquarters BOOLEAN, active BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT get_is_superadmin() THEN RAISE EXCEPTION 'Acesso negado: apenas superadmin'; END IF;
  RETURN QUERY
  SELECT sb.id, sb.name, sb.code, sb.city, sb.state, sb.is_headquarters, sb.active
  FROM store_branches sb WHERE sb.organization_id = p_org_id ORDER BY sb.is_headquarters DESC, sb.name;
END;
$$;

-- 8. RPC: Listar usuários de uma organização
CREATE OR REPLACE FUNCTION public.admin_list_users(p_org_id UUID)
RETURNS TABLE(id UUID, name TEXT, email TEXT, role TEXT, active BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT get_is_superadmin() THEN RAISE EXCEPTION 'Acesso negado: apenas superadmin'; END IF;
  RETURN QUERY
  SELECT su.id, su.name, su.email, su.role, su.active
  FROM system_users su WHERE su.organization_id = p_org_id ORDER BY su.role, su.name;
END;
$$;

-- 9. Marcar emanuel@gmail.com como superadmin (APENAS em system_users)
UPDATE system_users SET superadmin = TRUE WHERE email = 'emanuel@gmail.com';

-- 10. Garantir que as funções estejam acessíveis
GRANT EXECUTE ON FUNCTION public.get_is_superadmin TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_organizations TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_organization TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_add_user TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_organization TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_branches TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_users TO authenticated;
