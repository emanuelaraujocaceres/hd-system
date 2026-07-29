-- ==============================================================================
-- ADICIONAR operator_name À TABELA sales
-- ==============================================================================
-- O front-end agora envia operator_name no upsert de vendas (syncSale).
-- Esta migração adiciona a coluna e preenche os registros existentes
-- com o nome do usuário correspondente.
-- ==============================================================================

-- 1. Adicionar coluna (texto nulo por padrão, sem NOT NULL para não quebrar dados legados)
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS operator_name TEXT;

-- 2. Backfill: preencher operator_name das vendas existentes
--    usando o nome do system_user correspondente ao user_id
UPDATE sales s
  SET operator_name = u.name
  FROM system_users u
  WHERE u.id = s.user_id
    AND (s.operator_name IS NULL OR s.operator_name = '');

-- 3. Garantir que vendas sem user_id tenham um fallback legível
UPDATE sales
  SET operator_name = 'Sistema'
  WHERE operator_name IS NULL OR operator_name = '';
