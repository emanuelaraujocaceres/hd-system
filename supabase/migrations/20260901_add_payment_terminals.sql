-- ============================================================
-- Migration: Terminais de pagamento (payment_terminals)
-- Data: 2026-09-01
-- Descrição: Cadastro de maquininhas/terminais de pagamento por usuário
--   + filial + provider (começando por InfinitePay / Checkout Integrado).
--   Isolamento rígido por store_branch_id + organization_id (nunca a
--   maquininha de uma filial aparece em outra, mesmo para admin/superadmin
--   que trocam de filial). Até 1 "padrão" por (user_id, store_branch_id, provider).
--
-- ⚠️ EXECUTAR MANUALMENTE no Supabase SQL Editor (role postgres/service_role),
--   com BACKUP PRÉVIO do banco, conforme AGENTS.md (regra 4).
--   Idempotente: pode rodar mais de uma vez sem erro.
-- ============================================================

-- 1. Criar tabela (idempotente)
CREATE TABLE IF NOT EXISTS payment_terminals (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_branch_id    UUID NOT NULL REFERENCES store_branches(id) ON DELETE CASCADE,
  user_id            UUID NOT NULL,               -- dono (system_users.id / auth.users.id)
  provider           TEXT NOT NULL DEFAULT 'infinitepay' CHECK (provider IN ('infinitepay')),
  name               TEXT NOT NULL,               -- rótulo p/ exibição ("Maquininha A")
  config             JSONB NOT NULL DEFAULT '{}', -- provider → { handle } (NUNCA chave/cobrança no navegador)
  is_default         BOOLEAN NOT NULL DEFAULT false,
  enabled            BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE payment_terminals IS 'Terminal/maquininha de pagamento vinculado a um usuário + filial + provider. Início: InfinitePay. Genérico para futuros providers.';
COMMENT ON COLUMN payment_terminals.provider IS 'Provedor de pagamento. Por ora apenas infinitepay (Checkout Integrado).';
COMMENT ON COLUMN payment_terminals.config IS 'Config específica do provider (ex.: { "handle": "sua_infinite_tag" }). Cobrança jamais sai do navegador.';
COMMENT ON COLUMN payment_terminals.is_default IS 'No máx 1 padrão por (user_id, store_branch_id, provider)';

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_payment_terminals_org ON payment_terminals(organization_id);
CREATE INDEX IF NOT EXISTS idx_payment_terminals_branch ON payment_terminals(store_branch_id);
CREATE INDEX IF NOT EXISTS idx_payment_terminals_user ON payment_terminals(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_terminals_provider ON payment_terminals(provider);

-- Constraint "no máx 1 padrão por (user_id, store_branch_id, provider)" via
-- índice único parcial — resolve a corrida de "duas padrão" no próprio banco.
DROP INDEX IF EXISTS uq_payment_terminals_default;
CREATE UNIQUE INDEX uq_payment_terminals_default
  ON payment_terminals(user_id, store_branch_id, provider)
  WHERE is_default;

-- 2. Habilitar RLS (obrigatório — regra 0 AGENTS.md)
ALTER TABLE payment_terminals ENABLE ROW LEVEL SECURITY;

-- Policies branch-scoped via helper canônica (superadmin OR org+branch).
-- Cria: payment_terminals_select / _insert / _update / _delete.
SELECT public.create_branch_policy('payment_terminals');

-- 3. Permissões de nível de tabela (GRANT). O papel authenticated PRECISA do
--    privilégio de tabela, senão o PostgREST devolve '403 permission denied'
--    mesmo com RLS correta (RLS filtra linhas; o GRANT dá o acesso à tabela).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_terminals TO authenticated;

-- Bloquear acesso anônimo (regra 0b/0f — não é tabela do cardápio anon)
REVOKE ALL ON public.payment_terminals FROM anon;

-- 4. updated_at: trigger automático (padrão do projeto p/ reconciliação/auditoria)
DROP TRIGGER IF EXISTS trg_payment_terminals_updated_at ON payment_terminals;
CREATE TRIGGER trg_payment_terminals_updated_at
  BEFORE UPDATE ON payment_terminals
  FOR EACH ROW EXECUTE FUNCTION public.fn_update_updated_at();

-- 5. Publicação Realtime (obrigatória — o canal rejeita se a tabela não estiver
--    incluída, CHANNEL_ERROR em loop). Idempotente: não falha com 42710 em re-execução.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'payment_terminals'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE payment_terminals;
    RAISE NOTICE 'OK: payment_terminals adicionada à publicação supabase_realtime';
  ELSE
    RAISE NOTICE 'OK: payment_terminals já está na publicação supabase_realtime';
  END IF;
END $$;

-- REPLICA IDENTITY FULL para payload completo de UPDATE/DELETE (idempotente)
ALTER TABLE payment_terminals REPLICA IDENTITY FULL;

-- 6. Verificar criação
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_terminals' AND column_name = 'provider'
  ) THEN
    RAISE NOTICE 'OK: Tabela payment_terminals criada/verificada com sucesso';
  ELSE
    RAISE WARNING 'ERRO: Tabela payment_terminals NÃO foi criada!';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'payment_terminals'
      AND policyname IN ('payment_terminals_select', 'payment_terminals_insert', 'payment_terminals_update', 'payment_terminals_delete')
  ) THEN
    RAISE WARNING 'ERRO: Policies de payment_terminals não encontradas!';
  ELSE
    RAISE NOTICE 'OK: Policies de payment_terminals presentes (branch-scoped)';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'uq_payment_terminals_default'
  ) THEN
    RAISE NOTICE 'OK: Índice único parcial (1 padrão p/ user+branch+provider) presente';
  ELSE
    RAISE WARNING 'ERRO: Índice único parcial de padrão não encontrado!';
  END IF;
END $$;
