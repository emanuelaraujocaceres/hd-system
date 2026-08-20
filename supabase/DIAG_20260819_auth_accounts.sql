-- =====================================================================
-- DIAGNÓSTICO 2026-08-19: Auth accounts de TODOS os usuários
-- Verifica se cada system_users tem auth.users com SENHA (não só o ID)
-- Se encrypted_password estiver vazio → não dá para signInWithPassword
-- → login cai no LOCAL (sem JWT) → RPC 401
-- =====================================================================

SELECT
  su.email,
  su.id AS system_user_id,
  au.id AS auth_user_id,
  CASE
    WHEN au.id IS NULL THEN '❌ SEM CONTA AUTH'
    WHEN su.id <> au.id THEN '⚠️ ID DIVERGENTE'
    WHEN au.encrypted_password IS NULL OR au.encrypted_password = '' THEN '⚠️ AUTH SEM SENHA (login local only)'
    ELSE '✅ OK (auth + senha + id ok)'
  END AS status_auth,
  su.superadmin,
  su.active,
  su.organization_id IS NOT NULL AS tem_org,
  au.last_sign_in_at
FROM system_users su
LEFT JOIN auth.users au ON au.id = su.id
ORDER BY su.email;

-- Resumo: quantos estão com problema
SELECT
  COUNT(*) FILTER (WHERE au.id IS NULL) AS sem_conta_auth,
  COUNT(*) FILTER (WHERE su.id <> au.id) AS id_divergente,
  COUNT(*) FILTER (WHERE au.encrypted_password IS NULL OR au.encrypted_password = '') AS auth_sem_senha,
  COUNT(*) FILTER (WHERE au.id IS NOT NULL AND su.id = au.id AND au.encrypted_password IS NOT NULL AND au.encrypted_password <> '') AS ok_com_senha,
  COUNT(*) AS total_usuarios
FROM system_users su
LEFT JOIN auth.users au ON au.id = su.id;