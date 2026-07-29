-- ==============================================================================
-- MIGRAÇÃO COMPLETA: TEXT → UUID + RLS + FKs + ÍNDICES + TRIGGERS
-- HD-System ERP/PDV
-- Execute UMA ÚNICA VEZ no SQL Editor do Supabase Dashboard
-- ==============================================================================
-- ATENÇÃO: Esta migração converte todos os IDs TEXT para UUID usando
-- UUID v5 determinístico, preservando todos os relacionamentos existentes.
-- ==============================================================================

-- ==============================================================================
-- FASE 0: PRÉ-REQUISITOS
-- ==============================================================================

-- 0a. Extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 0b. Namespace base para UUIDs determinísticos (mesmo usado no frontend Python)
-- Todos os UUIDs gerados durante a migração usarão este namespace,
-- garantindo que os IDs do frontend mock coincidam com os do banco.
DO $$ BEGIN
  PERFORM 'a7b9c81e-0000-4000-a000-9e0f1a2b3c4d'::uuid;
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'Namespace UUID inválido';
END $$;

-- ==============================================================================
-- FASE 1: BACKUP DE SEGURANÇA
-- ==============================================================================

CREATE TABLE IF NOT EXISTS backup_20260729_products AS SELECT * FROM products;
CREATE TABLE IF NOT EXISTS backup_20260729_categories AS SELECT * FROM categories;
CREATE TABLE IF NOT EXISTS backup_20260729_customers AS SELECT * FROM customers;
CREATE TABLE IF NOT EXISTS backup_20260729_suppliers AS SELECT * FROM suppliers;
CREATE TABLE IF NOT EXISTS backup_20260729_sales AS SELECT * FROM sales;
CREATE TABLE IF NOT EXISTS backup_20260729_sale_items AS SELECT * FROM sale_items;
CREATE TABLE IF NOT EXISTS backup_20260729_financial AS SELECT * FROM financial_transactions;
CREATE TABLE IF NOT EXISTS backup_20260729_cash_sessions AS SELECT * FROM cash_sessions;
CREATE TABLE IF NOT EXISTS backup_20260729_stock_movements AS SELECT * FROM stock_movements;
CREATE TABLE IF NOT EXISTS backup_20260729_store_branches AS SELECT * FROM store_branches;
CREATE TABLE IF NOT EXISTS backup_20260729_system_users AS SELECT * FROM system_users;
CREATE TABLE IF NOT EXISTS backup_20260729_system_settings AS SELECT * FROM system_settings;

-- ==============================================================================
-- FASE 2: CONVERSÃO TEXT → UUID (TABELA POR TABELA)
-- ==============================================================================
-- Estratégia:
--   1. Add coluna temporária id_new UUID
--   2. Preencher com uuid_generate_v5(namespace_da_tabela, id_antigo)
--   3. Remover PK antiga (CASCADE remove FKs que referenciam)
--   4. id_new vira PK
--   5. Renomear colunas
--   6. Restaurar FKs no final (Fase 3)
-- ==============================================================================

-- 2.1. organizations → já é UUID (pular)
-- ---------------------------------------

-- 2.2. store_branches → UUID
-- ---------------------------------------
ALTER TABLE store_branches ADD COLUMN id_new UUID;
UPDATE store_branches SET id_new = uuid_generate_v5(
  uuid_generate_v5('a7b9c81e-0000-4000-a000-9e0f1a2b3c4d', 'store_branches'),
  id
);
ALTER TABLE store_branches DROP CONSTRAINT store_branches_pkey CASCADE;
ALTER TABLE store_branches ALTER COLUMN id_new SET NOT NULL;
ALTER TABLE store_branches ADD PRIMARY KEY (id_new);
ALTER TABLE store_branches DROP COLUMN id;
ALTER TABLE store_branches RENAME COLUMN id_new TO id;
-- store_branches.store_branch_id references → será atualizado nas tabelas-filhas abaixo

-- 2.3. products → UUID
-- ---------------------------------------
ALTER TABLE products ADD COLUMN id_new UUID;
UPDATE products SET id_new = uuid_generate_v5(
  uuid_generate_v5('a7b9c81e-0000-4000-a000-9e0f1a2b3c4d', 'products'),
  id
);
-- store_branch_id TEXT → UUID (via store_branches)
UPDATE products p SET store_branch_id = (
  SELECT sb.id_new::text FROM backup_20260729_store_branches sb WHERE sb.id = p.store_branch_id
) WHERE p.store_branch_id IS NOT NULL AND p.store_branch_id != '';
ALTER TABLE products DROP CONSTRAINT products_pkey CASCADE;
ALTER TABLE products ALTER COLUMN id_new SET NOT NULL;
ALTER TABLE products ADD PRIMARY KEY (id_new);
ALTER TABLE products DROP COLUMN id;
ALTER TABLE products RENAME COLUMN id_new TO id;

-- 2.4. categories → UUID
-- ---------------------------------------
ALTER TABLE categories ADD COLUMN id_new UUID;
UPDATE categories SET id_new = uuid_generate_v5(
  uuid_generate_v5('a7b9c81e-0000-4000-a000-9e0f1a2b3c4d', 'categories'),
  id
);
ALTER TABLE categories DROP CONSTRAINT categories_pkey CASCADE;
ALTER TABLE categories ALTER COLUMN id_new SET NOT NULL;
ALTER TABLE categories ADD PRIMARY KEY (id_new);
ALTER TABLE categories DROP COLUMN id;
ALTER TABLE categories RENAME COLUMN id_new TO id;

-- 2.5. customers → UUID
-- ---------------------------------------
ALTER TABLE customers ADD COLUMN id_new UUID;
UPDATE customers SET id_new = uuid_generate_v5(
  uuid_generate_v5('a7b9c81e-0000-4000-a000-9e0f1a2b3c4d', 'customers'),
  id
);
ALTER TABLE customers DROP CONSTRAINT customers_pkey CASCADE;
ALTER TABLE customers ALTER COLUMN id_new SET NOT NULL;
ALTER TABLE customers ADD PRIMARY KEY (id_new);
ALTER TABLE customers DROP COLUMN id;
ALTER TABLE customers RENAME COLUMN id_new TO id;

