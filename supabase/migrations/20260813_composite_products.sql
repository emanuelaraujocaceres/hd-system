-- ============================================================
-- Migration: Sistema de Produtos Compostos (Receitas / BOM)
-- Data: 2026-08-13
-- Descrição: Cria tabela product_recipes para vincular produtos
-- compostos aos seus ingredientes. Ao vender 1 unidade de um
-- produto composto, o sistema desconta automaticamente os
-- ingredientes do estoque.
-- ============================================================

-- 1. Adicionar coluna is_composite na tabela products
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_composite BOOLEAN DEFAULT FALSE;

-- Comentário
COMMENT ON COLUMN products.is_composite IS 'TRUE = produto composto (desconta ingredientes do estoque ao vender). Ex: Copão, Combo, Caixa Mix.';

-- 2. Criar tabela product_recipes (receitas / bill of materials)
CREATE TABLE IF NOT EXISTS product_recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_branch_id UUID REFERENCES store_branches(id) ON DELETE SET NULL,
  composite_product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  ingredient_product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  ingredient_name TEXT, -- Denormalizado para exibição rápida
  quantity NUMERIC(12,4) NOT NULL DEFAULT 1, -- Quantidade do ingrediente por 1 unidade do composto
  unit TEXT DEFAULT 'un', -- unidade de medida da receita (un, lit, kg)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Impedir ingrediente duplicado na mesma receita
  UNIQUE(composite_product_id, ingredient_product_id)
);

-- 3. Habilitar RLS (obrigatório — regra #0 do AGENTS.md)
ALTER TABLE product_recipes ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies (isolamento por organização)
-- Usamos DROP IF EXISTS para idempotência (não falhar se já existirem)
DROP POLICY IF EXISTS "product_recipes_select" ON product_recipes;
CREATE POLICY "product_recipes_select" ON product_recipes
  FOR SELECT USING (
    is_superadmin() OR organization_id = get_user_org_id()
  );

DROP POLICY IF EXISTS "product_recipes_insert" ON product_recipes;
CREATE POLICY "product_recipes_insert" ON product_recipes
  FOR INSERT WITH CHECK (
    is_superadmin() OR organization_id = get_user_org_id()
  );

DROP POLICY IF EXISTS "product_recipes_update" ON product_recipes;
CREATE POLICY "product_recipes_update" ON product_recipes
  FOR UPDATE USING (
    is_superadmin() OR organization_id = get_user_org_id()
  );

DROP POLICY IF EXISTS "product_recipes_delete" ON product_recipes;
CREATE POLICY "product_recipes_delete" ON product_recipes
  FOR DELETE USING (
    is_superadmin() OR organization_id = get_user_org_id()
  );

-- 5. Adicionar à publicação realtime (regra #2 do AGENTS.md)
-- Tentativa direta — Supabase controla member ships
ALTER PUBLICATION supabase_realtime ADD TABLE product_recipes;

-- 6. Replica Identity FULL para payload completo (regra #2)
ALTER TABLE product_recipes REPLICA IDENTITY FULL;

-- 7. Índices para performance
CREATE INDEX IF NOT EXISTS idx_product_recipes_composite ON product_recipes(composite_product_id);
CREATE INDEX IF NOT EXISTS idx_product_recipes_ingredient ON product_recipes(ingredient_product_id);
CREATE INDEX IF NOT EXISTS idx_product_recipes_org ON product_recipes(organization_id);

-- 8. Verificação final
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'is_composite'
  ) THEN
    RAISE NOTICE 'OK: Coluna is_composite adicionada em products';
  ELSE
    RAISE WARNING 'ERRO: Coluna is_composite NÃO foi adicionada!';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'product_recipes'
  ) THEN
    RAISE NOTICE 'OK: Tabela product_recipes criada com sucesso';
  ELSE
    RAISE WARNING 'ERRO: Tabela product_recipes NÃO foi criada!';
  END IF;
END $$;