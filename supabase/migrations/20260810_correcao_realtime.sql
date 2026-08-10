-- ==============================================================================
-- CORREÇÃO: Adicionar tabelas na publicação Realtime
-- ==============================================================================
-- O IF NOT EXISTS não funciona com ALTER PUBLICATION, então usamos uma função
-- ==============================================================================

-- Função para adicionar tabela na publicação se não existir
CREATE OR REPLACE FUNCTION fn_add_to_realtime(p_table text)
RETURNS void AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = p_table
  ) THEN
    EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', p_table);
    RAISE NOTICE 'Tabela % adicionada ao Realtime', p_table;
  ELSE
    RAISE NOTICE 'Tabela % já está no Realtime', p_table;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Adicionar todas as tabelas de delivery e module_visibility
SELECT fn_add_to_realtime('delivery_settings');
SELECT fn_add_to_realtime('delivery_neighborhoods');
SELECT fn_add_to_realtime('delivery_distance_rates');
SELECT fn_add_to_realtime('delivery_orders');
SELECT fn_add_to_realtime('module_visibility');

-- Limpar função temporária (opcional - pode manter para uso futuro)
-- DROP FUNCTION fn_add_to_realtime;

-- ==============================================================================
-- VERIFICAÇÃO FINAL
-- ==============================================================================
SELECT 'Tabelas no Realtime:' as verifica;
SELECT tablename 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' 
  AND tablename IN ('delivery_settings', 'delivery_neighborhoods', 'delivery_distance_rates', 'delivery_orders', 'module_visibility')
ORDER BY tablename;