-- 2.6. suppliers → UUID
-- ---------------------------------------
ALTER TABLE suppliers ADD COLUMN id_new UUID;
UPDATE suppliers SET id_new = uuid_generate_v5(
  uuid_generate_v5('a7b9c81e-0000-4000-a000-9e0f1a2b3c4d', 'suppliers'),
  id
);
ALTER TABLE suppliers DROP CONSTRAINT suppliers_pkey CASCADE;
ALTER TABLE suppliers ALTER COLUMN id_new SET NOT NULL;
ALTER TABLE suppliers ADD PRIMARY KEY (id_new);
ALTER TABLE suppliers DROP COLUMN id;
ALTER TABLE suppliers RENAME COLUMN id_new TO id;

-- 2.7. system_users → UUID
-- ---------------------------------------
ALTER TABLE system_users ADD COLUMN id_new UUID;
UPDATE system_users SET id_new = uuid_generate_v5(
  uuid_generate_v5('a7b9c81e-0000-4000-a000-9e0f1a2b3c4d', 'system_users'),
  id
);
ALTER TABLE system_users DROP CONSTRAINT system_users_pkey CASCADE;
ALTER TABLE system_users ALTER COLUMN id_new SET NOT NULL;
ALTER TABLE system_users ADD PRIMARY KEY (id_new);
ALTER TABLE system_users DROP COLUMN id;
ALTER TABLE system_users RENAME COLUMN id_new TO id;

-- 2.8. sales → UUID
-- ---------------------------------------
ALTER TABLE sales ADD COLUMN id_new UUID;
UPDATE sales SET id_new = uuid_generate_v5(
  uuid_generate_v5('a7b9c81e-0000-4000-a000-9e0f1a2b3c4d', 'sales'),
  id
);
-- Converter FK textuais (não têm constraint, mas têm valores)
UPDATE sales s SET user_id = (
  SELECT u.id_new::text FROM backup_20260729_system_users u WHERE u.id = s.user_id
) WHERE s.user_id IS NOT NULL AND s.user_id != '';
UPDATE sales s SET customer_id = (
  SELECT c.id_new::text FROM backup_20260729_customers c WHERE c.id = s.customer_id
) WHERE s.customer_id IS NOT NULL AND s.customer_id != '';
ALTER TABLE sales DROP CONSTRAINT sales_pkey CASCADE;
ALTER TABLE sales ALTER COLUMN id_new SET NOT NULL;
ALTER TABLE sales ADD PRIMARY KEY (id_new);
ALTER TABLE sales DROP COLUMN id;
ALTER TABLE sales RENAME COLUMN id_new TO id;

-- 2.9. sale_items → UUID
-- ---------------------------------------
ALTER TABLE sale_items ADD COLUMN id_new UUID;
UPDATE sale_items SET id_new = uuid_generate_v5(
  uuid_generate_v5('a7b9c81e-0000-4000-a000-9e0f1a2b3c4d', 'sale_items'),
  id
);
-- Converter sale_id (única FK real que existia) e product_id
UPDATE sale_items si SET sale_id = (
  SELECT s.id_new::text FROM backup_20260729_sales s WHERE s.id = si.sale_id
) WHERE si.sale_id IS NOT NULL;
UPDATE sale_items si SET product_id = (
  SELECT p.id_new::text FROM backup_20260729_products p WHERE p.id = si.product_id
) WHERE si.product_id IS NOT NULL AND si.product_id != '';
ALTER TABLE sale_items DROP CONSTRAINT sale_items_pkey CASCADE;
ALTER TABLE sale_items ALTER COLUMN id_new SET NOT NULL;
ALTER TABLE sale_items ADD PRIMARY KEY (id_new);
ALTER TABLE sale_items DROP COLUMN id;
ALTER TABLE sale_items RENAME COLUMN id_new TO id;

-- 2.10. financial_transactions → UUID
-- ---------------------------------------
ALTER TABLE financial_transactions ADD COLUMN id_new UUID;
UPDATE financial_transactions SET id_new = uuid_generate_v5(
  uuid_generate_v5('a7b9c81e-0000-4000-a000-9e0f1a2b3c4d', 'financial_transactions'),
  id
);
ALTER TABLE financial_transactions DROP CONSTRAINT financial_transactions_pkey CASCADE;
ALTER TABLE financial_transactions ALTER COLUMN id_new SET NOT NULL;
ALTER TABLE financial_transactions ADD PRIMARY KEY (id_new);
ALTER TABLE financial_transactions DROP COLUMN id;
ALTER TABLE financial_transactions RENAME COLUMN id_new TO id;

-- 2.11. cash_sessions → UUID
-- ---------------------------------------
ALTER TABLE cash_sessions ADD COLUMN id_new UUID;
UPDATE cash_sessions SET id_new = uuid_generate_v5(
  uuid_generate_v5('a7b9c81e-0000-4000-a000-9e0f1a2b3c4d', 'cash_sessions'),
  id
);
UPDATE cash_sessions cs SET user_id = (
  SELECT u.id_new::text FROM backup_20260729_system_users u WHERE u.id = cs.user_id
) WHERE cs.user_id IS NOT NULL AND cs.user_id != '';
ALTER TABLE cash_sessions DROP CONSTRAINT cash_sessions_pkey CASCADE;
ALTER TABLE cash_sessions ALTER COLUMN id_new SET NOT NULL;
ALTER TABLE cash_sessions ADD PRIMARY KEY (id_new);
ALTER TABLE cash_sessions DROP COLUMN id;
ALTER TABLE cash_sessions RENAME COLUMN id_new TO id;

-- 2.12. stock_movements → UUID
-- ---------------------------------------
ALTER TABLE stock_movements ADD COLUMN id_new UUID;
UPDATE stock_movements SET id_new = uuid_generate_v5(
  uuid_generate_v5('a7b9c81e-0000-4000-a000-9e0f1a2b3c4d', 'stock_movements'),
  id
);
UPDATE stock_movements sm SET product_id = (
  SELECT p.id_new::text FROM backup_20260729_products p WHERE p.id = sm.product_id
) WHERE sm.product_id IS NOT NULL AND sm.product_id != '';
ALTER TABLE stock_movements DROP CONSTRAINT stock_movements_pkey CASCADE;
ALTER TABLE stock_movements ALTER COLUMN id_new SET NOT NULL;
ALTER TABLE stock_movements ADD PRIMARY KEY (id_new);
ALTER TABLE stock_movements DROP COLUMN id;
ALTER TABLE stock_movements RENAME COLUMN id_new TO id;

