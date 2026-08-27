-- =====================================================================
-- HD-SYSTEM — RASCUNHO TEÓRICO DA ETAPA 3 (CORREÇÃO P1)
-- Autor: PawWork  |  Data: 2026-08-27
-- ---------------------------------------------------------------------
-- ESTE ARQUIVO NÃO DEVE SER EXECUTADO.
-- É um MODELO para revisão. Só pode ser finalizado e rodado APÓS:
--   1) resultados da Etapa 1 (fixable_by_email / truly_orphan)
--   2) resultados da Etapa 2 (mapa de FKs / colunas indiretas, bloco 12)
--   3) BACKUP do banco
--   4) APROVAÇÃO EXPLÍCITA do usuário (uma correção por vez)
--
-- Toda escrita deve ocorrer DENTRO de UMA transação, com pré-contagem
-- gravada em log e ROLLBACK automático se alguma contagem divergir.
-- =====================================================================

-- Trava: este arquivo só imprime o aviso abaixo e encerra.
DO $$
BEGIN
  RAISE EXCEPTION 'BLOQUEADO: rascunho teórico da Etapa 3. Não execute sem aprovação.';
END $$;

-- ---------------------------------------------------------------------
-- MODELO (comentado) — preencher com os dados reais da Etapa 2:
--
-- BEGIN;
--   -- 0) snapshot de contagens (para rollback/validação)
--   -- SELECT count(*) FROM public.system_users WHERE id IN (...);  -- → N
--
--   -- 1) para cada tabela/coluna do mapa 2A/2B (bloco 10/11/12):
--   -- UPDATE <tabela> SET <coluna> = <target_auth_id>
--   --   WHERE <coluna> = <old_system_users_id>;
--
--   -- 2) só então remapear a própria PK de system_users:
--   -- UPDATE public.system_users SET id = <target_auth_id>
--   --   WHERE id = <old_system_users_id>;
--
--   -- 3) validar contagens; se divergir → ROLLBACK
-- COMMIT;
-- ---------------------------------------------------------------------
