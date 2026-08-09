-- Verificar REPLICA IDENTITY da tabela tables (forma correta)
SELECT c.relname, c.relreplident, 
       CASE c.relreplident 
         WHEN 'd' THEN 'DEFAULT' 
         WHEN 'n' THEN 'NONE' 
         WHEN 'f' THEN 'FULL' 
         WHEN 'i' THEN 'INDEX' 
       END as replica_identity_desc
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relname = 'tables' AND n.nspname = 'public';

-- Verificar se há triggers na tabela tables
SELECT trigger_name, event_manipulation, action_statement
FROM information_schema.triggers
WHERE event_object_table = 'tables' AND event_object_schema = 'public';