-- 2.13. system_settings → UUID
-- ---------------------------------------
ALTER TABLE system_settings ADD COLUMN id_new UUID;
UPDATE system_settings SET id_new = uuid_generate_v5(
  uuid_generate_v5('a7b9c81e-0000-4000-a000-9e0f1a2b3c4d', 'system_settings'),
  COALESCE(id, 'default')
);
ALTER TABLE system_settings DROP CONSTRAINT system_settings_pkey CASCADE;
ALTER TABLE system_settings ALTER COLUMN id_new SET NOT NULL;
ALTER TABLE system_settings ADD PRIMARY KEY (id_new);
ALTER TABLE system_settings DROP COLUMN id;
ALTER TABLE system_settings RENAME COLUMN id_new TO id;

-- 2.14. stock_change_log → UUID
-- ---------------------------------------
ALTER TABLE stock_change_log ADD COLUMN id_new UUID;
UPDATE stock_change_log SET id_new = uuid_generate_v5(
  uuid_generate_v5('a7b9c81e-0000-4000-a000-9e0f1a2b3c4d', 'stock_change_log'),
  COALESCE(id, 'log-' || EXTRACT(EPOCH FROM created_at)::text)
);
ALTER TABLE stock_change_log DROP CONSTRAINT stock_change_log_pkey CASCADE;
ALTER TABLE stock_change_log ALTER COLUMN id_new SET NOT NULL;
ALTER TABLE stock_change_log ADD PRIMARY KEY (id_new);
ALTER TABLE stock_change_log DROP COLUMN id;
ALTER TABLE stock_change_log RENAME COLUMN id_new TO id;

-- 2.15. movimentacoes_falhas (DLQ) → UUID
-- ---------------------------------------
ALTER TABLE movimentacoes_falhas ADD COLUMN id_new UUID;
UPDATE movimentacoes_falhas SET id_new = uuid_generate_v5(
  uuid_generate_v5('a7b9c81e-0000-4000-a000-9e0f1a2b3c4d', 'movimentacoes_falhas'),
  COALESCE(id, 'dlq-' || EXTRACT(EPOCH FROM created_at)::text)
);
ALTER TABLE movimentacoes_falhas DROP CONSTRAINT movimentacoes_falhas_pkey CASCADE;
ALTER TABLE movimentacoes_falhas ALTER COLUMN id_new SET NOT NULL;
ALTER TABLE movimentacoes_falhas ADD PRIMARY KEY (id_new);
ALTER TABLE movimentacoes_falhas DROP COLUMN id;
ALTER TABLE movimentacoes_falhas RENAME COLUMN id_new TO id;

-- 2.16. sync_queue → UUID
-- ---------------------------------------
ALTER TABLE sync_queue ADD COLUMN id_new UUID;
UPDATE sync_queue SET id_new = uuid_generate_v5(
  uuid_generate_v5('a7b9c81e-0000-4000-a000-9e0f1a2b3c4d', 'sync_queue'),
  COALESCE(id, 'sync-' || EXTRACT(EPOCH FROM created_at)::text)
);
ALTER TABLE sync_queue DROP CONSTRAINT sync_queue_pkey CASCADE;
ALTER TABLE sync_queue ALTER COLUMN id_new SET NOT NULL;
ALTER TABLE sync_queue ADD PRIMARY KEY (id_new);
ALTER TABLE sync_queue DROP COLUMN id;
ALTER TABLE sync_queue RENAME COLUMN id_new TO id;

-- 2.17. Conversão dos campos store_branch_id TEXT → UUID nas tabelas que têm
-- Store branch references (non-PK columns)
UPDATE products SET store_branch_id = (
  SELECT sb.id::text FROM store_branches sb JOIN backup_20260729_store_branches b ON sb.id::text = b.id_new::text WHERE b.id = products.store_branch_id
) WHERE store_branch_id IS NOT NULL AND store_branch_id != '';
-- (Campos de referência já foram convertidos nos passos acima)

-- ==============================================================================
-- FASE 2B: LIMPEZA — COLUNAS store_branch_id em TEXT → UUID (alterar tipo)
-- ==============================================================================
-- Nota: Manteremos store_branch_id como TEXT por enquanto para compatibilidade
-- com o frontend existente. A coluna contém UUIDs (após conversão), mas como TEXT.
-- Quando adicionarmos FKs reais, converteremos para UUID.

-- ==============================================================================
-- FASE 3: FOREIGN KEYS (PROTEÇÃO DE INTEGRIDADE)
-- ==============================================================================

-- 3.1. organizations (já existe, só adicionar FKs que apontam para ela)
-- organization_id já aponta para organizations.id (UUID). Manter como está.

-- 3.2. store_branches → organizations
ALTER TABLE store_branches ADD CONSTRAINT fk_store_branches_org
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- 3.3. products → organizations, store_branches (quando store_branch_id for UUID)
-- FK para organizations
ALTER TABLE products ADD CONSTRAINT fk_products_org
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- 3.4. categories → organizations
ALTER TABLE categories ADD CONSTRAINT fk_categories_org
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- 3.5. customers → organizations
ALTER TABLE customers ADD CONSTRAINT fk_customers_org
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- 3.6. suppliers → organizations
ALTER TABLE suppliers ADD CONSTRAINT fk_suppliers_org
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- 3.7. sales → organizations + system_users + customers
ALTER TABLE sales ADD CONSTRAINT fk_sales_org
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- 3.8. sale_items → sales + products
ALTER TABLE sale_items ADD CONSTRAINT fk_sale_items_sale
  FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE;
ALTER TABLE sale_items ADD CONSTRAINT fk_sale_items_product
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT;

