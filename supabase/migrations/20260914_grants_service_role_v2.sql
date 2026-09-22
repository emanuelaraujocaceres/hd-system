-- ==============================================================================
-- REPAIR: GRANTs de service_role (8 tabelas)
-- Origem: 20260807000002_grants_service_role.sql (skipada — `printers` ainda
--         não existia quando ela rodou; a tabela é criada em 20260815).
-- ==============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tables TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_sessions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.digital_menu_config TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.branch_themes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_keys TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sale_items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.printers TO service_role;
