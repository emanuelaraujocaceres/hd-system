-- ==============================================================================
-- 20260808_rls_phase1_individual.sql
-- RLS Phase 1: aplicar tabela por tabela para evitar deadlock
-- ==============================================================================

-- 1. products
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "products_r" ON public.products;
DROP POLICY IF EXISTS "products_a" ON public.products;
DROP POLICY IF EXISTS "products_u" ON public.products;
DROP POLICY IF EXISTS "products_d" ON public.products;
CREATE POLICY "products_r" ON public.products FOR SELECT USING (true);
CREATE POLICY "products_a" ON public.products FOR INSERT WITH CHECK (true);
CREATE POLICY "products_u" ON public.products FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "products_d" ON public.products FOR DELETE USING (true);

-- 2. categories
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "categories_r" ON public.categories;
DROP POLICY IF EXISTS "categories_a" ON public.categories;
DROP POLICY IF EXISTS "categories_u" ON public.categories;
DROP POLICY IF EXISTS "categories_d" ON public.categories;
CREATE POLICY "categories_r" ON public.categories FOR SELECT USING (true);
CREATE POLICY "categories_a" ON public.categories FOR INSERT WITH CHECK (true);
CREATE POLICY "categories_u" ON public.categories FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "categories_d" ON public.categories FOR DELETE USING (true);

-- 3. customers
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "customers_r" ON public.customers;
DROP POLICY IF EXISTS "customers_a" ON public.customers;
DROP POLICY IF EXISTS "customers_u" ON public.customers;
DROP POLICY IF EXISTS "customers_d" ON public.customers;
CREATE POLICY "customers_r" ON public.customers FOR SELECT USING (true);
CREATE POLICY "customers_a" ON public.customers FOR INSERT WITH CHECK (true);
CREATE POLICY "customers_u" ON public.customers FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "customers_d" ON public.customers FOR DELETE USING (true);

-- 4. suppliers
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "suppliers_r" ON public.suppliers;
DROP POLICY IF EXISTS "suppliers_a" ON public.suppliers;
DROP POLICY IF EXISTS "suppliers_u" ON public.suppliers;
DROP POLICY IF EXISTS "suppliers_d" ON public.suppliers;
CREATE POLICY "suppliers_r" ON public.suppliers FOR SELECT USING (true);
CREATE POLICY "suppliers_a" ON public.suppliers FOR INSERT WITH CHECK (true);
CREATE POLICY "suppliers_u" ON public.suppliers FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "suppliers_d" ON public.suppliers FOR DELETE USING (true);

-- 5. sales
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sales_r" ON public.sales;
DROP POLICY IF EXISTS "sales_a" ON public.sales;
DROP POLICY IF EXISTS "sales_u" ON public.sales;
DROP POLICY IF EXISTS "sales_d" ON public.sales;
CREATE POLICY "sales_r" ON public.sales FOR SELECT USING (true);
CREATE POLICY "sales_a" ON public.sales FOR INSERT WITH CHECK (true);
CREATE POLICY "sales_u" ON public.sales FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "sales_d" ON public.sales FOR DELETE USING (true);

-- 6. sale_items
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sale_items_r" ON public.sale_items;
DROP POLICY IF EXISTS "sale_items_a" ON public.sale_items;
DROP POLICY IF EXISTS "sale_items_u" ON public.sale_items;
DROP POLICY IF EXISTS "sale_items_d" ON public.sale_items;
CREATE POLICY "sale_items_r" ON public.sale_items FOR SELECT USING (true);
CREATE POLICY "sale_items_a" ON public.sale_items FOR INSERT WITH CHECK (true);
CREATE POLICY "sale_items_u" ON public.sale_items FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "sale_items_d" ON public.sale_items FOR DELETE USING (true);

-- 7. financial_transactions
ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "financial_transactions_r" ON public.financial_transactions;
DROP POLICY IF EXISTS "financial_transactions_a" ON public.financial_transactions;
DROP POLICY IF EXISTS "financial_transactions_u" ON public.financial_transactions;
DROP POLICY IF EXISTS "financial_transactions_d" ON public.financial_transactions;
CREATE POLICY "financial_transactions_r" ON public.financial_transactions FOR SELECT USING (true);
CREATE POLICY "financial_transactions_a" ON public.financial_transactions FOR INSERT WITH CHECK (true);
CREATE POLICY "financial_transactions_u" ON public.financial_transactions FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "financial_transactions_d" ON public.financial_transactions FOR DELETE USING (true);

