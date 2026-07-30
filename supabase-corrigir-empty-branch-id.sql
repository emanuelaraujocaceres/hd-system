-- ==============================================================================
-- DIAGNÓSTICO DE AUTENTICAÇÃO — descubra o que o frontend está vendo
-- ==============================================================================
-- Cria uma RPC que o frontend pode chamar para depurar o auth/RLS.
-- O resultado mostra o auth.uid(), auth.jwt(), get_auth_user_org_id(),
-- e quantas vendas o usuário consegue ver.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.debug_auth()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
DECLARE
  v_uid UUID;
  v_email TEXT;
  v_org_id UUID;
  v_sales_count INTEGER;
  v_profile_org UUID;
  v_sysuser_org UUID;
  v_sysuser_email_org UUID;
BEGIN
  v_uid := auth.uid();
  v_email := auth.jwt() ->> 'email';

  -- Tenta cada fallback separadamente
  SELECT organization_id INTO v_profile_org FROM profiles WHERE id = v_uid;
  SELECT organization_id INTO v_sysuser_org FROM system_users WHERE id = v_uid;
  SELECT organization_id INTO v_sysuser_email_org FROM system_users WHERE email = v_email;

  -- A função oficial
  v_org_id := public.get_auth_user_org_id();

  -- Quantas vendas o usuário consegue SELECT via RLS?
  SELECT COUNT(*) INTO v_sales_count FROM sales;

  RETURN jsonb_build_object(
    'auth_uid', v_uid,
    'auth_email', v_email,
    'profiles_org_by_id', v_profile_org,
    'system_users_org_by_id', v_sysuser_org,
    'system_users_org_by_email', v_sysuser_email_org,
    'get_auth_user_org_id()', v_org_id,
    'sales_count_via_rls', v_sales_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.debug_auth TO authenticated;

-- ==============================================================================
-- CORREÇÃO: Normalizar store_branch_id vazio para NULL
-- ==============================================================================
-- 40 vendas têm store_branch_id = '' (string vazia) em vez de NULL.
-- O filtro do frontend usa .is.null que não captura string vazia.
UPDATE sales SET store_branch_id = NULL WHERE store_branch_id = '';
UPDATE products SET store_branch_id = NULL WHERE store_branch_id = '';
UPDATE store_branches SET store_branch_id = NULL WHERE store_branch_id = '';

-- ==============================================================================
-- VERIFICAÇÃO
-- ==============================================================================
SELECT 'store_branch_id vazios normalizados' AS acao,
  (SELECT COUNT(*) FROM sales WHERE store_branch_id IS NULL) AS sales_null,
  (SELECT COUNT(*) FROM sales WHERE store_branch_id = '') AS sales_vazios;
