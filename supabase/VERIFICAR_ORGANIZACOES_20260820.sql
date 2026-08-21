-- =====================================================================
-- VERIFICAR ANTES DE AGIR — página Organizações
-- Hipótese: o único bloqueio é o JWT inválido ("issued at future").
-- Estas queries confirmam que, com um JWT VÁLIDO, a página voltará a
-- funcionar (RPC, helper, dados e grants estão todos corretos).
-- =====================================================================


-- 1. emanuel é superadmin e tem id consistente com auth.users?
--    Se superadmin=true e id_consistente=true => get_is_superadmin() dirá TRUE.
SELECT su.id, su.email, su.superadmin, su.organization_id,
       (au.id IS NOT NULL) AS tem_auth,
       (su.id = au.id)      AS id_consistente
FROM system_users su
LEFT JOIN auth.users au ON au.id = su.id
WHERE su.email = 'emanuel@gmail.com';


-- 2. Existem organizações para o RPC retornar?
SELECT id, name, created_at FROM organizations ORDER BY created_at DESC;


-- 3. Grants da RPC: deve ter authenticated + service_role, SEM anon/public.
SELECT p.proname,
       (p.proacl::text LIKE '%authenticated=%') AS auth_exec,
       (p.proacl::text LIKE '%service_role=%')  AS svc_exec,
       (p.proacl::text LIKE '%anon=%')          AS anon_exec,   -- deve ser FALSE
       (p.proacl::text LIKE '%public=%')        AS public_exec  -- deve ser FALSE
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'admin_fetch_organizations';


-- 4. get_is_superadmin() é SECURITY DEFINER e existe? (lógica correta)
SELECT p.proname, p.prosecdef AS security_definer, p.prokind
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'get_is_superadmin';


-- 5. Simula o retorno do RPC (roda a query interna) p/ confirmar que viria
--    dados se o JWT fosse válido. (Não depende de JWT — só mostra o resultado.)
SELECT COALESCE(json_agg(sub), '[]'::JSON) AS resultado_esperado_do_rpc
FROM (
  SELECT o.id, o.name, o.created_at,
    (SELECT COUNT(*)::INTEGER FROM store_branches sb WHERE sb.organization_id = o.id) AS branch_count,
    (SELECT COUNT(*)::INTEGER FROM system_users su WHERE su.organization_id = o.id) AS user_count
  FROM organizations o
  ORDER BY o.created_at DESC
) sub;
