-- ==============================================================================
-- 20260806: CORREÇÃO TRIGGER DE FILIAL + RLS + DLQ
-- ==============================================================================
-- PROBLEMA OBSERVADO (Supabase Postgres Logs):
--   1. "❌ ERRO CRÍTICO: Tentativa de salvar X com store_branch_id inválido!
--      branch: bb056150-..." — a trigger de validação rejeita filiais que
--      EXISTEM em store_branches. Causa provável: a trigger valida
--      `id = NEW.store_branch_id AND organization_id = NEW.organization_id`,
--      e o superadmin (organization_id = NULL) quebra o match.
--   2. "Tentativa de salvar sale_items sem store_branch_id!" — frontend
--      antigo não enviava filial nos itens (corrigido no código).
--   3. "Tentativa de salvar movimentacoes_falhas com store_branch_id
--      inválido!" — a DLQ insere em movimentacoes_falhas sem filial e a
--      trigger também dispara nessa tabela.
--   4. "42501 new row violates row-level security policy" — policies de
--      INSERT/UPDATE por organização nunca foram criadas (AddUserPermissions
--      ficou bloqueado por falha de autenticação).
-- ==============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- PASSO 0: DIAGNÓSTICO — exibir as triggers de validação existentes
-- (Rode e cole o resultado aqui se quiser conferir o que havia antes)
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT t.tgname AS trigger_name,
           c.relname AS table_name,
           p.proname AS function_name
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE n.nspname = 'public'
      AND NOT t.tgisinternal
      AND (p.prosrc ILIKE '%ERRO CRÍTICO%' OR p.prosrc ILIKE '%inválido%')
    ORDER BY c.relname
  LOOP
    RAISE NOTICE 'TRIGGER DE VALIDAÇÃO: % ON % (função: %)',
      r.trigger_name, r.table_name, r.function_name;
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- PASSO 1: CORRIGIR A VALIDAÇÃO DE store_branch_id
-- ═══════════════════════════════════════════════════════════════════════════
-- Nova função de validação TOLERANTE:
--   * Valida APENAS que a filial EXISTE em store_branches (por id).
--   * NÃO exige match de organization_id (superadmin usa org NULL).
--   * Ignora tabelas SEM a coluna store_branch_id (ex.: movimentacoes_falhas,
--     system_settings, store_branches) — retorna NEW sem bloquear.
--   * Exige store_branch_id preenchido apenas em tabelas de dados de filial
--     (products, sales, sale_items, etc.) — corrige "sem store_branch_id!".

-- 1.1. Dropar triggers antigos cuja função contenha a mensagem crítica.
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
      AND (p.prosrc ILIKE '%ERRO CRÍTICO%' OR p.prosrc ILIKE '%inválido%')
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', r.trigger_name, r.table_name);
    RAISE NOTICE '✅ Trigger % removida de %', r.trigger_name, r.table_name;
  END LOOP;
END $$;

-- 1.2. Função de validação correta (BEFORE INSERT OR UPDATE)
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
  -- movimentacoes_falhas / system_settings / store_branches ficam de fora.
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

  IF NEW.store_branch_id IS NULL OR NEW.store_branch_id = '' THEN
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

-- 1.3. Aplicar o trigger de validação nas tabelas de dados
DO $$
DECLARE
  target_tables TEXT[] := ARRAY[
    'products', 'categories', 'customers', 'suppliers',
    'sales', 'sale_items', 'financial_transactions',
    'cash_sessions', 'stock_movements', 'system_users'
  ];
  tbl TEXT;
  col_exists BOOLEAN;
