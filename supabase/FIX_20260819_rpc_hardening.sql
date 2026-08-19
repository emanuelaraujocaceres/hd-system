-- ==============================================================================
-- FIX_20260819_rpc_hardening.sql
-- Endurecimento de RPCs SECURITY DEFINER identificadas na auditoria de 2026-08-19.
--
-- Problemas corrigidos:
--   1. admin_delete_organization: sem check de superadmin + GRANT authenticated
--      → qualquer usuário autenticado podia apagar a org inteira via API direta.
--      (Usada apenas pela Pages Function /api/admin/delete-organization com
--      service_role — o GRANT authenticated é residual e perigoso.)
--   2. ajustar_estoque (8-arg): sem GRANT → expos a PUBLIC (anon!), SECURITY
--      DEFINER, sem validar que o produto pertence ao org/filial passados.
--   3. create_filial_backup: sem validação de org/branch do chamador — qualquer
--      autenticado podia injetar backup de outra filial e podar o histórico dela.
--   4. admin_fetch_*/admin_create_organization/admin_add_user: SECURITY DEFINER
--      sem SET search_path (boas práticas / hijack).
--   5. RPCs atômicas não usadas pelo app (close_cash_session, process_sale_atomic,
--      transfer_table_session, cancel_sale_atomic, create_customer_session): eram
--      executáveis por PUBLIC (anon). Restritas a service_role.
--
-- Compatível com AGENTS.md: helper get_is_superadmin() (superadmin do banco),
-- is_superadmin() (org NULL), isolamento org+branch server-side.
-- Idempotente: CREATE OR REPLACE + REVOKE dentro de DO block condicionado.
-- ==============================================================================

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. get_is_superadmin(): adicionar SET search_path = public
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_is_superadmin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(superadmin, FALSE) FROM system_users WHERE id = auth.uid();
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. admin_delete_organization: guard de acesso + search_path
--    Permite: superadmin autenticado OU chamada com role service_role (Pages
--    Function). Bloqueia qualquer outro usuário autenticado/anon.
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.admin_delete_organization(p_org_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name TEXT;
BEGIN
  -- Guard: superadmin (auth.uid()) OU service_role (Pages Function).
  -- Garante que um authenticated comum chamando a RPC diretamente seja bloqueado
  -- mesmo que alguém re-grantue EXECUTE no futuro (defense-in-depth).
  IF NOT (
    get_is_superadmin()
    OR COALESCE(current_setting('request.jwt.claims', true)::json->>'role', '') = 'service_role'
  ) THEN
    RAISE EXCEPTION 'Acesso negado: apenas superadmin ou service_role podem excluir organizações';
  END IF;

  SELECT name INTO v_name FROM organizations WHERE id = p_org_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Organização não encontrada.');
  END IF;

  -- A organização padrão do sistema (HD-System / Adega) é protegida
  IF p_org_id = '00000000-0000-0000-0000-000000000001' THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'A organização padrão do sistema (HD-System) não pode ser excluída.'
    );
  END IF;

  -- Deleção em cascata — filhos antes dos pais (respeita FKs)
  DELETE FROM sale_items
    WHERE sale_id IN (SELECT id FROM sales WHERE organization_id = p_org_id);
  DELETE FROM credit_payments WHERE organization_id = p_org_id;
  DELETE FROM nf_records WHERE organization_id = p_org_id;
  DELETE FROM scanned_boletos WHERE organization_id = p_org_id;
  DELETE FROM stock_movements WHERE organization_id = p_org_id;
  DELETE FROM cash_sessions WHERE organization_id = p_org_id;
  DELETE FROM financial_transactions WHERE organization_id = p_org_id;
  DELETE FROM sales WHERE organization_id = p_org_id;
  DELETE FROM products WHERE organization_id = p_org_id;
  DELETE FROM categories WHERE organization_id = p_org_id;
  DELETE FROM customers WHERE organization_id = p_org_id;
  DELETE FROM suppliers WHERE organization_id = p_org_id;
  DELETE FROM system_settings WHERE organization_id = p_org_id;
  DELETE FROM sync_queue WHERE organization_id = p_org_id;
  DELETE FROM movimentacoes_falhas WHERE organization_id = p_org_id;
  DELETE FROM store_branches WHERE organization_id = p_org_id;
  DELETE FROM system_users WHERE organization_id = p_org_id;
  DELETE FROM organizations WHERE id = p_org_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', format('Organização "%s" excluída com sucesso.', v_name)
  );
END;
$$;

