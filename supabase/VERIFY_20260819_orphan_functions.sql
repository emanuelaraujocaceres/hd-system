-- ==============================================================================
-- VERIFY_20260819_orphan_functions.sql
-- Funções encontradas no banco pelo subagente de auditoria que NÃO têm definição
-- em nenhum migration do repo (criadas direto no SQL Editor / scripts soltos):
--   rls_auto_enable, gerar_token_e_criar_sessao, reprocessar_movimentacoes_falhas,
--   is_collaborator, is_developer, is_org_admin
--
-- Rode no Supabase SQL Editor e cole o resultado aqui para decidirmos:
--   - rls_auto_enable: GRANT para anon (segundo auditoria) → RISCO: habilitar RLS
--     em tabela arbitrária a partir de anon.
--   - reprocessar_movimentacoes_falhas: chamada pelo server.ts (Pages Function)
--     com service_role — o corpo define se precisa de endurecimento.
-- Os demais helpers de role podem ser inofensivos, mas precisam ser vistos.
-- ==============================================================================

-- 1. Listar as 6 funções com corpo (definição completa para auditoria)
SELECT
  n.nspname AS schema,
  p.proname AS nome,
  pg_get_function_identity_arguments(p.oid) AS args,
  CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END AS security,
  p.provolatile AS volatile,
  pg_get_functiondef(p.oid) AS definicao
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('rls_auto_enable', 'gerar_token_e_criar_sessao', 'reprocessar_movimentacoes_falhas',
                    'is_collaborator', 'is_developer', 'is_org_admin')
ORDER BY p.proname;

-- 2. GRANTs de EXECUTE dessas 6 (quem pode chamar)
SELECT routine_name, grantee, privilege_type
FROM information_schema.role_routine_grants
WHERE routine_schema = 'public'
  AND routine_name IN ('rls_auto_enable', 'gerar_token_e_criar_sessao', 'reprocessar_movimentacoes_falhas',
                       'is_collaborator', 'is_developer', 'is_org_admin')
ORDER BY routine_name, grantee;

-- 3. Se alguma delas NÃO existir no banco (retorna vazio nas queries acima),
--    descomente e rode para criar a tabela de apoio da verificação:
-- SELECT 'função inexistente' AS aviso, p.proname
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public'
--   AND p.proname IN ('rls_auto_enable', 'gerar_token_e_criar_sessao', 'reprocessar_movimentacoes_falhas',
--                     'is_collaborator', 'is_developer', 'is_org_admin');