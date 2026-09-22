-- ==============================================================================
-- REPARO: views recriadas DEPOIS das datadas (a uuid-migration 20260729
-- derruba DROP COLUMN id se a view ja existir). Gerado por build-bootstrap.ps1.
-- REVISAR antes do db reset.
-- ==============================================================================

DROP VIEW IF EXISTS public.consolidated_cash_report;
CREATE OR REPLACE VIEW "public"."consolidated_cash_report" AS
 SELECT "sb"."id" AS "branch_id",
    "sb"."name" AS "branch_name",
    "cs"."id" AS "session_id",
    "cs"."operator_name",
    "cs"."opened_at",
    "cs"."closed_at",
    "cs"."total_sales_cash",
    "cs"."total_sales_pix",
    "cs"."total_sales_card",
    "cs"."total_sales_credit_account",
    "cs"."opening_balance",
    "cs"."closing_balance",
    ((("cs"."total_sales_cash" + "cs"."total_sales_pix") + "cs"."total_sales_card") + "cs"."total_sales_credit_account") AS "total_sales",
    "count"("s"."id") AS "total_transactions",
    "sum"("s"."total") AS "total_value"
   FROM (("public"."cash_sessions" "cs"
     LEFT JOIN "public"."store_branches" "sb" ON (("cs"."store_branch_id" = "sb"."id")))
     LEFT JOIN "public"."sales" "s" ON ((("s"."cash_session_id" = "cs"."id") AND ("s"."status" = 'completed'::"text") AND ("s"."deleted_at" IS NULL))))
  WHERE ("cs"."status" = 'closed'::"text")
  GROUP BY "sb"."id", "sb"."name", "cs"."id", "cs"."operator_name", "cs"."opened_at", "cs"."closed_at", "cs"."total_sales_cash", "cs"."total_sales_pix", "cs"."total_sales_card", "cs"."total_sales_credit_account", "cs"."opening_balance", "cs"."closing_balance"
  ORDER BY "cs"."opened_at" DESC;

DROP VIEW IF EXISTS public.v_documents_list;
CREATE OR REPLACE VIEW "public"."v_documents_list" WITH ("security_invoker"='true') AS
 SELECT "nd"."id",
    "nd"."organization_id",
    "nd"."store_branch_id",
    "nd"."supplier_id",
    COALESCE("nd"."supplier_name", "s"."trade_name") AS "supplier_display_name",
    "nd"."document_number",
    "nd"."access_key",
    "nd"."total_amount",
    "nd"."scan_date",
    "nd"."created_at",
    "nd"."updated_at",
    "nd"."processed_at",
    "nd"."status",
    "nd"."source",
    "nd"."template_id",
    "nd"."observation",
    "nd"."images",
    "nd"."thumbnail_url",
    "nd"."items"
   FROM ("public"."nf_records" "nd"
     LEFT JOIN "public"."suppliers" "s" ON (("s"."id" = "nd"."supplier_id")));

DROP VIEW IF EXISTS public.v_stock_movements_dashboard;
CREATE OR REPLACE VIEW "public"."v_stock_movements_dashboard" WITH ("security_invoker"='true') AS
 SELECT "sm"."id",
    "sm"."organization_id",
    "sm"."store_branch_id",
    "sm"."product_id",
    "sm"."product_name",
    "sm"."type",
    "sm"."quantity",
    "sm"."previous_stock",
    "sm"."new_stock",
    "sm"."reason",
    "sm"."operator_name",
    "sm"."created_at",
    "sm"."updated_at",
    "sm"."sale_id",
    "sm"."purchase_document_id",
    "nd"."supplier_id",
    "s"."trade_name" AS "supplier_trade_name",
    "s"."corporate_name" AS "supplier_corporate_name",
    "nd"."document_number"
   FROM (("public"."stock_movements" "sm"
     LEFT JOIN "public"."nf_records" "nd" ON (("nd"."id" = "sm"."purchase_document_id")))
     LEFT JOIN "public"."suppliers" "s" ON (("s"."id" = "nd"."supplier_id")));

