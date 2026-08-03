-- ============================================================
-- IAM: Funções de verificação de permissão no banco de dados
-- HD-System — 3 níveis: Desenvolvedor > Administrador > Colaborador
--
-- Execute este SQL no Supabase SQL Editor para aplicar.
-- ============================================================

-- ─── FUNÇÃO: retorna o nível de acesso do usuário autenticado ──
-- 0 = Desenvolvedor (superadmin), 1 = Admin, 2 = Colaborador
CREATE OR REPLACE FUNCTION public.get_user_access_level()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    -- Superadmin → nível 0
    (SELECT CASE WHEN superadmin = TRUE THEN 0 END
     FROM system_users WHERE id = auth.uid() LIMIT 1),
    -- Admin/manager → nível 1
    (SELECT CASE WHEN role IN ('admin', 'manager') THEN 1 END
     FROM system_users WHERE id = auth.uid() LIMIT 1),
    -- Everyone else → nível 2 (colaborador)
    2
  );
$$;

-- ─── FUNÇÃO: verifica se o usuário pode acessar um módulo ──────
-- Parâmetros: module_name (ex: 'pdv', 'inventory', 'finance')
-- Retorna: true se o usuário tem acesso ao módulo
CREATE OR REPLACE FUNCTION public.can_access_module(module_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    -- Desenvolvedor: acesso total a tudo
    WHEN public.get_user_access_level() = 0 THEN TRUE
    -- Admin: acesso a tudo EXCEPT organizations e audit
    WHEN public.get_user_access_level() = 1
      AND module_name NOT IN ('organizations', 'audit') THEN TRUE
    -- Colaborador: acesso limitado a pdv, inventory (view), crm (view), dashboard
    WHEN public.get_user_access_level() = 2
      AND module_name IN ('pdv', 'inventory', 'crm', 'dashboard') THEN TRUE
    ELSE FALSE
  END;
$$;

-- ─── FUNÇÃO: verifica se o usuário pode realizar uma ação ───────
-- Parâmetros: module_name, action_name ('view', 'create', 'edit', 'delete')
-- Retorna: true se a ação é permitida
CREATE OR REPLACE FUNCTION public.can_perform_action(module_name TEXT, action_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    -- Desenvolvedor: qualquer ação em qualquer módulo
    WHEN public.get_user_access_level() = 0 THEN TRUE
    -- Admin: qualquer ação em módulos que acessa (exceto organizations/audit)
    WHEN public.get_user_access_level() = 1
      AND module_name NOT IN ('organizations', 'audit') THEN TRUE
    -- Colaborador: PDV pode criar vendas; inventory/crm/dashboard são view-only
    WHEN public.get_user_access_level() = 2 THEN
      CASE
        WHEN module_name = 'pdv' AND action_name IN ('view', 'create') THEN TRUE
        WHEN module_name = 'crm' AND action_name IN ('view', 'create', 'edit') THEN TRUE
        WHEN module_name = 'inventory' AND action_name = 'view' THEN TRUE
        WHEN module_name = 'dashboard' AND action_name = 'view' THEN TRUE
        ELSE FALSE
      END
    ELSE FALSE
  END;
$$;

-- ─── FUNÇÃO: verifica se o usuário pode acessar uma filial ─────
-- Parâmetros: target_branch_id
-- Retorna: true se o usuário pode ver dados daquela filial
CREATE OR REPLACE FUNCTION public.can_access_branch(target_branch_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    -- Desenvolvedor: acessa qualquer filial
    WHEN public.get_user_access_level() = 0 THEN TRUE
    -- Admin: acessa qualquer filial da sua organização
    WHEN public.get_user_access_level() = 1 THEN
      EXISTS (
        SELECT 1 FROM store_branches sb
        WHERE sb.id = target_branch_id
          AND sb.organization_id = public.get_auth_user_org_id()
      )
    -- Colaborador: acessa APENAS sua filial atribuída
    WHEN public.get_user_access_level() = 2 THEN
      EXISTS (
        SELECT 1 FROM system_users su
        WHERE su.id = auth.uid()
          AND su.store_branch_id = target_branch_id
      )
    ELSE FALSE
  END;
$$;

-- ─── FUNÇÃO: retorna o nível de acesso como texto legível ──────
CREATE OR REPLACE FUNCTION public.get_access_level_label()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE public.get_user_access_level()
    WHEN 0 THEN 'Desenvolvedor'
    WHEN 1 THEN 'Administrador'
    WHEN 2 THEN 'Colaborador'
    ELSE 'Desconhecido'
  END;
$$;

-- ─── GRANT PERMISSÕES ──────────────────────────────────────────
-- Permitir que usuários autenticados chamem essas funções
GRANT EXECUTE ON FUNCTION public.get_user_access_level() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_module(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_perform_action(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_branch(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_access_level_label() TO authenticated;

-- ============================================================
-- FIM DA MIGRAÇÃO IAM
-- ============================================================
