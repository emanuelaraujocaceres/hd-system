-- =====================================================================
-- CHECK: Identificar todas as tabelas "sessions" no banco (por schema)
-- =====================================================================

SELECT
  n.nspname AS schema,
  c.relname AS tabela,
  CASE c.relreplident
    WHEN 'd' THEN 'default'
    WHEN 'n' THEN 'nothing'
    WHEN 'f' THEN 'full'
    WHEN 'i' THEN 'index'
  END AS replica_identity,
  CASE WHEN pt.tablename IS NOT NULL THEN 'SIM' ELSE 'NÃO' END AS na_realtime
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_publication_tables pt
  ON pt.pubname = 'supabase_realtime' AND pt.tablename = c.relname AND pt.schemaname = n.nspname
WHERE c.relname = 'sessions'
ORDER BY n.nspname;