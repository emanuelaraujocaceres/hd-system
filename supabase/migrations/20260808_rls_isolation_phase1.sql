-- ==============================================================================
-- 20260808_rls_isolation_phase1.sql
-- Phase 1: Ativar RLS + policies permissivas (USING (true))
--
-- OBJETIVO: Ativar Row Level Security em todas as tabelas sem quebrar o app.
-- Policies permissivas permitem leitura/escrita via anon key enquanto a
-- base de dados, permitindo que o frontend continue funcionando normalmente.
--
-- Phase 2 (próxima migration) refina as policies com isolamento real:
--   - branch-scoped: colunas store_branch_id filtradas pelo auth.uid()
--   - org-scoped: colunas organization_id filtradas pelo auth.uid()
--
-- NOTA: o frontend usa anon key, mas sempre dentro de uma sessão autenticada
-- (supabase.auth.signInWithPassword). Nenhuma query usa service_role key.
-- ==============================================================================

-- 1) Habilitar RLS em todas as tabelas principais
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    AND tablename IN (
      'products', 'categories', 'customers', 'suppliers',
      'sales', 'sale_items', 'financial_transactions',
      'cash_sessions', 'stock_movements', 'store_branches',
      'system_users', 'system_settings',
      'scanned_boletos', 'credit_payments', 'nf_records',
      'footer_messages', 'media_devices', 'printers',
      'tables', 'customer_sessions', 'digital_menu_config',
      'branch_themes', 'api_keys',
      'profiles',
      'organizations',
      'financial_accounts',
      'caixa_sessions'
    )
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    RAISE NOTICE 'RLS enabled on: %', t;
  END LOOP;
END $$;

-- 2) Policies permissivas: USING (true) para leitura e escrita
-- Permite que qualquer user autenticado acesse tudo (igual antes do RLS)
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    AND tablename IN (
      'products', 'categories', 'customers', 'suppliers',
      'sales', 'sale_items', 'financial_transactions',
      'cash_sessions', 'stock_movements', 'store_branches',
      'system_users', 'system_settings',
      'scanned_boletos', 'credit_payments', 'nf_records',
      'footer_messages', 'media_devices', 'printers',
      'tables', 'customer_sessions', 'digital_menu_config',
      'branch_themes', 'api_keys',
      'profiles',
      'organizations',
      'financial_accounts',
      'caixa_sessions'
    )
  LOOP
    -- DROP policy existente (idempotente)
    EXECUTE format('DROP POLICY IF EXISTS "%s_select_all" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_write_all" ON public.%I', t, t);
    
    -- Policy SELECT: USING (true)
    EXECUTE format('CREATE POLICY "%s_select_all" ON public.%I FOR SELECT USING (true)', t, t);
    
    -- Policy INSERT/UPDATE/DELETE: WITH CHECK (true)
    EXECUTE format('CREATE POLICY "%s_write_all" ON public.%I FOR INSERT TO public.%I WITH CHECK (true)', t, t, t);
    EXECUTE format('CREATE POLICY "%s_update_all" ON public.%I FOR UPDATE USING (true) WITH CHECK (true)', t, t);
    EXECUTE format('CREATE POLICY "%s_delete_all" ON public.%I FOR DELETE USING (true)', t, t);
    
    RAISE NOTICE 'Policies permissivas criadas para: %', t;
  END LOOP;
END $$;

-- 3) Verificar status
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    AND tablename IN (
      'products', 'categories', 'customers', 'suppliers',
      'sales', 'sale_items', 'financial_transactions',
      'cash_sessions', 'stock_movements', 'store_branches',
      'system_users', 'system_settings',
      'profiles', 'organizations',
      'financial_accounts',
      'caixa_sessions'
    )
  LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = t AND rowsecurity = true) THEN
      RAISE NOTICE '✅ %: RLS OK', t;
    ELSE
      RAISE NOTICE '❌ %: RLS NÃO ativado', t;
    END IF;
  END LOOP;
END $$;
