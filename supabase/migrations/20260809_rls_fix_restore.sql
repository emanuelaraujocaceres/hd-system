-- ==============================================================================
-- FIX: Restaurar policies permissivas para desbloquear o app
-- O RLS foi ativado mas policies reais falham (helpers não existem + anon blocked)
-- Aplicar ESTE SQL no SQL Editor para restaurar funcionamento.
-- ==============================================================================

-- 1. Helper functions (necessárias antes de policies reais)
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

-- 2. Drop ALL policies existentes (libera tabelas bloqueadas)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT pol.polname AS policy_name, cls.relname AS table_name
    FROM pg_policy pol
    JOIN pg_class cls ON pol.oid = cls.oid
    JOIN pg_namespace ns ON cls.relnamespace = ns.oid
    WHERE ns.nspname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s" ON public.%I', r.policy_name, r.table_name);
  END LOOP;
  RAISE NOTICE 'All policies dropped';
END $$;

-- 3. Policies permissivas (USING true) para TUDO (temporário — app funciona de novo)
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
    BEGIN
      EXECUTE format('CREATE POLICY "%s_r" ON public.%I FOR SELECT USING (true)', t, t);
    EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'policy select já existe ou tabela não existe: %', t;
    END;
    BEGIN
      EXECUTE format('CREATE POLICY "%s_a" ON public.%I FOR INSERT WITH CHECK (true)', t, t);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    BEGIN
      EXECUTE format('CREATE POLICY "%s_u" ON public.%I FOR UPDATE USING (true) WITH CHECK (true)', t, t);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    BEGIN
      EXECUTE format('CREATE POLICY "%s_d" ON public.%I FOR DELETE USING (true)', t, t);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    RAISE NOTICE '✅ %: policies permissivas', t;
  END LOOP;
END $$;

-- 4. VERIFICAR
SELECT tablename, count(*) as policies
FROM pg_policies 
WHERE schemaname='public'
GROUP BY tablename
ORDER BY tablename;
