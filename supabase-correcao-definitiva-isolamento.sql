-- ==============================================================================
-- CORREÇÃO DEFINITIVA — ISOLAMENTO MULTI-TENANT HD-System
-- ==============================================================================
-- Execute no SQL Editor do Supabase Dashboard APÓS rodar o diagnóstico
-- (supabase-diagnostico-isolamento.sql) e confirmar o mapeamento de e-mails
-- na seção 3B abaixo.
--
-- O que este script faz (tudo idempotente — pode rodar mais de uma vez):
--   1. Remove duplicatas em system_users (mantém o registro ligado ao Auth)
--   2. Alinha system_users.id → auth.users.id (por e-mail)
--   3. Corrige organization_id NULL (filial vinculada → org da filial;
--      + mapeamento explícito confirmado na seção 3B)
--   4. Reconstrói profiles (id = auth.uid()) para todos os auth.users
--   5. get_auth_user_org_id() FAIL-CLOSED (SEM fallback para org padrão)
--   6. is_superadmin() / get_is_superadmin() com fallback por e-mail
--   7. get_my_profile() — perfil do usuário logado (usado no login)
--   8. Trigger on_auth_user_created → cria profile automaticamente
--   9. Trigger fn_ensure_cash_session_org (org sempre preenchida no caixa)
--  10. Policies self-service de cash_sessions SOMENTE da própria org
--  11. Verificação final
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. REMOVER DUPLICATAS EM system_users (mesmo e-mail)
--    Mantém: registro cujo id já é o Auth UUID → depois o mais antigo.
--    Reatribui a atividade (sales/cash_sessions) dos removidos ao id mantido.
-- ==============================================================================
SELECT '1/11: Deduplicando system_users...' AS progresso;

CREATE TEMP TABLE su_dedup_map ON COMMIT DROP AS
WITH ranked AS (
  SELECT su.id,
         su.email,
         au.id AS auth_id,
         ROW_NUMBER() OVER (
           PARTITION BY su.email
           ORDER BY CASE
                      WHEN au.id IS NOT NULL AND su.id = au.id THEN 0
                      WHEN au.id IS NOT NULL THEN 1
                      ELSE 2
                    END,
                    su.created_at ASC,
                    su.id ASC
         ) AS rn,
         COUNT(*) OVER (PARTITION BY su.email) AS cnt
  FROM system_users su
  LEFT JOIN auth.users au ON au.email = su.email
)
SELECT id, email, auth_id, rn, cnt
FROM ranked
WHERE cnt > 1;

-- Reatribui vendas e caixas dos duplicados removidos para o id mantido (Auth)
UPDATE sales SET user_id = d.auth_id::text
FROM su_dedup_map d
WHERE d.rn > 1 AND d.auth_id IS NOT NULL
  AND sales.user_id::text = d.id::text;

UPDATE cash_sessions SET user_id = d.auth_id::text
FROM su_dedup_map d
WHERE d.rn > 1 AND d.auth_id IS NOT NULL
  AND cash_sessions.user_id::text = d.id::text;

-- Remove os duplicados
DELETE FROM system_users su
USING su_dedup_map d
WHERE su.id = d.id AND d.rn > 1;

DROP TABLE su_dedup_map;

-- ==============================================================================
-- 2. ALINHAR system_users.id → auth.users.id (por e-mail)
--    Garante que system_users.id === auth.uid() para TODOS
-- ==============================================================================
SELECT '2/11: Alinhando IDs com o Auth...' AS progresso;

UPDATE system_users su
SET id = au.id
FROM auth.users au
WHERE au.email = su.email
  AND su.id != au.id;

-- ==============================================================================
-- 3. CORRIGIR organization_id NULL
-- ==============================================================================
SELECT '3/11: Corrigindo organization_id NULL...' AS progresso;

-- 3A. Inferência segura: filial vinculada no cadastro → org da filial
UPDATE system_users su
SET organization_id = sb.organization_id
FROM store_branches sb
WHERE su.organization_id IS NULL
  AND sb.id::text = su.store_branch_id;