-- 8. cash_sessions
ALTER TABLE public.cash_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cash_sessions_r" ON public.cash_sessions;
DROP POLICY IF EXISTS "cash_sessions_a" ON public.cash_sessions;
DROP POLICY IF EXISTS "cash_sessions_u" ON public.cash_sessions;
DROP POLICY IF EXISTS "cash_sessions_d" ON public.cash_sessions;
CREATE POLICY "cash_sessions_r" ON public.cash_sessions FOR SELECT USING (true);
CREATE POLICY "cash_sessions_a" ON public.cash_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "cash_sessions_u" ON public.cash_sessions FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "cash_sessions_d" ON public.cash_sessions FOR DELETE USING (true);

-- 9. stock_movements
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "stock_movements_r" ON public.stock_movements;
DROP POLICY IF EXISTS "stock_movements_a" ON public.stock_movements;
DROP POLICY IF EXISTS "stock_movements_u" ON public.stock_movements;
DROP POLICY IF EXISTS "stock_movements_d" ON public.stock_movements;
CREATE POLICY "stock_movements_r" ON public.stock_movements FOR SELECT USING (true);
CREATE POLICY "stock_movements_a" ON public.stock_movements FOR INSERT WITH CHECK (true);
CREATE POLICY "stock_movements_u" ON public.stock_movements FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "stock_movements_d" ON public.stock_movements FOR DELETE USING (true);

-- 10. store_branches
ALTER TABLE public.store_branches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "store_branches_r" ON public.store_branches;
DROP POLICY IF EXISTS "store_branches_a" ON public.store_branches;
DROP POLICY IF EXISTS "store_branches_u" ON public.store_branches;
DROP POLICY IF EXISTS "store_branches_d" ON public.store_branches;
CREATE POLICY "store_branches_r" ON public.store_branches FOR SELECT USING (true);
CREATE POLICY "store_branches_a" ON public.store_branches FOR INSERT WITH CHECK (true);
CREATE POLICY "store_branches_u" ON public.store_branches FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "store_branches_d" ON public.store_branches FOR DELETE USING (true);

-- 11. system_users
ALTER TABLE public.system_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "system_users_r" ON public.system_users;
DROP POLICY IF EXISTS "system_users_a" ON public.system_users;
DROP POLICY IF EXISTS "system_users_u" ON public.system_users;
DROP POLICY IF EXISTS "system_users_d" ON public.system_users;
CREATE POLICY "system_users_r" ON public.system_users FOR SELECT USING (true);
CREATE POLICY "system_users_a" ON public.system_users FOR INSERT WITH CHECK (true);
CREATE POLICY "system_users_u" ON public.system_users FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "system_users_d" ON public.system_users FOR DELETE USING (true);

-- 12. system_settings
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "system_settings_r" ON public.system_settings;
DROP POLICY IF EXISTS "system_settings_a" ON public.system_settings;
DROP POLICY IF EXISTS "system_settings_u" ON public.system_settings;
DROP POLICY IF EXISTS "system_settings_d" ON public.system_settings;
CREATE POLICY "system_settings_r" ON public.system_settings FOR SELECT USING (true);
CREATE POLICY "system_settings_a" ON public.system_settings FOR INSERT WITH CHECK (true);
CREATE POLICY "system_settings_u" ON public.system_settings FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "system_settings_d" ON public.system_settings FOR DELETE USING (true);

-- 13. scanned_boletos
ALTER TABLE public.scanned_boletos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "scanned_boletos_r" ON public.scanned_boletos;
DROP POLICY IF EXISTS "scanned_boletos_a" ON public.scanned_boletos;
DROP POLICY IF EXISTS "scanned_boletos_u" ON public.scanned_boletos;
DROP POLICY IF EXISTS "scanned_boletos_d" ON public.scanned_boletos;
CREATE POLICY "scanned_boletos_r" ON public.scanned_boletos FOR SELECT USING (true);
CREATE POLICY "scanned_boletos_a" ON public.scanned_boletos FOR INSERT WITH CHECK (true);
CREATE POLICY "scanned_boletos_u" ON public.scanned_boletos FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "scanned_boletos_d" ON public.scanned_boletos FOR DELETE USING (true);

-- 14. credit_payments
ALTER TABLE public.credit_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "credit_payments_r" ON public.credit_payments;
DROP POLICY IF EXISTS "credit_payments_a" ON public.credit_payments;
DROP POLICY IF EXISTS "credit_payments_u" ON public.credit_payments;
DROP POLICY IF EXISTS "credit_payments_d" ON public.credit_payments;
CREATE POLICY "credit_payments_r" ON public.credit_payments FOR SELECT USING (true);
CREATE POLICY "credit_payments_a" ON public.credit_payments FOR INSERT WITH CHECK (true);
CREATE POLICY "credit_payments_u" ON public.credit_payments FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "credit_payments_d" ON public.credit_payments FOR DELETE USING (true);

