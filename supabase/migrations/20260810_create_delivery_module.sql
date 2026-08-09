-- ==============================================================================
-- MÓDULO DELIVERY - Estrutura Base
-- ==============================================================================
-- Data: 2026-08-10
-- Descrição: Cria tabelas para pedidos de delivery, configurações por filial,
--            bairros com taxas e faixas de distância.
-- ==============================================================================

-- ==============================================================================
-- 1. TABELA: delivery_settings
--    Configurações de delivery por filial
-- ==============================================================================
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
  
  -- Máximo de km para entrega (quando fee_calculation_type = 'distance')
  max_delivery_distance_km integer DEFAULT 15,
  
  -- Coordenadas da filial (para cálculo de distância)
  branch_latitude decimal(10,8),
  branch_longitude decimal(11,8),
  
  -- WhatsApp para pedidos PIX
  whatsapp_phone text,
  
  -- Endereço completo da filial (para mapa)
  full_address text,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ==============================================================================
-- 2. TABELA: delivery_neighborhoods
--    Bairros com taxas de entrega configuráveis
-- ==============================================================================
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
  
  -- Evitar duplicidade de bairro por filial
  UNIQUE(store_branch_id, neighborhood)
);

-- ==============================================================================
-- 3. TABELA: delivery_distance_rates
--    Faixas de distância com taxas de entrega
-- ==============================================================================
CREATE TABLE IF NOT EXISTS delivery_distance_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  store_branch_id uuid NOT NULL,
  
  -- Faixa de distância em km
  min_km decimal(6,2) NOT NULL DEFAULT 0,
  max_km decimal(6,2) NOT NULL,
  
  fee decimal(10,2) NOT NULL DEFAULT 0,
  estimated_time_minutes integer DEFAULT 45,
  is_active boolean DEFAULT true,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Evitar sobreposição de faixas por filial
  UNIQUE(store_branch_id, min_km, max_km)
);

