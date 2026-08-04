-- 20260811_wholesale_options.sql
-- Venda no ATACADO (caixa/fardo) para produtos:
--   wholesale_options JSONB = [{ "id": "wh-...", "boxQuantity": 12, "salePrice": 38.00 }, ...]
--   - boxQuantity: quantas unidades vêm na caixa (12, 15, 18...)
--   - salePrice: preço de venda da CAIXA INTEIRA (R$)
-- O estoque (stock_quantity) continua UNITÁRIO — vender uma caixa de 12 dá
-- baixa de 12 unidades no estoque do produto.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS wholesale_options JSONB;

COMMENT ON COLUMN products.wholesale_options IS
  'Opções de venda no atacado: [{id, boxQuantity, salePrice}] — preço da caixa inteira';
