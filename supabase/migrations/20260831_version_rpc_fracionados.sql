-- ==============================================================================
-- 20260831: VERSIONA AS FUNÇÕES REAIS DE VENDA/FRACIONADOS NO REPO
-- (process_sale_transaction + process_single_item)
-- ==============================================================================
-- CONTEXTO / DÍVIDA DE GOVERNANÇA:
--   O banco real roda estas duas funções com a lógica de COMPOSTOS e de
--   FRACIONADOS (garrafas abertas / doses via open_containers), mas elas NÃO
--   existiam em nenhum arquivo .sql do repo (foram aplicadas manualmente via
--   SQL Editor). O banco estava "à frente" do versionamento.
--
--   Esta migration APENAS VERSIONA o estado real (CREATE OR REPLACE com o
--   mesmo corpo/assinatura verificados no banco via prosrc + pg_get_function_*).
--   É IDEMPOTENTE e NÃO muda comportamento: reaplicar é seguro.
--
--   Assinaturas reais (verificadas no banco):
--     process_sale_transaction(
--       p_sale_id uuid, p_product_id text, p_quantity integer, p_unit_price numeric,
--       p_discount numeric, p_total numeric, p_reason text, p_operator_name text,
--       p_organization_id uuid, p_store_branch_id uuid, p_sale_items jsonb)
--       RETURNS TABLE(success boolean, message text)
--     process_single_item(
--       p_product_id uuid, p_quantity integer, p_org_id uuid, p_branch_id uuid,
--       p_sale_id uuid, p_operator_name text) RETURNS void
--
--   FLUXO DE VENDA:
--     1) process_sale_transaction itera p_sale_items; se o produto é is_composite
--        expande a receita (product_recipes) e processa os INGREDIENTES; senão
--        processa o próprio item — sempre delega a dedução a process_single_item.
--     2) process_single_item:
--        - se o produto vendido é FRAÇÃO de um fragmentável (fraction_product_id):
--          consome doses de open_containers abertos (FIFO); se faltar, abre novas
--          garrafas (baixa 1 do stock_quantity + movimentação 'Abertura de garrafa'
--          + cria open_containers com yield_count) atômicamente.
--        - senão: deduz stock_quantity normal + movimentação 'Venda'.
--     3) Ambos SECURITY DEFINER, com filtro de organização + filial.
-- ==============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. process_single_item (helper de dedução de estoque, incl. fracionados)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_single_item(
  p_product_id uuid,
  p_quantity integer,
  p_org_id uuid,
  p_branch_id uuid,
  p_sale_id uuid,
  p_operator_name text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    v_product RECORD;
    v_fraction_source RECORD;
    v_container RECORD;
    v_new_container_id UUID;
    v_yield INTEGER;
    v_remaining_needed INTEGER := p_quantity;
    v_consume INTEGER;
    v_new_stock INTEGER;
BEGIN
    -- Busca o produto vendido
    SELECT * INTO v_product
    FROM products
    WHERE id = p_product_id
      AND organization_id = p_org_id
      AND store_branch_id = p_branch_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Produto não encontrado: %', p_product_id;
    END IF;

    -- Verifica se o produto é uma fração de algum fragmentável
    SELECT * INTO v_fraction_source
    FROM products
    WHERE fraction_product_id = p_product_id
      AND is_fragmentable = true
      AND organization_id = p_org_id
      AND store_branch_id = p_branch_id
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
        -- É fração: consumir de open_containers
        -- 1) Tenta consumir de containers abertos existentes
        FOR v_container IN
            SELECT * FROM open_containers
            WHERE organization_id = p_org_id
              AND store_branch_id = p_branch_id
              AND product_id = v_fraction_source.id
              AND status = 'open'
              AND remaining_quantity > 0
            ORDER BY opened_at ASC
            FOR UPDATE
        LOOP
            IF v_remaining_needed = 0 THEN
                EXIT;
            END IF;
            v_consume := LEAST(v_remaining_needed, v_container.remaining_quantity);
            UPDATE open_containers
            SET remaining_quantity = remaining_quantity - v_consume,
                status = CASE WHEN remaining_quantity - v_consume = 0 THEN 'empty' ELSE status END,
                updated_at = NOW()
            WHERE id = v_container.id;
            v_remaining_needed := v_remaining_needed - v_consume;
        END LOOP;

        -- 2) Se ainda falta, abre novas garrafas
        WHILE v_remaining_needed > 0 LOOP
            -- Verifica estoque fechado do fragmentável
            IF v_fraction_source.stock_quantity <= 0 THEN
                RAISE EXCEPTION 'Estoque insuficiente de garrafas para %', v_fraction_source.name;
            END IF;

            -- Deduz 1 garrafa do estoque fechado
            UPDATE products
            SET stock_quantity = stock_quantity - 1,
                updated_at = NOW()
            WHERE id = v_fraction_source.id
            RETURNING stock_quantity INTO v_new_stock;

            -- Registra movimentação de saída (abertura de garrafa)
            INSERT INTO stock_movements (
                id, organization_id, store_branch_id, product_id, product_name,
                type, quantity, previous_stock, new_stock, reason, operator_name, sale_id, created_at
            ) VALUES (
                gen_random_uuid(),
                p_org_id, p_branch_id, v_fraction_source.id, v_fraction_source.name,
                'out', 1, v_fraction_source.stock_quantity, v_new_stock,
                'Abertura de garrafa para venda', p_operator_name, p_sale_id, NOW()
            );

            -- Cria novo container com rendimento total
            INSERT INTO open_containers (
                id, organization_id, store_branch_id, product_id,
                remaining_quantity, opened_at, status, created_at, updated_at
            ) VALUES (
                gen_random_uuid(),
                p_org_id, p_branch_id, v_fraction_source.id,
                v_fraction_source.yield_count, NOW(), 'open', NOW(), NOW()
            )
            RETURNING id, remaining_quantity INTO v_new_container_id, v_yield;

            -- Consome do container recém-criado
            v_consume := LEAST(v_remaining_needed, v_yield);
            UPDATE open_containers
            SET remaining_quantity = remaining_quantity - v_consume,
                status = CASE WHEN remaining_quantity - v_consume = 0 THEN 'empty' ELSE 'open' END,
                updated_at = NOW()
            WHERE id = v_new_container_id;

            v_remaining_needed := v_remaining_needed - v_consume;
            -- Atualiza estoque local para próximo loop
            v_fraction_source.stock_quantity := v_new_stock;
        END LOOP;
    ELSE
        -- Produto normal (ou fragmentável vendido como garrafa inteira)
        IF v_product.stock_quantity < p_quantity THEN
            RAISE EXCEPTION 'Estoque insuficiente para %', v_product.name;
        END IF;

        v_new_stock := v_product.stock_quantity - p_quantity;
        UPDATE products
        SET stock_quantity = v_new_stock,
            updated_at = NOW()
        WHERE id = v_product.id;

        -- Registra movimentação de saída
        INSERT INTO stock_movements (
            id, organization_id, store_branch_id, product_id, product_name,
            type, quantity, previous_stock, new_stock, reason, operator_name, sale_id, created_at
        ) VALUES (
            gen_random_uuid(),
            p_org_id, p_branch_id, v_product.id, v_product.name,
            'out', p_quantity, v_product.stock_quantity, v_new_stock,
            'Venda', p_operator_name, p_sale_id, NOW()
        );
    END IF;
