-- =====================================================================
-- AUDITORIA: "JWT issued at future"
-- Objetivo: descobrir se o relógio do servidor está adiantado (clock skew)
-- ou se o token armazenado no navegador tem iat no futuro.
--
-- Como ler:
--   - Se db_now (parte 1) estiver NO FUTURO => o relógio do BANCO está
--     adiantado (causa raiz do "issued at future").
--   - Se algum last_sign_in_at (parte 2) estiver NO FUTURO => o Auth
--     (GoTrue) emitiu login com relógio adiantado => skew no Auth.
--   - A comparação final com o tempo REAL do navegador está no snippet
--     AUDITORIA_JWT_BROWSER.js (rode no console do navegador).
-- =====================================================================


-- 1. Relógio do BANCO (referência de "agora" no servidor Postgres)
SELECT now() AS db_now_local,
       now() AT TIME ZONE 'UTC' AS db_now_utc;


-- 2. Logins com last_sign_in_at NO FUTURO => sinal de clock skew no Auth
--    (Se aparecer linha aqui, o GoTrue gravou um login "no futuro".)
SELECT id, email, last_sign_in_at, created_at,
       (last_sign_in_at > now()) AS login_no_futuro,
       (now() - last_sign_in_at) AS desde_login
FROM auth.users
WHERE last_sign_in_at > now()
ORDER BY last_sign_in_at DESC;


-- 3. Últimos 20 logins (comparar last_sign_in_at com now())
SELECT email,
       last_sign_in_at,
       (now() - last_sign_in_at) AS tempo_desde_login
FROM auth.users
ORDER BY last_sign_in_at DESC NULLS LAST
LIMIT 20;


-- 4. Config de JWT (exp padrão, etc.). Pode dar "permission denied" se o
--    papel usado no SQL Editor não tiver acesso — nesse caso ignore.
--    Se retornar jwt_exp muito alto/alto, não é a causa do "future".
SELECT * FROM auth.config;


-- 5. Sessões ativas (auth.sessions) — mostra not_before / expires_at.
--    Útil para ver se há sessão com expires_at no futuro distante.
SELECT u.email,
       s.not_before,
       s.expires_at,
       s.created_at,
       s.updated_at
FROM auth.sessions s
JOIN auth.users u ON u.id = s.user_id
ORDER BY s.updated_at DESC
LIMIT 20;
