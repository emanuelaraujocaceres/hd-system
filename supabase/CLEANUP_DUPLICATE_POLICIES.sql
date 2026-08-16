-- ============================================================
-- CLEANUP: Remover policies user_* duplicadas
-- Tabelas que já têm org_branch_* policies (da Seção 3)
-- NÃO precisam das policies user_* (da Seção 6).
-- Execute bloco a bloco no SQL Editor.
-- ============================================================

-- ── api_keys ──
DROP POLICY IF EXISTS "user_select_api_keys" ON public.api_keys;
DROP POLICY IF EXISTS "user_insert_api_keys" ON public.api_keys;
DROP POLICY IF EXISTS "user_update_api_keys" ON public.api_keys;
DROP POLICY IF EXISTS "user_delete_api_keys" ON public.api_keys;

-- ── branch_themes ──
DROP POLICY IF EXISTS "user_select_branch_themes" ON public.branch_themes;
DROP POLICY IF EXISTS "user_insert_branch_themes" ON public.branch_themes;
DROP POLICY IF EXISTS "user_update_branch_themes" ON public.branch_themes;
DROP POLICY IF EXISTS "user_delete_branch_themes" ON public.branch_themes;

-- ── customer_sessions ──
DROP POLICY IF EXISTS "user_select_customer_sessions" ON public.customer_sessions;
DROP POLICY IF EXISTS "user_insert_customer_sessions" ON public.customer_sessions;
DROP POLICY IF EXISTS "user_update_customer_sessions" ON public.customer_sessions;
DROP POLICY IF EXISTS "user_delete_customer_sessions" ON public.customer_sessions;

-- ── delivery_distance_rates ──
DROP POLICY IF EXISTS "user_select_delivery_distance_rates" ON public.delivery_distance_rates;
DROP POLICY IF EXISTS "user_insert_delivery_distance_rates" ON public.delivery_distance_rates;
DROP POLICY IF EXISTS "user_update_delivery_distance_rates" ON public.delivery_distance_rates;
DROP POLICY IF EXISTS "user_delete_delivery_distance_rates" ON public.delivery_distance_rates;

-- ── delivery_neighborhoods ──
DROP POLICY IF EXISTS "user_select_delivery_neighborhoods" ON public.delivery_neighborhoods;
DROP POLICY IF EXISTS "user_insert_delivery_neighborhoods" ON public.delivery_neighborhoods;
DROP POLICY IF EXISTS "user_update_delivery_neighborhoods" ON public.delivery_neighborhoods;
DROP POLICY IF EXISTS "user_delete_delivery_neighborhoods" ON public.delivery_neighborhoods;

-- ── delivery_orders ──
DROP POLICY IF EXISTS "user_select_delivery_orders" ON public.delivery_orders;
DROP POLICY IF EXISTS "user_insert_delivery_orders" ON public.delivery_orders;
DROP POLICY IF EXISTS "user_update_delivery_orders" ON public.delivery_orders;
DROP POLICY IF EXISTS "user_delete_delivery_orders" ON public.delivery_orders;

-- ── delivery_settings ──
DROP POLICY IF EXISTS "user_select_delivery_settings" ON public.delivery_settings;
DROP POLICY IF EXISTS "user_insert_delivery_settings" ON public.delivery_settings;
DROP POLICY IF EXISTS "user_update_delivery_settings" ON public.delivery_settings;
DROP POLICY IF EXISTS "user_delete_delivery_settings" ON public.delivery_settings;

-- ── footer_messages ──
DROP POLICY IF EXISTS "user_select_footer_messages" ON public.footer_messages;
DROP POLICY IF EXISTS "user_insert_footer_messages" ON public.footer_messages;
DROP POLICY IF EXISTS "user_update_footer_messages" ON public.footer_messages;
DROP POLICY IF EXISTS "user_delete_footer_messages" ON public.footer_messages;

-- ── media_devices ──
DROP POLICY IF EXISTS "user_select_media_devices" ON public.media_devices;
DROP POLICY IF EXISTS "user_insert_media_devices" ON public.media_devices;
DROP POLICY IF EXISTS "user_update_media_devices" ON public.media_devices;
DROP POLICY IF EXISTS "user_delete_media_devices" ON public.media_devices;

-- ── module_visibility ──
DROP POLICY IF EXISTS "user_select_module_visibility" ON public.module_visibility;
DROP POLICY IF EXISTS "user_insert_module_visibility" ON public.module_visibility;
DROP POLICY IF EXISTS "user_update_module_visibility" ON public.module_visibility;
DROP POLICY IF EXISTS "user_delete_module_visibility" ON public.module_visibility;

-- ── printers ──
DROP POLICY IF EXISTS "user_select_printers" ON public.printers;
DROP POLICY IF EXISTS "user_insert_printers" ON public.printers;
DROP POLICY IF EXISTS "user_update_printers" ON public.printers;
DROP POLICY IF EXISTS "user_delete_printers" ON public.printers;

-- ── stock_loss_log ──
DROP POLICY IF EXISTS "user_select_stock_loss_log" ON public.stock_loss_log;
DROP POLICY IF EXISTS "user_insert_stock_loss_log" ON public.stock_loss_log;
DROP POLICY IF EXISTS "user_update_stock_loss_log" ON public.stock_loss_log;
DROP POLICY IF EXISTS "user_delete_stock_loss_log" ON public.stock_loss_log;

-- ── product_lots (tem policies antigas de migration anterior) ──
DROP POLICY IF EXISTS "product_lots_select" ON public.product_lots;
DROP POLICY IF EXISTS "product_lots_insert" ON public.product_lots;
DROP POLICY IF EXISTS "product_lots_update" ON public.product_lots;
DROP POLICY IF EXISTS "product_lots_delete" ON public.product_lots;


-- ── VERIFICAÇÃO FINAL: Contar policies por tabela ──
-- Todas devem ter <= 5 policies
SELECT tablename, COUNT(*) AS policy_count
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
HAVING COUNT(*) > 5
ORDER BY COUNT(*) DESC;
-- Se retornar 0 linhas, está tudo limpo ✓
