


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."admin_add_user"("p_org_id" "uuid", "p_branch_id" "uuid", "p_name" "text", "p_email" "text", "p_role" "text" DEFAULT 'admin'::"text") RETURNS TABLE("success" boolean, "message" "text", "user_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."admin_add_user"("p_org_id" "uuid", "p_branch_id" "uuid", "p_name" "text", "p_email" "text", "p_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_create_organization"("p_name" "text", "p_admin_email" "text", "p_admin_name" "text") RETURNS TABLE("success" boolean, "message" "text", "org_id" "uuid", "admin_id" "text", "password" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."admin_create_organization"("p_name" "text", "p_admin_email" "text", "p_admin_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_delete_organization"("p_org_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."admin_delete_organization"("p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_fetch_branches"("p_org_id" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."admin_fetch_branches"("p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_fetch_organizations"() RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."admin_fetch_organizations"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_fetch_users"("p_org_id" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."admin_fetch_users"("p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ajustar_estoque"("p_product_id" "uuid", "p_quantity" integer, "p_type" "text" DEFAULT 'in'::"text", "p_reason" "text" DEFAULT 'Ajuste manual'::"text", "p_operator_name" "text" DEFAULT 'Sistema'::"text", "p_organization_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000001'::"uuid", "p_store_branch_id" "uuid" DEFAULT NULL::"uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."ajustar_estoque"("p_product_id" "uuid", "p_quantity" integer, "p_type" "text", "p_reason" "text", "p_operator_name" "text", "p_organization_id" "uuid", "p_store_branch_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."alert_missing_branch"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Verifica se store_branch_id é NULL (UUID nunca é string vazia)
    IF NEW.store_branch_id IS NULL THEN
        RAISE EXCEPTION '❌ ERRO CRÍTICO: Tentativa de salvar % sem store_branch_id! ID: %', 
            TG_TABLE_NAME, NEW.id;
    END IF;
    
    -- Verifica se store_branch_id existe na tabela store_branches
    IF NOT EXISTS (
        SELECT 1 FROM store_branches WHERE id = NEW.store_branch_id
    ) THEN
        RAISE EXCEPTION '❌ ERRO CRÍTICO: Tentativa de salvar % com store_branch_id inválido! ID: %, branch: %', 
            TG_TABLE_NAME, NEW.id, NEW.store_branch_id;
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."alert_missing_branch"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_access_branch"("target_branch_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
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
          AND su.store_branch_id::TEXT = target_branch_id::TEXT  -- 🔥 CAST FIX
      )
    ELSE FALSE
  END;
$$;


ALTER FUNCTION "public"."can_access_branch"("target_branch_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_access_module"("module_name" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."can_access_module"("module_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_perform_action"("module_name" "text", "action_name" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."can_perform_action"("module_name" "text", "action_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_sale_atomic"("p_sale_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_sale RECORD;
    v_item RECORD;
    v_ingredient RECORD;
    v_product RECORD;
    v_fraction_source RECORD;
    v_container RECORD;
    v_remaining_to_restore INTEGER;
    v_consume INTEGER;
    v_new_stock INTEGER;
    v_existing_container_id UUID;
BEGIN
    -- Bloqueia a venda para evitar cancelamento duplicado
    SELECT * INTO v_sale
    FROM sales
    WHERE id = p_sale_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Venda não encontrada');
    END IF;

    IF v_sale.status = 'cancelled' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Venda já cancelada');
    END IF;

    -- Percorre os itens da venda
    FOR v_item IN
        SELECT si.product_id, si.quantity
        FROM sale_items si
        WHERE si.sale_id = p_sale_id
    LOOP
        -- Verifica se o produto é composto
        SELECT * INTO v_product
        FROM products
        WHERE id = v_item.product_id
        FOR UPDATE;

        IF v_product.is_composite THEN
            -- Restaura ingredientes da receita
            FOR v_ingredient IN
                SELECT pr.ingredient_product_id, pr.quantity
                FROM product_recipes pr
                WHERE pr.composite_product_id = v_product.id
            LOOP
                -- Restaura o ingrediente (pode ser normal ou fração)
                PERFORM restore_product_stock(
                    v_ingredient.ingredient_product_id,
                    (v_ingredient.quantity * v_item.quantity)::INTEGER,
                    v_sale.organization_id,
                    v_sale.store_branch_id,
                    p_sale_id,
                    v_sale.operator_name
                );
            END LOOP;
        ELSE
            -- Restaura o item normal ou fração
            PERFORM restore_product_stock(
                v_item.product_id,
                v_item.quantity,
                v_sale.organization_id,
                v_sale.store_branch_id,
                p_sale_id,
                v_sale.operator_name
            );
        END IF;
    END LOOP;

    -- Marca a venda como cancelada
    UPDATE sales SET status = 'cancelled', updated_at = NOW() WHERE id = p_sale_id;

    RETURN jsonb_build_object('success', true, 'message', 'Venda cancelada e estoque restaurado');
END;
$$;


ALTER FUNCTION "public"."cancel_sale_atomic"("p_sale_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cardapio_branch_from_header"() RETURNS "uuid"
    LANGUAGE "sql" STABLE
    AS $$
  SELECT NULLIF(current_setting('request.headers', true)::json->>'x-branch-id', '')::uuid;
$$;


ALTER FUNCTION "public"."cardapio_branch_from_header"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_stock_consistency"("p_organization_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("product_id" "uuid", "product_name" "text", "current_stock" integer, "calculated_stock" bigint, "difference" bigint, "status" "text")
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  WITH stock_calc AS (
    SELECT
      p.id,
      p.name,
      COALESCE(p.stock_quantity, 0)::integer AS current_stock,
      COALESCE(SUM(CASE
        WHEN sm.type IN ('in', 'IN') THEN sm.quantity
        WHEN sm.type IN ('out', 'OUT', 'loss', 'LOSS') THEN -sm.quantity
        ELSE 0
      END), 0)::bigint AS calculated_stock
    FROM products p
    LEFT JOIN stock_movements sm ON p.id = sm.product_id
    WHERE (p_organization_id IS NULL OR p.organization_id = p_organization_id)
    GROUP BY p.id, p.name, p.stock_quantity
  )
  SELECT
    sc.id,
    sc.name,
    sc.current_stock,
    sc.calculated_stock,
    (sc.current_stock - sc.calculated_stock)::bigint AS difference,
    CASE
      WHEN sc.current_stock = sc.calculated_stock THEN 'CONSISTENTE'
      WHEN sc.current_stock > sc.calculated_stock THEN 'SUPERAVIT'
      ELSE 'DEFICIT'
    END AS status
  FROM stock_calc sc
  WHERE sc.current_stock != sc.calculated_stock
  ORDER BY ABS(sc.current_stock - sc.calculated_stock) DESC;
END;
$$;


ALTER FUNCTION "public"."check_stock_consistency"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."close_cash_session"("p_session_id" "uuid", "p_closing_balance" numeric, "p_notes" "text" DEFAULT NULL::"text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  -- Verificar se a sessão existe
  IF NOT EXISTS (
    SELECT 1 FROM cash_sessions
    WHERE id = p_session_id
      AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'Sessão não encontrada ou já fechada';
  END IF;
  
  -- Fechar sessão
  UPDATE cash_sessions
  SET 
    status = 'closed',
    closed_at = NOW(),
    closing_balance = p_closing_balance,
    notes = COALESCE(notes, '') || COALESCE(' - ' || p_notes, ''),
    updated_at = NOW()
  WHERE id = p_session_id;
  
  RETURN 'Sessão fechada com sucesso';
END;
$$;


ALTER FUNCTION "public"."close_cash_session"("p_session_id" "uuid", "p_closing_balance" numeric, "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_branch_policy"("p_table" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $_$
BEGIN
  -- Dropar policies antigas primeiro
  EXECUTE format('DROP POLICY IF EXISTS "%s_select" ON public.%I', p_table, p_table);
  EXECUTE format('DROP POLICY IF EXISTS "%s_insert" ON public.%I', p_table, p_table);
  EXECUTE format('DROP POLICY IF EXISTS "%s_update" ON public.%I', p_table, p_table);
  EXECUTE format('DROP POLICY IF EXISTS "%s_delete" ON public.%I', p_table, p_table);
  EXECUTE format('DROP POLICY IF EXISTS "%s_select_anon" ON public.%I', p_table, p_table);
  EXECUTE format('DROP POLICY IF EXISTS "%s_insert_anon" ON public.%I', p_table, p_table);
  EXECUTE format('DROP POLICY IF EXISTS "%s_update_anon" ON public.%I', p_table, p_table);
  EXECUTE format('DROP POLICY IF EXISTS "%s_delete_anon" ON public.%I', p_table, p_table);
  EXECUTE format('DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.%I', p_table);
  EXECUTE format('DROP POLICY IF EXISTS "Allow all" ON public.%I', p_table);

  -- Criar policies branch-scoped
  EXECUTE format($sql$
    CREATE POLICY "%s_select" ON public.%I FOR SELECT USING (
      public.is_superadmin()
      OR (organization_id = public.get_user_org_id()
          AND store_branch_id = public.get_user_branch_id())
    )
  $sql$, p_table, p_table);

  EXECUTE format($sql$
    CREATE POLICY "%s_insert" ON public.%I FOR INSERT WITH CHECK (
      public.is_superadmin()
      OR (organization_id = public.get_user_org_id()
          AND store_branch_id = public.get_user_branch_id())
    )
  $sql$, p_table, p_table);

  EXECUTE format($sql$
    CREATE POLICY "%s_update" ON public.%I FOR UPDATE USING (
      public.is_superadmin()
      OR (organization_id = public.get_user_org_id()
          AND store_branch_id = public.get_user_branch_id())
    ) WITH CHECK (
      public.is_superadmin()
      OR (organization_id = public.get_user_org_id()
          AND store_branch_id = public.get_user_branch_id())
    )
  $sql$, p_table, p_table);

  EXECUTE format($sql$
    CREATE POLICY "%s_delete" ON public.%I FOR DELETE USING (
      public.is_superadmin()
      OR (organization_id = public.get_user_org_id()
          AND store_branch_id = public.get_user_branch_id())
    )
  $sql$, p_table, p_table);

  RAISE NOTICE '✅ Policies (branch+org scoped): %', p_table;
END;
$_$;


ALTER FUNCTION "public"."create_branch_policy"("p_table" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_complete_sale"("p_sale_data" "jsonb", "p_items" "jsonb", "p_payments" "jsonb", "p_branch_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_sale_id UUID;
  v_user_id UUID;
  v_organization_id UUID;
  v_code TEXT;
  v_total DECIMAL := 0;
BEGIN
  -- Pegar dados do usuário atual
  v_user_id := auth.uid();
  
  -- Pegar organization_id da filial
  SELECT organization_id INTO v_organization_id 
  FROM store_branches 
  WHERE id = p_branch_id;
  
  -- Gerar código da venda (ex: VEN-YYYYMMDD-XXXX)
  v_code := 'VEN-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || 
            UPPER(SUBSTRING(MD5(RANDOM()::TEXT), 1, 4));
  
  BEGIN
    -- Calcular total dos itens
    SELECT COALESCE(SUM((item->>'quantity')::DECIMAL * (item->>'unit_price')::DECIMAL), 0)
    INTO v_total
    FROM jsonb_array_elements(p_items) AS item;
    
    -- 1. Inserir sale
    INSERT INTO sales (
      id, 
      store_branch_id, 
      organization_id,
      user_id,
      code,
      subtotal,
      discount,
      total,
      payment_method,
      status,
      notes,
      created_at,
      updated_at,
      customer_name,
      customer_id,
      operator_name,
      order_source,
      payment_details,
      payments_json
    ) VALUES (
      gen_random_uuid(), 
      p_branch_id,
      v_organization_id,
      v_user_id,
      v_code,
      COALESCE((p_sale_data->>'subtotal')::DECIMAL, v_total),
      COALESCE((p_sale_data->>'discount')::DECIMAL, 0),
      COALESCE((p_sale_data->>'total')::DECIMAL, v_total),
      p_sale_data->>'payment_method',
      'completed',
      p_sale_data->>'notes',
      NOW(),
      NOW(),
      p_sale_data->>'customer_name',
      COALESCE((p_sale_data->>'customer_id')::UUID, NULL),
      COALESCE(p_sale_data->>'operator_name', (SELECT operator_name FROM cash_sessions WHERE store_branch_id = p_branch_id AND status = 'open' LIMIT 1)),
      COALESCE(p_sale_data->>'order_source', 'pos'),
      p_sale_data->'payment_details',
      p_payments
    ) 
    RETURNING id INTO v_sale_id;
    
    -- 2. Inserir itens
    INSERT INTO sale_items (
      sale_id,
      product_id,
      quantity,
      unit_price,
      total_price,
      created_at,
      store_branch_id,
      product_name
    )
    SELECT 
      v_sale_id,
      (item->>'product_id')::UUID,
      (item->>'quantity')::INTEGER,
      (item->>'unit_price')::DECIMAL,
      (item->>'quantity')::INTEGER * (item->>'unit_price')::DECIMAL,
      NOW(),
      p_branch_id,
      COALESCE(item->>'product_name', 'Produto')
    FROM jsonb_array_elements(p_items) AS item;
    
    -- 3. Movimentar estoque
    INSERT INTO stock_movements (
      product_id,
      quantity,
      type,
      sale_id,
      store_branch_id,
      created_at,
      organization_id,
      operator_name,
      reason
    )
    SELECT
      (item->>'product_id')::UUID,
      -(item->>'quantity')::INTEGER, -- negativo para saída
      'sale',
      v_sale_id,
      p_branch_id,
      NOW(),
      v_organization_id,
      COALESCE(p_sale_data->>'operator_name', 'Sistema'),
      'Venda #' || v_code
    FROM jsonb_array_elements(p_items) AS item;
    
    -- 4. Atualizar caixa (com base nos métodos de pagamento)
    UPDATE cash_sessions 
    SET 
      total_sales_cash = total_sales_cash + COALESCE((p_payments->>'cash')::DECIMAL, 0),
      total_sales_pix = total_sales_pix + COALESCE((p_payments->>'pix')::DECIMAL, 0),
      total_sales_card = total_sales_card + COALESCE((p_payments->>'card')::DECIMAL, 0),
      updated_at = NOW()
    WHERE store_branch_id = p_branch_id 
      AND status = 'open'
      AND organization_id = v_organization_id;
    
    RETURN v_sale_id;
    
  EXCEPTION WHEN OTHERS THEN
    RAISE;
  END;
END;
$$;


ALTER FUNCTION "public"."create_complete_sale"("p_sale_data" "jsonb", "p_items" "jsonb", "p_payments" "jsonb", "p_branch_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_customer_session"("p_table_id" "uuid", "p_customer_name" "text", "p_organization_id" "uuid", "p_store_branch_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_session_id UUID;
BEGIN
  -- Lock table
  PERFORM 1 FROM public.tables
  WHERE id = p_table_id AND organization_id = p_organization_id
  FOR UPDATE;

  -- Check table exists and is available
  IF NOT EXISTS (
    SELECT 1 FROM public.tables
    WHERE id = p_table_id AND organization_id = p_organization_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Mesa não encontrada.');
  END IF;

  -- Check no active session on this table
  IF EXISTS (
    SELECT 1 FROM public.customer_sessions
    WHERE table_id = p_table_id AND status = 'active'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Mesa já possui sessão ativa.');
  END IF;

  -- Create session
  v_session_id := gen_random_uuid();
  INSERT INTO public.customer_sessions (
    id, organization_id, store_branch_id, table_id,
    customer_name, status, started_at
  ) VALUES (
    v_session_id, p_organization_id, p_store_branch_id, p_table_id,
    p_customer_name, 'active', now()
  );

  -- Mark table as occupied
  UPDATE public.tables
  SET status = 'occupied', updated_at = now()
  WHERE id = p_table_id;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', v_session_id,
    'message', 'Sessão criada com sucesso.'
  );
END;
$$;


ALTER FUNCTION "public"."create_customer_session"("p_table_id" "uuid", "p_customer_name" "text", "p_organization_id" "uuid", "p_store_branch_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_filial_backup"("p_organization_id" "uuid", "p_store_branch_id" "uuid", "p_backup_name" "text", "p_backup_data" "jsonb", "p_is_automatic" boolean DEFAULT false) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."create_filial_backup"("p_organization_id" "uuid", "p_store_branch_id" "uuid", "p_backup_name" "text", "p_backup_data" "jsonb", "p_is_automatic" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_org_policy"("p_table" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $_$
BEGIN
  -- Dropar policies antigas primeiro (idempotente)
  EXECUTE format('DROP POLICY IF EXISTS "%s_select" ON public.%I', p_table, p_table);
  EXECUTE format('DROP POLICY IF EXISTS "%s_insert" ON public.%I', p_table, p_table);
  EXECUTE format('DROP POLICY IF EXISTS "%s_update" ON public.%I', p_table, p_table);
  EXECUTE format('DROP POLICY IF EXISTS "%s_delete" ON public.%I', p_table, p_table);
  -- Também dropar policies genéricas antigas (USING(true))
  EXECUTE format('DROP POLICY IF EXISTS "%s_select_anon" ON public.%I', p_table, p_table);
  EXECUTE format('DROP POLICY IF EXISTS "%s_insert_anon" ON public.%I', p_table, p_table);
  EXECUTE format('DROP POLICY IF EXISTS "%s_update_anon" ON public.%I', p_table, p_table);
  EXECUTE format('DROP POLICY IF EXISTS "%s_delete_anon" ON public.%I', p_table, p_table);
  EXECUTE format('DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.%I', p_table);
  EXECUTE format('DROP POLICY IF EXISTS "Allow all" ON public.%I', p_table);

  -- Criar policies org-scoped
  EXECUTE format($sql$
    CREATE POLICY "%s_select" ON public.%I FOR SELECT USING (
      public.is_superadmin() OR (organization_id = public.get_user_org_id())
    )
  $sql$, p_table, p_table);

  EXECUTE format($sql$
    CREATE POLICY "%s_insert" ON public.%I FOR INSERT WITH CHECK (
      public.is_superadmin() OR (organization_id = public.get_user_org_id())
    )
  $sql$, p_table, p_table);

  EXECUTE format($sql$
    CREATE POLICY "%s_update" ON public.%I FOR UPDATE USING (
      public.is_superadmin() OR (organization_id = public.get_user_org_id())
    ) WITH CHECK (
      public.is_superadmin() OR (organization_id = public.get_user_org_id())
    )
  $sql$, p_table, p_table);

  EXECUTE format($sql$
    CREATE POLICY "%s_delete" ON public.%I FOR DELETE USING (
      public.is_superadmin() OR (organization_id = public.get_user_org_id())
    )
  $sql$, p_table, p_table);

  RAISE NOTICE '✅ Policies (org-only scoped): %', p_table;
END;
$_$;


ALTER FUNCTION "public"."create_org_policy"("p_table" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."daily_health_check"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    issue_count integer;
BEGIN
    -- Contar problemas
    SELECT COUNT(*) INTO issue_count
    FROM health_check_branch_isolation()
    WHERE status LIKE '%ALERTA%';
    
    IF issue_count > 0 THEN
        -- Registrar no log do Supabase
        RAISE NOTICE '⚠️ ALERTA: % problema(s) de isolamento de filial encontrados!', issue_count;
        
        -- Opcional: enviar email/Slack (via Edge Function)
        -- PERFORM supabase_notify('health_alert', 'branch_isolation_issues');
    ELSE
        RAISE NOTICE '✅ Health Check OK - Nenhum problema de isolamento encontrado.';
    END IF;
END;
$$;


ALTER FUNCTION "public"."daily_health_check"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."debug_auth"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
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


ALTER FUNCTION "public"."debug_auth"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."excluir_mesa"("p_table_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_table public.tables%ROWTYPE;
  v_org uuid;
  v_branch uuid;
  v_sales_detached integer := 0;
  v_sessions_detached integer := 0;
  v_nome text;
BEGIN
  -- 1) Localiza a mesa (org/filial/nome vêm da própria linha)
  SELECT * INTO v_table FROM public.tables WHERE id = p_table_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Mesa não encontrada.');
  END IF;

  v_org := v_table.organization_id;
  v_branch := v_table.store_branch_id;
  v_nome := v_table.name;

  -- 2) Isolamento multi-tenant (regra 9): SECURITY DEFINER roda como owner;
  --    RLS não basta. service_role/superadmin bypass; demais validam org e,
  --    para colaborador, a filial da mesa.
  IF current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
     OR public.is_superadmin() THEN
    NULL; -- trusted (servidor / superadmin)
  ELSE
    IF public.get_user_org_id() IS NULL
       OR v_org IS DISTINCT FROM public.get_user_org_id() THEN
      RETURN jsonb_build_object(
        'success', false,
        'message', 'Permissão negada: mesa de outra organização.'
      );
    END IF;
    -- Colaborador de filial: só exclui mesa da PRÓPRIA filial
    IF public.get_user_role() = 'collaborator'
       AND v_branch IS DISTINCT FROM public.get_user_branch_id() THEN
      RETURN jsonb_build_object(
        'success', false,
        'message', 'Permissão negada: colaborador só exclui mesa da própria filial.'
      );
    END IF;
  END IF;

  -- 3) Guard: mesa OCUPADA (sessão ativa) → BLOQUEIA. O operador fecha a
  --    comanda (fechar_comanda) antes de excluir a mesa. Escopo org+branch.
  IF EXISTS (
    SELECT 1 FROM public.customer_sessions
    WHERE table_id = p_table_id AND status = 'active'
      AND organization_id = v_org AND store_branch_id = v_branch
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'MESA_OCUPADA: Feche a comanda ativa da mesa "' || COALESCE(v_nome, '') || '" antes de excluí-la.'
    );
  END IF;

  -- 4) Desvincula TODAS as referências históricas (qualquer status, inclusive
  --    tombstones com deleted_at) — NULL em FK NO ACTION é permitido; o
  --    histórico de vendas/sessões permanece intacto (mesmo estado de domínio
  --    do delivery: table_id NULL).
  UPDATE public.sales
  SET table_id = NULL, updated_at = now()
  WHERE table_id = p_table_id
    AND organization_id = v_org
    AND store_branch_id = v_branch;
  GET DIAGNOSTICS v_sales_detached = ROW_COUNT;

  UPDATE public.customer_sessions
  SET table_id = NULL, updated_at = now()
  WHERE table_id = p_table_id
    AND organization_id = v_org
    AND store_branch_id = v_branch;
  GET DIAGNOSTICS v_sessions_detached = ROW_COUNT;

  -- 5) DELETE físico (agora seguro: nenhuma FK referencia a mesa)
  DELETE FROM public.tables WHERE id = p_table_id;

  RETURN jsonb_build_object(
    'success', true,
    'table_id', p_table_id,
    'detached_sales', v_sales_detached,
    'detached_sessions', v_sessions_detached,
    'message', 'Mesa excluída com sucesso; referências históricas preservadas.'
  );
END;
$$;


ALTER FUNCTION "public"."excluir_mesa"("p_table_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fechar_comanda"("p_session_id" "uuid", "p_payments" "jsonb" DEFAULT '[]'::"jsonb", "p_operator_name" "text" DEFAULT 'Sistema'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_session record;
  v_sale record;
  v_total numeric := 0;
  v_count integer := 0;
  v_first_method text;
  v_result jsonb;
BEGIN
  SELECT * INTO v_session
  FROM customer_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Comanda não encontrada.');
  END IF;

  IF NOT public.is_superadmin() THEN
    IF v_session.organization_id IS DISTINCT FROM public.get_user_org_id()
       OR v_session.store_branch_id IS DISTINCT FROM public.get_user_branch_id()
    THEN
      RETURN jsonb_build_object(
        'success', false,
        'message', 'Permissão negada: comanda de outra organização ou filial.'
      );
    END IF;
  END IF;

  IF v_session.status = 'completed' THEN
    RETURN jsonb_build_object(
      'success', true, 'already_closed', true,
      'message', 'Comanda já estava fechada.'
    );
  END IF;

  IF v_session.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Comanda está cancelada.');
  END IF;

  BEGIN
    v_first_method := p_payments->0->>'method';
  EXCEPTION WHEN OTHERS THEN
    v_first_method := NULL;
  END;

  FOR v_sale IN
    SELECT id, total
    FROM sales
    WHERE customer_session_id = p_session_id
      AND status = 'pending'
      AND deleted_at IS NULL
      AND organization_id = v_session.organization_id
      AND store_branch_id = v_session.store_branch_id
    FOR UPDATE
  LOOP
    UPDATE sales SET
      status = 'completed',
      payments_json = p_payments,
      payment_method = COALESCE(v_first_method, payment_method, 'cash'),
      operator_name = COALESCE(p_operator_name, operator_name),
      updated_at = now()
    WHERE id = v_sale.id;

    v_total := v_total + COALESCE(v_sale.total, 0);
    v_count := v_count + 1;
  END LOOP;

  UPDATE customer_sessions SET
    status = 'completed',
    closed_at = now(),
    updated_at = now()
  WHERE id = p_session_id;

  v_result := jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'total', v_total,
    'finalized_sales', v_count,
    'message', 'Comanda fechada com sucesso.'
  );
  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."fechar_comanda"("p_session_id" "uuid", "p_payments" "jsonb", "p_operator_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_add_to_realtime"("p_table" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = p_table
  ) THEN
    EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', p_table);
    RAISE NOTICE 'Tabela % adicionada ao Realtime', p_table;
  ELSE
    RAISE NOTICE 'Tabela % já está no Realtime', p_table;
  END IF;
END;
$$;


ALTER FUNCTION "public"."fn_add_to_realtime"("p_table" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_bump_version"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.version := old.version + 1;
  return new;
end $$;


ALTER FUNCTION "public"."fn_bump_version"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_ensure_cash_session_org"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := public.get_auth_user_org_id();
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_ensure_cash_session_org"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_ensure_system_user_org"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Superadmin pode ter organization_id NULL (necessário para is_superadmin() retornar true)
  -- Usuários normais continuam recebendo a org padrão se não tiverem uma
  IF NEW.organization_id IS NULL AND NOT COALESCE(NEW.superadmin, false) THEN
    NEW.organization_id := '00000000-0000-0000-0000-000000000001';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_ensure_system_user_org"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_insserir_dlq"("p_operation_type" "text", "p_table_name" "text", "p_record_id" "text" DEFAULT NULL::"text", "p_payload" "jsonb" DEFAULT NULL::"jsonb", "p_error_message" "text" DEFAULT NULL::"text", "p_error_code" "text" DEFAULT NULL::"text", "p_error_status" integer DEFAULT NULL::integer, "p_stack_trace" "text" DEFAULT NULL::"text", "p_source" "text" DEFAULT 'sync_queue'::"text", "p_browser_id" "text" DEFAULT NULL::"text", "p_user_email" "text" DEFAULT NULL::"text", "p_store_branch_id" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_id UUID;
  v_org_id UUID;
  v_branch_id UUID;
BEGIN
  v_id := gen_random_uuid();
  -- get_auth_user_org_id() foi removida (FIX_20260819) → usar get_user_org_id()
  v_org_id := COALESCE(
    get_user_org_id(),
    '00000000-0000-0000-0000-000000000001'
  );
  -- p_store_branch_id chega como text; validar antes de converter
  IF p_store_branch_id IS NOT NULL AND p_store_branch_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
    v_branch_id := p_store_branch_id::uuid;
  END IF;

  INSERT INTO movimentacoes_falhas (
    id, organization_id, operation_type, table_name, record_id, payload,
    error_message, error_code, error_status, stack_trace,
    source, browser_id, user_email, next_retry_at, store_branch_id
  ) VALUES (
    v_id, v_org_id, p_operation_type, p_table_name, p_record_id, p_payload,
    p_error_message, p_error_code, p_error_status, p_stack_trace,
    p_source, p_browser_id, p_user_email, NOW() + INTERVAL '1 minute', v_branch_id
  );
  RETURN v_id;
END;
$_$;


ALTER FUNCTION "public"."fn_insserir_dlq"("p_operation_type" "text", "p_table_name" "text", "p_record_id" "text", "p_payload" "jsonb", "p_error_message" "text", "p_error_code" "text", "p_error_status" integer, "p_stack_trace" "text", "p_source" "text", "p_browser_id" "text", "p_user_email" "text", "p_store_branch_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_log_stock_changes"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF OLD.stock_quantity IS DISTINCT FROM NEW.stock_quantity THEN
    INSERT INTO stock_movements (
      id, organization_id, store_branch_id, product_id, product_name,
      type, quantity, previous_stock, new_stock,
      reason, operator_name, created_at
    ) VALUES (
      gen_random_uuid(),
      NEW.organization_id,
      NEW.store_branch_id,
      NEW.id,
      NEW.name,
      CASE WHEN NEW.stock_quantity > OLD.stock_quantity THEN 'in' ELSE 'out' END,
      ABS(NEW.stock_quantity - OLD.stock_quantity),
      OLD.stock_quantity,
      NEW.stock_quantity,
      'Ajuste automático (trigger)',
      'system',
      NOW()
    );
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_log_stock_changes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_prevent_negative_stock"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.stock_quantity < 0 THEN
    RAISE EXCEPTION 'Estoque nao pode ser negativo. Produto: %, Tentativa: %', NEW.name, NEW.stock_quantity;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_prevent_negative_stock"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_sync_product_name"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF OLD.name IS DISTINCT FROM NEW.name THEN
    UPDATE sale_items SET product_name = NEW.name WHERE product_id = NEW.id;
    UPDATE stock_movements SET product_name = NEW.name WHERE product_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_sync_product_name"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_update_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_update_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_validate_store_branch_id"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_col_exists BOOLEAN;
  v_branch_ok  BOOLEAN;
  v_required   BOOLEAN;
BEGIN
  -- Tabelas que SEMPRE exigem store_branch_id (dados operacionais de filial).
  v_required := TG_TABLE_NAME IN (
    'products', 'categories', 'customers', 'suppliers',
    'sales', 'sale_items', 'financial_transactions',
    'cash_sessions', 'stock_movements', 'system_users',
    'scanned_boletos', 'credit_payments', 'nf_records'
  );

  -- A tabela possui a coluna store_branch_id?
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = TG_TABLE_NAME
      AND column_name = 'store_branch_id'
  ) INTO v_col_exists;

  IF NOT v_col_exists THEN
    RETURN NEW; -- tabela sem coluna de filial → nada a validar
  END IF;

  -- store_branch_id é UUID: nunca é string vazia. Só IS NULL importa.
  IF NEW.store_branch_id IS NULL THEN
    IF v_required THEN
      RAISE EXCEPTION 'Tentativa de salvar % sem store_branch_id!',
        TG_TABLE_NAME;
    END IF;
    RETURN NEW;
  END IF;

  -- Validação por existência (id) — tolerante a organization_id NULL (superadmin)
  SELECT EXISTS (
    SELECT 1 FROM public.store_branches sb
    WHERE sb.id::text = NEW.store_branch_id::text
      AND (sb.active IS NULL OR sb.active = TRUE)
  ) INTO v_branch_ok;

  IF NOT v_branch_ok THEN
    RAISE EXCEPTION 'Tentativa de salvar % com store_branch_id inválido! ID: %, branch: %',
      TG_TABLE_NAME, NEW.id, NEW.store_branch_id;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_validate_store_branch_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gerar_token_e_criar_sessao"("p_user_id" "uuid", "p_email" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_session_id UUID := gen_random_uuid();
    v_now TIMESTAMPTZ := NOW();
    v_not_after TIMESTAMPTZ := v_now + INTERVAL '7 days';
    v_secret TEXT := current_setting('app.jwt_secret', true);
    v_header TEXT;
    v_payload TEXT;
    v_signature TEXT;
    v_token TEXT;
BEGIN
    -- GUARD: apenas chamadas com role service_role (ou superadmin autenticado)
    -- podem forjar sessão. Qualquer outro papel (incl. anon/authenticated) é
    -- bloqueado mesmo se alguém re-grantuar EXECUTE.
    IF COALESCE(current_setting('request.jwt.claims', true)::json->>'role', '') <> 'service_role'
       AND NOT get_is_superadmin() THEN
        RAISE EXCEPTION 'Acesso negado: apenas service_role pode gerar tokens';
    END IF;

    -- Fallback seguro: se app.jwt_secret não estiver configurado, NÃO usar o
    -- segredo hardcoded da versão antiga. O token precisa ser assinado com o
    -- mesmo segredo JWT do Supabase, que NÃO está disponível via SQL.
    -- Antes: v_secret era 'MINHA_CHAVE_SUPER_SECRETA_DE_TESTE' (vazamento).
    IF v_secret IS NULL OR v_secret = '' OR v_secret LIKE '%MINHA_CHAVE_SUPER_SECRETA_DE_TESTE%' THEN
      RAISE EXCEPTION 'Segredo JWT não configurado via app.jwt_secret — geração de token desabilitada (segurança)';
    END IF;

    -- 1. Construir o Payload do JWT (em JSON)
    v_payload := json_build_object(
        'sub', p_user_id::TEXT,
        'email', p_email,
        'role', 'authenticated',
        'exp', EXTRACT(EPOCH FROM v_not_after)::BIGINT,
        'iat', EXTRACT(EPOCH FROM v_now)::BIGINT
    )::TEXT;

    -- 2. Codificar Header e Payload para Base64 (URL-safe)
    v_header := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
    v_payload := replace(replace(replace(encode(convert_to(v_payload, 'utf8'), 'base64'), '+', '-'), '/', '_'), '=', '');

    -- 3. Assinar (Criar a assinatura HMAC-SHA256)
    v_signature := encode(hmac(v_header || '.' || v_payload, v_secret, 'sha256'), 'base64');
    v_signature := replace(replace(replace(v_signature, '+', '-'), '/', '_'), '=', '');

    -- 4. Montar o Token Final
    v_token := v_header || '.' || v_payload || '.' || v_signature;

    -- 5. Inserir o registro na sua tabela
    INSERT INTO sessions (session_id, user_id, email, created_at, not_after, tag)
    VALUES (v_session_id, p_user_id, p_email, v_now, v_not_after, 'manual-session');

    -- 6. Retornar o Token
    RETURN v_token;
END;
$$;


ALTER FUNCTION "public"."gerar_token_e_criar_sessao"("p_user_id" "uuid", "p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_access_level_label"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT CASE public.get_user_access_level()
    WHEN 0 THEN 'Desenvolvedor'
    WHEN 1 THEN 'Administrador'
    WHEN 2 THEN 'Colaborador'
    ELSE 'Desconhecido'
  END;
$$;


ALTER FUNCTION "public"."get_access_level_label"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_current_user_cash_data"() RETURNS TABLE("session_id" "uuid", "store_branch_id" "uuid", "operator_name" "text", "total_cash" numeric, "total_pix" numeric, "total_card" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cs.id,
    cs.store_branch_id,
    cs.operator_name,
    cs.total_sales_cash,
    cs.total_sales_pix,
    cs.total_sales_card
  FROM cash_sessions cs
  WHERE cs.user_id = auth.uid()
    AND cs.status = 'open'
  LIMIT 1;
END;
$$;


ALTER FUNCTION "public"."get_current_user_cash_data"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_current_user_session"() RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_session_id UUID;
BEGIN
  SELECT id INTO v_session_id
  FROM cash_sessions
  WHERE user_id = auth.uid()
    AND status = 'open'
  ORDER BY opened_at DESC
  LIMIT 1;
  
  RETURN v_session_id;
END;
$$;


ALTER FUNCTION "public"."get_current_user_session"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_is_superadmin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(superadmin, FALSE) FROM system_users WHERE id = auth.uid();
$$;


ALTER FUNCTION "public"."get_is_superadmin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_profile"() RETURNS json
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_email TEXT := auth.jwt() ->> 'email';
  v_row system_users%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO v_row
  FROM system_users
  WHERE id = v_uid OR email = v_email
  ORDER BY CASE WHEN id = v_uid THEN 0 ELSE 1 END
  LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN json_build_object(
    'id', v_row.id,
    'name', v_row.name,
    'email', v_row.email,
    'role', v_row.role,
    'organization_id', v_row.organization_id,
    'store_branch_id', v_row.store_branch_id,
    'superadmin', v_row.superadmin,
    'permissions', v_row.permissions,
    'active', v_row.active,
    'created_at', v_row.created_at
  );
END;
$$;


ALTER FUNCTION "public"."get_my_profile"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_access_level"() RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."get_user_access_level"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_branch_id"() RETURNS "uuid"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_session_branch text;
  v_db_branch uuid;
BEGIN
  -- 1. Verificar session config (setado por set_current_branch)
  v_session_branch := current_setting('app.current_branch_id', true);
  IF v_session_branch IS NOT NULL AND v_session_branch <> '' THEN
    RETURN v_session_branch::uuid;
  END IF;
  -- 2. Fallback: valor fixo no banco (collaborators sempre este)
  SELECT store_branch_id INTO v_db_branch
    FROM public.system_users WHERE id = auth.uid();
  RETURN v_db_branch;
END;
$$;


ALTER FUNCTION "public"."get_user_branch_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_org_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
SELECT organization_id FROM public.system_users WHERE id = auth.uid();
$$;


ALTER FUNCTION "public"."get_user_org_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_role"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT role FROM public.system_users WHERE id = auth.uid();
$$;


ALTER FUNCTION "public"."get_user_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO profiles (id, organization_id, name, email, role)
  VALUES (
    NEW.id,
    NULL,
    COALESCE(NEW.raw_user_meta_data ->> 'name', NEW.email),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'role', 'collaborator')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_permission"("p_module" "text", "p_action" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_is_superadmin BOOLEAN;
    v_allowed BOOLEAN;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN FALSE;
    END IF;

    SELECT COALESCE(superadmin, FALSE) INTO v_is_superadmin 
    FROM public.system_users WHERE id = v_user_id;
    
    IF v_is_superadmin THEN
        RETURN TRUE;
    END IF;

    SELECT 
        CASE 
            WHEN p_action = 'read' THEN can_read
            WHEN p_action = 'write' THEN can_write
            WHEN p_action = 'delete' THEN can_delete
            ELSE FALSE
        END INTO v_allowed
    FROM public.user_permissions
    WHERE user_id = v_user_id AND module_name = p_module;

    RETURN COALESCE(v_allowed, FALSE);
END;
$$;


ALTER FUNCTION "public"."has_permission"("p_module" "text", "p_action" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."health_check_branch_isolation"() RETURNS TABLE("table_name" "text", "total_without_branch" bigint, "total_invalid_branch" bigint, "status" "text")
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    tbl text;
    without_count bigint;
    invalid_count bigint;
BEGIN
    FOR tbl IN 
        SELECT t.table_name 
        FROM information_schema.tables t
        WHERE t.table_schema = 'public'
          AND t.table_type = 'BASE TABLE'  -- IGNORA VIEWS!
          AND EXISTS (
              SELECT 1 FROM information_schema.columns c
              WHERE c.table_schema = 'public'
                AND c.table_name = t.table_name
                AND c.column_name = 'store_branch_id'
          )
    LOOP
        -- Contar registros com store_branch_id NULL
        EXECUTE format('SELECT COUNT(*) FROM %I WHERE store_branch_id IS NULL', tbl) INTO without_count;
        
        -- Contar registros com store_branch_id inválido
        EXECUTE format('
            SELECT COUNT(*) FROM %I 
            WHERE store_branch_id NOT IN (SELECT id FROM store_branches)
              AND store_branch_id IS NOT NULL
        ', tbl) INTO invalid_count;
        
        table_name := tbl;
        total_without_branch := without_count;
        total_invalid_branch := invalid_count;
        
        IF without_count > 0 OR invalid_count > 0 THEN
            status := '⚠️ ALERTA - Dados inconsistentes encontrados!';
        ELSE
            status := '✅ OK';
        END IF;
        
        RETURN NEXT;
    END LOOP;
END;
$$;


ALTER FUNCTION "public"."health_check_branch_isolation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."heartbeat_media_device"("p_device_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_org uuid := public.get_auth_user_org_id();
begin
  -- Bloqueia chamada sem organização válida e de outra org (não confia só no RLS,
  -- porque SECURITY DEFINER roda como dono da função e ignoraria RLS sem este guard)
  if v_org is null then
    raise exception 'not allowed';
  end if;

  update public.media_devices
  set last_seen_at = now()
  where id = p_device_id
    and organization_id = v_org
    and (last_seen_at is null or last_seen_at < now() - interval '15 seconds');
end $$;


ALTER FUNCTION "public"."heartbeat_media_device"("p_device_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_collaborator"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.system_users 
    WHERE id = auth.uid() 
      AND role = 'collaborator'
  );
$$;


ALTER FUNCTION "public"."is_collaborator"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_developer"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.system_users 
    WHERE id = auth.uid() 
      AND email = 'emanuel@gmail.com'
      AND role = 'developer'
  );
$$;


ALTER FUNCTION "public"."is_developer"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_org_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.system_users 
    WHERE id = auth.uid() 
      AND role IN ('admin', 'developer')
  );
$$;


ALTER FUNCTION "public"."is_org_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_superadmin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.system_users
    WHERE id = auth.uid()
      AND superadmin = true
      AND organization_id IS NULL
  );
$$;


ALTER FUNCTION "public"."is_superadmin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_user_logout"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE system_users SET last_logout_at = NOW() WHERE id = auth.uid();
END;
$$;


ALTER FUNCTION "public"."mark_user_logout"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."open_cash_session"("p_operator_name" "text", "p_store_branch_id" "uuid", "p_opening_balance" numeric DEFAULT 0) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_session_id UUID;
  v_user_id UUID;
  v_organization_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  -- Verificar se já existe sessão aberta para esta filial
  IF EXISTS (
    SELECT 1 FROM cash_sessions
    WHERE store_branch_id = p_store_branch_id
      AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'Já existe uma sessão de caixa aberta para esta filial. 
      Operador: % - Abertura: %', 
      (SELECT operator_name FROM cash_sessions 
       WHERE store_branch_id = p_store_branch_id AND status = 'open'),
      (SELECT opened_at FROM cash_sessions 
       WHERE store_branch_id = p_store_branch_id AND status = 'open');
  END IF;
  
  -- Buscar organization_id
  SELECT organization_id INTO v_organization_id
  FROM store_branches
  WHERE id = p_store_branch_id;
  
  -- Criar sessão
  INSERT INTO cash_sessions (
    store_branch_id,
    organization_id,
    user_id,
    operator_name,
    opening_balance,
    status,
    opened_at,
    created_at,
    updated_at,
    total_sales_cash,
    total_sales_pix,
    total_sales_card,
    total_sales_credit_account
  ) VALUES (
    p_store_branch_id,
    v_organization_id,
    v_user_id,
    p_operator_name,
    p_opening_balance,
    'open',
    NOW(),
    NOW(),
    NOW(),
    0,
    0,
    0,
    0
  )
  RETURNING id INTO v_session_id;
  
  RETURN v_session_id;
END;
$$;


ALTER FUNCTION "public"."open_cash_session"("p_operator_name" "text", "p_store_branch_id" "uuid", "p_opening_balance" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_duplicate_cash_sessions"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Verificar se o usuário já tem sessão aberta nesta filial
  SELECT COUNT(*) INTO v_count
  FROM cash_sessions
  WHERE store_branch_id = NEW.store_branch_id
    AND user_id = NEW.user_id
    AND status = 'open'
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000');
  
  IF v_count > 0 THEN
    RAISE EXCEPTION 'Usuário já possui uma sessão de caixa aberta nesta filial. 
      Sessão atual: % - %', 
      (SELECT operator_name FROM cash_sessions 
       WHERE store_branch_id = NEW.store_branch_id 
         AND user_id = NEW.user_id 
         AND status = 'open' LIMIT 1),
      (SELECT opened_at FROM cash_sessions 
       WHERE store_branch_id = NEW.store_branch_id 
         AND user_id = NEW.user_id 
         AND status = 'open' LIMIT 1);
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."prevent_duplicate_cash_sessions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_multiple_cash_sessions"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_existing_session_id UUID;
  v_existing_operator TEXT;
BEGIN
  -- Verificar se já existe sessão aberta para esta filial
  SELECT id, operator_name
    INTO v_existing_session_id, v_existing_operator
  FROM cash_sessions
  WHERE store_branch_id = NEW.store_branch_id
    AND status = 'open'
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000')
  LIMIT 1;

  IF v_existing_session_id IS NOT NULL THEN
    RAISE EXCEPTION 'Já existe uma sessão de caixa aberta para esta filial. 
      Operador: % - Sessão: %',
      v_existing_operator, v_existing_session_id;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."prevent_multiple_cash_sessions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_dlq"("p_organization_id" "text", "p_max_items" integer DEFAULT 10) RETURNS TABLE("processed_count" integer, "failed_count" integer, "message" "text")
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_item RECORD;
    v_processed INTEGER := 0;
    v_failed INTEGER := 0;
BEGIN
    FOR v_item IN 
        SELECT * FROM movimentacoes_falhas
        WHERE organization_id = p_organization_id
          AND status IN ('pending', 'retrying')
          AND retry_count < max_retries
        ORDER BY created_at ASC
        LIMIT p_max_items
    LOOP
        BEGIN
            -- TENTAR REPROCESSAR (SIMULAR)
            UPDATE movimentacoes_falhas
            SET 
                retry_count = retry_count + 1,
                last_retry_at = NOW(),
                status = 'resolved',
                resolved_at = NOW()
            WHERE id = v_item.id;
            
            v_processed := v_processed + 1;
        EXCEPTION WHEN OTHERS THEN
            UPDATE movimentacoes_falhas
            SET 
                retry_count = retry_count + 1,
                last_retry_at = NOW(),
                status = CASE 
                    WHEN retry_count >= max_retries THEN 'discarded'
                    ELSE 'retrying'
                END,
                error_message = SQLERRM
            WHERE id = v_item.id;
            
            v_failed := v_failed + 1;
        END;
    END LOOP;
    
    RETURN QUERY SELECT 
        v_processed,
        v_failed,
        'Processados: ' || v_processed || ', Falhas: ' || v_failed AS message;
END;
$$;


ALTER FUNCTION "public"."process_dlq"("p_organization_id" "text", "p_max_items" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_purchase_document"("p_document_id" "uuid", "p_items" "jsonb", "p_operator_name" "text" DEFAULT 'Sistema'::"text", "p_apply_margin" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_doc RECORD;
    v_item RECORD;
    v_product RECORD;
    v_current_stock INTEGER;
    v_new_stock INTEGER;
    v_quantity INTEGER;
    v_unit_price NUMERIC;
    v_suggested_price NUMERIC;
BEGIN
    -- Busca o documento
    SELECT * INTO v_doc FROM nf_records WHERE id = p_document_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Documento não encontrado');
    END IF;

    -- Verifica se já foi processado (evita dupla execução)
    IF v_doc.status = 'confirmed' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Documento já processado');
    END IF;

    -- Processa cada item
    FOR v_item IN
        SELECT * FROM jsonb_array_elements(p_items) AS item
    LOOP
        v_quantity := (v_item->>'quantity')::INTEGER;
        v_unit_price := COALESCE((v_item->>'unitPrice')::NUMERIC, 0);

        -- Busca produto (pode ser por id ou por nome)
        SELECT * INTO v_product
        FROM products
        WHERE id = (v_item->>'productId')::UUID
          AND organization_id = v_doc.organization_id
          AND store_branch_id = v_doc.store_branch_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'error', 'Produto não encontrado: ' || (v_item->>'productId')::text);
        END IF;

        -- Atualiza custo se informado
        IF v_unit_price > 0 THEN
            UPDATE products SET cost_price = v_unit_price WHERE id = v_product.id;
        END IF;

        -- Calcula novo estoque
        v_current_stock := v_product.stock_quantity;
        v_new_stock := v_current_stock + v_quantity;

        -- Atualiza estoque
        UPDATE products SET stock_quantity = v_new_stock, updated_at = NOW() WHERE id = v_product.id;

        -- Se solicitado, aplica margem e atualiza preço de venda
        IF p_apply_margin AND v_unit_price > 0 AND v_product.margin_percent > 0 THEN
            v_suggested_price := ROUND(v_unit_price * (1 + v_product.margin_percent / 100.0), 2);
            UPDATE products SET sale_price = v_suggested_price WHERE id = v_product.id;
        END IF;

        -- Registra movimentação com vínculo ao documento
        INSERT INTO stock_movements (
            id, organization_id, store_branch_id, product_id, product_name,
            type, quantity, previous_stock, new_stock,
            reason, operator_name, sale_id, purchase_document_id, created_at
        ) VALUES (
            gen_random_uuid(),
            v_doc.organization_id, v_doc.store_branch_id,
            v_product.id, v_product.name,
            'in', v_quantity, v_current_stock, v_new_stock,
            'Entrada doc ' || COALESCE(v_doc.document_number, v_doc.id::text),
            p_operator_name,
            NULL,
            p_document_id,
            NOW()
        );
    END LOOP;

    -- Marca documento como confirmado e registra processamento
    UPDATE nf_records
    SET status = 'confirmed',
        processed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_document_id;

    RETURN jsonb_build_object('success', true, 'message', 'Documento processado com sucesso');
END;
$$;


ALTER FUNCTION "public"."process_purchase_document"("p_document_id" "uuid", "p_items" "jsonb", "p_operator_name" "text", "p_apply_margin" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_sale_transaction"("p_sale_id" "uuid", "p_product_id" "text" DEFAULT NULL::"text", "p_quantity" integer DEFAULT 0, "p_unit_price" numeric DEFAULT 0, "p_discount" numeric DEFAULT 0, "p_total" numeric DEFAULT 0, "p_reason" "text" DEFAULT 'Venda PDV'::"text", "p_operator_name" "text" DEFAULT 'Sistema'::"text", "p_organization_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000001'::"uuid", "p_store_branch_id" "uuid" DEFAULT NULL::"uuid", "p_sale_items" "jsonb" DEFAULT '[]'::"jsonb") RETURNS TABLE("success" boolean, "message" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_item RECORD;
    v_ingredient RECORD;
    v_product RECORD;
BEGIN
    BEGIN
        -- Percorre cada item da venda (itens originais)
        FOR v_item IN
            SELECT
                (item->>'product_id')::UUID AS product_id,
                (item->>'quantity')::INTEGER AS quantity
            FROM jsonb_array_elements(p_sale_items) AS item
        LOOP
            -- Verifica se o produto é composto
            SELECT * INTO v_product
            FROM products
            WHERE id = v_item.product_id
              AND organization_id = p_organization_id
              AND store_branch_id = p_store_branch_id
            FOR UPDATE;

            IF NOT FOUND THEN
                RETURN QUERY SELECT FALSE, 'Produto não encontrado na org/filial: ' || v_item.product_id::text;
                RETURN;
            END IF;

            IF v_product.is_composite THEN
                -- Expande ingredientes da receita e processa cada um
                FOR v_ingredient IN
                    SELECT pr.ingredient_product_id, pr.quantity
                    FROM product_recipes pr
                    WHERE pr.composite_product_id = v_product.id
                      AND pr.organization_id = p_organization_id
                      AND pr.store_branch_id = p_store_branch_id
                LOOP
                    PERFORM process_single_item(
                        v_ingredient.ingredient_product_id,
                        (v_ingredient.quantity * v_item.quantity)::INTEGER,
                        p_organization_id,
                        p_store_branch_id,
                        p_sale_id,
                        p_operator_name
                    );
                END LOOP;
            ELSE
                PERFORM process_single_item(
                    v_item.product_id,
                    v_item.quantity,
                    p_organization_id,
                    p_store_branch_id,
                    p_sale_id,
                    p_operator_name
                );
            END IF;
        END LOOP;

        RETURN QUERY SELECT TRUE, 'Venda processada com sucesso';
    EXCEPTION WHEN OTHERS THEN
        RETURN QUERY SELECT FALSE, SQLERRM;
    END;
END;
$$;


ALTER FUNCTION "public"."process_sale_transaction"("p_sale_id" "uuid", "p_product_id" "text", "p_quantity" integer, "p_unit_price" numeric, "p_discount" numeric, "p_total" numeric, "p_reason" "text", "p_operator_name" "text", "p_organization_id" "uuid", "p_store_branch_id" "uuid", "p_sale_items" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_single_item"("p_product_id" "uuid", "p_quantity" integer, "p_org_id" "uuid", "p_branch_id" "uuid", "p_sale_id" "uuid", "p_operator_name" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_product RECORD;
    v_fraction_source RECORD;
    v_container RECORD;
    v_new_container_id UUID;
    v_yield INTEGER;
    v_remaining_needed INTEGER := p_quantity;
    v_consume INTEGER;
    v_new_stock INTEGER;
BEGIN
    -- Busca o produto vendido
    SELECT * INTO v_product
    FROM products
    WHERE id = p_product_id
      AND organization_id = p_org_id
      AND store_branch_id = p_branch_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Produto não encontrado: %', p_product_id;
    END IF;

    -- Verifica se o produto é uma fração de algum fragmentável
    SELECT * INTO v_fraction_source
    FROM products
    WHERE fraction_product_id = p_product_id
      AND is_fragmentable = true
      AND organization_id = p_org_id
      AND store_branch_id = p_branch_id
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
        -- É fração: consumir de open_containers
        -- 1) Tenta consumir de containers abertos existentes
        FOR v_container IN
            SELECT * FROM open_containers
            WHERE organization_id = p_org_id
              AND store_branch_id = p_branch_id
              AND product_id = v_fraction_source.id
              AND status = 'open'
              AND remaining_quantity > 0
            ORDER BY opened_at ASC
            FOR UPDATE
        LOOP
            IF v_remaining_needed = 0 THEN
                EXIT;
            END IF;
            v_consume := LEAST(v_remaining_needed, v_container.remaining_quantity);
            UPDATE open_containers
            SET remaining_quantity = remaining_quantity - v_consume,
                status = CASE WHEN remaining_quantity - v_consume = 0 THEN 'empty' ELSE status END,
                updated_at = NOW()
            WHERE id = v_container.id;
            v_remaining_needed := v_remaining_needed - v_consume;
        END LOOP;

        -- 2) Se ainda falta, abre novas garrafas
        WHILE v_remaining_needed > 0 LOOP
            -- Verifica estoque fechado do fragmentável
            IF v_fraction_source.stock_quantity <= 0 THEN
                RAISE EXCEPTION 'Estoque insuficiente de garrafas para %', v_fraction_source.name;
            END IF;

            -- Deduz 1 garrafa do estoque fechado
            UPDATE products
            SET stock_quantity = stock_quantity - 1,
                updated_at = NOW()
            WHERE id = v_fraction_source.id
            RETURNING stock_quantity INTO v_new_stock;

            -- Registra movimentação de saída (abertura de garrafa)
            INSERT INTO stock_movements (
                id, organization_id, store_branch_id, product_id, product_name,
                type, quantity, previous_stock, new_stock, reason, operator_name, sale_id, created_at
            ) VALUES (
                gen_random_uuid(),
                p_org_id, p_branch_id, v_fraction_source.id, v_fraction_source.name,
                'out', 1, v_fraction_source.stock_quantity, v_new_stock,
                'Abertura de garrafa para venda', p_operator_name, p_sale_id, NOW()
            );

            -- Cria novo container com rendimento total
            INSERT INTO open_containers (
                id, organization_id, store_branch_id, product_id,
                remaining_quantity, opened_at, status, created_at, updated_at
            ) VALUES (
                gen_random_uuid(),
                p_org_id, p_branch_id, v_fraction_source.id,
                v_fraction_source.yield_count, NOW(), 'open', NOW(), NOW()
            )
            RETURNING id, remaining_quantity INTO v_new_container_id, v_yield;

            -- Consome do container recém-criado
            v_consume := LEAST(v_remaining_needed, v_yield);
            UPDATE open_containers
            SET remaining_quantity = remaining_quantity - v_consume,
                status = CASE WHEN remaining_quantity - v_consume = 0 THEN 'empty' ELSE 'open' END,
                updated_at = NOW()
            WHERE id = v_new_container_id;

            v_remaining_needed := v_remaining_needed - v_consume;
            -- Atualiza estoque local para próximo loop
            v_fraction_source.stock_quantity := v_new_stock;
        END LOOP;
    ELSE
        -- Produto normal (ou fragmentável vendido como garrafa inteira)
        IF v_product.stock_quantity < p_quantity THEN
            RAISE EXCEPTION 'Estoque insuficiente para %', v_product.name;
        END IF;

        v_new_stock := v_product.stock_quantity - p_quantity;
        UPDATE products
        SET stock_quantity = v_new_stock,
            updated_at = NOW()
        WHERE id = v_product.id;

        -- Registra movimentação de saída
        INSERT INTO stock_movements (
            id, organization_id, store_branch_id, product_id, product_name,
            type, quantity, previous_stock, new_stock, reason, operator_name, sale_id, created_at
        ) VALUES (
            gen_random_uuid(),
            p_org_id, p_branch_id, v_product.id, v_product.name,
            'out', p_quantity, v_product.stock_quantity, v_new_stock,
            'Venda', p_operator_name, p_sale_id, NOW()
        );
    END IF;
END;
$$;


ALTER FUNCTION "public"."process_single_item"("p_product_id" "uuid", "p_quantity" integer, "p_org_id" "uuid", "p_branch_id" "uuid", "p_sale_id" "uuid", "p_operator_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recover_orphan_sale"("p_sale_id" "uuid", "p_items" "jsonb") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_organization_id UUID;
  v_store_branch_id UUID;
  v_total DECIMAL := 0;
  v_item_count INTEGER;
  v_product_exists BOOLEAN;
  v_product_name TEXT;
BEGIN
  -- Verificar se a venda existe e está órfã
  IF NOT EXISTS (
    SELECT 1 FROM sales s
    LEFT JOIN sale_items si ON s.id = si.sale_id
    WHERE s.id = p_sale_id
      AND si.sale_id IS NULL
      AND s.status = 'completed'
      AND s.deleted_at IS NULL
  ) THEN
    RETURN 'Venda não encontrada ou já possui itens';
  END IF;
  
  -- Buscar dados da venda
  SELECT organization_id, store_branch_id, total
  INTO v_organization_id, v_store_branch_id, v_total
  FROM sales
  WHERE id = p_sale_id;
  
  -- Verificar se os produtos existem antes de inserir
  FOR v_product_exists IN (
    SELECT EXISTS (
      SELECT 1 FROM products 
      WHERE id = (item->>'product_id')::UUID
    )
    FROM jsonb_array_elements(p_items) AS item
  ) LOOP
    IF NOT v_product_exists THEN
      RETURN 'Produto não encontrado. Execute primeiro o script para criar o produto genérico.';
    END IF;
  END LOOP;
  
  -- Inserir os itens
  INSERT INTO sale_items (
    sale_id,
    product_id,
    quantity,
    unit_price,
    total_price,
    created_at,
    store_branch_id,
    product_name
  )
  SELECT 
    p_sale_id,
    (item->>'product_id')::UUID,
    (item->>'quantity')::INTEGER,
    COALESCE((item->>'unit_price')::DECIMAL, 0),
    COALESCE((item->>'quantity')::INTEGER, 0) * COALESCE((item->>'unit_price')::DECIMAL, 0),
    NOW(),
    v_store_branch_id,
    COALESCE(item->>'product_name', 'Produto desconhecido')
  FROM jsonb_array_elements(p_items) AS item;
  
  -- Atualizar o total da venda
  UPDATE sales 
  SET 
    total = (
      SELECT COALESCE(SUM(total_price), 0)
      FROM sale_items
      WHERE sale_id = p_sale_id
    ),
    updated_at = NOW()
  WHERE id = p_sale_id;
  
  -- Contar itens inseridos
  SELECT COUNT(*) INTO v_item_count
  FROM sale_items
  WHERE sale_id = p_sale_id;
  
  RETURN 'Venda ' || p_sale_id || ' recuperada com ' || v_item_count || ' itens';
END;
$$;


ALTER FUNCTION "public"."recover_orphan_sale"("p_sale_id" "uuid", "p_items" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reprocessar_movimentacoes_falhas"() RETURNS TABLE("processados" integer, "status_mensagem" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $_$
DECLARE
  v_count INTEGER := 0;
  v_record RECORD;
  v_sql TEXT;
  v_payload_json JSONB;
  v_has_updated_at BOOLEAN;
  v_table_name TEXT;
  v_new_status TEXT;
BEGIN
  -- Loop através das falhas pendentes
  FOR v_record IN (
    SELECT 
      id,
      operation_type,
      table_name,
      record_id,
      payload,
      organization_id,
      retry_count,
      max_retries,
      error_message
    FROM public.movimentacoes_falhas
    WHERE status = 'pending'
      AND retry_count < max_retries
    ORDER BY created_at ASC
    LIMIT 100
  ) LOOP
    BEGIN
      -- PEGAR O PAYLOAD COMO JSONB
      v_payload_json := v_record.payload;
      v_table_name := v_record.table_name;
      
      -- VERIFICAR SE A TABELA TEM A COLUNA updated_at
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = v_table_name
          AND column_name = 'updated_at'
      ) INTO v_has_updated_at;
      
      -- TRATAMENTO ESPECIAL PARA TABELAS ESPECÍFICAS
      IF v_table_name = 'cash_sessions' THEN
        -- Para cash_sessions, fazer INSERT direto com campos específicos
        v_sql := '
          INSERT INTO public.cash_sessions (
            id, organization_id, store_branch_id, operator_name, 
            opening_balance, closing_balance, expected_balance,
            total_sales_cash, total_sales_pix, total_sales_card,
            total_sales_credit_account, suprimentos, sangrias,
            status, opened_at, closed_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
          )
          ON CONFLICT (id) DO NOTHING
        ';
        
        EXECUTE v_sql USING 
          COALESCE(v_payload_json->>'id', gen_random_uuid()::text)::uuid,
          COALESCE(v_payload_json->>'organization_id', '00000000-0000-0000-0000-000000000001')::uuid,
          COALESCE(v_payload_json->>'store_branch_id', NULL)::uuid,
          v_payload_json->>'operator_name',
          COALESCE((v_payload_json->>'opening_balance')::numeric, 0),
          COALESCE((v_payload_json->>'closing_balance')::numeric, NULL),
          COALESCE((v_payload_json->>'expected_balance')::numeric, NULL),
          COALESCE((v_payload_json->>'total_sales_cash')::numeric, 0),
          COALESCE((v_payload_json->>'total_sales_pix')::numeric, 0),
          COALESCE((v_payload_json->>'total_sales_card')::numeric, 0),
          COALESCE((v_payload_json->>'total_sales_credit_account')::numeric, 0),
          COALESCE((v_payload_json->>'suprimentos')::numeric, 0),
          COALESCE((v_payload_json->>'sangrias')::numeric, 0),
          COALESCE(v_payload_json->>'status', 'open'),
          COALESCE((v_payload_json->>'opened_at')::timestamptz, NOW()),
          COALESCE((v_payload_json->>'closed_at')::timestamptz, NULL);
          
      ELSIF v_table_name = 'sales' THEN
        -- Para sales, fazer INSERT com campos específicos
        v_sql := '
          INSERT INTO public.sales (
            id, organization_id, store_branch_id, user_id, customer_id,
            code, operator_name, subtotal, discount, total,
            payment_method, status, notes, customer_name,
            created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
          )
          ON CONFLICT (id) DO UPDATE SET
            updated_at = NOW()
        ';
        
        EXECUTE v_sql USING 
          COALESCE(v_payload_json->>'id', gen_random_uuid()::text)::uuid,
          COALESCE(v_payload_json->>'organization_id', '00000000-0000-0000-0000-000000000001')::uuid,
          COALESCE(v_payload_json->>'store_branch_id', NULL)::uuid,
          COALESCE(v_payload_json->>'user_id', NULL)::uuid,
          COALESCE(v_payload_json->>'customer_id', NULL)::uuid,
          v_payload_json->>'code',
          v_payload_json->>'operator_name',
          COALESCE((v_payload_json->>'subtotal')::numeric, 0),
          COALESCE((v_payload_json->>'discount')::numeric, 0),
          COALESCE((v_payload_json->>'total')::numeric, 0),
          v_payload_json->>'payment_method',
          v_payload_json->>'status',
          v_payload_json->>'notes',
          v_payload_json->>'customer_name',
          COALESCE((v_payload_json->>'created_at')::timestamptz, NOW()),
          NOW();
          
      ELSIF v_table_name = 'stock_movements' THEN
        -- Para stock_movements, fazer INSERT com campos específicos
        v_sql := '
          INSERT INTO public.stock_movements (
            id, organization_id, store_branch_id, product_id,
            product_name, type, quantity, previous_stock,
            new_stock, reason, operator_name, created_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
          )
          ON CONFLICT (id) DO NOTHING
        ';
        
        EXECUTE v_sql USING 
          COALESCE(v_payload_json->>'id', gen_random_uuid()::text)::uuid,
          COALESCE(v_payload_json->>'organization_id', '00000000-0000-0000-0000-000000000001')::uuid,
          COALESCE(v_payload_json->>'store_branch_id', NULL)::uuid,
          COALESCE(v_payload_json->>'product_id', NULL)::uuid,
          v_payload_json->>'product_name',
          v_payload_json->>'type',
          COALESCE((v_payload_json->>'quantity')::integer, 0),
          COALESCE((v_payload_json->>'previous_stock')::integer, 0),
          COALESCE((v_payload_json->>'new_stock')::integer, 0),
          v_payload_json->>'reason',
          v_payload_json->>'operator_name',
          COALESCE((v_payload_json->>'created_at')::timestamptz, NOW());
          
      ELSE
        -- Para outras tabelas, usar jsonb_populate_record genérico
        IF v_has_updated_at THEN
          v_sql := format('
            INSERT INTO %I SELECT * FROM jsonb_populate_record(NULL::%I, $1)
            ON CONFLICT (id) DO UPDATE SET 
              updated_at = NOW()
          ', v_table_name, v_table_name);
        ELSE
          v_sql := format('
            INSERT INTO %I SELECT * FROM jsonb_populate_record(NULL::%I, $1)
            ON CONFLICT (id) DO NOTHING
          ', v_table_name, v_table_name);
        END IF;
        
        EXECUTE v_sql USING v_payload_json;
      END IF;
      
      -- Se chegou aqui, deu certo: marcar como concluído
      -- Usando 'completed' que é um status válido
      UPDATE public.movimentacoes_falhas
      SET status = 'completed',
          resolved_at = NOW(),
          error_message = NULL,
          retry_count = retry_count + 1
      WHERE id = v_record.id;
      
      v_count := v_count + 1;
      
    EXCEPTION WHEN OTHERS THEN
      -- Se falhou, incrementar contagem de tentativas
      -- Usando 'pending' ou 'failed' que são status válidos
      v_new_status := CASE 
        WHEN v_record.retry_count + 1 >= v_record.max_retries THEN 'failed'
        ELSE 'pending'
      END;
      
      UPDATE public.movimentacoes_falhas
      SET retry_count = retry_count + 1,
          next_retry_at = NOW() + (interval '1 minute' * (retry_count + 1)),
          error_message = SQLERRM,
          status = v_new_status
      WHERE id = v_record.id;
    END;
  END LOOP;
  
  -- Retornar resultado
  RETURN QUERY SELECT v_count, 'Processados com sucesso'::TEXT;
END;
$_$;


ALTER FUNCTION "public"."reprocessar_movimentacoes_falhas"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."restore_product_stock"("p_product_id" "uuid", "p_quantity" integer, "p_org_id" "uuid", "p_branch_id" "uuid", "p_sale_id" "uuid", "p_operator_name" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_product RECORD;
    v_fraction_source RECORD;
    v_container RECORD;
    v_remaining_to_restore INTEGER := p_quantity;
    v_consume INTEGER;
    v_new_stock INTEGER;
    v_capacity INTEGER;
BEGIN
    SELECT * INTO v_product
    FROM products
    WHERE id = p_product_id
      AND organization_id = p_org_id
      AND store_branch_id = p_branch_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Produto não encontrado: %', p_product_id;
    END IF;

    -- Verifica se é fração de algum fragmentável
    SELECT * INTO v_fraction_source
    FROM products
    WHERE fraction_product_id = p_product_id
      AND is_fragmentable = true
      AND organization_id = p_org_id
      AND store_branch_id = p_branch_id
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
        -- É fração: restaurar containers abertos
        -- Tenta reabastecer containers existentes (prioriza abertos, depois vazios recém-criados)
        FOR v_container IN
            SELECT * FROM open_containers
            WHERE organization_id = p_org_id
              AND store_branch_id = p_branch_id
              AND product_id = v_fraction_source.id
              AND status IN ('open', 'empty')
              AND remaining_quantity < v_fraction_source.yield_count
            ORDER BY
                CASE WHEN status = 'open' THEN 0 ELSE 1 END,
                opened_at DESC
            FOR UPDATE
        LOOP
            IF v_remaining_to_restore = 0 THEN
                EXIT;
            END IF;

            v_capacity := v_fraction_source.yield_count - v_container.remaining_quantity;
            v_consume := LEAST(v_remaining_to_restore, v_capacity);

            IF v_consume > 0 THEN
                UPDATE open_containers
                SET remaining_quantity = remaining_quantity + v_consume,
                    status = 'open',
                    updated_at = NOW()
                WHERE id = v_container.id;

                v_remaining_to_restore := v_remaining_to_restore - v_consume;
            END IF;
        END LOOP;

        -- Se ainda faltam doses, abre novas garrafas (estoque fechado) e cria containers
        WHILE v_remaining_to_restore > 0 LOOP
            -- Aumenta o estoque fechado em 1 garrafa
            UPDATE products
            SET stock_quantity = stock_quantity + 1,
                updated_at = NOW()
            WHERE id = v_fraction_source.id
            RETURNING stock_quantity INTO v_new_stock;

            -- Registra movimentação de entrada (devolução de garrafa)
            INSERT INTO stock_movements (
                id, organization_id, store_branch_id, product_id, product_name,
                type, quantity, previous_stock, new_stock, reason, operator_name, sale_id, created_at
            ) VALUES (
                gen_random_uuid(),
                p_org_id, p_branch_id, v_fraction_source.id, v_fraction_source.name,
                'in', 1, v_fraction_source.stock_quantity, v_new_stock,
                'Cancelamento de venda (restauração)', p_operator_name, p_sale_id, NOW()
            );

            -- Cria um container com yield_count doses
            INSERT INTO open_containers (
                id, organization_id, store_branch_id, product_id,
                remaining_quantity, opened_at, status, created_at, updated_at
            ) VALUES (
                gen_random_uuid(),
                p_org_id, p_branch_id, v_fraction_source.id,
                LEAST(v_remaining_to_restore, v_fraction_source.yield_count), NOW(), 'open', NOW(), NOW()
            )
            RETURNING id, remaining_quantity INTO v_container.id, v_consume;

            v_remaining_to_restore := v_remaining_to_restore - v_consume;
            v_fraction_source.stock_quantity := v_new_stock;
        END LOOP;
    ELSE
        -- Produto normal: devolve ao estoque
        v_new_stock := v_product.stock_quantity + p_quantity;
        UPDATE products SET stock_quantity = v_new_stock, updated_at = NOW() WHERE id = v_product.id;

        INSERT INTO stock_movements (
            id, organization_id, store_branch_id, product_id, product_name,
            type, quantity, previous_stock, new_stock, reason, operator_name, sale_id, created_at
        ) VALUES (
            gen_random_uuid(),
            p_org_id, p_branch_id, v_product.id, v_product.name,
            'in', p_quantity, v_product.stock_quantity, v_new_stock,
            'Cancelamento de venda (restauração)', p_operator_name, p_sale_id, NOW()
        );
    END IF;
END;
$$;


ALTER FUNCTION "public"."restore_product_stock"("p_product_id" "uuid", "p_quantity" integer, "p_org_id" "uuid", "p_branch_id" "uuid", "p_sale_id" "uuid", "p_operator_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_current_branch"("p_branch_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM set_config('app.current_branch_id', p_branch_id::text, false);
END;
$$;


ALTER FUNCTION "public"."set_current_branch"("p_branch_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."solicitar_fechamento_comanda"("p_sale_ids" "uuid"[], "p_session_token" "text", "p_payment_method" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_owned integer;
  v_total numeric := 0;
  v_updated integer := 0;
  v_sale record;
BEGIN
  -- 1) Argumentos obrigatórios (fail-closed)
  IF p_sale_ids IS NULL OR array_length(p_sale_ids, 1) IS NULL OR array_length(p_sale_ids, 1) = 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Nenhuma venda informada.');
  END IF;
  IF p_session_token IS NULL OR btrim(p_session_token) = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Token de sessão inválido.');
  END IF;
  IF p_payment_method IS NULL OR p_payment_method NOT IN ('cash', 'pix', 'credit_card', 'debit_card') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Forma de pagamento inválida.');
  END IF;

  -- 2) Posse: TODAS as vendas devem pertencer à MESMA sessão ATIVA com o token
  --    informado (o cliente anon não tem auth.uid() — o token é a âncora de
  --    identidade). Escopo org+branch da sessão vs venda por defesa em camadas
  --    (impede casamento cruzado de org/filial). Se QUALQUER venda não for
  --    vinculada, a operação inteira falha (sem atualização parcial/probe).
  SELECT count(*) INTO v_owned
  FROM public.sales s
  JOIN public.customer_sessions cs ON cs.id = s.customer_session_id
  WHERE s.id = ANY(p_sale_ids)
    AND s.deleted_at IS NULL
    AND cs.session_token = p_session_token
    AND cs.status = 'active'
    AND cs.organization_id = s.organization_id
    AND cs.store_branch_id = s.store_branch_id;

  IF v_owned <> array_length(p_sale_ids, 1) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Alguma venda não pertence à sessão ativa informada.'
    );
  END IF;

  -- 3) Marca cada venda como pedido de fechamento. NÃO toca estoque /
  --    stock_movements / cash_sessions (a baixa já ocorreu no addSale via
  --    process_sale_transaction; o fechamento final é do operador via
  --    fechar_comanda). Amount derivado do total REAL da venda (s.total), não
  --    do payload do cliente.
  FOR v_sale IN
    SELECT s.id, s.total
    FROM public.sales s
    JOIN public.customer_sessions cs ON cs.id = s.customer_session_id
    WHERE s.id = ANY(p_sale_ids)
      AND s.deleted_at IS NULL
      AND cs.session_token = p_session_token
      AND cs.status = 'active'
    FOR UPDATE OF s
  LOOP
    UPDATE public.sales SET
      status = 'pending',
      kitchen_status = 'closing_request',
      payments_json = jsonb_build_array(
        jsonb_build_object('method', p_payment_method, 'amount', COALESCE(v_sale.total, 0))
      ),
      payment_method = p_payment_method,
      updated_at = now()
    WHERE id = v_sale.id;

    v_total := v_total + COALESCE(v_sale.total, 0);
    v_updated := v_updated + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'updated_sales', v_updated,
    'total', v_total,
    'message', 'Pedido de fechamento enviado.'
  );
END;
$$;


ALTER FUNCTION "public"."solicitar_fechamento_comanda"("p_sale_ids" "uuid"[], "p_session_token" "text", "p_payment_method" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transfer_table_session"("p_session_id" "uuid", "p_new_table_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_session RECORD;
  v_new_table RECORD;
BEGIN
  -- Lock both tables
  SELECT * INTO v_session
  FROM public.customer_sessions
  WHERE id = p_session_id AND status = 'active'
  FOR UPDATE;

  IF v_session IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sessão ativa não encontrada.');
  END IF;

  -- Check new table availability
  SELECT * INTO v_new_table
  FROM public.tables
  WHERE id = p_new_table_id
  FOR UPDATE;

  IF v_new_table IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Mesa destino não encontrada.');
  END IF;

  -- Check if new table has an active session
  IF EXISTS (
    SELECT 1 FROM public.customer_sessions
    WHERE table_id = p_new_table_id AND status = 'active'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Mesa destino já possui sessão ativa.');
  END IF;

  -- Move session
  UPDATE public.customer_sessions
  SET table_id = p_new_table_id, updated_at = now()
  WHERE id = p_session_id;

  -- Update old table status
  UPDATE public.tables
  SET status = 'available', updated_at = now()
  WHERE id = v_session.table_id;

  -- Update new table status
  UPDATE public.tables
  SET status = 'occupied', updated_at = now()
  WHERE id = p_new_table_id;

  RETURN jsonb_build_object('success', true, 'message', 'Sessão transferida com sucesso.');
END;
$$;


ALTER FUNCTION "public"."transfer_table_session"("p_session_id" "uuid", "p_new_table_id" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."ai_insights" (
    "id" "text" NOT NULL,
    "insights" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "generated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "today_revenue" numeric(10,2) DEFAULT 0,
    "total_sales" integer DEFAULT 0,
    "ticket_medio" numeric(10,2) DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "store_branch_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."ai_insights" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."api_keys" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "store_branch_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "key_hash" "text" NOT NULL,
    "key_prefix" "text" NOT NULL,
    "permissions" "jsonb" DEFAULT '["read:products", "read:sales"]'::"jsonb",
    "is_active" boolean DEFAULT true,
    "last_used_at" timestamp with time zone,
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."api_keys" REPLICA IDENTITY FULL;


ALTER TABLE "public"."api_keys" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_log" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "store_branch_id" "uuid",
    "user_id" "uuid" NOT NULL,
    "user_name" "text" NOT NULL,
    "user_email" "text" NOT NULL,
    "action" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "text",
    "entity_name" "text",
    "old_value" "jsonb",
    "new_value" "jsonb",
    "ip_address" "text",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."audit_log" REPLICA IDENTITY FULL;


ALTER TABLE "public"."audit_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."branch_themes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "store_branch_id" "uuid" NOT NULL,
    "primary_color" "text" DEFAULT '#4f46e5'::"text",
    "secondary_color" "text" DEFAULT '#6366f1'::"text",
    "accent_color" "text" DEFAULT '#f59e0b'::"text",
    "bg_color" "text" DEFAULT '#09090b'::"text",
    "logo_url" "text",
    "favicon_url" "text",
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."branch_themes" REPLICA IDENTITY FULL;


ALTER TABLE "public"."branch_themes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cash_sessions" (
    "opening_balance" numeric(12,2) DEFAULT 0,
    "closing_balance" numeric(12,2),
    "expected_balance" numeric(12,2) DEFAULT 0,
    "status" "text" DEFAULT 'open'::"text",
    "opened_at" timestamp with time zone DEFAULT "now"(),
    "closed_at" timestamp with time zone,
    "operator_name" "text",
    "total_sales_cash" numeric DEFAULT 0,
    "total_sales_pix" numeric DEFAULT 0,
    "total_sales_card" numeric DEFAULT 0,
    "total_sales_credit_account" numeric DEFAULT 0,
    "suprimentos" numeric DEFAULT 0,
    "sangrias" numeric DEFAULT 0,
    "id" "uuid" NOT NULL,
    "organization_id" "uuid",
    "user_id" "uuid",
    "store_branch_id" "uuid" NOT NULL,
    "notes" "text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "session_number" integer DEFAULT 1,
    "is_primary" boolean DEFAULT false,
    "user_session_id" "uuid" DEFAULT "gen_random_uuid"(),
    CONSTRAINT "chk_cash_status" CHECK (("status" = ANY (ARRAY['open'::"text", 'closed'::"text"])))
);

ALTER TABLE ONLY "public"."cash_sessions" REPLICA IDENTITY FULL;


ALTER TABLE "public"."cash_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cash_sessions_backup_20260902" (
    "opening_balance" numeric(12,2),
    "closing_balance" numeric(12,2),
    "expected_balance" numeric(12,2),
    "status" "text",
    "opened_at" timestamp with time zone,
    "closed_at" timestamp with time zone,
    "operator_name" "text",
    "total_sales_cash" numeric,
    "total_sales_pix" numeric,
    "total_sales_card" numeric,
    "total_sales_credit_account" numeric,
    "suprimentos" numeric,
    "sangrias" numeric,
    "id" "uuid",
    "organization_id" "uuid",
    "user_id" "uuid",
    "store_branch_id" "uuid",
    "notes" "text",
    "updated_at" timestamp with time zone
);


ALTER TABLE "public"."cash_sessions_backup_20260902" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."categories" (
    "store_branch_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "color" "text" DEFAULT '#6366f1'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "id" "uuid" NOT NULL,
    "organization_id" "uuid",
    "icon" "text",
    "description" "text",
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."categories" REPLICA IDENTITY FULL;


ALTER TABLE "public"."categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."company_settings" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "organization_id" "uuid",
    "company_name" character varying(255) NOT NULL,
    "trade_name" character varying(255),
    "cnpj" character varying(20),
    "ie" character varying(30),
    "phone" character varying(30),
    "email" character varying(255),
    "address" "text",
    "logo_url" "text",
    "primary_color" character varying(20) DEFAULT '#4f46e5'::character varying,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "store_branch_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL
);


ALTER TABLE "public"."company_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sales" (
    "store_branch_id" "uuid" NOT NULL,
    "code" "text",
    "subtotal" numeric DEFAULT 0,
    "discount" numeric DEFAULT 0,
    "total" numeric DEFAULT 0,
    "payment_method" "text" DEFAULT 'cash'::"text",
    "status" "text" DEFAULT 'completed'::"text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "customer_name" "text",
    "id" "uuid" NOT NULL,
    "organization_id" "uuid",
    "user_id" "uuid",
    "customer_id" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "operator_name" "text",
    "table_id" "uuid",
    "customer_session_id" "uuid",
    "order_source" "text" DEFAULT 'pdv'::"text",
    "kitchen_status" "text" DEFAULT 'pending'::"text",
    "payments_json" "jsonb" DEFAULT '[]'::"jsonb",
    "payment_details" "jsonb" DEFAULT '[]'::"jsonb",
    "payment_id" "text",
    "delivery_order_id" "uuid",
    "deleted_at" timestamp with time zone,
    "cash_session_id" "uuid",
    CONSTRAINT "chk_sales_status" CHECK (("status" = ANY (ARRAY['completed'::"text", 'cancelled'::"text", 'pending'::"text"]))),
    CONSTRAINT "chk_sales_total_positive" CHECK (("total" >= (0)::numeric)),
    CONSTRAINT "sales_kitchen_status_check" CHECK (("kitchen_status" = ANY (ARRAY['pending'::"text", 'preparing'::"text", 'ready'::"text", 'delivered'::"text", 'cancelled'::"text", 'closing_request'::"text"]))),
    CONSTRAINT "sales_order_source_check" CHECK (("order_source" = ANY (ARRAY['pdv'::"text", 'cardapio_digital'::"text", 'delivery'::"text", 'comanda'::"text", 'fiado'::"text"]))),
    CONSTRAINT "sales_store_branch_id_not_null" CHECK (("store_branch_id" IS NOT NULL))
);

ALTER TABLE ONLY "public"."sales" REPLICA IDENTITY FULL;


ALTER TABLE "public"."sales" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."store_branches" (
    "name" "text" NOT NULL,
    "code" "text" DEFAULT ''::"text",
    "cnpj" "text" DEFAULT ''::"text",
    "city" "text" DEFAULT ''::"text",
    "state" "text" DEFAULT ''::"text",
    "address" "text" DEFAULT ''::"text",
    "phone" "text" DEFAULT ''::"text",
    "is_headquarters" boolean DEFAULT false,
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "id" "uuid" NOT NULL,
    "organization_id" "uuid",
    "full_address" "text",
    "whatsapp_phone" "text",
    "latitude" numeric(10,8),
    "longitude" numeric(11,8),
    "delivery_enabled" boolean DEFAULT false,
    "pickup_enabled" boolean DEFAULT true
);

ALTER TABLE ONLY "public"."store_branches" REPLICA IDENTITY FULL;


ALTER TABLE "public"."store_branches" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."consolidated_cash_report" AS
 SELECT "sb"."id" AS "branch_id",
    "sb"."name" AS "branch_name",
    "cs"."id" AS "session_id",
    "cs"."operator_name",
    "cs"."opened_at",
    "cs"."closed_at",
    "cs"."total_sales_cash",
    "cs"."total_sales_pix",
    "cs"."total_sales_card",
    "cs"."total_sales_credit_account",
    "cs"."opening_balance",
    "cs"."closing_balance",
    ((("cs"."total_sales_cash" + "cs"."total_sales_pix") + "cs"."total_sales_card") + "cs"."total_sales_credit_account") AS "total_sales",
    "count"("s"."id") AS "total_transactions",
    "sum"("s"."total") AS "total_value"
   FROM (("public"."cash_sessions" "cs"
     LEFT JOIN "public"."store_branches" "sb" ON (("cs"."store_branch_id" = "sb"."id")))
     LEFT JOIN "public"."sales" "s" ON ((("s"."cash_session_id" = "cs"."id") AND ("s"."status" = 'completed'::"text") AND ("s"."deleted_at" IS NULL))))
  WHERE ("cs"."status" = 'closed'::"text")
  GROUP BY "sb"."id", "sb"."name", "cs"."id", "cs"."operator_name", "cs"."opened_at", "cs"."closed_at", "cs"."total_sales_cash", "cs"."total_sales_pix", "cs"."total_sales_card", "cs"."total_sales_credit_account", "cs"."opening_balance", "cs"."closing_balance"
  ORDER BY "cs"."opened_at" DESC;


ALTER VIEW "public"."consolidated_cash_report" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."credit_payments" (
    "id" "uuid" NOT NULL,
    "organization_id" "uuid",
    "store_branch_id" "uuid",
    "sale_id" "uuid",
    "customer_id" "uuid",
    "customer_name" "text",
    "amount" numeric(12,2) DEFAULT 0,
    "paid_at" timestamp with time zone DEFAULT "now"(),
    "payment_method" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."credit_payments" REPLICA IDENTITY FULL;


ALTER TABLE "public"."credit_payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customer_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "table_id" "uuid",
    "organization_id" "uuid" NOT NULL,
    "store_branch_id" "uuid" NOT NULL,
    "session_token" "text" DEFAULT "replace"(("gen_random_uuid"())::"text", '-'::"text", ''::"text") NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "opened_at" timestamp with time zone DEFAULT "now"(),
    "closed_at" timestamp with time zone,
    "device_fingerprint" "text",
    "customer_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "chk_cs_status" CHECK (("status" = ANY (ARRAY['active'::"text", 'completed'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "customer_sessions_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'completed'::"text", 'cancelled'::"text"])))
);

ALTER TABLE ONLY "public"."customer_sessions" REPLICA IDENTITY FULL;


ALTER TABLE "public"."customer_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customers" (
    "store_branch_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "cpf_cnpj" "text" DEFAULT ''::"text",
    "email" "text" DEFAULT ''::"text",
    "phone" "text" DEFAULT ''::"text",
    "credit_limit" numeric(12,2) DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "notes" "text",
    "id" "uuid" NOT NULL,
    "organization_id" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "current_balance" numeric(12,2) DEFAULT 0,
    "loyalty_points" integer DEFAULT 0,
    "city" "text",
    "state" "text",
    "birth_date" "date",
    "whatsapp" "text" DEFAULT ''::"text",
    "address_street" "text" DEFAULT ''::"text",
    "address_number" "text" DEFAULT ''::"text",
    "address_complement" "text" DEFAULT ''::"text",
    "address_neighborhood" "text" DEFAULT ''::"text",
    "address_city" "text" DEFAULT ''::"text",
    "address_state" "text" DEFAULT ''::"text",
    "address_zip" "text" DEFAULT ''::"text",
    "google_id" "text",
    "password_hash" "text",
    "customer_type" "text" DEFAULT 'walkin'::"text",
    CONSTRAINT "customers_customer_type_check" CHECK (("customer_type" = ANY (ARRAY['walkin'::"text", 'delivery'::"text", 'both'::"text"])))
);

ALTER TABLE ONLY "public"."customers" REPLICA IDENTITY FULL;


ALTER TABLE "public"."customers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."delivery_distance_rates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "store_branch_id" "uuid" NOT NULL,
    "min_km" numeric(6,2) DEFAULT 0 NOT NULL,
    "max_km" numeric(6,2) NOT NULL,
    "fee" numeric(10,2) DEFAULT 0 NOT NULL,
    "estimated_time_minutes" integer DEFAULT 45,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."delivery_distance_rates" REPLICA IDENTITY FULL;


ALTER TABLE "public"."delivery_distance_rates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."delivery_neighborhoods" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "store_branch_id" "uuid" NOT NULL,
    "neighborhood" "text" NOT NULL,
    "fee" numeric(10,2) DEFAULT 0 NOT NULL,
    "estimated_time_minutes" integer DEFAULT 45,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."delivery_neighborhoods" REPLICA IDENTITY FULL;


ALTER TABLE "public"."delivery_neighborhoods" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."delivery_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "store_branch_id" "uuid" NOT NULL,
    "customer_id" "uuid",
    "order_type" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "items_json" "jsonb" NOT NULL,
    "subtotal" numeric(10,2) DEFAULT 0 NOT NULL,
    "delivery_fee" numeric(10,2) DEFAULT 0 NOT NULL,
    "discount" numeric(10,2) DEFAULT 0 NOT NULL,
    "total" numeric(10,2) DEFAULT 0 NOT NULL,
    "payment_method" "text",
    "change_amount" numeric(10,2),
    "delivery_address" "jsonb",
    "customer_name" "text" NOT NULL,
    "customer_whatsapp" "text",
    "customer_email" "text",
    "notes" "text",
    "estimated_delivery_time" integer,
    "confirmed_at" timestamp with time zone,
    "preparing_at" timestamp with time zone,
    "ready_at" timestamp with time zone,
    "out_for_delivery_at" timestamp with time zone,
    "delivered_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "cancelled_reason" "text",
    "whatsapp_sent" boolean DEFAULT false,
    "whatsapp_sent_at" timestamp with time zone,
    "delivered_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "chk_do_status" CHECK (("status" = ANY (ARRAY['pending'::"text", 'confirmed'::"text", 'preparing'::"text", 'ready'::"text", 'out_for_delivery'::"text", 'delivered'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "delivery_orders_order_type_check" CHECK (("order_type" = ANY (ARRAY['delivery'::"text", 'pickup'::"text"]))),
    CONSTRAINT "delivery_orders_payment_method_check" CHECK (("payment_method" = ANY (ARRAY['cash'::"text", 'credit_card'::"text", 'debit_card'::"text", 'pix'::"text"]))),
    CONSTRAINT "delivery_orders_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'confirmed'::"text", 'preparing'::"text", 'ready'::"text", 'out_for_delivery'::"text", 'delivered'::"text", 'cancelled'::"text"])))
);

ALTER TABLE ONLY "public"."delivery_orders" REPLICA IDENTITY FULL;


ALTER TABLE "public"."delivery_orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."delivery_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "store_branch_id" "uuid" NOT NULL,
    "is_active" boolean DEFAULT true,
    "delivery_enabled" boolean DEFAULT true,
    "pickup_enabled" boolean DEFAULT true,
    "operating_hours" "jsonb" DEFAULT '{}'::"jsonb",
    "fee_calculation_type" "text" DEFAULT 'free'::"text",
    "fixed_fee" numeric(10,2) DEFAULT 0,
    "minimum_order_value" numeric(10,2) DEFAULT 0,
    "estimated_delivery_time" integer DEFAULT 45,
    "max_delivery_distance_km" integer DEFAULT 15,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "delivery_worker_fee_percent" integer DEFAULT 100,
    "delivery_worker_pay_type" "text" DEFAULT 'salary'::"text",
    "delivery_worker_daily_pay" numeric(10,2) DEFAULT 0,
    CONSTRAINT "delivery_settings_delivery_worker_fee_percent_check" CHECK ((("delivery_worker_fee_percent" >= 0) AND ("delivery_worker_fee_percent" <= 100))),
    CONSTRAINT "delivery_settings_delivery_worker_pay_type_check" CHECK (("delivery_worker_pay_type" = ANY (ARRAY['salary'::"text", 'daily'::"text"]))),
    CONSTRAINT "delivery_settings_fee_calculation_type_check" CHECK (("fee_calculation_type" = ANY (ARRAY['fixed'::"text", 'neighborhood'::"text", 'distance'::"text", 'free'::"text"])))
);

ALTER TABLE ONLY "public"."delivery_settings" REPLICA IDENTITY FULL;


ALTER TABLE "public"."delivery_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."delivery_worker_earnings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "store_branch_id" "uuid" NOT NULL,
    "worker_id" "uuid" NOT NULL,
    "delivery_order_id" "uuid",
    "delivery_fee" numeric(10,2) DEFAULT 0 NOT NULL,
    "worker_amount" numeric(10,2) DEFAULT 0 NOT NULL,
    "company_amount" numeric(10,2) DEFAULT 0 NOT NULL,
    "pay_type" "text" NOT NULL,
    "paid" boolean DEFAULT false,
    "paid_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "delivery_worker_earnings_pay_type_check" CHECK (("pay_type" = ANY (ARRAY['salary'::"text", 'daily'::"text"])))
);

ALTER TABLE ONLY "public"."delivery_worker_earnings" REPLICA IDENTITY FULL;


ALTER TABLE "public"."delivery_worker_earnings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."digital_menu_config" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "store_branch_id" "uuid" NOT NULL,
    "title" "text" DEFAULT 'Cardápio Digital'::"text",
    "subtitle" "text",
    "logo_url" "text",
    "banner_url" "text",
    "layout_mode" "text" DEFAULT 'grid'::"text",
    "show_prices" boolean DEFAULT true,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "digital_menu_config_layout_mode_check" CHECK (("layout_mode" = ANY (ARRAY['grid'::"text", 'list'::"text"])))
);

ALTER TABLE ONLY "public"."digital_menu_config" REPLICA IDENTITY FULL;


ALTER TABLE "public"."digital_menu_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."filial_backups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "store_branch_id" "uuid" NOT NULL,
    "backup_name" "text" NOT NULL,
    "backup_data" "jsonb" NOT NULL,
    "data_size_bytes" integer DEFAULT 0,
    "record_count" integer DEFAULT 0,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "is_automatic" boolean DEFAULT false,
    "restored_at" timestamp with time zone,
    "restored_by" "uuid"
);

ALTER TABLE ONLY "public"."filial_backups" REPLICA IDENTITY FULL;


ALTER TABLE "public"."filial_backups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."financial_transactions" (
    "store_branch_id" "uuid" NOT NULL,
    "type" "text" DEFAULT 'payable'::"text",
    "description" "text",
    "amount" numeric(12,2) DEFAULT 0,
    "category" "text",
    "status" "text" DEFAULT 'pending'::"text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "id" "uuid" NOT NULL,
    "organization_id" "uuid",
    "due_date" "date",
    "payment_date" "date",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_recurring" boolean DEFAULT false,
    "is_installment" boolean DEFAULT false,
    "recurrence_type" "text",
    "recurrence_count" integer,
    "recurrence_parent_id" "uuid",
    "installment_number" integer,
    "recurrences_json" "jsonb" DEFAULT '[]'::"jsonb",
    "installments_json" "jsonb" DEFAULT '[]'::"jsonb",
    "payment_method" "text",
    "sale_id" "uuid",
    "include_in_report" boolean DEFAULT true,
    CONSTRAINT "chk_ft_status" CHECK (("status" = ANY (ARRAY['pending'::"text", 'paid'::"text", 'overdue'::"text", 'cancelled'::"text"])))
);

ALTER TABLE ONLY "public"."financial_transactions" REPLICA IDENTITY FULL;


ALTER TABLE "public"."financial_transactions" OWNER TO "postgres";


COMMENT ON COLUMN "public"."financial_transactions"."is_recurring" IS 'RECORRENTE: valor fixo que se repete a cada período (não é montante dividido)';



COMMENT ON COLUMN "public"."financial_transactions"."is_installment" IS 'PARCELADA: o montante digitado foi dividido em N parcelas';



CREATE TABLE IF NOT EXISTS "public"."footer_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "store_branch_id" "uuid" NOT NULL,
    "message" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."footer_messages" REPLICA IDENTITY FULL;


ALTER TABLE "public"."footer_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."media_devices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "store_branch_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "device_type" "text" DEFAULT 'browser'::"text" NOT NULL,
    "address" "text",
    "pairing_code" "text",
    "is_active" boolean DEFAULT false NOT NULL,
    "last_seen_at" timestamp with time zone,
    "version" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."media_devices" REPLICA IDENTITY FULL;


ALTER TABLE "public"."media_devices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."module_visibility" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "store_branch_id" "uuid" NOT NULL,
    "module_pdv" boolean DEFAULT true,
    "module_inventory" boolean DEFAULT true,
    "module_fiado" boolean DEFAULT false,
    "module_crm" boolean DEFAULT false,
    "module_dashboard" boolean DEFAULT true,
    "module_finance" boolean DEFAULT false,
    "module_kds" boolean DEFAULT false,
    "module_delivery" boolean DEFAULT false,
    "module_cardapio_digital" boolean DEFAULT false,
    "module_cardapio_preview" boolean DEFAULT false,
    "module_tv_showcase" boolean DEFAULT false,
    "module_tv_connect" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "module_comanda" boolean DEFAULT false NOT NULL
);

ALTER TABLE ONLY "public"."module_visibility" REPLICA IDENTITY FULL;


ALTER TABLE "public"."module_visibility" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."movimentacoes_falhas" (
    "operation_type" "text" NOT NULL,
    "table_name" "text" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "error_message" "text" NOT NULL,
    "error_code" "text",
    "stack_trace" "text",
    "retry_count" integer DEFAULT 0,
    "max_retries" integer DEFAULT 3,
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "last_retry_at" timestamp with time zone,
    "resolved_at" timestamp with time zone,
    "resolved_by" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "id" "uuid" NOT NULL,
    "organization_id" "uuid",
    "record_id" "text",
    "error_status" integer,
    "source" "text" DEFAULT 'sync_queue'::"text",
    "browser_id" "text",
    "user_email" "text",
    "next_retry_at" timestamp with time zone,
    "store_branch_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "movimentacoes_falhas_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'retrying'::"text", 'resolved'::"text", 'discarded'::"text"])))
);


ALTER TABLE "public"."movimentacoes_falhas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."nf_records" (
    "id" "uuid" NOT NULL,
    "organization_id" "uuid",
    "store_branch_id" "uuid",
    "supplier_name" "text",
    "total_amount" numeric(12,2) DEFAULT 0,
    "scan_date" timestamp with time zone DEFAULT "now"(),
    "items" "jsonb" DEFAULT '[]'::"jsonb",
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "supplier_id" "uuid",
    "access_key" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "observation" "text",
    "images" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "template_id" "text",
    "source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "document_number" "text",
    "ocr_confidence" numeric,
    "supplier_snapshot" "jsonb",
    "processed_at" timestamp with time zone,
    "thumbnail_url" "text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "chk_nf_records_status" CHECK (("status" = ANY (ARRAY['pending'::"text", 'confirmed'::"text", 'adjusted'::"text"])))
);

ALTER TABLE ONLY "public"."nf_records" REPLICA IDENTITY FULL;


ALTER TABLE "public"."nf_records" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."open_containers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "store_branch_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "remaining_quantity" integer NOT NULL,
    "opened_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "open_containers_remaining_quantity_check" CHECK (("remaining_quantity" >= 0)),
    CONSTRAINT "open_containers_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'empty'::"text", 'discarded'::"text"])))
);

ALTER TABLE ONLY "public"."open_containers" REPLICA IDENTITY FULL;


ALTER TABLE "public"."open_containers" OWNER TO "postgres";


COMMENT ON TABLE "public"."open_containers" IS 'Contêiner aberto / decremento fracionado (ex.: garrafa aberta, dose). Usado para controlar frações restantes de um produto.';



COMMENT ON COLUMN "public"."open_containers"."remaining_quantity" IS 'Quantidade restante no contêiner aberto (pode ser fração)';



COMMENT ON COLUMN "public"."open_containers"."status" IS 'open = aberto/em uso; closed/consumed = finalizado';



CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" character varying(255) NOT NULL,
    "trade_name" character varying(255),
    "cnpj" character varying(20),
    "phone" character varying(30),
    "email" character varying(255),
    "plan" character varying(50) DEFAULT 'pro'::character varying,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "active" boolean DEFAULT true NOT NULL,
    "subscription_expires_at" timestamp with time zone
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payment_terminals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "store_branch_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "provider" "text" DEFAULT 'infinitepay'::"text" NOT NULL,
    "name" "text" NOT NULL,
    "config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "payment_terminals_provider_check" CHECK (("provider" = 'infinitepay'::"text"))
);

ALTER TABLE ONLY "public"."payment_terminals" REPLICA IDENTITY FULL;


ALTER TABLE "public"."payment_terminals" OWNER TO "postgres";


COMMENT ON TABLE "public"."payment_terminals" IS 'Terminal/maquininha de pagamento vinculado a um usuário + filial + provider. Início: InfinitePay. Genérico para futuros providers.';



COMMENT ON COLUMN "public"."payment_terminals"."provider" IS 'Provedor de pagamento. Por ora apenas infinitepay (Checkout Integrado).';



COMMENT ON COLUMN "public"."payment_terminals"."config" IS 'Config específica do provider (ex.: { "handle": "sua_infinite_tag" }). Cobrança jamais sai do navegador.';



COMMENT ON COLUMN "public"."payment_terminals"."is_default" IS 'No máx 1 padrão por (user_id, store_branch_id, provider)';



CREATE TABLE IF NOT EXISTS "public"."pix_config" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "store_branch_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "chave_pix" "text" NOT NULL,
    "tipo_chave" "text" NOT NULL,
    "nome_titular" "text" NOT NULL,
    "cidade" "text",
    "ativo" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "pix_config_tipo_chave_check" CHECK (("tipo_chave" = ANY (ARRAY['cpf'::"text", 'cnpj'::"text", 'telefone'::"text", 'email'::"text", 'aleatoria'::"text"])))
);

ALTER TABLE ONLY "public"."pix_config" REPLICA IDENTITY FULL;


ALTER TABLE "public"."pix_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."printers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "store_branch_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "model" "text",
    "transport" "text" DEFAULT 'os'::"text" NOT NULL,
    "ip_address" "text",
    "port" integer DEFAULT 9100 NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "status" "text" DEFAULT 'disconnected'::"text" NOT NULL,
    "last_seen_at" timestamp with time zone,
    "version" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "role" "text" DEFAULT 'caixa'::"text",
    "category_id" "uuid",
    CONSTRAINT "chk_printers_role" CHECK (("role" = ANY (ARRAY['caixa'::"text", 'bar'::"text", 'cozinha'::"text", 'outro'::"text"]))),
    CONSTRAINT "printers_role_check" CHECK (("role" = ANY (ARRAY['caixa'::"text", 'bar'::"text", 'cozinha'::"text", 'outro'::"text"])))
);

ALTER TABLE ONLY "public"."printers" REPLICA IDENTITY FULL;


ALTER TABLE "public"."printers" OWNER TO "postgres";


COMMENT ON COLUMN "public"."printers"."role" IS 'Roteamento: caixa | bar | cozinha | outro';



COMMENT ON COLUMN "public"."printers"."category_id" IS 'Categoria específica (opcional) para roteamento por categoria';



CREATE TABLE IF NOT EXISTS "public"."product_lots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "store_branch_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "lot_number" "text" NOT NULL,
    "expiration_date" "date" NOT NULL,
    "quantity" integer DEFAULT 0 NOT NULL,
    "cost_price" numeric(12,2),
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "supplier_id" "uuid",
    "received_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "product_lots_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'expired'::"text", 'disposed'::"text"])))
);

ALTER TABLE ONLY "public"."product_lots" REPLICA IDENTITY FULL;


ALTER TABLE "public"."product_lots" OWNER TO "postgres";


COMMENT ON TABLE "public"."product_lots" IS 'Lotes de produto com validade e quantidade独立. Usado para FEFO.';



COMMENT ON COLUMN "public"."product_lots"."lot_number" IS 'Código do lote do fornecedor (ex: LOTE-2026-001)';



COMMENT ON COLUMN "public"."product_lots"."quantity" IS 'Quantidade em estoque deste lote específico';



COMMENT ON COLUMN "public"."product_lots"."cost_price" IS 'Custo específico deste lote (pode diferir de lote para lote)';



COMMENT ON COLUMN "public"."product_lots"."status" IS 'active = em estoque; expired = vencido; disposed = descartado';



CREATE TABLE IF NOT EXISTS "public"."product_recipes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "store_branch_id" "uuid" NOT NULL,
    "composite_product_id" "uuid" NOT NULL,
    "ingredient_product_id" "uuid" NOT NULL,
    "ingredient_name" "text",
    "quantity" numeric(12,4) DEFAULT 1 NOT NULL,
    "unit" "text" DEFAULT 'un'::"text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."product_recipes" REPLICA IDENTITY FULL;


ALTER TABLE "public"."product_recipes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."products" (
    "name" "text" NOT NULL,
    "sku" "text" DEFAULT ''::"text",
    "barcode" "text" DEFAULT ''::"text",
    "category" "text" DEFAULT 'Geral'::"text",
    "cost_price" numeric(12,2) DEFAULT 0,
    "sale_price" numeric(12,2) DEFAULT 0,
    "stock_quantity" integer DEFAULT 0,
    "min_stock_quantity" integer DEFAULT 5,
    "max_stock_quantity" integer DEFAULT 100,
    "unit" "text" DEFAULT 'un'::"text",
    "image_url" "text" DEFAULT ''::"text",
    "is_active" boolean DEFAULT true,
    "show_on_tv" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "tv_promo_price" numeric,
    "tv_highlight_tag" "text",
    "id" "uuid" NOT NULL,
    "organization_id" "uuid",
    "store_branch_id" "uuid" NOT NULL,
    "supplier_id" "text",
    "ncm" "text",
    "cfop" "text",
    "wholesale_options" "jsonb",
    "show_on_cardapio" boolean DEFAULT false,
    "expiration_date" "date",
    "is_composite" boolean DEFAULT false,
    "use_lots" boolean DEFAULT false,
    "is_fragmentable" boolean DEFAULT false NOT NULL,
    "yield_count" integer,
    "fraction_product_id" "uuid",
    "margin_percent" numeric DEFAULT 30,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "chk_products_fragmentable_fields" CHECK ((("is_fragmentable" = false) OR (("yield_count" IS NOT NULL) AND ("yield_count" > 0) AND ("fraction_product_id" IS NOT NULL)))),
    CONSTRAINT "chk_products_positive" CHECK ((("sale_price" >= (0)::numeric) AND ("cost_price" >= (0)::numeric) AND ("stock_quantity" >= 0)))
);

ALTER TABLE ONLY "public"."products" REPLICA IDENTITY FULL;


ALTER TABLE "public"."products" OWNER TO "postgres";


COMMENT ON COLUMN "public"."products"."wholesale_options" IS 'Opções de venda no atacado: [{id, boxQuantity, salePrice}] — preço da caixa inteira';



COMMENT ON COLUMN "public"."products"."show_on_cardapio" IS 'Controla se o produto aparece no cardápio digital (acessado via QR Code)';



COMMENT ON COLUMN "public"."products"."expiration_date" IS 'Data de validade do produto. Usado para alertas de produto vencido/proximo ao vencimento no Dashboard.';



COMMENT ON COLUMN "public"."products"."is_composite" IS 'TRUE = produto composto (desconta ingredientes do estoque ao vender)';



COMMENT ON COLUMN "public"."products"."use_lots" IS 'Habilita rastreamento por lote (FEFO). false = estoque global simples.';



CREATE TABLE IF NOT EXISTS "public"."products_deleted_at_backup_20260906" (
    "id" "uuid" NOT NULL,
    "is_active" boolean,
    "deleted_at" timestamp with time zone,
    "updated_at" timestamp with time zone
);


ALTER TABLE "public"."products_deleted_at_backup_20260906" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "organization_id" "uuid",
    "name" character varying(255) NOT NULL,
    "email" character varying(255) NOT NULL,
    "role" character varying(50) DEFAULT 'admin'::character varying,
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "store_branch_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "whatsapp" "text",
    "salary" numeric(12,2) DEFAULT 0,
    "transportation_allowance" numeric(12,2) DEFAULT 0,
    "meal_allowance" numeric(12,2) DEFAULT 0,
    "other_benefits" numeric(12,2) DEFAULT 0,
    "inss_discount" numeric(12,2) DEFAULT 0,
    "ir_discount" numeric(12,2) DEFAULT 0,
    "other_discounts" numeric(12,2) DEFAULT 0
);

ALTER TABLE ONLY "public"."profiles" REPLICA IDENTITY FULL;


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sale_items" (
    "quantity" integer DEFAULT 1,
    "unit_price" numeric DEFAULT 0,
    "total_price" numeric DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "product_name" "text",
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sale_id" "uuid",
    "product_id" "uuid",
    "store_branch_id" "uuid" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "chk_si_positive" CHECK ((("quantity" > 0) AND ("unit_price" >= (0)::numeric) AND ("total_price" >= (0)::numeric)))
);

ALTER TABLE ONLY "public"."sale_items" REPLICA IDENTITY FULL;


ALTER TABLE "public"."sale_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sales_columns_backup_20260902" (
    "id" "uuid",
    "payment_details" "jsonb"
);


ALTER TABLE "public"."sales_columns_backup_20260902" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sales_deleted_at_backup_20260902" (
    "id" "uuid",
    "status" "text",
    "created_at" timestamp with time zone
);


