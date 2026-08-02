-- ================================================================
-- HD-SYSTEM: Adicionar colunas faltantes — v2
-- Execute no Supabase Dashboard > SQL Editor
-- ================================================================

-- 1. Colunas faltantes em products
ALTER TABLE products ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS tv_promo_price NUMERIC DEFAULT NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS tv_highlight_tag TEXT DEFAULT NULL;

-- 2. Coluna faltante em sale_items (product_name já existe pelo script v1,
--    mas garantimos)
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS product_name TEXT;

-- 3. Colunas que o frontend envia para system_users
ALTER TABLE system_users ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}';
ALTER TABLE system_users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 4. Coluna faltante em system_settings
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}';
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 5. Verificar que as colunas existem agora
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND column_name IN ('category', 'tv_promo_price', 'tv_highlight_tag', 
                      'permissions', 'avatar_url', 'settings')
ORDER BY table_name, column_name;

SELECT '✅ Colunas adicionadas com sucesso!' AS resultado;
