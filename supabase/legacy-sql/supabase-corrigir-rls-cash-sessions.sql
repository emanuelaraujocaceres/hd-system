-- ==============================================================================
-- CORREÇÃO FINAL: cash_sessions RLS + sistema_users organization_id + perfis
-- ==============================================================================
-- Execute no SQL Editor do Supabase Dashboard
-- 
-- O que este script faz:
--   1. Corrige system_users com organization_id NULL → DEFAULT_ORG_ID
--   2. Corrige cash_sessions com organization_id NULL → DEFAULT_ORG_ID
--   3. Adiciona política RLS de auto-serviço para cash_sessions (por user_id)
--   4. Garante que get_auth_user_org_id() NUNCA retorne NULL (usa DEFAULT_ORG_ID como fallback final)
--   5. Cria trigger para cash_sessions garantir organization_id sempre preenchido
--   6. Cria trigger para system_users garantir organization_id sempre preenchido
--   7. Recria perfis na tabela profiles para TODOS os auth.users existentes
-- ==============================================================================

BEGIN;
SELECT '▶ CORREÇÃO FINAL cash_sessions + system_users' AS progresso;

-- ==============================================================================
-- PASSO 1: Corrigir organization_id NULL em system_users
-- ==============================================================================
SELECT '1️⃣  Corrigindo system_users com organization_id NULL...' AS progresso;

UPDATE system_users
SET organization_id = '00000000-0000-0000-0000-000000000001'
WHERE organization_id IS NULL;

-- ==============================================================================
-- PASSO 2: Corrigir organization_id NULL em cash_sessions  
-- ==============================================================================
SELECT '2️⃣  Corrigindo cash_sessions com organization_id NULL...' AS progresso;

UPDATE cash_sessions
SET organization_id = '00000000-0000-0000-0000-000000000001'
WHERE organization_id IS NULL;

-- ==============================================================================
-- PASSO 3: Adicionar política RLS de auto-serviço para cash_sessions
-- Permite que um usuário INSIRA/ATUALIZE/DELETE suas próprias sessões de caixa
-- independentemente do organization_id, desde que user_id corresponda ao auth.uid()
-- ==============================================================================
SELECT '3️⃣  Adicionando política RLS de auto-serviço para cash_sessions...' AS progresso;

DROP POLICY IF EXISTS "RLS_cash_sessions_self_upsert" ON cash_sessions;
CREATE POLICY "RLS_cash_sessions_self_upsert" ON cash_sessions
  FOR INSERT
  WITH CHECK (
    user_id IS NOT NULL AND user_id::text = auth.uid()::text
  );

DROP POLICY IF EXISTS "RLS_cash_sessions_self_update" ON cash_sessions;
CREATE POLICY "RLS_cash_sessions_self_update" ON cash_sessions
  FOR UPDATE
  USING (
    user_id IS NOT NULL AND user_id::text = auth.uid()::text
  );

DROP POLICY IF EXISTS "RLS_cash_sessions_self_delete" ON cash_sessions;
CREATE POLICY "RLS_cash_sessions_self_delete" ON cash_sessions
  FOR DELETE
  USING (
    user_id IS NOT NULL AND user_id::text = auth.uid()::text
  );

-- ==============================================================================
-- PASSO 4: Melhorar get_auth_user_org_id() — NUNCA retornar NULL
-- Adiciona fallback final para DEFAULT_ORG_ID
-- ==============================================================================
SELECT '4️⃣  Reforçando get_auth_user_org_id() com fallback DEFAULT_ORG_ID...' AS progresso;

CREATE OR REPLACE FUNCTION public.get_auth_user_org_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (SELECT organization_id FROM profiles WHERE id = auth.uid()),
    (SELECT organization_id FROM system_users WHERE id = auth.uid()),
    (SELECT organization_id FROM system_users WHERE email = (auth.jwt() ->> 'email')),
    '00000000-0000-0000-0000-000000000001' -- DEFAULT_ORG_ID final
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_auth_user_org_id TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_auth_user_org_id TO service_role;

-- ==============================================================================
-- PASSO 5: Trigger para cash_sessions — garantir organization_id na INSERT
-- ==============================================================================
SELECT '5️⃣  Criando trigger para cash_sessions garantir organization_id...' AS progresso;

CREATE OR REPLACE FUNCTION fn_ensure_cash_session_org()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := public.get_auth_user_org_id();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_cash_session_org ON cash_sessions;
CREATE TRIGGER trg_ensure_cash_session_org
  BEFORE INSERT OR UPDATE ON cash_sessions
  FOR EACH ROW
  EXECUTE FUNCTION fn_ensure_cash_session_org();

-- ==============================================================================
-- PASSO 6: Trigger para system_users — garantir organization_id na INSERT/UPDATE
-- ==============================================================================
SELECT '6️⃣  Criando trigger para system_users garantir organization_id...' AS progresso;

CREATE OR REPLACE FUNCTION fn_ensure_system_user_org()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := '00000000-0000-0000-0000-000000000001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_system_user_org ON system_users;
CREATE TRIGGER trg_ensure_system_user_org
  BEFORE INSERT OR UPDATE ON system_users
  FOR EACH ROW
  EXECUTE FUNCTION fn_ensure_system_user_org();

-- ==============================================================================
-- PASSO 7: Recriar perfis na tabela profiles para TODOS os auth.users existentes
-- (incluindo Gustavo que fez login após a execução anterior)
-- ==============================================================================
SELECT '7️⃣  Recriando perfis na tabela profiles para auth.users existentes...' AS progresso;

INSERT INTO profiles (id, organization_id, name, email, role)
SELECT au.id, 
  COALESCE(su.organization_id, '00000000-0000-0000-0000-000000000001'),
  COALESCE(su.name, au.raw_user_meta_data->>'name', au.email),
  au.email,
  COALESCE(su.role, 'collaborator')
FROM auth.users au
LEFT JOIN system_users su ON au.email = su.email
ON CONFLICT (id) DO UPDATE SET
  organization_id = COALESCE(EXCLUDED.organization_id, profiles.organization_id),
  name = COALESCE(EXCLUDED.name, profiles.name),
  email = COALESCE(EXCLUDED.email, profiles.email),
  role = COALESCE(EXCLUDED.role, profiles.role),
  updated_at = now();

-- ==============================================================================
-- PASSO 8: Verificação final
-- ==============================================================================
SELECT '8️⃣  Verificação final — contagem de correções:' AS progresso;

SELECT 'system_users with NULL org_id' AS tipo, COUNT(*) AS antes
FROM system_users WHERE organization_id IS NULL;
SELECT 'cash_sessions with NULL org_id' AS tipo, COUNT(*) AS antes
FROM cash_sessions WHERE organization_id IS NULL;
SELECT 'Total profiles' AS tipo, COUNT(*) AS quantidade
FROM profiles;
SELECT 'Total system_users' AS tipo, COUNT(*) AS quantidade
FROM system_users;
SELECT 'Total cash_sessions' AS tipo, COUNT(*) AS quantidade
FROM cash_sessions;

-- Verificar se get_auth_user_org_id() funciona para o usuário atual
SELECT 'Teste get_auth_user_org_id()' AS teste, public.get_auth_user_org_id() AS org_id;

COMMIT;

SELECT '✅ CORREÇÃO CONCLUÍDA — recarregue o sistema e teste o caixa' AS progresso;
