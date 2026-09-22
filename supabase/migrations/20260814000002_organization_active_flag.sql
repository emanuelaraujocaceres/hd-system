-- ==============================================================================
-- 20260814_organization_active_flag.sql
-- Interruptor de acesso online por organização (modelo de mensalidade).
--
--  - active = true  → a organização sincroniza normalmente (assinatura ativa)
--  - active = false → o app do cliente corta Realtime/sync e opera apenas
--                      LOCALMENTE (localStorage) até a organização ser reativada.
--
-- O frontend consulta este campo a cada 30s (health check) e no login.
-- O painel do superadmin liga/desliga via /api/admin/set-organization-active.
-- ==============================================================================

-- 1) Colunas do interruptor
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;

-- Guarda quando a assinatura expirou/foi cortada (para futura automação de
-- cobrança). NULL = sem expiração (org ativa sem data de corte).
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ;

-- 2) Painel do superadmin: incluir o status na listagem de organizações
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
    SELECT o.id, o.name, o.created_at, o.active,
      (SELECT COUNT(*)::INTEGER FROM store_branches sb WHERE sb.organization_id = o.id) AS branch_count,
      (SELECT COUNT(*)::INTEGER FROM system_users su WHERE su.organization_id = o.id) AS user_count
    FROM organizations o
    ORDER BY o.created_at DESC
  ) sub;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_fetch_organizations TO authenticated;

-- 3) Verificação: as colunas devem aparecer na listagem
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'organizations'
ORDER BY ordinal_position;
