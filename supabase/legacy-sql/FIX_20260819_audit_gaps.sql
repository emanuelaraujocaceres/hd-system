-- ═══════════════════════════════════════════════════════════════════
-- FIX_20260819_audit_gaps.sql — CORREÇÕES DA AUDITORIA TOTAL (2026-08-19)
-- Aplicar no Supabase SQL Editor em blocos pequenos (regra 0d).
-- Cada SEÇÃO é independente e idempotente (DROP IF EXISTS + CREATE).
-- ═══════════════════════════════════════════════════════════════════

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ SEÇÃO 0 — CHECK OBRIGATÓRIO ANTES: superadmin tem org NULL?      ║
-- ║ Se organization_id NÃO for NULL → me avise ANTES de continuar:   ║
-- ║ o is_superadmin() ativo (org NULL) quebra o bypass RLS.          ║
-- ╚══════════════════════════════════════════════════════════════════╝
SELECT email, organization_id, superadmin, role, active
FROM system_users
ORDER BY email;

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ SEÇÃO 1 — fn_insserir_dlq QUEBRADA (regressão do restore 08-19) ║
-- ║ get_auth_user_org_id() foi DROPADA mas a função ainda a chama.   ║
-- ║ Toda falha de sync que cai na DLQ agora estoura 42883.           ║
-- ╚══════════════════════════════════════════════════════════════════╝
CREATE OR REPLACE FUNCTION public.fn_insserir_dlq(
  p_operation_type text,
  p_table_name text,
  p_record_id text DEFAULT NULL::text,
  p_payload jsonb DEFAULT NULL::jsonb,
  p_error_message text DEFAULT NULL::text,
  p_error_code text DEFAULT NULL::text,
  p_error_status integer DEFAULT NULL::integer,
  p_stack_trace text DEFAULT NULL::text,
  p_source text DEFAULT 'sync_queue'::text,
  p_browser_id text DEFAULT NULL::text,
  p_user_email text DEFAULT NULL::text,
  p_store_branch_id text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
$function$;

GRANT EXECUTE ON FUNCTION public.fn_insserir_dlq(text, text, text, jsonb, text, text, integer, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_insserir_dlq(text, text, text, jsonb, text, text, integer, text, text, text, text, text) TO service_role;

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ SEÇÃO 2 — GRANTs FALTANTES (writes/reads do frontend falham)     ║
-- ║ Sintoma: "permission denied for table X" + dados só no local     ║
-- ║ product_lots / stock_loss_log: frontend faz upsertRow (escrita!) ║
-- ║ product_recipes / delivery_worker_earnings: sem SELECT nem write ║
-- ║   → Realtime de authenticated falha nessas 2 tabelas.            ║
-- ║ user_permissions: sem INSERT/UPDATE/DELETE.                      ║
-- ╚══════════════════════════════════════════════════════════════════╝
GRANT INSERT, UPDATE, DELETE ON public.product_lots TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.stock_loss_log TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_recipes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_worker_earnings TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.user_permissions TO authenticated;

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ SEÇÃO 3 — system_settings: faltam INSERT/DELETE p/ admin da org  ║
-- ║ Upsert do syncSettings: se a linha NÃO existe (1ª vez da org),   ║
-- ║ vira INSERT → sem policy de INSERT → RLS denega.                 ║
-- ╚══════════════════════════════════════════════════════════════════╝
DROP POLICY IF EXISTS admin_insert_org_settings ON public.system_settings;
CREATE POLICY admin_insert_org_settings ON public.system_settings
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = get_user_org_id());

DROP POLICY IF EXISTS admin_delete_org_settings ON public.system_settings;
CREATE POLICY admin_delete_org_settings ON public.system_settings
  FOR DELETE TO authenticated
  USING (organization_id = get_user_org_id());

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ SEÇÃO 4 — filial_backups: policies só por org = VAZAMENTO        ║
-- ║ A tabela tem store_branch_id e backup_data (EXPORT COMPLETO da   ║
-- ║ filial). Collaborator da filial A conseguia ler backup da B.     ║
-- ║ Correção: escopar as 4 policies por org+branch (regra BUG-RLS-002)║
-- ╚══════════════════════════════════════════════════════════════════╝
DROP POLICY IF EXISTS user_select_filial_backups ON public.filial_backups;
CREATE POLICY user_select_filial_backups ON public.filial_backups
  FOR SELECT TO authenticated
  USING ((organization_id = get_user_org_id()) AND (store_branch_id = get_user_branch_id()));

DROP POLICY IF EXISTS user_insert_filial_backups ON public.filial_backups;
CREATE POLICY user_insert_filial_backups ON public.filial_backups
  FOR INSERT TO authenticated
  WITH CHECK ((organization_id = get_user_org_id()) AND (store_branch_id = get_user_branch_id()));

DROP POLICY IF EXISTS user_update_filial_backups ON public.filial_backups;
CREATE POLICY user_update_filial_backups ON public.filial_backups
  FOR UPDATE TO authenticated
  USING ((organization_id = get_user_org_id()) AND (store_branch_id = get_user_branch_id()))
  WITH CHECK ((organization_id = get_user_org_id()) AND (store_branch_id = get_user_branch_id()));

DROP POLICY IF EXISTS user_delete_filial_backups ON public.filial_backups;
CREATE POLICY user_delete_filial_backups ON public.filial_backups
  FOR DELETE TO authenticated
  USING ((organization_id = get_user_org_id()) AND (store_branch_id = get_user_branch_id()));

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ SEÇÃO 5 — process_sale_transaction: dedução de estoque sem       ║
-- ║ validação de propriedade (SECURITY DEFINER + anon-executável)    ║
-- ║ Qualquer um podia deduzir estoque de produto de OUTRA org.       ║
-- ║ Correção: produto deve pertencer à org+branch passadas.          ║
-- ╚══════════════════════════════════════════════════════════════════╝
CREATE OR REPLACE FUNCTION public.process_sale_transaction(
  p_sale_id UUID,
  p_product_id TEXT DEFAULT NULL,
  p_quantity INTEGER DEFAULT 0,
  p_unit_price NUMERIC(12,2) DEFAULT 0,
  p_discount NUMERIC(12,2) DEFAULT 0,
  p_total NUMERIC(12,2) DEFAULT 0,
  p_reason TEXT DEFAULT 'Venda PDV',
  p_operator_name TEXT DEFAULT 'Sistema',
  p_organization_id UUID DEFAULT '00000000-0000-0000-0000-000000000001',
  p_store_branch_id UUID DEFAULT NULL,
  p_sale_items JSONB DEFAULT '[]'::JSONB
)
RETURNS TABLE(success BOOLEAN, message TEXT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_item RECORD;
  v_current_stock INTEGER;
  v_new_stock INTEGER;
BEGIN
  -- Processa cada item da venda
  FOR v_item IN
    SELECT
      (item->>'product_id')::UUID AS product_id,
      (item->>'quantity')::INTEGER AS quantity
    FROM jsonb_array_elements(p_sale_items) AS item
  LOOP
    -- Verifica estoque (bloqueio de linha: evita venda duplicada concorrente)
    -- FIX AUDIT: produto DEVE pertencer à org+branch da venda (era cross-org)
    SELECT stock_quantity INTO v_current_stock
    FROM products
    WHERE id = v_item.product_id
      AND organization_id = p_organization_id
      AND store_branch_id = p_store_branch_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN QUERY SELECT FALSE, 'Produto não encontrado na org/filial: ' || v_item.product_id::text;
      RETURN;
    END IF;

    IF v_current_stock < v_item.quantity THEN
      RETURN QUERY SELECT FALSE, 'Estoque insuficiente para o produto';
      RETURN;
    END IF;

    -- Deduz estoque atomicamente
    v_new_stock := v_current_stock - v_item.quantity;
    UPDATE products SET stock_quantity = v_new_stock, updated_at = NOW()
    WHERE id = v_item.product_id;

    -- NOTA: a linha em stock_movements é criada pelo frontend
    -- (syncStockMovement, com store_branch_id). Não inserir aqui — senão
    -- cada venda gera movimentação duplicada.
  END LOOP;

  RETURN QUERY SELECT TRUE, 'Venda processada com sucesso';
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_sale_transaction(uuid, text, integer, numeric, numeric, numeric, text, text, uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_sale_transaction(uuid, text, integer, numeric, numeric, numeric, text, text, uuid, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.process_sale_transaction(uuid, text, integer, numeric, numeric, numeric, text, text, uuid, uuid, jsonb) TO anon;

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ SEÇÃO 6 — HIGIENE: GRANTs anon sem policy correspondente         ║
-- ║ RLS bloqueia (sem policy anon), mas GRANT INSERT/UPDATE/DELETE   ║
-- ║ para anon em tabelas sensíveis é ruído perigoso. Revogar:        ║
-- ║   • escrita anon nas tabelas do cardápio (mantém só SELECT)      ║
-- ║   • TUDO anon em tabelas internas (sem policy anon)              ║
-- ╚══════════════════════════════════════════════════════════════════╝
REVOKE INSERT, UPDATE, DELETE ON public.categories, public.products, public.sales, public.sale_items, public.store_branches FROM anon;
REVOKE ALL ON public.system_users, public.system_settings, public.sync_queue, public.scanned_boletos, public.stock_change_log, public.stock_movements, public.suppliers FROM anon;

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ SEÇÃO 7 — VALIDAÇÃO PÓS-FIX (rode depois, confira os resultados) ║
-- ╚══════════════════════════════════════════════════════════════════╝
SELECT tablename, policyname, cmd, roles::text
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('system_settings', 'filial_backups')
ORDER BY tablename, cmd;

SELECT c.relname AS tabela,
       (SELECT string_agg(DISTINCT privilege_type, ',') FROM information_schema.role_table_grants g
         WHERE g.table_name = c.relname AND g.grantee = 'authenticated') AS auth_privileges
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN ('product_lots', 'stock_loss_log', 'product_recipes', 'delivery_worker_earnings', 'user_permissions')
ORDER BY c.relname;