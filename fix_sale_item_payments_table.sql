-- ============================================================
-- BLOCO 2: FIX — Criar tabela (se não existir) + RLS + Policies
-- PG14-compatible, idempotente (DROP IF EXISTS + CREATE)
-- ============================================================

-- 2a. Verificar/criar tabela (se faltar)
SELECT 'Tabela sale_item_payments: ' || (SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='sale_item_payments')) AS existe;

-- Se a tabela NÃO existe, criar (baseado no uso no código):
CREATE TABLE IF NOT EXISTS public.sale_item_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid REFERENCES public.sales(id) ON DELETE CASCADE,
  sale_item_id uuid,
  customer_id uuid,
  amount numeric(12,2),
  payment_method text,
  operator_name text,
  store_branch_id uuid,
  organization_id uuid,
  paid_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Se a tabela JÁ existe mas faltam colunas, adicionar (PG14 — ALTER TABLE ADD COLUMN IF NOT EXISTS NÃO existe; usar try/catch ou verificar antes):
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sale_item_payments' AND column_name='store_branch_id') THEN
    ALTER TABLE public.sale_item_payments ADD COLUMN store_branch_id uuid;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sale_item_payments' AND column_name='organization_id') THEN
    ALTER TABLE public.sale_item_payments ADD COLUMN organization_id uuid;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sale_item_payments' AND column_name='updated_at') THEN
    ALTER TABLE public.sale_item_payments ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
END $$;

-- 2b. Habilitar RLS
ALTER TABLE public.sale_item_payments ENABLE ROW LEVEL SECURITY;
