-- ==============================================================================
-- CORREÇÃO RLS: Grant privileges for module_visibility and delivery tables
-- Error: "permission denied for table module_visibility" / "permission denied for table delivery_orders"
-- Fix: Grant table-level privileges to authenticated role
-- ==============================================================================

-- 1. Grant privileges on module_visibility
GRANT SELECT, INSERT, UPDATE, DELETE ON public.module_visibility TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.module_visibility TO anon;

-- 2. Grant privileges on delivery tables
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_settings TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_neighborhoods TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_neighborhoods TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_distance_rates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_distance_rates TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_orders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_orders TO anon;

-- 3. Verify RLS policies exist for module_visibility (recreate if missing)
DROP POLICY IF EXISTS "module_visibility_select" ON public.module_visibility;
CREATE POLICY "module_visibility_select" ON public.module_visibility FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "module_visibility_insert" ON public.module_visibility;
CREATE POLICY "module_visibility_insert" ON public.module_visibility FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "module_visibility_update" ON public.module_visibility;
CREATE POLICY "module_visibility_update" ON public.module_visibility FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "module_visibility_delete" ON public.module_visibility;
CREATE POLICY "module_visibility_delete" ON public.module_visibility FOR DELETE TO authenticated USING (true);

-- 4. Verify RLS policies exist for delivery_settings
DROP POLICY IF EXISTS "delivery_settings_select" ON public.delivery_settings;
CREATE POLICY "delivery_settings_select" ON public.delivery_settings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "delivery_settings_insert" ON public.delivery_settings;
CREATE POLICY "delivery_settings_insert" ON public.delivery_settings FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "delivery_settings_update" ON public.delivery_settings;
CREATE POLICY "delivery_settings_update" ON public.delivery_settings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delivery_settings_delete" ON public.delivery_settings;
CREATE POLICY "delivery_settings_delete" ON public.delivery_settings FOR DELETE TO authenticated USING (true);

-- 5. Verify RLS policies exist for delivery_neighborhoods
DROP POLICY IF EXISTS "delivery_neighborhoods_select" ON public.delivery_neighborhoods;
CREATE POLICY "delivery_neighborhoods_select" ON public.delivery_neighborhoods FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "delivery_neighborhoods_insert" ON public.delivery_neighborhoods;
CREATE POLICY "delivery_neighborhoods_insert" ON public.delivery_neighborhoods FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "delivery_neighborhoods_update" ON public.delivery_neighborhoods;
CREATE POLICY "delivery_neighborhoods_update" ON public.delivery_neighborhoods FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delivery_neighborhoods_delete" ON public.delivery_neighborhoods;
CREATE POLICY "delivery_neighborhoods_delete" ON public.delivery_neighborhoods FOR DELETE TO authenticated USING (true);

-- 6. Verify RLS policies exist for delivery_distance_rates
DROP POLICY IF EXISTS "delivery_distance_rates_select" ON public.delivery_distance_rates;
CREATE POLICY "delivery_distance_rates_select" ON public.delivery_distance_rates FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "delivery_distance_rates_insert" ON public.delivery_distance_rates;
CREATE POLICY "delivery_distance_rates_insert" ON public.delivery_distance_rates FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "delivery_distance_rates_update" ON public.delivery_distance_rates;
CREATE POLICY "delivery_distance_rates_update" ON public.delivery_distance_rates FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delivery_distance_rates_delete" ON public.delivery_distance_rates;
CREATE POLICY "delivery_distance_rates_delete" ON public.delivery_distance_rates FOR DELETE TO authenticated USING (true);

-- 7. Verify RLS policies exist for delivery_orders
DROP POLICY IF EXISTS "delivery_orders_select" ON public.delivery_orders;
CREATE POLICY "delivery_orders_select" ON public.delivery_orders FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "delivery_orders_insert" ON public.delivery_orders;
CREATE POLICY "delivery_orders_insert" ON public.delivery_orders FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "delivery_orders_update" ON public.delivery_orders;
CREATE POLICY "delivery_orders_update" ON public.delivery_orders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delivery_orders_delete" ON public.delivery_orders;
CREATE POLICY "delivery_orders_delete" ON public.delivery_orders FOR DELETE TO authenticated USING (true);

-- 8. Verification
SELECT 'RLS privileges granted for:' as status;
SELECT table_name, grantee, privilege_type 
FROM information_schema.role_table_grants 
WHERE table_schema = 'public' 
  AND table_name IN ('module_visibility', 'delivery_settings', 'delivery_neighborhoods', 'delivery_distance_rates', 'delivery_orders')
  AND grantee = 'authenticated'
ORDER BY table_name, privilege_type;
