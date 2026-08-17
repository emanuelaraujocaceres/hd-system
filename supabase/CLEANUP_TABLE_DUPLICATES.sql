-- CLEANUP_TABLE_DUPLICATES.sql v3
-- Abordagem: fechar sessions ativas nas duplicatas → deletar duplicatas → criar índice
-- Cada query é independente. Execute uma por vez no SQL Editor.

-- ══════════════════════════════════════════════════════════════════════
-- QUERY 1: Diagnóstico — ver sessions ativas por mesa (duplicatas)
-- Mostra quantas sessions ativas existem nas mesas que não são keeper
-- ══════════════════════════════════════════════════════════════════════
SELECT
  cs.id AS session_id,
  cs.table_id,
  t.name AS table_name,
  cs.status AS session_status,
  cs.opened_at,
  cs.customer_name
FROM public.customer_sessions cs
JOIN public.tables t ON t.id = cs.table_id
WHERE cs.status = 'active'
  AND t.store_branch_id = 'e5085eba-4398-4c31-ae13-8082b46561ee'
ORDER BY t.name, cs.opened_at;


-- ══════════════════════════════════════════════════════════════════════
-- QUERY 2: Fechar (cancelled) todas as sessions ativas nas duplicatas
-- Mantém APENAS a session do keeper (mesa mais recente de cada grupo)
-- ══════════════════════════════════════════════════════════════════════
UPDATE public.customer_sessions cs
SET status = 'cancelled', closed_at = now()
WHERE cs.status = 'active'
  AND cs.table_id IN (
    SELECT dup.id
    FROM (
      SELECT DISTINCT ON (t.name, t.store_branch_id)
        t.id, t.name, t.store_branch_id
      FROM public.tables t
      ORDER BY t.name, t.store_branch_id, t.updated_at DESC NULLS LAST
    ) k
    JOIN public.tables dup ON dup.name = k.name AND dup.store_branch_id = k.store_branch_id
    WHERE dup.id <> k.id
  );


-- ══════════════════════════════════════════════════════════════════════
-- QUERY 3: Deletar sessions restantes nas duplicatas (completed/cancelled)
-- Só sobram sessions não-ativas (já canceladas na query anterior)
-- ══════════════════════════════════════════════════════════════════════
DELETE FROM public.customer_sessions
WHERE table_id IN (
  SELECT dup.id
  FROM (
    SELECT DISTINCT ON (t.name, t.store_branch_id)
      t.id, t.name, t.store_branch_id
    FROM public.tables t
    ORDER BY t.name, t.store_branch_id, t.updated_at DESC NULLS LAST
  ) k
  JOIN public.tables dup ON dup.name = k.name AND dup.store_branch_id = k.store_branch_id
  WHERE dup.id <> k.id
);


-- ══════════════════════════════════════════════════════════════════════
-- QUERY 4: Deletar mesas duplicadas (keeper já identificado)
-- Agora sem FK constraint bloqueando
-- ══════════════════════════════════════════════════════════════════════
DELETE FROM public.tables
WHERE id IN (
  SELECT dup.id
  FROM (
    SELECT DISTINCT ON (t.name, t.store_branch_id)
      t.id, t.name, t.store_branch_id
    FROM public.tables t
    ORDER BY t.name, t.store_branch_id, t.updated_at DESC NULLS LAST
  ) k
  JOIN public.tables dup ON dup.name = k.name AND dup.store_branch_id = k.store_branch_id
  WHERE dup.id <> k.id
);


-- ══════════════════════════════════════════════════════════════════════
-- QUERY 5: Verificar resultado (0 linhas = sem duplicatas)
-- ══════════════════════════════════════════════════════════════════════
SELECT name, store_branch_id, COUNT(*) AS total
FROM public.tables
GROUP BY name, store_branch_id
HAVING COUNT(*) > 1;


-- ══════════════════════════════════════════════════════════════════════
-- QUERY 6: Criar índice UNIQUE (previne futuras duplicatas)
-- ══════════════════════════════════════════════════════════════════════
CREATE UNIQUE INDEX IF NOT EXISTS idx_tables_unique_name_branch
  ON public.tables (LOWER(name), store_branch_id)
  WHERE store_branch_id IS NOT NULL;


-- ══════════════════════════════════════════════════════════════════════
-- QUERY 7: Verificar mesas finais
-- ══════════════════════════════════════════════════════════════════════
SELECT id, name, number, qr_token, store_branch_id, organization_id, updated_at
FROM public.tables
ORDER BY store_branch_id, name;
