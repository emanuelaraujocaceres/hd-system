-- ============================================================
-- NUCLEAR FIX: Reset completo de policies + superadmin
-- Execute bloco a bloco no SQL Editor.
-- ============================================================

-- ── BLOCO 1: Corrigir superadmin ──
UPDATE public.system_users 
SET organization_id = NULL 
WHERE email = 'emanuel@gmail.com' AND superadmin = true;

-- Confirmar:
SELECT id, email, organization_id, superadmin 
FROM public.system_users 
WHERE email = 'emanuel@gmail.com';

-- Testar:
SELECT public.is_superadmin();  -- DEVE retornar true

-- ── BLOCO 2: Dropar TODAS as policies de tabelas com duplicatas ──
-- Usa DO block com dynamic SQL para garantir que tudo é removido.

DO $$
DECLARE
  t text;
  pol RECORD;
BEGIN
  FOR t IN 
    SELECT unnest(ARRAY[
      'api_keys', 'branch_themes', 'customer_sessions',
      'delivery_distance_rates', 'delivery_neighborhoods', 'delivery_orders', 'delivery_settings',
      'footer_messages', 'media_devices', 'module_visibility', 'printers',
      'product_lots', 'stock_loss_log'
    ])
  LOOP
    FOR pol IN 
      SELECT policyname FROM pg_policies 
      WHERE schemaname = 'public' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
      RAISE NOTICE 'Dropped policy % on %', pol.policyname, t;
    END LOOP;
  END LOOP;
END;
$$;

-- ── BLOCO 3: Recriar policies corretas (superadmin + org_branch CRUD) ──
-- Uma tabela por bloco para facilitar debug.

-- ── api_keys ──
CREATE POLICY "superadmin_all_api_keys" ON public.api_keys FOR ALL USING (is_superadmin()) WITH CHECK (is_superadmin());
CREATE POLICY "org_branch_select_api_keys" ON public.api_keys FOR SELECT USING ((organization_id = get_user_org_id()) AND (store_branch_id = get_user_branch_id()));
CREATE POLICY "org_branch_insert_api_keys" ON public.api_keys FOR INSERT WITH CHECK ((organization_id = get_user_org_id()) AND (store_branch_id = get_user_branch_id()));
CREATE POLICY "org_branch_update_api_keys" ON public.api_keys FOR UPDATE USING ((organization_id = get_user_org_id()) AND (store_branch_id = get_user_branch_id()));
CREATE POLICY "org_branch_delete_api_keys" ON public.api_keys FOR DELETE USING ((organization_id = get_user_org_id()) AND (store_branch_id = get_user_branch_id()));

-- ── branch_themes ──
CREATE POLICY "superadmin_all_branch_themes" ON public.branch_themes FOR ALL USING (is_superadmin()) WITH CHECK (is_superadmin());
CREATE POLICY "org_branch_select_branch_themes" ON public.branch_themes FOR SELECT USING ((organization_id = get_user_org_id()) AND (store_branch_id = get_user_branch_id()));
CREATE POLICY "org_branch_insert_branch_themes" ON public.branch_themes FOR INSERT WITH CHECK ((organization_id = get_user_org_id()) AND (store_branch_id = get_user_branch_id()));
CREATE POLICY "org_branch_update_branch_themes" ON public.branch_themes FOR UPDATE USING ((organization_id = get_user_org_id()) AND (store_branch_id = get_user_branch_id()));
CREATE POLICY "org_branch_delete_branch_themes" ON public.branch_themes FOR DELETE USING ((organization_id = get_user_org_id()) AND (store_branch_id = get_user_branch_id()));

-- ── customer_sessions ──
CREATE POLICY "superadmin_all_customer_sessions" ON public.customer_sessions FOR ALL USING (is_superadmin()) WITH CHECK (is_superadmin());
CREATE POLICY "org_branch_select_customer_sessions" ON public.customer_sessions FOR SELECT USING ((organization_id = get_user_org_id()) AND (store_branch_id = get_user_branch_id()));
CREATE POLICY "org_branch_insert_customer_sessions" ON public.customer_sessions FOR INSERT WITH CHECK ((organization_id = get_user_org_id()) AND (store_branch_id = get_user_branch_id()));
CREATE POLICY "org_branch_update_customer_sessions" ON public.customer_sessions FOR UPDATE USING ((organization_id = get_user_org_id()) AND (store_branch_id = get_user_branch_id()));
CREATE POLICY "org_branch_delete_customer_sessions" ON public.customer_sessions FOR DELETE USING ((organization_id = get_user_org_id()) AND (store_branch_id = get_user_branch_id()));

