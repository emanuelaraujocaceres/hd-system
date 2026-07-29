-- ==============================================================================
-- SUPERADMIN + RPCs DE GESTÃO DE ORGANIZAÇÕES
-- ==============================================================================
-- Permite que um superadmin (desenvolvedor) crie e veja todas as organizações
-- sem se preocupar com RLS. Os RPCs usam SECURITY DEFINER para bypassar RLS.
-- ==============================================================================

-- 0. Garantir extensão pgcrypto (para gen_random_uuid)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Adicionar coluna superadmin às tabelas profiles e system_users
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS superadmin BOOLEAN DEFAULT FALSE;
ALTER TABLE system_users ADD COLUMN IF NOT EXISTS superadmin BOOLEAN DEFAULT FALSE;

-- 2. Função para verificar se o usuário atual é superadmin
--    Verifica tanto profiles (criado pelo Supabase Auth) quanto system_users (app)
CREATE OR REPLACE FUNCTION public.get_is_superadmin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (SELECT superadmin FROM profiles WHERE id = auth.uid()),
    (SELECT superadmin FROM system_users WHERE id = auth.uid()),
    FALSE
  );
$$;

-- 3. RPC: Listar todas as organizações (apenas superadmin)
CREATE OR REPLACE FUNCTION public.admin_list_organizations()
RETURNS TABLE(
  id UUID,
  name TEXT,
  created_at TIMESTAMPTZ,
  branch_count BIGINT,
  user_count BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NOT get_is_superadmin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas superadmin';
  END IF;

  RETURN QUERY
  SELECT
    o.id,
    o.name,
    o.created_at,
    (SELECT COUNT(*) FROM store_branches sb WHERE sb.organization_id = o.id) AS branch_count,
    (SELECT COUNT(*) FROM system_users su WHERE su.organization_id = o.id) AS user_count
  FROM organizations o
  ORDER BY o.created_at DESC;
END;
$$;

-- 4. RPC: Criar nova organização (apenas superadmin)
--    ATENÇÃO: a senha NÃO é salva no banco por segurança. Ela é gerada e
--    retornada APENAS para o frontend mostrar ao admin uma única vez.
--    O admin deve criar o usuário no Supabase Auth (auth.users) manualmente
--    ou por um endpoint de admin da API do Supabase.
CREATE OR REPLACE FUNCTION public.admin_create_organization(
  p_name TEXT,
  p_admin_email TEXT,
  p_admin_name TEXT
)
RETURNS TABLE(success BOOLEAN, message TEXT, org_id UUID, admin_id TEXT, password TEXT)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_org_id UUID;
  v_admin_id UUID;
  v_password TEXT;
  v_branch_id UUID;
BEGIN
  IF NOT get_is_superadmin() THEN
    RETURN QUERY SELECT FALSE, 'Acesso negado: apenas superadmin', NULL::UUID, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  -- Validar
  IF p_name IS NULL OR p_name = '' THEN
    RETURN QUERY SELECT FALSE, 'Nome da organização é obrigatório', NULL::UUID, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  -- Gerar UUIDs
  v_org_id := gen_random_uuid();
  v_admin_id := gen_random_uuid();
  v_branch_id := gen_random_uuid();
  v_password := upper(substr(md5(random()::text), 1, 8)); -- senha de 8 chars (só para exibição)

  -- Criar organização
  INSERT INTO organizations (id, name) VALUES (v_org_id, p_name);

  -- Criar filial padrão (Matriz)
  INSERT INTO store_branches (id, organization_id, name, code, active, is_headquarters)
  VALUES (v_branch_id, v_org_id, p_name || ' - Matriz', 'MTZ-01', TRUE, TRUE);

  -- Criar admin na system_users (SEM senha — a senha fica no auth.users, não aqui)
  INSERT INTO system_users (id, organization_id, name, email, role, active, store_branch_id)
  VALUES (v_admin_id, v_org_id, p_admin_name, p_admin_email, 'admin', TRUE, v_branch_id);

  RETURN QUERY SELECT TRUE, 'Organização criada com sucesso', v_org_id, v_admin_id::TEXT, v_password;
END;
$$;

-- 5. RPC: Detalhes de uma organização (apenas superadmin)
CREATE OR REPLACE FUNCTION public.admin_get_organization(p_org_id UUID)
RETURNS TABLE(
  id UUID,
  name TEXT,
  created_at TIMESTAMPTZ,
  branches JSON,
  users JSON
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NOT get_is_superadmin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas superadmin';
  END IF;

  RETURN QUERY
  SELECT
    o.id,
    o.name,
    o.created_at,
    (SELECT json_agg(row_to_json(sb.*)) FROM store_branches sb WHERE sb.organization_id = o.id) AS branches,
    (SELECT json_agg(json_build_object('id', su.id, 'name', su.name, 'email', su.email, 'role', su.role, 'active', su.active))
     FROM system_users su WHERE su.organization_id = o.id) AS users
  FROM organizations o
  WHERE o.id = p_org_id;
END;
$$;

-- 6. RPC: Listar filiais de uma organização (apenas superadmin)
CREATE OR REPLACE FUNCTION public.admin_list_branches(p_org_id UUID)
RETURNS TABLE(
  id UUID,
  name TEXT,
  code TEXT,
  city TEXT,
  state TEXT,
  is_headquarters BOOLEAN,
  active BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NOT get_is_superadmin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas superadmin';
  END IF;

  RETURN QUERY
  SELECT sb.id, sb.name, sb.code, sb.city, sb.state, sb.is_headquarters, sb.active
  FROM store_branches sb
  WHERE sb.organization_id = p_org_id
  ORDER BY sb.is_headquarters DESC, sb.name;
END;
$$;

-- 7. RPC: Listar usuários de uma organização (apenas superadmin)
CREATE OR REPLACE FUNCTION public.admin_list_users(p_org_id UUID)
RETURNS TABLE(
  id UUID,
  name TEXT,
  email TEXT,
  role TEXT,
  active BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NOT get_is_superadmin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas superadmin';
  END IF;

  RETURN QUERY
  SELECT su.id, su.name, su.email, su.role, su.active
  FROM system_users su
  WHERE su.organization_id = p_org_id
  ORDER BY su.role, su.name;
END;
$$;

-- 8. Marcar o usuário emanuel@gmail.com como superadmin
--    Usa INSERT ... ON CONFLICT em vez de UPDATE puro para garantir que
--    funciona mesmo se a linha em profiles ainda não existir.
INSERT INTO profiles (id, organization_id, name, email, role, superadmin)
SELECT
  au.id,
  (SELECT organization_id FROM system_users WHERE email = 'emanuel@gmail.com' LIMIT 1),
  (SELECT name FROM system_users WHERE email = 'emanuel@gmail.com' LIMIT 1),
  'emanuel@gmail.com',
  'admin',
  TRUE
FROM auth.users au
WHERE au.email = 'emanuel@gmail.com'
ON CONFLICT (id) DO UPDATE SET superadmin = TRUE;

-- Também marca na system_users (frontend lê desta tabela)
UPDATE system_users SET superadmin = TRUE WHERE email = 'emanuel@gmail.com';

-- 9. Garantir que as funções estejam acessíveis para usuários autenticados
GRANT EXECUTE ON FUNCTION public.get_is_superadmin TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_organizations TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_organization TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_organization TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_branches TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_users TO authenticated;