DROP VIEW IF EXISTS public.vw_cash_report;
CREATE OR REPLACE VIEW "public"."vw_cash_report" AS
 SELECT "sb"."id" AS "branch_id",
    "sb"."name" AS "branch_name",
    "cs"."id" AS "session_id",
    "cs"."operator_name",
    "cs"."opened_at",
    "cs"."closed_at",
    "cs"."opening_balance",
    "cs"."closing_balance",
    "cs"."total_sales_cash",
    "cs"."total_sales_pix",
    "cs"."total_sales_card",
    "cs"."total_sales_credit_account",
    ((("cs"."total_sales_cash" + "cs"."total_sales_pix") + "cs"."total_sales_card") + "cs"."total_sales_credit_account") AS "total_sales",
    "count"("s"."id") AS "total_transactions",
    COALESCE("sum"("s"."total"), (0)::numeric) AS "total_value"
   FROM (("public"."cash_sessions" "cs"
     LEFT JOIN "public"."store_branches" "sb" ON (("cs"."store_branch_id" = "sb"."id")))
     LEFT JOIN "public"."sales" "s" ON ((("s"."cash_session_id" = "cs"."id") AND ("s"."status" = 'completed'::"text") AND ("s"."deleted_at" IS NULL))))
  GROUP BY "sb"."id", "sb"."name", "cs"."id", "cs"."operator_name", "cs"."opened_at", "cs"."closed_at", "cs"."opening_balance", "cs"."closing_balance", "cs"."total_sales_cash", "cs"."total_sales_pix", "cs"."total_sales_card", "cs"."total_sales_credit_account"
  ORDER BY "cs"."opened_at" DESC;

DROP VIEW IF EXISTS public.vw_dlq_pendentes;
CREATE OR REPLACE VIEW "public"."vw_dlq_pendentes" AS
 SELECT "id",
    "organization_id",
    "store_branch_id",
    "operation_type",
    "table_name",
    "record_id",
    "error_message",
    "error_status",
    "retry_count",
    "max_retries",
    "next_retry_at",
    "created_at",
    "source",
    "user_email"
   FROM "public"."movimentacoes_falhas"
  WHERE (("status" = 'pending'::"text") AND (("next_retry_at" IS NULL) OR ("next_retry_at" <= "now"())))
  ORDER BY "created_at";

DROP VIEW IF EXISTS public.vw_dlq_resumo;
CREATE OR REPLACE VIEW "public"."vw_dlq_resumo" AS
 SELECT "organization_id",
    "store_branch_id",
    "status",
    "count"(*) AS "total",
    "min"("created_at") AS "oldest_failure",
    "max"("created_at") AS "newest_failure",
    "count"(DISTINCT "table_name") AS "tables_affected"
   FROM "public"."movimentacoes_falhas"
  GROUP BY "organization_id", "store_branch_id", "status"
  ORDER BY "organization_id", "store_branch_id", "status";

DROP VIEW IF EXISTS public.vw_report_sale_items;
CREATE OR REPLACE VIEW "public"."vw_report_sale_items" WITH ("security_invoker"='true') AS
 SELECT "s"."id" AS "sale_id",
    "s"."organization_id",
    "s"."store_branch_id",
    "s"."created_at" AS "sale_date",
    "s"."status" AS "sale_status",
    "s"."payment_method",
    "s"."user_id" AS "operator_id",
    "s"."operator_name",
    "s"."customer_id",
    "s"."customer_name",
    "s"."total" AS "sale_total",
    "si"."id" AS "item_id",
    "si"."product_id",
    "si"."product_name",
    "si"."quantity",
    "si"."unit_price",
    "si"."total_price" AS "item_total",
    GREATEST((0)::numeric, ((COALESCE("si"."unit_price", (0)::numeric) * (COALESCE("si"."quantity", 0))::numeric) - COALESCE("si"."total_price", ("si"."unit_price" * ("si"."quantity")::numeric)))) AS "item_discount",
    "p"."category" AS "category_name",
    "su"."commission_rate" AS "operator_commission_rate",
    "s"."payments_json",
    "p"."cost_price" AS "product_cost"
   FROM ((("public"."sales" "s"
     JOIN "public"."sale_items" "si" ON (("si"."sale_id" = "s"."id")))
     LEFT JOIN "public"."products" "p" ON (("p"."id" = "si"."product_id")))
     LEFT JOIN "public"."system_users" "su" ON (("su"."id" = "s"."user_id")))
  WHERE ("s"."deleted_at" IS NULL);

