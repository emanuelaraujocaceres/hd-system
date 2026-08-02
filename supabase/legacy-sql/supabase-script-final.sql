-- ================================================================
-- HD-SYSTEM: SCRIPT FINAL — Cria RPCs + Permissões
-- Cole TUDO no Supabase Dashboard > SQL Editor e execute
-- Pode rodar quantas vezes quiser (seguro — usa IF NOT EXISTS)
-- ================================================================

-- ============================================================
-- 1. GARANTIR QUE AS TABELAS AUXILIARES EXISTEM
-- ============================================================
CREATE TABLE IF NOT EXISTS movimentacoes_falhas (
    id TEXT PRIMARY KEY,
    operation_type TEXT NOT NULL,
    table_name TEXT NOT NULL,
    record_id TEXT,
    payload JSONB,
    error_message TEXT,
    error_code TEXT,
    error_status INTEGER,
    stack_trace TEXT,
    source TEXT DEFAULT 'sync_queue',
    browser_id TEXT,
    user_email TEXT,
    organization_id TEXT DEFAULT '00000000-0000-0000-0000-000000000001',
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    next_retry_at TIMESTAMPTZ,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_retry_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    resolved_by TEXT,
    resolution_notes TEXT
);

CREATE TABLE IF NOT EXISTS stock_change_log (
    id TEXT PRIMARY KEY,
    product_id TEXT,
    field_name TEXT,
    old_value TEXT,
    new_value TEXT,
    changed_at TIMESTAMPTZ DEFAULT NOW(),
    changed_by TEXT
);

