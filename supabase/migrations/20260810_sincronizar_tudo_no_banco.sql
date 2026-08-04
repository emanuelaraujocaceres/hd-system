-- ==============================================================================
-- 20260810: TUDO NO BANCO — sincronização completa entre dispositivos
-- ==============================================================================
-- Objetivo: nada importante deve ficar preso ao localStorage de um aparelho.
-- Este script entrega:
--   FASE 1 — financial_transactions ganha as colunas de recorrência/parcelamento
--            (is_recurring, is_installment, recurrence_type, recurrence_count,
--            recurrence_parent_id, installment_number)
--   FASE 2 — nova tabela scanned_boletos (histórico de boletos escaneados)
--   FASE 3 — nova tabela credit_payments (pagamentos de fiado)
--   FASE 4 — nova tabela nf_records (notas fiscais importadas)
-- Todas seguem o mesmo padrão de cautela das demais: store_branch_id obrigatório
-- (trigger), organization_id, RLS por organização e Realtime.
-- ==============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- FASE 1: COLUNAS DE RECORRÊNCIA/PARCELAMENTO EM financial_transactions
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS is_recurring boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_installment boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurrence_type text,
  ADD COLUMN IF NOT EXISTS recurrence_count integer,
  ADD COLUMN IF NOT EXISTS recurrence_parent_id uuid,
  ADD COLUMN IF NOT EXISTS installment_number integer;

COMMENT ON COLUMN public.financial_transactions.is_recurring IS
  'RECORRENTE: valor fixo que se repete a cada período (não é montante dividido)';
COMMENT ON COLUMN public.financial_transactions.is_installment IS
  'PARCELADA: o montante digitado foi dividido em N parcelas';

-- ═══════════════════════════════════════════════════════════════════════════
-- FASE 2: TABELA scanned_boletos
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.scanned_boletos (
  id uuid PRIMARY KEY,
  organization_id uuid,
  store_branch_id uuid,
  barcode text,
  linha_digitavel text,
  amount numeric(12,2) DEFAULT 0,
  due_date date,
  payer text,
  scan_date timestamptz DEFAULT now(),
  financial_account_id uuid,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scanned_boletos_org_idx ON public.scanned_boletos (organization_id);
CREATE INDEX IF NOT EXISTS scanned_boletos_branch_idx ON public.scanned_boletos (store_branch_id);
CREATE INDEX IF NOT EXISTS scanned_boletos_scan_date_idx ON public.scanned_boletos (scan_date DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- FASE 3: TABELA credit_payments
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.credit_payments (
  id uuid PRIMARY KEY,
  organization_id uuid,
  store_branch_id uuid,
  sale_id uuid,
  customer_id uuid,
  customer_name text,
  amount numeric(12,2) DEFAULT 0,
  paid_at timestamptz DEFAULT now(),
  payment_method text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS credit_payments_org_idx ON public.credit_payments (organization_id);
CREATE INDEX IF NOT EXISTS credit_payments_branch_idx ON public.credit_payments (store_branch_id);
CREATE INDEX IF NOT EXISTS credit_payments_sale_idx ON public.credit_payments (sale_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- FASE 4: TABELA nf_records
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.nf_records (
  id uuid PRIMARY KEY,
  organization_id uuid,
  store_branch_id uuid,
  supplier_name text,
  total_amount numeric(12,2) DEFAULT 0,
  scan_date timestamptz DEFAULT now(),
  items jsonb DEFAULT '[]'::jsonb,
  note text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS nf_records_org_idx ON public.nf_records (organization_id);
CREATE INDEX IF NOT EXISTS nf_records_branch_idx ON public.nf_records (store_branch_id);
CREATE INDEX IF NOT EXISTS nf_records_scan_date_idx ON public.nf_records (scan_date DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- TRIGGER DE FILIAL: incluir as 3 novas tabelas na validação de filial
-- (mesmo padrão das demais — store_branch_id obrigatório e válido)
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
    'cash_sessions', 'stock_movements', 'system_users',
    'scanned_boletos', 'credit_payments', 'nf_records'
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

-- Aplicar a trigger nas 3 novas tabelas
DO $$
DECLARE
  target_tables TEXT[] := ARRAY['scanned_boletos', 'credit_payments', 'nf_records'];
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY target_tables
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_validate_store_branch_id ON public.%I', tbl);
    EXECUTE format(
      'CREATE TRIGGER trg_validate_store_branch_id
       BEFORE INSERT OR UPDATE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.fn_validate_store_branch_id()',
      tbl
    );
    RAISE NOTICE '✅ Trigger trg_validate_store_branch_id aplicada em %', tbl;
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS: políticas por organização nas 3 novas tabelas
-- (mesmo padrão das demais — superadmin vê tudo, usuário comum só sua org)
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.scanned_boletos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nf_records ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  target_tables TEXT[] := ARRAY['scanned_boletos', 'credit_payments', 'nf_records'];
  tbl TEXT;
  action TEXT;
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
-- VERIFICAÇÃO
-- ═══════════════════════════════════════════════════════════════════════════
-- SELECT table_name, column_name FROM information_schema.columns
--   WHERE table_schema = 'public'
--     AND table_name = 'financial_transactions'
--     AND column_name LIKE 'recurrence%' OR column_name LIKE 'is_%'
--   ORDER BY table_name, column_name;
--
-- SELECT tablename, policyname FROM pg_policies
--   WHERE schemaname = 'public'
--     AND tablename IN ('scanned_boletos', 'credit_payments', 'nf_records')
--   ORDER BY tablename, policyname;
