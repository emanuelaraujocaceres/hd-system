-- ============================================================
-- BLOCO 1: Corrigir grants (adicionar SELECT/INSERT/UPDATE/DELETE para roles faltantes)
-- Execute separado
-- ============================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sale_item_payments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sale_item_payments TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sale_item_payments TO service_role;

-- Se as colunas ainda não têm grants específicos:
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sale_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.credit_payments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.financial_transactions TO authenticated;
