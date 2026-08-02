-- ============================================================
-- FASE 2: RECALCULO DE ESTOQUE (Event Sourcing)
-- Execute DEPOIS do FASE 1 (backup) no Supabase SQL Editor
-- ============================================================
-- Este script recalcula o estoque de TODOS os produtos baseado
-- exclusivamente no historico de movimentacoes (stock_movements).
-- 
-- CONCEITO: O estoque "correto" e a soma de todas as entradas
-- menos todas as saidas. O campo stock_quantity na tabela products
-- pode estar dessincronizado — este script corrige isso.
--
-- E IDEMPOTENTE: pode ser executado multiplas vezes sem erro.
-- ============================================================

-- 2.1 Funcao: Recalcular estoque de UM produto
CREATE OR REPLACE FUNCTION fn_recalcular_estoque_produto(
    p_product_id TEXT
) RETURNS TABLE(
    product_id TEXT,
    nome TEXT,
    estoque_anterior INTEGER,
    estoque_calculado INTEGER,
    diferenca INTEGER,
    movimentacoes_encontradas BIGINT
) AS $$
DECLARE
    v_calculado INTEGER;
    v_anterior INTEGER;
    v_count BIGINT;
    v_nome TEXT;
BEGIN
    -- Calcular estoque somando todas as movimentacoes
    SELECT 
        COALESCE(SUM(
            CASE 
                WHEN type = 'in' THEN quantity
                WHEN type = 'out' THEN -quantity
                WHEN type = 'adjustment' THEN 0  -- ajustes nao entram no calculo simples
                WHEN type = 'loss' THEN -quantity
                ELSE 0
            END
        ), 0),
        COUNT(*)
    INTO v_calculado, v_count
    FROM stock_movements
    WHERE product_id = p_product_id;

    -- Obter estoque atual declarado
    SELECT 
        stock_quantity,
        name
    INTO v_anterior, v_nome
    FROM products
    WHERE id = p_product_id;

    -- Se nao encontrar o produto, retorna vazio
    IF v_anterior IS NULL THEN
        RAISE NOTICE '⚠️ Produto % nao encontrado na tabela products', p_product_id;
        RETURN;
    END IF;

    -- Corrigir estoque no produto
    UPDATE products 
    SET stock_quantity = v_calculado,
        updated_at = NOW()
    WHERE id = p_product_id;

    -- Retornar resultado
    product_id := p_product_id;
    nome := v_nome;
    estoque_anterior := v_anterior;
    estoque_calculado := v_calculado;
    diferenca := v_calculado - v_anterior;
    movimentacoes_encontradas := v_count;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- 2.2 Funcao: Recalcular estoque de TODOS os produtos
CREATE OR REPLACE FUNCTION fn_recalcular_estoque_geral()
RETURNS TABLE(
    product_id TEXT,
    nome TEXT,
    estoque_anterior INTEGER,
    estoque_calculado INTEGER,
    diferenca INTEGER,
    movimentacoes_encontradas BIGINT
) AS $$
DECLARE
    v_prod RECORD;
    v_calculado INTEGER;
    v_count BIGINT;
    v_total_corrigidos INTEGER := 0;
    v_total_ok INTEGER := 0;
