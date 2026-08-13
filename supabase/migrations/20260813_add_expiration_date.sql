-- ============================================================
-- Migration: Adicionar expiration_date na tabela products
-- Data: 2026-08-13
-- Descrição: Campo de validade do produto para alertas no Dashboard
-- ============================================================

-- Adicionar coluna expiration_date (nullable — produtos existentes não têm validade)
ALTER TABLE products ADD COLUMN IF NOT EXISTS expiration_date DATE;

-- Comentário para documentação
COMMENT ON COLUMN products.expiration_date IS 'Data de validade do produto. Usado para alertas de produto vencido/proximo ao vencimento no Dashboard.';

-- NOTA: products NÃO tem trigger de estoque (regra #8 do AGENTS.md)
-- O campo expiration_date é apenas informativo — não afeta lógica de venda/estoque.

-- Verificar se a coluna foi adicionada corretamente
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'expiration_date'
  ) THEN
    RAISE NOTICE 'OK: Coluna expiration_date adicionada com sucesso na tabela products';
  ELSE
    RAISE WARNING 'ERRO: Coluna expiration_date NÃO foi adicionada!';
  END IF;
END $$;
