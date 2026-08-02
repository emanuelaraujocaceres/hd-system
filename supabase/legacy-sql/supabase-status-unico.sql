-- ==============================================================================
-- STATUS DO BANCO — resultado único e simples
-- ==============================================================================

SELECT
  -- RPCs
  (SELECT string_agg(proname, ', ') FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN ('ajustar_estoque','process_sale_transaction','fn_insserir_dlq','check_stock_consistency','fn_update_updated_at','fn_prevent_negative_stock','fn_sync_product_name','get_auth_user_org_id','is_superadmin','get_is_superadmin','admin_fetch_organizations','admin_fetch_branches','admin_fetch_users','admin_create_organization','admin_add_user')) AS rpcs,

  -- Triggers
  (SELECT string_agg(tgname, ', ') FROM pg_trigger WHERE tgname IN ('trg_products_updated_at','trg_store_branches_updated_at','trg_customers_updated_at','trg_suppliers_updated_at','trg_sales_updated_at','trg_system_users_updated_at','trg_stock_not_negative','trg_sync_product_name')) AS triggers,

  -- Contagens
  (SELECT COUNT(*) FROM products) AS products,
  (SELECT COUNT(*) FROM categories) AS categories,
  (SELECT COUNT(*) FROM customers) AS customers,
  (SELECT COUNT(*) FROM suppliers) AS suppliers,
  (SELECT COUNT(*) FROM sales) AS sales,
  (SELECT COUNT(*) FROM sale_items) AS sale_items,
  (SELECT COUNT(*) FROM stock_movements) AS stock_movements,
  (SELECT COUNT(*) FROM store_branches) AS store_branches,
  (SELECT COUNT(*) FROM system_users) AS system_users,
  (SELECT COUNT(*) FROM organizations) AS organizations,
  (SELECT COUNT(*) FROM movimentacoes_falhas) AS dlq,

  -- Saúde
  (SELECT COUNT(*) - COUNT(DISTINCT (sale_id, product_id)) FROM sale_items) AS duplicatas_sale_items,
  (SELECT COUNT(*) FROM stock_movements WHERE reason = 'Ajuste automático (trigger)') AS resquicios_da_trigger;
