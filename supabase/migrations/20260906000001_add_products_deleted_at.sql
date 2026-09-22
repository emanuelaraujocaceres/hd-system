-- ==============================================================================
-- 20260906_add_products_deleted_at.sql
-- Soft-delete sincronizado de produtos (tombstone em `products`).
--
-- PROBLEMA: a exclusão de produto fazia DELETE físico na tabela products
-- (syncService.deleteRow). O banco tem FKs de integridade do histórico
-- (fk_sale_items_product em sale_items, fk_stock_movements_product em
-- stock_movements — migration 20260729_complete_uuid_migration.sql), então
-- qualquer produto com vendas ou movimentações era REJEITADO com 409 Conflict
-- no cloud, mas o device local já tinha removido o produto + registrado
-- tombstone → o produto "sumia" só naquele device e permanecia no cloud e nos
-- demais dispositivos (divergência permanente).
--
-- SOLUÇÃO (espelha 20260902_add_sales_deleted_at.sql): coluna
-- `deleted_at TIMESTAMPTZ` em products. Ao excluir um produto, o frontend passa
-- a fazer SOFT-DELETE (upsert setando deleted_at=now()) em vez de DELETE físico.
-- O Realtime propaga o UPDATE (products já está na publicação supabase_realtime
-- com REPLICA IDENTITY FULL) e os outros devices removem o produto localmente.
-- A hidratação ignora produtos com deleted_at <> NULL, então o produto excluído
-- NUNCA volta, independente de qual dispositivo hidratar.
--
-- 1. Cria coluna deleted_at (idempotente).
-- 2. Índice parcial para produtos não-deletados (estado ativo).
-- 3. Garante REPLICA IDENTITY FULL (payload completo de UPDATE/DELETE no
--    Realtime — regra 2 do AGENTS.md).
--
-- NÃO altera RLS (as policies existentes de products permanecem; o upsert do
-- soft-delete usa UPDATE, já coberto por org_branch_update_products).
-- ==============================================================================

-- 0. Backup prévio (rollback / auditoria) — mesmo padrão das demais migrations
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema = 'public' AND table_name = 'products_deleted_at_backup_20260906') THEN
    CREATE TABLE public.products_deleted_at_backup_20260906 AS
    SELECT id, is_active, deleted_at, updated_at
    FROM public.products;
  END IF;
END $$;

-- 1. Coluna deleted_at (TIMESTAMPTZ) — soft delete sincronizado
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 2. Índice parcial para produtos não-deletados (queries de produtos ativos)
CREATE INDEX IF NOT EXISTS idx_products_deleted_at
  ON public.products (deleted_at)
  WHERE deleted_at IS NULL;

-- 3. REPLICA IDENTITY FULL (payload completo de UPDATE/DELETE no Realtime —
--    regra 2 do AGENTS.md: a tabela já está na publicação supabase_realtime).
ALTER TABLE public.products REPLICA IDENTITY FULL;

-- 4. (Sem backfill de status — products não tem status 'cancelled' como sales;
--    produtos legados permanecem ativos até serem soft-deletados pelo app.)

-- 5. Verificação das mudanças aplicadas
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'products'
  AND column_name = 'deleted_at';

SELECT count(*) AS produtos_ativos
FROM public.products
WHERE deleted_at IS NULL; -- todos os produtos atuais sem tombstone