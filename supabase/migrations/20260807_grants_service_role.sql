-- Grants para service_role (apos criar as tabelas novas)
-- Executado em: 2026-08-07

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tables TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_sessions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.digital_menu_config TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.branch_themes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_keys TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sale_items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.printers TO service_role;
