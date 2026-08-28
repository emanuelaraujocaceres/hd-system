-- FIX_20260827_orphan_adminjuninho.sql
-- ============================================================================
-- CORREÇÃO: usuário órfão adminjuninho@gmail.com
-- Sintoma: login falha com "Invalid login credentials".
-- Causa raiz (BUG-033): public.system_users.id DEVE ser igual a auth.users.id.
--   O registro existe em system_users mas NÃO existe em auth.users → auth.uid()
--   não resolve o perfil → get_user_org_id() retorna NULL → login fechado.
-- ============================================================================
-- SEGURANÇA (SRE):
--   * Idempotente: não recria se auth.users(id) já existir.
--   * Protegido: aborta se já houver OUTRO auth.users com o mesmo e-mail (id
--     diferente), evitando duplicar conta.
--   * RODE DENTRO DE TRANSAÇÃO implícita (DO block). Se falhar, nada é gravado.
--   * BACKUP antes de rodar:
--       create table if not exists _bak_system_users_20260827 as
--         select * from public.system_users where email = 'adminjuninho@gmail.com';
--   * ROLLBACK:
--       delete from auth.users where id = '<ID_CONFIRMADO_EM_SYSTEM_USERS>';
-- ============================================================================
-- ANTES DE RODAR, CONFIRME O ID EXATO:
--   select id, email, organization_id, role
--   from public.system_users where email = 'adminjuninho@gmail.com';
-- Substitua o e-mail abaixo se for outro usuário órfão.
-- ============================================================================

do $$
declare
  v_id uuid;
  v_email text := 'adminjuninho@gmail.com';
  v_exists_auth boolean;
  v_exists_other boolean;
begin
  -- 1) Resgata o id correto de system_users (fonte da verdade do app)
  select id into v_id
    from public.system_users
   where email = v_email
   limit 1;

  if v_id is null then
    raise exception 'system_users para % não encontrado. Abortando.', v_email;
  end if;

  -- 2) Idempotência: já existe auth.users com o MESMO id?
  select exists(select 1 from auth.users where id = v_id) into v_exists_auth;
  if v_exists_auth then
    raise notice 'auth.users já possui o id % — nada a fazer.', v_id;
    return;
  end if;

  -- 3) Protege contra e-mail duplicado com id DIFERENTE
  select exists(select 1 from auth.users where email = v_email) into v_exists_other;
  if v_exists_other then
    raise exception 'Outro auth.users com o e-mail % já existe com id diferente. '
                    'Resolva manualmente (alinhe o id ou remova o órfão).', v_email;
  end if;

  -- 4) Cria auth.users CASANDO o id (login volta a funcionar)
  insert into auth.users (
    id, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, aud, role
  ) values (
    v_id,
    v_email,
    crypt('Trocar@123', gen_salt('bf')),   -- SENHA TEMPORÁRIA — usuário deve trocar no 1º login
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('name', 'Admin Juninho', 'role', 'admin'),
    now(), now(), 'authenticated', 'authenticated'
  );

  raise notice 'OK: auth.users criado (id=%). Login de % restaurado. Senha temporária: Trocar@123',
    v_id, v_email;
end $$;

-- NOTA (não quebra login): o app NÃO consulta a tabela public.profiles, portanto
-- seu preenchimento é opcional para este caso. Se quiser manter BUG-033 estritamente
-- (system_users.id = profiles.id = auth.users.id), crie também:
--   insert into public.profiles (id, email, ...)
--   select id, email, ... from public.system_users where id = '<ID>'
--   on conflict (id) do nothing;
-- (confirme as colunas de public.profiles antes — elas NÃO foram verificadas nesta sessão.)
