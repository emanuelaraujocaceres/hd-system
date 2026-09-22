-- ==============================================================================
-- 20260807: CORRIGE 22P02 "invalid input syntax for type uuid: """ — CAUSA RAIZ
-- ==============================================================================
-- PROBLEMA (confirmado por dump de triggers em produção):
--   public.fn_validate_store_branch_id() fazia:
--     IF NEW.store_branch_id IS NULL OR NEW.store_branch_id = '' THEN
--   store_branch_id é uma coluna UUID. Comparar UUID com '' força o PostgreSQL
--   a converter ''::uuid → erro 22P02 "invalid input syntax for type uuid: """.
--   O erro disparava em TODA escrita (INSERT/UPDATE) nas 10 tabelas com a
--   trigger, mesmo com payloads 100% válidos (comprovado pelos logs 🔍 PAYLOAD).
--
-- CORREÇÕES:
--   1. Remover a comparação `= ''` (UUID nunca é string vazia; só IS NULL).
--   2. Dropar as triggers legadas "alert_missing_branch" (ERRO CRÍTICO) que a
--      migração 20260806 já mandava dropar (PASSO 1.1) mas que continuam ativas:
--        * movimentacoes_falhas  → bloqueava a própria DLQ ("ERRO CRÍTICO ...
--          branch: 59fe7e1e-...")
--        * stock_change_log      → o trigger log_stock_changes insere nessa
--          tabela SEM store_branch_id, então qualquer mudança de estoque
--          continuaria falhando após o fix #1.
--      A validação de filial passa a ser feita exclusivamente por
--      fn_validate_store_branch_id() (já aplicada nas 10 tabelas operacionais).
--   3. Recriar fn_insserir_dlq como SECURITY DEFINER e SEM exigir filial
--      (versão da 20260806, que nunca chegou ao banco) — a DLQ precisa funcionar
--      para registrar qualquer erro futuro.
-- ==============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. DROPAR TRIGGERS LEGADAS alert_missing_branch (função public.alert_missing_branch)
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT t.tgname AS trigger_name, c.relname AS table_name
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE n.nspname = 'public'
      AND NOT t.tgisinternal
      AND p.proname = 'alert_missing_branch'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', r.trigger_name, r.table_name);
    RAISE NOTICE '✅ Trigger % removida de %', r.trigger_name, r.table_name;
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. FUNÇÃO DE VALIDAÇÃO CORRETA — SEM comparação com '' (causa do 22P02)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fn_validate_store_branch_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_col_exists BOOLEAN;
  v_branch_ok  BOOLEAN;
  v_required   BOOLEAN;
BEGIN
  -- Tabelas que SEMPRE exigem store_branch_id (dados operacionais de filial).
  v_required := TG_TABLE_NAME IN (
    'products', 'categories', 'customers', 'suppliers',
    'sales', 'sale_items', 'financial_transactions',
    'cash_sessions', 'stock_movements', 'system_users'
  );

  -- A tabela possui a coluna store_branch_id?
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = TG_TABLE_NAME
      AND column_name = 'store_branch_id'
  ) INTO v_col_exists;

  IF NOT v_col_exists THEN
    RETURN NEW; -- tabela sem coluna de filial → nada a validar
  END IF;

  -- store_branch_id é UUID: nunca é string vazia. Só IS NULL importa.
  -- (comparar com '' causava 22P02 invalid input syntax for type uuid: "")
  IF NEW.store_branch_id IS NULL THEN
    IF v_required THEN
      RAISE EXCEPTION 'Tentativa de salvar % sem store_branch_id!',
        TG_TABLE_NAME;
    END IF;
    RETURN NEW;
  END IF;

  -- Validação por existência (id) — tolerante a organization_id NULL (superadmin)
  SELECT EXISTS (
    SELECT 1 FROM public.store_branches sb
    WHERE sb.id::text = NEW.store_branch_id::text
      AND (sb.active IS NULL OR sb.active = TRUE)
  ) INTO v_branch_ok;

  IF NOT v_branch_ok THEN
    RAISE EXCEPTION 'Tentativa de salvar % com store_branch_id inválido! ID: %, branch: %',
      TG_TABLE_NAME, NEW.id, NEW.store_branch_id;
  END IF;

  RETURN NEW;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. DLQ (movimentacoes_falhas) — SECURITY DEFINER, sem exigir filial
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fn_insserir_dlq(
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
  p_user_email TEXT DEFAULT NULL,
  p_store_branch_id TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_org_id UUID;
BEGIN
  v_id := gen_random_uuid();
  v_org_id := COALESCE(
    get_auth_user_org_id(),
    '00000000-0000-0000-0000-000000000001'
  );

  INSERT INTO movimentacoes_falhas (
    id, organization_id, operation_type, table_name, record_id, payload,
    error_message, error_code, error_status, stack_trace,
    source, browser_id, user_email, next_retry_at
  ) VALUES (
    v_id, v_org_id, p_operation_type, p_table_name, p_record_id, p_payload,
    p_error_message, p_error_code, p_error_status, p_stack_trace,
    p_source, p_browser_id, p_user_email, NOW() + INTERVAL '1 minute'
  );
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_insserir_dlq TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_insserir_dlq TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. VERIFICAÇÃO
-- ═══════════════════════════════════════════════════════════════════════════
-- SELECT proname FROM pg_proc WHERE proname = 'fn_validate_store_branch_id';
-- SELECT prosrc FROM pg_proc WHERE proname = 'fn_validate_store_branch_id';  -- não deve conter "= ''"
--
-- SELECT tgname, c.relname FROM pg_trigger t
--   JOIN pg_class c ON c.oid = t.tgrelid
--   JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE n.nspname = 'public' AND NOT t.tgisinternal
--     AND tgname LIKE '%alert_missing_branch%';  -- deve retornar 0 linhas
--
-- Teste manual (substitua os UUIDs):
-- INSERT INTO sales (id, organization_id, store_branch_id, user_id, code, status, total)
-- VALUES (gen_random_uuid(),
--         '361fb95a-3e9f-43be-a43c-0dc91f851f31',
--         'e5085eba-4398-4c31-ae13-8082b46561ee',
--         'e22c9396-a894-4a99-8d4b-d1069d9db5ce',
--         'TESTE-FIX-22P02', 'COMPLETED', 1.00);
-- SELECT id FROM movimentacoes_falhas ORDER BY created_at DESC LIMIT 5;
