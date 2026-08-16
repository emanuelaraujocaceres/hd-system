-- CLEANUP_TABLE_DUPLICATES.sql
-- Remove mesas duplicadas por nome dentro da mesma filial.
-- Mantém a mais recente (updatedAt/createdAt maior).
-- Executar no Supabase SQL Editor.

-- 1. Identificar mesas duplicadas por nome+filial
SELECT
  name,
  store_branch_id,
  COUNT(*) AS total,
  ARRAY_AGG(id ORDER BY updated_at DESC NULLS LAST) AS ids
FROM public.tables
WHERE deleted_at IS NULL OR deleted_at IS NULL
GROUP BY name, store_branch_id
HAVING COUNT(*) > 1;

-- 2. Remover duplicatas (manter a mais recente por grupo)
WITH ranked AS (
  SELECT
    id,
    name,
    store_branch_id,
    updated_at,
    ROW_NUMBER() OVER (
      PARTITION BY name, store_branch_id
      ORDER BY updated_at DESC NULLS LAST
    ) AS rn
  FROM public.tables
  WHERE deleted_at IS NULL OR deleted_at IS NULL
)
DELETE FROM public.tables
WHERE id IN (
  SELECT id FROM ranked WHERE rn > 1
);

-- 3. Verificar resultado
SELECT
  name,
  store_branch_id,
  COUNT(*) AS total
FROM public.tables
WHERE deleted_at IS NULL OR deleted_at IS NULL
GROUP BY name, store_branch_id
HAVING COUNT(*) > 1;

-- 4. Criar índice UNIQUE para prevenir futuras duplicatas (nomescase-insensitive por filial)
CREATE UNIQUE INDEX IF NOT EXISTS idx_tables_unique_name_branch
  ON public.tables (LOWER(name), store_branch_id)
  WHERE deleted_at IS NULL;

-- 5. Verificar tables finais
SELECT id, name, number, store_branch_id, updated_at
FROM public.tables
WHERE deleted_at IS NULL OR deleted_at IS NULL
ORDER BY store_branch_id, name;
