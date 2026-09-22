-- ==============================================================================
-- ETAPA 3: Criar tabelas de Delivery
-- ==============================================================================

-- 3.1: delivery_settings - Configurações de delivery por filial
CREATE TABLE IF NOT EXISTS delivery_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  store_branch_id uuid NOT NULL UNIQUE,
  
  -- Configurações gerais
  is_active boolean DEFAULT true,
  delivery_enabled boolean DEFAULT true,
  pickup_enabled boolean DEFAULT true,
  
  -- Horário de funcionamento (JSON flexível)
  -- Ex: {"monday": {"open": "18:00", "close": "23:00"}, "tuesday": {...}}
  operating_hours jsonb DEFAULT '{}'::jsonb,
  
  -- Tipo de cálculo de taxa: 'fixed', 'neighborhood', 'distance', 'free'
  fee_calculation_type text DEFAULT 'free' CHECK (fee_calculation_type IN ('fixed', 'neighborhood', 'distance', 'free')),
  
  -- Taxa fixa (quando fee_calculation_type = 'fixed')
  fixed_fee decimal(10,2) DEFAULT 0,
  
  -- Pedido mínimo
  minimum_order_value decimal(10,2) DEFAULT 0,
  
  -- Tempo estimado de entrega (minutos)
  estimated_delivery_time integer DEFAULT 45,
  
  -- Máximo de km para entrega
  max_delivery_distance_km integer DEFAULT 15,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 3.2: delivery_neighborhoods - Bairros com taxas de entrega
CREATE TABLE IF NOT EXISTS delivery_neighborhoods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  store_branch_id uuid NOT NULL,
  
  neighborhood text NOT NULL,
  fee decimal(10,2) NOT NULL DEFAULT 0,
  estimated_time_minutes integer DEFAULT 45,
  is_active boolean DEFAULT true,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  UNIQUE(store_branch_id, neighborhood)
);

-- 3.3: delivery_distance_rates - Faixas de distância com taxas
CREATE TABLE IF NOT EXISTS delivery_distance_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  store_branch_id uuid NOT NULL,
  
  min_km decimal(6,2) NOT NULL DEFAULT 0,
  max_km decimal(6,2) NOT NULL,
  
  fee decimal(10,2) NOT NULL DEFAULT 0,
  estimated_time_minutes integer DEFAULT 45,
  is_active boolean DEFAULT true,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  UNIQUE(store_branch_id, min_km, max_km)
);

