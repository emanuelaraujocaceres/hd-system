-- ==============================================================================
-- FIX: RLS policies para system_users e system_settings
-- ==============================================================================
-- Problema: O sync offline tenta upsert em system_users e system_settings via
-- storageService, mas o RLS bloqueia porque a policy atual só permite operações
-- na mesma organization_id, sem considerar que o próprio usuário pode upsert
-- seu próprio registro.
--
-- Solução: Adicionar policy que permite cada usuário inserir/atualizar seu
-- próprio registro (auth.uid() = id).
-- ==============================================================================

-- system_users: permitir que o próprio usuário gerencie seu registro
CREATE POLICY "RLS_system_users_self_insert" ON system_users
  FOR INSERT WITH CHECK (id = auth.uid());
CREATE POLICY "RLS_system_users_self_update" ON system_users
  FOR UPDATE USING (id = auth.uid());

-- system_settings: permitir que o próprio usuário gerencie settings da sua org
CREATE POLICY "RLS_system_settings_self_insert" ON system_settings
  FOR INSERT WITH CHECK (organization_id = get_auth_user_org_id());
CREATE POLICY "RLS_system_settings_self_update" ON system_settings
  FOR UPDATE USING (organization_id = get_auth_user_org_id());

-- NOTA: As policies existentes (RLS_system_users_select/insert/update/delete)
-- com organization_id = get_auth_user_org_id() continuam vigentes.
-- As novas policies são um adicional para cobrir o caso self.
