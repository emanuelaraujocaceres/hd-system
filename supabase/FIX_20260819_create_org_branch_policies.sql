-- =====================================================================
-- FIX 2026-08-19 (v2): Criar policies org_branch em todas as 32 tables
-- do frontend que ainda não têm (idempotente via checagem de existência)
-- PG14-compatible: usa DO $$ com EXISTS checks
-- ⚠️ Feche o app desktop por ~60s antes de rodar (evita deadlock transitório)
-- =====================================================================

DO $$
DECLARE
  v_tables TEXT[] := ARRAY[
    'products', 'categories', 'customers', 'suppliers',
    'sales', 'sale_items', 'financial_transactions',
    'cash_sessions', 'stock_movements', 'store_branches',
    'system_users', 'system_settings', 'scanned_boletos',
    'credit_payments', 'nf_records', 'footer_messages',
    'media_devices', 'printers', 'tables', 'customer_sessions',
    'digital_menu_config', 'branch_themes', 'api_keys',
    'delivery_settings', 'delivery_neighborhoods', 'delivery_distance_rates',
    'delivery_orders', 'delivery_worker_earnings', 'module_visibility',
    'product_lots', 'product_recipes', 'stock_loss_log'
  ];
  v_t TEXT;
  v_has_org BOOLEAN;
  v_has_branch BOOLEAN;
  v_has_org_branch_policy BOOLEAN;
  v_using TEXT;
  v_with_check TEXT;
BEGIN
  FOREACH v_t IN ARRAY v_tables LOOP
    -- 1. Check columns
    SELECT
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=v_t AND column_name='organization_id'),
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=v_t AND column_name='store_branch_id')
    INTO v_has_org, v_has_branch;

    -- 2. Check if already has org_branch policy
    SELECT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename=v_t
        AND qual LIKE '%organization_id%' AND qual LIKE '%store_branch_id%'
    ) INTO v_has_org_branch_policy;

    -- Skip if already has org_branch policy
    IF v_has_org_branch_policy THEN
      RAISE NOTICE '⏭️  Já tem org_branch: %', v_t;
      CONTINUE;
    END IF;

    -- 3. Determine USING/WITH CHECK expressions
    IF v_has_org AND v_has_branch THEN
      v_using := 'organization_id = get_user_org_id() AND store_branch_id = get_user_branch_id()';
      v_with_check := 'organization_id = get_user_org_id() AND store_branch_id = get_user_branch_id()';
    ELSIF v_has_org THEN
      v_using := 'organization_id = get_user_org_id()';
      v_with_check := 'organization_id = get_user_org_id()';
    ELSE
      -- No org/branch columns (e.g., sale_items) → skip (handled separately)
      RAISE NOTICE '⚠️  Sem org/branch columns, pulando: %', v_t;
      CONTINUE;
    END IF;

    -- 4. Create 4 policies (idempotent: DROP IF EXISTS first)
    EXECUTE format('DROP POLICY IF EXISTS org_branch_select_%I ON public.%I', v_t, v_t);
    EXECUTE format('CREATE POLICY org_branch_select_%I ON public.%I FOR SELECT TO authenticated USING (%s)', v_t, v_t, v_using);

    EXECUTE format('DROP POLICY IF EXISTS org_branch_insert_%I ON public.%I', v_t, v_t);
    EXECUTE format('CREATE POLICY org_branch_insert_%I ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)', v_t, v_t, v_with_check);

    EXECUTE format('DROP POLICY IF EXISTS org_branch_update_%I ON public.%I', v_t, v_t);
    EXECUTE format('CREATE POLICY org_branch_update_%I ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)', v_t, v_t, v_using, v_with_check);

    EXECUTE format('DROP POLICY IF EXISTS org_branch_delete_%I ON public.%I', v_t, v_t);
    EXECUTE format('CREATE POLICY org_branch_delete_%I ON public.%I FOR DELETE TO authenticated USING (%s)', v_t, v_t, v_using);

    RAISE NOTICE '✅ Criadas 4 policies org_branch: %', v_t;
  END LOOP;
END $$;

-- Verificação: quantas tables têm org_branch policies agora
SELECT COUNT(DISTINCT tablename) AS tables_com_org_branch
FROM pg_policies
WHERE schemaname='public'
  AND qual LIKE '%organization_id%'
  AND qual LIKE '%store_branch_id%';