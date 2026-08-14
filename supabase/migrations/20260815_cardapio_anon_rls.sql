-- =====================================================================
-- CORREÇÃO CRÍTICA: cardápio digital (Mesa/Delivery) é interface PÚBLICA
-- (chave anon do Supabase). O fluxo de pedido exige ESCRITA ANON em:
--   - customer_sessions : criar sessão da mesa (FK da venda)
--   - sales            : gravar a venda
--   - sale_items       : entregar o pedido AO VIVO (canal realtime sem filtro)
--   - stock_movements  : baixa de estoque
-- e EXECUTE da RPC process_sale_transaction (dedução atômica de estoque).
--
-- A migration 20260813_* revogou acesso anon e trocou as policies por
-- branch-scoped (exigem auth.uid()), quebrando o cliente sem login.
-- O erro de console pede GRANT, mas GRANT SOZINHO NÃO BASTA: com RLS
-- ativo, é preciso uma POLICY. Estas tabelas são de interface pública;
-- acesso anon de escrita é INTENCIONAL e NECESSÁRIO (o operador revisa
-- os pedidos em Pedidos). EXCEÇÃO documentada à regra de "sem policies
-- permissivas" do AGENTS.md — o cardápio não tem sessão autenticada.
-- =====================================================================

-- Grants (anon precisa poder conectar + escrever)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_sessions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sale_items TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sale_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_movements TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_movements TO authenticated;

-- RPC de dedução de estoque: anon precisa executar (SECURITY DEFINER)
GRANT EXECUTE ON FUNCTION public.process_sale_transaction TO anon;

-- Policies de ESCRITA para anon (as policies de authenticated continuam
-- existindo e cuidam do operador). Sem estas, anon é bloqueado por RLS.
DROP POLICY IF EXISTS "customer_sessions_insert_anon" ON public.customer_sessions;
CREATE POLICY "customer_sessions_insert_anon" ON public.customer_sessions
  FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "customer_sessions_update_anon" ON public.customer_sessions;
CREATE POLICY "customer_sessions_update_anon" ON public.customer_sessions
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "sales_insert_anon" ON public.sales;
CREATE POLICY "sales_insert_anon" ON public.sales
  FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "sale_items_insert_anon" ON public.sale_items;
CREATE POLICY "sale_items_insert_anon" ON public.sale_items
  FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "stock_movements_insert_anon" ON public.stock_movements;
CREATE POLICY "stock_movements_insert_anon" ON public.stock_movements
  FOR INSERT TO anon WITH CHECK (true);

DO $$ BEGIN
  RAISE NOTICE '✅ Acesso anon restaurado para cardápio: customer_sessions, sales, sale_items, stock_movements + EXECUTE process_sale_transaction';
END $$;
