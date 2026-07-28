-- ============================================================
-- FASE 3: DEAD LETTER QUEUE (DLQ) para Movimentacoes
-- Execute DEPOIS das FASES 1 e 2 no Supabase SQL Editor
-- ============================================================
-- Cria tabela movimentacoes_falhas para registrar operacoes
-- que falharam na sincronizacao, com stack trace e payload.
-- Tambem inclui funcoes para retry e limpeza.
-- ============================================================

-- 3.1 Tabela de movimentacoes que falharam (DLQ)
CREATE TABLE IF NOT EXISTS movimentacoes_falhas (
    id UUID DEFAULT gen_random_uuid(),
    
    -- Contexto da operacao
    operation_type TEXT NOT NULL CHECK (operation_type IN ('INSERT', 'UPDATE', 'DELETE')),
    table_name TEXT NOT NULL,
    record_id TEXT,
    
    -- Dados que falharam
    payload JSONB,
    payload_raw TEXT,
    
    -- Erro
    error_message TEXT,
    error_code TEXT,
    error_status INTEGER,
    stack_trace TEXT,
    
    -- Controle de retry
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    next_retry_at TIMESTAMPTZ,
    
    -- Status
    status TEXT DEFAULT 'pending' CHECK (status IN (
        'pending',      -- Aguardando retry
        'retrying',     -- Em processo de retry
        'resolved',     -- Operacao executada com sucesso
        'discarded',    -- Descartada (dados inconsistentes ou nao-relevantes)
        'manual_review' -- Necessita revisao humana
    )),
    
    -- Metadados
    source TEXT DEFAULT 'sync_queue',    -- De onde veio (sync_queue, realtime, hydration)
    browser_id TEXT,                      -- Identificador do dispositivo/browser
    user_email TEXT,                      -- Usuario que fez a operacao
    organization_id UUID DEFAULT '00000000-0000-0000-0000-000000000001',
    
    -- Auditoria
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_retry_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    resolved_by TEXT,
    resolution_notes TEXT,
    
    PRIMARY KEY (id)
);

-- 3.2 Indices para performance
CREATE INDEX IF NOT EXISTS idx_dlq_status ON movimentacoes_falhas(status);
CREATE INDEX IF NOT EXISTS idx_dlq_table_name ON movimentacoes_falhas(table_name);
CREATE INDEX IF NOT EXISTS idx_dlq_created_at ON movimentacoes_falhas(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dlq_pending_retry ON movimentacoes_falhas(status, next_retry_at) 
    WHERE status = 'pending';

-- 3.3 Funcao: Inserir na DLQ (chamada pelo frontend quando sync falha)
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
) RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO movimentacoes_falhas (
        operation_type,
        table_name,
        record_id,
        payload,
        error_message,
        error_code,
        error_status,
        stack_trace,
        source,
        browser_id,
        user_email,
        next_retry_at
    ) VALUES (
        p_operation_type,
        p_table_name,
        p_record_id,
        p_payload,
        p_error_message,
        p_error_code,
        p_error_status,
        p_stack_trace,
        p_source,
        p_browser_id,
        p_user_email,
        NOW() + INTERVAL '1 minute'  -- Retry em 1 minuto
    )
    RETURNING id INTO v_id;
    
    RAISE NOTICE '📝 Operacao registrada na DLQ: % % (id: %)', 
        p_operation_type, p_table_name, v_id;
    
    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- 3.4 Funcao: Processar retry de uma operacao pendente
CREATE OR REPLACE FUNCTION fn_processar_dlq(
    p_dlq_id UUID
) RETURNS TABLE(
    success BOOLEAN,
    message TEXT
) AS $$
DECLARE
    v_op movimentacoes_falhas%ROWTYPE;
    v_result TEXT;
