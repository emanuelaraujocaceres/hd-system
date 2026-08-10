-- ==============================================================================
-- ETAPA 4: Criar tabela module_visibility
-- ==============================================================================
-- Controla quais módulos/páginas cada filial tem acesso
-- Regras de dependência:
--   - PDV precisa de Estoque
--   - Fiado precisa de Clientes (CRM)
--   - Delivery precisa de Estoque
--   - KDS precisa de PDV ou Delivery
--   - Dashboard precisa de Estoque
--   - Financeiro precisa de PDV ou Delivery
-- ==============================================================================

CREATE TABLE IF NOT EXISTS module_visibility (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  store_branch_id uuid NOT NULL UNIQUE,
  
  -- Módulos principais
  module_pdv boolean DEFAULT true,
  module_inventory boolean DEFAULT true,
  module_fiado boolean DEFAULT false,
  module_crm boolean DEFAULT false,
  module_dashboard boolean DEFAULT true,
  module_finance boolean DEFAULT false,
  module_kds boolean DEFAULT false,
  
  -- Delivery
  module_delivery boolean DEFAULT false,
  
  -- Cardápio Digital
  module_cardapio_digital boolean DEFAULT false,
  module_cardapio_preview boolean DEFAULT false,
  
  -- TV
  module_tv_showcase boolean DEFAULT false,
  module_tv_connect boolean DEFAULT false,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ==============================================================================
-- RLS
-- ==============================================================================
ALTER TABLE module_visibility ENABLE ROW LEVEL SECURITY;

CREATE POLICY "module_visibility_select" ON module_visibility FOR SELECT USING (true);
CREATE POLICY "module_visibility_insert" ON module_visibility FOR INSERT WITH CHECK (true);
CREATE POLICY "module_visibility_update" ON module_visibility FOR UPDATE USING (true);
CREATE POLICY "module_visibility_delete" ON module_visibility FOR DELETE USING (true);

-- ==============================================================================
-- REPLICA IDENTITY FULL
-- ==============================================================================
ALTER TABLE module_visibility REPLICA IDENTITY FULL;

-- ==============================================================================
-- TRIGGER updated_at
-- ==============================================================================
DROP TRIGGER IF EXISTS trg_module_visibility_updated_at ON module_visibility;
CREATE TRIGGER trg_module_visibility_updated_at BEFORE UPDATE ON module_visibility FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

-- ==============================================================================
-- REALTIME PUBLICATION
-- ==============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'module_visibility') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE module_visibility;
  END IF;
END $$;

-- ==============================================================================
-- VERIFICAÇÃO ETAPA 4
-- ==============================================================================
SELECT 'ETAPA 4 - module_visibility criada:' as etapa;
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'module_visibility'
ORDER BY ordinal_position;
