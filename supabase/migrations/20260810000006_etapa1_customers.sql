-- ==============================================================================
-- ETAPA 1: Extender tabela customers para Delivery
-- ==============================================================================
-- Adiciona campos necessários para delivery:
-- - birth_date: data de nascimento (para recuperação de senha)
-- - whatsapp: número do WhatsApp
-- - address_street, address_number, address_complement: endereço
-- - address_neighborhood, address_city, address_state, address_zip: localização
-- - google_id: ID do Google para login OAuth
-- - password_hash: senha para login manual
-- ==============================================================================

-- Adicionar colunas se não existirem
DO $$
BEGIN
  -- Data de nascimento
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'birth_date') THEN
    ALTER TABLE customers ADD COLUMN birth_date date;
  END IF;
  
  -- WhatsApp
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'whatsapp') THEN
    ALTER TABLE customers ADD COLUMN whatsapp text DEFAULT '';
  END IF;
  
  -- Endereço: Rua
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'address_street') THEN
    ALTER TABLE customers ADD COLUMN address_street text DEFAULT '';
  END IF;
  
  -- Endereço: Número
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'address_number') THEN
    ALTER TABLE customers ADD COLUMN address_number text DEFAULT '';
  END IF;
  
  -- Endereço: Complemento
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'address_complement') THEN
    ALTER TABLE customers ADD COLUMN address_complement text DEFAULT '';
  END IF;
  
  -- Endereço: Bairro
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'address_neighborhood') THEN
    ALTER TABLE customers ADD COLUMN address_neighborhood text DEFAULT '';
  END IF;
  
  -- Endereço: Cidade
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'address_city') THEN
    ALTER TABLE customers ADD COLUMN address_city text DEFAULT '';
  END IF;
  
  -- Endereço: Estado
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'address_state') THEN
    ALTER TABLE customers ADD COLUMN address_state text DEFAULT '';
  END IF;
  
  -- Endereço: CEP
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'address_zip') THEN
    ALTER TABLE customers ADD COLUMN address_zip text DEFAULT '';
  END IF;
  
  -- Google ID (para login OAuth)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'google_id') THEN
    ALTER TABLE customers ADD COLUMN google_id text;
  END IF;
  
  -- Password hash (para login manual do cliente)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'password_hash') THEN
    ALTER TABLE customers ADD COLUMN password_hash text;
  END IF;
  
  -- Tipo de cliente: 'walkin' (cadastro manual) ou 'delivery'
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'customer_type') THEN
    ALTER TABLE customers ADD COLUMN customer_type text DEFAULT 'walkin' CHECK (customer_type IN ('walkin', 'delivery', 'both'));
  END IF;
END $$;

-- ==============================================================================
-- VERIFICAÇÃO ETAPA 1
-- ==============================================================================
SELECT 'ETAPA 1 - Colunas adicionadas em customers:' as etapa;
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'customers'
ORDER BY ordinal_position;