CREATE TABLE IF NOT EXISTS sync_queue (
    id TEXT PRIMARY KEY,
    table_name TEXT NOT NULL,
    record_id TEXT,
    operation TEXT NOT NULL,
    payload JSONB,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

-- ============================================================
-- 2. PERMISSÕES — anon + service_role
-- ============================================================
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- ============================================================
-- 3. FUNÇÃO: ajustar_estoque
-- Chamada pelo frontend em storageService.updateStock()
-- Parâmetros: p_product_id, p_quantity, p_type, p_reason, p_operator_name
-- ============================================================
DROP FUNCTION IF EXISTS ajustar_estoque(TEXT, INTEGER, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION ajustar_estoque(
    p_product_id TEXT,
    p_quantity INTEGER,
    p_type TEXT DEFAULT 'in',
    p_reason TEXT DEFAULT 'Ajuste manual',
    p_operator_name TEXT DEFAULT 'Sistema'
)
RETURNS TABLE(success BOOLEAN, message TEXT, previous_stock INTEGER, new_stock INTEGER)
LANGUAGE plpgsql AS $$
DECLARE
    v_current_stock INTEGER;
    v_new_stock INTEGER;
    v_product_name TEXT;
    v_final_type TEXT;
BEGIN
    SELECT stock_quantity, name INTO v_current_stock, v_product_name
    FROM products WHERE id = p_product_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'Produto nao encontrado: ' || p_product_id, 0, 0;
        RETURN;
    END IF;

    v_final_type := LOWER(p_type);
    IF v_final_type NOT IN ('in', 'out', 'adjustment', 'loss') THEN
        v_final_type := 'in';
    END IF;

    v_new_stock := CASE
        WHEN v_final_type = 'in' THEN v_current_stock + ABS(p_quantity)
        WHEN v_final_type IN ('out', 'loss') THEN GREATEST(0, v_current_stock - ABS(p_quantity))
        WHEN v_final_type = 'adjustment' THEN p_quantity
        ELSE v_current_stock
    END;

    UPDATE products SET stock_quantity = v_new_stock, updated_at = NOW()
    WHERE id = p_product_id;

    INSERT INTO stock_movements (id, organization_id, product_id, product_name,
        type, quantity, previous_stock, new_stock, reason, operator_name)
    VALUES (
        'mov-' || EXTRACT(EPOCH FROM NOW())::BIGINT || '-' || substr(md5(random()::TEXT), 1, 6),
        '00000000-0000-0000-0000-000000000001', p_product_id, v_product_name,
        v_final_type, ABS(p_quantity), v_current_stock, v_new_stock,
        p_reason, p_operator_name
    );

    RETURN QUERY SELECT TRUE, 'Estoque: ' || v_current_stock || ' -> ' || v_new_stock, v_current_stock, v_new_stock;
END;
$$;

-- ============================================================
-- 4. FUNÇÃO: process_sale_transaction
-- Chamada pelo frontend em storageService.addSale()
-- ============================================================
DROP FUNCTION IF EXISTS process_sale_transaction(TEXT, TEXT, INTEGER, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION process_sale_transaction(
    p_sale_id TEXT,
    p_product_id TEXT,
    p_quantity INTEGER,
    p_unit_price NUMERIC,
    p_discount NUMERIC DEFAULT 0,
    p_total NUMERIC DEFAULT NULL,
    p_reason TEXT DEFAULT 'Venda PDV',
    p_operator_name TEXT DEFAULT 'Sistema',
    p_organization_id TEXT DEFAULT '00000000-0000-0000-0000-000000000001',
    p_store_branch_id TEXT DEFAULT NULL
)
RETURNS TABLE(success BOOLEAN, message TEXT, new_stock INTEGER)
LANGUAGE plpgsql AS $$
DECLARE
    v_current_stock INTEGER;
    v_new_stock INTEGER;
    v_product_name TEXT;
    v_total NUMERIC;
BEGIN
    SELECT stock_quantity, name INTO v_current_stock, v_product_name
    FROM products WHERE id = p_product_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'Produto nao encontrado: ' || p_product_id, 0;
        RETURN;
    END IF;

    v_total := COALESCE(p_total, (p_unit_price * p_quantity) - p_discount);

    IF v_current_stock < p_quantity THEN
        RETURN QUERY SELECT FALSE,
            'Estoque insuficiente para ' || v_product_name || ': disp=' || v_current_stock || ', req=' || p_quantity,
            v_current_stock;
        RETURN;
    END IF;

    v_new_stock := v_current_stock - p_quantity;

    UPDATE products SET stock_quantity = v_new_stock, updated_at = NOW()
    WHERE id = p_product_id;

    INSERT INTO stock_movements (id, organization_id, store_branch_id,
        product_id, product_name, type, quantity, previous_stock, new_stock, reason, operator_name)
    VALUES (
        'mov-' || EXTRACT(EPOCH FROM NOW())::BIGINT || '-' || substr(md5(random()::TEXT), 1, 6),
        p_organization_id, p_store_branch_id,
        p_product_id, v_product_name, 'out', p_quantity,
        v_current_stock, v_new_stock, p_reason, p_operator_name
    );

    RETURN QUERY SELECT TRUE, 'Venda ok. Estoque: ' || v_current_stock || ' -> ' || v_new_stock, v_new_stock;
END;
$$;

-- ============================================================
-- 5. FUNÇÃO: fn_insserir_dlq (Dead Letter Queue)
-- Chamada pelo frontend quando uma operação RPC falha
-- ============================================================
DROP FUNCTION IF EXISTS fn_insserir_dlq(TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION fn_insserir_dlq(
    p_operation_type TEXT,
    p_table_name TEXT,
    p_record_id TEXT DEFAULT NULL,
    p_payload JSONB DEFAULT NULL,
    p_error_message TEXT DEFAULT NULL,
    p_source TEXT DEFAULT 'sync_queue',
    p_browser_id TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql AS $$
DECLARE
    v_id TEXT;
BEGIN
    v_id := 'dlq-' || EXTRACT(EPOCH FROM NOW())::BIGINT || '-' || substr(md5(random()::TEXT), 1, 6);

    INSERT INTO movimentacoes_falhas (id, operation_type, table_name, record_id,
        payload, error_message, source, browser_id, next_retry_at)
    VALUES (v_id, p_operation_type, p_table_name, p_record_id,
        p_payload, p_error_message, p_source, p_browser_id, NOW() + INTERVAL '1 minute');

    RETURN v_id;
END;
$$;

-- ============================================================
-- 6. FUNÇÃO: check_stock_consistency (diagnóstico)
-- ============================================================
DROP FUNCTION IF EXISTS check_stock_consistency(TEXT);

CREATE OR REPLACE FUNCTION check_stock_consistency(p_organization_id TEXT DEFAULT NULL)
RETURNS TABLE(product_id TEXT, product_name TEXT, current_stock INTEGER,
              calculated_stock INTEGER, difference INTEGER, status TEXT)
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    WITH stock_calc AS (
        SELECT p.id, p.name, COALESCE(p.stock_quantity, 0)::INTEGER AS current_stock,
            COALESCE(SUM(CASE WHEN sm.type IN ('in','IN') THEN sm.quantity
                              WHEN sm.type IN ('out','OUT','loss','LOSS') THEN -sm.quantity
                              ELSE 0 END), 0)::INTEGER AS calculated_stock
        FROM products p
        LEFT JOIN stock_movements sm ON p.id = sm.product_id
        WHERE (p_organization_id IS NULL OR p.organization_id::TEXT = p_organization_id)
        GROUP BY p.id, p.name, p.stock_quantity
    )
    SELECT sc.id, sc.name, sc.current_stock, sc.calculated_stock,
        (sc.current_stock - sc.calculated_stock) AS difference,
        CASE WHEN sc.current_stock = sc.calculated_stock THEN 'CONSISTENTE'
             WHEN sc.current_stock > sc.calculated_stock THEN 'SUPERAVIT'
             ELSE 'DEFICIT' END AS status
    FROM stock_calc sc
    WHERE sc.current_stock != sc.calculated_stock
    ORDER BY ABS(sc.current_stock - sc.calculated_stock) DESC;
END;
$$;

-- ============================================================
-- 7. VERIFICAÇÃO FINAL
-- ============================================================
SELECT proname AS funcao_criada
FROM pg_proc
WHERE proname IN ('ajustar_estoque', 'process_sale_transaction', 'fn_insserir_dlq', 'check_stock_consistency')
ORDER BY proname;

SELECT '✅ SCRIPT FINAL EXECUTADO COM SUCESSO!' AS resultado;