BEGIN
    -- Buscar a operacao
    SELECT * INTO v_op FROM movimentacoes_falhas WHERE id = p_dlq_id;
    
    IF NOT FOUND THEN
        success := false;
        message := 'Operacao nao encontrada na DLQ';
        RETURN NEXT;
        RETURN;
    END IF;
    
    IF v_op.status = 'resolved' THEN
        success := true;
        message := 'Operacao ja foi resolvida anteriormente';
        RETURN NEXT;
        RETURN;
    END IF;
    
    IF v_op.status = 'discarded' THEN
        success := false;
        message := 'Operacao foi descartada intencionalmente';
        RETURN NEXT;
        RETURN;
    END IF;
    
    IF v_op.retry_count >= v_op.max_retries THEN
        -- Marcar como manual_review
        UPDATE movimentacoes_falhas 
        SET status = 'manual_review',
            last_retry_at = NOW()
        WHERE id = p_dlq_id;
        
        success := false;
        message := format('Maximo de retries (%) atingido — revisao manual necessaria', v_op.max_retries);
        RETURN NEXT;
        RETURN;
    END IF;
    
    -- Marcar como retrying
    UPDATE movimentacoes_falhas 
    SET status = 'retrying',
        retry_count = retry_count + 1,
        last_retry_at = NOW()
    WHERE id = p_dlq_id;
    
    -- Aqui seria feito o retry real da operacao no Supabase
    -- (esta funcao e um framework — o frontend deve chamar
    -- fn_processar_dlq e entao executar a operacao via JS)
    
    success := true;
    message := format('Retry %s/%s registrado. Execute a operacao no frontend e marque como resolved.', 
        v_op.retry_count + 1, v_op.max_retries);
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- 3.5 Funcao: Marcar como resolvida
CREATE OR REPLACE FUNCTION fn_resolver_dlq(
    p_dlq_id UUID,
    p_resolved_by TEXT DEFAULT 'system',
    p_notes TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
BEGIN
    UPDATE movimentacoes_falhas 
    SET status = 'resolved',
        resolved_at = NOW(),
        resolved_by = p_resolved_by,
        resolution_notes = p_notes
    WHERE id = p_dlq_id 
      AND status IN ('pending', 'retrying', 'manual_review');
    
    IF FOUND THEN
        RAISE NOTICE '✅ Operacao % marcada como resolvida por %', p_dlq_id, p_resolved_by;
        RETURN TRUE;
    ELSE
        RAISE NOTICE '⚠️ Operacao % nao encontrada ou ja resolvida', p_dlq_id;
        RETURN FALSE;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 3.6 Funcao: Descartar operacao
CREATE OR REPLACE FUNCTION fn_descartar_dlq(
    p_dlq_id UUID,
    p_discarded_by TEXT DEFAULT 'system',
    p_reason TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
BEGIN
    UPDATE movimentacoes_falhas 
    SET status = 'discarded',
        resolved_at = NOW(),
        resolved_by = p_discarded_by,
        resolution_notes = p_reason
    WHERE id = p_dlq_id 
      AND status != 'discarded';
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- 3.7 Funcao: Limpar operacoes resolvidas/descartadas antigas
CREATE OR REPLACE FUNCTION fn_limpar_dlq_resolvida(
    p_days_old INTEGER DEFAULT 30
) RETURNS INTEGER AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    DELETE FROM movimentacoes_falhas 
    WHERE status IN ('resolved', 'discarded')
      AND resolved_at < NOW() - (p_days_old || ' days')::INTERVAL;
    
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RAISE NOTICE '🧹 % registros antigos removidos da DLQ', v_deleted;
    RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;

-- 3.8 View: Dashboard da DLQ
CREATE OR REPLACE VIEW vw_dlq_resumo AS
SELECT 
    status,
    table_name,
    operation_type,
    count(*) as total,
    count(*) FILTER (WHERE retry_count > 0) as com_retries,
    min(created_at) as mais_antigo,
    max(created_at) as mais_recente
FROM movimentacoes_falhas
GROUP BY status, table_name, operation_type
ORDER BY status, total DESC;

-- 3.9 View: Operacoes pendentes de retry
CREATE OR REPLACE VIEW vw_dlq_pendentes AS
SELECT 
    id,
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

-- 3.10 RLS (desabilitado para manter consistencia com o resto do sistema)
-- Em producao com RLS habilitado, adicionar policies adequadas:
-- ALTER TABLE movimentacoes_falhas ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "org_isolation_dlq" ON movimentacoes_falhas
--     FOR ALL USING (organization_id = current_setting('request.jwt.claims')::jsonb->>'organization_id');

-- 3.11 Verificacao
SELECT 
    'movimentacoes_falhas' as tabela,
    count(*) as total_registros,
    count(*) FILTER (WHERE status = 'pending') as pendentes,
    count(*) FILTER (WHERE status = 'retrying') as em_retry,
    count(*) FILTER (WHERE status = 'resolved') as resolvidas,
    count(*) FILTER (WHERE status = 'discarded') as descartadas,
    count(*) FILTER (WHERE status = 'manual_review') as revisao_manual
FROM movimentacoes_falhas;

RAISE NOTICE '📋 FASE 3 COMPLETA — DLQ implementada com sucesso.';
RAISE NOTICE '   Tabela movimentacoes_falhas criada com indices e funcoes.';
RAISE NOTICE '   Views vw_dlq_resumo e vw_dlq_pendentes disponiveis.';
RAISE NOTICE '   Funcoes: fn_insserir_dlq, fn_processar_dlq, fn_resolver_dlq, fn_descartar_dlq, fn_limpar_dlq_resolvida.';
