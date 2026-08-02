-- ============================================================
-- FASE 1: BACKUP DE SEGURANCA EMERGENCIAL
-- Execute ESTE SCRIPT PRIMEIRO no Supabase SQL Editor
-- ============================================================
-- Este script cria tabelas de backup ANTES de qualquer alteracao.
-- E idempotente: pode ser executado multiplas vezes sem erro.
-- ============================================================

-- 1.1 Backup da tabela products
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_class WHERE relname = 'backup_products_emergencia'
    ) THEN
        CREATE TABLE backup_products_emergencia AS 
        SELECT * FROM products;
        RAISE NOTICE '✅ Backup products criado com sucesso';
    ELSE
        -- Se ja existe, limpa e recria com dados frescos
        TRUNCATE backup_products_emergencia;
        INSERT INTO backup_products_emergencia SELECT * FROM products;
        RAISE NOTICE '⚠️ Backup products ja existia — dados atualizados';
    END IF;
END $$;

-- 1.2 Backup da tabela sales
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_class WHERE relname = 'backup_sales_emergencia'
    ) THEN
        CREATE TABLE backup_sales_emergencia AS 
        SELECT * FROM sales;
        RAISE NOTICE '✅ Backup sales criado com sucesso';
    ELSE
        TRUNCATE backup_sales_emergencia;
        INSERT INTO backup_sales_emergencia SELECT * FROM sales;
        RAISE NOTICE '⚠️ Backup sales ja existia — dados atualizados';
    END IF;
END $$;

-- 1.3 Backup da tabela stock_movements
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_class WHERE relname = 'backup_stock_movements_emergencia'
    ) THEN
        CREATE TABLE backup_stock_movements_emergencia AS 
        SELECT * FROM stock_movements;
        RAISE NOTICE '✅ Backup stock_movements criado com sucesso';
    ELSE
        TRUNCATE backup_stock_movements_emergencia;
        INSERT INTO backup_stock_movements_emergencia SELECT * FROM stock_movements;
        RAISE NOTICE '⚠️ Backup stock_movements ja existia — dados atualizados';
    END IF;
END $$;

-- 1.4 Metadata do backup
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_class WHERE relname = 'backup_metadata'
    ) THEN
        CREATE TABLE backup_metadata (
            backup_id UUID DEFAULT gen_random_uuid(),
            backup_time TIMESTAMPTZ DEFAULT NOW(),
            tables_backed_up TEXT[],
            row_counts JSONB,
            status TEXT DEFAULT 'COMPLETED'
        );
    END IF;
END $$;

INSERT INTO backup_metadata (tables_backed_up, row_counts)
VALUES (
    ARRAY['products', 'sales', 'stock_movements'],
    jsonb_build_object(
        'products', (SELECT count(*) FROM products),
        'sales', (SELECT count(*) FROM sales),
        'stock_movements', (SELECT count(*) FROM stock_movements)
    )
);

-- 1.5 Verificacao final
SELECT 
    'backup_products_emergencia' as tabela, 
    count(*) as linhas 
FROM backup_products_emergencia
UNION ALL
SELECT 
    'backup_sales_emergencia', 
    count(*) 
FROM backup_sales_emergencia
UNION ALL
SELECT 
    'backup_stock_movements_emergencia', 
    count(*) 
FROM backup_stock_movements_emergencia;

SELECT 
    backup_id,
    backup_time,
    tables_backed_up,
    row_counts,
    status
FROM backup_metadata 
ORDER BY backup_time DESC 
LIMIT 3;

RAISE NOTICE '📦 FASE 1 COMPLETA — Backups criados com sucesso. Verifique os contadores acima.';