-- Revoga EXECUTE de authenticated: o único consumidor é a Pages Function
-- (service_role). Usuário autenticado nunca chama esta RPC diretamente.
REVOKE ALL ON FUNCTION public.admin_delete_organization FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_organization TO service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. ajustar_estoque (8-arg): validação org/branch + search_path + GRANTs
--    Chamada pelo frontend (storageService.updateStock) com os org/branch do
--    usuário logado. Agora o produto passado DEVE pertencer ao org/filial do
--    chamador (ou o chamador é superadmin). Anon bloqueado.
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.ajustar_estoque(
  p_product_id UUID,
  p_quantity INTEGER,
  p_type TEXT DEFAULT 'in',
  p_reason TEXT DEFAULT 'Ajuste manual',
  p_operator_name TEXT DEFAULT 'Sistema',
  p_organization_id UUID DEFAULT '00000000-0000-0000-0000-000000000001',
  p_store_branch_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product RECORD;
  v_current_stock INTEGER;
  v_new_stock INTEGER;
  v_final_type TEXT;
BEGIN
  -- Só usuários autenticados podem ajustar estoque (fallback fechado).
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Acesso negado: usuário não autenticado');
  END IF;

  -- Buscar produto
  SELECT * INTO v_product FROM products WHERE id = p_product_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Produto não encontrado');
  END IF;

  -- Validação de isolamento: o produto DEVE pertencer ao org/filial informados
  -- pelo chamador (exceto superadmin, que tem acesso global).
  IF NOT (
    get_is_superadmin()
    OR (
      v_product.organization_id = p_organization_id
      AND v_product.store_branch_id = p_store_branch_id
    )
  ) THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Acesso negado: produto não pertence à sua organização/filial'
    );
  END IF;

  v_current_stock := v_product.stock_quantity;

  -- Calcular novo estoque
  IF p_type = 'in' THEN
    v_new_stock := v_current_stock + ABS(p_quantity);
    v_final_type := 'in';
  ELSIF p_type = 'out' THEN
    v_new_stock := GREATEST(0, v_current_stock - ABS(p_quantity));
    v_final_type := 'out';
  ELSE
    RETURN json_build_object('success', false, 'error', 'Tipo inválido: ' || p_type);
  END IF;

  -- Atualizar estoque do produto
  UPDATE products SET stock_quantity = v_new_stock, updated_at = NOW() WHERE id = p_product_id;

  -- Registrar movimentação (COM store_branch_id)
  INSERT INTO stock_movements (
    id, organization_id, store_branch_id, product_id, product_name,
    type, quantity, previous_stock, new_stock,
    reason, operator_name, created_at
  ) VALUES (
    gen_random_uuid(),
    COALESCE(p_organization_id, v_product.organization_id),
    COALESCE(p_store_branch_id, v_product.store_branch_id),
    p_product_id,
    v_product.name,
    v_final_type,
    ABS(p_quantity),
    v_current_stock,
    v_new_stock,
    p_reason,
    p_operator_name,
    NOW()
  );

  RETURN json_build_object(
    'success', true,
    'new_stock', v_new_stock,
    'previous_stock', v_current_stock
  );
END;
$$;

