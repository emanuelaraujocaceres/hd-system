-- Verificar se movimentacoes_falhas tem store_branch_id
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'movimentacoes_falhas'
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- Verificar policies da view (views não têm policies próprias, usam da tabela base)
SELECT
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'movimentacoes_falhas'
ORDER BY policyname;

-- Ver RLS da tabela base
SELECT
  tablename,
  rowsecurity
FROM pg_tables
WHERE tablename = 'movimentacoes_falhas';
