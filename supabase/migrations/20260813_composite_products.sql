-- ============================================================
-- Migration: Sistema de Produtos Compostos (Receitas / BOM)
-- Data: 2026-08-13
-- ============================================================

-- 1. Adicionar coluna is_composite na tabela products
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_composite BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN products.is_composite IS 'TRUE = produto composto (desconta ingredientes do estoque ao vender)';

-- 2. Criar tabela product_recipes
CREATE TABLE product_recipes (
  id UUID NOT NULL PRIMARY KEY,
  organization_id UUID NOT NULL,
  store_branch_id UUID,
  composite_product_id UUID NOT NULL,
  ingredient_product_id UUID NOT NULL,
  ingredient_name TEXT,
  quantity NUMERIC(12,4) NOT NULL DEFAULT 1,
  unit TEXT DEFAULT 'un',
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE(composite_product_id, ingredient_product_id)
);

-- 3. Habilitar RLS
ALTER TABLE product_recipes ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies (idempotentes)
DROP POLICY IF EXISTS product_recipes_select ON product_recipes;
CREATE POLICY product_recipes_select ON product_recipes FOR SELECT USING (is_superadmin() OR organization_id = get_user_org_id());

DROP POLICY IF EXISTS product_recipes_insert ON product_recipes;
CREATE POLICY product_recipes_insert ON product_recipes FOR INSERT WITH CHECK (is_superadmin() OR organization_id = get_user_org_id());

DROP POLICY IF EXISTS product_recipes_update ON product_recipes;
CREATE POLICY product_recipes_update ON product_recipes FOR UPDATE USING (is_superadmin() OR organization_id = get_user_org_id());

DROP POLICY IF EXISTS product_recipes_delete ON product_recipes;
CREATE POLICY product_recipes_delete ON product_recipes FOR DELETE USING (is_superadmin() OR organization_id = get_user_org_id());

-- 5. Publicação realtime
ALTER PUBLICATION supabase_realtime ADD TABLE product_recipes;

-- 6. Replica Identity FULL
ALTER TABLE product_recipes REPLICA IDENTITY FULL;

-- 7. Índices
CREATE INDEX IF NOT EXISTS idx_product_recipes_composite ON product_recipes(composite_product_id);
CREATE INDEX IF NOT EXISTS idx_product_recipes_ingredient ON product_recipes(ingredient_product_id);
CREATE INDEX IF NOT EXISTS idx_product_recipes_org ON product_recipes(organization_id);

-- 8. Verificação
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'is_composite') THEN
    RAISE NOTICE 'OK: is_composite column';
  ELSE RAISE WARNING 'is_composite column missing';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'product_recipes') THEN
    RAISE NOTICE 'OK: product_recipes table';
  ELSE RAISE WARNING 'product_recipes table missing';
  END IF;
END $$;