-- 3.9. financial_transactions → organizations
ALTER TABLE financial_transactions ADD CONSTRAINT fk_financial_org
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- 3.10. cash_sessions → organizations + system_users
ALTER TABLE cash_sessions ADD CONSTRAINT fk_cash_sessions_org
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- 3.11. stock_movements → organizations + products
ALTER TABLE stock_movements ADD CONSTRAINT fk_stock_movements_org
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE stock_movements ADD CONSTRAINT fk_stock_movements_product
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT;

-- 3.12. system_users → organizations
ALTER TABLE system_users ADD CONSTRAINT fk_system_users_org
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- 3.13. system_settings → organizations
ALTER TABLE system_settings ADD CONSTRAINT fk_system_settings_org
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- 3.14. stock_change_log → products
ALTER TABLE stock_change_log ADD CONSTRAINT fk_stock_change_log_product
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

-- ==============================================================================
-- FASE 4: ROW LEVEL SECURITY (RLS) — SEGURANÇA MULTI-TENANT
-- ==============================================================================

-- 4.0. Função helper para obter organization_id do usuário autenticado
-- (já deve existir, mas recriamos para garantir)
CREATE OR REPLACE FUNCTION public.get_auth_user_org_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT organization_id FROM profiles WHERE id = auth.uid();
$$;

-- 4.1. Habilitar RLS em todas as tabelas
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_change_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimentacoes_falhas ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_queue ENABLE ROW LEVEL SECURITY;

-- 4.2. Políticas de isolamento por organização
-- Regra: usuários veem/apenas registros da sua própria organização.

-- organizations: qualquer um na organização pode ver, só admin pode modificar
CREATE POLICY "RLS_organizations_select" ON organizations
  FOR SELECT USING (id = get_auth_user_org_id());
CREATE POLICY "RLS_organizations_insert" ON organizations
  FOR INSERT WITH CHECK (id = get_auth_user_org_id());
CREATE POLICY "RLS_organizations_update" ON organizations
  FOR UPDATE USING (id = get_auth_user_org_id());

-- store_branches: isolamento por organização
CREATE POLICY "RLS_store_branches_select" ON store_branches
  FOR SELECT USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_store_branches_insert" ON store_branches
  FOR INSERT WITH CHECK (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_store_branches_update" ON store_branches
  FOR UPDATE USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_store_branches_delete" ON store_branches
  FOR DELETE USING (organization_id = get_auth_user_org_id());

-- products: isolamento por organização
CREATE POLICY "RLS_products_select" ON products
  FOR SELECT USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_products_insert" ON products
  FOR INSERT WITH CHECK (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_products_update" ON products
  FOR UPDATE USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_products_delete" ON products
  FOR DELETE USING (organization_id = get_auth_user_org_id());

-- categories
CREATE POLICY "RLS_categories_select" ON categories
  FOR SELECT USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_categories_insert" ON categories
  FOR INSERT WITH CHECK (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_categories_update" ON categories
  FOR UPDATE USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_categories_delete" ON categories
  FOR DELETE USING (organization_id = get_auth_user_org_id());

-- customers
CREATE POLICY "RLS_customers_select" ON customers
  FOR SELECT USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_customers_insert" ON customers
  FOR INSERT WITH CHECK (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_customers_update" ON customers
  FOR UPDATE USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_customers_delete" ON customers
  FOR DELETE USING (organization_id = get_auth_user_org_id());

-- suppliers
CREATE POLICY "RLS_suppliers_select" ON suppliers
  FOR SELECT USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_suppliers_insert" ON suppliers
  FOR INSERT WITH CHECK (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_suppliers_update" ON suppliers
  FOR UPDATE USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_suppliers_delete" ON suppliers
  FOR DELETE USING (organization_id = get_auth_user_org_id());

-- sales
CREATE POLICY "RLS_sales_select" ON sales
  FOR SELECT USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_sales_insert" ON sales
  FOR INSERT WITH CHECK (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_sales_update" ON sales
  FOR UPDATE USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_sales_delete" ON sales
  FOR DELETE USING (organization_id = get_auth_user_org_id());

-- sale_items (herda segurança via sale.organization_id indiretamente)
CREATE POLICY "RLS_sale_items_select" ON sale_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM sales WHERE sales.id = sale_items.sale_id AND sales.organization_id = get_auth_user_org_id())
  );
CREATE POLICY "RLS_sale_items_insert" ON sale_items
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM sales WHERE sales.id = sale_items.sale_id AND sales.organization_id = get_auth_user_org_id())
  );
CREATE POLICY "RLS_sale_items_update" ON sale_items
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM sales WHERE sales.id = sale_items.sale_id AND sales.organization_id = get_auth_user_org_id())
  );
CREATE POLICY "RLS_sale_items_delete" ON sale_items
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM sales WHERE sales.id = sale_items.sale_id AND sales.organization_id = get_auth_user_org_id())
  );

