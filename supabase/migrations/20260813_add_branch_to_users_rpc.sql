-- =====================================================================
-- Adicionar store_branch_id ao admin_fetch_users RPC
-- Para mostrar a filial de cada admin na tabela de Organizações
-- =====================================================================

-- Recriar a função com store_branch_id no SELECT
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
    SELECT su.id, su.name, su.email, su.role, su.active, su.store_branch_id
    FROM system_users su
    WHERE su.organization_id = p_org_id
    ORDER BY su.role, su.name
  ) sub;
  RETURN result;
END;
$$;
