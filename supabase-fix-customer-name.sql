-- ================================================================
-- HD-SYSTEM: CORREÇÃO — customer_name + permissões
-- Execute no Supabase SQL Editor
-- ================================================================

-- 1. ADICIONAR COLUNA customer_name NAS VENDAS
ALTER TABLE sales ADD COLUMN IF NOT EXISTS customer_name TEXT;

-- 2. ATUALIZAR customer_name a partir de notes (migração dos dados existentes)
UPDATE sales SET customer_name = notes WHERE customer_name IS NULL AND notes IS NOT NULL;

-- 3. GARANTIR PERMISSÕES PARA O CAIXA SINCAR CORRETAMENTE
GRANT ALL ON cash_sessions TO anon;
GRANT ALL ON cash_sessions TO service_role;

-- 4. GARANTIR PERMISSÕES PARA TODAS AS TABELAS
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- 5. VERIFICAR
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = 'sales' AND column_name IN ('customer_name', 'notes');

SELECT '✅ customer_name adicionado com sucesso!' AS resultado;