ALTER TABLE "public"."sales_deleted_at_backup_20260902" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."scanned_boletos" (
    "id" "uuid" NOT NULL,
    "organization_id" "uuid",
    "store_branch_id" "uuid",
    "barcode" "text",
    "linha_digitavel" "text",
    "amount" numeric(12,2) DEFAULT 0,
    "due_date" "date",
    "payer" "text",
    "scan_date" timestamp with time zone DEFAULT "now"(),
    "financial_account_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."scanned_boletos" REPLICA IDENTITY FULL;


ALTER TABLE "public"."scanned_boletos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sessions" (
    "session_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "created_at" timestamp with time zone NOT NULL,
    "not_after" timestamp with time zone NOT NULL,
    "tag" "text",
    "store_branch_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL
);

ALTER TABLE ONLY "public"."sessions" REPLICA IDENTITY FULL;


ALTER TABLE "public"."sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stock_change_log" (
    "old_stock_quantity" integer,
    "new_stock_quantity" integer,
    "changed_by" "text",
    "change_type" "text",
    "sale_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid",
    "organization_id" "uuid",
    "store_branch_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "stock_change_log_change_type_check" CHECK (("change_type" = ANY (ARRAY['INCREASE'::"text", 'DECREASE'::"text", 'MANUAL'::"text"])))
);

ALTER TABLE ONLY "public"."stock_change_log" REPLICA IDENTITY FULL;


ALTER TABLE "public"."stock_change_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stock_loss_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "store_branch_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "lot_id" "uuid",
    "quantity" integer NOT NULL,
    "reason" "text" NOT NULL,
    "operator_name" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "stock_loss_log_reason_check" CHECK (("reason" = ANY (ARRAY['expired'::"text", 'damaged'::"text", 'other'::"text"])))
);