BEGIN
    -- Log de inicio
    RAISE NOTICE '🔄 Iniciando recalculo geral de estoque...';

    -- Iterar sobre todos os produtos
    FOR v_prod IN 
        SELECT id, name, stock_quantity 
        FROM products 
        WHERE is_active = true OR is_active IS NULL
    LOOP
        -- Calcular estoque a partir de movimentacoes
        SELECT 
            COALESCE(SUM(
                CASE 
                    WHEN type = 'in' THEN quantity
                    WHEN type = 'out' THEN -quantity
                    WHEN type = 'loss' THEN -quantity
                    ELSE 0
                END
            ), 0),
            COUNT(*)
        INTO v_calculado, v_count
        FROM stock_movements
        WHERE product_id = v_prod.id;

        -- Se nao tem movimentacoes, manter estoque atual
        IF v_count = 0 THEN
            v_calculado := v_prod.stock_quantity;
        END IF;

        -- Atualizar produto
        UPDATE products 
        SET stock_quantity = v_calculado,
            updated_at = NOW()
        WHERE id = v_prod.id;

        -- Retornar resultado deste produto
        product_id := v_prod.id;
        nome := v_prod.name;
        estoque_anterior := v_prod.stock_quantity;
        estoque_calculado := v_calculado;
        diferenca := v_calculado - v_prod.stock_quantity;
        movimentacoes_encontradas := v_count;
        RETURN NEXT;

        -- Contadores
        IF diferenca != 0 THEN
            v_total_corrigidos := v_total_corrigidos + 1;
        ELSE
            v_total_ok := v_total_ok + 1;
        END IF;
    END LOOP;

    -- Log de resumo
    RAISE NOTICE '✅ Recalculo completo: % produtos corrigidos, % ja estavam corretos', 
        v_total_corrigidos, v_total_ok;
END;
$$ LANGUAGE plpgsql;

-- 2.3 Log de reconciliacao para auditoria
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_class WHERE relname = 'reconciliation_log'
    ) THEN
        CREATE TABLE reconciliation_log (
            id UUID DEFAULT gen_random_uuid(),
            executed_at TIMESTAMPTZ DEFAULT NOW(),
            executed_by TEXT DEFAULT 'system',
            products_checked INTEGER,
            products_corrected INTEGER,
            details JSONB,
            status TEXT DEFAULT 'COMPLETED'
        );
        RAISE NOTICE '✅ Tabela reconciliation_log criada';
    END IF;
END $$;

-- 2.4 EXECUTAR O RECALCULO
-- (Descomente a linha abaixo para executar de fato)
-- SELECT * FROM fn_recalcular_estoque_geral();

-- Por enquanto, apenas VALIDAR (sem alterar):
SELECT 
    p.id as product_id,
    p.name as nome,
    p.stock_quantity as estoque_declarado,
    COALESCE(SUM(
        CASE 
            WHEN sm.type = 'in' THEN sm.quantity
            WHEN sm.type = 'out' THEN -sm.quantity
            WHEN sm.type = 'loss' THEN -sm.quantity
            ELSE 0
        END
    ), 0) as estoque_calculado,
    COALESCE(SUM(
        CASE 
            WHEN sm.type = 'in' THEN sm.quantity
            WHEN sm.type = 'out' THEN -sm.quantity
            WHEN sm.type = 'loss' THEN -sm.quantity
            ELSE 0
        END
    ), 0) - p.stock_quantity as diferenca,
    COUNT(sm.id) as qtd_movimentacoes
FROM products p
LEFT JOIN stock_movements sm ON sm.product_id = p.id
WHERE p.is_active = true OR p.is_active IS NULL
GROUP BY p.id, p.name, p.stock_quantity
HAVING COALESCE(SUM(
    CASE 
        WHEN sm.type = 'in' THEN sm.quantity
        WHEN sm.type = 'out' THEN -sm.quantity
        WHEN sm.type = 'loss' THEN -sm.quantity
        ELSE 0
    END
), 0) - p.stock_quantity != 0
   OR COUNT(sm.id) = 0
ORDER BY abs(COALESCE(SUM(
    CASE 
        WHEN sm.type = 'in' THEN sm.quantity
        WHEN sm.type = 'out' THEN -sm.quantity
        WHEN sm.type = 'loss' THEN -sm.quantity
        ELSE 0
    END
), 0) - p.stock_quantity) DESC;

RAISE NOTICE '📋 FASE 2 — Query de validacao acima mostra divergencias.';
RAISE NOTICE '   Se divergencias existirem, DESCOMENTE a linha "SELECT * FROM fn_recalcular_estoque_geral()" e execute novamente.';
RAISE NOTICE '   Apos confirmar, REGISTRE no reconciliation_log:';
RAISE NOTICE '   INSERT INTO reconciliation_log (products_checked, products_corrected, details) VALUES (...);';
