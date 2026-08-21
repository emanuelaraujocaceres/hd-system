-- =====================================================================
-- DIAGNÓSTICO + CORREÇÃO: fn_insserir_dlq 400 (Bad Request)
-- Sintoma: POST /rest/v1/rpc/fn_insserir_dlq -> 400 (mas JWT agora OK,
--        então não é mais o "issued at future").
-- Causa mais provável: cache de schema do PostgREST obsoleto após a
-- função ter sido recriada (FIX_20260819_audit_gaps.sql a redefiniu).
-- =====================================================================


-- 1. Quantas sobrecargas de fn_insserir_dlq existem? ( ambiguidade -> 400 )
--    E quais os grants (proacl)? Deve haver authenticated + service_role
--    e, pelo fluxo do cardápio anon, também anon.
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS args,
       p.proacl::text AS grants
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'fn_insserir_dlq';


-- 2. A tabela que a função insere existe e tem RLS ok?
SELECT c.relname, c.relrowsecurity AS rls
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'movimentacoes_falhas';


-- 3. CORREÇÃO: recarregar o cache de schema do PostgREST.
--    Isso resolve o 400 "function not found in schema cache" após DDL.
--    (Também dá pra fazer pelo Dashboard: Database -> PostgREST -> Reload.)
NOTIFY pgrst, 'reload schema cache';


-- 4. (Opcional, seguro) Garantir grant anon na fn_insserir_dlq — exigido
--    pelo AGENTS.md para o fluxo do cardápio anônimo. CREATE OR REPLACE
--    preserva grants, mas se este script a recriou sem anon, re-adiciona.
GRANT EXECUTE ON FUNCTION public.fn_insserir_dlq(
  text, text, text, jsonb, text, text, integer, text, text, text, text, text
) TO anon;
