-- Verificar se tables está na publicação supabase_realtime
SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'tables';

-- Verificar REPLICA IDENTITY da tabela tables
SELECT relreplident FROM pg_class WHERE relname = 'tables';

-- Verificar dados da tabela tables
SELECT id, name, number, status, store_branch_id, organization_id FROM tables ORDER BY created_at DESC LIMIT 5;

-- Contar mesas por filial
SELECT store_branch_id, count(*) as total_mesas FROM tables GROUP BY store_branch_id;
