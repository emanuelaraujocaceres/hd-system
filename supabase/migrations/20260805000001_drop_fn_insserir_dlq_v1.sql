-- ==============================================================================
-- REPAIR: DROP da versão antiga de fn_insserir_dlq (11 parâmetros)
-- Origem: a 20260804 criou a versão A (11 params), a 20260806 cria a versão B
--         (12 params + SECURITY DEFINER). Sem dropar a A explicitamente,
--         coexistem 2 overloads, e o GRANT da 20260806 falha com
--         "function name is not unique" (SQLSTATE 42725).
-- Solução: dropar a versão A (11 params) ANTES da 20260806 rodar.
-- ==============================================================================

DROP FUNCTION IF EXISTS public.fn_insserir_dlq(
  text, text, text, jsonb, text, text, integer, text, text, text, text
);