-- ── delivery_distance_rates ──
CREATE POLICY "superadmin_all_delivery_distance_rates" ON public.delivery_distance_rates FOR ALL USING (is_superadmin()) WITH CHECK (is_superadmin());
CREATE POLICY "org_branch_select_delivery_distance_rates" ON public.delivery_distance_rates FOR SELECT USING ((organization_id = get_user_org_id()) AND (store_branch_id = get_user_branch_id()));
CREATE POLICY "org_branch_insert_delivery_distance_rates" ON public.delivery_distance_rates FOR INSERT WITH CHECK ((organization_id = get_user_org_id()) AND (store_branch_id = get_user_branch_id()));
CREATE POLICY "org_branch_update_delivery_distance_rates" ON public.delivery_distance_rates FOR UPDATE USING ((organization_id = get_user_org_id()) AND (store_branch_id = get_user_branch_id()));
CREATE POLICY "org_branch_delete_delivery_distance_rates" ON public.delivery_distance_rates FOR DELETE USING ((organization_id = get_user_org_id()) AND (store_branch_id = get_user_branch_id()));

-- ── delivery_neighborhoods ──
CREATE POLICY "superadmin_all_delivery_neighborhoods" ON public.delivery_neighborhoods FOR ALL USING (is_superadmin()) WITH CHECK (is_superadmin());
CREATE POLICY "org_branch_select_delivery_neighborhoods" ON public.delivery_neighborhoods FOR SELECT USING ((organization_id = get_user_org_id()) AND (store_branch_id = get_user_branch_id()));
CREATE POLICY "org_branch_insert_delivery_neighborhoods" ON public.delivery_neighborhoods FOR INSERT WITH CHECK ((organization_id = get_user_org_id()) AND (store_branch_id = get_user_branch_id()));
CREATE POLICY "org_branch_update_delivery_neighborhoods" ON public.delivery_neighborhoods FOR UPDATE USING ((organization_id = get_user_org_id()) AND (store_branch_id = get_user_branch_id()));
CREATE POLICY "org_branch_delete_delivery_neighborhoods" ON public.delivery_neighborhoods FOR DELETE USING ((organization_id = get_user_org_id()) AND (store_branch_id = get_user_branch_id()));

-- ── delivery_orders ──
CREATE POLICY "superadmin_all_delivery_orders" ON public.delivery_orders FOR ALL USING (is_superadmin()) WITH CHECK (is_superadmin());
CREATE POLICY "org_branch_select_delivery_orders" ON public.delivery_orders FOR SELECT USING ((organization_id = get_user_org_id()) AND (store_branch_id = get_user_branch_id()));
CREATE POLICY "org_branch_insert_delivery_orders" ON public.delivery_orders FOR INSERT WITH CHECK ((organization_id = get_user_org_id()) AND (store_branch_id = get_user_branch_id()));
CREATE POLICY "org_branch_update_delivery_orders" ON public.delivery_orders FOR UPDATE USING ((organization_id = get_user_org_id()) AND (store_branch_id = get_user_branch_id()));
CREATE POLICY "org_branch_delete_delivery_orders" ON public.delivery_orders FOR DELETE USING ((organization_id = get_user_org_id()) AND (store_branch_id = get_user_branch_id()));

-- ── delivery_settings ──
CREATE POLICY "superadmin_all_delivery_settings" ON public.delivery_settings FOR ALL USING (is_superadmin()) WITH CHECK (is_superadmin());
CREATE POLICY "org_branch_select_delivery_settings" ON public.delivery_settings FOR SELECT USING ((organization_id = get_user_org_id()) AND (store_branch_id = get_user_branch_id()));
CREATE POLICY "org_branch_insert_delivery_settings" ON public.delivery_settings FOR INSERT WITH CHECK ((organization_id = get_user_org_id()) AND (store_branch_id = get_user_branch_id()));
CREATE POLICY "org_branch_update_delivery_settings" ON public.delivery_settings FOR UPDATE USING ((organization_id = get_user_org_id()) AND (store_branch_id = get_user_branch_id()));
CREATE POLICY "org_branch_delete_delivery_settings" ON public.delivery_settings FOR DELETE USING ((organization_id = get_user_org_id()) AND (store_branch_id = get_user_branch_id()));

-- ── footer_messages ──
CREATE POLICY "superadmin_all_footer_messages" ON public.footer_messages FOR ALL USING (is_superadmin()) WITH CHECK (is_superadmin());
CREATE POLICY "org_branch_select_footer_messages" ON public.footer_messages FOR SELECT USING ((organization_id = get_user_org_id()) AND (store_branch_id = get_user_branch_id()));
CREATE POLICY "org_branch_insert_footer_messages" ON public.footer_messages FOR INSERT WITH CHECK ((organization_id = get_user_org_id()) AND (store_branch_id = get_user_branch_id()));
CREATE POLICY "org_branch_update_footer_messages" ON public.footer_messages FOR UPDATE USING ((organization_id = get_user_org_id()) AND (store_branch_id = get_user_branch_id()));
CREATE POLICY "org_branch_delete_footer_messages" ON public.footer_messages FOR DELETE USING ((organization_id = get_user_org_id()) AND (store_branch_id = get_user_branch_id()));

