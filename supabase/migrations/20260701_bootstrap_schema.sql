-- ==============================================================================
-- BOOTSTRAP SCHEMA (gerado, NAO EDITAR A MAO)
-- Fonte: pg_dump --schema-only da producao; refinado por build-bootstrap.ps1
-- Regra: so o que as migrations datadas NAO criam. RLS/policies/functions/
-- triggers/grants vao pelas migrations datadas. Views vao no repair
-- 20260914_fix_all_views.sql (uuid-migration DROP COLUMN bloqueia views precoces).
-- REVISAR antes do db reset.
-- Ordem das secoes: TABLES -> CONSTRAINTS -> INDEXES -> REPLICA.
-- ==============================================================================

-- ---------- TABLES ----------

CREATE TABLE IF NOT EXISTS "public"."api_keys" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "store_branch_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "key_hash" "text" NOT NULL,
    "key_prefix" "text" NOT NULL,
    "permissions" "jsonb" DEFAULT '["read:products", "read:sales"]'::"jsonb",
    "is_active" boolean DEFAULT true,
    "last_used_at" timestamp with time zone,
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

CREATE TABLE IF NOT EXISTS "public"."audit_log" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "store_branch_id" "uuid",
    "user_id" "uuid" NOT NULL,
    "user_name" "text" NOT NULL,
    "user_email" "text" NOT NULL,
    "action" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "text",
    "entity_name" "text",
    "old_value" "jsonb",
    "new_value" "jsonb",
    "ip_address" "text",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);

CREATE TABLE IF NOT EXISTS "public"."branch_themes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "store_branch_id" "uuid" NOT NULL,
    "primary_color" "text" DEFAULT '#4f46e5'::"text",
    "secondary_color" "text" DEFAULT '#6366f1'::"text",
    "accent_color" "text" DEFAULT '#f59e0b'::"text",
    "bg_color" "text" DEFAULT '#09090b'::"text",
    "logo_url" "text",
    "favicon_url" "text",
    "updated_at" timestamp with time zone DEFAULT "now"()
);

