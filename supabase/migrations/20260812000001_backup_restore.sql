-- =============================================================================
-- BACKUP/RESTORE SYSTEM - Isolado por filial
-- =============================================================================

-- 1. Tabela de backups por filial
CREATE TABLE IF NOT EXISTS filial_backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  store_branch_id uuid NOT NULL,
  backup_name text NOT NULL,
  backup_data jsonb NOT NULL, -- Todos os dados da filial
  data_size_bytes integer DEFAULT 0,
  record_count integer DEFAULT 0,
  created_by uuid, -- admin que criou
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  is_automatic boolean DEFAULT false, -- true = backup automático semanal
  restored_at timestamptz,
  restored_by uuid
);

-- 2. Índices
CREATE INDEX IF NOT EXISTS idx_filial_backups_org ON filial_backups(organization_id);
CREATE INDEX IF NOT EXISTS idx_filial_backups_branch ON filial_backups(store_branch_id);
CREATE INDEX IF NOT EXISTS idx_filial_backups_created ON filial_backups(created_at DESC);

-- 3. RLS
ALTER TABLE filial_backups ENABLE ROW LEVEL SECURITY;

-- Policies: superadmin e admin da organização podem ver/manage
DROP POLICY IF EXISTS "filial_backups_select" ON filial_backups;
CREATE POLICY "filial_backups_select" ON filial_backups FOR SELECT TO authenticated USING (
  organization_id = get_user_org_id() OR get_user_org_id() IS NULL
);

DROP POLICY IF EXISTS "filial_backups_insert" ON filial_backups;
CREATE POLICY "filial_backups_insert" ON filial_backups FOR INSERT TO authenticated WITH CHECK (
  organization_id = get_user_org_id() OR get_user_org_id() IS NULL
);

DROP POLICY IF EXISTS "filial_backups_update" ON filial_backups;
CREATE POLICY "filial_backups_update" ON filial_backups FOR UPDATE TO authenticated USING (
  organization_id = get_user_org_id() OR get_user_org_id() IS NULL
);

DROP POLICY IF EXISTS "filial_backups_delete" ON filial_backups;
CREATE POLICY "filial_backups_delete" ON filial_backups FOR DELETE TO authenticated USING (
  organization_id = get_user_org_id() OR get_user_org_id() IS NULL
);

-- 4. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.filial_backups TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.filial_backups TO anon;

-- 5. REPLICA IDENTITY FULL para Realtime
ALTER TABLE filial_backups REPLICA IDENTITY FULL;

-- 6. Adicionar à publicação Realtime
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'filial_backups') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE filial_backups;
  END IF;
END $$;

-- 7. Função para criar backup automático (via RPC)
CREATE OR REPLACE FUNCTION create_filial_backup(
  p_organization_id uuid,
  p_store_branch_id uuid,
  p_backup_name text,
  p_backup_data jsonb,
  p_is_automatic boolean DEFAULT false
)
RETURNS uuid AS $$
DECLARE
  v_backup_id uuid;
  v_record_count integer;
BEGIN
  -- Contar registros no backup
  v_record_count := (
    SELECT COALESCE(
      (p_backup_data->>'recordCount')::integer,
      0
    )
  );

  INSERT INTO filial_backups (
    organization_id,
    store_branch_id,
    backup_name,
    backup_data,
    data_size_bytes,
    record_count,
    created_by,
    is_automatic
  ) VALUES (
    p_organization_id,
    p_store_branch_id,
    p_backup_name,
    p_backup_data,
    octet_length(p_backup_data::text),
    v_record_count,
    auth.uid(),
    p_is_automatic
  ) RETURNING id INTO v_backup_id;

  -- Limitar a 10 backups por filial (manter os mais recentes)
  DELETE FROM filial_backups
  WHERE store_branch_id = p_store_branch_id
    AND id NOT IN (
      SELECT id FROM filial_backups
      WHERE store_branch_id = p_store_branch_id
      ORDER BY created_at DESC
      LIMIT 10
    );

  RETURN v_backup_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Verificação
SELECT 'filial_backups table created' as status;
