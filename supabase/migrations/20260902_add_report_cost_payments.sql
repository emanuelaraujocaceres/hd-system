-- ==============================================================================
-- 20260902_add_report_cost_payments.sql
-- Relatório Gerencial de Vendas: expõe custo dos produtos vendidos e os
-- pagamentos completos (payments_json) para o cálculo de lucro e do breakdown
-- por forma de pagamento (dinheiro/débito/crédito/PIX/fiado, inclusive vendas
-- com pagamento dividido — split — em vários métodos).
--
-- A view vw_report_sale_items NÃO possuía essas colunas:
--   - product_cost  (products.cost_price): preço de CUSTO do produto vendido.
--     Usado para calcular "custo dos produtos vendidos" e "lucro líquido"
--     (= faturamento − custo dos produtos vendidos).
--   - payments_json (sales.payments_json): array [{method, amount}]. A coluna
--     legada payment_method guarda UM método por venda, então não permite somar
--     quanto entrou em dinheiro vs. débito vs. crédito numa venda split.
--
-- Nota (precisão do custo): sale_items NÃO guarda o custo na época da venda
-- (só unit_price/quantity/total_price). O custo aqui é o cost_price ATUAL do
-- produto (products.cost_price). Se o custo de um produto mudou após a venda,
-- o relatório usa o custo de hoje, não o da data da venda.
--
-- Idempotente: DROP VIEW IF EXISTS + CREATE VIEW (mesmo padrão das demais).
-- Não altera RLS; a view segue security_invoker + GRANT SELECT authenticated.
-- ==============================================================================

DROP VIEW IF EXISTS public.vw_report_sale_items;

CREATE VIEW public.vw_report_sale_items
WITH (security_invoker = true) AS
SELECT
  s.id               AS sale_id,
  s.organization_id  AS organization_id,
  s.store_branch_id  AS store_branch_id,
  s.created_at       AS sale_date,
  s.status           AS sale_status,
  s.payment_method   AS payment_method,
  s.payments_json    AS payments_json,          -- array [{method, amount}] (split)
  s.user_id          AS operator_id,            -- FK system_users
  s.operator_name    AS operator_name,          -- snapshot no momento da venda
  s.customer_id      AS customer_id,
  s.customer_name    AS customer_name,
  s.total            AS sale_total,
  si.id              AS item_id,
  si.product_id      AS product_id,
  si.product_name    AS product_name,
  si.quantity        AS quantity,
  si.unit_price      AS unit_price,
  si.total_price     AS item_total,
  GREATEST(
    0,
    (COALESCE(si.unit_price, 0) * COALESCE(si.quantity, 0))
    - COALESCE(si.total_price, si.unit_price * si.quantity)
  )                  AS item_discount,          -- nunca negativo; NULL legado → 0
  p.category         AS category_name,
  su.commission_rate AS operator_commission_rate,
  p.cost_price       AS product_cost            -- preço de CUSTO do produto (p/ lucro)
FROM public.sales s
JOIN public.sale_items si ON si.sale_id = s.id
LEFT JOIN public.products p ON p.id = si.product_id
LEFT JOIN public.system_users su ON su.id = s.user_id
WHERE s.deleted_at IS NULL;                     -- NÃO conta vendas apagadas

COMMENT ON VIEW public.vw_report_sale_items IS
  'Base do Relatório Gerencial (Frente 5). item_discount derivado; operador via sales.user_id + commission_rate. security_invoker: respeita RLS do chamador. Filtra sales.deleted_at IS NULL (vendas apagadas não contabilizadas). product_cost = custo atual do produto; payments_json = array de pagamentos (suporta venda split).';

GRANT SELECT ON public.vw_report_sale_items TO authenticated;

-- Verificação das mudanças aplicadas
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'vw_report_sale_items'
  AND column_name IN ('product_cost', 'payments_json')
ORDER BY column_name;