CREATE TABLE IF NOT EXISTS "public"."cash_sessions" (
    "opening_balance" numeric(12,2) DEFAULT 0,
    "closing_balance" numeric(12,2),
    "expected_balance" numeric(12,2) DEFAULT 0,
    "status" "text" DEFAULT 'open'::"text",
    "opened_at" timestamp with time zone DEFAULT "now"(),
    "closed_at" timestamp with time zone,
    "operator_name" "text",
    "total_sales_cash" numeric DEFAULT 0,
    "total_sales_pix" numeric DEFAULT 0,
    "total_sales_card" numeric DEFAULT 0,
    "total_sales_credit_account" numeric DEFAULT 0,
    "suprimentos" numeric DEFAULT 0,
    "sangrias" numeric DEFAULT 0,
    "id" "uuid" NOT NULL,
    "organization_id" "uuid",
    "user_id" "uuid",
    "store_branch_id" "uuid" NOT NULL,
    "notes" "text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "session_number" integer DEFAULT 1,
    "is_primary" boolean DEFAULT false,
    "user_session_id" "uuid" DEFAULT "gen_random_uuid"(),
    CONSTRAINT "chk_cash_status" CHECK (("status" = ANY (ARRAY['open'::"text", 'closed'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."cash_sessions_backup_20260902" (
    "opening_balance" numeric(12,2),
    "closing_balance" numeric(12,2),
    "expected_balance" numeric(12,2),
    "status" "text",
    "opened_at" timestamp with time zone,
    "closed_at" timestamp with time zone,
    "operator_name" "text",
    "total_sales_cash" numeric,
    "total_sales_pix" numeric,
    "total_sales_card" numeric,
    "total_sales_credit_account" numeric,
    "suprimentos" numeric,
    "sangrias" numeric,
    "id" "uuid",
    "organization_id" "uuid",
    "user_id" "uuid",
    "store_branch_id" "uuid",
    "notes" "text",
    "updated_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "public"."categories" (
    "store_branch_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "color" "text" DEFAULT '#6366f1'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "id" "uuid" NOT NULL,
    "organization_id" "uuid",
    "icon" "text",
    "description" "text",
    "updated_at" timestamp with time zone DEFAULT "now"()
);

CREATE TABLE IF NOT EXISTS "public"."company_settings" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "organization_id" "uuid",
    "company_name" character varying(255) NOT NULL,
    "trade_name" character varying(255),
    "cnpj" character varying(20),
    "ie" character varying(30),
    "phone" character varying(30),
    "email" character varying(255),
    "address" "text",
    "logo_url" "text",
    "primary_color" character varying(20) DEFAULT '#4f46e5'::character varying,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "store_branch_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."sales" (
    "store_branch_id" "uuid" NOT NULL,
    "code" "text",
    "subtotal" numeric DEFAULT 0,
    "discount" numeric DEFAULT 0,
    "total" numeric DEFAULT 0,
    "payment_method" "text" DEFAULT 'cash'::"text",
    "status" "text" DEFAULT 'completed'::"text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "customer_name" "text",
    "id" "uuid" NOT NULL,
    "organization_id" "uuid",
    "user_id" "uuid",
    "customer_id" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "operator_name" "text",
    "table_id" "uuid",
    "customer_session_id" "uuid",
    "order_source" "text" DEFAULT 'pdv'::"text",
    "kitchen_status" "text" DEFAULT 'pending'::"text",
    "payments_json" "jsonb" DEFAULT '[]'::"jsonb",
    "payment_details" "jsonb" DEFAULT '[]'::"jsonb",
    "payment_id" "text",
    "delivery_order_id" "uuid",
    "deleted_at" timestamp with time zone,
    "cash_session_id" "uuid",
    CONSTRAINT "chk_sales_status" CHECK (("status" = ANY (ARRAY['completed'::"text", 'cancelled'::"text", 'pending'::"text"]))),
    CONSTRAINT "chk_sales_total_positive" CHECK (("total" >= (0)::numeric)),
    CONSTRAINT "sales_kitchen_status_check" CHECK (("kitchen_status" = ANY (ARRAY['pending'::"text", 'preparing'::"text", 'ready'::"text", 'delivered'::"text", 'cancelled'::"text", 'closing_request'::"text"]))),
    CONSTRAINT "sales_order_source_check" CHECK (("order_source" = ANY (ARRAY['pdv'::"text", 'cardapio_digital'::"text", 'delivery'::"text", 'comanda'::"text", 'fiado'::"text"]))),
    CONSTRAINT "sales_store_branch_id_not_null" CHECK (("store_branch_id" IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS "public"."store_branches" (
    "name" "text" NOT NULL,
    "code" "text" DEFAULT ''::"text",
    "cnpj" "text" DEFAULT ''::"text",
    "city" "text" DEFAULT ''::"text",
    "state" "text" DEFAULT ''::"text",
    "address" "text" DEFAULT ''::"text",
    "phone" "text" DEFAULT ''::"text",
    "is_headquarters" boolean DEFAULT false,
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "id" "uuid" NOT NULL,
    "organization_id" "uuid",
    "full_address" "text",
    "whatsapp_phone" "text",
    "latitude" numeric(10,8),
    "longitude" numeric(11,8),
    "delivery_enabled" boolean DEFAULT false,
    "pickup_enabled" boolean DEFAULT true
);

CREATE TABLE IF NOT EXISTS "public"."credit_payments" (
    "id" "uuid" NOT NULL,
    "organization_id" "uuid",
    "store_branch_id" "uuid",
    "sale_id" "uuid",
    "customer_id" "uuid",
    "customer_name" "text",
    "amount" numeric(12,2) DEFAULT 0,
    "paid_at" timestamp with time zone DEFAULT "now"(),
    "payment_method" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);

CREATE TABLE IF NOT EXISTS "public"."customer_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "table_id" "uuid",
    "organization_id" "uuid" NOT NULL,
    "store_branch_id" "uuid" NOT NULL,
    "session_token" "text" DEFAULT "replace"(("gen_random_uuid"())::"text", '-'::"text", ''::"text") NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "opened_at" timestamp with time zone DEFAULT "now"(),
    "closed_at" timestamp with time zone,
    "device_fingerprint" "text",
    "customer_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "chk_cs_status" CHECK (("status" = ANY (ARRAY['active'::"text", 'completed'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "customer_sessions_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'completed'::"text", 'cancelled'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."customers" (
    "store_branch_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "cpf_cnpj" "text" DEFAULT ''::"text",
    "email" "text" DEFAULT ''::"text",
    "phone" "text" DEFAULT ''::"text",
    "credit_limit" numeric(12,2) DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "notes" "text",
    "id" "uuid" NOT NULL,
    "organization_id" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "current_balance" numeric(12,2) DEFAULT 0,
    "loyalty_points" integer DEFAULT 0,
    "city" "text",
    "state" "text",
    "birth_date" "date",
    "whatsapp" "text" DEFAULT ''::"text",
    "address_street" "text" DEFAULT ''::"text",
    "address_number" "text" DEFAULT ''::"text",
    "address_complement" "text" DEFAULT ''::"text",
    "address_neighborhood" "text" DEFAULT ''::"text",
    "address_city" "text" DEFAULT ''::"text",
    "address_state" "text" DEFAULT ''::"text",
    "address_zip" "text" DEFAULT ''::"text",
    "google_id" "text",
    "password_hash" "text",
    "customer_type" "text" DEFAULT 'walkin'::"text",
    CONSTRAINT "customers_customer_type_check" CHECK (("customer_type" = ANY (ARRAY['walkin'::"text", 'delivery'::"text", 'both'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."digital_menu_config" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "store_branch_id" "uuid" NOT NULL,
    "title" "text" DEFAULT 'Cardápio Digital'::"text",
    "subtitle" "text",
    "logo_url" "text",
    "banner_url" "text",
    "layout_mode" "text" DEFAULT 'grid'::"text",
    "show_prices" boolean DEFAULT true,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "digital_menu_config_layout_mode_check" CHECK (("layout_mode" = ANY (ARRAY['grid'::"text", 'list'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."financial_transactions" (
    "store_branch_id" "uuid" NOT NULL,
    "type" "text" DEFAULT 'payable'::"text",
    "description" "text",
    "amount" numeric(12,2) DEFAULT 0,
    "category" "text",
    "status" "text" DEFAULT 'pending'::"text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "id" "uuid" NOT NULL,
    "organization_id" "uuid",
    "due_date" "date",
    "payment_date" "date",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_recurring" boolean DEFAULT false,
    "is_installment" boolean DEFAULT false,
    "recurrence_type" "text",
    "recurrence_count" integer,
    "recurrence_parent_id" "uuid",
    "installment_number" integer,
    "recurrences_json" "jsonb" DEFAULT '[]'::"jsonb",
    "installments_json" "jsonb" DEFAULT '[]'::"jsonb",
    "payment_method" "text",
    "sale_id" "uuid",
    "include_in_report" boolean DEFAULT true,
    CONSTRAINT "chk_ft_status" CHECK (("status" = ANY (ARRAY['pending'::"text", 'paid'::"text", 'overdue'::"text", 'cancelled'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."movimentacoes_falhas" (
    "operation_type" "text" NOT NULL,
    "table_name" "text" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "error_message" "text" NOT NULL,
    "error_code" "text",
    "stack_trace" "text",
    "retry_count" integer DEFAULT 0,
    "max_retries" integer DEFAULT 3,
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "last_retry_at" timestamp with time zone,
    "resolved_at" timestamp with time zone,
    "resolved_by" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "id" "uuid" NOT NULL,
    "organization_id" "uuid",
    "record_id" "text",
    "error_status" integer,
    "source" "text" DEFAULT 'sync_queue'::"text",
    "browser_id" "text",
    "user_email" "text",
    "next_retry_at" timestamp with time zone,
    "store_branch_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "movimentacoes_falhas_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'retrying'::"text", 'resolved'::"text", 'discarded'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."nf_records" (
    "id" "uuid" NOT NULL,
    "organization_id" "uuid",
    "store_branch_id" "uuid",
    "supplier_name" "text",
    "total_amount" numeric(12,2) DEFAULT 0,
    "scan_date" timestamp with time zone DEFAULT "now"(),
    "items" "jsonb" DEFAULT '[]'::"jsonb",
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "supplier_id" "uuid",
    "access_key" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "observation" "text",
    "images" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "template_id" "text",
    "source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "document_number" "text",
    "ocr_confidence" numeric,
    "supplier_snapshot" "jsonb",
    "processed_at" timestamp with time zone,
    "thumbnail_url" "text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "chk_nf_records_status" CHECK (("status" = ANY (ARRAY['pending'::"text", 'confirmed'::"text", 'adjusted'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" character varying(255) NOT NULL,
    "trade_name" character varying(255),
    "cnpj" character varying(20),
    "phone" character varying(30),
    "email" character varying(255),
    "plan" character varying(50) DEFAULT 'pro'::character varying,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "active" boolean DEFAULT true NOT NULL,
    "subscription_expires_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "public"."pix_config" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "store_branch_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "chave_pix" "text" NOT NULL,
    "tipo_chave" "text" NOT NULL,
    "nome_titular" "text" NOT NULL,
    "cidade" "text",
    "ativo" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "pix_config_tipo_chave_check" CHECK (("tipo_chave" = ANY (ARRAY['cpf'::"text", 'cnpj'::"text", 'telefone'::"text", 'email'::"text", 'aleatoria'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."products" (
    "name" "text" NOT NULL,
    "sku" "text" DEFAULT ''::"text",
    "barcode" "text" DEFAULT ''::"text",
    "category" "text" DEFAULT 'Geral'::"text",
    "cost_price" numeric(12,2) DEFAULT 0,
    "sale_price" numeric(12,2) DEFAULT 0,
    "stock_quantity" integer DEFAULT 0,
    "min_stock_quantity" integer DEFAULT 5,
    "max_stock_quantity" integer DEFAULT 100,
    "unit" "text" DEFAULT 'un'::"text",
    "image_url" "text" DEFAULT ''::"text",
    "is_active" boolean DEFAULT true,
    "show_on_tv" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "tv_promo_price" numeric,
    "tv_highlight_tag" "text",
    "id" "uuid" NOT NULL,
    "organization_id" "uuid",
    "store_branch_id" "uuid" NOT NULL,
    "supplier_id" "text",
    "ncm" "text",
    "cfop" "text",
    "wholesale_options" "jsonb",
    "show_on_cardapio" boolean DEFAULT false,
    "expiration_date" "date",
    "is_composite" boolean DEFAULT false,
    "use_lots" boolean DEFAULT false,
    "is_fragmentable" boolean DEFAULT false NOT NULL,
    "yield_count" integer,
    "fraction_product_id" "uuid",
    "margin_percent" numeric DEFAULT 30,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "chk_products_fragmentable_fields" CHECK ((("is_fragmentable" = false) OR (("yield_count" IS NOT NULL) AND ("yield_count" > 0) AND ("fraction_product_id" IS NOT NULL)))),
    CONSTRAINT "chk_products_positive" CHECK ((("sale_price" >= (0)::numeric) AND ("cost_price" >= (0)::numeric) AND ("stock_quantity" >= 0)))
);

CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "organization_id" "uuid",
    "name" character varying(255) NOT NULL,
    "email" character varying(255) NOT NULL,
    "role" character varying(50) DEFAULT 'admin'::character varying,
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "store_branch_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "whatsapp" "text",
    "salary" numeric(12,2) DEFAULT 0,
    "transportation_allowance" numeric(12,2) DEFAULT 0,
    "meal_allowance" numeric(12,2) DEFAULT 0,
    "other_benefits" numeric(12,2) DEFAULT 0,
    "inss_discount" numeric(12,2) DEFAULT 0,
    "ir_discount" numeric(12,2) DEFAULT 0,
    "other_discounts" numeric(12,2) DEFAULT 0
);

CREATE TABLE IF NOT EXISTS "public"."sale_items" (
    "quantity" integer DEFAULT 1,
    "unit_price" numeric DEFAULT 0,
    "total_price" numeric DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "product_name" "text",
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sale_id" "uuid",
    "product_id" "uuid",
    "store_branch_id" "uuid" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "chk_si_positive" CHECK ((("quantity" > 0) AND ("unit_price" >= (0)::numeric) AND ("total_price" >= (0)::numeric)))
);

CREATE TABLE IF NOT EXISTS "public"."scanned_boletos" (
    "id" "uuid" NOT NULL,
    "organization_id" "uuid",
    "store_branch_id" "uuid",
    "barcode" "text",
    "linha_digitavel" "text",
    "amount" numeric(12,2) DEFAULT 0,
    "due_date" "date",
    "payer" "text",
    "scan_date" timestamp with time zone DEFAULT "now"(),
    "financial_account_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);

CREATE TABLE IF NOT EXISTS "public"."sessions" (
    "session_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "created_at" timestamp with time zone NOT NULL,
    "not_after" timestamp with time zone NOT NULL,
    "tag" "text",
    "store_branch_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."stock_change_log" (
    "old_stock_quantity" integer,
    "new_stock_quantity" integer,
    "changed_by" "text",
    "change_type" "text",
    "sale_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid",
    "organization_id" "uuid",
    "store_branch_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "stock_change_log_change_type_check" CHECK (("change_type" = ANY (ARRAY['INCREASE'::"text", 'DECREASE'::"text", 'MANUAL'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."stock_movements" (
    "store_branch_id" "uuid" NOT NULL,
    "product_name" "text",
    "type" "text",
    "quantity" integer DEFAULT 0,
    "previous_stock" integer DEFAULT 0,
    "new_stock" integer DEFAULT 0,
    "reason" "text",
    "operator_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "id" "uuid" NOT NULL,
    "organization_id" "uuid",
    "product_id" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "sale_id" "uuid",
    "purchase_document_id" "uuid"
);

CREATE TABLE IF NOT EXISTS "public"."suppliers" (
    "store_branch_id" "uuid" NOT NULL,
    "corporate_name" "text" DEFAULT ''::"text",
    "trade_name" "text" DEFAULT ''::"text",
    "cnpj" "text" DEFAULT ''::"text",
    "contact_person" "text" DEFAULT ''::"text",
    "email" "text" DEFAULT ''::"text",
    "phone" "text" DEFAULT ''::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "id" "uuid" NOT NULL,
    "organization_id" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "address" "text" DEFAULT ''::"text",
    "address_number" "text" DEFAULT ''::"text",
    "district" "text" DEFAULT ''::"text",
    "city" "text" DEFAULT ''::"text",
    "state" "text" DEFAULT ''::"text",
    "zip" "text" DEFAULT ''::"text"
);

CREATE TABLE IF NOT EXISTS "public"."sync_queue" (
    "operation_type" "text" NOT NULL,
    "table_name" "text" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "retry_count" integer DEFAULT 0,
    "max_retries" integer DEFAULT 3,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "last_retry_at" timestamp with time zone,
    "processed_at" timestamp with time zone,
    "id" "uuid" NOT NULL,
    "organization_id" "uuid",
    "store_branch_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);

CREATE TABLE IF NOT EXISTS "public"."system_settings" (
    "settings" "jsonb",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "id" "uuid" NOT NULL,
    "organization_id" "uuid",
    "store_branch_id" "uuid" NOT NULL,
    "version" integer DEFAULT 1 NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."system_users" (
    "store_branch_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "role" "text" DEFAULT 'collaborator'::"text",
    "permissions" "jsonb" DEFAULT '{"crm": true, "pdv": true, "finance": true, "settings": true, "dashboard": true, "inventory": true}'::"jsonb",
    "avatar_url" "text",
    "active" boolean DEFAULT true,
    "password" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "id" "uuid" NOT NULL,
    "organization_id" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "superadmin" boolean DEFAULT false,
    "commission_rate" numeric(5,2) DEFAULT 0 NOT NULL,
    "last_logout_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "public"."tables" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "store_branch_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "number" integer,
    "qr_token" "text" DEFAULT "encode"((("gen_random_uuid"())::"text")::"bytea", 'base64'::"text") NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "tables_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."user_permissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "module_name" "text" NOT NULL,
    "can_read" boolean DEFAULT true,
    "can_write" boolean DEFAULT false,
    "can_delete" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "store_branch_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);

-- ---------- CONSTRAINTS (FK/CHECK/UNIQUE, apos todas as tabelas) ----------

ALTER TABLE ONLY "public"."api_keys"
    ADD CONSTRAINT "api_keys_key_hash_key" UNIQUE ("key_hash");

ALTER TABLE ONLY "public"."api_keys"
    ADD CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."branch_themes"
    ADD CONSTRAINT "branch_themes_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."cash_sessions"
    ADD CONSTRAINT "cash_sessions_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."company_settings"
    ADD CONSTRAINT "company_settings_organization_id_key" UNIQUE ("organization_id");

ALTER TABLE ONLY "public"."company_settings"
    ADD CONSTRAINT "company_settings_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."credit_payments"
    ADD CONSTRAINT "credit_payments_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."customer_sessions"
    ADD CONSTRAINT "customer_sessions_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."customer_sessions"
    ADD CONSTRAINT "customer_sessions_session_token_key" UNIQUE ("session_token");

ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."digital_menu_config"
    ADD CONSTRAINT "digital_menu_config_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."financial_transactions"
    ADD CONSTRAINT "financial_transactions_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."movimentacoes_falhas"
    ADD CONSTRAINT "movimentacoes_falhas_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."nf_records"
    ADD CONSTRAINT "nf_records_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_cnpj_key" UNIQUE ("cnpj");

ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."pix_config"
    ADD CONSTRAINT "pix_config_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."pix_config"
    ADD CONSTRAINT "pix_config_store_branch_id_key" UNIQUE ("store_branch_id");

ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."sale_items"
    ADD CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sales_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."scanned_boletos"
    ADD CONSTRAINT "scanned_boletos_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_pkey" PRIMARY KEY ("session_id");

ALTER TABLE ONLY "public"."stock_change_log"
    ADD CONSTRAINT "stock_change_log_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."store_branches"
    ADD CONSTRAINT "store_branches_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."sync_queue"
    ADD CONSTRAINT "sync_queue_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."system_settings"
    ADD CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."system_users"
    ADD CONSTRAINT "system_users_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."tables"
    ADD CONSTRAINT "tables_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."tables"
    ADD CONSTRAINT "tables_qr_token_key" UNIQUE ("qr_token");

ALTER TABLE ONLY "public"."user_permissions"
    ADD CONSTRAINT "user_permissions_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."user_permissions"
    ADD CONSTRAINT "user_permissions_user_id_module_name_key" UNIQUE ("user_id", "module_name");

ALTER TABLE ONLY "public"."company_settings"
    ADD CONSTRAINT "company_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."customer_sessions"
    ADD CONSTRAINT "customer_sessions_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "public"."tables"("id");

ALTER TABLE ONLY "public"."financial_transactions"
    ADD CONSTRAINT "financial_transactions_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."cash_sessions"
    ADD CONSTRAINT "fk_cash_sessions_org" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."cash_sessions"
    ADD CONSTRAINT "fk_cash_sessions_user" FOREIGN KEY ("user_id") REFERENCES "public"."system_users"("id");

ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "fk_categories_org" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "fk_customers_org" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."financial_transactions"
    ADD CONSTRAINT "fk_financial_org" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."nf_records"
    ADD CONSTRAINT "fk_nf_records_branch" FOREIGN KEY ("store_branch_id") REFERENCES "public"."store_branches"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."nf_records"
    ADD CONSTRAINT "fk_nf_records_org" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "fk_products_org" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."sale_items"
    ADD CONSTRAINT "fk_sale_items_product" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."sale_items"
    ADD CONSTRAINT "fk_sale_items_sale" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "fk_sales_org" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."stock_change_log"
    ADD CONSTRAINT "fk_stock_change_log_product" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "fk_stock_movements_org" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "fk_stock_movements_product" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."store_branches"
    ADD CONSTRAINT "fk_store_branches_org" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "fk_suppliers_org" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."system_settings"
    ADD CONSTRAINT "fk_system_settings_org" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."system_users"
    ADD CONSTRAINT "fk_system_users_org" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."nf_records"
    ADD CONSTRAINT "nf_records_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."pix_config"
    ADD CONSTRAINT "pix_config_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."pix_config"
    ADD CONSTRAINT "pix_config_store_branch_id_fkey" FOREIGN KEY ("store_branch_id") REFERENCES "public"."store_branches"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_fraction_product_id_fkey" FOREIGN KEY ("fraction_product_id") REFERENCES "public"."products"("id");

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sales_cash_session_id_fkey" FOREIGN KEY ("cash_session_id") REFERENCES "public"."cash_sessions"("id");

ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sales_customer_session_id_fkey" FOREIGN KEY ("customer_session_id") REFERENCES "public"."customer_sessions"("id");

ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sales_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "public"."tables"("id");

ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_purchase_document_id_fkey" FOREIGN KEY ("purchase_document_id") REFERENCES "public"."nf_records"("id") ON DELETE SET NULL;

-- ---------- INDEXES ----------

CREATE INDEX "credit_payments_branch_idx" ON "public"."credit_payments" USING "btree" ("store_branch_id");

CREATE INDEX "credit_payments_org_idx" ON "public"."credit_payments" USING "btree" ("organization_id");

CREATE INDEX "credit_payments_sale_idx" ON "public"."credit_payments" USING "btree" ("sale_id");

CREATE INDEX "idx_api_keys_org_branch" ON "public"."api_keys" USING "btree" ("organization_id", "store_branch_id");

CREATE INDEX "idx_audit_log_action" ON "public"."audit_log" USING "btree" ("action", "created_at" DESC);

CREATE INDEX "idx_audit_log_entity" ON "public"."audit_log" USING "btree" ("entity_type", "entity_id");

CREATE INDEX "idx_audit_log_org_created" ON "public"."audit_log" USING "btree" ("organization_id", "created_at" DESC);

CREATE INDEX "idx_audit_log_user" ON "public"."audit_log" USING "btree" ("user_id", "created_at" DESC);

CREATE INDEX "idx_boletos_org_branch" ON "public"."scanned_boletos" USING "btree" ("organization_id", "store_branch_id");

CREATE INDEX "idx_branch_themes_org_branch" ON "public"."branch_themes" USING "btree" ("organization_id", "store_branch_id");

CREATE INDEX "idx_cash_sessions_branch_status" ON "public"."cash_sessions" USING "btree" ("store_branch_id", "status") WHERE ("store_branch_id" IS NOT NULL);

CREATE INDEX "idx_cash_sessions_operator" ON "public"."cash_sessions" USING "btree" ("user_id", "status");

CREATE INDEX "idx_cash_sessions_org_branch" ON "public"."cash_sessions" USING "btree" ("organization_id", "store_branch_id");

CREATE INDEX "idx_cash_sessions_org_id" ON "public"."cash_sessions" USING "btree" ("organization_id");

CREATE INDEX "idx_cash_sessions_status" ON "public"."cash_sessions" USING "btree" ("organization_id", "status");

CREATE INDEX "idx_cash_sessions_store_branch" ON "public"."cash_sessions" USING "btree" ("store_branch_id");

CREATE UNIQUE INDEX "idx_cash_sessions_unique_user" ON "public"."cash_sessions" USING "btree" ("store_branch_id", "user_id") WHERE ("status" = 'open'::"text");

CREATE INDEX "idx_categories_org_branch" ON "public"."categories" USING "btree" ("organization_id", "store_branch_id");

CREATE INDEX "idx_categories_org_id" ON "public"."categories" USING "btree" ("organization_id");

CREATE INDEX "idx_credit_payments_org_branch" ON "public"."credit_payments" USING "btree" ("organization_id", "store_branch_id");

CREATE INDEX "idx_customer_sessions_org_branch" ON "public"."customer_sessions" USING "btree" ("organization_id", "store_branch_id");

CREATE INDEX "idx_customers_branch_type" ON "public"."customers" USING "btree" ("store_branch_id", "customer_type") WHERE ("store_branch_id" IS NOT NULL);

CREATE INDEX "idx_customers_branch_type_recent" ON "public"."customers" USING "btree" ("store_branch_id", "customer_type", "created_at" DESC) WHERE ("store_branch_id" IS NOT NULL);

CREATE INDEX "idx_customers_cpf_cnpj" ON "public"."customers" USING "btree" ("cpf_cnpj") WHERE ("cpf_cnpj" IS NOT NULL);

CREATE INDEX "idx_customers_name" ON "public"."customers" USING "btree" ("name");

CREATE INDEX "idx_customers_org_branch" ON "public"."customers" USING "btree" ("organization_id", "store_branch_id");

CREATE INDEX "idx_customers_org_id" ON "public"."customers" USING "btree" ("organization_id");

CREATE INDEX "idx_digital_menu_org_branch" ON "public"."digital_menu_config" USING "btree" ("organization_id", "store_branch_id");

CREATE INDEX "idx_financial_branch_due" ON "public"."financial_transactions" USING "btree" ("store_branch_id", "due_date") WHERE ("store_branch_id" IS NOT NULL);

CREATE INDEX "idx_financial_due_date" ON "public"."financial_transactions" USING "btree" ("due_date");

CREATE INDEX "idx_financial_org_branch" ON "public"."financial_transactions" USING "btree" ("organization_id", "store_branch_id");

CREATE INDEX "idx_financial_org_due" ON "public"."financial_transactions" USING "btree" ("organization_id", "due_date");

CREATE INDEX "idx_financial_org_id" ON "public"."financial_transactions" USING "btree" ("organization_id");

CREATE INDEX "idx_financial_org_status" ON "public"."financial_transactions" USING "btree" ("organization_id", "status");

CREATE INDEX "idx_financial_transactions_org_id" ON "public"."financial_transactions" USING "btree" ("organization_id");

CREATE INDEX "idx_nf_records_org_branch" ON "public"."nf_records" USING "btree" ("organization_id", "store_branch_id");

CREATE INDEX "idx_nf_records_supplier" ON "public"."nf_records" USING "btree" ("supplier_id");

CREATE INDEX "idx_products_active" ON "public"."products" USING "btree" ("store_branch_id", "name") WHERE (("is_active" = true) AND ("store_branch_id" IS NOT NULL));

CREATE INDEX "idx_products_barcode" ON "public"."products" USING "btree" ("barcode") WHERE ("barcode" IS NOT NULL);

CREATE INDEX "idx_products_branch_category" ON "public"."products" USING "btree" ("store_branch_id", "category") WHERE ("store_branch_id" IS NOT NULL);

CREATE UNIQUE INDEX "idx_products_fraction_product_id" ON "public"."products" USING "btree" ("fraction_product_id") WHERE ("fraction_product_id" IS NOT NULL);

CREATE INDEX "idx_products_name" ON "public"."products" USING "btree" ("name");

CREATE INDEX "idx_products_org_barcode" ON "public"."products" USING "btree" ("organization_id", "barcode");

CREATE INDEX "idx_products_org_branch" ON "public"."products" USING "btree" ("organization_id", "store_branch_id");

CREATE INDEX "idx_products_org_id" ON "public"."products" USING "btree" ("organization_id");

CREATE INDEX "idx_products_org_name" ON "public"."products" USING "btree" ("organization_id", "name");

CREATE INDEX "idx_profiles_org" ON "public"."profiles" USING "btree" ("organization_id");

CREATE INDEX "idx_sale_items_product" ON "public"."sale_items" USING "btree" ("product_id");

CREATE INDEX "idx_sale_items_sale" ON "public"."sale_items" USING "btree" ("sale_id");

CREATE INDEX "idx_sales_cash_session" ON "public"."sales" USING "btree" ("cash_session_id");

CREATE INDEX "idx_sales_created_at" ON "public"."sales" USING "btree" ("created_at" DESC);

CREATE INDEX "idx_sales_org_branch" ON "public"."sales" USING "btree" ("organization_id", "store_branch_id");

CREATE INDEX "idx_sales_org_created" ON "public"."sales" USING "btree" ("organization_id", "created_at" DESC);

CREATE INDEX "idx_sales_org_id" ON "public"."sales" USING "btree" ("organization_id");

CREATE INDEX "idx_sales_org_status" ON "public"."sales" USING "btree" ("organization_id", "status");

CREATE INDEX "idx_sales_status" ON "public"."sales" USING "btree" ("status");

CREATE INDEX "idx_sales_store_branch" ON "public"."sales" USING "btree" ("store_branch_id");

CREATE INDEX "idx_stock_movements_org_branch" ON "public"."stock_movements" USING "btree" ("organization_id", "store_branch_id");

CREATE INDEX "idx_stock_movements_org_date" ON "public"."stock_movements" USING "btree" ("organization_id", "created_at" DESC);

CREATE INDEX "idx_stock_movements_org_id" ON "public"."stock_movements" USING "btree" ("organization_id");

CREATE INDEX "idx_stock_movements_product" ON "public"."stock_movements" USING "btree" ("product_id");

CREATE INDEX "idx_stock_movements_purchase_document" ON "public"."stock_movements" USING "btree" ("purchase_document_id");

CREATE INDEX "idx_stock_movements_type_date" ON "public"."stock_movements" USING "btree" ("organization_id", "store_branch_id", "type", "created_at" DESC);

CREATE INDEX "idx_store_branches_org" ON "public"."store_branches" USING "btree" ("organization_id");

CREATE INDEX "idx_suppliers_cnpj" ON "public"."suppliers" USING "btree" ("cnpj") WHERE ("cnpj" IS NOT NULL);

CREATE INDEX "idx_suppliers_org_branch" ON "public"."suppliers" USING "btree" ("organization_id", "store_branch_id");

CREATE INDEX "idx_suppliers_org_id" ON "public"."suppliers" USING "btree" ("organization_id");

CREATE INDEX "idx_system_settings_org" ON "public"."system_settings" USING "btree" ("organization_id");

CREATE INDEX "idx_system_users_branch" ON "public"."system_users" USING "btree" ("store_branch_id");

CREATE INDEX "idx_system_users_org" ON "public"."system_users" USING "btree" ("organization_id");

CREATE INDEX "idx_system_users_org_id" ON "public"."system_users" USING "btree" ("organization_id");

CREATE INDEX "idx_tables_org_branch" ON "public"."tables" USING "btree" ("organization_id", "store_branch_id");

CREATE UNIQUE INDEX "idx_tables_unique_name_branch" ON "public"."tables" USING "btree" ("lower"("name"), "store_branch_id") WHERE ("store_branch_id" IS NOT NULL);

CREATE INDEX "nf_records_branch_idx" ON "public"."nf_records" USING "btree" ("store_branch_id");

CREATE INDEX "nf_records_org_idx" ON "public"."nf_records" USING "btree" ("organization_id");

CREATE INDEX "nf_records_scan_date_idx" ON "public"."nf_records" USING "btree" ("scan_date" DESC);

CREATE UNIQUE INDEX "one_active_session_per_table" ON "public"."customer_sessions" USING "btree" ("table_id") WHERE ("status" = 'active'::"text");

CREATE INDEX "scanned_boletos_branch_idx" ON "public"."scanned_boletos" USING "btree" ("store_branch_id");

CREATE INDEX "scanned_boletos_org_idx" ON "public"."scanned_boletos" USING "btree" ("organization_id");

CREATE INDEX "scanned_boletos_scan_date_idx" ON "public"."scanned_boletos" USING "btree" ("scan_date" DESC);

-- ---------- REPLICA IDENTITY ----------

ALTER TABLE ONLY "public"."api_keys" REPLICA IDENTITY FULL;

ALTER TABLE ONLY "public"."audit_log" REPLICA IDENTITY FULL;

ALTER TABLE ONLY "public"."branch_themes" REPLICA IDENTITY FULL;

ALTER TABLE ONLY "public"."cash_sessions" REPLICA IDENTITY FULL;

ALTER TABLE ONLY "public"."categories" REPLICA IDENTITY FULL;

ALTER TABLE ONLY "public"."sales" REPLICA IDENTITY FULL;

ALTER TABLE ONLY "public"."store_branches" REPLICA IDENTITY FULL;

ALTER TABLE ONLY "public"."credit_payments" REPLICA IDENTITY FULL;

ALTER TABLE ONLY "public"."customer_sessions" REPLICA IDENTITY FULL;

ALTER TABLE ONLY "public"."customers" REPLICA IDENTITY FULL;

ALTER TABLE ONLY "public"."digital_menu_config" REPLICA IDENTITY FULL;

ALTER TABLE ONLY "public"."financial_transactions" REPLICA IDENTITY FULL;

ALTER TABLE ONLY "public"."nf_records" REPLICA IDENTITY FULL;

ALTER TABLE ONLY "public"."pix_config" REPLICA IDENTITY FULL;

ALTER TABLE ONLY "public"."products" REPLICA IDENTITY FULL;

ALTER TABLE ONLY "public"."profiles" REPLICA IDENTITY FULL;

ALTER TABLE ONLY "public"."sale_items" REPLICA IDENTITY FULL;

ALTER TABLE ONLY "public"."scanned_boletos" REPLICA IDENTITY FULL;

ALTER TABLE ONLY "public"."sessions" REPLICA IDENTITY FULL;

ALTER TABLE ONLY "public"."stock_change_log" REPLICA IDENTITY FULL;

ALTER TABLE ONLY "public"."stock_movements" REPLICA IDENTITY FULL;

ALTER TABLE ONLY "public"."suppliers" REPLICA IDENTITY FULL;

ALTER TABLE ONLY "public"."sync_queue" REPLICA IDENTITY FULL;

ALTER TABLE ONLY "public"."system_settings" REPLICA IDENTITY FULL;

ALTER TABLE ONLY "public"."system_users" REPLICA IDENTITY FULL;

ALTER TABLE ONLY "public"."tables" REPLICA IDENTITY FULL;

ALTER TABLE ONLY "public"."user_permissions" REPLICA IDENTITY FULL;

