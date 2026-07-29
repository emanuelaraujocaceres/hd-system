-- ==============================================================================
-- FIX: Corrigir IDs do system_users + atualizar RLS policies
-- ==============================================================================
-- PROBLEMA:
--   system_users.id continha UUIDs determinísticos (v5) do frontend, em vez do
--   Auth UUID real do Supabase. Com isso, RLS policies que usavam auth.uid() ou
--   auth.email() nunca funcionavam corretamente.
--
-- SOLUÇÃO:
--   1. Deletar registros órfãos (sem matching em auth.users)
--   2. Manter 1 registro por email (o que já tiver Auth UUID, se houver)
--   3. Atualizar o ID do registro mantido para o Auth UUID real
--   4. Atualizar RLS policies para usar id = auth.uid()
-- ==============================================================================

-- ═══════════════════════════════════════════════════════════════════════════════
-- PASSO 1: Deletar registros órfãos (sem email correspondente em auth.users)
-- ═══════════════════════════════════════════════════════════════════════════════
DELETE FROM system_users su
WHERE NOT EXISTS (
  SELECT 1 FROM auth.users au WHERE au.email = su.email
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- PASSO 2: Para emails com duplicatas, manter apenas o registro que já tem
-- o Auth UUID correto (se existir), ou manter o mais antigo
-- ═══════════════════════════════════════════════════════════════════════════════

-- 2a. Se houver um registro que já tem o Auth UUID como id, manter ele e
-- deletar os outros registros do mesmo email
DELETE FROM system_users su
WHERE su.id IN (
  SELECT su2.id FROM system_users su2
  WHERE su2.email IN (
    SELECT email FROM system_users GROUP BY email HAVING COUNT(*) > 1
  )
  -- Manter registros que já tem o Auth UUID correto
  AND NOT EXISTS (
    SELECT 1 FROM auth.users au
    WHERE au.id = su2.id AND au.email = su2.email
  )
);

-- 2b. Se ainda houver duplicatas (nenhum registro tinha o Auth UUID),
-- manter o de menor id (mais antigo/criado primeiro)
DELETE FROM system_users su
WHERE su.id IN (
  SELECT su2.id FROM (
    SELECT id, email, ROW_NUMBER() OVER (
      PARTITION BY email ORDER BY id ASC
    ) AS rn
    FROM system_users
    WHERE email IN (
      SELECT email FROM system_users GROUP BY email HAVING COUNT(*) > 1
    )
  ) su2
  WHERE su2.rn > 1
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- PASSO 3: Atualizar o ID do registro que sobrou para o Auth UUID real
-- ═══════════════════════════════════════════════════════════════════════════════
UPDATE system_users su
SET id = au.id
FROM auth.users au
WHERE su.email = au.email
  AND su.id != au.id;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PASSO 4: Atualizar RLS policies para usar id = auth.uid()
-- ═══════════════════════════════════════════════════════════════════════════════
-- Agora que system_users.id === auth.uid(), podemos comparar por ID de forma
-- confiável (mais seguro que email, que depende do JWT ter a claim de email)
DROP POLICY IF EXISTS "RLS_system_users_self_insert" ON system_users;
CREATE POLICY "RLS_system_users_self_insert" ON system_users
  FOR INSERT WITH CHECK (id = auth.uid());
DROP POLICY IF EXISTS "RLS_system_users_self_update" ON system_users;
CREATE POLICY "RLS_system_users_self_update" ON system_users
  FOR UPDATE USING (id = auth.uid());

-- ═══════════════════════════════════════════════════════════════════════════════
-- PASSO 5: Atualizar get_auth_user_org_id (remover fallback por email,
-- já que agora ids batem)
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_auth_user_org_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (SELECT organization_id FROM profiles WHERE id = auth.uid()),
    (SELECT organization_id FROM system_users WHERE id = auth.uid())
  );
$$;
GRANT EXECUTE ON FUNCTION public.get_auth_user_org_id TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PASSO 6: Garantir superadmin
-- ═══════════════════════════════════════════════════════════════════════════════
UPDATE system_users SET superadmin = TRUE WHERE email = 'emanuel@gmail.com';

-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO FINAL
-- ═══════════════════════════════════════════════════════════════════════════════
-- Rode depois para confirmar:
--   SELECT email, COUNT(*) FROM system_users GROUP BY email HAVING COUNT(*) > 1;
-- Deve retornar 0 linhas.
