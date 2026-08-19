-- ============================================================
-- FIX: Remover SECURITY DEFINER de vw_dlq_resumo
-- O Supabase alertou que esta view tem security_definer = true
-- Isso permite que qualquer pessoa leia dados de todas as
-- organizações, ignorando RLS completamente.
-- ============================================================

-- 1. Verificar qual view tem SECURITY DEFINER
SELECT
  c.relname AS view_name,
  c.reloptions
FROM pg_class c
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE c.relkind = 'v'
  AND n.nspname = 'public'
  AND c.reloptions::text LIKE '%security_definer%';

-- 2. Dropar e recriar vw_dlq_resumo SEM security_definer
DROP VIEW IF EXISTS public.vw_dlq_resumo;

CREATE OR REPLACE VIEW public.vw_dlq_resumo AS
SELECT
    status,
    table_name,
    operation_type,
    count(*) as total,
    count(*) FILTER (WHERE retry_count > 0) as com_retries,
    min(created_at) as mais_antigo,
    max(created_at) as mais_recente
FROM movimentacoes_falhas
GROUP BY status, table_name, operation_type
ORDER BY status, total DESC;

-- 3. Verificar se vw_dlq_pendentes também tem security_definer
SELECT
  c.relname AS view_name,
  c.reloptions
FROM pg_class c
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE c.relkind = 'v'
  AND n.nspname = 'public'
  AND c.relname IN ('vw_dlq_resumo', 'vw_dlq_pendentes');

-- 4. Verificar TODAS as views com security_definer (catch-all)
SELECT
  n.nspname AS schema_name,
  c.relname AS view_name,
  c.reloptions
FROM pg_class c
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE c.relkind = 'v'
  AND c.reloptions::text LIKE '%security_definer%'
ORDER BY n.nspname, c.relname;

-- 5. Verificação final — confirmar que a view recriada NÃO tem security_definer
SELECT
  c.relname AS view_name,
  c.reloptions,
  CASE
    WHEN c.reloptions::text LIKE '%security_definer%' THEN '❌ AINDA TEM security_definer'
    ELSE '✅ SEM security_definer'
  END AS status
FROM pg_class c
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE c.relkind = 'v'
  AND n.nspname = 'public'
  AND c.relname IN ('vw_dlq_resumo', 'vw_dlq_pendentes');
