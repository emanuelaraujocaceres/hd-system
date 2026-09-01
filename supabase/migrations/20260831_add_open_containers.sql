-- ============================================================
-- Migration: Contêineres abertos / decrementos fracionados (open_containers)
-- Data: 2026-08-31
-- Descrição: Cria a tabela open_containers (garrafas abertas / doses /
--   contêineres fracionados) que o frontend já sincroniza (syncService,
--   storageService, Realtime). A tabela nunca foi criada no banco, o que
--   causava "403 Forbidden: permission denied for table open_containers"
--   na hidratação.
--
-- ⚠️ EXECUTAR MANUALMENTE no Supabase SQL Editor (role postgres/service_role),
--   com BACKUP PRÉVIO do banco, conforme AGENTS.md (regra 4).
--   Idempotente: pode rodar mais de uma vez sem erro.
-- ============================================================

-- 1. Criar tabela (idempotente)
CREATE TABLE IF NOT EXISTS open_containers (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_branch_id    UUID NOT NULL REFERENCES store_branches(id) ON DELETE CASCADE,
  product_id         UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  remaining_quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
  opened_at          TIMESTAMPTZ DEFAULT now(),
  status             TEXT NOT NULL DEFAULT 'open',
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE open_containers IS 'Contêiner aberto / decremento fracionado (ex.: garrafa aberta, dose). Usado para controlar frações restantes de um produto.';
COMMENT ON COLUMN open_containers.remaining_quantity IS 'Quantidade restante no contêiner aberto (pode ser fração)';
COMMENT ON COLUMN open_containers.status IS 'open = aberto/em uso; closed/consumed = finalizado';

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_open_containers_org ON open_containers(organization_id);
CREATE INDEX IF NOT EXISTS idx_open_containers_branch ON open_containers(store_branch_id);
CREATE INDEX IF NOT EXISTS idx_open_containers_product ON open_containers(product_id);
CREATE INDEX IF NOT EXISTS idx_open_containers_status ON open_containers(status);

-- 2. Habilitar RLS (obrigatório — regra 0 AGENTS.md)
ALTER TABLE open_containers ENABLE ROW LEVEL SECURITY;

-- Policies branch-scoped via helper canônica (superadmin OR org+branch).
-- Cria: open_containers_select / _insert / _update / _delete.
SELECT public.create_branch_policy('open_containers');

-- 3. Bloquear acesso anônimo (regra 0b/0f — não é tabela do cardápio anon)
REVOKE ALL ON public.open_containers FROM anon;

-- 4. Publicação Realtime (obrigatória — o canal rejeita se a tabela não estiver
--    incluída, CHANNEL_ERROR em loop) + REPLICA IDENTITY FULL para payload completo
ALTER PUBLICATION supabase_realtime ADD TABLE open_containers;
ALTER TABLE open_containers REPLICA IDENTITY FULL;

-- 5. Verificar criação
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'open_containers' AND column_name = 'remaining_quantity'
  ) THEN
    RAISE NOTICE 'OK: Tabela open_containers criada/verificada com sucesso';
  ELSE
    RAISE WARNING 'ERRO: Tabela open_containers NÃO foi criada!';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'open_containers' AND policyname IN ('open_containers_select', 'open_containers_insert', 'open_containers_update', 'open_containers_delete')
  ) THEN
    RAISE WARNING 'ERRO: Policies de open_containers não encontradas!';
  ELSE
    RAISE NOTICE 'OK: Policies de open_containers presentes (branch-scoped)';
  END IF;
END $$;