ALTER TABLE ONLY "public"."stock_loss_log" REPLICA IDENTITY FULL;


ALTER TABLE "public"."stock_loss_log" OWNER TO "postgres";


COMMENT ON TABLE "public"."stock_loss_log" IS 'Registro de perdas de estoque (validade, avaria, etc.)';



CREATE TABLE IF NOT EXISTS "public"."stock_movements" (
    "store_branch_id" "uuid" NOT NULL,
    "product_name" "text",
    "type" "text",
    "quantity" integer DEFAULT 0,
    "previous_stock" integer DEFAULT 0,
    "new_stock" integer DEFAULT 0,
    "reason" "text",
    "operator_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "id" "uuid" NOT NULL,
    "organization_id" "uuid",
    "product_id" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "sale_id" "uuid",
    "purchase_document_id" "uuid"
);

ALTER TABLE ONLY "public"."stock_movements" REPLICA IDENTITY FULL;


ALTER TABLE "public"."stock_movements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."suppliers" (
    "store_branch_id" "uuid" NOT NULL,
    "corporate_name" "text" DEFAULT ''::"text",
    "trade_name" "text" DEFAULT ''::"text",
    "cnpj" "text" DEFAULT ''::"text",
    "contact_person" "text" DEFAULT ''::"text",
    "email" "text" DEFAULT ''::"text",
    "phone" "text" DEFAULT ''::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "id" "uuid" NOT NULL,
    "organization_id" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "address" "text" DEFAULT ''::"text",
    "address_number" "text" DEFAULT ''::"text",
    "district" "text" DEFAULT ''::"text",
    "city" "text" DEFAULT ''::"text",
    "state" "text" DEFAULT ''::"text",
    "zip" "text" DEFAULT ''::"text"
);