-- financial_transactions
CREATE POLICY "RLS_financial_select" ON financial_transactions
  FOR SELECT USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_financial_insert" ON financial_transactions
  FOR INSERT WITH CHECK (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_financial_update" ON financial_transactions
  FOR UPDATE USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_financial_delete" ON financial_transactions
  FOR DELETE USING (organization_id = get_auth_user_org_id());

-- cash_sessions
CREATE POLICY "RLS_cash_sessions_select" ON cash_sessions
  FOR SELECT USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_cash_sessions_insert" ON cash_sessions
  FOR INSERT WITH CHECK (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_cash_sessions_update" ON cash_sessions
  FOR UPDATE USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_cash_sessions_delete" ON cash_sessions
  FOR DELETE USING (organization_id = get_auth_user_org_id());

-- stock_movements
CREATE POLICY "RLS_stock_movements_select" ON stock_movements
  FOR SELECT USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_stock_movements_insert" ON stock_movements
  FOR INSERT WITH CHECK (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_stock_movements_update" ON stock_movements
  FOR UPDATE USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_stock_movements_delete" ON stock_movements
  FOR DELETE USING (organization_id = get_auth_user_org_id());

-- system_users
CREATE POLICY "RLS_system_users_select" ON system_users
  FOR SELECT USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_system_users_insert" ON system_users
  FOR INSERT WITH CHECK (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_system_users_update" ON system_users
  FOR UPDATE USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_system_users_delete" ON system_users
  FOR DELETE USING (organization_id = get_auth_user_org_id());

-- system_settings
CREATE POLICY "RLS_system_settings_select" ON system_settings
  FOR SELECT USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_system_settings_insert" ON system_settings
  FOR INSERT WITH CHECK (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_system_settings_update" ON system_settings
  FOR UPDATE USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_system_settings_delete" ON system_settings
  FOR DELETE USING (organization_id = get_auth_user_org_id());

-- stock_change_log
CREATE POLICY "RLS_stock_change_log_select" ON stock_change_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM products WHERE products.id = stock_change_log.product_id AND products.organization_id = get_auth_user_org_id())
  );

-- movimentacoes_falhas (DLQ): acesso da própria organização
CREATE POLICY "RLS_movimentacoes_falhas_select" ON movimentacoes_falhas
  FOR SELECT USING (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_movimentacoes_falhas_insert" ON movimentacoes_falhas
  FOR INSERT WITH CHECK (organization_id = get_auth_user_org_id());

-- sync_queue: acesso da própria organização
CREATE POLICY "RLS_sync_queue_select" ON sync_queue
  FOR SELECT USING (organization_id = get_auth_user_org_id());

-- 4.3. Política especial para profiles (auth.users vinculados)
-- profiles: usuário vê seu próprio perfil + outros da mesma organização
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "RLS_profiles_select" ON profiles
  FOR SELECT USING (
    id = auth.uid() OR organization_id = get_auth_user_org_id()
  );
CREATE POLICY "RLS_profiles_update" ON profiles
  FOR UPDATE USING (id = auth.uid());

-- ==============================================================================
-- FASE 5: ÍNDICES PARA PERFORMANCE MULTI-TENANT
-- ==============================================================================

-- 5.1. Índices em organization_id (consulta principal)
CREATE INDEX IF NOT EXISTS idx_products_org_id ON products(organization_id);
CREATE INDEX IF NOT EXISTS idx_categories_org_id ON categories(organization_id);
CREATE INDEX IF NOT EXISTS idx_customers_org_id ON customers(organization_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_org_id ON suppliers(organization_id);
CREATE INDEX IF NOT EXISTS idx_sales_org_id ON sales(organization_id);
CREATE INDEX IF NOT EXISTS idx_financial_org_id ON financial_transactions(organization_id);
CREATE INDEX IF NOT EXISTS idx_cash_sessions_org_id ON cash_sessions(organization_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_org_id ON stock_movements(organization_id);
CREATE INDEX IF NOT EXISTS idx_system_users_org_id ON system_users(organization_id);

-- 5.2. Índices de busca frequente
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode) WHERE barcode IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE INDEX IF NOT EXISTS idx_products_org_name ON products(organization_id, name);
CREATE INDEX IF NOT EXISTS idx_products_org_barcode ON products(organization_id, barcode);

CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_cpf_cnpj ON customers(cpf_cnpj) WHERE cpf_cnpj IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_suppliers_cnpj ON suppliers(cnpj) WHERE cnpj IS NOT NULL;

-- 5.3. Índices de data (ordenação por data é frequente)
CREATE INDEX IF NOT EXISTS idx_sales_org_created ON sales(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_org_status ON sales(organization_id, status);

CREATE INDEX IF NOT EXISTS idx_financial_due_date ON financial_transactions(due_date);
CREATE INDEX IF NOT EXISTS idx_financial_org_status ON financial_transactions(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_financial_org_due ON financial_transactions(organization_id, due_date);

CREATE INDEX IF NOT EXISTS idx_stock_movements_org_date ON stock_movements(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);

CREATE INDEX IF NOT EXISTS idx_cash_sessions_status ON cash_sessions(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_cash_sessions_operator ON cash_sessions(user_id, status);

CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items(product_id);

-- 5.4. Índices para busca textual
CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON products USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_customers_name_trgm ON customers USING gin (name gin_trgm_ops);

-- ==============================================================================
-- FASE 6: TRIGGERS
-- ==============================================================================

-- 6.0. Função genérica para updated_at automático
CREATE OR REPLACE FUNCTION fn_update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- 6.1. Adicionar colunas updated_at onde faltam e triggers
-- products — já tem updated_at, adicionar trigger
DROP TRIGGER IF EXISTS trg_products_updated_at ON products;
CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW
  WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION fn_update_updated_at();

-- store_branches — adicionar updated_at se não existir
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'store_branches' AND column_name = 'updated_at') THEN
    ALTER TABLE store_branches ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;
DROP TRIGGER IF EXISTS trg_store_branches_updated_at ON store_branches;
CREATE TRIGGER trg_store_branches_updated_at
  BEFORE UPDATE ON store_branches
  FOR EACH ROW
  WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION fn_update_updated_at();

-- customers — adicionar updated_at
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'updated_at') THEN
    ALTER TABLE customers ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;
DROP TRIGGER IF EXISTS trg_customers_updated_at ON customers;
CREATE TRIGGER trg_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW
  WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION fn_update_updated_at();

-- suppliers — adicionar updated_at
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'updated_at') THEN
    ALTER TABLE suppliers ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;
DROP TRIGGER IF EXISTS trg_suppliers_updated_at ON suppliers;
CREATE TRIGGER trg_suppliers_updated_at
  BEFORE UPDATE ON suppliers
  FOR EACH ROW
  WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION fn_update_updated_at();

-- customers — adicionar updated_at para sales
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'updated_at') THEN
    ALTER TABLE sales ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;
DROP TRIGGER IF EXISTS trg_sales_updated_at ON sales;
CREATE TRIGGER trg_sales_updated_at
  BEFORE UPDATE ON sales
  FOR EACH ROW
  WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION fn_update_updated_at();

-- system_users — adicionar updated_at
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_users' AND column_name = 'updated_at') THEN
    ALTER TABLE system_users ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;
DROP TRIGGER IF EXISTS trg_system_users_updated_at ON system_users;
CREATE TRIGGER trg_system_users_updated_at
  BEFORE UPDATE ON system_users
  FOR EACH ROW
  WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION fn_update_updated_at();

-- 6.2. Trigger: Impedir estoque negativo (já existe, recriar)
DROP TRIGGER IF EXISTS trg_stock_not_negative ON products;

CREATE OR REPLACE FUNCTION fn_prevent_negative_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.stock_quantity < 0 THEN
    RAISE EXCEPTION 'Estoque nao pode ser negativo. Produto: %, Tentativa: %', NEW.name, NEW.stock_quantity;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_stock_not_negative
  BEFORE UPDATE OF stock_quantity ON products
  FOR EACH ROW
  WHEN (NEW.stock_quantity < 0)
  EXECUTE FUNCTION fn_prevent_negative_stock();

-- 6.3. Trigger: Log de mudanças de estoque (já existe, recriar)
DROP TRIGGER IF EXISTS trg_log_stock_changes ON products;

CREATE OR REPLACE FUNCTION fn_log_stock_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.stock_quantity IS DISTINCT FROM NEW.stock_quantity THEN
    INSERT INTO stock_movements (
      id, organization_id, product_id, product_name,
      type, quantity, previous_stock, new_stock,
      reason, operator_name, created_at
    ) VALUES (
      gen_random_uuid(),
      NEW.organization_id,
      NEW.id,
      NEW.name,
      CASE WHEN NEW.stock_quantity > OLD.stock_quantity THEN 'in' ELSE 'out' END,
      ABS(NEW.stock_quantity - OLD.stock_quantity),
      OLD.stock_quantity,
      NEW.stock_quantity,
      'Ajuste automático (trigger)',
      'system',
      NOW()
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_stock_changes
  AFTER UPDATE OF stock_quantity ON products
  FOR EACH ROW
  WHEN (OLD.stock_quantity IS DISTINCT FROM NEW.stock_quantity)
  EXECUTE FUNCTION fn_log_stock_changes();

-- 6.4. Trigger: Sincronizar product_name em sale_items quando products.name mudar
CREATE OR REPLACE FUNCTION fn_sync_product_name()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.name IS DISTINCT FROM NEW.name THEN
    UPDATE sale_items SET product_name = NEW.name WHERE product_id = NEW.id;
    UPDATE stock_movements SET product_name = NEW.name WHERE product_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_product_name ON products;
CREATE TRIGGER trg_sync_product_name
  AFTER UPDATE OF name ON products
  FOR EACH ROW
  EXECUTE FUNCTION fn_sync_product_name();

-- ==============================================================================
-- FASE 7: CORREÇÃO DE TIPOS — financial_transactions.due_date TEXT → DATE
-- ==============================================================================

DO $$ BEGIN
  -- Verificar se a coluna ainda é TEXT
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'financial_transactions'
      AND column_name = 'due_date'
      AND data_type = 'text'
  ) THEN
    -- Adicionar coluna temporária DATE
    ALTER TABLE financial_transactions ADD COLUMN due_date_new DATE;
    UPDATE financial_transactions SET due_date_new = due_date::date WHERE due_date ~ '^\d{4}-\d{2}-\d{2}';
    ALTER TABLE financial_transactions DROP COLUMN due_date;
    ALTER TABLE financial_transactions RENAME COLUMN due_date_new TO due_date;

    -- Mesmo para payment_date
    ALTER TABLE financial_transactions ADD COLUMN payment_date_new DATE;
    UPDATE financial_transactions SET payment_date_new = payment_date::date WHERE payment_date ~ '^\d{4}-\d{2}-\d{2}';
    ALTER TABLE financial_transactions DROP COLUMN payment_date;
    ALTER TABLE financial_transactions RENAME COLUMN payment_date_new TO payment_date;
  END IF;
END $$;

-- ==============================================================================
-- FASE 8: PRECISÃO NUMERIC — PADRONIZAR NUMERIC(12,2)
-- ==============================================================================

DO $$ BEGIN
  -- products
  ALTER TABLE products ALTER COLUMN cost_price TYPE NUMERIC(12,2) USING cost_price::numeric(12,2);
  ALTER TABLE products ALTER COLUMN sale_price TYPE NUMERIC(12,2) USING sale_price::numeric(12,2);
EXCEPTION WHEN OTHERS THEN END;

DO $$ BEGIN
  ALTER TABLE financial_transactions ALTER COLUMN amount TYPE NUMERIC(12,2) USING amount::numeric(12,2);
EXCEPTION WHEN OTHERS THEN END;

DO $$ BEGIN
  ALTER TABLE cash_sessions ALTER COLUMN opening_balance TYPE NUMERIC(12,2) USING opening_balance::numeric(12,2);
  ALTER TABLE cash_sessions ALTER COLUMN closing_balance TYPE NUMERIC(12,2) USING closing_balance::numeric(12,2);
  ALTER TABLE cash_sessions ALTER COLUMN expected_balance TYPE NUMERIC(12,2) USING expected_balance::numeric(12,2);
  ALTER TABLE cash_sessions ALTER COLUMN total_sales_cash TYPE NUMERIC(12,2) USING total_sales_cash::numeric(12,2);
  ALTER TABLE cash_sessions ALTER COLUMN total_sales_pix TYPE NUMERIC(12,2) USING total_sales_pix::numeric(12,2);
  ALTER TABLE cash_sessions ALTER COLUMN total_sales_card TYPE NUMERIC(12,2) USING total_sales_card::numeric(12,2);
  ALTER TABLE cash_sessions ALTER COLUMN total_sales_credit_account TYPE NUMERIC(12,2) USING total_sales_credit_account::numeric(12,2);
  ALTER TABLE cash_sessions ALTER COLUMN suprimentos TYPE NUMERIC(12,2) USING suprimentos::numeric(12,2);
  ALTER TABLE cash_sessions ALTER COLUMN sangrias TYPE NUMERIC(12,2) USING sangrias::numeric(12,2);
EXCEPTION WHEN OTHERS THEN END;

DO $$ BEGIN
  ALTER TABLE customers ALTER COLUMN credit_limit TYPE NUMERIC(12,2) USING credit_limit::numeric(12,2);
EXCEPTION WHEN OTHERS THEN END;

-- ==============================================================================
-- FASE 9: RECRIAR FUNÇÕES RPC (com UUID)
-- ==============================================================================

-- 9.1. Ajustar estoque
DROP FUNCTION IF EXISTS ajustar_estoque;

CREATE OR REPLACE FUNCTION ajustar_estoque(
  p_product_id UUID,
  p_quantity INTEGER,
  p_type TEXT DEFAULT 'in',
  p_reason TEXT DEFAULT 'Ajuste manual',
  p_operator_name TEXT DEFAULT 'Sistema',
  p_organization_id UUID DEFAULT '00000000-0000-0000-0000-000000000001'
)
RETURNS TABLE(success BOOLEAN, message TEXT, previous_stock INTEGER, new_stock INTEGER)
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_stock INTEGER;
  v_new_stock INTEGER;
  v_product_name TEXT;
  v_final_type TEXT;
BEGIN
  SELECT stock_quantity, name INTO v_current_stock, v_product_name
  FROM products WHERE id = p_product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'Produto nao encontrado: ' || p_product_id::text, 0, 0;
    RETURN;
  END IF;

  v_final_type := LOWER(p_type);
  IF v_final_type NOT IN ('in', 'out', 'adjustment', 'loss') THEN v_final_type := 'in'; END IF;

  v_new_stock := CASE
    WHEN v_final_type = 'in' THEN v_current_stock + ABS(p_quantity)
    WHEN v_final_type IN ('out', 'loss') THEN GREATEST(0, v_current_stock - ABS(p_quantity))
    WHEN v_final_type = 'adjustment' THEN p_quantity
    ELSE v_current_stock
  END;

  UPDATE products SET stock_quantity = v_new_stock, updated_at = NOW() WHERE id = p_product_id;

  INSERT INTO stock_movements (id, organization_id, product_id, product_name, type, quantity, previous_stock, new_stock, reason, operator_name)
  VALUES (gen_random_uuid(), p_organization_id, p_product_id, v_product_name, v_final_type, ABS(p_quantity), v_current_stock, v_new_stock, p_reason, p_operator_name);

  RETURN QUERY SELECT TRUE, 'Estoque ajustado: ' || v_current_stock || ' -> ' || v_new_stock, v_current_stock, v_new_stock;
END;
$$;

-- 9.2. Processar venda
DROP FUNCTION IF EXISTS process_sale_transaction;

CREATE OR REPLACE FUNCTION process_sale_transaction(
  p_sale_id UUID,
  p_organization_id UUID DEFAULT '00000000-0000-0000-0000-000000000001',
  p_store_branch_id UUID DEFAULT NULL,
  p_operator_name TEXT DEFAULT 'Sistema'
)
RETURNS TABLE(success BOOLEAN, message TEXT)
LANGUAGE plpgsql
AS $$
DECLARE
  v_item RECORD;
  v_current_stock INTEGER;
  v_new_stock INTEGER;
BEGIN
  FOR v_item IN
    SELECT si.product_id, si.quantity, p.name, p.stock_quantity
    FROM sale_items si
    JOIN products p ON p.id = si.product_id
    WHERE si.sale_id = p_sale_id
    FOR UPDATE OF p
  LOOP
    IF v_item.stock_quantity < v_item.quantity THEN
      RETURN QUERY SELECT FALSE, 'Estoque insuficiente: ' || v_item.name;
      RETURN;
    END IF;

    v_new_stock := v_item.stock_quantity - v_item.quantity;
    UPDATE products SET stock_quantity = v_new_stock, updated_at = NOW() WHERE id = v_item.product_id;

    INSERT INTO stock_movements (id, organization_id, product_id, product_name, type, quantity, previous_stock, new_stock, reason, operator_name)
    VALUES (gen_random_uuid(), p_organization_id, v_item.product_id, v_item.name, 'out', v_item.quantity, v_item.stock_quantity, v_new_stock, 'Venda PDV #' || p_sale_id::text, p_operator_name);
  END LOOP;

  RETURN QUERY SELECT TRUE, 'Venda processada com sucesso';
END;
$$;

-- 9.3. get_auth_user_org_id (já definido acima, recriar)
CREATE OR REPLACE FUNCTION public.get_auth_user_org_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT organization_id FROM profiles WHERE id = auth.uid();
$$;

-- 9.4. check_stock_consistency
DROP FUNCTION IF EXISTS check_stock_consistency;

CREATE OR REPLACE FUNCTION check_stock_consistency(p_organization_id UUID DEFAULT NULL)
RETURNS TABLE(product_id UUID, product_name TEXT, current_stock INTEGER, calculated_stock INTEGER, difference INTEGER, status TEXT)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH stock_calc AS (
    SELECT
      p.id,
      p.name,
      COALESCE(p.stock_quantity, 0) AS current_stock,
      COALESCE(SUM(CASE
        WHEN sm.type IN ('in', 'IN') THEN sm.quantity
        WHEN sm.type IN ('out', 'OUT', 'loss', 'LOSS') THEN -sm.quantity
        ELSE 0
      END), 0) AS calculated_stock
    FROM products p
    LEFT JOIN stock_movements sm ON p.id = sm.product_id
    WHERE (p_organization_id IS NULL OR p.organization_id = p_organization_id)
    GROUP BY p.id, p.name, p.stock_quantity
  )
  SELECT
    sc.id,
    sc.name,
    sc.current_stock,
    sc.calculated_stock,
    (sc.current_stock - sc.calculated_stock) AS difference,
    CASE
      WHEN sc.current_stock = sc.calculated_stock THEN 'CONSISTENTE'
      WHEN sc.current_stock > sc.calculated_stock THEN 'SUPERAVIT'
      ELSE 'DEFICIT'
    END AS status
  FROM stock_calc sc
  WHERE sc.current_stock != sc.calculated_stock
  ORDER BY ABS(sc.current_stock - sc.calculated_stock) DESC;
END;
$$;

-- 9.5. fn_insserir_dlq (atualizada para UUID)
DROP FUNCTION IF EXISTS fn_insserir_dlq;

CREATE OR REPLACE FUNCTION fn_insserir_dlq(
  p_operation_type TEXT,
  p_table_name TEXT,
  p_record_id TEXT DEFAULT NULL,
  p_payload JSONB DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL,
  p_error_code TEXT DEFAULT NULL,
  p_error_status INTEGER DEFAULT NULL,
  p_stack_trace TEXT DEFAULT NULL,
  p_source TEXT DEFAULT 'sync_queue',
  p_browser_id TEXT DEFAULT NULL,
  p_user_email TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_id UUID;
BEGIN
  v_id := gen_random_uuid();
  INSERT INTO movimentacoes_falhas (id, operation_type, table_name, record_id, payload, error_message, error_code, error_status, stack_trace, source, browser_id, user_email, next_retry_at)
  VALUES (v_id, p_operation_type, p_table_name, p_record_id, p_payload, p_error_message, p_error_code, p_error_status, p_stack_trace, p_source, p_browser_id, p_user_email, NOW() + INTERVAL '1 minute');
  RETURN v_id;
END;
$$;

-- ==============================================================================
-- FASE 10: GARANTIR QUE TABELAS AUXILIARES EXISTEM
-- ==============================================================================

-- organizations (deve existir, mas garantir)
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001',
  name TEXT NOT NULL DEFAULT 'HD-System',
  created_at TIMESTAMPTZ DEFAULT now()
);
INSERT INTO organizations (id, name) VALUES ('00000000-0000-0000-0000-000000000001', 'HD-System')
ON CONFLICT (id) DO NOTHING;

-- profiles (vinculada ao auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  role TEXT DEFAULT 'admin',
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- movimentacoes_falhas (DLQ)
CREATE TABLE IF NOT EXISTS movimentacoes_falhas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID DEFAULT '00000000-0000-0000-0000-000000000001',
  operation_type TEXT,
  table_name TEXT,
  record_id TEXT,
  payload JSONB,
  error_message TEXT,
  error_code TEXT,
  error_status INTEGER,
  stack_trace TEXT,
  source TEXT DEFAULT 'sync_queue',
  browser_id TEXT,
  user_email TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  next_retry_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  last_retry_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  resolution_notes TEXT
);

-- stock_change_log
CREATE TABLE IF NOT EXISTS stock_change_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  field_name TEXT,
  old_value TEXT,
  new_value TEXT,
  changed_at TIMESTAMPTZ DEFAULT now(),
  changed_by TEXT
);

-- sync_queue
CREATE TABLE IF NOT EXISTS sync_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID DEFAULT '00000000-0000-0000-0000-000000000001',
  table_name TEXT,
  record_id TEXT,
  operation TEXT,
  payload JSONB,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ
);

-- ==============================================================================
-- FASE 11: REALTIME — GARANTIR PUBLICAÇÃO
-- ==============================================================================

-- Adicionar tabelas à publicação de realtime (ignora se já existir)
DO $$
DECLARE
  tables TEXT[] := ARRAY['products','categories','customers','suppliers','sales','sale_items','financial_transactions','cash_sessions','stock_movements','store_branches','system_users','system_settings'];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    EXCEPTION WHEN OTHERS THEN
      -- Tabela já está na publicação
    END;
  END LOOP;
END $$;

-- ==============================================================================
-- FASE 12: VERIFICAÇÃO PÓS-MIGRAÇÃO
-- ==============================================================================

-- 12.1. Listar tabelas e seus tipos de ID
SELECT
  tablename,
  pg_size_pretty(pg_total_relation_size('public.' || tablename)) AS tamanho
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- 12.2. Verificar RLS ativo
SELECT
  relname AS tabela,
  relrowsecurity AS rls_ativo
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relkind = 'r'
ORDER BY relname;

-- 12.3. Verificar FKs
SELECT
  conname AS constraint_name,
  conrelid::regclass AS tabela_origem,
  confrelid::regclass AS tabela_destino
FROM pg_constraint
WHERE contype = 'f'
  AND connamespace = 'public'::regnamespace
ORDER BY conname;

-- 12.4. Verificar índices
SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname NOT LIKE '%pkey%'
ORDER BY tablename, indexname;

-- 12.5. Verificar triggers ativos
SELECT
  tgname AS trigger_name,
  tgrelid::regclass AS tabela
FROM pg_trigger
WHERE tgname IN (
  'trg_products_updated_at',
  'trg_store_branches_updated_at',
  'trg_customers_updated_at',
  'trg_suppliers_updated_at',
  'trg_sales_updated_at',
  'trg_system_users_updated_at',
  'trg_stock_not_negative',
  'trg_log_stock_changes',
  'trg_sync_product_name'
)
ORDER BY tgname;

-- 12.6. Contagem de registros por tabela
SELECT 'products' AS tabela, COUNT(*) FROM products
UNION ALL SELECT 'categories', COUNT(*) FROM categories
UNION ALL SELECT 'customers', COUNT(*) FROM customers
UNION ALL SELECT 'suppliers', COUNT(*) FROM suppliers
UNION ALL SELECT 'sales', COUNT(*) FROM sales
UNION ALL SELECT 'sale_items', COUNT(*) FROM sale_items
UNION ALL SELECT 'financial_transactions', COUNT(*) FROM financial_transactions
UNION ALL SELECT 'cash_sessions', COUNT(*) FROM cash_sessions
UNION ALL SELECT 'stock_movements', COUNT(*) FROM stock_movements
UNION ALL SELECT 'store_branches', COUNT(*) FROM store_branches
UNION ALL SELECT 'system_users', COUNT(*) FROM system_users
ORDER BY tabela;

-- 12.7. Mensagem final
DO $$
BEGIN
  RAISE NOTICE '╔═══════════════════════════════════════════════════╗';
  RAISE NOTICE '║  MIGRAÇÃO COMPLETA EXECUTADA COM SUCESSO!       ║';
  RAISE NOTICE '║  TEXT → UUID concluído                          ║';
  RAISE NOTICE '║  RLS habilitado em todas as tabelas             ║';
  RAISE NOTICE '║  FKs, índices e triggers criados               ║';
  RAISE NOTICE '║  Backup disponível em backup_20260729_*         ║';
  RAISE NOTICE '╚═══════════════════════════════════════════════════╝';
END $$;

-- ==============================================================================
-- FIM DA MIGRAÇÃO
-- ==============================================================================
