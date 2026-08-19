-- =====================================================================
-- DIAGNÓSTICO 2026-08-19: triar funções com EXECUTE anon antes de fechar
-- Objetivo: separar (a) exceção documentada do cardápio, (b) helpers de
-- RLS/policy (SEGURITY DEFINER lidas pelo front via policies), (c) helpers
-- read-only do frontend, (d) trigger functions, (e) risco (SECURITY DEFINER
-- que escreve/lê cross-org e que anon pode chamar direto).
-- Só LEITURA — não altera nada.
-- =====================================================================

-- ─── 1. Funções com EXECUTE anon + flags críticas ─────────────────────
-- pro_is_sec_def = true → roda como owner (atenção redobrada)
-- pro_is_proc = true → procedure (não retorna; só side-effects)
SELECT
  p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS funcao,
  p.prosecdef                            AS security_definer,
  p.prokind                              AS kind,          -- 'f'=function, 'p'=procedure
  p.provolatile                          AS volatility,    -- 'i'=immutable 's'=stable 'v'=volatile
  CASE
    WHEN p.prorettype::regtype::text = 'trigger' THEN 'TRIGGER'
    WHEN p.prorettype::regtype::text = 'void' THEN 'void'
    ELSE p.prorettype::regtype::text
  END                                    AS retorna,
  obj_description(p.oid, 'pg_proc')      AS comentario
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prokind IN ('f', 'p')
  AND has_function_privilege('anon', p.oid, 'EXECUTE')
ORDER BY p.prosecdef DESC, p.proname;

-- ─── 2. Triggers ativos que usam essas funções, por tabela ────────────
-- Determine se a função é disparada por tabela que o ANON escreve
-- (sales, sale_items, stock_movements, customer_sessions) → aí anon
-- PRECISA manter EXECUTE no trigger function.
SELECT
  t.tgname AS trigger_name,
  c.relname AS tabela,
  COALESCE(p2.proname, p.proname) AS funcao_disparada,
  t.tgenabled AS status
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
LEFT JOIN pg_proc p ON p.oid = t.tgfoid
LEFT JOIN pg_depend d ON d.objid = t.oid AND d.deptype = 'i'
LEFT JOIN pg_proc p2 ON p2.oid = d.refobjid
WHERE NOT t.tgisinternal
ORDER BY c.relname, t.tgname;

-- ─── 3. Aviso didático: separar GRANT explícito vs PUBLIC default ─────
-- anon_via_public = true → só tem acesso porque a função nasceu com
-- EXECUTE padrão para PUBLIC (nunca recebeu REVOKE). Anon NÃO precisa.
SELECT
  p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS funcao,
  has_function_privilege('PUBLIC', p.oid, 'EXECUTE') AS anon_via_public
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prokind IN ('f', 'p')
  AND has_function_privilege('anon', p.oid, 'EXECUTE')
ORDER BY p.proname;