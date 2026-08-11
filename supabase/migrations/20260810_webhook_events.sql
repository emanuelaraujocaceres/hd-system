-- ==============================================================================
-- WEBHOOK NOTIFICATIONS - Part 1: Tables
-- ==============================================================================

-- 1. Tabela para log de eventos de webhook (auditoria e debug)
CREATE TABLE IF NOT EXISTS webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  store_branch_id uuid,
  payment_id text,
  event_type text NOT NULL, -- 'payment.approved', 'payment.refunded', etc.
  payload jsonb NOT NULL,
  processed boolean DEFAULT false,
  processed_at timestamptz,
  error_message text,
  created_at timestamptz DEFAULT now()
);

-- 2. Índice para busca rápida por payment_id
CREATE INDEX IF NOT EXISTS idx_webhook_events_payment_id ON webhook_events(payment_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_branch ON webhook_events(store_branch_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_org ON webhook_events(organization_id);

-- 3. Habilitar RLS
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

-- 4. Policies
DROP POLICY IF EXISTS "webhook_events_select" ON webhook_events;
CREATE POLICY "webhook_events_select" ON webhook_events FOR SELECT TO authenticated USING (
  organization_id = get_user_org_id() OR get_user_org_id() IS NULL
);

DROP POLICY IF EXISTS "webhook_events_insert" ON webhook_events;
CREATE POLICY "webhook_events_insert" ON webhook_events FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "webhook_events_update" ON webhook_events;
CREATE POLICY "webhook_events_update" ON webhook_events FOR UPDATE TO authenticated USING (true);

-- 5. Grant privileges
GRANT SELECT, INSERT, UPDATE ON webhook_events TO authenticated;
GRANT SELECT, INSERT, UPDATE ON webhook_events TO anon;

-- 6. REPLICA IDENTITY FULL para Realtime
ALTER TABLE webhook_events REPLICA IDENTITY FULL;

-- 7. Adicionar à publicação Realtime
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'webhook_events') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE webhook_events;
  END IF;
END $$;

-- 8. Adicionar coluna payment_id na tabela sales (se não existir)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'payment_id') THEN
    ALTER TABLE sales ADD COLUMN payment_id text;
    CREATE INDEX idx_sales_payment_id ON sales(payment_id);
  END IF;
END $$;

-- 9. Verification
SELECT 'webhook_events table created' as status;
SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = 'webhook_events';