ALTER TABLE ONLY "public"."suppliers" REPLICA IDENTITY FULL;


ALTER TABLE "public"."suppliers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sync_queue" (
    "operation_type" "text" NOT NULL,
    "table_name" "text" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "retry_count" integer DEFAULT 0,
    "max_retries" integer DEFAULT 3,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "last_retry_at" timestamp with time zone,
    "processed_at" timestamp with time zone,
    "id" "uuid" NOT NULL,
    "organization_id" "uuid",
    "store_branch_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."sync_queue" REPLICA IDENTITY FULL;


ALTER TABLE "public"."sync_queue" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."system_settings" (
    "settings" "jsonb",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "id" "uuid" NOT NULL,
    "organization_id" "uuid",
    "store_branch_id" "uuid" NOT NULL,
    "version" integer DEFAULT 1 NOT NULL
);

ALTER TABLE ONLY "public"."system_settings" REPLICA IDENTITY FULL;


ALTER TABLE "public"."system_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."system_users" (
    "store_branch_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "role" "text" DEFAULT 'collaborator'::"text",
    "permissions" "jsonb" DEFAULT '{"crm": true, "pdv": true, "finance": true, "settings": true, "dashboard": true, "inventory": true}'::"jsonb",
    "avatar_url" "text",
    "active" boolean DEFAULT true,
    "password" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "id" "uuid" NOT NULL,
    "organization_id" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "superadmin" boolean DEFAULT false,
    "commission_rate" numeric(5,2) DEFAULT 0 NOT NULL,
    "last_logout_at" timestamp with time zone
);

