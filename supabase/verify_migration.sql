-- ============================================================
-- VERIFICAÇÃO COMPLETA PÓS-MIGRATION
-- Execute cada bloco separadamente no Supabase SQL Editor
-- ============================================================

-- ═══════════════════════════════════════════════════════════
-- BLOCO 1: Verificar colunas em products
-- ═══════════════════════════════════════════════════════════
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'products' 
  AND column_name IN ('expiration_date', 'is_composite')
ORDER BY column_name;

-- Esperado:
-- expiration_date | date | YES | NULL
-- is_composite    | boolean | YES | false


-- ═══════════════════════════════════════════════════════════
-- BLOCO 2: Verificar tabela product_recipes
-- ═══════════════════════════════════════════════════════════
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'product_recipes'
ORDER BY ordinal_position;

-- Esperado: 10 colunas (id, organization_id, store_branch_id, composite_product_id,
-- ingredient_product_id, ingredient_name, quantity, unit, created_at, updated_at)


-- ═══════════════════════════════════════════════════════════
-- BLOCO 3: Verificar RLS habilitado em product_recipes
-- ═══════════════════════════════════════════════════════════
SELECT 
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE tablename = 'product_recipes';

-- Esperado: rowsecurity = true


-- ═══════════════════════════════════════════════════════════
-- BLOCO 4: Verificar policies de RLS em product_recipes
-- ═══════════════════════════════════════════════════════════
SELECT 
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'product_recipes'
ORDER BY policyname;

-- Esperado: 4 policies (select, insert, update, delete)


-- ═══════════════════════════════════════════════════════════
-- BLOCO 5: Verificar publicação realtime
-- ═══════════════════════════════════════════════════════════
SELECT 
  pubname,
  tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND tablename = 'product_recipes';

-- Esperado: 1 registro com product_recipes


-- ═══════════════════════════════════════════════════════════
-- BLOCO 6: Verificar replica identity
-- ═══════════════════════════════════════════════════════════
SELECT 
  relname,
  relreplident,
  CASE relreplident
    WHEN 'd' THEN 'DEFAULT'
    WHEN 'n' THEN 'NOTHING'
    WHEN 'f' THEN 'FULL'
    WHEN 'i' THEN 'INDEX'
  END as replica_type
FROM pg_class
WHERE relname = 'product_recipes';

-- Esperado: relreplident = 'f' (FULL)


-- ═══════════════════════════════════════════════════════════
-- BLOCO 7: Verificar índices
-- ═══════════════════════════════════════════════════════════
SELECT 
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'product_recipes'
ORDER BY indexname;

-- Esperado: 4 índices (PK, 3 customizados + 1 UNIQUE)


-- ═══════════════════════════════════════════════════════════
-- BLOCO 8: Verificar constraint UNIQUE
-- ═══════════════════════════════════════════════════════════
SELECT
  conname,
  contype,
  pg_get_constraintdef(oid) as definition
FROM pg_constraint
WHERE conrelid = 'product_recipes'::regclass;

-- Esperado: constraint UNIQUE em (composite_product_id, ingredient_product_id)


-- ═══════════════════════════════════════════════════════════
-- BLOCO 9: Verificar foreign keys
-- ═══════════════════════════════════════════════════════════
SELECT
  tc.constraint_name,
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name,
  rc.delete_rule
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
JOIN information_schema.referential_constraints AS rc
  ON rc.constraint_name = tc.constraint_name
WHERE tc.table_name = 'product_recipes';

-- Esperado: 3 FKs (organization_id→organizations, store_branch_id→store_branches,
-- composite_product_id→products, ingredient_product_id→products)


-- ═══════════════════════════════════════════════════════════
-- BLOCO 10: Verificar contagem de tabelas na realtime
-- ═══════════════════════════════════════════════════════════
SELECT COUNT(*) as total_realtime_tables
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime';

-- Esperado: ~22+ tabelas (incluindo product_recipes)


-- ═══════════════════════════════════════════════════════════
-- BLOCO 11: Teste prático - inserir um produto composto fictício
-- (OPCIONAL - só para testar que a tabela funciona)
-- ═══════════════════════════════════════════════════════════
-- INSERT INTO product_recipes (
--   organization_id,
--   composite_product_id,
--   ingredient_product_id,
--   ingredient_name,
--   quantity,
--   unit
-- ) VALUES (
--   '00000000-0000-0000-0000-000000000001',  -- org padrão
--   '<ID_PRODUTO_COMPOSTO>',                   -- substitua
--   '<ID_INGREDIENTE>',                        -- substitua
--   'Teste Ingrediente',
--   0.25,
--   'un'
-- );
-- -- Depois DELETE para limpar:
-- -- DELETE FROM product_recipes WHERE ingredient_name = 'Teste Ingrediente';


-- ═══════════════════════════════════════════════════════════
-- BLOCO 12: Verificar view vw_report_sale_items
-- ═══════════════════════════════════════════════════════════
SELECT 
  viewname,
  security_invoker
FROM pg_views
WHERE viewname = 'vw_report_sale_items';

-- Esperado: security_invoker = true


-- ═══════════════════════════════════════════════════════════
-- RESUMO: Query única que mostra status geral
-- ═══════════════════════════════════════════════════════════
SELECT '--- STATUS GERAL ---' as info;

SELECT 
  'Tabelas na realtime' as item,
  COUNT(*)::text as valor
FROM pg_publication_tables WHERE pubname = 'supabase_realtime'

UNION ALL

SELECT 
  'product_recipes existe' as item,
  CASE WHEN EXISTS(SELECT 1 FROM pg_tables WHERE tablename = 'product_recipes') 
    THEN '✅ SIM' ELSE '❌ NÃO' END as valor

UNION ALL

SELECT 
  'products.expiration_date existe' as item,
  CASE WHEN EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='expiration_date') 
    THEN '✅ SIM' ELSE '❌ NÃO' END as valor

UNION ALL

SELECT 
  'products.is_composite existe' as item,
  CASE WHEN EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='is_composite') 
    THEN '✅ SIM' ELSE '❌ NÃO' END as valor

UNION ALL

SELECT 
  'RLS product_recipes habilitado' as item,
  CASE WHEN (SELECT rowsecurity FROM pg_tables WHERE tablename='product_recipes') = true
    THEN '✅ SIM' ELSE '❌ NÃO' END as valor

UNION ALL

SELECT 
  'Replica Identity FULL' as item,
  CASE WHEN (SELECT relreplident FROM pg_class WHERE relname='product_recipes') = 'f'
    THEN '✅ SIM' ELSE '❌ NÃO' END as valor

UNION ALL

SELECT 
  'product_recipes na realtime' as item,
  CASE WHEN EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='product_recipes')
    THEN '✅ SIM' ELSE '❌ NÃO' END as valor;
