-- ==============================================================================
-- 20260809_rls_force_cleanup.sql
-- FORÇA drop de policies duplicadas + recria permissivas limpos
-- CORREÇÃO: join usa pol.polrelid = cls.oid (não pol.oid)
-- ==============================================================================

-- 1. Helper functions
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND organization_id IS NULL);
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION public.get_user_org_id()
RETURNS UUID AS $$
  SELECT organization_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION public.get_user_branch_id()
RETURNS UUID AS $$
  SELECT store_branch_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE SQL STABLE;

-- 2. DROP ALL policies via pg_policies (view correta)
DO $$
DECLARE
  pol_name TEXT;
  tab_name TEXT;
BEGIN
  FOR pol_name, tab_name IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s" ON public.%I', pol_name, tab_name);
    RAISE NOTICE 'Dropped: % on %', pol_name, tab_name;
  END LOOP;
END $$;

-- 3. VERIFICAR se realmente zerou
SELECT count(*) as total_policies FROM pg_policies WHERE schemaname='public';

-- 4. Recriar permissivas para todas as tabelas
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'products','categories','customers','suppliers',
    'sales','sale_items','financial_transactions',
    'cash_sessions','stock_movements','store_branches',
    'system_users','system_settings',
    'scanned_boletos','credit_payments','nf_records',
    'footer_messages','media_devices','printers',
    'tables','customer_sessions','digital_menu_config',
    'branch_themes','api_keys','profiles','organizations',
    'sync_queue','pix_config','movimentacoes_falhas',
    'ai_insights','company_settings','stock_change_log',
    'sessions','user_permissions'
  ]) LOOP
    EXECUTE format('CREATE POLICY "%s_r" ON public.%I FOR SELECT USING (true)', t, t);
    EXECUTE format('CREATE POLICY "%s_a" ON public.%I FOR INSERT WITH CHECK (true)', t, t);
    EXECUTE format('CREATE POLICY "%s_u" ON public.%I FOR UPDATE USING (true) WITH CHECK (true)', t, t);
    EXECUTE format('CREATE POLICY "%s_d" ON public.%I FOR DELETE USING (true)', t, t);
    RAISE NOTICE '✅ %', t;
  END LOOP;
END $$;

-- 5. Status final
SELECT tablename, count(*) as policies
FROM pg_policies WHERE schemaname='public'
GROUP BY tablename ORDER BY tablename;
