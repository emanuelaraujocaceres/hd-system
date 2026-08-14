-- ==============================================================================
-- 20260815_printers_role_category.sql
-- Adiciona role (roteamento cozinha/bar/caixa/outro) e category_id à tabela
-- printers. O frontend (syncPrinter em storageService.ts) JÁ envia essas duas
-- colunas, mas a tabela não as tinha — logo o upsert falhava (coluna inexistente)
-- e a configuração de impressora NUNCA chegava ao cloud. Com as colunas, a
-- sincronia bidirecional (cloud = fonte da verdade) passa a funcionar com
-- isolamento por filial, tempo real e online/offline.
-- ==============================================================================

ALTER TABLE public.printers ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'caixa';
ALTER TABLE public.printers ADD COLUMN IF NOT EXISTS category_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_printers_role') THEN
    ALTER TABLE public.printers
      ADD CONSTRAINT chk_printers_role
      CHECK (role IN ('caixa', 'bar', 'cozinha', 'outro'));
  END IF;
END $$;

COMMENT ON COLUMN public.printers.role IS 'Roteamento: caixa | bar | cozinha | outro';
COMMENT ON COLUMN public.printers.category_id IS 'Categoria específica (opcional) para roteamento por categoria';

-- Garante publicação em tempo real + replica identity (idempotente)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.printers;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

ALTER TABLE public.printers REPLICA IDENTITY FULL;