END;
$$;

-- Reproduz o GRANT REAL do banco (verificado: PUBLIC + postgres). ⚠️ PONTO DE
-- ATENÇÃO: expor a função a PUBLIC não é ideal; foi o estado encontrado. Não o
-- endurecemos aqui (escopo mínimo / não quebrar o que roda). Revisar depois.
REVOKE ALL ON FUNCTION public.process_single_item(uuid, integer, uuid, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_single_item(uuid, integer, uuid, uuid, uuid, text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_single_item(uuid, integer, uuid, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_single_item(uuid, integer, uuid, uuid, uuid, text) TO service_role;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. process_sale_transaction (orquestra a venda → process_single_item)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_sale_transaction(
  p_sale_id uuid,
  p_product_id text DEFAULT NULL,
  p_quantity integer DEFAULT 0,
  p_unit_price numeric DEFAULT 0,
  p_discount numeric DEFAULT 0,
  p_total numeric DEFAULT 0,
  p_reason text DEFAULT 'Venda PDV',
  p_operator_name text DEFAULT 'Sistema',
  p_organization_id uuid DEFAULT '00000000-0000-0000-0000-000000000001',
  p_store_branch_id uuid DEFAULT NULL,
  p_sale_items jsonb DEFAULT '[]'::jsonb
)
RETURNS TABLE(success boolean, message text)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    v_item RECORD;
    v_ingredient RECORD;
    v_product RECORD;
BEGIN
    BEGIN
        -- Percorre cada item da venda (itens originais)
        FOR v_item IN
            SELECT
                (item->>'product_id')::UUID AS product_id,
                (item->>'quantity')::INTEGER AS quantity
            FROM jsonb_array_elements(p_sale_items) AS item
        LOOP
            -- Verifica se o produto é composto
            SELECT * INTO v_product
            FROM products
            WHERE id = v_item.product_id
              AND organization_id = p_organization_id
              AND store_branch_id = p_store_branch_id
            FOR UPDATE;

            IF NOT FOUND THEN
                RETURN QUERY SELECT FALSE, 'Produto não encontrado na org/filial: ' || v_item.product_id::text;
                RETURN;
            END IF;

            IF v_product.is_composite THEN
                -- Expande ingredientes da receita e processa cada um
                FOR v_ingredient IN
                    SELECT pr.ingredient_product_id, pr.quantity
                    FROM product_recipes pr
                    WHERE pr.composite_product_id = v_product.id
                      AND pr.organization_id = p_organization_id
                      AND pr.store_branch_id = p_store_branch_id
                LOOP
                    PERFORM process_single_item(
                        v_ingredient.ingredient_product_id,
                        (v_ingredient.quantity * v_item.quantity)::INTEGER,
                        p_organization_id,
                        p_store_branch_id,
                        p_sale_id,
                        p_operator_name
                    );
                END LOOP;
            ELSE
                PERFORM process_single_item(
                    v_item.product_id,
                    v_item.quantity,
                    p_organization_id,
                    p_store_branch_id,
                    p_sale_id,
                    p_operator_name
                );
            END IF;
        END LOOP;

        RETURN QUERY SELECT TRUE, 'Venda processada com sucesso';
    EXCEPTION WHEN OTHERS THEN
        RETURN QUERY SELECT FALSE, SQLERRM;
    END;
END;
$$;

-- GRANTs (reproduzindo o padrão do projeto: authenticated + service_role)
REVOKE ALL ON FUNCTION public.process_sale_transaction(uuid, text, integer, numeric, numeric, numeric, text, text, uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_sale_transaction(uuid, text, integer, numeric, numeric, numeric, text, text, uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_sale_transaction(uuid, text, integer, numeric, numeric, numeric, text, text, uuid, uuid, jsonb) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. VERIFICAÇÃO (RAISE NOTICE)
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'process_single_item'
  ) THEN
    RAISE NOTICE 'OK: process_single_item presente.';
  ELSE
    RAISE WARNING 'ERRO: process_single_item ausente!';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'process_sale_transaction'
  ) THEN
    RAISE NOTICE 'OK: process_sale_transaction presente.';
  ELSE
    RAISE WARNING 'ERRO: process_sale_transaction ausente!';
  END IF;
END $$;
