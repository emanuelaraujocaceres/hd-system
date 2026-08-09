-- ==============================================================================
-- 20260810_sync_schema_code.sql
-- Sincroniza o schema do banco com o código TypeScript
-- ==============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. PROFILES - Campos de holerite
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS whatsapp TEXT,
  ADD COLUMN IF NOT EXISTS salary NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS transportation_allowance NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS meal_allowance NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_benefits NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS inss_discount NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ir_discount NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_discounts NUMERIC(12,2) DEFAULT 0;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. FINANCIAL_TRANSACTIONS - Campos de pagamento e vinculação
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS due_date DATE,
  ADD COLUMN IF NOT EXISTS payment_date DATE;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. SALES - Campo de detalhes de pagamento (split)
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS payment_details JSONB DEFAULT '[]'::jsonb;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. VERIFICAÇÃO - Confirmar que tudo foi adicionado
-- ═══════════════════════════════════════════════════════════════════════════
SELECT 'profiles' as tabela, 
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='whatsapp') as whatsapp,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='salary') as salary,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='transportation_allowance') as transportation_allowance,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='meal_allowance') as meal_allowance,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='other_benefits') as other_benefits,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='inss_discount') as inss_discount,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='ir_discount') as ir_discount,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='other_discounts') as other_discounts;

SELECT 'financial_transactions' as tabela,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='financial_transactions' AND column_name='payment_method') as payment_method,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='financial_transactions' AND column_name='sale_id') as sale_id,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='financial_transactions' AND column_name='due_date') as due_date,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='financial_transactions' AND column_name='payment_date') as payment_date;

SELECT 'sales' as tabela,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='sales' AND column_name='payment_details') as payment_details;
