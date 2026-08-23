-- =====================================================================
-- CHECK 2026-08-19: Configuração Realtime + REPLICA IDENTITY
-- Execute como UMA ÚNICA query no Supabase SQL Editor
-- =====================================================================

-- 1. Tables na publicação supabase_realtime
SELECT 'REALTIME TABLE' AS tipo, tablename AS nome
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;

-- 2. REPLICA IDENTITY de cada tabela (deve ser FULL para UPDATE/DELETE payload)
SELECT
  c.relname AS tabela,
  CASE c.relreplidentity
    WHEN 'd' THEN 'default (NÃO RECOMENDADO)'
    WHEN 'n' THEN 'nothing (BLOQUEIA payload)'
    WHEN 'f' THEN 'full (OK)'
    WHEN 'i' THEN 'index'
  END AS replica_identity
FROM pg_class c
WHERE c.relnamespace = 'public'::regnamespace
  AND c.relkind = 'r'
ORDER BY c.relname;

-- 3. Tabelas com RLS habilitado mas SEM policies (bloqueia tudo!)
SELECT c.relname AS tabela_rls_sem_policies
FROM pg_class c
WHERE c.relnamespace = 'public'::regnamespace
  AND c.relkind = 'r'
  AND c.relrowsecurity = true
  AND NOT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname = 'public' AND p.tablename = c.relname
  )
ORDER BY c.relname;

-- 4. Tabelas com RLS DESABILITADO (perigoso - dados expostos!)
SELECT c.relname AS tabela_rls_desabilitado
FROM pg_class c
WHERE c.relnamespace = 'public'::regnamespace
  AND c.relkind = 'r'
  AND c.relrowsecurity = false
ORDER BY c.relname;