ALTER TABLE ONLY "public"."system_users" REPLICA IDENTITY FULL;


ALTER TABLE "public"."system_users" OWNER TO "postgres";


COMMENT ON COLUMN "public"."system_users"."commission_rate" IS 'Comissão (%) por colaborador — coluna Comissão do Relatório Gerencial (0 = sem comissão)';



CREATE TABLE IF NOT EXISTS "public"."tables" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "store_branch_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "number" integer,
    "qr_token" "text" DEFAULT "encode"((("gen_random_uuid"())::"text")::"bytea", 'base64'::"text") NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "tables_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text"])))
);

ALTER TABLE ONLY "public"."tables" REPLICA IDENTITY FULL;


ALTER TABLE "public"."tables" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_permissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "module_name" "text" NOT NULL,
    "can_read" boolean DEFAULT true,
    "can_write" boolean DEFAULT false,
    "can_delete" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "store_branch_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."user_permissions" REPLICA IDENTITY FULL;


ALTER TABLE "public"."user_permissions" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_documents_list" WITH ("security_invoker"='true') AS
 SELECT "nd"."id",
    "nd"."organization_id",
    "nd"."store_branch_id",
    "nd"."supplier_id",
    COALESCE("nd"."supplier_name", "s"."trade_name") AS "supplier_display_name",
    "nd"."document_number",
    "nd"."access_key",
    "nd"."total_amount",
    "nd"."scan_date",
    "nd"."created_at",
    "nd"."updated_at",
    "nd"."processed_at",
    "nd"."status",
    "nd"."source",
    "nd"."template_id",
    "nd"."observation",
    "nd"."images",
    "nd"."thumbnail_url",
    "nd"."items"
   FROM ("public"."nf_records" "nd"
     LEFT JOIN "public"."suppliers" "s" ON (("s"."id" = "nd"."supplier_id")));


ALTER VIEW "public"."v_documents_list" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_stock_movements_dashboard" WITH ("security_invoker"='true') AS
 SELECT "sm"."id",
    "sm"."organization_id",
    "sm"."store_branch_id",
    "sm"."product_id",
    "sm"."product_name",
    "sm"."type",
    "sm"."quantity",
    "sm"."previous_stock",
    "sm"."new_stock",
    "sm"."reason",
    "sm"."operator_name",
    "sm"."created_at",
    "sm"."updated_at",
    "sm"."sale_id",
    "sm"."purchase_document_id",
    "nd"."supplier_id",
    "s"."trade_name" AS "supplier_trade_name",
    "s"."corporate_name" AS "supplier_corporate_name",
    "nd"."document_number"
   FROM (("public"."stock_movements" "sm"
     LEFT JOIN "public"."nf_records" "nd" ON (("nd"."id" = "sm"."purchase_document_id")))
     LEFT JOIN "public"."suppliers" "s" ON (("s"."id" = "nd"."supplier_id")));


ALTER VIEW "public"."v_stock_movements_dashboard" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_cash_report" AS
 SELECT "sb"."id" AS "branch_id",
    "sb"."name" AS "branch_name",
    "cs"."id" AS "session_id",
    "cs"."operator_name",
    "cs"."opened_at",
    "cs"."closed_at",
    "cs"."opening_balance",
    "cs"."closing_balance",
    "cs"."total_sales_cash",
    "cs"."total_sales_pix",
    "cs"."total_sales_card",
    "cs"."total_sales_credit_account",
    ((("cs"."total_sales_cash" + "cs"."total_sales_pix") + "cs"."total_sales_card") + "cs"."total_sales_credit_account") AS "total_sales",
    "count"("s"."id") AS "total_transactions",
    COALESCE("sum"("s"."total"), (0)::numeric) AS "total_value"
   FROM (("public"."cash_sessions" "cs"
     LEFT JOIN "public"."store_branches" "sb" ON (("cs"."store_branch_id" = "sb"."id")))
     LEFT JOIN "public"."sales" "s" ON ((("s"."cash_session_id" = "cs"."id") AND ("s"."status" = 'completed'::"text") AND ("s"."deleted_at" IS NULL))))
  GROUP BY "sb"."id", "sb"."name", "cs"."id", "cs"."operator_name", "cs"."opened_at", "cs"."closed_at", "cs"."opening_balance", "cs"."closing_balance", "cs"."total_sales_cash", "cs"."total_sales_pix", "cs"."total_sales_card", "cs"."total_sales_credit_account"
  ORDER BY "cs"."opened_at" DESC;


ALTER VIEW "public"."vw_cash_report" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_dlq_pendentes" AS
 SELECT "id",
    "organization_id",
    "store_branch_id",
    "operation_type",
    "table_name",
    "record_id",
    "error_message",
    "error_status",
    "retry_count",
    "max_retries",
    "next_retry_at",
    "created_at",
    "source",
    "user_email"
   FROM "public"."movimentacoes_falhas"
  WHERE (("status" = 'pending'::"text") AND (("next_retry_at" IS NULL) OR ("next_retry_at" <= "now"())))
  ORDER BY "created_at";


ALTER VIEW "public"."vw_dlq_pendentes" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_dlq_resumo" AS
 SELECT "organization_id",
    "store_branch_id",
    "status",
    "count"(*) AS "total",
    "min"("created_at") AS "oldest_failure",
    "max"("created_at") AS "newest_failure",
    "count"(DISTINCT "table_name") AS "tables_affected"
   FROM "public"."movimentacoes_falhas"
  GROUP BY "organization_id", "store_branch_id", "status"
  ORDER BY "organization_id", "store_branch_id", "status";


ALTER VIEW "public"."vw_dlq_resumo" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_report_sale_items" WITH ("security_invoker"='true') AS
 SELECT "s"."id" AS "sale_id",
    "s"."organization_id",
    "s"."store_branch_id",
    "s"."created_at" AS "sale_date",
    "s"."status" AS "sale_status",
    "s"."payment_method",
    "s"."user_id" AS "operator_id",
    "s"."operator_name",
    "s"."customer_id",
    "s"."customer_name",
    "s"."total" AS "sale_total",
    "si"."id" AS "item_id",
    "si"."product_id",
    "si"."product_name",
    "si"."quantity",
    "si"."unit_price",
    "si"."total_price" AS "item_total",
    GREATEST((0)::numeric, ((COALESCE("si"."unit_price", (0)::numeric) * (COALESCE("si"."quantity", 0))::numeric) - COALESCE("si"."total_price", ("si"."unit_price" * ("si"."quantity")::numeric)))) AS "item_discount",
    "p"."category" AS "category_name",
    "su"."commission_rate" AS "operator_commission_rate",
    "s"."payments_json",
    "p"."cost_price" AS "product_cost"
   FROM ((("public"."sales" "s"
     JOIN "public"."sale_items" "si" ON (("si"."sale_id" = "s"."id")))
     LEFT JOIN "public"."products" "p" ON (("p"."id" = "si"."product_id")))
     LEFT JOIN "public"."system_users" "su" ON (("su"."id" = "s"."user_id")))
  WHERE ("s"."deleted_at" IS NULL);


ALTER VIEW "public"."vw_report_sale_items" OWNER TO "postgres";


COMMENT ON VIEW "public"."vw_report_sale_items" IS 'Base do Relatório Gerencial. Filtra sales.deleted_at IS NULL e respeita RLS via security_invoker.';



CREATE TABLE IF NOT EXISTS "public"."webhook_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "store_branch_id" "uuid",
    "payment_id" "text",
    "event_type" "text" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "processed" boolean DEFAULT false,
    "processed_at" timestamp with time zone,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."webhook_events" REPLICA IDENTITY FULL;


ALTER TABLE "public"."webhook_events" OWNER TO "postgres";


ALTER TABLE ONLY "public"."ai_insights"
    ADD CONSTRAINT "ai_insights_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."api_keys"
    ADD CONSTRAINT "api_keys_key_hash_key" UNIQUE ("key_hash");



ALTER TABLE ONLY "public"."api_keys"
    ADD CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."branch_themes"
    ADD CONSTRAINT "branch_themes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cash_sessions"
    ADD CONSTRAINT "cash_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."company_settings"
    ADD CONSTRAINT "company_settings_organization_id_key" UNIQUE ("organization_id");



ALTER TABLE ONLY "public"."company_settings"
    ADD CONSTRAINT "company_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."credit_payments"
    ADD CONSTRAINT "credit_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_sessions"
    ADD CONSTRAINT "customer_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_sessions"
    ADD CONSTRAINT "customer_sessions_session_token_key" UNIQUE ("session_token");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."delivery_distance_rates"
    ADD CONSTRAINT "delivery_distance_rates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."delivery_distance_rates"
    ADD CONSTRAINT "delivery_distance_rates_store_branch_id_min_km_max_km_key" UNIQUE ("store_branch_id", "min_km", "max_km");



ALTER TABLE ONLY "public"."delivery_neighborhoods"
    ADD CONSTRAINT "delivery_neighborhoods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."delivery_neighborhoods"
    ADD CONSTRAINT "delivery_neighborhoods_store_branch_id_neighborhood_key" UNIQUE ("store_branch_id", "neighborhood");



ALTER TABLE ONLY "public"."delivery_orders"
    ADD CONSTRAINT "delivery_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."delivery_settings"
    ADD CONSTRAINT "delivery_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."delivery_settings"
    ADD CONSTRAINT "delivery_settings_store_branch_id_key" UNIQUE ("store_branch_id");



ALTER TABLE ONLY "public"."delivery_worker_earnings"
    ADD CONSTRAINT "delivery_worker_earnings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."digital_menu_config"
    ADD CONSTRAINT "digital_menu_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."filial_backups"
    ADD CONSTRAINT "filial_backups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."financial_transactions"
    ADD CONSTRAINT "financial_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."footer_messages"
    ADD CONSTRAINT "footer_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."media_devices"
    ADD CONSTRAINT "media_devices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."module_visibility"
    ADD CONSTRAINT "module_visibility_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."module_visibility"
    ADD CONSTRAINT "module_visibility_store_branch_id_key" UNIQUE ("store_branch_id");



ALTER TABLE ONLY "public"."movimentacoes_falhas"
    ADD CONSTRAINT "movimentacoes_falhas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nf_records"
    ADD CONSTRAINT "nf_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."open_containers"
    ADD CONSTRAINT "open_containers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_cnpj_key" UNIQUE ("cnpj");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_terminals"
    ADD CONSTRAINT "payment_terminals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pix_config"
    ADD CONSTRAINT "pix_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pix_config"
    ADD CONSTRAINT "pix_config_store_branch_id_key" UNIQUE ("store_branch_id");



ALTER TABLE ONLY "public"."printers"
    ADD CONSTRAINT "printers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_lots"
    ADD CONSTRAINT "product_lots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_lots"
    ADD CONSTRAINT "product_lots_product_id_lot_number_key" UNIQUE ("product_id", "lot_number");



ALTER TABLE ONLY "public"."product_recipes"
    ADD CONSTRAINT "product_recipes_composite_product_id_ingredient_product_id_key" UNIQUE ("composite_product_id", "ingredient_product_id");



ALTER TABLE ONLY "public"."product_recipes"
    ADD CONSTRAINT "product_recipes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products_deleted_at_backup_20260906"
    ADD CONSTRAINT "products_deleted_at_backup_20260906_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sale_items"
    ADD CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sales_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."scanned_boletos"
    ADD CONSTRAINT "scanned_boletos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_pkey" PRIMARY KEY ("session_id");



ALTER TABLE ONLY "public"."stock_change_log"
    ADD CONSTRAINT "stock_change_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stock_loss_log"
    ADD CONSTRAINT "stock_loss_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."store_branches"
    ADD CONSTRAINT "store_branches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sync_queue"
    ADD CONSTRAINT "sync_queue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_settings"
    ADD CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_users"
    ADD CONSTRAINT "system_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tables"
    ADD CONSTRAINT "tables_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tables"
    ADD CONSTRAINT "tables_qr_token_key" UNIQUE ("qr_token");



ALTER TABLE ONLY "public"."user_permissions"
    ADD CONSTRAINT "user_permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_permissions"
    ADD CONSTRAINT "user_permissions_user_id_module_name_key" UNIQUE ("user_id", "module_name");



ALTER TABLE ONLY "public"."webhook_events"
    ADD CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id");



CREATE INDEX "credit_payments_branch_idx" ON "public"."credit_payments" USING "btree" ("store_branch_id");



CREATE INDEX "credit_payments_org_idx" ON "public"."credit_payments" USING "btree" ("organization_id");



CREATE INDEX "credit_payments_sale_idx" ON "public"."credit_payments" USING "btree" ("sale_id");



CREATE INDEX "idx_ai_insights_generated_at" ON "public"."ai_insights" USING "btree" ("generated_at" DESC);



CREATE INDEX "idx_ai_insights_id" ON "public"."ai_insights" USING "btree" ("id");



CREATE INDEX "idx_api_keys_org_branch" ON "public"."api_keys" USING "btree" ("organization_id", "store_branch_id");



CREATE INDEX "idx_audit_log_action" ON "public"."audit_log" USING "btree" ("action", "created_at" DESC);



CREATE INDEX "idx_audit_log_entity" ON "public"."audit_log" USING "btree" ("entity_type", "entity_id");



CREATE INDEX "idx_audit_log_org_created" ON "public"."audit_log" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "idx_audit_log_user" ON "public"."audit_log" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_boletos_org_branch" ON "public"."scanned_boletos" USING "btree" ("organization_id", "store_branch_id");



CREATE INDEX "idx_branch_themes_org_branch" ON "public"."branch_themes" USING "btree" ("organization_id", "store_branch_id");



CREATE INDEX "idx_cash_sessions_branch_status" ON "public"."cash_sessions" USING "btree" ("store_branch_id", "status") WHERE ("store_branch_id" IS NOT NULL);



CREATE INDEX "idx_cash_sessions_operator" ON "public"."cash_sessions" USING "btree" ("user_id", "status");



CREATE INDEX "idx_cash_sessions_org_branch" ON "public"."cash_sessions" USING "btree" ("organization_id", "store_branch_id");



CREATE INDEX "idx_cash_sessions_org_id" ON "public"."cash_sessions" USING "btree" ("organization_id");



CREATE INDEX "idx_cash_sessions_status" ON "public"."cash_sessions" USING "btree" ("organization_id", "status");



CREATE INDEX "idx_cash_sessions_store_branch" ON "public"."cash_sessions" USING "btree" ("store_branch_id");



CREATE UNIQUE INDEX "idx_cash_sessions_unique_user" ON "public"."cash_sessions" USING "btree" ("store_branch_id", "user_id") WHERE ("status" = 'open'::"text");



CREATE INDEX "idx_categories_org_branch" ON "public"."categories" USING "btree" ("organization_id", "store_branch_id");



CREATE INDEX "idx_categories_org_id" ON "public"."categories" USING "btree" ("organization_id");



CREATE INDEX "idx_credit_payments_org_branch" ON "public"."credit_payments" USING "btree" ("organization_id", "store_branch_id");



CREATE INDEX "idx_customer_sessions_org_branch" ON "public"."customer_sessions" USING "btree" ("organization_id", "store_branch_id");



CREATE INDEX "idx_customers_branch_type" ON "public"."customers" USING "btree" ("store_branch_id", "customer_type") WHERE ("store_branch_id" IS NOT NULL);



CREATE INDEX "idx_customers_branch_type_recent" ON "public"."customers" USING "btree" ("store_branch_id", "customer_type", "created_at" DESC) WHERE ("store_branch_id" IS NOT NULL);



CREATE INDEX "idx_customers_cpf_cnpj" ON "public"."customers" USING "btree" ("cpf_cnpj") WHERE ("cpf_cnpj" IS NOT NULL);



CREATE INDEX "idx_customers_name" ON "public"."customers" USING "btree" ("name");



CREATE INDEX "idx_customers_org_branch" ON "public"."customers" USING "btree" ("organization_id", "store_branch_id");



CREATE INDEX "idx_customers_org_id" ON "public"."customers" USING "btree" ("organization_id");



CREATE INDEX "idx_delivery_distance_branch" ON "public"."delivery_distance_rates" USING "btree" ("store_branch_id");



CREATE INDEX "idx_delivery_distance_rates_org" ON "public"."delivery_distance_rates" USING "btree" ("organization_id", "store_branch_id");



CREATE INDEX "idx_delivery_neighborhoods_branch" ON "public"."delivery_neighborhoods" USING "btree" ("store_branch_id");



CREATE INDEX "idx_delivery_neighborhoods_org" ON "public"."delivery_neighborhoods" USING "btree" ("organization_id", "store_branch_id");



CREATE INDEX "idx_delivery_orders_branch" ON "public"."delivery_orders" USING "btree" ("store_branch_id");



CREATE INDEX "idx_delivery_orders_created" ON "public"."delivery_orders" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_delivery_orders_customer" ON "public"."delivery_orders" USING "btree" ("customer_id");



CREATE INDEX "idx_delivery_orders_org" ON "public"."delivery_orders" USING "btree" ("organization_id");



CREATE INDEX "idx_delivery_orders_org_branch" ON "public"."delivery_orders" USING "btree" ("organization_id", "store_branch_id");



CREATE INDEX "idx_delivery_orders_status" ON "public"."delivery_orders" USING "btree" ("status");



CREATE INDEX "idx_delivery_settings_org_branch" ON "public"."delivery_settings" USING "btree" ("organization_id", "store_branch_id");



CREATE INDEX "idx_digital_menu_org_branch" ON "public"."digital_menu_config" USING "btree" ("organization_id", "store_branch_id");



CREATE INDEX "idx_dwe_branch" ON "public"."delivery_worker_earnings" USING "btree" ("store_branch_id");



CREATE INDEX "idx_dwe_org" ON "public"."delivery_worker_earnings" USING "btree" ("organization_id");



CREATE INDEX "idx_dwe_worker" ON "public"."delivery_worker_earnings" USING "btree" ("worker_id");



CREATE INDEX "idx_filial_backups_branch" ON "public"."filial_backups" USING "btree" ("store_branch_id");



CREATE INDEX "idx_financial_branch_due" ON "public"."financial_transactions" USING "btree" ("store_branch_id", "due_date") WHERE ("store_branch_id" IS NOT NULL);



CREATE INDEX "idx_financial_due_date" ON "public"."financial_transactions" USING "btree" ("due_date");



CREATE INDEX "idx_financial_org_branch" ON "public"."financial_transactions" USING "btree" ("organization_id", "store_branch_id");



CREATE INDEX "idx_financial_org_due" ON "public"."financial_transactions" USING "btree" ("organization_id", "due_date");



CREATE INDEX "idx_financial_org_id" ON "public"."financial_transactions" USING "btree" ("organization_id");



CREATE INDEX "idx_financial_org_status" ON "public"."financial_transactions" USING "btree" ("organization_id", "status");



CREATE INDEX "idx_financial_transactions_org_id" ON "public"."financial_transactions" USING "btree" ("organization_id");



CREATE INDEX "idx_footer_messages_branch" ON "public"."footer_messages" USING "btree" ("store_branch_id", "active");



CREATE INDEX "idx_footer_messages_org_branch" ON "public"."footer_messages" USING "btree" ("organization_id", "store_branch_id");



CREATE INDEX "idx_media_devices_branch" ON "public"."media_devices" USING "btree" ("store_branch_id", "is_active");



CREATE INDEX "idx_media_devices_org_branch" ON "public"."media_devices" USING "btree" ("organization_id", "store_branch_id");



CREATE INDEX "idx_module_visibility_org_branch" ON "public"."module_visibility" USING "btree" ("organization_id", "store_branch_id");