-- 15. nf_records
ALTER TABLE public.nf_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "nf_records_r" ON public.nf_records;
DROP POLICY IF EXISTS "nf_records_a" ON public.nf_records;
DROP POLICY IF EXISTS "nf_records_u" ON public.nf_records;
DROP POLICY IF EXISTS "nf_records_d" ON public.nf_records;
CREATE POLICY "nf_records_r" ON public.nf_records FOR SELECT USING (true);
CREATE POLICY "nf_records_a" ON public.nf_records FOR INSERT WITH CHECK (true);
CREATE POLICY "nf_records_u" ON public.nf_records FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "nf_records_d" ON public.nf_records FOR DELETE USING (true);

-- 16. footer_messages
ALTER TABLE public.footer_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "footer_messages_r" ON public.footer_messages;
DROP POLICY IF EXISTS "footer_messages_a" ON public.footer_messages;
DROP POLICY IF EXISTS "footer_messages_u" ON public.footer_messages;
DROP POLICY IF EXISTS "footer_messages_d" ON public.footer_messages;
CREATE POLICY "footer_messages_r" ON public.footer_messages FOR SELECT USING (true);
CREATE POLICY "footer_messages_a" ON public.footer_messages FOR INSERT WITH CHECK (true);
CREATE POLICY "footer_messages_u" ON public.footer_messages FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "footer_messages_d" ON public.footer_messages FOR DELETE USING (true);

-- 17. media_devices
ALTER TABLE public.media_devices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "media_devices_r" ON public.media_devices;
DROP POLICY IF EXISTS "media_devices_a" ON public.media_devices;
DROP POLICY IF EXISTS "media_devices_u" ON public.media_devices;
DROP POLICY IF EXISTS "media_devices_d" ON public.media_devices;
CREATE POLICY "media_devices_r" ON public.media_devices FOR SELECT USING (true);
CREATE POLICY "media_devices_a" ON public.media_devices FOR INSERT WITH CHECK (true);
CREATE POLICY "media_devices_u" ON public.media_devices FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "media_devices_d" ON public.media_devices FOR DELETE USING (true);

-- 18. printers
ALTER TABLE public.printers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "printers_r" ON public.printers;
DROP POLICY IF EXISTS "printers_a" ON public.printers;
DROP POLICY IF EXISTS "printers_u" ON public.printers;
DROP POLICY IF EXISTS "printers_d" ON public.printers;
CREATE POLICY "printers_r" ON public.printers FOR SELECT USING (true);
CREATE POLICY "printers_a" ON public.printers FOR INSERT WITH CHECK (true);
CREATE POLICY "printers_u" ON public.printers FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "printers_d" ON public.printers FOR DELETE USING (true);

-- 19. tables
ALTER TABLE public.tables ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tables_r" ON public.tables;
DROP POLICY IF EXISTS "tables_a" ON public.tables;
DROP POLICY IF EXISTS "tables_u" ON public.tables;
DROP POLICY IF EXISTS "tables_d" ON public.tables;
CREATE POLICY "tables_r" ON public.tables FOR SELECT USING (true);
CREATE POLICY "tables_a" ON public.tables FOR INSERT WITH CHECK (true);
CREATE POLICY "tables_u" ON public.tables FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "tables_d" ON public.tables FOR DELETE USING (true);

-- 20. customer_sessions
ALTER TABLE public.customer_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "customer_sessions_r" ON public.customer_sessions;
DROP POLICY IF EXISTS "customer_sessions_a" ON public.customer_sessions;
DROP POLICY IF EXISTS "customer_sessions_u" ON public.customer_sessions;
DROP POLICY IF EXISTS "customer_sessions_d" ON public.customer_sessions;
CREATE POLICY "customer_sessions_r" ON public.customer_sessions FOR SELECT USING (true);
CREATE POLICY "customer_sessions_a" ON public.customer_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "customer_sessions_u" ON public.customer_sessions FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "customer_sessions_d" ON public.customer_sessions FOR DELETE USING (true);

-- 21. digital_menu_config
ALTER TABLE public.digital_menu_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "digital_menu_config_r" ON public.digital_menu_config;
DROP POLICY IF EXISTS "digital_menu_config_a" ON public.digital_menu_config;
DROP POLICY IF EXISTS "digital_menu_config_u" ON public.digital_menu_config;
DROP POLICY IF EXISTS "digital_menu_config_d" ON public.digital_menu_config;
CREATE POLICY "digital_menu_config_r" ON public.digital_menu_config FOR SELECT USING (true);
CREATE POLICY "digital_menu_config_a" ON public.digital_menu_config FOR INSERT WITH CHECK (true);
CREATE POLICY "digital_menu_config_u" ON public.digital_menu_config FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "digital_menu_config_d" ON public.digital_menu_config FOR DELETE USING (true);

