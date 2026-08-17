-- ══════════════════════════════════════════════════════════════════════
-- AUDIT LOG TABLE
-- Tracks admin actions for security and compliance
-- ══════════════════════════════════════════════════════════════════════

-- 1. Create the audit_log table
CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  store_branch_id UUID,
  user_id UUID NOT NULL,
  user_name TEXT NOT NULL,
  user_email TEXT NOT NULL,
  action TEXT NOT NULL,           -- 'create', 'update', 'delete', 'login', 'logout', 'config_change'
  entity_type TEXT NOT NULL,      -- 'user', 'product', 'sale', 'customer', 'supplier', 'table', 'settings', etc.
  entity_id TEXT,                 -- ID of the affected entity (optional)
  entity_name TEXT,               -- Name/description of the affected entity (for readability)
  old_value JSONB,               -- Previous state (for updates)
  new_value JSONB,               -- New state (for creates/updates)
  ip_address TEXT,               -- Client IP (if available)
  user_agent TEXT,               -- Browser user agent
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Enable RLS
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- 3. Policies: only admins can read, system can insert
CREATE POLICY "audit_log_insert_system"
  ON public.audit_log FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "audit_log_read_admin"
  ON public.audit_log FOR SELECT
  TO authenticated
  USING (
    is_superadmin()
    OR (
      organization_id = get_user_org_id()
      AND get_user_role() = 'admin'
    )
  );

-- 4. Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_audit_log_org_created
  ON public.audit_log (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_user
  ON public.audit_log (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_entity
  ON public.audit_log (entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_audit_log_action
  ON public.audit_log (action, created_at DESC);

-- 5. Add to realtime publication (optional — for live audit feed)
ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_log;
ALTER TABLE public.audit_log REPLICA IDENTITY FULL;
