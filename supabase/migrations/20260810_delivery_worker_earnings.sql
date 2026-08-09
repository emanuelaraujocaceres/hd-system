-- ==============================================================================
-- ADICIONAR: Configuração de taxa para colaborador do delivery
-- ==============================================================================

-- Adicionar campo de percentual para colaborador
ALTER TABLE delivery_settings 
ADD COLUMN IF NOT EXISTS delivery_worker_fee_percent integer DEFAULT 100 CHECK (delivery_worker_fee_percent BETWEEN 0 AND 100);

-- Adicionar campo para valor fixo diário (para colaborador não fixo - diarista)
ALTER TABLE delivery_settings 
ADD COLUMN IF NOT EXISTS delivery_worker_daily_pay numeric(10,2) DEFAULT 0;

-- Adicionar campo para tipo de pagamento do colaborador
ALTER TABLE delivery_settings 
ADD COLUMN IF NOT EXISTS delivery_worker_pay_type text DEFAULT 'salary' CHECK (delivery_worker_pay_type IN ('salary', 'daily'));

-- ==============================================================================
-- CRIAR TABELA: Rastreamento de taxas de entrega por colaborador
-- ==============================================================================
CREATE TABLE IF NOT EXISTS delivery_worker_earnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  store_branch_id uuid NOT NULL,
  worker_id uuid NOT NULL REFERENCES system_users(id),
  delivery_order_id uuid REFERENCES delivery_orders(id),
  
  delivery_fee numeric(10,2) NOT NULL DEFAULT 0,
  worker_amount numeric(10,2) NOT NULL DEFAULT 0,  -- Quanto o colaborador recebe
  company_amount numeric(10,2) NOT NULL DEFAULT 0, -- Quanto fica com a empresa (se menos que 100%)
  
  pay_type text NOT NULL CHECK (pay_type IN ('salary', 'daily')), -- Tipo de pagamento
  
  paid boolean DEFAULT false,
  paid_at timestamptz,
  
  created_at timestamptz DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_dwe_org ON delivery_worker_earnings(organization_id);
CREATE INDEX IF NOT EXISTS idx_dwe_branch ON delivery_worker_earnings(store_branch_id);
CREATE INDEX IF NOT EXISTS idx_dwe_worker ON delivery_worker_earnings(worker_id);
CREATE INDEX IF NOT EXISTS idx_dwe_order ON delivery_worker_earnings(delivery_order_id);

-- RLS
ALTER TABLE delivery_worker_earnings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dwe_select" ON delivery_worker_earnings FOR SELECT USING (true);
CREATE POLICY "dwe_insert" ON delivery_worker_earnings FOR INSERT WITH CHECK (true);
CREATE POLICY "dwe_update" ON delivery_worker_earnings FOR UPDATE USING (true);
CREATE POLICY "dwe_delete" ON delivery_worker_earnings FOR DELETE USING (true);

-- Realtime
ALTER TABLE delivery_worker_earnings REPLICA IDENTITY FULL;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION fn_delivery_worker_earnings_updated()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.paid = true AND OLD.paid = false THEN
    NEW.paid_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_dwe_updated ON delivery_worker_earnings;
CREATE TRIGGER trg_dwe_updated BEFORE UPDATE ON delivery_worker_earnings FOR EACH ROW EXECUTE FUNCTION fn_delivery_worker_earnings_updated();

-- ==============================================================================
-- VERIFICAÇÃO
-- ==============================================================================
SELECT 'delivery_settings novos campos:' as info;
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'delivery_settings'
  AND column_name LIKE 'delivery_worker%';

SELECT 'delivery_worker_earnings criada:' as info;
SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = 'delivery_worker_earnings';