-- ==============================================================================
-- 4. TABELA: delivery_orders
--    Pedidos de delivery (separada de sales/mesas)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS delivery_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  store_branch_id uuid NOT NULL,
  customer_id uuid, -- Referência à tabela customers (pode ser null para convidados)
  
  -- Número do pedido (para ex: #0001, #0002)
  order_number serial,
  
  -- Tipo de pedido: delivery ou retirada
  order_type text NOT NULL CHECK (order_type IN ('delivery', 'pickup')),
  
  -- Status do pedido
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled')),
  
  -- Itens do pedido (JSON com array de produtos)
  items_json jsonb NOT NULL,
  
  -- Valores
  subtotal decimal(10,2) NOT NULL DEFAULT 0,
  delivery_fee decimal(10,2) NOT NULL DEFAULT 0,
  discount decimal(10,2) NOT NULL DEFAULT 0,
  total decimal(10,2) NOT NULL DEFAULT 0,
  
  -- Forma de pagamento
  payment_method text CHECK (payment_method IN ('cash', 'credit_card', 'debit_card', 'pix')),
  change_amount decimal(10,2), -- Troco para quanto
  
  -- Endereço de entrega (snapshot no momento do pedido)
  delivery_address jsonb,
  -- Ex: {"street": "Rua X", "number": "123", "complement": "Apto 1", 
  --      "neighborhood": "Centro", "city": "São Paulo", "state": "SP", "zip": "01234-567"}
  
  -- Dados do cliente (para convidados ou snapshot)
  customer_name text NOT NULL,
  customer_whatsapp text,
  customer_email text,
  
  -- Observações do pedido
  notes text,
  
  -- Tempo estimado de entrega (minutos no momento do pedido)
  estimated_delivery_time integer,
  
  -- Rastreamento de status
  confirmed_at timestamptz,
  preparing_at timestamptz,
  ready_at timestamptz,
  out_for_delivery_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  cancelled_reason text,
  
  -- Controle de envio para WhatsApp
  whatsapp_sent boolean DEFAULT false,
  whatsapp_sent_at timestamptz,
  
  -- Colaborador que marcou como entregue
  delivered_by uuid,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ==============================================================================
-- 5. ÍNDICES PARA PERFORMANCE
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_delivery_orders_org ON delivery_orders(organization_id);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_branch ON delivery_orders(store_branch_id);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_customer ON delivery_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_status ON delivery_orders(status);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_created ON delivery_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_type ON delivery_orders(order_type);
CREATE INDEX IF NOT EXISTS idx_delivery_neighborhoods_branch ON delivery_neighborhoods(store_branch_id);
CREATE INDEX IF NOT EXISTS idx_delivery_distance_branch ON delivery_distance_rates(store_branch_id);

-- ==============================================================================
-- 6. RLS (ROW LEVEL SECURITY) - OBRIGATÓRIO
-- ==============================================================================
ALTER TABLE delivery_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_neighborhoods ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_distance_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_orders ENABLE ROW LEVEL SECURITY;

-- Policies para delivery_settings
CREATE POLICY "delivery_settings_select" ON delivery_settings FOR SELECT USING (true);
CREATE POLICY "delivery_settings_insert" ON delivery_settings FOR INSERT WITH CHECK (true);
CREATE POLICY "delivery_settings_update" ON delivery_settings FOR UPDATE USING (true);
CREATE POLICY "delivery_settings_delete" ON delivery_settings FOR DELETE USING (true);

-- Policies para delivery_neighborhoods
CREATE POLICY "delivery_neighborhoods_select" ON delivery_neighborhoods FOR SELECT USING (true);
CREATE POLICY "delivery_neighborhoods_insert" ON delivery_neighborhoods FOR INSERT WITH CHECK (true);
CREATE POLICY "delivery_neighborhoods_update" ON delivery_neighborhoods FOR UPDATE USING (true);
CREATE POLICY "delivery_neighborhoods_delete" ON delivery_neighborhoods FOR DELETE USING (true);

-- Policies para delivery_distance_rates
CREATE POLICY "delivery_distance_rates_select" ON delivery_distance_rates FOR SELECT USING (true);
CREATE POLICY "delivery_distance_rates_insert" ON delivery_distance_rates FOR INSERT WITH CHECK (true);
CREATE POLICY "delivery_distance_rates_update" ON delivery_distance_rates FOR UPDATE USING (true);
CREATE POLICY "delivery_distance_rates_delete" ON delivery_distance_rates FOR DELETE USING (true);

-- Policies para delivery_orders
CREATE POLICY "delivery_orders_select" ON delivery_orders FOR SELECT USING (true);
CREATE POLICY "delivery_orders_insert" ON delivery_orders FOR INSERT WITH CHECK (true);
CREATE POLICY "delivery_orders_update" ON delivery_orders FOR UPDATE USING (true);
CREATE POLICY "delivery_orders_delete" ON delivery_orders FOR DELETE USING (true);

-- ==============================================================================
-- 7. REPLICA IDENTITY FULL (para Realtime)
-- ==============================================================================
ALTER TABLE delivery_settings REPLICA IDENTITY FULL;
ALTER TABLE delivery_neighborhoods REPLICA IDENTITY FULL;
ALTER TABLE delivery_distance_rates REPLICA IDENTITY FULL;
ALTER TABLE delivery_orders REPLICA IDENTITY FULL;

-- ==============================================================================
-- 8. TRIGGER PARA ATUALIZAR updated_at
-- ==============================================================================
CREATE OR REPLACE FUNCTION fn_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_delivery_settings_updated_at
  BEFORE UPDATE ON delivery_settings
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE TRIGGER trg_delivery_neighborhoods_updated_at
  BEFORE UPDATE ON delivery_neighborhoods
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE TRIGGER trg_delivery_distance_rates_updated_at
  BEFORE UPDATE ON delivery_distance_rates
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE TRIGGER trg_delivery_orders_updated_at
  BEFORE UPDATE ON delivery_orders
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

-- ==============================================================================
-- 9. ADICIONAR TABELAS NA PUBLICAÇÃO REALTIME
-- ==============================================================================
-- NOTA: Executar apenas se supabase_realtime já existir
-- ALTER PUBLICATION supabase_realtime ADD TABLE delivery_settings;
-- ALTER PUBLICATION supabase_realtime ADD TABLE delivery_neighborhoods;
-- ALTER PUBLICATION supabase_realtime ADD TABLE delivery_distance_rates;
-- ALTER PUBLICATION supabase_realtime ADD TABLE delivery_orders;

DO $$
BEGIN
  -- Adiciona à publicação se não estiver
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
-- 10. VERIFICAÇÃO FINAL
-- ==============================================================================
SELECT 'delivery_settings' as table_name, count(*) as row_count FROM delivery_settings
UNION ALL
SELECT 'delivery_neighborhoods', count(*) FROM delivery_neighborhoods
UNION ALL
SELECT 'delivery_distance_rates', count(*) FROM delivery_distance_rates
UNION ALL
SELECT 'delivery_orders', count(*) FROM delivery_orders;