CREATE INDEX "idx_nf_records_org_branch" ON "public"."nf_records" USING "btree" ("organization_id", "store_branch_id");



CREATE INDEX "idx_nf_records_supplier" ON "public"."nf_records" USING "btree" ("supplier_id");



CREATE INDEX "idx_open_containers_branch" ON "public"."open_containers" USING "btree" ("store_branch_id");



CREATE INDEX "idx_open_containers_lookup" ON "public"."open_containers" USING "btree" ("organization_id", "store_branch_id", "product_id", "status", "opened_at");



CREATE INDEX "idx_open_containers_org" ON "public"."open_containers" USING "btree" ("organization_id");



CREATE INDEX "idx_open_containers_product" ON "public"."open_containers" USING "btree" ("product_id");



CREATE INDEX "idx_open_containers_status" ON "public"."open_containers" USING "btree" ("status");



CREATE INDEX "idx_payment_terminals_branch" ON "public"."payment_terminals" USING "btree" ("store_branch_id");



CREATE INDEX "idx_payment_terminals_org" ON "public"."payment_terminals" USING "btree" ("organization_id");



CREATE INDEX "idx_payment_terminals_provider" ON "public"."payment_terminals" USING "btree" ("provider");



CREATE INDEX "idx_payment_terminals_user" ON "public"."payment_terminals" USING "btree" ("user_id");



CREATE INDEX "idx_printers_org_branch" ON "public"."printers" USING "btree" ("organization_id", "store_branch_id");



CREATE INDEX "idx_product_lots_branch" ON "public"."product_lots" USING "btree" ("store_branch_id");



CREATE INDEX "idx_product_lots_expiration" ON "public"."product_lots" USING "btree" ("expiration_date");



CREATE INDEX "idx_product_lots_fefo" ON "public"."product_lots" USING "btree" ("product_id", "status", "expiration_date");



CREATE INDEX "idx_product_lots_org" ON "public"."product_lots" USING "btree" ("organization_id");



CREATE INDEX "idx_product_lots_org_branch" ON "public"."product_lots" USING "btree" ("organization_id", "store_branch_id");



CREATE INDEX "idx_product_lots_product" ON "public"."product_lots" USING "btree" ("product_id");



CREATE INDEX "idx_product_lots_status" ON "public"."product_lots" USING "btree" ("status");



CREATE INDEX "idx_product_recipes_composite" ON "public"."product_recipes" USING "btree" ("composite_product_id");



CREATE INDEX "idx_product_recipes_ingredient" ON "public"."product_recipes" USING "btree" ("ingredient_product_id");



CREATE INDEX "idx_product_recipes_org" ON "public"."product_recipes" USING "btree" ("organization_id");



CREATE INDEX "idx_products_active" ON "public"."products" USING "btree" ("store_branch_id", "name") WHERE (("is_active" = true) AND ("store_branch_id" IS NOT NULL));



CREATE INDEX "idx_products_barcode" ON "public"."products" USING "btree" ("barcode") WHERE ("barcode" IS NOT NULL);



CREATE INDEX "idx_products_branch_category" ON "public"."products" USING "btree" ("store_branch_id", "category") WHERE ("store_branch_id" IS NOT NULL);



CREATE INDEX "idx_products_deleted_at" ON "public"."products" USING "btree" ("deleted_at") WHERE ("deleted_at" IS NULL);



CREATE UNIQUE INDEX "idx_products_fraction_product_id" ON "public"."products" USING "btree" ("fraction_product_id") WHERE ("fraction_product_id" IS NOT NULL);



CREATE INDEX "idx_products_name" ON "public"."products" USING "btree" ("name");



CREATE INDEX "idx_products_org_barcode" ON "public"."products" USING "btree" ("organization_id", "barcode");



CREATE INDEX "idx_products_org_branch" ON "public"."products" USING "btree" ("organization_id", "store_branch_id");



CREATE INDEX "idx_products_org_id" ON "public"."products" USING "btree" ("organization_id");



CREATE INDEX "idx_products_org_name" ON "public"."products" USING "btree" ("organization_id", "name");



CREATE INDEX "idx_profiles_org" ON "public"."profiles" USING "btree" ("organization_id");



CREATE INDEX "idx_sale_items_product" ON "public"."sale_items" USING "btree" ("product_id");



CREATE INDEX "idx_sale_items_sale" ON "public"."sale_items" USING "btree" ("sale_id");



CREATE INDEX "idx_sale_items_sale_id" ON "public"."sale_items" USING "btree" ("sale_id");



CREATE INDEX "idx_sales_branch_created_at" ON "public"."sales" USING "btree" ("store_branch_id", "created_at");



CREATE INDEX "idx_sales_cash_session" ON "public"."sales" USING "btree" ("cash_session_id");



CREATE INDEX "idx_sales_created_at" ON "public"."sales" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_sales_deleted_at" ON "public"."sales" USING "btree" ("deleted_at") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_sales_delivery_order_id" ON "public"."sales" USING "btree" ("delivery_order_id") WHERE ("delivery_order_id" IS NOT NULL);



CREATE INDEX "idx_sales_org_branch" ON "public"."sales" USING "btree" ("organization_id", "store_branch_id");



CREATE INDEX "idx_sales_org_created" ON "public"."sales" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "idx_sales_org_id" ON "public"."sales" USING "btree" ("organization_id");



CREATE INDEX "idx_sales_org_status" ON "public"."sales" USING "btree" ("organization_id", "status");



CREATE INDEX "idx_sales_payment_id" ON "public"."sales" USING "btree" ("payment_id");



CREATE INDEX "idx_sales_status" ON "public"."sales" USING "btree" ("status");



CREATE INDEX "idx_sales_store_branch" ON "public"."sales" USING "btree" ("store_branch_id");



CREATE INDEX "idx_stock_loss_log_branch" ON "public"."stock_loss_log" USING "btree" ("store_branch_id");



CREATE INDEX "idx_stock_loss_log_lot" ON "public"."stock_loss_log" USING "btree" ("lot_id");



CREATE INDEX "idx_stock_loss_log_org" ON "public"."stock_loss_log" USING "btree" ("organization_id");



CREATE INDEX "idx_stock_loss_log_org_branch" ON "public"."stock_loss_log" USING "btree" ("organization_id", "store_branch_id");



CREATE INDEX "idx_stock_loss_log_product" ON "public"."stock_loss_log" USING "btree" ("product_id");



CREATE INDEX "idx_stock_movements_org_branch" ON "public"."stock_movements" USING "btree" ("organization_id", "store_branch_id");



CREATE INDEX "idx_stock_movements_org_date" ON "public"."stock_movements" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "idx_stock_movements_org_id" ON "public"."stock_movements" USING "btree" ("organization_id");



CREATE INDEX "idx_stock_movements_product" ON "public"."stock_movements" USING "btree" ("product_id");



CREATE INDEX "idx_stock_movements_purchase_document" ON "public"."stock_movements" USING "btree" ("purchase_document_id");



CREATE INDEX "idx_stock_movements_type_date" ON "public"."stock_movements" USING "btree" ("organization_id", "store_branch_id", "type", "created_at" DESC);



CREATE INDEX "idx_store_branches_org" ON "public"."store_branches" USING "btree" ("organization_id");



CREATE INDEX "idx_suppliers_cnpj" ON "public"."suppliers" USING "btree" ("cnpj") WHERE ("cnpj" IS NOT NULL);



CREATE INDEX "idx_suppliers_org_branch" ON "public"."suppliers" USING "btree" ("organization_id", "store_branch_id");



CREATE INDEX "idx_suppliers_org_id" ON "public"."suppliers" USING "btree" ("organization_id");



CREATE INDEX "idx_system_settings_org" ON "public"."system_settings" USING "btree" ("organization_id");



CREATE INDEX "idx_system_users_branch" ON "public"."system_users" USING "btree" ("store_branch_id");



CREATE INDEX "idx_system_users_org" ON "public"."system_users" USING "btree" ("organization_id");



CREATE INDEX "idx_system_users_org_id" ON "public"."system_users" USING "btree" ("organization_id");



CREATE INDEX "idx_tables_org_branch" ON "public"."tables" USING "btree" ("organization_id", "store_branch_id");



CREATE UNIQUE INDEX "idx_tables_unique_name_branch" ON "public"."tables" USING "btree" ("lower"("name"), "store_branch_id") WHERE ("store_branch_id" IS NOT NULL);



CREATE INDEX "idx_webhook_events_branch" ON "public"."webhook_events" USING "btree" ("store_branch_id");



CREATE INDEX "idx_webhook_events_org" ON "public"."webhook_events" USING "btree" ("organization_id");



CREATE INDEX "idx_webhook_events_payment_id" ON "public"."webhook_events" USING "btree" ("payment_id");



CREATE INDEX "nf_records_branch_idx" ON "public"."nf_records" USING "btree" ("store_branch_id");



CREATE INDEX "nf_records_org_idx" ON "public"."nf_records" USING "btree" ("organization_id");



CREATE INDEX "nf_records_scan_date_idx" ON "public"."nf_records" USING "btree" ("scan_date" DESC);



CREATE UNIQUE INDEX "one_active_session_per_table" ON "public"."customer_sessions" USING "btree" ("table_id") WHERE ("status" = 'active'::"text");



CREATE INDEX "scanned_boletos_branch_idx" ON "public"."scanned_boletos" USING "btree" ("store_branch_id");



CREATE INDEX "scanned_boletos_org_idx" ON "public"."scanned_boletos" USING "btree" ("organization_id");



CREATE INDEX "scanned_boletos_scan_date_idx" ON "public"."scanned_boletos" USING "btree" ("scan_date" DESC);



CREATE UNIQUE INDEX "uq_payment_terminals_default" ON "public"."payment_terminals" USING "btree" ("user_id", "store_branch_id", "provider") WHERE "is_default";



CREATE UNIQUE INDEX "uq_printers_default_per_branch" ON "public"."printers" USING "btree" ("store_branch_id") WHERE "is_default";



CREATE OR REPLACE TRIGGER "prevent_duplicate_cash_sessions_trigger" BEFORE INSERT OR UPDATE ON "public"."cash_sessions" FOR EACH ROW WHEN (("new"."status" = 'open'::"text")) EXECUTE FUNCTION "public"."prevent_duplicate_cash_sessions"();



CREATE OR REPLACE TRIGGER "prevent_multiple_cash_sessions_trigger" BEFORE INSERT OR UPDATE ON "public"."cash_sessions" FOR EACH ROW WHEN (("new"."status" = 'open'::"text")) EXECUTE FUNCTION "public"."prevent_multiple_cash_sessions"();



CREATE OR REPLACE TRIGGER "trg_ai_insights_updated_at" BEFORE UPDATE ON "public"."ai_insights" FOR EACH ROW EXECUTE FUNCTION "public"."fn_update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_cash_sessions_updated_at" BEFORE UPDATE ON "public"."cash_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."fn_update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_customers_updated_at" BEFORE UPDATE ON "public"."customers" FOR EACH ROW WHEN (("old".* IS DISTINCT FROM "new".*)) EXECUTE FUNCTION "public"."fn_update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_delivery_distance_rates_updated_at" BEFORE UPDATE ON "public"."delivery_distance_rates" FOR EACH ROW EXECUTE FUNCTION "public"."fn_update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_delivery_neighborhoods_updated_at" BEFORE UPDATE ON "public"."delivery_neighborhoods" FOR EACH ROW EXECUTE FUNCTION "public"."fn_update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_delivery_orders_updated_at" BEFORE UPDATE ON "public"."delivery_orders" FOR EACH ROW EXECUTE FUNCTION "public"."fn_update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_delivery_settings_updated_at" BEFORE UPDATE ON "public"."delivery_settings" FOR EACH ROW EXECUTE FUNCTION "public"."fn_update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_ensure_cash_session_org" BEFORE INSERT OR UPDATE ON "public"."cash_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."fn_ensure_cash_session_org"();



CREATE OR REPLACE TRIGGER "trg_ensure_system_user_org" BEFORE INSERT OR UPDATE ON "public"."system_users" FOR EACH ROW EXECUTE FUNCTION "public"."fn_ensure_system_user_org"();



CREATE OR REPLACE TRIGGER "trg_financial_transactions_updated_at" BEFORE UPDATE ON "public"."financial_transactions" FOR EACH ROW EXECUTE FUNCTION "public"."fn_update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_footer_messages_updated_at" BEFORE UPDATE ON "public"."footer_messages" FOR EACH ROW WHEN (("old".* IS DISTINCT FROM "new".*)) EXECUTE FUNCTION "public"."fn_update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_footer_messages_validate_branch" BEFORE INSERT OR UPDATE ON "public"."footer_messages" FOR EACH ROW EXECUTE FUNCTION "public"."fn_validate_store_branch_id"();



CREATE OR REPLACE TRIGGER "trg_footer_messages_version" BEFORE UPDATE ON "public"."footer_messages" FOR EACH ROW WHEN (("old".* IS DISTINCT FROM "new".*)) EXECUTE FUNCTION "public"."fn_bump_version"();



CREATE OR REPLACE TRIGGER "trg_media_devices_updated_at" BEFORE UPDATE ON "public"."media_devices" FOR EACH ROW WHEN (("old".* IS DISTINCT FROM "new".*)) EXECUTE FUNCTION "public"."fn_update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_media_devices_validate_branch" BEFORE INSERT OR UPDATE ON "public"."media_devices" FOR EACH ROW EXECUTE FUNCTION "public"."fn_validate_store_branch_id"();



CREATE OR REPLACE TRIGGER "trg_media_devices_version" BEFORE UPDATE ON "public"."media_devices" FOR EACH ROW WHEN (("old".* IS DISTINCT FROM "new".*)) EXECUTE FUNCTION "public"."fn_bump_version"();



CREATE OR REPLACE TRIGGER "trg_module_visibility_updated_at" BEFORE UPDATE ON "public"."module_visibility" FOR EACH ROW EXECUTE FUNCTION "public"."fn_update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_movimentacoes_falhas_updated_at" BEFORE UPDATE ON "public"."movimentacoes_falhas" FOR EACH ROW EXECUTE FUNCTION "public"."fn_update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_nf_records_updated_at" BEFORE UPDATE ON "public"."nf_records" FOR EACH ROW EXECUTE FUNCTION "public"."fn_update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_payment_terminals_updated_at" BEFORE UPDATE ON "public"."payment_terminals" FOR EACH ROW EXECUTE FUNCTION "public"."fn_update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_pix_config_updated_at" BEFORE UPDATE ON "public"."pix_config" FOR EACH ROW EXECUTE FUNCTION "public"."fn_update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_printers_updated_at" BEFORE UPDATE ON "public"."printers" FOR EACH ROW WHEN (("old".* IS DISTINCT FROM "new".*)) EXECUTE FUNCTION "public"."fn_update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_printers_validate_branch" BEFORE INSERT OR UPDATE ON "public"."printers" FOR EACH ROW EXECUTE FUNCTION "public"."fn_validate_store_branch_id"();



CREATE OR REPLACE TRIGGER "trg_printers_version" BEFORE UPDATE ON "public"."printers" FOR EACH ROW WHEN (("old".* IS DISTINCT FROM "new".*)) EXECUTE FUNCTION "public"."fn_bump_version"();



CREATE OR REPLACE TRIGGER "trg_products_updated_at" BEFORE UPDATE ON "public"."products" FOR EACH ROW EXECUTE FUNCTION "public"."fn_update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_sale_items_updated_at" BEFORE UPDATE ON "public"."sale_items" FOR EACH ROW EXECUTE FUNCTION "public"."fn_update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_sales_updated_at" BEFORE UPDATE ON "public"."sales" FOR EACH ROW WHEN (("old".* IS DISTINCT FROM "new".*)) EXECUTE FUNCTION "public"."fn_update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_stock_change_log_updated_at" BEFORE UPDATE ON "public"."stock_change_log" FOR EACH ROW EXECUTE FUNCTION "public"."fn_update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_stock_movements_updated_at" BEFORE UPDATE ON "public"."stock_movements" FOR EACH ROW EXECUTE FUNCTION "public"."fn_update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_stock_not_negative" BEFORE UPDATE OF "stock_quantity" ON "public"."products" FOR EACH ROW WHEN (("new"."stock_quantity" < 0)) EXECUTE FUNCTION "public"."fn_prevent_negative_stock"();



CREATE OR REPLACE TRIGGER "trg_store_branches_updated_at" BEFORE UPDATE ON "public"."store_branches" FOR EACH ROW EXECUTE FUNCTION "public"."fn_update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_suppliers_updated_at" BEFORE UPDATE ON "public"."suppliers" FOR EACH ROW WHEN (("old".* IS DISTINCT FROM "new".*)) EXECUTE FUNCTION "public"."fn_update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_sync_product_name" AFTER UPDATE OF "name" ON "public"."products" FOR EACH ROW EXECUTE FUNCTION "public"."fn_sync_product_name"();



CREATE OR REPLACE TRIGGER "trg_sync_queue_updated_at" BEFORE UPDATE ON "public"."sync_queue" FOR EACH ROW EXECUTE FUNCTION "public"."fn_update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_system_settings_version" BEFORE UPDATE ON "public"."system_settings" FOR EACH ROW WHEN (("old".* IS DISTINCT FROM "new".*)) EXECUTE FUNCTION "public"."fn_bump_version"();



CREATE OR REPLACE TRIGGER "trg_system_users_updated_at" BEFORE UPDATE ON "public"."system_users" FOR EACH ROW WHEN (("old".* IS DISTINCT FROM "new".*)) EXECUTE FUNCTION "public"."fn_update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_user_permissions_updated_at" BEFORE UPDATE ON "public"."user_permissions" FOR EACH ROW EXECUTE FUNCTION "public"."fn_update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_validate_store_branch_id" BEFORE INSERT OR UPDATE ON "public"."cash_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."fn_validate_store_branch_id"();



CREATE OR REPLACE TRIGGER "trg_validate_store_branch_id" BEFORE INSERT OR UPDATE ON "public"."categories" FOR EACH ROW EXECUTE FUNCTION "public"."fn_validate_store_branch_id"();



CREATE OR REPLACE TRIGGER "trg_validate_store_branch_id" BEFORE INSERT OR UPDATE ON "public"."credit_payments" FOR EACH ROW EXECUTE FUNCTION "public"."fn_validate_store_branch_id"();



CREATE OR REPLACE TRIGGER "trg_validate_store_branch_id" BEFORE INSERT OR UPDATE ON "public"."customers" FOR EACH ROW EXECUTE FUNCTION "public"."fn_validate_store_branch_id"();



CREATE OR REPLACE TRIGGER "trg_validate_store_branch_id" BEFORE INSERT OR UPDATE ON "public"."financial_transactions" FOR EACH ROW EXECUTE FUNCTION "public"."fn_validate_store_branch_id"();



CREATE OR REPLACE TRIGGER "trg_validate_store_branch_id" BEFORE INSERT OR UPDATE ON "public"."nf_records" FOR EACH ROW EXECUTE FUNCTION "public"."fn_validate_store_branch_id"();



CREATE OR REPLACE TRIGGER "trg_validate_store_branch_id" BEFORE INSERT OR UPDATE ON "public"."products" FOR EACH ROW EXECUTE FUNCTION "public"."fn_validate_store_branch_id"();



CREATE OR REPLACE TRIGGER "trg_validate_store_branch_id" BEFORE INSERT OR UPDATE ON "public"."sale_items" FOR EACH ROW EXECUTE FUNCTION "public"."fn_validate_store_branch_id"();



CREATE OR REPLACE TRIGGER "trg_validate_store_branch_id" BEFORE INSERT OR UPDATE ON "public"."sales" FOR EACH ROW EXECUTE FUNCTION "public"."fn_validate_store_branch_id"();



CREATE OR REPLACE TRIGGER "trg_validate_store_branch_id" BEFORE INSERT OR UPDATE ON "public"."scanned_boletos" FOR EACH ROW EXECUTE FUNCTION "public"."fn_validate_store_branch_id"();



CREATE OR REPLACE TRIGGER "trg_validate_store_branch_id" BEFORE INSERT OR UPDATE ON "public"."stock_movements" FOR EACH ROW EXECUTE FUNCTION "public"."fn_validate_store_branch_id"();



CREATE OR REPLACE TRIGGER "trg_validate_store_branch_id" BEFORE INSERT OR UPDATE ON "public"."suppliers" FOR EACH ROW EXECUTE FUNCTION "public"."fn_validate_store_branch_id"();



CREATE OR REPLACE TRIGGER "trg_validate_store_branch_id" BEFORE INSERT OR UPDATE ON "public"."system_users" FOR EACH ROW EXECUTE FUNCTION "public"."fn_validate_store_branch_id"();



ALTER TABLE ONLY "public"."company_settings"
    ADD CONSTRAINT "company_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_sessions"
    ADD CONSTRAINT "customer_sessions_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "public"."tables"("id");



ALTER TABLE ONLY "public"."delivery_orders"
    ADD CONSTRAINT "delivery_orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id");



ALTER TABLE ONLY "public"."delivery_worker_earnings"
    ADD CONSTRAINT "delivery_worker_earnings_delivery_order_id_fkey" FOREIGN KEY ("delivery_order_id") REFERENCES "public"."delivery_orders"("id");



ALTER TABLE ONLY "public"."financial_transactions"
    ADD CONSTRAINT "financial_transactions_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cash_sessions"
    ADD CONSTRAINT "fk_cash_sessions_org" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cash_sessions"
    ADD CONSTRAINT "fk_cash_sessions_user" FOREIGN KEY ("user_id") REFERENCES "public"."system_users"("id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "fk_categories_org" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "fk_customers_org" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."financial_transactions"
    ADD CONSTRAINT "fk_financial_org" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nf_records"
    ADD CONSTRAINT "fk_nf_records_branch" FOREIGN KEY ("store_branch_id") REFERENCES "public"."store_branches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nf_records"
    ADD CONSTRAINT "fk_nf_records_org" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "fk_products_org" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sale_items"
    ADD CONSTRAINT "fk_sale_items_product" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."sale_items"
    ADD CONSTRAINT "fk_sale_items_sale" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "fk_sales_org" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stock_change_log"
    ADD CONSTRAINT "fk_stock_change_log_product" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "fk_stock_movements_org" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "fk_stock_movements_product" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."store_branches"
    ADD CONSTRAINT "fk_store_branches_org" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "fk_suppliers_org" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."system_settings"
    ADD CONSTRAINT "fk_system_settings_org" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."system_users"
    ADD CONSTRAINT "fk_system_users_org" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."footer_messages"
    ADD CONSTRAINT "footer_messages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."footer_messages"
    ADD CONSTRAINT "footer_messages_store_branch_id_fkey" FOREIGN KEY ("store_branch_id") REFERENCES "public"."store_branches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."media_devices"
    ADD CONSTRAINT "media_devices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."media_devices"
    ADD CONSTRAINT "media_devices_store_branch_id_fkey" FOREIGN KEY ("store_branch_id") REFERENCES "public"."store_branches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nf_records"
    ADD CONSTRAINT "nf_records_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."open_containers"
    ADD CONSTRAINT "open_containers_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."payment_terminals"
    ADD CONSTRAINT "payment_terminals_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_terminals"
    ADD CONSTRAINT "payment_terminals_store_branch_id_fkey" FOREIGN KEY ("store_branch_id") REFERENCES "public"."store_branches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pix_config"
    ADD CONSTRAINT "pix_config_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pix_config"
    ADD CONSTRAINT "pix_config_store_branch_id_fkey" FOREIGN KEY ("store_branch_id") REFERENCES "public"."store_branches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."printers"
    ADD CONSTRAINT "printers_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id");



ALTER TABLE ONLY "public"."printers"
    ADD CONSTRAINT "printers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."printers"
    ADD CONSTRAINT "printers_store_branch_id_fkey" FOREIGN KEY ("store_branch_id") REFERENCES "public"."store_branches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_lots"
    ADD CONSTRAINT "product_lots_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_lots"
    ADD CONSTRAINT "product_lots_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_lots"
    ADD CONSTRAINT "product_lots_store_branch_id_fkey" FOREIGN KEY ("store_branch_id") REFERENCES "public"."store_branches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_lots"
    ADD CONSTRAINT "product_lots_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id");



ALTER TABLE ONLY "public"."product_recipes"
    ADD CONSTRAINT "product_recipes_composite_product_id_fkey" FOREIGN KEY ("composite_product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_recipes"
    ADD CONSTRAINT "product_recipes_ingredient_product_id_fkey" FOREIGN KEY ("ingredient_product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_recipes"
    ADD CONSTRAINT "product_recipes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_recipes"
    ADD CONSTRAINT "product_recipes_store_branch_id_fkey" FOREIGN KEY ("store_branch_id") REFERENCES "public"."store_branches"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_fraction_product_id_fkey" FOREIGN KEY ("fraction_product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sales_cash_session_id_fkey" FOREIGN KEY ("cash_session_id") REFERENCES "public"."cash_sessions"("id");



ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sales_customer_session_id_fkey" FOREIGN KEY ("customer_session_id") REFERENCES "public"."customer_sessions"("id");



ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sales_delivery_order_id_fkey" FOREIGN KEY ("delivery_order_id") REFERENCES "public"."delivery_orders"("id");



ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sales_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "public"."tables"("id");



ALTER TABLE ONLY "public"."stock_loss_log"
    ADD CONSTRAINT "stock_loss_log_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "public"."product_lots"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."stock_loss_log"
    ADD CONSTRAINT "stock_loss_log_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stock_loss_log"
    ADD CONSTRAINT "stock_loss_log_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stock_loss_log"
    ADD CONSTRAINT "stock_loss_log_store_branch_id_fkey" FOREIGN KEY ("store_branch_id") REFERENCES "public"."store_branches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_purchase_document_id_fkey" FOREIGN KEY ("purchase_document_id") REFERENCES "public"."nf_records"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_permissions"
    ADD CONSTRAINT "user_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "admin_delete_org_settings" ON "public"."system_settings" FOR DELETE TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "admin_delete_org_users" ON "public"."system_users" FOR DELETE USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "admin_insert_org_settings" ON "public"."system_settings" FOR INSERT TO "authenticated" WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "admin_insert_org_users" ON "public"."system_users" FOR INSERT WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "admin_select_org_settings" ON "public"."system_settings" FOR SELECT USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "admin_select_org_users" ON "public"."system_users" FOR SELECT USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "admin_select_own_organization" ON "public"."organizations" FOR SELECT USING (("id" = "public"."get_user_org_id"()));



CREATE POLICY "admin_update_org_settings" ON "public"."system_settings" FOR UPDATE USING (("organization_id" = "public"."get_user_org_id"())) WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "admin_update_org_users" ON "public"."system_users" FOR UPDATE USING (("organization_id" = "public"."get_user_org_id"())) WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "admin_update_own_organization" ON "public"."organizations" FOR UPDATE USING (("id" = "public"."get_user_org_id"())) WITH CHECK (("id" = "public"."get_user_org_id"()));



ALTER TABLE "public"."ai_insights" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."api_keys" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "api_keys_select_authenticated" ON "public"."api_keys" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."branch_themes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "branch_themes_select_authenticated" ON "public"."branch_themes" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



ALTER TABLE "public"."cash_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cash_sessions_backup_20260902" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cash_sessions_select_authenticated" ON "public"."cash_sessions" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



ALTER TABLE "public"."categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "categories_select_anon" ON "public"."categories" FOR SELECT TO "anon" USING ((("organization_id" = ( SELECT "sb"."organization_id"
   FROM "public"."store_branches" "sb"
  WHERE ("sb"."id" = ((("current_setting"('request.headers'::"text", true))::json ->> 'x-branch-id'::"text"))::"uuid"))) AND ("store_branch_id" = ((("current_setting"('request.headers'::"text", true))::json ->> 'x-branch-id'::"text"))::"uuid")));



