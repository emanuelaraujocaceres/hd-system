-- ==============================================================================
-- 20260810_add_payroll_fields_to_profiles.sql
-- Adiciona campos de holerite e WhatsApp na tabela profiles
-- ==============================================================================

-- 1. Adicionar campos de WhatsApp e holerite
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS whatsapp TEXT,
  ADD COLUMN IF NOT EXISTS salary NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS transportation_allowance NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS meal_allowance NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS health_insurance NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_benefits NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS inss_discount NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ir_discount NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_discounts NUMERIC(12,2) DEFAULT 0;

-- 2. Adicionar comentários
COMMENT ON COLUMN public.profiles.whatsapp IS 'Número do WhatsApp com DDD (ex: 11999999999)';
COMMENT ON COLUMN public.profiles.salary IS 'Salário base do colaborador';
COMMENT ON COLUMN public.profiles.transportation_allowance IS 'Vale transporte';
COMMENT ON COLUMN public.profiles.meal_allowance IS 'Vale refeição';
COMMENT ON COLUMN public.profiles.health_insurance IS 'Plano de saúde';
COMMENT ON COLUMN public.profiles.other_benefits IS 'Outros benefícios';
COMMENT ON COLUMN public.profiles.inss_discount IS 'Desconto INSS';
COMMENT ON COLUMN public.profiles.ir_discount IS 'Desconto Imposto de Renda';
COMMENT ON COLUMN public.profiles.other_discounts IS 'Outros descontos';

-- 3. Verificar colunas adicionadas
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'profiles'
  AND column_name IN ('whatsapp', 'salary', 'transportation_allowance', 'meal_allowance')
ORDER BY ordinal_position;
