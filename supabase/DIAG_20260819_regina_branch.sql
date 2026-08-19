-- =====================================================================
-- DIAGNÓSTICO 2026-08-19: "regina@gmail.com não vê a filial dela"
--
-- Cobre as 4 causas prováveis de filial invisível p/ usuário logado:
--  A) Mismatch de identidade: system_users.id ≠ auth.users.id
--     (se o usuário foi criado pelo RPC SQL antigo admin_create_organization
--      que gerava UUID aleatório e não criava conta no Auth, o auth.uid()
--      do RLS NÃO encontra a linha → get_user_org_id() = NULL → o usuário
--      não vê NENHUMA filial/dado da org). Causa #1 suspeita.
--  B) Filiais da org com organization_id divergente (ou NULL)
--  C) Políticas de store_branches ausentes/erradas para authenticated
--  D) Órfãos: branch apontando para org inexistente
-- Só LEITURA. Rode no Supabase SQL Editor.
-- =====================================================================

-- ─── A) MATRIZ DE IDENTIDADE (sistema vs Auth) ───────────────────────
SELECT
  su.id                 AS system_user_id,
  su.email,
  su.organization_id    AS su_org,
  su.store_branch_id    AS su_branch,
  su.role,
  su.superadmin,
  su.active,
  au.id                 AS auth_user_id,
  CASE
    WHEN au.id IS NULL THEN '!!! SEM CONTA NO AUTH (login só local)'
    WHEN su.id = au.id THEN 'OK'
    ELSE '!!! MISMATCH DE ID (auth.uid() não acha a linha)'
  END AS identidade
FROM system_users su
LEFT JOIN auth.users au ON au.email = su.email
ORDER BY su.organization_id, su.email;

-- ─── B) REGINA: perfil + filiais da organização dela ──────────────────
SELECT
  'PERFIL REGINA' AS tipo, su.id, su.email, su.organization_id, su.store_branch_id,
  su.role, su.superadmin, su.active
FROM system_users su WHERE su.email ILIKE 'regina%'
UNION ALL
SELECT
  'FILIAL DA ORG' AS tipo, sb.id, NULL, sb.organization_id, NULL,
  NULL, NULL, sb.active
FROM store_branches sb
WHERE sb.organization_id = (SELECT organization_id FROM system_users WHERE email ILIKE 'regina%' LIMIT 1)
   OR sb.organization_id IS NULL
ORDER BY tipo;

-- ─── C) POLÍTICAS ATUAIS DE store_branches ────────────────────────────
SELECT policyname, cmd, roles, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'store_branches'
ORDER BY policyname;

-- ─── D) ÓRFÃOS E CONSISTÊNCIA GLOBAL ──────────────────────────────────
SELECT
  'branches sem org na tabela organizations' AS checagem,
  COUNT(*)::TEXT AS total
FROM store_branches sb
LEFT JOIN organizations o ON o.id = sb.organization_id
WHERE o.id IS NULL
UNION ALL
SELECT 'system_users sem org na tabela organizations', COUNT(*)::TEXT
FROM system_users su
LEFT JOIN organizations o ON o.id = su.organization_id
WHERE o.id IS NULL
UNION ALL
SELECT 'usuários sem filial atribuída (store_branch_id NULL)', COUNT(*)::TEXT
FROM system_users
WHERE store_branch_id IS NULL
UNION ALL
SELECT 'usuários cuja filial pertence a OUTRA org', COUNT(*)::TEXT
FROM system_users su
JOIN store_branches sb ON sb.id = su.store_branch_id
WHERE sb.organization_id IS DISTINCT FROM su.organization_id;

-- ─── E) RESUMO POR ORG (filiais × usuários) ───────────────────────────
SELECT
  o.id AS org_id, o.name AS org_nome,
  (SELECT COUNT(*) FROM store_branches sb WHERE sb.organization_id = o.id) AS filiais,
  (SELECT COUNT(*) FROM system_users su WHERE su.organization_id = o.id)  AS usuarios
FROM organizations o
ORDER BY o.created_at;