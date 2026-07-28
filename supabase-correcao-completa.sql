-- ================================================================
-- SCRIPT COMPLETO — VERSAO ROBUSTA (sem erros de substituicao)
-- ================================================================
-- Protecoes aplicadas:
--   - DROP FUNCTION IF EXISTS antes de CREATE (evita conflito de assinatura)
--   - DROP VIEW IF EXISTS antes de CREATE OR REPLACE
--   - DROP TRIGGER IF EXISTS antes de CREATE TRIGGER
--   - RAISE NOTICE sempre dentro de DO $$ ... END $$
--   - Todos os IDs sao TEXT (nunca UUID)
-- ================================================================

-- ============================================================
-- 1. FUNCAO: check_stock_consistency
-- ============================================================
DROP FUNCTION IF EXISTS check_stock_consistency(TEXT);

CREATE OR REPLACE FUNCTION check_stock_consistency(
    p_organization_id TEXT DEFAULT NULL
)
RETURNS TABLE(
    product_id TEXT,
    product_name TEXT,
    current_stock INTEGER,
    calculated_stock INTEGER,
    difference INTEGER,
    status TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH stock_calc AS (
        SELECT 
            p.id::TEXT AS id,
            p.name::TEXT AS name,
            COALESCE(p.stock_quantity, 0)::INTEGER AS current_stock,
            COALESCE(SUM(
                CASE 
                    WHEN sm.type IN ('in', 'IN') THEN sm.quantity
                    WHEN sm.type IN ('out', 'OUT') THEN -sm.quantity
                    WHEN sm.type IN ('loss', 'LOSS') THEN -sm.quantity
                    ELSE 0
                END
            ), 0)::INTEGER AS calculated_stock
        FROM products p
        LEFT JOIN stock_movements sm ON p.id::TEXT = sm.product_id::TEXT
        WHERE (p_organization_id IS NULL OR p.organization_id::TEXT = p_organization_id)
        GROUP BY p.id, p.name, p.stock_quantity
    )
    SELECT 
        sc.id::TEXT,
        sc.name::TEXT,
        sc.current_stock::INTEGER,
        sc.calculated_stock::INTEGER,
        (sc.current_stock - sc.calculated_stock)::INTEGER AS difference,
        CASE 
            WHEN sc.current_stock = sc.calculated_stock THEN 'CONSISTENTE'::TEXT
            WHEN sc.current_stock > sc.calculated_stock THEN 'SUPERAVIT'::TEXT
            ELSE 'DEFICIT'::TEXT
        END::TEXT AS status
    FROM stock_calc sc
    WHERE sc.current_stock != sc.calculated_stock
    ORDER BY ABS(sc.current_stock - sc.calculated_stock) DESC;
END;
$$;

-- ============================================================
-- 2. FUNCAO: process_sale_transaction
-- ============================================================
DROP FUNCTION IF EXISTS process_sale_transaction(
    TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, 
    TEXT, TEXT, JSONB, TEXT, TEXT
);

CREATE OR REPLACE FUNCTION process_sale_transaction(
    p_sale_id TEXT,
    p_product_id TEXT,
    p_quantity INTEGER,
    p_unit_price NUMERIC,
    p_discount NUMERIC DEFAULT 0,
    p_total NUMERIC DEFAULT NULL,
    p_reason TEXT DEFAULT 'Venda PDV',
    p_operator_name TEXT DEFAULT 'Sistema',
    p_sale_items JSONB DEFAULT NULL,
    p_organization_id TEXT DEFAULT '00000000-0000-0000-0000-000000000001',
    p_store_branch_id TEXT DEFAULT NULL
)
RETURNS TABLE(
    success BOOLEAN,
    message TEXT,
    new_stock INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_current_stock INTEGER;
    v_new_stock INTEGER;
    v_product_name TEXT;
    v_total NUMERIC;
    v_item JSONB;
BEGIN
    -- Lock pessimistico
    SELECT stock_quantity, name
    INTO v_current_stock, v_product_name
    FROM products
    WHERE id::TEXT = p_product_id::TEXT
    FOR UPDATE;

    IF NOT FOUND THEN
        success := FALSE;
        message := 'Produto nao encontrado: ' || p_product_id;
        new_stock := 0;
        RETURN NEXT;
        RETURN;
    END IF;

    v_total := COALESCE(p_total, (p_unit_price * p_quantity) - p_discount);

    IF v_current_stock < p_quantity THEN
        success := FALSE;
        message := 'Estoque insuficiente para ' || v_product_name 
                   || ': disponivel=' || v_current_stock 
                   || ', solicitado=' || p_quantity;
        new_stock := v_current_stock;
        RETURN NEXT;
        RETURN;
    END IF;

    v_new_stock := v_current_stock - p_quantity;

    UPDATE products 
    SET stock_quantity = v_new_stock,
        updated_at = NOW()
    WHERE id::TEXT = p_product_id::TEXT;

    INSERT INTO stock_movements (
        id, organization_id, store_branch_id,
        product_id, product_name, type, quantity,
        previous_stock, new_stock, reason, operator_name
    ) VALUES (
        'mov-' || EXTRACT(EPOCH FROM NOW())::BIGINT || '-' || substring(md5(random()::TEXT), 1, 6),
        p_organization_id, p_store_branch_id,
        p_product_id, v_product_name, 'out', p_quantity,
        v_current_stock, v_new_stock, p_reason, p_operator_name
    );

    IF p_sale_items IS NOT NULL AND jsonb_array_length(p_sale_items) > 0 THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_sale_items)
        LOOP
            PERFORM * FROM process_sale_transaction(
                p_sale_id,
                (v_item->>'product_id')::TEXT,
                (v_item->>'quantity')::INTEGER,
                (v_item->>'unit_price')::NUMERIC,
                COALESCE((v_item->>'discount')::NUMERIC, 0),
                (v_item->>'total')::NUMERIC,
                p_reason, p_operator_name,
                NULL, p_organization_id, p_store_branch_id
            );
        END LOOP;
    END IF;

    success := TRUE;
    message := 'Venda ok. Estoque: ' || v_current_stock || ' -> ' || v_new_stock;
    new_stock := v_new_stock;
    RETURN NEXT;
END;
$$;

-- ============================================================
-- 3. FUNCAO: ajustar_estoque
-- ============================================================
DROP FUNCTION IF EXISTS ajustar_estoque(
    TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT
);

CREATE OR REPLACE FUNCTION ajustar_estoque(
    p_product_id TEXT,
    p_quantity INTEGER,
    p_type TEXT DEFAULT 'in',
    p_reason TEXT DEFAULT 'Ajuste manual',
    p_operator_name TEXT DEFAULT 'Sistema',
    p_organization_id TEXT DEFAULT '00000000-0000-0000-0000-000000000001'
)
RETURNS TABLE(
    success BOOLEAN,
    message TEXT,
    previous_stock INTEGER,
    new_stock INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_current_stock INTEGER;
    v_new_stock INTEGER;
    v_product_name TEXT;
    v_final_type TEXT;
BEGIN
    SELECT stock_quantity, name
    INTO v_current_stock, v_product_name
    FROM products
    WHERE id::TEXT = p_product_id::TEXT
    FOR UPDATE;

    IF NOT FOUND THEN
        success := FALSE;
        message := 'Produto nao encontrado: ' || p_product_id;
        previous_stock := 0;
        new_stock := 0;
        RETURN NEXT;
        RETURN;
    END IF;

    v_final_type := LOWER(p_type);
    IF v_final_type NOT IN ('in', 'out', 'adjustment', 'loss') THEN
        v_final_type := 'in';
    END IF;

    v_new_stock := CASE
        WHEN v_final_type = 'in' THEN v_current_stock + ABS(p_quantity)
        WHEN v_final_type = 'out' THEN GREATEST(0, v_current_stock - ABS(p_quantity))
        WHEN v_final_type = 'loss' THEN GREATEST(0, v_current_stock - ABS(p_quantity))
        WHEN v_final_type = 'adjustment' THEN p_quantity
        ELSE v_current_stock
    END;

    UPDATE products
    SET stock_quantity = v_new_stock, updated_at = NOW()
    WHERE id::TEXT = p_product_id::TEXT;

    INSERT INTO stock_movements (
        id, organization_id, product_id, product_name,
        type, quantity, previous_stock, new_stock,
        reason, operator_name
    ) VALUES (
        'mov-' || EXTRACT(EPOCH FROM NOW())::BIGINT || '-' || substring(md5(random()::TEXT), 1, 6),
        p_organization_id, p_product_id, v_product_name,
        v_final_type, ABS(p_quantity), v_current_stock,
        v_new_stock, p_reason, p_operator_name
    );

    success := TRUE;
    message := 'Estoque ajustado: ' || v_current_stock || ' -> ' || v_new_stock;
    previous_stock := v_current_stock;
    new_stock := v_new_stock;
    RETURN NEXT;
END;
$$;

-- ============================================================
-- 4. FUNCAO: fn_insserir_dlq
-- ============================================================
DROP FUNCTION IF EXISTS fn_insserir_dlq(
    TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT
);

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
) RETURNS TEXT AS $$
DECLARE
    v_id TEXT;
BEGIN
    v_id := 'dlq-' || EXTRACT(EPOCH FROM NOW())::BIGINT || '-' || substring(md5(random()::TEXT), 1, 6);

    INSERT INTO movimentacoes_falhas (
        id, operation_type, table_name, record_id,
        payload, error_message, error_code, error_status,
        stack_trace, source, browser_id, user_email,
        next_retry_at
    ) VALUES (
        v_id, p_operation_type, p_table_name, p_record_id,
        p_payload, p_error_message, p_error_code, p_error_status,
        p_stack_trace, p_source, p_browser_id, p_user_email,
        NOW() + INTERVAL '1 minute'
    );

    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 5. FUNCAO: process_dlq
-- ============================================================
DROP FUNCTION IF EXISTS process_dlq(TEXT);

CREATE OR REPLACE FUNCTION process_dlq(
    p_dlq_id TEXT
) RETURNS TABLE(
    success BOOLEAN,
    message TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_op RECORD;
BEGIN
    SELECT * INTO v_op FROM movimentacoes_falhas WHERE id = p_dlq_id;

    IF NOT FOUND THEN
        success := FALSE;
        message := 'Operacao nao encontrada na DLQ';
        RETURN NEXT;
        RETURN;
    END IF;

    IF v_op.status = 'resolved' THEN
        success := TRUE;
        message := 'Operacao ja resolvida';
        RETURN NEXT;
        RETURN;
    END IF;

    IF v_op.retry_count >= v_op.max_retries THEN
        UPDATE movimentacoes_falhas 
        SET status = 'manual_review', last_retry_at = NOW()
        WHERE id = p_dlq_id;
        success := FALSE;
        message := 'Maximo de retries atingido — revisao manual';
        RETURN NEXT;
        RETURN;
    END IF;

    UPDATE movimentacoes_falhas 
    SET status = 'retrying',
        retry_count = retry_count + 1,
        last_retry_at = NOW()
    WHERE id = p_dlq_id;

    success := TRUE;
    message := 'Retry registrado.';
    RETURN NEXT;
END;
$$;

-- ============================================================
-- 6. TRIGGER: Impedir estoque negativo
-- ============================================================
DROP TRIGGER IF EXISTS trigger_stock_not_negative ON products;
DROP FUNCTION IF EXISTS fn_prevent_negative_stock();

CREATE OR REPLACE FUNCTION fn_prevent_negative_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.stock_quantity < 0 THEN
        RAISE EXCEPTION 'Estoque nao pode ser negativo. Produto: %, Tentativa: %', 
            NEW.name, NEW.stock_quantity;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_stock_not_negative
    BEFORE UPDATE OF stock_quantity ON products
    FOR EACH ROW
    EXECUTE FUNCTION fn_prevent_negative_stock();

-- ============================================================
-- 7. TRIGGER: Log de mudancas de estoque
-- ============================================================
DROP TRIGGER IF EXISTS trigger_log_stock_changes ON products;
DROP FUNCTION IF EXISTS fn_log_stock_changes();

CREATE OR REPLACE FUNCTION fn_log_stock_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.stock_quantity IS DISTINCT FROM NEW.stock_quantity THEN
        INSERT INTO stock_movements (
            id, organization_id, product_id, product_name,
            type, quantity, previous_stock, new_stock,
            reason, operator_name
        ) VALUES (
            'log-' || EXTRACT(EPOCH FROM NOW())::BIGINT || '-' || substring(md5(random()::TEXT), 1, 6),
            COALESCE(NEW.organization_id::TEXT, '00000000-0000-0000-0000-000000000001'),
            NEW.id::TEXT,
            NEW.name::TEXT,
            'adjustment',
            ABS(NEW.stock_quantity - OLD.stock_quantity),
            OLD.stock_quantity,
            NEW.stock_quantity,
            'Trigger: mudanca de estoque detectada',
            'system'
        );
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_log_stock_changes
    AFTER UPDATE OF stock_quantity ON products
    FOR EACH ROW
    WHEN (OLD.stock_quantity IS DISTINCT FROM NEW.stock_quantity)
    EXECUTE FUNCTION fn_log_stock_changes();

-- ============================================================
-- 8. VIEW: Resumo da DLQ
--    IMPORTANTE: DROP antes de CREATE para evitar erro de
--    "cannot change name of view column"
-- ============================================================
DROP VIEW IF EXISTS vw_dlq_resumo;

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

-- ============================================================
-- 9. VIEW: Pendentes de retry
-- ============================================================
DROP VIEW IF EXISTS vw_dlq_pendentes;

CREATE OR REPLACE VIEW vw_dlq_pendentes AS
SELECT 
    id, operation_type, table_name, record_id,
    error_message, error_status, retry_count, max_retries,
    next_retry_at, created_at, source, user_email
FROM movimentacoes_falhas
WHERE status = 'pending'
  AND (next_retry_at IS NULL OR next_retry_at <= NOW())
ORDER BY created_at ASC;

-- ============================================================
-- 10. VERIFICACAO FINAL
-- ============================================================

-- 10a. Testar funcao de consistencia
SELECT * FROM check_stock_consistency(NULL) LIMIT 5;

-- 10b. Listar funcoes
SELECT proname as funcao
FROM pg_proc 
WHERE proname IN (
    'check_stock_consistency',
    'process_sale_transaction',
    'ajustar_estoque',
    'fn_insserir_dlq',
    'process_dlq',
    'fn_prevent_negative_stock',
    'fn_log_stock_changes'
)
ORDER BY proname;

-- 10c. Listar triggers
SELECT 
    tgname as trigger_name,
    tgrelid::regclass as tabela
FROM pg_trigger
WHERE tgname IN (
    'trigger_stock_not_negative',
    'trigger_log_stock_changes'
)
ORDER BY tgname;

-- 10d. Listar views
SELECT viewname
FROM pg_views
WHERE viewname IN ('vw_dlq_resumo', 'vw_dlq_pendentes')
ORDER BY viewname;

-- 10e. Verificar tabelas auxiliares
SELECT 
    tablename,
    CASE WHEN EXISTS (SELECT 1 FROM pg_class WHERE relname = tablename) 
         THEN 'EXISTS' ELSE 'MISSING' END as status
FROM (VALUES 
    ('movimentacoes_falhas'),
    ('stock_change_log'),
    ('sync_queue'),
    ('reconciliation_log')
) AS t(tablename);

-- 10f. Verificar RLS
SELECT 
    c.relname as tabela,
    c.relrowsecurity as rls_ativo
FROM pg_class c
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN ('products', 'stock_movements', 'movimentacoes_falhas')
ORDER BY c.relname;

-- 10g. Mensagem final (dentro de DO block)
DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'SCRIPT COMPLETO EXECUTADO COM SUCESSO';
    RAISE NOTICE 'Verifique os resultados acima.';
    RAISE NOTICE '========================================';
END $$;
