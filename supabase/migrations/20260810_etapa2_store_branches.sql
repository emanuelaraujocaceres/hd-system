-- ==============================================================================
-- ETAPA 2: Extender tabela store_branches para Delivery
-- ==============================================================================
-- Adiciona campos para:
-- - full_address: endereço completo para exibição e mapa
-- - whatsapp_phone: WhatsApp para pedidos PIX do delivery
-- - latitude/longitude: coordenadas para cálculo de distância
-- ==============================================================================

DO $$
BEGIN
  -- Endereço completo formatado
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'store_branches' AND column_name = 'full_address') THEN
    ALTER TABLE store_branches ADD COLUMN full_address text;
  END IF;
  
  -- WhatsApp para pedidos PIX
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'store_branches' AND column_name = 'whatsapp_phone') THEN
    ALTER TABLE store_branches ADD COLUMN whatsapp_phone text;
  END IF;
  
  -- Latitude para cálculo de distância
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'store_branches' AND column_name = 'latitude') THEN
    ALTER TABLE store_branches ADD COLUMN latitude decimal(10,8);
  END IF;
  
  -- Longitude para cálculo de distância
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'store_branches' AND column_name = 'longitude') THEN
    ALTER TABLE store_branches ADD COLUMN longitude decimal(11,8);
  END IF;
  
  -- Delivery habilitado por filial
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'store_branches' AND column_name = 'delivery_enabled') THEN
    ALTER TABLE store_branches ADD COLUMN delivery_enabled boolean DEFAULT false;
  END IF;
  
  -- Retirada habilitada por filial
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'store_branches' AND column_name = 'pickup_enabled') THEN
    ALTER TABLE store_branches ADD COLUMN pickup_enabled boolean DEFAULT true;
  END IF;
END $$;

-- ==============================================================================
-- VERIFICAÇÃO ETAPA 2
-- ==============================================================================
SELECT 'ETAPA 2 - Colunas adicionadas em store_branches:' as etapa;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'store_branches'
ORDER BY ordinal_position;
