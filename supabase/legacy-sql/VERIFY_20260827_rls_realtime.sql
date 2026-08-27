-- VERIFY_20260827_rls_realtime.sql
-- ============================================================================
-- Auditoria READ-ONLY (NÃO escreve nada). Rodar no Supabase SQL Editor para
-- validar os pontos levantados pelo agente de auditoria + SRE do AGENTS.md.
-- ============================================================================

-- 1) Helper functions usam auth.uid() para usuários AUTENTICADOS?
--    (cardápio anon é a ÚNICA exceção que usa header x-branch-id via
--    cardapio_branch_from_header(); tudo autenticado deve derivar de auth.uid())
select proname,
       pg_get_function_result(oid) as ret,
       prosrc
from pg_proc
where proname in ('get_user_org_id','get_user_branch_id','is_superadmin')
order by proname;

-- 2) Tabelas na publicação supabase_realtime (Realtime NÃO morre se faltar tabela)
--    Compare com a lista de syncService.ts (tables do canal Realtime).
select pt.schemaname, pt.tablename
from pg_publication p
join pg_publication_tables pt on pt.pubname = p.pubname
where p.pubname = 'supabase_realtime'
order by pt.tablename;

-- 3) Policies com role {public} (expostas a anon) — revisar vazamento entre filiais
--    EXCEÇÃO PERMITIDA: policies *_anon do cardápio (products/categories/sales/
--    sale_items/customer_sessions/stock_movements/digital_menu_config/tables/
--    store_branches) e store_branches_select_anon / tables_select_anon.
select schemaname, tablename, policyname, roles, cmd,
       qual, with_check
from pg_policies
where 'public' = any(roles)
order by tablename, policyname;

-- 4) Usuários órfãos (system_users sem auth.users) — devem ser ZERO após o FIX
select s.id, s.email, s.role, s.organization_id, s.store_branch_id
from public.system_users s
left join auth.users a on a.id = s.id
where a.id is null
order by s.email;

-- 5) Filiais com 0 usuários (contexto — NÃO é bug por si só)
select b.id, b.name, b.organization_id,
       (select count(*) from public.system_users u where u.store_branch_id = b.id) as usuarios
from public.store_branches b
order by usuarios, b.name;

-- 6) self-read de system_users (get_my_profile dependse disto para o login)
select schemaname, tablename, policyname, roles, qual
from pg_policies
where tablename = 'system_users'
  and cmd = 'SELECT'
order by policyname;
