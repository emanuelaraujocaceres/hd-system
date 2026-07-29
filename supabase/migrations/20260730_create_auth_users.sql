-- ==============================================================================
-- MIGRAÇÃO: Criar usuários no Supabase Auth (auth.users) a partir do system_users
-- ==============================================================================
-- Execute no SQL Editor do Supabase Dashboard.
-- ATENÇÃO: Isso NÃO cria senhas — cada usuário deve usar "Esqueci minha senha"
-- ou você pode definir senhas manualmente no Dashboard > Authentication > Users.
-- ==============================================================================

-- 1. Criar auth.users para cada system_users existente (se ainda não existir)
DO $$
DECLARE
  r RECORD;
  _auth_id UUID;
  _existing_id UUID;
BEGIN
  FOR r IN SELECT * FROM system_users WHERE active = true LOOP
    -- Verificar se já existe um auth.user com este email
    SELECT id INTO _existing_id FROM auth.users WHERE email = r.email LIMIT 1;
    
    IF _existing_id IS NULL THEN
      -- Inserir no auth.users com email confirmado
      INSERT INTO auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at,
        confirmation_token,
        email_change,
        email_change_token_new,
        recovery_token,
        is_super_admin,
        phone_confirmed_at,
        banned_until,
        is_sso_user,
        deleted_at
      ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        r.id,  -- usa o MESMO UUID do system_users
        'authenticated',
        'authenticated',
        r.email,
        -- A senha NÃO pode ser migrada diretamente (hash bcrypt com salt aleatório no frontend antigo)
        -- O usuário precisará redefinir a senha. Vamos gerar um hash impossível para forçar reset.
        crypt(gen_random_uuid()::text, gen_salt('bf')),
        NOW(),
        '{"provider":"email","providers":["email"]}',
        jsonb_build_object('name', r.name, 'role', r.role),
        r.created_at::timestamptz,
        NOW(),
        '',
        '',
        '',
        '',
        FALSE,
        NULL,
        NULL,
        FALSE,
        NULL
      );
      
      RAISE NOTICE '✓ Auth user created: % (%)', r.email, r.id;
    ELSE
      -- Já existe — atualizar se o id for diferente
      IF _existing_id != r.id THEN
        RAISE WARNING '⚠ Auth user % exists with different id (%) vs system_users id (%)', r.email, _existing_id, r.id;
      ELSE
        RAISE NOTICE '→ Auth user already exists: %', r.email;
      END IF;
    END IF;
  END LOOP;
END $$;

-- 2. Verificar resultado
SELECT 
  su.email,
  su.name,
  su.role,
  au.id AS auth_user_id,
  CASE WHEN au.id IS NOT NULL THEN '✅' ELSE '❌' END AS auth_created
FROM system_users su
LEFT JOIN auth.users au ON au.email = su.email
ORDER BY su.email;

-- 3. IMPORTANTE: Após rodar esta migração, vá ao Supabase Dashboard:
--    Authentication > Users > clique em cada usuário > "Reset password"
--    Defina a senha desejada para cada um.
-- ==============================================================================