CREATE POLICY "categories_select_authenticated" ON "public"."categories" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "collaborator_select_self" ON "public"."system_users" FOR SELECT USING (("id" = "auth"."uid"()));



CREATE POLICY "collaborator_update_self" ON "public"."system_users" FOR UPDATE USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));



ALTER TABLE "public"."company_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."credit_payments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "credit_payments_select_authenticated" ON "public"."credit_payments" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



ALTER TABLE "public"."customer_sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "customer_sessions_insert_anon" ON "public"."customer_sessions" FOR INSERT TO "anon" WITH CHECK (true);



CREATE POLICY "customer_sessions_select_anon" ON "public"."customer_sessions" FOR SELECT TO "anon" USING ((("organization_id" = ( SELECT "sb"."organization_id"
   FROM "public"."store_branches" "sb"
  WHERE ("sb"."id" = ((("current_setting"('request.headers'::"text", true))::json ->> 'x-branch-id'::"text"))::"uuid"))) AND ("store_branch_id" = ((("current_setting"('request.headers'::"text", true))::json ->> 'x-branch-id'::"text"))::"uuid")));



CREATE POLICY "customer_sessions_select_authenticated" ON "public"."customer_sessions" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "customer_sessions_update_anon" ON "public"."customer_sessions" FOR UPDATE TO "anon" USING (true) WITH CHECK (true);



ALTER TABLE "public"."customers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "customers_select_authenticated" ON "public"."customers" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



ALTER TABLE "public"."delivery_distance_rates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "delivery_distance_rates_select_authenticated" ON "public"."delivery_distance_rates" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



ALTER TABLE "public"."delivery_neighborhoods" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "delivery_neighborhoods_select_authenticated" ON "public"."delivery_neighborhoods" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



ALTER TABLE "public"."delivery_orders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "delivery_orders_select_authenticated" ON "public"."delivery_orders" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



ALTER TABLE "public"."delivery_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "delivery_settings_select_authenticated" ON "public"."delivery_settings" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



ALTER TABLE "public"."delivery_worker_earnings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "delivery_worker_earnings_select_authenticated" ON "public"."delivery_worker_earnings" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



ALTER TABLE "public"."digital_menu_config" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "digital_menu_config_select_anon" ON "public"."digital_menu_config" FOR SELECT TO "anon" USING ((("organization_id" = ( SELECT "sb"."organization_id"
   FROM "public"."store_branches" "sb"
  WHERE ("sb"."id" = ((("current_setting"('request.headers'::"text", true))::json ->> 'x-branch-id'::"text"))::"uuid"))) AND ("store_branch_id" = ((("current_setting"('request.headers'::"text", true))::json ->> 'x-branch-id'::"text"))::"uuid")));



CREATE POLICY "digital_menu_config_select_authenticated" ON "public"."digital_menu_config" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



ALTER TABLE "public"."filial_backups" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."financial_transactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "financial_transactions_insert_own" ON "public"."financial_transactions" FOR INSERT TO "authenticated" WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "financial_transactions_select_authenticated" ON "public"."financial_transactions" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "financial_transactions_update_own" ON "public"."financial_transactions" FOR UPDATE TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"())) WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



ALTER TABLE "public"."footer_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "footer_messages_select_authenticated" ON "public"."footer_messages" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



ALTER TABLE "public"."media_devices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "media_devices_select_authenticated" ON "public"."media_devices" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



ALTER TABLE "public"."module_visibility" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "module_visibility_select_authenticated" ON "public"."module_visibility" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



ALTER TABLE "public"."movimentacoes_falhas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."nf_records" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "nf_records_select_authenticated" ON "public"."nf_records" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



ALTER TABLE "public"."open_containers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "open_containers_delete" ON "public"."open_containers" FOR DELETE USING (("public"."is_superadmin"() OR (("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"()))));



CREATE POLICY "open_containers_insert" ON "public"."open_containers" FOR INSERT WITH CHECK (("public"."is_superadmin"() OR (("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"()))));



CREATE POLICY "open_containers_select" ON "public"."open_containers" FOR SELECT USING (("public"."is_superadmin"() OR (("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"()))));



CREATE POLICY "open_containers_update" ON "public"."open_containers" FOR UPDATE USING (("public"."is_superadmin"() OR (("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())))) WITH CHECK (("public"."is_superadmin"() OR (("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"()))));



CREATE POLICY "org_branch_delete_api_keys" ON "public"."api_keys" FOR DELETE USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_delete_audit_log" ON "public"."audit_log" FOR DELETE TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_delete_boletos" ON "public"."scanned_boletos" FOR DELETE USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_delete_branch_themes" ON "public"."branch_themes" FOR DELETE USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_delete_cash_sessions" ON "public"."cash_sessions" FOR DELETE USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_delete_categories" ON "public"."categories" FOR DELETE USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_delete_company_settings" ON "public"."company_settings" FOR DELETE TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_delete_credit_payments" ON "public"."credit_payments" FOR DELETE USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_delete_customer_sessions" ON "public"."customer_sessions" FOR DELETE USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_delete_customers" ON "public"."customers" FOR DELETE USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_delete_delivery_distance_rates" ON "public"."delivery_distance_rates" FOR DELETE USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_delete_delivery_neighborhoods" ON "public"."delivery_neighborhoods" FOR DELETE USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_delete_delivery_orders" ON "public"."delivery_orders" FOR DELETE USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_delete_delivery_settings" ON "public"."delivery_settings" FOR DELETE USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_delete_digital_menu" ON "public"."digital_menu_config" FOR DELETE USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_delete_financial" ON "public"."financial_transactions" FOR DELETE USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_delete_footer_messages" ON "public"."footer_messages" FOR DELETE USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_delete_media_devices" ON "public"."media_devices" FOR DELETE USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_delete_module_visibility" ON "public"."module_visibility" FOR DELETE USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_delete_nf_records" ON "public"."nf_records" FOR DELETE USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_delete_printers" ON "public"."printers" FOR DELETE USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_delete_product_lots" ON "public"."product_lots" FOR DELETE USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_delete_products" ON "public"."products" FOR DELETE USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_delete_profiles" ON "public"."profiles" FOR DELETE TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_delete_sale_items" ON "public"."sale_items" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."sales" "s"
  WHERE (("s"."id" = "sale_items"."sale_id") AND ("s"."organization_id" = "public"."get_user_org_id"()) AND ("s"."store_branch_id" = "public"."get_user_branch_id"())))));



CREATE POLICY "org_branch_delete_sales" ON "public"."sales" FOR DELETE USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_delete_sessions" ON "public"."sessions" FOR DELETE TO "authenticated" USING (("store_branch_id" = "public"."get_user_branch_id"()));



CREATE POLICY "org_branch_delete_stock_loss_log" ON "public"."stock_loss_log" FOR DELETE USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_delete_stock_movements" ON "public"."stock_movements" FOR DELETE USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_delete_store_branches" ON "public"."store_branches" FOR DELETE TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "org_branch_delete_suppliers" ON "public"."suppliers" FOR DELETE USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_delete_sync_queue" ON "public"."sync_queue" FOR DELETE TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_delete_system_settings" ON "public"."system_settings" FOR DELETE TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_delete_system_users" ON "public"."system_users" FOR DELETE TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_delete_tables" ON "public"."tables" FOR DELETE USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_delete_user_permissions" ON "public"."user_permissions" FOR DELETE TO "authenticated" USING (("store_branch_id" = "public"."get_user_branch_id"()));



CREATE POLICY "org_branch_delete_webhook_events" ON "public"."webhook_events" FOR DELETE TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_insert_api_keys" ON "public"."api_keys" FOR INSERT WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_insert_audit_log" ON "public"."audit_log" FOR INSERT TO "authenticated" WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_insert_boletos" ON "public"."scanned_boletos" FOR INSERT WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_insert_branch_themes" ON "public"."branch_themes" FOR INSERT WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_insert_cash_sessions" ON "public"."cash_sessions" FOR INSERT WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_insert_categories" ON "public"."categories" FOR INSERT WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_insert_company_settings" ON "public"."company_settings" FOR INSERT TO "authenticated" WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_insert_credit_payments" ON "public"."credit_payments" FOR INSERT WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_insert_customer_sessions" ON "public"."customer_sessions" FOR INSERT TO "authenticated" WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_insert_customers" ON "public"."customers" FOR INSERT WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_insert_delivery_distance_rates" ON "public"."delivery_distance_rates" FOR INSERT WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_insert_delivery_neighborhoods" ON "public"."delivery_neighborhoods" FOR INSERT WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_insert_delivery_orders" ON "public"."delivery_orders" FOR INSERT WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_insert_delivery_settings" ON "public"."delivery_settings" FOR INSERT WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_insert_digital_menu" ON "public"."digital_menu_config" FOR INSERT WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_insert_financial" ON "public"."financial_transactions" FOR INSERT WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_insert_footer_messages" ON "public"."footer_messages" FOR INSERT WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_insert_media_devices" ON "public"."media_devices" FOR INSERT WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_insert_module_visibility" ON "public"."module_visibility" FOR INSERT WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_insert_nf_records" ON "public"."nf_records" FOR INSERT WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_insert_printers" ON "public"."printers" FOR INSERT WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_insert_product_lots" ON "public"."product_lots" FOR INSERT WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_insert_products" ON "public"."products" FOR INSERT WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_insert_profiles" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_insert_sale_items" ON "public"."sale_items" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."sales" "s"
  WHERE (("s"."id" = "sale_items"."sale_id") AND ("s"."organization_id" = "public"."get_user_org_id"()) AND ("s"."store_branch_id" = "public"."get_user_branch_id"())))));



CREATE POLICY "org_branch_insert_sales" ON "public"."sales" FOR INSERT TO "authenticated" WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_insert_sessions" ON "public"."sessions" FOR INSERT TO "authenticated" WITH CHECK (("store_branch_id" = "public"."get_user_branch_id"()));



CREATE POLICY "org_branch_insert_stock_loss_log" ON "public"."stock_loss_log" FOR INSERT WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_insert_stock_movements" ON "public"."stock_movements" FOR INSERT WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_insert_store_branches" ON "public"."store_branches" FOR INSERT TO "authenticated" WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "org_branch_insert_suppliers" ON "public"."suppliers" FOR INSERT WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_insert_sync_queue" ON "public"."sync_queue" FOR INSERT TO "authenticated" WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_insert_system_settings" ON "public"."system_settings" FOR INSERT TO "authenticated" WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_insert_system_users" ON "public"."system_users" FOR INSERT TO "authenticated" WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_insert_tables" ON "public"."tables" FOR INSERT WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_insert_user_permissions" ON "public"."user_permissions" FOR INSERT TO "authenticated" WITH CHECK (("store_branch_id" = "public"."get_user_branch_id"()));



CREATE POLICY "org_branch_insert_webhook_events" ON "public"."webhook_events" FOR INSERT TO "authenticated" WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_select_api_keys" ON "public"."api_keys" FOR SELECT USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_select_audit_log" ON "public"."audit_log" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_select_boletos" ON "public"."scanned_boletos" FOR SELECT USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_select_branch_themes" ON "public"."branch_themes" FOR SELECT USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_select_cash_sessions" ON "public"."cash_sessions" FOR SELECT USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_select_categories" ON "public"."categories" FOR SELECT USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_select_company_settings" ON "public"."company_settings" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_select_credit_payments" ON "public"."credit_payments" FOR SELECT USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_select_customer_sessions" ON "public"."customer_sessions" FOR SELECT USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_select_customers" ON "public"."customers" FOR SELECT USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_select_delivery_distance_rates" ON "public"."delivery_distance_rates" FOR SELECT USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_select_delivery_neighborhoods" ON "public"."delivery_neighborhoods" FOR SELECT USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_select_delivery_orders" ON "public"."delivery_orders" FOR SELECT USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_select_delivery_settings" ON "public"."delivery_settings" FOR SELECT USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_select_digital_menu" ON "public"."digital_menu_config" FOR SELECT USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_select_financial" ON "public"."financial_transactions" FOR SELECT USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_select_footer_messages" ON "public"."footer_messages" FOR SELECT USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_select_media_devices" ON "public"."media_devices" FOR SELECT USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_select_module_visibility" ON "public"."module_visibility" FOR SELECT USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_select_nf_records" ON "public"."nf_records" FOR SELECT USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_select_printers" ON "public"."printers" FOR SELECT USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_select_product_lots" ON "public"."product_lots" FOR SELECT USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_select_profiles" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_select_sale_items" ON "public"."sale_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."sales" "s"
  WHERE (("s"."id" = "sale_items"."sale_id") AND ("s"."organization_id" = "public"."get_user_org_id"()) AND ("s"."store_branch_id" = "public"."get_user_branch_id"())))));



CREATE POLICY "org_branch_select_sales" ON "public"."sales" FOR SELECT USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_select_sessions" ON "public"."sessions" FOR SELECT TO "authenticated" USING (("store_branch_id" = "public"."get_user_branch_id"()));



CREATE POLICY "org_branch_select_stock_loss_log" ON "public"."stock_loss_log" FOR SELECT USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_select_stock_movements" ON "public"."stock_movements" FOR SELECT USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_select_store_branches" ON "public"."store_branches" FOR SELECT TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "org_branch_select_suppliers" ON "public"."suppliers" FOR SELECT USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_select_sync_queue" ON "public"."sync_queue" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_select_system_settings" ON "public"."system_settings" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_select_system_users" ON "public"."system_users" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_select_tables" ON "public"."tables" FOR SELECT USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_select_user_permissions" ON "public"."user_permissions" FOR SELECT TO "authenticated" USING (("store_branch_id" = "public"."get_user_branch_id"()));



CREATE POLICY "org_branch_select_webhook_events" ON "public"."webhook_events" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_update_api_keys" ON "public"."api_keys" FOR UPDATE USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_update_audit_log" ON "public"."audit_log" FOR UPDATE TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"()))) WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_update_boletos" ON "public"."scanned_boletos" FOR UPDATE USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_update_branch_themes" ON "public"."branch_themes" FOR UPDATE USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_update_cash_sessions" ON "public"."cash_sessions" FOR UPDATE USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_update_categories" ON "public"."categories" FOR UPDATE USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_update_company_settings" ON "public"."company_settings" FOR UPDATE TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"()))) WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_update_credit_payments" ON "public"."credit_payments" FOR UPDATE USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_update_customer_sessions" ON "public"."customer_sessions" FOR UPDATE USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_update_customers" ON "public"."customers" FOR UPDATE USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_update_delivery_distance_rates" ON "public"."delivery_distance_rates" FOR UPDATE USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_update_delivery_neighborhoods" ON "public"."delivery_neighborhoods" FOR UPDATE USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_update_delivery_orders" ON "public"."delivery_orders" FOR UPDATE USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_update_delivery_settings" ON "public"."delivery_settings" FOR UPDATE USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_update_digital_menu" ON "public"."digital_menu_config" FOR UPDATE USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_update_financial" ON "public"."financial_transactions" FOR UPDATE USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_update_footer_messages" ON "public"."footer_messages" FOR UPDATE USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_update_media_devices" ON "public"."media_devices" FOR UPDATE USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_update_module_visibility" ON "public"."module_visibility" FOR UPDATE USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_update_nf_records" ON "public"."nf_records" FOR UPDATE USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_update_printers" ON "public"."printers" FOR UPDATE USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_update_product_lots" ON "public"."product_lots" FOR UPDATE USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_update_products" ON "public"."products" FOR UPDATE USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_update_profiles" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"()))) WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_update_sale_items" ON "public"."sale_items" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."sales" "s"
  WHERE (("s"."id" = "sale_items"."sale_id") AND ("s"."organization_id" = "public"."get_user_org_id"()) AND ("s"."store_branch_id" = "public"."get_user_branch_id"())))));



CREATE POLICY "org_branch_update_sales" ON "public"."sales" FOR UPDATE USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_update_sessions" ON "public"."sessions" FOR UPDATE TO "authenticated" USING (("store_branch_id" = "public"."get_user_branch_id"())) WITH CHECK (("store_branch_id" = "public"."get_user_branch_id"()));



CREATE POLICY "org_branch_update_stock_loss_log" ON "public"."stock_loss_log" FOR UPDATE USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_update_stock_movements" ON "public"."stock_movements" FOR UPDATE USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_update_store_branches" ON "public"."store_branches" FOR UPDATE TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"())) WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "org_branch_update_suppliers" ON "public"."suppliers" FOR UPDATE USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_update_sync_queue" ON "public"."sync_queue" FOR UPDATE TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"()))) WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_update_system_settings" ON "public"."system_settings" FOR UPDATE TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"()))) WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_update_system_users" ON "public"."system_users" FOR UPDATE TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"()))) WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_update_tables" ON "public"."tables" FOR UPDATE USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_branch_update_user_permissions" ON "public"."user_permissions" FOR UPDATE TO "authenticated" USING (("store_branch_id" = "public"."get_user_branch_id"())) WITH CHECK (("store_branch_id" = "public"."get_user_branch_id"()));



CREATE POLICY "org_branch_update_webhook_events" ON "public"."webhook_events" FOR UPDATE TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"()))) WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "org_delete_branches" ON "public"."store_branches" FOR DELETE TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "org_insert_branches" ON "public"."store_branches" FOR INSERT TO "authenticated" WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "org_select_branches" ON "public"."store_branches" FOR SELECT TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"()));



CREATE POLICY "org_update_branches" ON "public"."store_branches" FOR UPDATE TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"())) WITH CHECK (("organization_id" = "public"."get_user_org_id"()));



ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payment_terminals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payment_terminals_delete" ON "public"."payment_terminals" FOR DELETE USING (("public"."is_superadmin"() OR (("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"()))));



CREATE POLICY "payment_terminals_insert" ON "public"."payment_terminals" FOR INSERT WITH CHECK (("public"."is_superadmin"() OR (("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"()))));



CREATE POLICY "payment_terminals_select" ON "public"."payment_terminals" FOR SELECT USING (("public"."is_superadmin"() OR (("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"()))));



CREATE POLICY "payment_terminals_update" ON "public"."payment_terminals" FOR UPDATE USING (("public"."is_superadmin"() OR (("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())))) WITH CHECK (("public"."is_superadmin"() OR (("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"()))));



ALTER TABLE "public"."pix_config" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."printers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "printers_select_authenticated" ON "public"."printers" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



ALTER TABLE "public"."product_lots" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "product_lots_select_authenticated" ON "public"."product_lots" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "product_lots_select_own" ON "public"."product_lots" FOR SELECT TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"()));



ALTER TABLE "public"."product_recipes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "product_recipes_select_authenticated" ON "public"."product_recipes" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."products_deleted_at_backup_20260906" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "products_select_anon" ON "public"."products" FOR SELECT TO "anon" USING ((("store_branch_id" = ((("current_setting"('request.headers'::"text", true))::json ->> 'x-branch-id'::"text"))::"uuid") AND ("organization_id" = ( SELECT "sb"."organization_id"
   FROM "public"."store_branches" "sb"
  WHERE ("sb"."id" = ((("current_setting"('request.headers'::"text", true))::json ->> 'x-branch-id'::"text"))::"uuid")))));



CREATE POLICY "products_select_authenticated" ON "public"."products" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_select_own" ON "public"."profiles" FOR SELECT USING (("id" = "auth"."uid"()));



CREATE POLICY "profiles_update_own" ON "public"."profiles" FOR UPDATE USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));



ALTER TABLE "public"."sale_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sale_items_insert_anon" ON "public"."sale_items" FOR INSERT TO "anon" WITH CHECK (true);



CREATE POLICY "sale_items_select_anon" ON "public"."sale_items" FOR SELECT TO "anon" USING ((EXISTS ( SELECT 1
   FROM "public"."sales" "s"
  WHERE (("s"."id" = "sale_items"."sale_id") AND ("s"."store_branch_id" = ((("current_setting"('request.headers'::"text", true))::json ->> 'x-branch-id'::"text"))::"uuid") AND ("s"."organization_id" = ( SELECT "sb"."organization_id"
           FROM "public"."store_branches" "sb"
          WHERE ("sb"."id" = ((("current_setting"('request.headers'::"text", true))::json ->> 'x-branch-id'::"text"))::"uuid")))))));



CREATE POLICY "sale_items_select_authenticated" ON "public"."sale_items" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."sales" "s"
  WHERE (("s"."id" = "sale_items"."sale_id") AND ("s"."organization_id" = "public"."get_user_org_id"()) AND ("s"."store_branch_id" = "public"."get_user_branch_id"())))));



CREATE POLICY "sale_items_update_anon" ON "public"."sale_items" FOR UPDATE TO "anon" USING (true) WITH CHECK (true);



ALTER TABLE "public"."sales" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sales_columns_backup_20260902" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sales_deleted_at_backup_20260902" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sales_insert_anon" ON "public"."sales" FOR INSERT TO "anon" WITH CHECK (true);



CREATE POLICY "sales_select_anon" ON "public"."sales" FOR SELECT TO "anon" USING ((("organization_id" = ( SELECT "sb"."organization_id"
   FROM "public"."store_branches" "sb"
  WHERE ("sb"."id" = ((("current_setting"('request.headers'::"text", true))::json ->> 'x-branch-id'::"text"))::"uuid"))) AND ("store_branch_id" = ((("current_setting"('request.headers'::"text", true))::json ->> 'x-branch-id'::"text"))::"uuid")));



CREATE POLICY "sales_select_authenticated" ON "public"."sales" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "sales_update_anon" ON "public"."sales" FOR UPDATE TO "anon" USING (true) WITH CHECK (true);



ALTER TABLE "public"."scanned_boletos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "scanned_boletos_select_authenticated" ON "public"."scanned_boletos" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



ALTER TABLE "public"."sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stock_change_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stock_loss_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "stock_loss_log_select_authenticated" ON "public"."stock_loss_log" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



ALTER TABLE "public"."stock_movements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "stock_movements_insert_anon" ON "public"."stock_movements" FOR INSERT TO "anon" WITH CHECK (true);



CREATE POLICY "stock_movements_select_authenticated" ON "public"."stock_movements" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



ALTER TABLE "public"."store_branches" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "store_branches_select_anon" ON "public"."store_branches" FOR SELECT TO "anon" USING (true);



CREATE POLICY "superadmin_all_ai_insights" ON "public"."ai_insights" USING ("public"."is_superadmin"()) WITH CHECK ("public"."is_superadmin"());



CREATE POLICY "superadmin_all_api_keys" ON "public"."api_keys" USING ("public"."is_superadmin"()) WITH CHECK ("public"."is_superadmin"());



CREATE POLICY "superadmin_all_boletos" ON "public"."scanned_boletos" USING ("public"."is_superadmin"()) WITH CHECK ("public"."is_superadmin"());



CREATE POLICY "superadmin_all_branch_themes" ON "public"."branch_themes" USING ("public"."is_superadmin"()) WITH CHECK ("public"."is_superadmin"());



CREATE POLICY "superadmin_all_branches" ON "public"."store_branches" USING ("public"."is_superadmin"()) WITH CHECK ("public"."is_superadmin"());



CREATE POLICY "superadmin_all_cash_sessions" ON "public"."cash_sessions" USING ("public"."is_superadmin"()) WITH CHECK ("public"."is_superadmin"());



CREATE POLICY "superadmin_all_categories" ON "public"."categories" USING ("public"."is_superadmin"()) WITH CHECK ("public"."is_superadmin"());



CREATE POLICY "superadmin_all_company_settings" ON "public"."company_settings" USING ("public"."is_superadmin"()) WITH CHECK ("public"."is_superadmin"());



CREATE POLICY "superadmin_all_credit_payments" ON "public"."credit_payments" USING ("public"."is_superadmin"()) WITH CHECK ("public"."is_superadmin"());



CREATE POLICY "superadmin_all_customer_sessions" ON "public"."customer_sessions" USING ("public"."is_superadmin"()) WITH CHECK ("public"."is_superadmin"());



CREATE POLICY "superadmin_all_customers" ON "public"."customers" USING ("public"."is_superadmin"()) WITH CHECK ("public"."is_superadmin"());



CREATE POLICY "superadmin_all_delivery_distance_rates" ON "public"."delivery_distance_rates" USING ("public"."is_superadmin"()) WITH CHECK ("public"."is_superadmin"());



CREATE POLICY "superadmin_all_delivery_neighborhoods" ON "public"."delivery_neighborhoods" USING ("public"."is_superadmin"()) WITH CHECK ("public"."is_superadmin"());



CREATE POLICY "superadmin_all_delivery_orders" ON "public"."delivery_orders" USING ("public"."is_superadmin"()) WITH CHECK ("public"."is_superadmin"());



CREATE POLICY "superadmin_all_delivery_settings" ON "public"."delivery_settings" USING ("public"."is_superadmin"()) WITH CHECK ("public"."is_superadmin"());



CREATE POLICY "superadmin_all_delivery_worker_earnings" ON "public"."delivery_worker_earnings" USING ("public"."is_superadmin"()) WITH CHECK ("public"."is_superadmin"());



CREATE POLICY "superadmin_all_digital_menu" ON "public"."digital_menu_config" USING ("public"."is_superadmin"()) WITH CHECK ("public"."is_superadmin"());



CREATE POLICY "superadmin_all_filial_backups" ON "public"."filial_backups" USING ("public"."is_superadmin"()) WITH CHECK ("public"."is_superadmin"());



CREATE POLICY "superadmin_all_financial" ON "public"."financial_transactions" USING ("public"."is_superadmin"()) WITH CHECK ("public"."is_superadmin"());



CREATE POLICY "superadmin_all_footer_messages" ON "public"."footer_messages" USING ("public"."is_superadmin"()) WITH CHECK ("public"."is_superadmin"());



CREATE POLICY "superadmin_all_media_devices" ON "public"."media_devices" USING ("public"."is_superadmin"()) WITH CHECK ("public"."is_superadmin"());



CREATE POLICY "superadmin_all_module_visibility" ON "public"."module_visibility" USING ("public"."is_superadmin"()) WITH CHECK ("public"."is_superadmin"());