-- 3.4: delivery_orders - Pedidos de delivery
CREATE TABLE IF NOT EXISTS delivery_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  store_branch_id uuid NOT NULL,
  customer_id uuid REFERENCES customers(id),
  
  order_type text NOT NULL CHECK (order_type IN ('delivery', 'pickup')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled')),
  
  items_json jsonb NOT NULL,
  subtotal decimal(10,2) NOT NULL DEFAULT 0,
  delivery_fee decimal(10,2) NOT NULL DEFAULT 0,
  discount decimal(10,2) NOT NULL DEFAULT 0,
  total decimal(10,2) NOT NULL DEFAULT 0,
  
  payment_method text CHECK (payment_method IN ('cash', 'credit_card', 'debit_card', 'pix')),
  change_amount decimal(10,2),
  
  delivery_address jsonb,
  customer_name text NOT NULL,
  customer_whatsapp text,
  customer_email text,
  
  notes text,
  estimated_delivery_time integer,
  
  confirmed_at timestamptz,
  preparing_at timestamptz,
  ready_at timestamptz,
  out_for_delivery_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  cancelled_reason text,
  
  whatsapp_sent boolean DEFAULT false,
  whatsapp_sent_at timestamptz,
  delivered_by uuid,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ==============================================================================
-- ÍNDICES
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_delivery_orders_org ON delivery_orders(organization_id);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_branch ON delivery_orders(store_branch_id);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_customer ON delivery_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_status ON delivery_orders(status);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_created ON delivery_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_delivery_neighborhoods_branch ON delivery_neighborhoods(store_branch_id);
CREATE INDEX IF NOT EXISTS idx_delivery_distance_branch ON delivery_distance_rates(store_branch_id);

-- ==============================================================================
-- RLS (ROW LEVEL SECURITY)
-- ==============================================================================
ALTER TABLE delivery_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_neighborhoods ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_distance_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_orders ENABLE ROW LEVEL SECURITY;

-- Policies delivery_settings
DROP POLICY IF EXISTS "delivery_settings_select";
CREATE POLICY "delivery_settings_select" ON delivery_settings FOR SELECT USING (true);
DROP POLICY IF EXISTS "delivery_settings_insert";
CREATE POLICY "delivery_settings_insert" ON delivery_settings FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "delivery_settings_update";
CREATE POLICY "delivery_settings_update" ON delivery_settings FOR UPDATE USING (true);
DROP POLICY IF EXISTS "delivery_settings_delete";
CREATE POLICY "delivery_settings_delete" ON delivery_settings FOR DELETE USING (true);

-- Policies delivery_neighborhoods
DROP POLICY IF EXISTS "delivery_neighborhoods_select";
CREATE POLICY "delivery_neighborhoods_select" ON delivery_neighborhoods FOR SELECT USING (true);
DROP POLICY IF EXISTS "delivery_neighborhoods_insert";
CREATE POLICY "delivery_neighborhoods_insert" ON delivery_neighborhoods FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "delivery_neighborhoods_update";
CREATE POLICY "delivery_neighborhoods_update" ON delivery_neighborhoods FOR UPDATE USING (true);
DROP POLICY IF EXISTS "delivery_neighborhoods_delete";
CREATE POLICY "delivery_neighborhoods_delete" ON delivery_neighborhoods FOR DELETE USING (true);

-- Policies delivery_distance_rates
DROP POLICY IF EXISTS "delivery_distance_rates_select";
CREATE POLICY "delivery_distance_rates_select" ON delivery_distance_rates FOR SELECT USING (true);
DROP POLICY IF EXISTS "delivery_distance_rates_insert";
CREATE POLICY "delivery_distance_rates_insert" ON delivery_distance_rates FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "delivery_distance_rates_update";
CREATE POLICY "delivery_distance_rates_update" ON delivery_distance_rates FOR UPDATE USING (true);
DROP POLICY IF EXISTS "delivery_distance_rates_delete";
CREATE POLICY "delivery_distance_rates_delete" ON delivery_distance_rates FOR DELETE USING (true);

-- Policies delivery_orders
DROP POLICY IF EXISTS "delivery_orders_select";
CREATE POLICY "delivery_orders_select" ON delivery_orders FOR SELECT USING (true);
DROP POLICY IF EXISTS "delivery_orders_insert";
CREATE POLICY "delivery_orders_insert" ON delivery_orders FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "delivery_orders_update";
CREATE POLICY "delivery_orders_update" ON delivery_orders FOR UPDATE USING (true);
DROP POLICY IF EXISTS "delivery_orders_delete";
CREATE POLICY "delivery_orders_delete" ON delivery_orders FOR DELETE USING (true);

-- ==============================================================================
-- REPLICA IDENTITY FULL (para Realtime)
-- ==============================================================================
ALTER TABLE delivery_settings REPLICA IDENTITY FULL;
ALTER TABLE delivery_neighborhoods REPLICA IDENTITY FULL;
ALTER TABLE delivery_distance_rates REPLICA IDENTITY FULL;
ALTER TABLE delivery_orders REPLICA IDENTITY FULL;

-- ==============================================================================
-- TRIGGERS updated_at
-- ==============================================================================
CREATE OR REPLACE FUNCTION fn_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_delivery_settings_updated_at ON delivery_settings;
CREATE TRIGGER trg_delivery_settings_updated_at BEFORE UPDATE ON delivery_settings FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

DROP TRIGGER IF EXISTS trg_delivery_neighborhoods_updated_at ON delivery_neighborhoods;
CREATE TRIGGER trg_delivery_neighborhoods_updated_at BEFORE UPDATE ON delivery_neighborhoods FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

DROP TRIGGER IF EXISTS trg_delivery_distance_rates_updated_at ON delivery_distance_rates;
CREATE TRIGGER trg_delivery_distance_rates_updated_at BEFORE UPDATE ON delivery_distance_rates FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

DROP TRIGGER IF EXISTS trg_delivery_orders_updated_at ON delivery_orders;
CREATE TRIGGER trg_delivery_orders_updated_at BEFORE UPDATE ON delivery_orders FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

-- ==============================================================================
-- REALTIME PUBLICATION
-- ==============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'delivery_settings') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE delivery_settings;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'delivery_neighborhoods') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE delivery_neighborhoods;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'delivery_distance_rates') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE delivery_distance_rates;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'delivery_orders') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE delivery_orders;
  END IF;
END $$;

-- ==============================================================================
-- VERIFICAÇÃO ETAPA 3
-- ==============================================================================
SELECT 'ETAPA 3 - Tabelas de delivery criadas:' as etapa;
SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'delivery%' ORDER BY tablename;
