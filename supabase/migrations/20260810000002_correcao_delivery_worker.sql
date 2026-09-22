-- ==============================================================================
-- CORREÇÃO: Criar tabela delivery_worker_earnings e colunas faltantes
-- ==============================================================================

-- 1. Criar tabela delivery_worker_earnings (se não existir)
CREATE TABLE IF NOT EXISTS delivery_worker_earnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  store_branch_id uuid NOT NULL,
  worker_id uuid NOT NULL,
  delivery_order_id uuid REFERENCES delivery_orders(id),
  
  delivery_fee numeric(10,2) NOT NULL DEFAULT 0,
  worker_amount numeric(10,2) NOT NULL DEFAULT 0,
  company_amount numeric(10,2) NOT NULL DEFAULT 0,
  
  pay_type text NOT NULL CHECK (pay_type IN ('salary', 'daily')),
  
  paid boolean DEFAULT false,
  paid_at timestamptz,
  
  created_at timestamptz DEFAULT now()
);

-- 2. Adicionar colunas faltantes em delivery_settings
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'delivery_settings' AND column_name = 'delivery_worker_fee_percent') THEN
    ALTER TABLE delivery_settings ADD COLUMN delivery_worker_fee_percent integer DEFAULT 100 CHECK (delivery_worker_fee_percent BETWEEN 0 AND 100);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'delivery_settings' AND column_name = 'delivery_worker_pay_type') THEN
    ALTER TABLE delivery_settings ADD COLUMN delivery_worker_pay_type text DEFAULT 'salary' CHECK (delivery_worker_pay_type IN ('salary', 'daily'));
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'delivery_settings' AND column_name = 'delivery_worker_daily_pay') THEN
    ALTER TABLE delivery_settings ADD COLUMN delivery_worker_daily_pay numeric(10,2) DEFAULT 0;
  END IF;
END $$;

-- 3. Índices
CREATE INDEX IF NOT EXISTS idx_dwe_org ON delivery_worker_earnings(organization_id);
CREATE INDEX IF NOT EXISTS idx_dwe_branch ON delivery_worker_earnings(store_branch_id);
CREATE INDEX IF NOT EXISTS idx_dwe_worker ON delivery_worker_earnings(worker_id);
CREATE INDEX IF NOT EXISTS idx_dwe_order ON delivery_worker_earnings(delivery_order_id);

-- 4. RLS
ALTER TABLE delivery_worker_earnings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dwe_select" ON delivery_worker_earnings;
CREATE POLICY "dwe_select" ON delivery_worker_earnings FOR SELECT USING (true);

DROP POLICY IF EXISTS "dwe_insert" ON delivery_worker_earnings;
CREATE POLICY "dwe_insert" ON delivery_worker_earnings FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "dwe_update" ON delivery_worker_earnings;
CREATE POLICY "dwe_update" ON delivery_worker_earnings FOR UPDATE USING (true);

DROP POLICY IF EXISTS "dwe_delete" ON delivery_worker_earnings;
CREATE POLICY "dwe_delete" ON delivery_worker_earnings FOR DELETE USING (true);

-- 5. REPLICA IDENTITY FULL
ALTER TABLE delivery_worker_earnings REPLICA IDENTITY FULL;

-- 6. Trigger para paid_at
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

-- 7. Adicionar ao Realtime
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'delivery_worker_earnings') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE delivery_worker_earnings;
  END IF;
END $$;

-- ==============================================================================
-- VERIFICAÇÃO FINAL
-- ==============================================================================
SELECT 'Tabela delivery_worker_earnings' as item, 
       CASE WHEN EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'delivery_worker_earnings') 
            then '✅ Criada' else '❌ Não criada' end as status;

SELECT 'Colunas delivery_worker_*' as item,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'delivery_settings' AND column_name = 'delivery_worker_fee_percent')
            then '✅ Criadas' else '❌ Não criadas' end as status;

SELECT 'Realtime' as item,
       CASE WHEN EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'delivery_worker_earnings')
            then '✅ Publicada' else '❌ Não publicada' end as status;

SELECT 'REPLICA IDENTITY' as item,
       CASE WHEN (SELECT relreplident FROM pg_class WHERE relname = 'delivery_worker_earnings') = 'f'
            then '✅ FULL' else '❌ Não é FULL' end as status;
