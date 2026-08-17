-- AUDIT_FIXES.sql
-- Correções recomendadas pela auditoria de blindagem (2026-08-17)
-- Executar bloco por bloco no SQL Editor. Cada bloco é independente.

-- ══════════════════════════════════════════════════════════════════════
-- BLOCO 1: CHECK constraints para status de tabelas críticas
-- Prevém dados inválidos no banco (ex: status = 'lixo')
-- ══════════════════════════════════════════════════════════════════════

-- sales: status deve ser 'completed', 'cancelled' ou 'pending'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_sales_status'
  ) THEN
    ALTER TABLE public.sales ADD CONSTRAINT chk_sales_status
      CHECK (status IN ('completed', 'cancelled', 'pending'));
    RAISE NOTICE '✅ chk_sales_status criado';
  ELSE
    RAISE NOTICE '⏭️ chk_sales_status já existe';
  END IF;
END $$;

-- cash_sessions: status deve ser 'open' ou 'closed'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_cash_status'
  ) THEN
    ALTER TABLE public.cash_sessions ADD CONSTRAINT chk_cash_status
      CHECK (status IN ('open', 'closed'));
    RAISE NOTICE '✅ chk_cash_status criado';
  ELSE
    RAISE NOTICE '⏭️ chk_cash_status já existe';
  END IF;
END $$;

-- customer_sessions: status deve ser 'active', 'completed' ou 'cancelled'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_cs_status'
  ) THEN
    ALTER TABLE public.customer_sessions ADD CONSTRAINT chk_cs_status
      CHECK (status IN ('active', 'completed', 'cancelled'));
    RAISE NOTICE '✅ chk_cs_status criado';
  ELSE
    RAISE NOTICE '⏭️ chk_cs_status já existe';
  END IF;
END $$;

-- financial_transactions: status deve ser válido
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_ft_status'
  ) THEN
    ALTER TABLE public.financial_transactions ADD CONSTRAINT chk_ft_status
      CHECK (status IN ('pending', 'paid', 'overdue', 'cancelled'));
    RAISE NOTICE '✅ chk_ft_status criado';
  ELSE
    RAISE NOTICE '⏭️ chk_ft_status já existe';
  END IF;
END $$;

-- delivery_orders: status deve ser válido
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_do_status'
  ) THEN
    ALTER TABLE public.delivery_orders ADD CONSTRAINT chk_do_status
      CHECK (status IN ('pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled'));
    RAISE NOTICE '✅ chk_do_status criado';
  ELSE
    RAISE NOTICE '⏭️ chk_do_status já existe';
  END IF;
END $$;


-- ══════════════════════════════════════════════════════════════════════
-- BLOCO 2: CHECK constraints para valores numéricos
-- Prevém preços negativos, quantidades negativas, etc.
-- ══════════════════════════════════════════════════════════════════════

-- sales: total não pode ser negativo
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_sales_total_positive'
  ) THEN
    ALTER TABLE public.sales ADD CONSTRAINT chk_sales_total_positive
      CHECK (total >= 0);
    RAISE NOTICE '✅ chk_sales_total_positive criado';
  ELSE
    RAISE NOTICE '⏭️ chk_sales_total_positive já existe';
  END IF;
END $$;

-- sale_items: quantity > 0, unit_price >= 0, total_price >= 0
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_si_positive'
  ) THEN
    ALTER TABLE public.sale_items ADD CONSTRAINT chk_si_positive
      CHECK (quantity > 0 AND unit_price >= 0 AND total_price >= 0);
    RAISE NOTICE '✅ chk_si_positive criado';
  ELSE
    RAISE NOTICE '⏭️ chk_si_positive já existe';
  END IF;
END $$;

-- products: sale_price >= 0, cost_price >= 0, stock_quantity >= 0
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_products_positive'
  ) THEN
    ALTER TABLE public.products ADD CONSTRAINT chk_products_positive
      CHECK (sale_price >= 0 AND cost_price >= 0 AND stock_quantity >= 0);
    RAISE NOTICE '✅ chk_products_positive criado';
  ELSE
    RAISE NOTICE '⏭️ chk_products_positive já existe';
  END IF;
END $$;


-- ══════════════════════════════════════════════════════════════════════
-- BLOCO 3: Índices compostos para queries frequentes
-- Melhora performance de filtros comuns no frontend
-- ══════════════════════════════════════════════════════════════════════

-- products: filtro por filial + categoria (cardápio, estoque)
CREATE INDEX IF NOT EXISTS idx_products_branch_category
  ON public.products (store_branch_id, category)
  WHERE store_branch_id IS NOT NULL;

-- customers: filtro por filial + customer_type (delivery vs walkin)
CREATE INDEX IF NOT EXISTS idx_customers_branch_type
  ON public.customers (store_branch_id, customer_type)
  WHERE store_branch_id IS NOT NULL;

-- financial_transactions: filtro por filial + due_date (dashboard financeiro)
CREATE INDEX IF NOT EXISTS idx_financial_branch_due
  ON public.financial_transactions (store_branch_id, due_date)
  WHERE store_branch_id IS NOT NULL;

-- cash_sessions: filtro por filial + status (caixa aberto/fechado)
CREATE INDEX IF NOT EXISTS idx_cash_sessions_branch_status
  ON public.cash_sessions (store_branch_id, status)
  WHERE store_branch_id IS NOT NULL;


-- ══════════════════════════════════════════════════════════════════════
-- BLOCO 4: Índices parciais para dados mais acessados
-- Apenas registros ativos (WHERE is_active = true)
-- ══════════════════════════════════════════════════════════════════════

-- products ativos (usado no PDV, cardápio)
CREATE INDEX IF NOT EXISTS idx_products_active
  ON public.products (store_branch_id, name)
  WHERE is_active = true AND store_branch_id IS NOT NULL;

-- customers ativos (usado no CRM, delivery)
CREATE INDEX IF NOT EXISTS idx_customers_active
  ON public.customers (store_branch_id, name)
  WHERE is_active = true AND store_branch_id IS NOT NULL;


-- ══════════════════════════════════════════════════════════════════════
-- BLOCO 5: Índices para search por barcode (PDV rápido)
-- ══════════════════════════════════════════════════════════════════════

-- products: busca por barcode único
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_barcode_unique
  ON public.products (barcode)
  WHERE barcode IS NOT NULL AND barcode != '';


-- ══════════════════════════════════════════════════════════════════════
-- BLOCO 6: Verificar resultados
-- ══════════════════════════════════════════════════════════════════════

-- Listar todas as CHECK constraints adicionadas
SELECT
  conname AS constraint_name,
  conrelid::regclass AS table_name,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE contype = 'c'
  AND connamespace = 'public'::regnamespace
  AND conname LIKE 'chk_%'
ORDER BY conrelid::regclass::text, conname;

-- Listar índices criados nesta sessão
SELECT
  indexname,
  tablename,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'idx_products_branch_category',
    'idx_customers_branch_type',
    'idx_financial_branch_due',
    'idx_cash_sessions_branch_status',
    'idx_products_active',
    'idx_customers_active',
    'idx_products_barcode_unique'
  )
ORDER BY tablename, indexname;