-- Fechar exposição a PUBLIC/anon; liberar para authenticated (frontend) e service_role
REVOKE ALL ON FUNCTION public.ajustar_estoque FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ajustar_estoque TO authenticated;
GRANT EXECUTE ON FUNCTION public.ajustar_estoque TO service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- 4. create_filial_backup: validação de org/branch do chamador + search_path
--    Chamada pelo backupService com org/branch do usuário logado. Antes, era
--    executável por PUBLIC e aceitava QUALQUER org/branch (segurança quebrada).
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.create_filial_backup(
  p_organization_id uuid,
  p_store_branch_id uuid,
  p_backup_name text,
  p_backup_data jsonb,
  p_is_automatic boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_backup_id uuid;
  v_record_count integer;
BEGIN
  -- Validação: superadmin (acesso global) OU usuário da própria org+filial.
  -- O backup só pode ser criado para a filial do próprio usuário, e a filial
  -- deve pertencer à org informada.
  IF NOT (
    get_is_superadmin()
    OR (
      p_organization_id = get_user_org_id()
      AND p_store_branch_id = get_user_branch_id()
      AND EXISTS (
        SELECT 1 FROM store_branches sb
        WHERE sb.id = p_store_branch_id AND sb.organization_id = p_organization_id
      )
    )
  ) THEN
    RAISE EXCEPTION 'Acesso negado: backup permitido apenas para a própria filial';
  END IF;

  -- Contar registros no backup
  v_record_count := COALESCE((p_backup_data->>'recordCount')::integer, 0);

  INSERT INTO filial_backups (
    organization_id,
    store_branch_id,
    backup_name,
    backup_data,
    data_size_bytes,
    record_count,
    created_by,
    is_automatic
  ) VALUES (
    p_organization_id,
    p_store_branch_id,
    p_backup_name,
    p_backup_data,
    octet_length(p_backup_data::text),
    v_record_count,
    auth.uid(),
    p_is_automatic
  ) RETURNING id INTO v_backup_id;

  -- Limitar a 10 backups por filial (manter os mais recentes) — agora apenas
  -- da própria filial do chamador (protegido pelo guard acima).
  DELETE FROM filial_backups
  WHERE store_branch_id = p_store_branch_id
    AND id NOT IN (
      SELECT id FROM filial_backups
      WHERE store_branch_id = p_store_branch_id
      ORDER BY created_at DESC
      LIMIT 10
    );

  RETURN v_backup_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_filial_backup FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_filial_backup TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_filial_backup TO service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- 5. admin_fetch_* / admin_create_organization / admin_add_user: search_path
--    (mantêm GRANT authenticated — OrganizationsView chama como superadmin logado)
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.admin_fetch_organizations()
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
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

CREATE OR REPLACE FUNCTION public.admin_fetch_branches(p_org_id UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
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

CREATE OR REPLACE FUNCTION public.admin_fetch_users(p_org_id UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
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

CREATE OR REPLACE FUNCTION public.admin_create_organization(
  p_name TEXT, p_admin_email TEXT, p_admin_name TEXT
)
RETURNS TABLE(success BOOLEAN, message TEXT, org_id UUID, admin_id TEXT, password TEXT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
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

CREATE OR REPLACE FUNCTION public.admin_add_user(
  p_org_id UUID, p_branch_id UUID, p_name TEXT, p_email TEXT, p_role TEXT DEFAULT 'admin'
)
RETURNS TABLE(success BOOLEAN, message TEXT, user_id UUID)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
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

-- ═════════════════════════════════════════════════════════════════════════════
-- 6. RPCs atômicas NÃO usadas pelo app → restringir de PUBLIC/anon para service_role
--    (close_cash_session, process_sale_atomic, transfer_table_session,
--     cancel_sale_atomic, create_customer_session). Se um dia o frontend precisar,
--     adicionar GRANT EXECUTE para authenticated com validação de org/branch.
-- ═════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'close_cash_session', 'process_sale_atomic', 'transfer_table_session',
        'cancel_sale_atomic', 'create_customer_session'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon', r.proname, r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role', r.proname, r.args);
    RAISE NOTICE 'RPC % restrita a service_role', r.proname;
  END LOOP;
END $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 7. VERIFICAÇÃO (rodar e conferir os prints)
-- ═════════════════════════════════════════════════════════════════════════════

-- 7.1. GRANTs das funções endurecidas (esperado: admin_delete_organization sem
--      authenticated; ajustar_estoque/create_filial_backup sem anon/PUBLIC)
SELECT routine_name,
  string_agg(DISTINCT grantee || ':' || privilege_type, ', ' ORDER BY grantee || ':' || privilege_type) AS grants
FROM information_schema.role_routine_grants
WHERE routine_schema = 'public'
  AND routine_name IN ('admin_delete_organization', 'ajustar_estoque', 'create_filial_backup',
                       'admin_fetch_organizations', 'admin_fetch_branches', 'admin_fetch_users',
                       'admin_create_organization', 'admin_add_user')
GROUP BY routine_name ORDER BY routine_name;

-- 7.2. Verificação simples de sanidade (WHERE com subselect simples, sem JOIN de catálogo)
SELECT 'admin_delete_organization' AS fn,
  has_function_privilege('anon', 'public.admin_delete_organization(uuid)', 'EXECUTE') AS anon_exec,
  has_function_privilege('authenticated', 'public.admin_delete_organization(uuid)', 'EXECUTE') AS auth_exec,
  has_function_privilege('service_role', 'public.admin_delete_organization(uuid)', 'EXECUTE') AS service_exec;

SELECT 'ajustar_estoque' AS fn,
  has_function_privilege('anon', 'public.ajustar_estoque(uuid, integer, text, text, text, uuid, uuid)', 'EXECUTE') AS anon_exec,
  has_function_privilege('authenticated', 'public.ajustar_estoque(uuid, integer, text, text, text, uuid, uuid)', 'EXECUTE') AS auth_exec;

SELECT 'create_filial_backup' AS fn,
  has_function_privilege('anon', 'public.create_filial_backup(uuid, uuid, text, jsonb, boolean)', 'EXECUTE') AS anon_exec,
  has_function_privilege('authenticated', 'public.create_filial_backup(uuid, uuid, text, jsonb, boolean)', 'EXECUTE') AS auth_exec;

-- 7.3. Lista completa: TODAS as funções SECURITY DEFINER expostas a anon/authenticated/PUBLIC
--      (para a próxima rodada de revisão — inclui has_permission, mark_user_logout, etc.)
SELECT p.proname,
  pg_get_function_identity_arguments(p.oid) AS args,
  COALESCE(p.prosecdef, FALSE) AS secdef,
  EXISTS (
    SELECT 1 FROM information_schema.role_routine_grants g
    WHERE g.routine_schema = 'public' AND g.routine_name = p.proname
      AND g.grantee IN ('PUBLIC', 'anon')
  ) AS exposed_anon_or_public
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef
ORDER BY p.proname;