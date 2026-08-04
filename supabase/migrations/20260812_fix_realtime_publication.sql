-- ==============================================================================
-- 20260812_fix_realtime_publication.sql
-- Corrige o Realtime (tempo real) entre dispositivos.
--
-- PROBLEMA: o canal Realtime do frontend assina 15 tabelas, incluindo as 3
-- novas (scanned_boletos, credit_payments, nf_records). A migração 20260810
-- criou essas tabelas mas NÃO as adicionou à publicação supabase_realtime.
-- No Supabase, quando o canal se inscreve numa tabela fora da publicação, o
-- canal INTEIRO é rejeitado (CHANNEL_ERROR em loop) — o Realtime nunca entrega
-- eventos, nem das tabelas que estavam na publicação. F5 funciona (REST), mas
-- a sincronização em tempo real não.
--
-- CORREÇÃO:
--  1. Garante TODAS as tabelas do canal na publicação supabase_realtime.
--  2. REPLICA IDENTITY FULL nas tabelas de payload grande: sem isso, o payload
--     de UPDATE/DELETE chega incompleto (só PK + colunas alteradas), quebrando
--     updateCaixaFromRemote / updateSaleFromRemote que leem vários campos.
-- ==============================================================================

-- 1) Publicação Realtime: adicionar todas as tabelas usadas pelo canal
DO $$
DECLARE
  tables TEXT[] := ARRAY[
    'products','categories','customers','suppliers',
    'sales','sale_items','financial_transactions',
    'cash_sessions','stock_movements','store_branches',
    'system_users','system_settings',
    'scanned_boletos','credit_payments','nf_records'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION WHEN OTHERS THEN
      -- Tabela já está na publicação, ou é view (system_settings) — ignorar
      RAISE NOTICE 'Realtime: % já na publicação ou ignorada', t;
    END;
  END LOOP;
END $$;

-- 2) REPLICA IDENTITY FULL: payload completo em UPDATE/DELETE
-- (necessário para o frontend reconstruir o registro remoto inteiro)
ALTER TABLE public.products REPLICA IDENTITY FULL;
ALTER TABLE public.categories REPLICA IDENTITY FULL;
ALTER TABLE public.customers REPLICA IDENTITY FULL;
ALTER TABLE public.suppliers REPLICA IDENTITY FULL;
ALTER TABLE public.sales REPLICA IDENTITY FULL;
ALTER TABLE public.sale_items REPLICA IDENTITY FULL;
ALTER TABLE public.financial_transactions REPLICA IDENTITY FULL;
ALTER TABLE public.cash_sessions REPLICA IDENTITY FULL;
ALTER TABLE public.stock_movements REPLICA IDENTITY FULL;
ALTER TABLE public.system_users REPLICA IDENTITY FULL;
ALTER TABLE public.scanned_boletos REPLICA IDENTITY FULL;
ALTER TABLE public.credit_payments REPLICA IDENTITY FULL;
ALTER TABLE public.nf_records REPLICA IDENTITY FULL;

-- 3) Verificação: listar tabelas na publicação
SELECT tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;
