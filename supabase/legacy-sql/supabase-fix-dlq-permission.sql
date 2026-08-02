-- ==============================================================================
-- Fix: Permissão da fn_insserir_dlq (Dead Letter Queue)
-- Causa: O frontend tenta logar erros de upsert na DLQ via RPC, mas a função
--        não tem GRANT EXECUTE para o role authenticated.
-- Sintoma: 403 Forbidden ao chamar fn_insserir_dlq
-- ==============================================================================

-- Garantir que a função existe com a assinatura correta
CREATE OR REPLACE FUNCTION fn_insserir_dlq(
  p_operation_type TEXT,
  p_table_name TEXT,
  p_record_id TEXT DEFAULT NULL,
  p_payload JSONB DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL,
  p_error_code TEXT DEFAULT NULL,
  p_error_status INTEGER DEFAULT NULL,
  p_stack_trace TEXT DEFAULT NULL,
  p_source TEXT DEFAULT 'sync_queue',
  p_browser_id TEXT DEFAULT NULL,
  p_user_email TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_id UUID;
BEGIN
  v_id := gen_random_uuid();
  INSERT INTO movimentacoes_falhas (
    id, operation_type, table_name, record_id, payload,
    error_message, error_code, error_status, stack_trace,
    source, browser_id, user_email, next_retry_at
  ) VALUES (
    v_id, p_operation_type, p_table_name, p_record_id, p_payload,
    p_error_message, p_error_code, p_error_status, p_stack_trace,
    p_source, p_browser_id, p_user_email, NOW() + INTERVAL '1 minute'
  );
  RETURN v_id;
END;
$$;

-- 🔑 CONCEDE EXECUÇÃO para usuários autenticados
GRANT EXECUTE ON FUNCTION fn_insserir_dlq TO authenticated;

-- Verificação
SELECT 'fn_insserir_dlq' AS funcao,
       has_function_privilege('authenticated', 'fn_insserir_dlq(text,text,text,jsonb,text,text,int,text,text,text,text)', 'EXECUTE') AS autenticados_podem_executar;
