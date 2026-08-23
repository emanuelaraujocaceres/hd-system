-- =====================================================================
-- CHECK 2026-08-19: Colunas das tables que faltam policies
-- Execute como UMA query no Supabase SQL Editor
-- =====================================================================

SELECT
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'audit_log', 'profiles', 'sessions', 'sync_queue',
    'user_permissions', 'webhook_events', 'ai_insights', 'company_settings'
  )
  AND column_name IN ('organization_id', 'store_branch_id', 'id')
ORDER BY table_name, column_name;