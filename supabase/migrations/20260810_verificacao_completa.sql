-- ==============================================================================
-- VERIFICAÇÃO COMPLETA
-- Execute APÓS todas as etapas para confirmar que tudo foi criado
-- ==============================================================================

-- 1. Verificar colunas de customers
SELECT '1. CUSTOMERS - Novos campos' as verifica;
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'customers'
  AND column_name IN ('birth_date', 'whatsapp', 'address_street', 'address_number', 
                      'address_complement', 'address_neighborhood', 'address_city', 
                      'address_state', 'address_zip', 'google_id', 'password_hash', 'customer_type')
ORDER BY column_name;

-- 2. Verificar colunas de store_branches
SELECT '2. STORE_BRANCHES - Novos campos' as verifica;
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'store_branches'
  AND column_name IN ('full_address', 'whatsapp_phone', 'latitude', 'longitude', 'delivery_enabled', 'pickup_enabled')
ORDER BY column_name;

-- 3. Verificar tabelas de delivery
SELECT '3. DELIVERY - Tabelas criadas' as verifica;
SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'delivery%' ORDER BY tablename;

-- 4. Verificar module_visibility
SELECT '4. MODULE_VISIBILITY - Criada' as verifica;
SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = 'module_visibility';

-- 5. Verificar policies de delivery
SELECT '5. DELIVERY - Policies' as verifica;
SELECT tablename, policyname, cmd 
FROM pg_policies 
WHERE tablename LIKE 'delivery%'
ORDER BY tablename, policyname;

-- 6. Verificar REPLICA IDENTITY FULL
SELECT '6. REPLICA IDENTITY FULL' as verifica;
SELECT tablename, relreplident
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename
WHERE t.schemaname = 'public' 
  AND tablename IN ('delivery_settings', 'delivery_neighborhoods', 'delivery_distance_rates', 'delivery_orders', 'module_visibility')
ORDER BY tablename;

-- 7. Verificar Realtime publication
SELECT '7. REALTIME - Tabelas publicadas' as verifica;
SELECT tablename 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' 
  AND tablename IN ('delivery_settings', 'delivery_neighborhoods', 'delivery_distance_rates', 'delivery_orders', 'module_visibility')
ORDER BY tablename;

-- 8. Verificar índices
SELECT '8. ÍNDICES - Delivery' as verifica;
SELECT indexname, tablename 
FROM pg_indexes 
WHERE schemaname = 'public' AND tablename LIKE 'delivery%'
ORDER BY tablename, indexname;

-- 9. Verificar triggers
SELECT '9. TRIGGERS - updated_at' as verifica;
SELECT trigger_name, event_object_table
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND event_object_table IN ('delivery_settings', 'delivery_neighborhoods', 'delivery_distance_rates', 'delivery_orders', 'module_visibility')
ORDER BY event_object_table;
