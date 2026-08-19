-- Investigar a view vw_dlq_resumo
-- Execute no Supabase SQL Editor

-- 1. Ver a definição da view
SELECT
  viewname,
  definition
FROM pg_views
WHERE viewname = 'vw_dlq_resumo'
  AND schemaname = 'public';

-- 2. Verificar se SECURITY DEFINER está ativo
SELECT
  c.relname AS view_name,
  c.relowner::regrole AS owner,
  CASE
    WHEN c.reloptions::text[] @| ARRAY['security_barrier=true'] THEN 'security_barrier'
    WHEN c.reloptions::text[] @| ARRAY['security_definer=true'] THEN 'security_definer'
    ELSE 'none'
  END AS security_setting,
  c.reloptions
FROM pg_class c
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE c.relkind = 'v'
  AND n.nspname = 'public'
  AND c.relname = 'vw_dlq_resumo';

-- 3. Listar TODAS as views public com SECURITY DEFINER
SELECT
  viewname,
  CASE
    WHEN definition ILIKE '%SECURITY DEFINER%' THEN '❌ SECURITY DEFINER'
    ELSE '✅ OK'
  END AS status
FROM pg_views
WHERE schemaname = 'public'
ORDER BY viewname;
