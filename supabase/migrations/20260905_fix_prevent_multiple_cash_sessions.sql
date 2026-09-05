-- ==============================================================================
-- 20260905_fix_prevent_multiple_cash_sessions.sql
-- BUG-036: cash_sessions bloqueado em produção — MAX() em coluna UUID.
--
-- Contexto (2026-09-05): a função VIVA no banco de produção
--   prevent_multiple_cash_sessions() (trigger prevent_multiple_cash_sessions_trigger,
--   BEFORE INSERT OR UPDATE WHEN status='open') usava
--   SELECT COUNT(*), MAX(id), MAX(operator_name) FROM cash_sessions WHERE ...
--   MAX(id) numa coluna UUID não existe no Postgres → TODA escrita de sessão de
--   caixa aberta falhava com `function max(uuid) does not exist` (58 falhas na
--   DLQ movimentacoes_falhas em 04-05/09). O caixa aberto existia apenas no
--   localStorage de uma máquina; o celular (fail-closed em getActiveCaixaSession)
--   ficava com caixa FECHADO.
--
-- Fix aplicado em produção por SQL Editor (idempotente via CREATE OR REPLACE;
-- backup = pg_get_functiondef da versão com MAX; revert = CREATE OR REPLACE com
-- a versão original). ESTA MIGRATION persiste o fix no repo para que nenhum
-- ambiente novo/reset recrie a versão quebrada.
--
-- NOTA: os triggers prevent_*_cash_sessions_trigger e a função sã
-- prevent_duplicate_cash_sessions() (COUNT(*) + subselects LIMIT 1) existem
-- APENAS no banco de produção, fora do repo — NÃO recriar/duplicar aqui.
-- Padrão definitivo para guard "uma sessão aberta por filial/usuário":
-- SELECT ... INTO ... ORDER BY <col> LIMIT 1 + IF ... IS NOT NULL THEN RAISE.
-- NUNCA usar agregados (MAX/MIN) em colunas UUID.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.prevent_multiple_cash_sessions()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_existing_session_id UUID;
  v_existing_operator TEXT;
BEGIN
  -- Verificar se já existe sessão aberta para esta filial
  SELECT id, operator_name
    INTO v_existing_session_id, v_existing_operator
  FROM cash_sessions
  WHERE store_branch_id = NEW.store_branch_id
    AND status = 'open'
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000')
  LIMIT 1;

  IF v_existing_session_id IS NOT NULL THEN
    RAISE EXCEPTION 'Já existe uma sessão de caixa aberta para esta filial. 
      Operador: % - Sessão: %',
      v_existing_operator, v_existing_session_id;
  END IF;

  RETURN NEW;
END;
$function$;