BEGIN
  FOREACH tbl IN ARRAY target_tables
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = tbl
        AND column_name = 'store_branch_id'
    ) INTO col_exists;

    IF col_exists THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_validate_store_branch_id ON public.%I', tbl);
      EXECUTE format(
        'CREATE TRIGGER trg_validate_store_branch_id
         BEFORE INSERT OR UPDATE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.fn_validate_store_branch_id()',
        tbl
      );
      RAISE NOTICE '✅ Trigger trg_validate_store_branch_id aplicada em %', tbl;
    ELSE
      RAISE NOTICE 'ℹ️ Tabela % sem coluna store_branch_id — trigger não aplicada', tbl;
    END IF;
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- PASSO 2: CORRIGIR DLQ (movimentacoes_falhas)
-- ═══════════════════════════════════════════════════════════════════════════
-- A DLQ não tem (e não precisa de) store_branch_id — a nova função ignora a
-- tabela. Mas vamos garantir SECURITY DEFINER para que a DLQ funcione mesmo
-- com RLS ativa, e aceitar branch opcional quando o chamador fornecer.
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
-- PASSO 3: RLS — POLICIES DE ESCRITA POR ORGANIZAÇÃO (corrige 42501)
-- ═══════════════════════════════════════════════════════════════════════════
-- Cria políticas INSERT/UPDATE/DELETE que permitem:
--   * superadmin: tudo (já coberto por RLS_<tabela>_superadmin)
--   * usuário comum: apenas linhas da SUA organização (via get_auth_user_org_id)
-- As policies de SELECT por org já devem existir; garantimos INSERT/UPDATE/DELETE.

DO $$
DECLARE
  target_tables TEXT[] := ARRAY[
    'products', 'categories', 'customers', 'suppliers',
    'sales', 'financial_transactions', 'cash_sessions',
    'stock_movements', 'system_users', 'system_settings',
    'store_branches'
  ];
  tbl TEXT;
  action TEXT;
BEGIN
  FOREACH tbl IN ARRAY target_tables
  LOOP
    -- INSERT: organização do usuário == organização da linha (ou superadmin)
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = tbl
        AND policyname = 'RLS_' || tbl || '_insert_org'
    ) THEN
      EXECUTE format(
        'CREATE POLICY "RLS_%s_insert_org" ON public.%I
         FOR INSERT
         WITH CHECK (
           public.is_superadmin()
           OR organization_id = public.get_auth_user_org_id()
         )',
        tbl, tbl
      );
      RAISE NOTICE '✅ Policy RLS_%_insert_org criada', tbl;
    END IF;

    -- UPDATE: organização do usuário == organização da linha (ou superadmin)
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = tbl
        AND policyname = 'RLS_' || tbl || '_update_org'
    ) THEN
      EXECUTE format(
        'CREATE POLICY "RLS_%s_update_org" ON public.%I
         FOR UPDATE
         USING (
           public.is_superadmin()
           OR organization_id = public.get_auth_user_org_id()
         )
         WITH CHECK (
           public.is_superadmin()
           OR organization_id = public.get_auth_user_org_id()
         )',
        tbl, tbl
      );
      RAISE NOTICE '✅ Policy RLS_%_update_org criada', tbl;
    END IF;

    -- DELETE: organização do usuário == organização da linha (ou superadmin)
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = tbl
        AND policyname = 'RLS_' || tbl || '_delete_org'
    ) THEN
      EXECUTE format(
        'CREATE POLICY "RLS_%s_delete_org" ON public.%I
         FOR DELETE
         USING (
           public.is_superadmin()
           OR organization_id = public.get_auth_user_org_id()
         )',
        tbl, tbl
      );
      RAISE NOTICE '✅ Policy RLS_%_delete_org criada', tbl;
    END IF;
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- PASSO 4: POLICIES DE SELECT POR ORGANIZAÇÃO (defesa extra)
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  target_tables TEXT[] := ARRAY[
    'products', 'categories', 'customers', 'suppliers',
    'sales', 'financial_transactions', 'cash_sessions',
    'stock_movements', 'system_users', 'system_settings'
  ];
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY target_tables
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = tbl
        AND policyname = 'RLS_' || tbl || '_select_org'
    ) THEN
      EXECUTE format(
        'CREATE POLICY "RLS_%s_select_org" ON public.%I
         FOR SELECT
         USING (
           public.is_superadmin()
           OR organization_id = public.get_auth_user_org_id()
         )',
        tbl, tbl
      );
      RAISE NOTICE '✅ Policy RLS_%_select_org criada', tbl;
    END IF;
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- PASSO 5: VERIFICAÇÃO
-- ═══════════════════════════════════════════════════════════════════════════
-- SELECT tgname, c.relname FROM pg_trigger t
--   JOIN pg_class c ON c.oid = t.tgrelid
--   JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE n.nspname = 'public' AND NOT t.tgisinternal
--   ORDER BY c.relname;
--
-- SELECT policyname, tablename FROM pg_policies
--   WHERE schemaname = 'public' ORDER BY tablename, policyname;
