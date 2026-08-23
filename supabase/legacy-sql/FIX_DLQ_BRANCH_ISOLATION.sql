-- ============================================================
-- FIX: vw_dlq_resumo — adicionar store_branch_id ao GROUP BY
-- Isso garante isolamento por filial na view, mesmo se RLS falhar
-- ============================================================

-- 1. Verificar a view atual
SELECT
  viewname,
  definition
FROM pg_views
WHERE viewname = 'vw_dlq_resumo'
  AND schemaname = 'public';

-- 2. Dropar e recriar COM store_branch_id
DROP VIEW IF EXISTS public.vw_dlq_resumo;

CREATE OR REPLACE VIEW public.vw_dlq_resumo AS
SELECT
    organization_id,
    store_branch_id,
    status,
    count(*) AS total,
    min(created_at) AS oldest_failure,
    max(created_at) AS newest_failure,
    count(DISTINCT table_name) AS tables_affected
FROM movimentacoes_falhas
GROUP BY organization_id, store_branch_id, status
ORDER BY organization_id, store_branch_id, status;

-- 3. Verificar também a vw_dlq_pendentes
SELECT
  viewname,
  definition
FROM pg_views
WHERE viewname = 'vw_dlq_pendentes'
  AND schemaname = 'public';

-- 4. Se vw_dlq_pendentes também agrupar só por organization_id, corrigir
-- (ela não tem GROUP BY, mas pode estar filtrando errado)
DROP VIEW IF EXISTS public.vw_dlq_pendentes;

CREATE OR REPLACE VIEW public.vw_dlq_pendentes AS
SELECT
    id,
    organization_id,
    store_branch_id,
    operation_type,
    table_name,
    record_id,
    error_message,
    error_status,
    retry_count,
    max_retries,
    next_retry_at,
    created_at,
    source,
    user_email
FROM movimentacoes_falhas
WHERE status = 'pending'
  AND (next_retry_at IS NULL OR next_retry_at <= NOW())
ORDER BY created_at ASC;

-- 5. Verificação final
SELECT
  viewname,
  definition
FROM pg_views
WHERE viewname IN ('vw_dlq_resumo', 'vw_dlq_pendentes')
  AND schemaname = 'public'
ORDER BY viewname;
