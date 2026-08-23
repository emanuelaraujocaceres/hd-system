-- ═══════════════════════════════════════════════════════════════════
-- FIX_20260819_drop_legacy_stock_triggers.sql
-- Decisão (2026-08-19): dropar os 2 triggers legados de estoque do
-- products. Mantém apenas trg_stock_not_negative (guard de estoque
-- negativo). Alinhado ao AGENTS.md regra 8 (estoque = frontend).
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. DROP dos triggers legados (idempotente) ────────────────────
DROP TRIGGER IF EXISTS trigger_stock_not_negative ON public.products;
DROP TRIGGER IF EXISTS trigger_log_stock_changes ON public.products;

-- ── 2. DROP das funções órfãs (só eram chamadas pelos triggers) ────
DROP FUNCTION IF EXISTS public.validate_stock_negative();
DROP FUNCTION IF EXISTS public.log_stock_changes();

-- ── 3. VALIDAÇÃO: triggers restantes no products ───────────────────
-- Esperado: trg_products_updated_at, trg_stock_not_negative,
-- trg_sync_product_name, trg_validate_store_branch_id
SELECT tg.tgname AS trigger, p.proname AS funcao
FROM pg_trigger tg
JOIN pg_proc p ON p.oid = tg.tgfoid
WHERE tg.tgrelid = 'public.products'::regclass AND NOT tg.tgisinternal
ORDER BY tg.tgname;

-- ── 4. VALIDAÇÃO: funções órfãs sumiram ────────────────────────────
SELECT proname FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN ('validate_stock_negative', 'log_stock_changes');