CREATE POLICY "superadmin_all_movimentacoes_falhas" ON "public"."movimentacoes_falhas" USING ("public"."is_superadmin"()) WITH CHECK ("public"."is_superadmin"());



CREATE POLICY "superadmin_all_nf_records" ON "public"."nf_records" USING ("public"."is_superadmin"()) WITH CHECK ("public"."is_superadmin"());



CREATE POLICY "superadmin_all_open_containers" ON "public"."open_containers" USING ("public"."is_superadmin"()) WITH CHECK ("public"."is_superadmin"());



CREATE POLICY "superadmin_all_organizations" ON "public"."organizations" USING ("public"."is_superadmin"()) WITH CHECK ("public"."is_superadmin"());



CREATE POLICY "superadmin_all_pix_config" ON "public"."pix_config" USING ("public"."is_superadmin"()) WITH CHECK ("public"."is_superadmin"());



CREATE POLICY "superadmin_all_printers" ON "public"."printers" USING ("public"."is_superadmin"()) WITH CHECK ("public"."is_superadmin"());



CREATE POLICY "superadmin_all_product_lots" ON "public"."product_lots" USING ("public"."is_superadmin"()) WITH CHECK ("public"."is_superadmin"());



CREATE POLICY "superadmin_all_product_recipes" ON "public"."product_recipes" USING ("public"."is_superadmin"()) WITH CHECK ("public"."is_superadmin"());



CREATE POLICY "superadmin_all_products" ON "public"."products" USING ("public"."is_superadmin"()) WITH CHECK ("public"."is_superadmin"());



CREATE POLICY "superadmin_all_profiles" ON "public"."profiles" USING ("public"."is_superadmin"()) WITH CHECK ("public"."is_superadmin"());



CREATE POLICY "superadmin_all_sale_items" ON "public"."sale_items" USING ("public"."is_superadmin"()) WITH CHECK ("public"."is_superadmin"());



CREATE POLICY "superadmin_all_sales" ON "public"."sales" USING ("public"."is_superadmin"()) WITH CHECK ("public"."is_superadmin"());



CREATE POLICY "superadmin_all_sessions" ON "public"."sessions" USING ("public"."is_superadmin"()) WITH CHECK ("public"."is_superadmin"());



CREATE POLICY "superadmin_all_settings" ON "public"."system_settings" USING ("public"."is_superadmin"()) WITH CHECK ("public"."is_superadmin"());



CREATE POLICY "superadmin_all_stock_change_log" ON "public"."stock_change_log" USING ("public"."is_superadmin"());



CREATE POLICY "superadmin_all_stock_loss_log" ON "public"."stock_loss_log" USING ("public"."is_superadmin"()) WITH CHECK ("public"."is_superadmin"());



CREATE POLICY "superadmin_all_stock_movements" ON "public"."stock_movements" USING ("public"."is_superadmin"()) WITH CHECK ("public"."is_superadmin"());



CREATE POLICY "superadmin_all_suppliers" ON "public"."suppliers" USING ("public"."is_superadmin"()) WITH CHECK ("public"."is_superadmin"());



CREATE POLICY "superadmin_all_sync_queue" ON "public"."sync_queue" USING ("public"."is_superadmin"()) WITH CHECK ("public"."is_superadmin"());



CREATE POLICY "superadmin_all_tables" ON "public"."tables" USING ("public"."is_superadmin"()) WITH CHECK ("public"."is_superadmin"());



CREATE POLICY "superadmin_all_user_permissions" ON "public"."user_permissions" USING ("public"."is_superadmin"()) WITH CHECK ("public"."is_superadmin"());



CREATE POLICY "superadmin_all_users" ON "public"."system_users" USING ("public"."is_superadmin"()) WITH CHECK ("public"."is_superadmin"());



CREATE POLICY "superadmin_all_webhook_events" ON "public"."webhook_events" USING ("public"."is_superadmin"()) WITH CHECK ("public"."is_superadmin"());



ALTER TABLE "public"."suppliers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "suppliers_select_authenticated" ON "public"."suppliers" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



ALTER TABLE "public"."sync_queue" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."system_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "system_settings_select_own" ON "public"."system_settings" FOR SELECT TO "authenticated" USING (("organization_id" = "public"."get_user_org_id"()));



ALTER TABLE "public"."system_users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "system_users_select_own" ON "public"."system_users" FOR SELECT TO "authenticated" USING (("id" = "auth"."uid"()));



ALTER TABLE "public"."tables" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tables_select_anon" ON "public"."tables" FOR SELECT TO "anon" USING (true);



CREATE POLICY "tables_select_authenticated" ON "public"."tables" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "user_delete_ai_insights" ON "public"."ai_insights" FOR DELETE USING (("store_branch_id" = "public"."get_user_branch_id"()));



CREATE POLICY "user_delete_delivery_worker_earnings" ON "public"."delivery_worker_earnings" FOR DELETE USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "user_delete_filial_backups" ON "public"."filial_backups" FOR DELETE TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "user_delete_movimentacoes_falhas" ON "public"."movimentacoes_falhas" FOR DELETE USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "user_delete_pix_config" ON "public"."pix_config" FOR DELETE USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "user_delete_product_recipes" ON "public"."product_recipes" FOR DELETE USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "user_delete_sessions" ON "public"."sessions" FOR DELETE USING (("store_branch_id" = "public"."get_user_branch_id"()));



CREATE POLICY "user_delete_stock_change_log" ON "public"."stock_change_log" FOR DELETE USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "user_delete_user_permissions" ON "public"."user_permissions" FOR DELETE USING (("store_branch_id" = "public"."get_user_branch_id"()));



CREATE POLICY "user_insert_ai_insights" ON "public"."ai_insights" FOR INSERT WITH CHECK (("store_branch_id" = "public"."get_user_branch_id"()));



CREATE POLICY "user_insert_delivery_worker_earnings" ON "public"."delivery_worker_earnings" FOR INSERT WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "user_insert_filial_backups" ON "public"."filial_backups" FOR INSERT TO "authenticated" WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "user_insert_movimentacoes_falhas" ON "public"."movimentacoes_falhas" FOR INSERT WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "user_insert_pix_config" ON "public"."pix_config" FOR INSERT WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "user_insert_product_recipes" ON "public"."product_recipes" FOR INSERT WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "user_insert_sessions" ON "public"."sessions" FOR INSERT WITH CHECK (("store_branch_id" = "public"."get_user_branch_id"()));



CREATE POLICY "user_insert_stock_change_log" ON "public"."stock_change_log" FOR INSERT WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "user_insert_user_permissions" ON "public"."user_permissions" FOR INSERT WITH CHECK (("store_branch_id" = "public"."get_user_branch_id"()));



ALTER TABLE "public"."user_permissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_select_ai_insights" ON "public"."ai_insights" FOR SELECT USING (("store_branch_id" = "public"."get_user_branch_id"()));



CREATE POLICY "user_select_delivery_worker_earnings" ON "public"."delivery_worker_earnings" FOR SELECT USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "user_select_filial_backups" ON "public"."filial_backups" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "user_select_movimentacoes_falhas" ON "public"."movimentacoes_falhas" FOR SELECT USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "user_select_pix_config" ON "public"."pix_config" FOR SELECT USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "user_select_product_recipes" ON "public"."product_recipes" FOR SELECT USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "user_select_sessions" ON "public"."sessions" FOR SELECT USING (("store_branch_id" = "public"."get_user_branch_id"()));



CREATE POLICY "user_select_stock_change_log" ON "public"."stock_change_log" FOR SELECT USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "user_select_user_permissions" ON "public"."user_permissions" FOR SELECT USING (("store_branch_id" = "public"."get_user_branch_id"()));



CREATE POLICY "user_update_ai_insights" ON "public"."ai_insights" FOR UPDATE USING (("store_branch_id" = "public"."get_user_branch_id"()));



CREATE POLICY "user_update_delivery_worker_earnings" ON "public"."delivery_worker_earnings" FOR UPDATE USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "user_update_filial_backups" ON "public"."filial_backups" FOR UPDATE TO "authenticated" USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"()))) WITH CHECK ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "user_update_movimentacoes_falhas" ON "public"."movimentacoes_falhas" FOR UPDATE USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "user_update_pix_config" ON "public"."pix_config" FOR UPDATE USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "user_update_product_recipes" ON "public"."product_recipes" FOR UPDATE USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "user_update_sessions" ON "public"."sessions" FOR UPDATE USING (("store_branch_id" = "public"."get_user_branch_id"()));



CREATE POLICY "user_update_stock_change_log" ON "public"."stock_change_log" FOR UPDATE USING ((("organization_id" = "public"."get_user_org_id"()) AND ("store_branch_id" = "public"."get_user_branch_id"())));



CREATE POLICY "user_update_user_permissions" ON "public"."user_permissions" FOR UPDATE USING (("store_branch_id" = "public"."get_user_branch_id"()));



ALTER TABLE "public"."webhook_events" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_add_user"("p_org_id" "uuid", "p_branch_id" "uuid", "p_name" "text", "p_email" "text", "p_role" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_add_user"("p_org_id" "uuid", "p_branch_id" "uuid", "p_name" "text", "p_email" "text", "p_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_add_user"("p_org_id" "uuid", "p_branch_id" "uuid", "p_name" "text", "p_email" "text", "p_role" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_create_organization"("p_name" "text", "p_admin_email" "text", "p_admin_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_create_organization"("p_name" "text", "p_admin_email" "text", "p_admin_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_create_organization"("p_name" "text", "p_admin_email" "text", "p_admin_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_delete_organization"("p_org_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_delete_organization"("p_org_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_fetch_branches"("p_org_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_fetch_branches"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_fetch_branches"("p_org_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_fetch_organizations"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_fetch_organizations"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_fetch_organizations"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_fetch_users"("p_org_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_fetch_users"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_fetch_users"("p_org_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."ajustar_estoque"("p_product_id" "uuid", "p_quantity" integer, "p_type" "text", "p_reason" "text", "p_operator_name" "text", "p_organization_id" "uuid", "p_store_branch_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ajustar_estoque"("p_product_id" "uuid", "p_quantity" integer, "p_type" "text", "p_reason" "text", "p_operator_name" "text", "p_organization_id" "uuid", "p_store_branch_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ajustar_estoque"("p_product_id" "uuid", "p_quantity" integer, "p_type" "text", "p_reason" "text", "p_operator_name" "text", "p_organization_id" "uuid", "p_store_branch_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."alert_missing_branch"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."alert_missing_branch"() TO "service_role";
GRANT ALL ON FUNCTION "public"."alert_missing_branch"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."can_access_branch"("target_branch_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_access_branch"("target_branch_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_access_branch"("target_branch_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_access_module"("module_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_access_module"("module_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_access_module"("module_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_perform_action"("module_name" "text", "action_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_perform_action"("module_name" "text", "action_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_perform_action"("module_name" "text", "action_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."cancel_sale_atomic"("p_sale_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_sale_atomic"("p_sale_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_sale_atomic"("p_sale_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."cardapio_branch_from_header"() TO "anon";
GRANT ALL ON FUNCTION "public"."cardapio_branch_from_header"() TO "authenticated";



GRANT ALL ON FUNCTION "public"."close_cash_session"("p_session_id" "uuid", "p_closing_balance" numeric, "p_notes" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."create_branch_policy"("p_table" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_branch_policy"("p_table" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_complete_sale"("p_sale_data" "jsonb", "p_items" "jsonb", "p_payments" "jsonb", "p_branch_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."create_customer_session"("p_table_id" "uuid", "p_customer_name" "text", "p_organization_id" "uuid", "p_store_branch_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_customer_session"("p_table_id" "uuid", "p_customer_name" "text", "p_organization_id" "uuid", "p_store_branch_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_filial_backup"("p_organization_id" "uuid", "p_store_branch_id" "uuid", "p_backup_name" "text", "p_backup_data" "jsonb", "p_is_automatic" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_filial_backup"("p_organization_id" "uuid", "p_store_branch_id" "uuid", "p_backup_name" "text", "p_backup_data" "jsonb", "p_is_automatic" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_filial_backup"("p_organization_id" "uuid", "p_store_branch_id" "uuid", "p_backup_name" "text", "p_backup_data" "jsonb", "p_is_automatic" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_org_policy"("p_table" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_org_policy"("p_table" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."daily_health_check"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."daily_health_check"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."debug_auth"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."debug_auth"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."excluir_mesa"("p_table_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."excluir_mesa"("p_table_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."excluir_mesa"("p_table_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."fechar_comanda"("p_session_id" "uuid", "p_payments" "jsonb", "p_operator_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fechar_comanda"("p_session_id" "uuid", "p_payments" "jsonb", "p_operator_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fechar_comanda"("p_session_id" "uuid", "p_payments" "jsonb", "p_operator_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_add_to_realtime"("p_table" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_add_to_realtime"("p_table" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_bump_version"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_bump_version"() TO "service_role";
GRANT ALL ON FUNCTION "public"."fn_bump_version"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."fn_ensure_cash_session_org"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_ensure_cash_session_org"() TO "service_role";
GRANT ALL ON FUNCTION "public"."fn_ensure_cash_session_org"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."fn_ensure_system_user_org"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_ensure_system_user_org"() TO "service_role";
GRANT ALL ON FUNCTION "public"."fn_ensure_system_user_org"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."fn_insserir_dlq"("p_operation_type" "text", "p_table_name" "text", "p_record_id" "text", "p_payload" "jsonb", "p_error_message" "text", "p_error_code" "text", "p_error_status" integer, "p_stack_trace" "text", "p_source" "text", "p_browser_id" "text", "p_user_email" "text", "p_store_branch_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_insserir_dlq"("p_operation_type" "text", "p_table_name" "text", "p_record_id" "text", "p_payload" "jsonb", "p_error_message" "text", "p_error_code" "text", "p_error_status" integer, "p_stack_trace" "text", "p_source" "text", "p_browser_id" "text", "p_user_email" "text", "p_store_branch_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_insserir_dlq"("p_operation_type" "text", "p_table_name" "text", "p_record_id" "text", "p_payload" "jsonb", "p_error_message" "text", "p_error_code" "text", "p_error_status" integer, "p_stack_trace" "text", "p_source" "text", "p_browser_id" "text", "p_user_email" "text", "p_store_branch_id" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."fn_insserir_dlq"("p_operation_type" "text", "p_table_name" "text", "p_record_id" "text", "p_payload" "jsonb", "p_error_message" "text", "p_error_code" "text", "p_error_status" integer, "p_stack_trace" "text", "p_source" "text", "p_browser_id" "text", "p_user_email" "text", "p_store_branch_id" "text") TO "anon";



REVOKE ALL ON FUNCTION "public"."fn_log_stock_changes"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_log_stock_changes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_log_stock_changes"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_prevent_negative_stock"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_prevent_negative_stock"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_prevent_negative_stock"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_sync_product_name"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_sync_product_name"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_sync_product_name"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."fn_update_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_update_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_update_updated_at"() TO "service_role";
GRANT ALL ON FUNCTION "public"."fn_update_updated_at"() TO "anon";



REVOKE ALL ON FUNCTION "public"."fn_validate_store_branch_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_validate_store_branch_id"() TO "service_role";
GRANT ALL ON FUNCTION "public"."fn_validate_store_branch_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_validate_store_branch_id"() TO "anon";



REVOKE ALL ON FUNCTION "public"."gerar_token_e_criar_sessao"("p_user_id" "uuid", "p_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."gerar_token_e_criar_sessao"("p_user_id" "uuid", "p_email" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_access_level_label"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_access_level_label"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_access_level_label"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_is_superadmin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_is_superadmin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_is_superadmin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_my_profile"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_profile"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_profile"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_user_access_level"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_user_access_level"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_access_level"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_user_branch_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_user_branch_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_branch_id"() TO "service_role";
GRANT ALL ON FUNCTION "public"."get_user_branch_id"() TO "anon";



REVOKE ALL ON FUNCTION "public"."get_user_org_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_user_org_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_org_id"() TO "service_role";
GRANT ALL ON FUNCTION "public"."get_user_org_id"() TO "anon";



REVOKE ALL ON FUNCTION "public"."get_user_role"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_user_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_role"() TO "service_role";
GRANT ALL ON FUNCTION "public"."get_user_role"() TO "anon";



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."has_permission"("p_module" "text", "p_action" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."has_permission"("p_module" "text", "p_action" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_permission"("p_module" "text", "p_action" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."health_check_branch_isolation"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."health_check_branch_isolation"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."heartbeat_media_device"("p_device_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."heartbeat_media_device"("p_device_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."heartbeat_media_device"("p_device_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_collaborator"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_collaborator"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_collaborator"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_developer"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_developer"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_developer"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_org_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_org_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_org_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_superadmin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_superadmin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_superadmin"() TO "service_role";
GRANT ALL ON FUNCTION "public"."is_superadmin"() TO "anon";



REVOKE ALL ON FUNCTION "public"."mark_user_logout"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_user_logout"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_user_logout"() TO "service_role";



GRANT ALL ON FUNCTION "public"."open_cash_session"("p_operator_name" "text", "p_store_branch_id" "uuid", "p_opening_balance" numeric) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."process_dlq"("p_organization_id" "text", "p_max_items" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."process_dlq"("p_organization_id" "text", "p_max_items" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."process_dlq"("p_organization_id" "text", "p_max_items" integer) TO "authenticated";



GRANT ALL ON FUNCTION "public"."process_purchase_document"("p_document_id" "uuid", "p_items" "jsonb", "p_operator_name" "text", "p_apply_margin" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_purchase_document"("p_document_id" "uuid", "p_items" "jsonb", "p_operator_name" "text", "p_apply_margin" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."process_sale_transaction"("p_sale_id" "uuid", "p_product_id" "text", "p_quantity" integer, "p_unit_price" numeric, "p_discount" numeric, "p_total" numeric, "p_reason" "text", "p_operator_name" "text", "p_organization_id" "uuid", "p_store_branch_id" "uuid", "p_sale_items" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."process_sale_transaction"("p_sale_id" "uuid", "p_product_id" "text", "p_quantity" integer, "p_unit_price" numeric, "p_discount" numeric, "p_total" numeric, "p_reason" "text", "p_operator_name" "text", "p_organization_id" "uuid", "p_store_branch_id" "uuid", "p_sale_items" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_sale_transaction"("p_sale_id" "uuid", "p_product_id" "text", "p_quantity" integer, "p_unit_price" numeric, "p_discount" numeric, "p_total" numeric, "p_reason" "text", "p_operator_name" "text", "p_organization_id" "uuid", "p_store_branch_id" "uuid", "p_sale_items" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."process_sale_transaction"("p_sale_id" "uuid", "p_product_id" "text", "p_quantity" integer, "p_unit_price" numeric, "p_discount" numeric, "p_total" numeric, "p_reason" "text", "p_operator_name" "text", "p_organization_id" "uuid", "p_store_branch_id" "uuid", "p_sale_items" "jsonb") TO "anon";



REVOKE ALL ON FUNCTION "public"."process_single_item"("p_product_id" "uuid", "p_quantity" integer, "p_org_id" "uuid", "p_branch_id" "uuid", "p_sale_id" "uuid", "p_operator_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."process_single_item"("p_product_id" "uuid", "p_quantity" integer, "p_org_id" "uuid", "p_branch_id" "uuid", "p_sale_id" "uuid", "p_operator_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_single_item"("p_product_id" "uuid", "p_quantity" integer, "p_org_id" "uuid", "p_branch_id" "uuid", "p_sale_id" "uuid", "p_operator_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."recover_orphan_sale"("p_sale_id" "uuid", "p_items" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."reprocessar_movimentacoes_falhas"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reprocessar_movimentacoes_falhas"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."restore_product_stock"("p_product_id" "uuid", "p_quantity" integer, "p_org_id" "uuid", "p_branch_id" "uuid", "p_sale_id" "uuid", "p_operator_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."restore_product_stock"("p_product_id" "uuid", "p_quantity" integer, "p_org_id" "uuid", "p_branch_id" "uuid", "p_sale_id" "uuid", "p_operator_name" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."set_current_branch"("p_branch_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_current_branch"("p_branch_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_current_branch"("p_branch_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."solicitar_fechamento_comanda"("p_sale_ids" "uuid"[], "p_session_token" "text", "p_payment_method" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."solicitar_fechamento_comanda"("p_sale_ids" "uuid"[], "p_session_token" "text", "p_payment_method" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."solicitar_fechamento_comanda"("p_sale_ids" "uuid"[], "p_session_token" "text", "p_payment_method" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."solicitar_fechamento_comanda"("p_sale_ids" "uuid"[], "p_session_token" "text", "p_payment_method" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."transfer_table_session"("p_session_id" "uuid", "p_new_table_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."transfer_table_session"("p_session_id" "uuid", "p_new_table_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."ai_insights" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_insights" TO "service_role";



GRANT ALL ON TABLE "public"."api_keys" TO "authenticated";
GRANT ALL ON TABLE "public"."api_keys" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."audit_log" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."audit_log" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."branch_themes" TO "authenticated";
GRANT ALL ON TABLE "public"."branch_themes" TO "service_role";



GRANT ALL ON TABLE "public"."cash_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."cash_sessions" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."cash_sessions_backup_20260902" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."categories" TO "anon";
GRANT ALL ON TABLE "public"."categories" TO "authenticated";
GRANT ALL ON TABLE "public"."categories" TO "service_role";



GRANT ALL ON TABLE "public"."company_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."company_settings" TO "service_role";



GRANT ALL ON TABLE "public"."sales" TO "anon";
GRANT ALL ON TABLE "public"."sales" TO "authenticated";
GRANT ALL ON TABLE "public"."sales" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."store_branches" TO "anon";
GRANT ALL ON TABLE "public"."store_branches" TO "authenticated";
GRANT ALL ON TABLE "public"."store_branches" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."consolidated_cash_report" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."consolidated_cash_report" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."consolidated_cash_report" TO "service_role";



GRANT ALL ON TABLE "public"."credit_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."credit_payments" TO "service_role";



GRANT ALL ON TABLE "public"."customer_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_sessions" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."customer_sessions" TO "anon";



GRANT ALL ON TABLE "public"."customers" TO "authenticated";
GRANT ALL ON TABLE "public"."customers" TO "service_role";



GRANT ALL ON TABLE "public"."delivery_distance_rates" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."delivery_distance_rates" TO "service_role";



GRANT ALL ON TABLE "public"."delivery_neighborhoods" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."delivery_neighborhoods" TO "service_role";



GRANT ALL ON TABLE "public"."delivery_orders" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."delivery_orders" TO "service_role";



GRANT ALL ON TABLE "public"."delivery_settings" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."delivery_settings" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."delivery_worker_earnings" TO "anon";
GRANT ALL ON TABLE "public"."delivery_worker_earnings" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."delivery_worker_earnings" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."digital_menu_config" TO "anon";
GRANT ALL ON TABLE "public"."digital_menu_config" TO "authenticated";
GRANT ALL ON TABLE "public"."digital_menu_config" TO "service_role";



GRANT ALL ON TABLE "public"."filial_backups" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."filial_backups" TO "service_role";



GRANT ALL ON TABLE "public"."financial_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."financial_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."footer_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."footer_messages" TO "service_role";



GRANT ALL ON TABLE "public"."media_devices" TO "authenticated";
GRANT ALL ON TABLE "public"."media_devices" TO "service_role";



GRANT ALL ON TABLE "public"."module_visibility" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."module_visibility" TO "service_role";



GRANT ALL ON TABLE "public"."movimentacoes_falhas" TO "authenticated";
GRANT ALL ON TABLE "public"."movimentacoes_falhas" TO "service_role";



GRANT ALL ON TABLE "public"."nf_records" TO "authenticated";
GRANT ALL ON TABLE "public"."nf_records" TO "service_role";



GRANT ALL ON TABLE "public"."open_containers" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."open_containers" TO "service_role";



GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";



GRANT ALL ON TABLE "public"."payment_terminals" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."payment_terminals" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."pix_config" TO "anon";
GRANT ALL ON TABLE "public"."pix_config" TO "authenticated";
GRANT ALL ON TABLE "public"."pix_config" TO "service_role";



GRANT ALL ON TABLE "public"."printers" TO "authenticated";
GRANT ALL ON TABLE "public"."printers" TO "service_role";



GRANT ALL ON TABLE "public"."product_lots" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."product_lots" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."product_recipes" TO "anon";
GRANT ALL ON TABLE "public"."product_recipes" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."product_recipes" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."products" TO "anon";
GRANT ALL ON TABLE "public"."products" TO "authenticated";
GRANT ALL ON TABLE "public"."products" TO "service_role";



GRANT SELECT ON TABLE "public"."products_deleted_at_backup_20260906" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."sale_items" TO "anon";
GRANT ALL ON TABLE "public"."sale_items" TO "authenticated";
GRANT ALL ON TABLE "public"."sale_items" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."sales_columns_backup_20260902" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."sales_columns_backup_20260902" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."sales_columns_backup_20260902" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."sales_deleted_at_backup_20260902" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."sales_deleted_at_backup_20260902" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."sales_deleted_at_backup_20260902" TO "service_role";



GRANT ALL ON TABLE "public"."scanned_boletos" TO "authenticated";
GRANT ALL ON TABLE "public"."scanned_boletos" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."sessions" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."sessions" TO "service_role";



GRANT ALL ON TABLE "public"."stock_change_log" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_change_log" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."stock_loss_log" TO "anon";
GRANT ALL ON TABLE "public"."stock_loss_log" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."stock_loss_log" TO "service_role";



GRANT ALL ON TABLE "public"."stock_movements" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_movements" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."stock_movements" TO "anon";



GRANT ALL ON TABLE "public"."suppliers" TO "authenticated";
GRANT ALL ON TABLE "public"."suppliers" TO "service_role";



GRANT ALL ON TABLE "public"."sync_queue" TO "authenticated";
GRANT ALL ON TABLE "public"."sync_queue" TO "service_role";



GRANT ALL ON TABLE "public"."system_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."system_settings" TO "service_role";



GRANT ALL ON TABLE "public"."system_users" TO "authenticated";
GRANT ALL ON TABLE "public"."system_users" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."tables" TO "anon";
GRANT ALL ON TABLE "public"."tables" TO "authenticated";
GRANT ALL ON TABLE "public"."tables" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."user_permissions" TO "anon";
GRANT ALL ON TABLE "public"."user_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."user_permissions" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."v_documents_list" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."v_documents_list" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."v_documents_list" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."v_stock_movements_dashboard" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."v_stock_movements_dashboard" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."v_stock_movements_dashboard" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."vw_cash_report" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."vw_cash_report" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."vw_cash_report" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."vw_dlq_pendentes" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."vw_dlq_pendentes" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."vw_dlq_pendentes" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."vw_dlq_resumo" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."vw_dlq_resumo" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."vw_dlq_resumo" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."vw_report_sale_items" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."vw_report_sale_items" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."vw_report_sale_items" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."webhook_events" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."webhook_events" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "service_role";







