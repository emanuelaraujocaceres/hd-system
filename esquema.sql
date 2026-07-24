-- =====================================================
-- HD-System - Schema SQL Completo para Supabase
-- Execute este script no SQL Editor do Supabase
-- =====================================================

-- 1. Criar schema hd_system
CREATE SCHEMA IF NOT EXISTS hd_system;

-- 2. Tabela: users
CREATE TABLE IF NOT EXISTS hd_system.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'collaborator')),
  tenant_id UUID,
  is_active BOOLEAN DEFAULT TRUE,
  last_login TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 3. Tabela: products
CREATE TABLE IF NOT EXISTS hd_system.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  cost DECIMAL(10,2),
  sku TEXT UNIQUE,
  barcode TEXT,
  category_id UUID,
  tenant_id UUID,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 4. Tabela: stock
CREATE TABLE IF NOT EXISTS hd_system.stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES hd_system.products(id),
  quantity INTEGER NOT NULL DEFAULT 0,
  min_quantity INTEGER DEFAULT 5,
  location TEXT,
  tenant_id UUID,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 5. Tabela: sales
CREATE TABLE IF NOT EXISTS hd_system.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_number SERIAL UNIQUE,
  user_id UUID REFERENCES hd_system.users(id),
  customer_name TEXT,
  customer_document TEXT,
  items JSONB,
  subtotal DECIMAL(10,2),
  discount DECIMAL(10,2) DEFAULT 0,
  tax DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2),
  payment_method TEXT,
  status TEXT DEFAULT 'completed',
  tenant_id UUID,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 6. Enable RLS
ALTER TABLE hd_system.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE hd_system.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE hd_system.stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE hd_system.sales ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies - Admin
CREATE POLICY admin_all_users ON hd_system.users
  FOR ALL USING (auth.uid() IN (SELECT id FROM hd_system.users WHERE role = 'admin'));

CREATE POLICY admin_all_products ON hd_system.products
  FOR ALL USING (auth.uid() IN (SELECT id FROM hd_system.users WHERE role = 'admin'));

CREATE POLICY admin_all_stock ON hd_system.stock
  FOR ALL USING (auth.uid() IN (SELECT id FROM hd_system.users WHERE role = 'admin'));

CREATE POLICY admin_all_sales ON hd_system.sales
  FOR ALL USING (auth.uid() IN (SELECT id FROM hd_system.users WHERE role = 'admin'));

-- 8. RLS Policies - Collaborator
CREATE POLICY collaborator_tenant_products ON hd_system.products
  FOR ALL USING (auth.uid() IN (SELECT id FROM hd_system.users WHERE role = 'collaborator')
  AND tenant_id = (SELECT tenant_id FROM hd_system.users WHERE id = auth.uid()));

CREATE POLICY collaborator_tenant_stock ON hd_system.stock
  FOR ALL USING (auth.uid() IN (SELECT id FROM hd_system.users WHERE role = 'collaborator')
  AND tenant_id = (SELECT tenant_id FROM hd_system.users WHERE id = auth.uid()));

CREATE POLICY collaborator_tenant_sales ON hd_system.sales
  FOR ALL USING (auth.uid() IN (SELECT id FROM hd_system.users WHERE role = 'collaborator')
  AND tenant_id = (SELECT tenant_id FROM hd_system.users WHERE id = auth.uid()));