-- 3B. MAPEAMENTO EXPLÍCITO (CONFIRMADO NO DIAGNÓSTICO)
-- >>> AJUSTE AQUI: troque os e-mails pelos reais do diagnóstico e confirme a org.
--     Plantão da Cerveja = 361fb95a-3e9f-43be-a43c-0dc91f851f31
--     Adega dos Parças (padrão) = 00000000-0000-0000-0000-000000000001
UPDATE system_users su
SET organization_id = m.org_id
FROM (VALUES
  ('emanuel@gmail.com',            '00000000-0000-0000-0000-000000000001')
  -- Exemplos (descomente e ajuste):
  -- ('gustavo@exemplo.com',        '361fb95a-3e9f-43be-a43c-0dc91f851f31'),
  -- ('maria@exemplo.com',          '361fb95a-3e9f-43be-a43c-0dc91f851f31')
) AS m(email, org_id)
WHERE su.email = m.email;

-- 3C. RELATÓRIO: usuários que continuam SEM org (serão bloqueados até corrigir)
SELECT '⚠️ Usuários que continuam SEM organização (serão bloqueados):' AS aviso;
SELECT id, email, name, role FROM system_users WHERE organization_id IS NULL;

-- ==============================================================================
-- 4. RECONSTRUIR PROFILES (id = auth.uid()) PARA TODOS OS auth.users
--    Perfis sem org ficam NULL → usuário bloqueado até o admin vincular
-- ==============================================================================
SELECT '4/11: Reconstruindo profiles...' AS progresso;

INSERT INTO profiles (id, organization_id, name, email, role)
SELECT
  au.id,
  su.organization_id,
  COALESCE(su.name, au.raw_user_meta_data ->> 'name', au.email),
  au.email,
  COALESCE(su.role, 'collaborator')
FROM auth.users au
LEFT JOIN system_users su ON su.email = au.email
ON CONFLICT (id) DO UPDATE SET
  organization_id = COALESCE(EXCLUDED.organization_id, profiles.organization_id),
  name            = COALESCE(EXCLUDED.name, profiles.name),
  email           = EXCLUDED.email,
  role            = COALESCE(EXCLUDED.role, profiles.role),
  updated_at      = now();

-- ==============================================================================
-- 5. get_auth_user_org_id() — FAIL-CLOSED
--    Ordem: profiles(auth.uid) → system_users(auth.uid) → system_users(e-mail JWT)
--    SEM fallback para a org padrão! Se nada bater → NULL → RLS bloqueia.
--    (o fallback para DEFAULT era o que permitia gravar dados na org errada)
-- ==============================================================================
SELECT '5/11: Reforçando get_auth_user_org_id() (fail-closed)...' AS progresso;

CREATE OR REPLACE FUNCTION public.get_auth_user_org_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT organization_id FROM profiles WHERE id = auth.uid()),
    (SELECT organization_id FROM system_users WHERE id = auth.uid()),
    -- Último recurso por e-mail do JWT: só usa se houver EXATAMENTE 1 registro
    (
      SELECT organization_id
      FROM (
        SELECT organization_id, COUNT(*) OVER () AS total
        FROM system_users
        WHERE email = (auth.jwt() ->> 'email')
          AND organization_id IS NOT NULL
      ) t
      WHERE t.total = 1
      LIMIT 1
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_auth_user_org_id TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_auth_user_org_id TO service_role;

-- ==============================================================================
-- 6. is_superadmin() / get_is_superadmin() com fallback por e-mail
-- ==============================================================================
SELECT '6/11: Reforçando is_superadmin()...' AS progresso;

CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM system_users
    WHERE superadmin = TRUE
      AND (id = auth.uid() OR email = (auth.jwt() ->> 'email'))
    LIMIT 1
  );
$$;

CREATE OR REPLACE FUNCTION public.get_is_superadmin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM system_users
    WHERE superadmin = TRUE
      AND (id = auth.uid() OR email = (auth.jwt() ->> 'email'))
    LIMIT 1
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_superadmin TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_is_superadmin TO authenticated;

-- ==============================================================================
-- 7. get_my_profile() — perfil completo do usuário logado
--    Usado no login do app (independe de RLS sobre system_users)
-- ==============================================================================
SELECT '7/11: Criando get_my_profile()...' AS progresso;

CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS JSON
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_email TEXT := auth.jwt() ->> 'email';
  v_row system_users%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO v_row
  FROM system_users
  WHERE id = v_uid OR email = v_email
  ORDER BY CASE WHEN id = v_uid THEN 0 ELSE 1 END
  LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN json_build_object(
    'id', v_row.id,
    'name', v_row.name,
    'email', v_row.email,
    'role', v_row.role,
    'organization_id', v_row.organization_id,
    'store_branch_id', v_row.store_branch_id,
    'superadmin', v_row.superadmin,
    'permissions', v_row.permissions,
    'active', v_row.active,
    'created_at', v_row.created_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_profile TO authenticated;

-- ==============================================================================
-- 8. TRIGGER: criar profile automaticamente para novos usuários do Auth
--    (admin cria no Supabase Dashboard ou via servidor → profile já nasce)
-- ==============================================================================
SELECT '8/11: Criando trigger on_auth_user_created...' AS progresso;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, organization_id, name, email, role)
  VALUES (
    NEW.id,
    NULL,
    COALESCE(NEW.raw_user_meta_data ->> 'name', NEW.email),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'role', 'collaborator')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ==============================================================================
-- 9. TRIGGER: cash_sessions sempre com organization_id preenchida
-- ==============================================================================
SELECT '9/11: Recriando trigger de cash_sessions...' AS progresso;

CREATE OR REPLACE FUNCTION public.fn_ensure_cash_session_org()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
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
  EXECUTE FUNCTION public.fn_ensure_cash_session_org();

-- ==============================================================================
-- 10. POLICIES self-service de cash_sessions (própria sessão + PRÓPRIA org)
--     Rede de segurança: o usuário gerencia apenas o caixa dele e da sua org.
--     NÃO permitem ver nem tocar dados de outra organização.
-- ==============================================================================
SELECT '10/11: Ajustando policies self-service de cash_sessions...' AS progresso;

DROP POLICY IF EXISTS "RLS_cash_sessions_self_insert" ON cash_sessions;
DROP POLICY IF EXISTS "RLS_cash_sessions_self_update" ON cash_sessions;
DROP POLICY IF EXISTS "RLS_cash_sessions_self_delete" ON cash_sessions;
DROP POLICY IF EXISTS "RLS_cash_sessions_self_upsert" ON cash_sessions;

CREATE POLICY "RLS_cash_sessions_self_insert" ON cash_sessions
  FOR INSERT
  WITH CHECK (
    user_id IS NOT NULL
    AND user_id::text = auth.uid()::text
    AND organization_id = get_auth_user_org_id()
  );

CREATE POLICY "RLS_cash_sessions_self_update" ON cash_sessions
  FOR UPDATE
  USING (
    user_id IS NOT NULL
    AND user_id::text = auth.uid()::text
    AND organization_id = get_auth_user_org_id()
  )
  WITH CHECK (
    user_id IS NOT NULL
    AND user_id::text = auth.uid()::text
    AND organization_id = get_auth_user_org_id()
  );

CREATE POLICY "RLS_cash_sessions_self_delete" ON cash_sessions
  FOR DELETE
  USING (
    user_id IS NOT NULL
    AND user_id::text = auth.uid()::text
    AND organization_id = get_auth_user_org_id()
  );

-- Garantir superadmin (rede de segurança adicional)
UPDATE system_users SET superadmin = TRUE WHERE email = 'emanuel@gmail.com';

-- ==============================================================================
-- 11. VERIFICAÇÃO FINAL
-- ==============================================================================
SELECT '11/11: Verificação final...' AS progresso;

SELECT '--- system_users após correção ---' AS info;
SELECT id, email, name, role, organization_id, store_branch_id, superadmin
FROM system_users
ORDER BY email;

SELECT '--- profiles após correção ---' AS info;
SELECT id, email, name, organization_id FROM profiles ORDER BY email;

SELECT '--- duplicatas restantes (deve ser 0) ---' AS info;
SELECT email, COUNT(*) FROM system_users GROUP BY email HAVING COUNT(*) > 1;

SELECT '--- system_users sem org (deve ser 0) ---' AS info;
SELECT email FROM system_users WHERE organization_id IS NULL;

SELECT '--- definição final da função de isolamento ---' AS info;
SELECT pg_get_functiondef('public.get_auth_user_org_id()'::regprocedure) AS definicao;

COMMIT;

SELECT '✅ CORREÇÃO DEFINITIVA APLICADA — próximo passo: rebuild + redeploy do app' AS progresso;
