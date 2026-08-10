-- ==============================================================================
-- VERIFICAÇÃO FINAL COMPLETA
-- ==============================================================================

-- 1. Todas as tabelas novas
SELECT '1. TABELAS CRIADAS' as item, tablename as resultado
FROM pg_tables WHERE schemaname = 'public' 
AND tablename IN ('delivery_settings', 'delivery_neighborhoods', 'delivery_distance_rates', 'delivery_orders', 'module_visibility')
ORDER BY tablename;

-- 2. Colunas de customers
SELECT '2. CUSTOMERS' as item, column_name as resultado
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'customers'
AND column_name IN ('birth_date', 'whatsapp', 'address_street', 'address_number', 'address_complement', 'address_neighborhood', 'address_city', 'address_state', 'address_zip', 'google_id', 'password_hash', 'customer_type')
ORDER BY column_name;

-- 3. Colunas de store_branches
SELECT '3. STORE_BRANCHES' as item, column_name as resultado
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'store_branches'
AND column_name IN ('full_address', 'whatsapp_phone', 'latitude', 'longitude', 'delivery_enabled', 'pickup_enabled')
ORDER BY column_name;

-- 4. Realtime publication
SELECT '4. REALTIME' as item, tablename as resultado
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' 
AND tablename IN ('delivery_settings', 'delivery_neighborhoods', 'delivery_distance_rates', 'delivery_orders', 'module_visibility')
ORDER BY tablename;

-- 5. REPLICA IDENTITY FULL
SELECT '5. REPLICA IDENTITY' as item, tablename as resultado
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename
WHERE t.schemaname = 'public' 
AND tablename IN ('delivery_settings', 'delivery_neighborhoods', 'delivery_distance_rates', 'delivery_orders', 'module_visibility')
ORDER BY tablename;

-- 6. Total de policies
SELECT '6. POLICIES' as item, count(*)::text as resultado
FROM pg_policies 
WHERE tablename LIKE 'delivery%' OR tablename = 'module_visibility';

-- 7. Triggers
SELECT '7. TRIGGERS' as item, trigger_name as resultado
FROM information_schema.triggers
WHERE trigger_schema = 'public'
AND event_object_table IN ('delivery_settings', 'delivery_neighborhoods', 'delivery_distance_rates', 'delivery_orders', 'module_visibility')
ORDER BY event_object_table;
