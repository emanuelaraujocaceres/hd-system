-- ==============================================================================
-- 20260804: Correção DLQ + Superadmin
-- ==============================================================================
-- 1. Adiciona colunas faltantes à tabela movimentacoes_falhas
-- 2. Recreate fn_insserir_dlq com colunas corretas
-- 3. Função is_superadmin() + políticas RLS de superadmin
-- ==============================================================================

-- ═══════════════════════════════════════════════════════════════════════════════
-- PASSO 1: Adicionar colunas faltantes à movimentacoes_falhas
-- A tabela foi criada sem as colunas record_id, error_status, source,
-- browser_id, user_email, next_retry_at, causando erro ao chamar fn_insserir_dlq
-- ═══════════════════════════════════════════════════════════════════════════════
ALTER TABLE movimentacoes_falhas ADD COLUMN IF NOT EXISTS record_id TEXT;
ALTER TABLE movimentacoes_falhas ADD COLUMN IF NOT EXISTS error_status INTEGER;
ALTER TABLE movimentacoes_falhas ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'sync_queue';
ALTER TABLE movimentacoes_falhas ADD COLUMN IF NOT EXISTS browser_id TEXT;
ALTER TABLE movimentacoes_falhas ADD COLUMN IF NOT EXISTS user_email TEXT;
ALTER TABLE movimentacoes_falhas ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PASSO 2: Recreate fn_insserir_dlq (compatível com o frontend)
-- ═══════════════════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS fn_insserir_dlq;

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

GRANT EXECUTE ON FUNCTION fn_insserir_dlq TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PASSO 3: Função is_superadmin() + políticas RLS de superadmin
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM system_users
    WHERE id = auth.uid() AND superadmin = TRUE
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_superadmin TO authenticated;

-- Cria política superadmin para cada tabela (se não existir)
DO $$ DECLARE
  rec RECORD;
BEGIN
  FOR rec IN (
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename IN (
        'organizations', 'store_branches', 'products', 'categories',
        'customers', 'suppliers', 'sales', 'sale_items',
        'financial_transactions', 'cash_sessions', 'stock_movements',
        'system_users', 'system_settings'
      )
  ) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = rec.tablename
        AND policyname = 'RLS_' || rec.tablename || '_superadmin'
    ) THEN
      EXECUTE format(
        'CREATE POLICY "RLS_%s_superadmin" ON %s
           FOR ALL
           USING (public.is_superadmin())
           WITH CHECK (public.is_superadmin());',
        rec.tablename, rec.tablename
      );
      RAISE NOTICE '✅ Política superadmin criada para %', rec.tablename;
    END IF;
  END LOOP;
END $$;

-- Garantir superadmin
UPDATE system_users SET superadmin = TRUE WHERE email = 'emanuel@gmail.com';

-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO
-- ═══════════════════════════════════════════════════════════════════════════════
-- SELECT public.is_superadmin(); -- true para emanuel, false para outros
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'movimentacoes_falhas' ORDER BY ordinal_position;
