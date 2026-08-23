-- ============================================================
-- Migration: Controle de Lote/Validade (Lot Expiration)
-- Data: 2026-08-14
-- Descrição: Tabelas product_lots e stock_loss_log para
--   rastreamento de lotes, FEFO e baixa por validade.
-- ============================================================

-- 0. Adicionar flag use_lots na tabela products (modelo misto)
ALTER TABLE products ADD COLUMN IF NOT EXISTS use_lots BOOLEAN DEFAULT false;
COMMENT ON COLUMN products.use_lots IS 'Habilita rastreamento por lote (FEFO). false = estoque global simples.';

-- 1. Criar tabela product_lots
CREATE TABLE IF NOT EXISTS product_lots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_branch_id UUID NOT NULL REFERENCES store_branches(id) ON DELETE CASCADE,
  product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  lot_number      TEXT NOT NULL,
  expiration_date DATE NOT NULL,
  quantity        INTEGER NOT NULL DEFAULT 0,
  cost_price      NUMERIC(12,2),
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'disposed')),
  supplier_id     UUID REFERENCES suppliers(id),
  received_at     TIMESTAMPTZ DEFAULT now(),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(product_id, lot_number)
);

COMMENT ON TABLE product_lots IS 'Lotes de produto com validade e quantidade独立. Usado para FEFO.';
COMMENT ON COLUMN product_lots.lot_number IS 'Código do lote do fornecedor (ex: LOTE-2026-001)';
COMMENT ON COLUMN product_lots.quantity IS 'Quantidade em estoque deste lote específico';
COMMENT ON COLUMN product_lots.cost_price IS 'Custo específico deste lote (pode diferir de lote para lote)';
COMMENT ON COLUMN product_lots.status IS 'active = em estoque; expired = vencido; disposed = descartado';

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_product_lots_org ON product_lots(organization_id);
CREATE INDEX IF NOT EXISTS idx_product_lots_branch ON product_lots(store_branch_id);
CREATE INDEX IF NOT EXISTS idx_product_lots_product ON product_lots(product_id);
CREATE INDEX IF NOT EXISTS idx_product_lots_expiration ON product_lots(expiration_date);
CREATE INDEX IF NOT EXISTS idx_product_lots_status ON product_lots(status);
CREATE INDEX IF NOT EXISTS idx_product_lots_fefo ON product_lots(product_id, status, expiration_date);

-- 2. Criar tabela stock_loss_log
CREATE TABLE IF NOT EXISTS stock_loss_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_branch_id UUID NOT NULL REFERENCES store_branches(id) ON DELETE CASCADE,
  product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  lot_id          UUID REFERENCES product_lots(id) ON DELETE SET NULL,
  quantity        INTEGER NOT NULL,
  reason          TEXT NOT NULL CHECK (reason IN ('expired', 'damaged', 'other')),
  operator_name   TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE stock_loss_log IS 'Registro de perdas de estoque (validade, avaria, etc.)';

-- Índices
CREATE INDEX IF NOT EXISTS idx_stock_loss_log_org ON stock_loss_log(organization_id);
CREATE INDEX IF NOT EXISTS idx_stock_loss_log_branch ON stock_loss_log(store_branch_id);
CREATE INDEX IF NOT EXISTS idx_stock_loss_log_product ON stock_loss_log(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_loss_log_lot ON stock_loss_log(lot_id);

-- 3. Habilitar RLS em product_lots
ALTER TABLE product_lots ENABLE ROW LEVEL SECURITY;

-- Policies para product_lots (simples: superadmin = organization_id IS NULL)
-- Usuário logado terá organization_id preenchido e acesso via JWT claims
DROP POLICY IF EXISTS "product_lots_org_isolation" ON product_lots;
DROP POLICY IF EXISTS "product_lots_allow_insert" ON product_lots;
DROP POLICY IF EXISTS "product_lots_allow_select" ON product_lots;
DROP POLICY IF EXISTS "product_lots_allow_update" ON product_lots;
DROP POLICY IF EXISTS "product_lots_allow_delete" ON product_lots;

DROP POLICY IF EXISTS "product_lots_superadmin";
CREATE POLICY "product_lots_superadmin" ON product_lots
  FOR ALL USING (organization_id IS NULL);

-- Política para usuários autenticados (será aplicada quando JWT estiver disponível)
-- Usando @ sign para evitar conflito com naming conventions
DROP POLICY IF EXISTS "product_lots_auth_users";
CREATE POLICY "product_lots_auth_users" ON product_lots
  FOR ALL USING (
    organization_id::text = current_setting('request.jwt.claims', true)::json->>'organization_id'
  );

-- 4. Habilitar RLS em stock_loss_log
ALTER TABLE stock_loss_log ENABLE ROW LEVEL SECURITY;

-- Policies para stock_loss_log (mesmo padrão)
DROP POLICY IF EXISTS "stock_loss_log_superadmin" ON stock_loss_log;
DROP POLICY IF EXISTS "stock_loss_log_auth_users" ON stock_loss_log;

CREATE POLICY "stock_loss_log_superadmin" ON stock_loss_log
  FOR ALL USING (organization_id IS NULL);

CREATE POLICY "stock_loss_log_auth_users" ON stock_loss_log
  FOR ALL USING (
    organization_id::text = current_setting('request.jwt.claims', true)::json->>'organization_id'
  );

-- 5. Adicionar às publicações Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE product_lots;
ALTER PUBLICATION supabase_realtime ADD TABLE stock_loss_log;

-- REPLICA IDENTITY FULL para payload completo de UPDATE/DELETE
ALTER TABLE product_lots REPLICA IDENTITY FULL;
ALTER TABLE stock_loss_log REPLICA IDENTITY FULL;

-- 6. Verificar criação
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_lots' AND column_name = 'lot_number'
  ) THEN
    RAISE NOTICE 'OK: Tabela product_lots criada com sucesso';
  ELSE
    RAISE WARNING 'ERRO: Tabela product_lots NÃO foi criada!';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stock_loss_log' AND column_name = 'reason'
  ) THEN
    RAISE NOTICE 'OK: Tabela stock_loss_log criada com sucesso';
  ELSE
    RAISE WARNING 'ERRO: Tabela stock_loss_log NÃO foi criada!';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'use_lots'
  ) THEN
    RAISE NOTICE 'OK: Coluna use_lots adicionada à tabela products';
  ELSE
    RAISE WARNING 'ERRO: Coluna use_lots NÃO foi adicionada!';
  END IF;
END $$;
