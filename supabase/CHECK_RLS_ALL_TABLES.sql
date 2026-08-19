-- Verificar TODAS as tabelas public sem RLS habilitado
-- Execute no Supabase SQL Editor

SELECT
  schemaname,
  tablename,
  CASE
    WHEN rowsecurity = true THEN '✅ RLS habilitado'
    ELSE '❌ RLS DESABILITADO - CORRIGIR!'
  END AS status
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY rowsecurity ASC, tablename;