-- ── media_devices ──
CREATE POLICY "superadmin_all_media_devices" ON public.media_devices FOR ALL USING (is_superadmin()) WITH CHECK (is_superadmin());
CREATE POLICY "org_branch_select_media_devices" ON public.media_devices FOR SELECT USING ((organization_id = get_user_org_id()) AND (store_branch_id = get_user_branch_id()));
CREATE POLICY "org_branch_insert_media_devices" ON public.media_devices FOR INSERT WITH CHECK ((organization_id = get_user_org_id()) AND (store_branch_id = get_user_branch_id()));
CREATE POLICY "org_branch_update_media_devices" ON public.media_devices FOR UPDATE USING ((organization_id = get_user_org_id()) AND (store_branch_id = get_user_branch_id()));
CREATE POLICY "org_branch_delete_media_devices" ON public.media_devices FOR DELETE USING ((organization_id = get_user_org_id()) AND (store_branch_id = get_user_branch_id()));

-- ── module_visibility ──
CREATE POLICY "superadmin_all_module_visibility" ON public.module_visibility FOR ALL USING (is_superadmin()) WITH CHECK (is_superadmin());
CREATE POLICY "org_branch_select_module_visibility" ON public.module_visibility FOR SELECT USING ((organization_id = get_user_org_id()) AND (store_branch_id = get_user_branch_id()));
CREATE POLICY "org_branch_insert_module_visibility" ON public.module_visibility FOR INSERT WITH CHECK ((organization_id = get_user_org_id()) AND (store_branch_id = get_user_branch_id()));
CREATE POLICY "org_branch_update_module_visibility" ON public.module_visibility FOR UPDATE USING ((organization_id = get_user_org_id()) AND (store_branch_id = get_user_branch_id()));
CREATE POLICY "org_branch_delete_module_visibility" ON public.module_visibility FOR DELETE USING ((organization_id = get_user_org_id()) AND (store_branch_id = get_user_branch_id()));

-- ── printers ──
CREATE POLICY "superadmin_all_printers" ON public.printers FOR ALL USING (is_superadmin()) WITH CHECK (is_superadmin());
CREATE POLICY "org_branch_select_printers" ON public.printers FOR SELECT USING ((organization_id = get_user_org_id()) AND (store_branch_id = get_user_branch_id()));
CREATE POLICY "org_branch_insert_printers" ON public.printers FOR INSERT WITH CHECK ((organization_id = get_user_org_id()) AND (store_branch_id = get_user_branch_id()));
CREATE POLICY "org_branch_update_printers" ON public.printers FOR UPDATE USING ((organization_id = get_user_org_id()) AND (store_branch_id = get_user_branch_id()));
CREATE POLICY "org_branch_delete_printers" ON public.printers FOR DELETE USING ((organization_id = get_user_org_id()) AND (store_branch_id = get_user_branch_id()));

-- ── stock_loss_log ──
CREATE POLICY "superadmin_all_stock_loss_log" ON public.stock_loss_log FOR ALL USING (is_superadmin()) WITH CHECK (is_superadmin());
CREATE POLICY "org_branch_select_stock_loss_log" ON public.stock_loss_log FOR SELECT USING ((organization_id = get_user_org_id()) AND (store_branch_id = get_user_branch_id()));
CREATE POLICY "org_branch_insert_stock_loss_log" ON public.stock_loss_log FOR INSERT WITH CHECK ((organization_id = get_user_org_id()) AND (store_branch_id = get_user_branch_id()));
CREATE POLICY "org_branch_update_stock_loss_log" ON public.stock_loss_log FOR UPDATE USING ((organization_id = get_user_org_id()) AND (store_branch_id = get_user_branch_id()));
CREATE POLICY "org_branch_delete_stock_loss_log" ON public.stock_loss_log FOR DELETE USING ((organization_id = get_user_org_id()) AND (store_branch_id = get_user_branch_id()));

-- ── product_lots ──
CREATE POLICY "superadmin_all_product_lots" ON public.product_lots FOR ALL USING (is_superadmin()) WITH CHECK (is_superadmin());
CREATE POLICY "org_branch_select_product_lots" ON public.product_lots FOR SELECT USING ((organization_id = get_user_org_id()) AND (store_branch_id = get_user_branch_id()));
CREATE POLICY "org_branch_insert_product_lots" ON public.product_lots FOR INSERT WITH CHECK ((organization_id = get_user_org_id()) AND (store_branch_id = get_user_branch_id()));
CREATE POLICY "org_branch_update_product_lots" ON public.product_lots FOR UPDATE USING ((organization_id = get_user_org_id()) AND (store_branch_id = get_user_branch_id()));
CREATE POLICY "org_branch_delete_product_lots" ON public.product_lots FOR DELETE USING ((organization_id = get_user_org_id()) AND (store_branch_id = get_user_branch_id()));


-- ── BLOCO 4: Verificação final ──
-- Todas devem ter <= 5 (system_users fica em 7 por causa de admin+collaborator)
SELECT tablename, COUNT(*) AS policy_count
FROM pg_policies WHERE schemaname = 'public'
GROUP BY tablename HAVING COUNT(*) > 5
ORDER BY COUNT(*) DESC;

-- Testar superadmin novamente:
SELECT public.is_superadmin();  -- DEVE retornar true