-- 22. branch_themes
ALTER TABLE public.branch_themes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "branch_themes_r" ON public.branch_themes;
DROP POLICY IF EXISTS "branch_themes_a" ON public.branch_themes;
DROP POLICY IF EXISTS "branch_themes_u" ON public.branch_themes;
DROP POLICY IF EXISTS "branch_themes_d" ON public.branch_themes;
CREATE POLICY "branch_themes_r" ON public.branch_themes FOR SELECT USING (true);
CREATE POLICY "branch_themes_a" ON public.branch_themes FOR INSERT WITH CHECK (true);
CREATE POLICY "branch_themes_u" ON public.branch_themes FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "branch_themes_d" ON public.branch_themes FOR DELETE USING (true);

-- 23. api_keys
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "api_keys_r" ON public.api_keys;
DROP POLICY IF EXISTS "api_keys_a" ON public.api_keys;
DROP POLICY IF EXISTS "api_keys_u" ON public.api_keys;
DROP POLICY IF EXISTS "api_keys_d" ON public.api_keys;
CREATE POLICY "api_keys_r" ON public.api_keys FOR SELECT USING (true);
CREATE POLICY "api_keys_a" ON public.api_keys FOR INSERT WITH CHECK (true);
CREATE POLICY "api_keys_u" ON public.api_keys FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "api_keys_d" ON public.api_keys FOR DELETE USING (true);

-- 24. profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles_r" ON public.profiles;
DROP POLICY IF EXISTS "profiles_a" ON public.profiles;
DROP POLICY IF EXISTS "profiles_u" ON public.profiles;
DROP POLICY IF EXISTS "profiles_d" ON public.profiles;
CREATE POLICY "profiles_r" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles_a" ON public.profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "profiles_u" ON public.profiles FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "profiles_d" ON public.profiles FOR DELETE USING (true);

-- 25. organizations
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "organizations_r" ON public.organizations;
DROP POLICY IF EXISTS "organizations_a" ON public.organizations;
DROP POLICY IF EXISTS "organizations_u" ON public.organizations;
DROP POLICY IF EXISTS "organizations_d" ON public.organizations;
CREATE POLICY "organizations_r" ON public.organizations FOR SELECT USING (true);
CREATE POLICY "organizations_a" ON public.organizations FOR INSERT WITH CHECK (true);
CREATE POLICY "organizations_u" ON public.organizations FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "organizations_d" ON public.organizations FOR DELETE USING (true);

-- 26. financial_accounts
ALTER TABLE public.financial_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "financial_accounts_r" ON public.financial_accounts;
DROP POLICY IF EXISTS "financial_accounts_a" ON public.financial_accounts;
DROP POLICY IF EXISTS "financial_accounts_u" ON public.financial_accounts;
DROP POLICY IF EXISTS "financial_accounts_d" ON public.financial_accounts;
CREATE POLICY "financial_accounts_r" ON public.financial_accounts FOR SELECT USING (true);
CREATE POLICY "financial_accounts_a" ON public.financial_accounts FOR INSERT WITH CHECK (true);
CREATE POLICY "financial_accounts_u" ON public.financial_accounts FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "financial_accounts_d" ON public.financial_accounts FOR DELETE USING (true);

-- 27. caixa_sessions
ALTER TABLE public.caixa_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "caixa_sessions_r" ON public.caixa_sessions;
DROP POLICY IF EXISTS "caixa_sessions_a" ON public.caixa_sessions;
DROP POLICY IF EXISTS "caixa_sessions_u" ON public.caixa_sessions;
DROP POLICY IF EXISTS "caixa_sessions_d" ON public.caixa_sessions;
CREATE POLICY "caixa_sessions_r" ON public.caixa_sessions FOR SELECT USING (true);
CREATE POLICY "caixa_sessions_a" ON public.caixa_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "caixa_sessions_u" ON public.caixa_sessions FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "caixa_sessions_d" ON public.caixa_sessions FOR DELETE USING (true);

-- 28. Verificar
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN (
    'products','categories','customers','suppliers','sales','sale_items',
    'financial_transactions','cash_sessions','stock_movements','store_branches',
    'system_users','system_settings','scanned_boletos','credit_payments','nf_records',
    'footer_messages','media_devices','printers','tables','customer_sessions',
    'digital_menu_config','branch_themes','api_keys','profiles','organizations',
    'financial_accounts','caixa_sessions'
  ) LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=r.tablename AND rowsecurity=true) THEN
      RAISE NOTICE '✅ %: RLS OK', r.tablename;
    ELSE
      RAISE NOTICE '❌ %: sem RLS', r.tablename;
    END IF;
  END LOOP;
END $$;
