# SUPABASE SCHEMA - Referencia Completa do Banco de Dados

> Atualizado em 2026-08-23 apos auditoria completa (Etapas 1-5: catalogo de tabelas/colunas/PKs, policies de RLS, realtime + REPLICA IDENTITY, funcoes/triggers, inventory de migrations) e verificacao do frontend (src/services/syncService.ts).
>
> Esta versao foi regenerada a partir do catalogo vivo do banco (fonte da verdade, conforme AGENTS.md regra 1). Substitui a versao anterior, que continha colunas fantasma (system_users.pin), 3 objetos ausentes (user_permissions, vw_dlq_pendentes, vw_dlq_resumo) e colunas desatualizadas em sales/system_users/products.

## Regra de Manutencao

- Cloud (Supabase) e a fonte da verdade. Nunca sobrescrever contadores do cloud com valores locais stale (AGENTS.md regra 1).
- Toda tabela nova DEVE: (a) habilitar RLS; (b) entrar na publicacao supabase_realtime E ter REPLICA IDENTITY FULL; (c) ser registrada em syncService.ts (BRANCH_REQUIRED_TABLES ~linha 58 e hydrateFromCloud em storageService.ts).
- Coluna nova em tabela sync deve entrar nos 3 caminhos: upsert (saveX/syncX), mapper remoto (update*FromRemote), mapper de hidratacao.
- Migrations: idempotentes (DROP POLICY IF EXISTS + CREATE POLICY); testar em blocos no SQL Editor; aplicar via SQL Editor (ver flag #7 - nao ha registro em storage.migrations).
- Isolamento multi-tenant: filtros server-side (organization_id, store_branch_id) + client-side (isRemoteFromCurrentBranch).
- Sem IA no app (AGENTS.md): nao reintroduzir functions/api/ai/scan-product.ts.

## Visao Geral

- 45 tabelas + 3 views no schema public.
- Modelo multi-tenant: organization_id (org) + store_branch_id (filial) em quase todas as tabelas.
- RLS ativo em 100% das tabelas (rls_on = true em todas as 45). Helpers: is_superadmin(), get_user_org_id(), get_user_branch_id(), get_user_role().
- Realtime: 39/45 tabelas publicadas em supabase_realtime. O canal do app (syncService.ts linhas 263-301) assina 32 tabelas - todas publicadas, logo nao ha risco de CHANNEL_ERROR (regra 1). As 6 nao-publicadas nao sao assinadas pelo frontend.
- REPLICA IDENTITY FULL em 40 tabelas; 5 em default (nenhuma delas no realtime).

## Row Level Security (RLS)

Convencao de nomes: superadmin_all_t[ALL] (bypass via is_superadmin()), org_branch_op_t (org + branch, autenticado), t_select_authenticated / t_select_anon (app autenticado / cardapio anon), t_insert_anon / t_update_anon (escrita do cardapio anon - WITH CHECK true), user_op (usuario dono). Helpers: is_superadmin(), get_user_org_id(), get_user_branch_id(), get_user_role().

Cobertura: 100% das 45 tabelas tem RLS ativo (rls_on = true) e ao menos a policy superadmin_all_*.

Excecoes documentadas (AGENTS.md 0f) - anon com USING true ou WITH CHECK true:
- store_branches_select_anon (USING true) - fallback lista todas as filiais sem header.
- tables_select_anon (USING true) - lookup de mesa por qr_token antes de conhecer a filial.
- sales_insert_anon, sale_items_insert_anon, customer_sessions_insert_anon (WITH CHECK true) - escrita do cardapio.

## Tabelas Principais

### organizations
Organizacoes (multi-tenant raiz).

| Coluna | Tipo | Null | Key | Descricao |
|--------|------|------|-----|-----------|
| id | UUID | NO | PK | PK |
| name | VARCHAR | NO | | Nome da org |
| trade_name | VARCHAR | YES | | Nome fantasia |
| cnpj | VARCHAR | YES | | CNPJ |
| plan | VARCHAR | YES | | Plano |
| phone | VARCHAR | YES | | Telefone |
| email | VARCHAR | YES | | Email |
| active | BOOLEAN | NO | | Ativa? |
| subscription_expires_at | TIMESTAMPTZ | YES | | Expiracao da assinatura |
| created_at | TIMESTAMPTZ | YES | | |
| updated_at | TIMESTAMPTZ | YES | | |

RLS: superadmin_all_organizations[ALL], admin_select_own_organization[SELECT], admin_update_own_organization[UPDATE]
Realtime: nao publicada - REPLICA: default

### store_branches
Filiais de uma organizacao.

| Coluna | Tipo | Null | Key | Descricao |
|--------|------|------|-----|-----------|
| id | UUID | NO | PK | PK |
| organization_id | UUID | YES | FK->organizations | Org |
| name | TEXT | NO | | Nome da filial |
| code | TEXT | YES | | Codigo curto |
| cnpj | TEXT | YES | | CNPJ da filial |
| active | BOOLEAN | YES | | Ativa? |
| is_headquarters | BOOLEAN | YES | | Matriz? |
| address | TEXT | YES | | Endereco |
| full_address | TEXT | YES | | Endereco completo |
| city | TEXT | YES | | Cidade |
| state | TEXT | YES | | UF |
| phone | TEXT | YES | | Telefone |
| whatsapp_phone | TEXT | YES | | WhatsApp |
| latitude | NUMERIC | YES | | Latitude |
| longitude | NUMERIC | YES | | Longitude |
| delivery_enabled | BOOLEAN | YES | | Delivery ativo? |
| pickup_enabled | BOOLEAN | YES | | Retirada ativa? |
| created_at | TIMESTAMPTZ | YES | | |

RLS: superadmin_all_branches[ALL], org_select_branches[SELECT], org_insert_branches[INSERT], org_update_branches[UPDATE], org_delete_branches[DELETE], org_branch_select_store_branches[SELECT], org_branch_insert_store_branches[INSERT], org_branch_update_store_branches[UPDATE], org_branch_delete_store_branches[DELETE], store_branches_select_anon[SELECT] (USING true - excecao 0f)
Realtime: publicada - REPLICA: full

### profiles
Perfis de usuarios (trigger on_auth_user_created -> handle_new_user() insere aqui; NAO insere em system_users).

| Coluna | Tipo | Null | Key | Descricao |
|--------|------|------|-----|-----------|
| id | UUID | NO | PK | PK (FK->auth.users) |
| organization_id | UUID | YES | FK->organizations | Org |
| store_branch_id | UUID | NO | FK->store_branches | Filial |
| name | VARCHAR | NO | | Nome |
| email | VARCHAR | NO | | Email |
| role | VARCHAR | YES | | Papel |
| whatsapp | TEXT | YES | | WhatsApp |
| avatar_url | TEXT | YES | | Avatar |
| salary | NUMERIC | YES | | Salario |
| transportation_allowance | NUMERIC | YES | | Vale transporte |
| meal_allowance | NUMERIC | YES | | Vale refeicao |
| other_benefits | NUMERIC | YES | | Outros beneficios |
| inss_discount | NUMERIC | YES | | Desconto INSS |
| ir_discount | NUMERIC | YES | | Desconto IR |
| other_discounts | NUMERIC | YES | | Outros descontos |
| created_at | TIMESTAMPTZ | YES | | |
| updated_at | TIMESTAMPTZ | YES | | |

RLS: superadmin_all_profiles[ALL], profiles_select_own[SELECT], profiles_update_own[UPDATE], org_branch_select_profiles[SELECT], org_branch_insert_profiles[INSERT], org_branch_update_profiles[UPDATE], org_branch_delete_profiles[DELETE]
Realtime: publicada - REPLICA: full

### system_users
Colaboradores (nao confundir com auth.users).

| Coluna | Tipo | Null | Key | Descricao |
|--------|------|------|-----|-----------|
| id | UUID | NO | PK | PK (geralmente = auth.users.id) |
| organization_id | UUID | YES | FK->organizations | Org |
| store_branch_id | UUID | NO | FK->store_branches | Filial |
| name | TEXT | NO | | Nome |
| email | TEXT | NO | | Email |
| role | TEXT | YES | | admin / collaborator |
| avatar_url | TEXT | YES | | Avatar |
| password | TEXT | YES | | Hash da senha (login local) |
| active | BOOLEAN | YES | | Ativo? |
| superadmin | BOOLEAN | YES | | Superadmin? (bypass RLS via is_superadmin()) |
| permissions | JSONB | YES | | Permissoes por modulo (Record<modulo, boolean>). Adicionado em 20260822_system_users_permissions.sql. NULL = restrito no frontend. |
| commission_rate | NUMERIC | NO | | Taxa de comissao (%) |
| last_logout_at | TIMESTAMPTZ | YES | | Ultimo logout |
| created_at | TIMESTAMPTZ | YES | | |
| updated_at | TIMESTAMPTZ | YES | | |

RLS: superadmin_all_users[ALL], system_users_select_own[SELECT], org_branch_select_system_users[SELECT], admin_select_org_users[SELECT], collaborator_select_self[SELECT] (id=auth.uid()), org_branch_update_system_users[UPDATE], admin_update_org_users[UPDATE], collaborator_update_self[UPDATE] (id=auth.uid()), org_branch_insert_system_users[INSERT], admin_insert_org_users[INSERT], org_branch_delete_system_users[DELETE] (org+branch), admin_delete_org_users[DELETE] (org only)
Realtime: publicada - REPLICA: full
[FLAG 3] admin_insert_org_users tem WITH CHECK (organization_id = get_user_org_id()) SEM store_branch_id - admin pode criar usuario em qualquer filial da org (BUG-RLS-002).

### user_permissions
Permissoes por modulo/usuario (tabela separada de system_users.permissions).

| Coluna | Tipo | Null | Key | Descricao |
|--------|------|------|-----|-----------|
| id | UUID | NO | PK | PK |
| user_id | UUID | NO | FK->system_users | Usuario |
| store_branch_id | UUID | NO | FK->store_branches | Filial |
| module_name | TEXT | NO | | Nome do modulo |
| can_read | BOOLEAN | YES | | Ler? |
| can_write | BOOLEAN | YES | | Escrever? |
| can_delete | BOOLEAN | YES | | Excluir? |
| created_at | TIMESTAMPTZ | YES | | |
| updated_at | TIMESTAMPTZ | YES | | |

RLS: superadmin_all_user_permissions[ALL], user_select_user_permissions[SELECT], user_insert_user_permissions[INSERT], user_update_user_permissions[UPDATE], user_delete_user_permissions[DELETE], org_branch_select_user_permissions[SELECT], org_branch_insert_user_permissions[INSERT], org_branch_update_user_permissions[UPDATE], org_branch_delete_user_permissions[DELETE]
Realtime: publicada - REPLICA: full

### system_settings
Configuracoes do sistema - uma linha por organizacao (id = organization_id).

| Coluna | Tipo | Null | Key | Descricao |
|--------|------|------|-----|-----------|
| id | UUID | NO | PK | PK (= organization_id) |
| organization_id | UUID | YES | FK->organizations | Org |
| store_branch_id | UUID | NO | FK->store_branches | Filial (nao filtrar por ela - ver syncService.ts) |
| settings | JSONB | YES | | Configuracoes |
| version | INTEGER | NO | | Versao p/ conflito |
| updated_at | TIMESTAMPTZ | YES | | |

RLS: superadmin_all_settings[ALL], system_settings_select_own[SELECT], org_branch_select_system_settings[SELECT], org_branch_insert_system_settings[INSERT], org_branch_update_system_settings[UPDATE], org_branch_delete_system_settings[DELETE], admin_select_org_settings[SELECT], admin_insert_org_settings[INSERT], admin_update_org_settings[UPDATE], admin_delete_org_settings[DELETE]
Realtime: publicada - REPLICA: full

### company_settings
Dados da empresa (nota fiscal / exibicao).

| Coluna | Tipo | Null | Key | Descricao |
|--------|------|------|-----|-----------|
| id | UUID | NO | PK | PK |
| organization_id | UUID | YES | FK->organizations | Org |
| store_branch_id | UUID | NO | FK->store_branches | Filial |
| company_name | VARCHAR | NO | | Razao social |
| trade_name | VARCHAR | YES | | Nome fantasia |
| cnpj | VARCHAR | YES | | CNPJ |
| ie | VARCHAR | YES | | Inscricao estadual |
| email | VARCHAR | YES | | Email |
| phone | VARCHAR | YES | | Telefone |
| address | TEXT | YES | | Endereco |
| logo_url | TEXT | YES | | Logo |
| primary_color | VARCHAR | YES | | Cor primaria |
| created_at | TIMESTAMPTZ | YES | | |
| updated_at | TIMESTAMPTZ | YES | | |

RLS: superadmin_all_company_settings[ALL], org_branch_select_company_settings[SELECT], org_branch_insert_company_settings[INSERT], org_branch_update_company_settings[UPDATE], org_branch_delete_company_settings[DELETE]
Realtime: nao publicada - REPLICA: default
### customers
Clientes.

| Coluna | Tipo | Null | Key | Descricao |
|--------|------|------|-----|-----------|
| id | UUID | NO | PK | PK |
| organization_id | UUID | YES | FK->organizations | Org |
| store_branch_id | UUID | NO | FK->store_branches | Filial |
| name | TEXT | NO | | Nome |
| cpf_cnpj | TEXT | YES | | CPF/CNPJ |
| email | TEXT | YES | | Email |
| phone | TEXT | YES | | Telefone |
| whatsapp | TEXT | YES | | WhatsApp |
| customer_type | TEXT | YES | | Tipo |
| birth_date | DATE | YES | | Nascimento |
| loyalty_points | INTEGER | YES | | Pontos de fidelidade |
| current_balance | NUMERIC | YES | | Saldo (fiado) |
| credit_limit | NUMERIC | YES | | Limite de credito |
| address_street | TEXT | YES | | Logradouro |
| address_number | TEXT | YES | | Numero |
| address_complement | TEXT | YES | | Complemento |
| address_neighborhood | TEXT | YES | | Bairro |
| address_city | TEXT | YES | | Cidade |
| address_state | TEXT | YES | | UF |
| address_zip | TEXT | YES | | CEP |
| city | TEXT | YES | | (legado) |
| state | TEXT | YES | | (legado) |
| notes | TEXT | YES | | Observacoes |
| password_hash | TEXT | YES | | Hash de senha do cliente |
| google_id | TEXT | YES | | Google ID |
| created_at | TIMESTAMPTZ | YES | | |
| updated_at | TIMESTAMPTZ | YES | | |

RLS: superadmin_all_customers[ALL], org_branch_select_customers[SELECT], org_branch_insert_customers[INSERT], org_branch_update_customers[UPDATE], org_branch_delete_customers[DELETE], customers_select_authenticated[SELECT]
Realtime: publicada - REPLICA: full

### suppliers
Fornecedores.

| Coluna | Tipo | Null | Key | Descricao |
|--------|------|------|-----|-----------|
| id | UUID | NO | PK | PK |
| organization_id | UUID | YES | FK->organizations | Org |
| store_branch_id | UUID | NO | FK->store_branches | Filial |
| corporate_name | TEXT | YES | | Razao social |
| trade_name | TEXT | YES | | Nome fantasia |
| cnpj | TEXT | YES | | CNPJ |
| contact_person | TEXT | YES | | Contato |
| email | TEXT | YES | | Email |
| phone | TEXT | YES | | Telefone |
| created_at | TIMESTAMPTZ | YES | | |
| updated_at | TIMESTAMPTZ | YES | | |

RLS: superadmin_all_suppliers[ALL], org_branch_select_suppliers[SELECT], org_branch_insert_suppliers[INSERT], org_branch_update_suppliers[UPDATE], org_branch_delete_suppliers[DELETE], suppliers_select_authenticated[SELECT]
Realtime: publicada - REPLICA: full

### products
Produtos (estoque e responsabilidade do frontend - AGENTS.md regra 8).

| Coluna | Tipo | Null | Key | Descricao |
|--------|------|------|-----|-----------|
| id | UUID | NO | PK | PK |
| organization_id | UUID | YES | FK->organizations | Org |
| store_branch_id | UUID | NO | FK->store_branches | Filial |
| name | TEXT | NO | | Nome |
| category | TEXT | YES | | Categoria (texto) |
| barcode | TEXT | YES | | Codigo de barras |
| sku | TEXT | YES | | SKU |
| unit | TEXT | YES | | Unidade |
| cost_price | NUMERIC | YES | | Preco de custo |
| sale_price | NUMERIC | YES | | Preco de venda |
| stock_quantity | INTEGER | YES | | Estoque atual |
| min_stock_quantity | INTEGER | YES | | Estoque minimo |
| max_stock_quantity | INTEGER | YES | | Estoque maximo |
| is_active | BOOLEAN | YES | | Ativo? |
| is_composite | BOOLEAN | YES | | Produto composto? |
| use_lots | BOOLEAN | YES | | Controla lotes? |
| expiration_date | DATE | YES | | Validade |
| show_on_cardapio | BOOLEAN | YES | | Exibir no cardapio? |
| image_url | TEXT | YES | | Imagem |
| supplier_id | TEXT | YES | | Fornecedor (texto) |
| cfop | TEXT | YES | | CFOP fiscal |
| ncm | TEXT | YES | | NCM fiscal |
| wholesale_options | JSONB | YES | | Opcoes de atacado |
| show_on_tv | BOOLEAN | YES | | Exibir na TV? |
| tv_promo_price | NUMERIC | YES | | Preco promo TV |
| tv_highlight_tag | TEXT | YES | | Etiqueta destaque TV |
| created_at | TIMESTAMPTZ | YES | | |
| updated_at | TIMESTAMPTZ | YES | | |

RLS: superadmin_all_products[ALL], org_branch_insert_products[INSERT], org_branch_update_products[UPDATE], org_branch_delete_products[DELETE], products_select_authenticated[SELECT], products_select_anon[SELECT] (escopo por x-branch-id header - 0f)
Realtime: publicada - REPLICA: full
[FLAG 4] triggers fn_prevent_negative_stock (BEFORE UPDATE, bloqueia estoque < 0) e fn_sync_product_name (AFTER UPDATE sincroniza nome) em products. AGENTS.md regra 8 proibe triggers de estoque no banco - revisar.

### categories
Categorias de produtos.

| Coluna | Tipo | Null | Key | Descricao |
|--------|------|------|-----|-----------|
| id | UUID | NO | PK | PK |
| organization_id | UUID | YES | FK->organizations | Org |
| store_branch_id | UUID | NO | FK->store_branches | Filial |
| name | TEXT | NO | | Nome |
| description | TEXT | YES | | Descricao |
| color | TEXT | YES | | Cor |
| icon | TEXT | YES | | Icone |
| created_at | TIMESTAMPTZ | YES | | |
| updated_at | TIMESTAMPTZ | YES | | |

RLS: superadmin_all_categories[ALL], org_branch_insert_categories[INSERT], org_branch_update_categories[UPDATE], org_branch_delete_categories[DELETE], org_branch_select_categories[SELECT], categories_select_authenticated[SELECT], categories_select_anon[SELECT] (escopo por x-branch-id - 0f)
Realtime: publicada - REPLICA: full

### product_lots
Lotes / validade de produtos.

| Coluna | Tipo | Null | Key | Descricao |
|--------|------|------|-----|-----------|
| id | UUID | NO | PK | PK |
| organization_id | UUID | NO | FK->organizations | Org |
| store_branch_id | UUID | NO | FK->store_branches | Filial |
| product_id | UUID | NO | FK->products | Produto |
| supplier_id | UUID | YES | FK->suppliers | Fornecedor |
| lot_number | TEXT | NO | | Numero do lote |
| quantity | INTEGER | NO | | Quantidade |
| cost_price | NUMERIC | YES | | Custo do lote |
| expiration_date | DATE | NO | | Validade |
| received_at | TIMESTAMPTZ | YES | | Recebimento |
| created_at | TIMESTAMPTZ | YES | | |
| updated_at | TIMESTAMPTZ | YES | | |

RLS: superadmin_all_product_lots[ALL], org_branch_insert_product_lots[INSERT], org_branch_update_product_lots[UPDATE], org_branch_delete_product_lots[DELETE], org_branch_select_product_lots[SELECT], product_lots_select_authenticated[SELECT], product_lots_select_own[SELECT]
Realtime: publicada - REPLICA: full

### product_recipes
Receitas de produtos compostos.

| Coluna | Tipo | Null | Key | Descricao |
|--------|------|------|-----|-----------|
| id | UUID | NO | PK | PK |
| organization_id | UUID | NO | FK->organizations | Org |
| store_branch_id | UUID | YES | FK->store_branches | Filial |
| composite_product_id | UUID | NO | FK->products | Produto composto |
| ingredient_product_id | UUID | NO | FK->products | Ingrediente |
| ingredient_name | TEXT | YES | | Nome do ingrediente |
| quantity | NUMERIC | NO | | Quantidade |
| unit | TEXT | YES | | Unidade |
| created_at | TIMESTAMPTZ | NO | | |
| updated_at | TIMESTAMPTZ | NO | | |

RLS: superadmin_all_product_recipes[ALL], user_insert_product_recipes[INSERT], user_select_product_recipes[SELECT], user_update_product_recipes[UPDATE], user_delete_product_recipes[DELETE], product_recipes_select_authenticated[SELECT]
Realtime: publicada - REPLICA: full

### sales
Vendas realizadas.

| Coluna | Tipo | Null | Key | Descricao |
|--------|------|------|-----|-----------|
| id | UUID | NO | PK | PK |
| organization_id | UUID | YES | FK->organizations | Org |
| store_branch_id | UUID | NO | FK->store_branches | Filial |
| code | TEXT | YES | | Codigo (ex: VEN-10492) |
| customer_id | UUID | YES | FK->customers | Cliente |
| customer_name | TEXT | YES | | Nome do cliente |
| customer_session_id | UUID | YES | FK->customer_sessions | Sessao do cardapio |
| table_id | UUID | YES | FK->tables | Mesa |
| user_id | UUID | YES | FK->system_users | Operador (id) |
| operator_name | TEXT | YES | | Nome do operador |
| status | TEXT | YES | | completed / cancelled / pending |
| subtotal | NUMERIC | YES | | Subtotal |
| discount | NUMERIC | YES | | Desconto |
| total | NUMERIC | YES | | Total |
| payment_method | TEXT | YES | | Metodo unico (legacy) |
| payments_json | JSONB | YES | | Array de pagamentos [{method, amount}] (BUG-004 fix) |
| payment_id | TEXT | YES | | ID do gateway de pagamento |
| payment_details | JSONB | YES | | Detalhes do pagamento |
| order_source | TEXT | YES | | Origem do pedido (pdv, cardapio, etc.) |
| kitchen_status | TEXT | YES | | Status da cozinha (KDS) |
| notes | TEXT | YES | | Observacoes |
| created_at | TIMESTAMPTZ | YES | | |
| updated_at | TIMESTAMPTZ | YES | | |

RLS: superadmin_all_sales[ALL], org_branch_insert_sales[INSERT], org_branch_update_sales[UPDATE], org_branch_delete_sales[DELETE], org_branch_select_sales[SELECT], sales_select_authenticated[SELECT], sales_insert_anon[INSERT] (WITH CHECK true - 0f), sales_select_anon[SELECT] (escopo por x-branch-id - 0f)
Realtime: publicada - REPLICA: full

### sale_items
Itens de venda.

| Coluna | Tipo | Null | Key | Descricao |
|--------|------|------|-----|-----------|
| id | UUID | NO | PK | PK |
| store_branch_id | UUID | NO | FK->store_branches | Filial |
| sale_id | UUID | YES | FK->sales | Venda |
| product_id | UUID | YES | FK->products | Produto |
| product_name | TEXT | YES | | Nome (snapshot) |
| quantity | INTEGER | YES | | Quantidade |
| unit_price | NUMERIC | YES | | Preco unitario |
| total_price | NUMERIC | YES | | Total do item |
| created_at | TIMESTAMPTZ | YES | | |
| updated_at | TIMESTAMPTZ | YES | | |

RLS: superadmin_all_sale_items[ALL], org_branch_insert_sale_items[INSERT], org_branch_update_sale_items[UPDATE], org_branch_delete_sale_items[DELETE], org_branch_select_sale_items[SELECT], sale_items_select_authenticated[SELECT], sale_items_insert_anon[INSERT] (WITH CHECK true - 0f), sale_items_select_anon[SELECT] (escopo por x-branch-id - 0f)
Realtime: publicada - REPLICA: full
### cash_sessions
Sessoes de caixa.

| Coluna | Tipo | Null | Key | Descricao |
|--------|------|------|-----|-----------|
| id | UUID | NO | PK | PK |
| organization_id | UUID | YES | FK->organizations | Org |
| store_branch_id | UUID | NO | FK->store_branches | Filial |
| user_id | UUID | YES | FK->system_users | Usuario |
| operator_name | TEXT | YES | | Operador |
| status | TEXT | YES | | Aberto/Fechado |
| opening_balance | NUMERIC | YES | | Saldo inicial |
| closing_balance | NUMERIC | YES | | Saldo final |
| expected_balance | NUMERIC | YES | | Saldo esperado |
| suprimentos | NUMERIC | YES | | Suprimentos |
| sangrias | NUMERIC | YES | | Sangrias |
| total_sales_cash | NUMERIC | YES | | Vendas em dinheiro |
| total_sales_pix | NUMERIC | YES | | Vendas PIX |
| total_sales_card | NUMERIC | YES | | Vendas cartao |
| total_sales_credit_account | NUMERIC | YES | | Vendas fiado |
| notes | TEXT | YES | | Observacoes |
| opened_at | TIMESTAMPTZ | YES | | Abertura |
| closed_at | TIMESTAMPTZ | YES | | Fechamento |
| updated_at | TIMESTAMPTZ | YES | | |

RLS: superadmin_all_cash_sessions[ALL], org_branch_insert_cash_sessions[INSERT], org_branch_update_cash_sessions[UPDATE], org_branch_delete_cash_sessions[DELETE], org_branch_select_cash_sessions[SELECT], cash_sessions_select_authenticated[SELECT]
Realtime: publicada - REPLICA: full

### stock_movements
Movimentacoes de estoque (log).

| Coluna | Tipo | Null | Key | Descricao |
|--------|------|------|-----|-----------|
| id | UUID | NO | PK | PK |
| organization_id | UUID | YES | FK->organizations | Org |
| store_branch_id | UUID | NO | FK->store_branches | Filial |
| product_id | UUID | YES | FK->products | Produto |
| product_name | TEXT | YES | | Nome (snapshot) |
| type | TEXT | YES | | Tipo de movimento |
| quantity | INTEGER | YES | | Quantidade |
| previous_stock | INTEGER | YES | | Estoque anterior |
| new_stock | INTEGER | YES | | Novo estoque |
| reason | TEXT | YES | | Motivo |
| operator_name | TEXT | YES | | Operador |
| created_at | TIMESTAMPTZ | YES | | |
| updated_at | TIMESTAMPTZ | YES | | |

RLS: superadmin_all_stock_movements[ALL], org_branch_insert_stock_movements[INSERT], org_branch_update_stock_movements[UPDATE], org_branch_delete_stock_movements[DELETE], org_branch_select_stock_movements[SELECT], stock_movements_select_authenticated[SELECT]
Realtime: publicada - REPLICA: full

### stock_change_log
Log de alteracoes de estoque (auditoria).

| Coluna | Tipo | Null | Key | Descricao |
|--------|------|------|-----|-----------|
| id | UUID | NO | PK | PK |
| organization_id | UUID | YES | FK->organizations | Org |
| store_branch_id | UUID | NO | FK->store_branches | Filial |
| product_id | UUID | YES | FK->products | Produto |
| sale_id | TEXT | YES | | Venda (texto) |
| change_type | TEXT | YES | | Tipo |
| old_stock_quantity | INTEGER | YES | | Estoque anterior |
| new_stock_quantity | INTEGER | YES | | Estoque novo |
| changed_by | TEXT | YES | | Quem alterou |
| created_at | TIMESTAMPTZ | YES | | |
| updated_at | TIMESTAMPTZ | YES | | |

RLS: superadmin_all_stock_change_log[ALL], user_insert_stock_change_log[INSERT], user_select_stock_change_log[SELECT], user_update_stock_change_log[UPDATE], user_delete_stock_change_log[DELETE]
Realtime: nao publicada - REPLICA: full

### stock_loss_log
Log de perda/quebra de estoque.

| Coluna | Tipo | Null | Key | Descricao |
|--------|------|------|-----|-----------|
| id | UUID | NO | PK | PK |
| organization_id | UUID | NO | FK->organizations | Org |
| store_branch_id | UUID | NO | FK->store_branches | Filial |
| product_id | UUID | NO | FK->products | Produto |
| lot_id | UUID | YES | FK->product_lots | Lote |
| quantity | INTEGER | NO | | Quantidade perdida |
| reason | TEXT | NO | | Motivo |
| operator_name | TEXT | YES | | Operador |
| notes | TEXT | YES | | Observacoes |
| created_at | TIMESTAMPTZ | YES | | |

RLS: superadmin_all_stock_loss_log[ALL], org_branch_insert_stock_loss_log[INSERT], org_branch_update_stock_loss_log[UPDATE], org_branch_delete_stock_loss_log[DELETE], org_branch_select_stock_loss_log[SELECT], stock_loss_log_select_authenticated[SELECT]
Realtime: publicada - REPLICA: full

### financial_transactions
Transacoes financeiras (contas a pagar/receber, recorrencias, parcelas).

| Coluna | Tipo | Null | Key | Descricao |
|--------|------|------|-----|-----------|
| id | UUID | NO | PK | PK |
| organization_id | UUID | YES | FK->organizations | Org |
| store_branch_id | UUID | NO | FK->store_branches | Filial |
| type | TEXT | YES | | income / expense |
| category | TEXT | YES | | Categoria |
| description | TEXT | YES | | Descricao |
| status | TEXT | YES | | Status |
| amount | NUMERIC | YES | | Valor |
| payment_method | TEXT | YES | | Metodo |
| due_date | DATE | YES | | Vencimento |
| payment_date | DATE | YES | | Pagamento |
| is_recurring | BOOLEAN | YES | | Recorrente? |
| is_installment | BOOLEAN | YES | | Parcelado? |
| recurrence_type | TEXT | YES | | Tipo de recorrencia |
| recurrence_count | INTEGER | YES | | Nr de recorrencias |
| recurrence_parent_id | UUID | YES | FK->financial_transactions | Pai da recorrencia |
| installment_number | INTEGER | YES | | Nr da parcela |
| recurrences_json | JSONB | YES | | Array de recorrencias |
| installments_json | JSONB | YES | | Array de parcelas |
| sale_id | UUID | YES | FK->sales | Venda relacionada |
| notes | TEXT | YES | | Observacoes |
| created_at | TIMESTAMPTZ | YES | | |
| updated_at | TIMESTAMPTZ | YES | | |

RLS: superadmin_all_financial[ALL], org_branch_insert_financial[INSERT] (org+branch), org_branch_update_financial[UPDATE], org_branch_delete_financial[DELETE], org_branch_select_financial[SELECT], financial_transactions_select_authenticated[SELECT], financial_transactions_insert_own[INSERT] (org only), financial_transactions_update_own[UPDATE] (org only)
Realtime: publicada - REPLICA: full
[FLAG 2] financial_transactions_insert_own tem WITH CHECK (organization_id = get_user_org_id()) SEM store_branch_id - usuario pode inserir em outra filial da org (BUG-RLS-002).

### credit_payments
Pagamentos de fiado.

| Coluna | Tipo | Null | Key | Descricao |
|--------|------|------|-----|-----------|
| id | UUID | NO | PK | PK |
| organization_id | UUID | YES | FK->organizations | Org |
| store_branch_id | UUID | YES | FK->store_branches | Filial |
| sale_id | UUID | YES | FK->sales | Venda |
| customer_id | UUID | YES | FK->customers | Cliente |
| customer_name | TEXT | YES | | Nome do cliente |
| amount | NUMERIC | YES | | Valor pago |
| payment_method | TEXT | YES | | Metodo |
| paid_at | TIMESTAMPTZ | YES | | Data do pagamento |
| created_at | TIMESTAMPTZ | YES | | |

RLS: superadmin_all_credit_payments[ALL], org_branch_insert_credit_payments[INSERT], org_branch_update_credit_payments[UPDATE], org_branch_delete_credit_payments[DELETE], org_branch_select_credit_payments[SELECT], credit_payments_select_authenticated[SELECT]
Realtime: publicada - REPLICA: full

### scanned_boletos
Boletos escaneados.

| Coluna | Tipo | Null | Key | Descricao |
|--------|------|------|-----|-----------|
| id | UUID | NO | PK | PK |
| organization_id | UUID | YES | FK->organizations | Org |
| store_branch_id | UUID | YES | FK->store_branches | Filial |
| financial_account_id | UUID | YES | | Conta financeira |
| payer | TEXT | YES | | Pagador |
| amount | NUMERIC | YES | | Valor |
| due_date | DATE | YES | | Vencimento |
| scan_date | TIMESTAMPTZ | YES | | Data do scan |
| linha_digitavel | TEXT | YES | | Linha digitavel |
| barcode | TEXT | YES | | Codigo de barras |
| status | TEXT | YES | | Status |
| created_at | TIMESTAMPTZ | YES | | |

RLS: superadmin_all_boletos[ALL], org_branch_insert_boletos[INSERT], org_branch_update_boletos[UPDATE], org_branch_delete_boletos[DELETE], org_branch_select_boletos[SELECT], scanned_boletos_select_authenticated[SELECT]
Realtime: publicada - REPLICA: full

### nf_records
Notas fiscais escaneadas.

| Coluna | Tipo | Null | Key | Descricao |
|--------|------|------|-----|-----------|
| id | UUID | NO | PK | PK |
| organization_id | UUID | YES | FK->organizations | Org |
| store_branch_id | UUID | YES | FK->store_branches | Filial |
| supplier_name | TEXT | YES | | Fornecedor |
| total_amount | NUMERIC | YES | | Valor total |
| scan_date | TIMESTAMPTZ | YES | | Data do scan |
| note | TEXT | YES | | Observacao |
| items | JSONB | YES | | Itens |
| created_at | TIMESTAMPTZ | YES | | |

RLS: superadmin_all_nf_records[ALL], org_branch_insert_nf_records[INSERT], org_branch_update_nf_records[UPDATE], org_branch_delete_nf_records[DELETE], org_branch_select_nf_records[SELECT], nf_records_select_authenticated[SELECT]
Realtime: publicada - REPLICA: full

### ai_insights
Insights de IA gerados (sem IA no app - gerado por backend/Cloudflare).

| Coluna | Tipo | Null | Key | Descricao |
|--------|------|------|-----|-----------|
| id | TEXT | NO | PK | PK (texto) |
| store_branch_id | UUID | NO | FK->store_branches | Filial |
| insights | JSONB | NO | | Insights |
| today_revenue | NUMERIC | YES | | Receita do dia |
| total_sales | INTEGER | YES | | Total de vendas |
| ticket_medio | NUMERIC | YES | | Ticket medio |
| generated_at | TIMESTAMPTZ | NO | | Gerado em |
| created_at | TIMESTAMPTZ | NO | | |
| updated_at | TIMESTAMPTZ | YES | | |

RLS: superadmin_all_ai_insights[ALL], user_insert_ai_insights[INSERT], user_select_ai_insights[SELECT], user_update_ai_insights[UPDATE], user_delete_ai_insights[DELETE]
Realtime: nao publicada - REPLICA: default
## Tabelas de Delivery

### delivery_settings
Configuracao de delivery da filial.

| Coluna | Tipo | Null | Key | Descricao |
|--------|------|------|-----|-----------|
| id | UUID | NO | PK | PK |
| organization_id | UUID | NO | FK->organizations | Org |
| store_branch_id | UUID | NO | FK->store_branches | Filial |
| delivery_enabled | BOOLEAN | YES | | Delivery ativo? |
| pickup_enabled | BOOLEAN | YES | | Retirada ativa? |
| is_active | BOOLEAN | YES | | Ativo? |
| fee_calculation_type | TEXT | YES | | Tipo de calculo de taxa |
| fixed_fee | NUMERIC | YES | | Taxa fixa |
| minimum_order_value | NUMERIC | YES | | Pedido minimo |
| max_delivery_distance_km | INTEGER | YES | | Distancia max. |
| estimated_delivery_time | INTEGER | YES | | Tempo estimado (min) |
| delivery_worker_pay_type | TEXT | YES | | Tipo de pagamento do entregador |
| delivery_worker_fee_percent | INTEGER | YES | | % do entregador |
| delivery_worker_daily_pay | NUMERIC | YES | | Diaria do entregador |
| operating_hours | JSONB | YES | | Horario de funcionamento |
| created_at | TIMESTAMPTZ | YES | | |
| updated_at | TIMESTAMPTZ | YES | | |

RLS: superadmin_all_delivery_settings[ALL], org_branch_insert_delivery_settings[INSERT], org_branch_update_delivery_settings[UPDATE], org_branch_delete_delivery_settings[DELETE], org_branch_select_delivery_settings[SELECT], delivery_settings_select_authenticated[SELECT]
Realtime: publicada - REPLICA: full

### delivery_neighborhoods
Bairros atendidos (taxa fixa).

| Coluna | Tipo | Null | Key | Descricao |
|--------|------|------|-----|-----------|
| id | UUID | NO | PK | PK |
| organization_id | UUID | NO | FK->organizations | Org |
| store_branch_id | UUID | NO | FK->store_branches | Filial |
| neighborhood | TEXT | NO | | Bairro |
| fee | NUMERIC | NO | | Taxa |
| estimated_time_minutes | INTEGER | YES | | Tempo estimado |
| is_active | BOOLEAN | YES | | Ativo? |
| created_at | TIMESTAMPTZ | YES | | |
| updated_at | TIMESTAMPTZ | YES | | |

RLS: superadmin_all_delivery_neighborhoods[ALL], org_branch_insert_delivery_neighborhoods[INSERT], org_branch_update_delivery_neighborhoods[UPDATE], org_branch_delete_delivery_neighborhoods[DELETE], org_branch_select_delivery_neighborhoods[SELECT], delivery_neighborhoods_select_authenticated[SELECT]
Realtime: publicada - REPLICA: full

### delivery_distance_rates
Taxas por faixa de distancia.

| Coluna | Tipo | Null | Key | Descricao |
|--------|------|------|-----|-----------|
| id | UUID | NO | PK | PK |
| organization_id | UUID | NO | FK->organizations | Org |
| store_branch_id | UUID | NO | FK->store_branches | Filial |
| min_km | NUMERIC | NO | | KM minimo |
| max_km | NUMERIC | NO | | KM maximo |
| fee | NUMERIC | NO | | Taxa |
| estimated_time_minutes | INTEGER | YES | | Tempo estimado |
| is_active | BOOLEAN | YES | | Ativo? |
| created_at | TIMESTAMPTZ | YES | | |
| updated_at | TIMESTAMPTZ | YES | | |

RLS: superadmin_all_delivery_distance_rates[ALL], org_branch_insert_delivery_distance_rates[INSERT], org_branch_update_delivery_distance_rates[UPDATE], org_branch_delete_delivery_distance_rates[DELETE], org_branch_select_delivery_distance_rates[SELECT], delivery_distance_rates_select_authenticated[SELECT]
Realtime: publicada - REPLICA: full

### delivery_orders
Pedidos de delivery.

| Coluna | Tipo | Null | Key | Descricao |
|--------|------|------|-----|-----------|
| id | UUID | NO | PK | PK |
| organization_id | UUID | NO | FK->organizations | Org |
| store_branch_id | UUID | NO | FK->store_branches | Filial |
| customer_id | UUID | YES | FK->customers | Cliente |
| customer_name | TEXT | NO | | Nome do cliente |
| customer_whatsapp | TEXT | YES | | WhatsApp |
| customer_email | TEXT | YES | | Email |
| order_type | TEXT | NO | | Tipo do pedido |
| status | TEXT | NO | | Status |
| payment_method | TEXT | YES | | Metodo |
| subtotal | NUMERIC | NO | | Subtotal |
| discount | NUMERIC | NO | | Desconto |
| delivery_fee | NUMERIC | NO | | Taxa de entrega |
| total | NUMERIC | NO | | Total |
| change_amount | NUMERIC | YES | | Troco |
| items_json | JSONB | NO | | Itens |
| delivery_address | JSONB | YES | | Endereco |
| notes | TEXT | YES | | Observacoes |
| whatsapp_sent | BOOLEAN | YES | | WhatsApp enviado? |
| whatsapp_sent_at | TIMESTAMPTZ | YES | | Envio do WhatsApp |
| confirmed_at | TIMESTAMPTZ | YES | | Confirmacao |
| preparing_at | TIMESTAMPTZ | YES | | Preparando |
| ready_at | TIMESTAMPTZ | YES | | Pronto |
| out_for_delivery_at | TIMESTAMPTZ | YES | | Saiu p/ entrega |
| delivered_at | TIMESTAMPTZ | YES | | Entregue |
| delivered_by | UUID | YES | FK->system_users | Entregador |
| cancelled_at | TIMESTAMPTZ | YES | | Cancelamento |
| cancelled_reason | TEXT | YES | | Motivo do cancelamento |
| estimated_delivery_time | INTEGER | YES | | Tempo estimado |
| created_at | TIMESTAMPTZ | YES | | |
| updated_at | TIMESTAMPTZ | YES | | |

RLS: superadmin_all_delivery_orders[ALL], org_branch_insert_delivery_orders[INSERT], org_branch_update_delivery_orders[UPDATE], org_branch_delete_delivery_orders[DELETE], org_branch_select_delivery_orders[SELECT], delivery_orders_select_authenticated[SELECT]
Realtime: publicada - REPLICA: full

### delivery_worker_earnings
Ganhos de entregador.

| Coluna | Tipo | Null | Key | Descricao |
|--------|------|------|-----|-----------|
| id | UUID | NO | PK | PK |
| organization_id | UUID | NO | FK->organizations | Org |
| store_branch_id | UUID | NO | FK->store_branches | Filial |
| worker_id | UUID | NO | FK->system_users | Entregador |
| delivery_order_id | UUID | YES | FK->delivery_orders | Pedido |
| delivery_fee | NUMERIC | NO | | Taxa de entrega |
| worker_amount | NUMERIC | NO | | Valor do entregador |
| company_amount | NUMERIC | NO | | Valor da empresa |
| pay_type | TEXT | NO | | Tipo de pagamento |
| paid | BOOLEAN | YES | | Pago? |
| paid_at | TIMESTAMPTZ | YES | | Data do pagamento |
| created_at | TIMESTAMPTZ | YES | | |

RLS: superadmin_all_delivery_worker_earnings[ALL], user_insert_delivery_worker_earnings[INSERT], user_select_delivery_worker_earnings[SELECT], user_update_delivery_worker_earnings[UPDATE], user_delete_delivery_worker_earnings[DELETE], delivery_worker_earnings_select_authenticated[SELECT]
Realtime: publicada - REPLICA: full
## Tabelas de TV / Impressora

### footer_messages
Mensagens de rodape (telas TV / cupom). Controladas por version (trigger fn_bump_version).

| Coluna | Tipo | Null | Key | Descricao |
|--------|------|------|-----|-----------|
| id | UUID | NO | PK | PK |
| organization_id | UUID | NO | FK->organizations | Org |
| store_branch_id | UUID | NO | FK->store_branches | Filial |
| message | TEXT | NO | | Mensagem |
| sort_order | INTEGER | NO | | Ordem |
| active | BOOLEAN | NO | | Ativa? |
| version | INTEGER | NO | | Versao |
| created_at | TIMESTAMPTZ | NO | | |
| updated_at | TIMESTAMPTZ | NO | | |

RLS: superadmin_all_footer_messages[ALL], org_branch_insert_footer_messages[INSERT], org_branch_update_footer_messages[UPDATE], org_branch_delete_footer_messages[DELETE], org_branch_select_footer_messages[SELECT], footer_messages_select_authenticated[SELECT]
Realtime: publicada - REPLICA: full

### media_devices
Dispositivos de exibicao (TV / midia).

| Coluna | Tipo | Null | Key | Descricao |
|--------|------|------|-----|-----------|
| id | UUID | NO | PK | PK |
| organization_id | UUID | NO | FK->organizations | Org |
| store_branch_id | UUID | NO | FK->store_branches | Filial |
| name | TEXT | NO | | Nome |
| device_type | TEXT | NO | | Tipo |
| is_active | BOOLEAN | NO | | Ativo? |
| pairing_code | TEXT | YES | | Codigo de pareamento |
| address | TEXT | YES | | Endereco |
| last_seen_at | TIMESTAMPTZ | YES | | Ultimo contato |
| version | INTEGER | NO | | Versao |
| created_at | TIMESTAMPTZ | NO | | |
| updated_at | TIMESTAMPTZ | NO | | |

RLS: superadmin_all_media_devices[ALL], org_branch_insert_media_devices[INSERT], org_branch_update_media_devices[UPDATE], org_branch_delete_media_devices[DELETE], org_branch_select_media_devices[SELECT], media_devices_select_authenticated[SELECT]
Realtime: publicada - REPLICA: full

### printers
Impressoras.

| Coluna | Tipo | Null | Key | Descricao |
|--------|------|------|-----|-----------|
| id | UUID | NO | PK | PK |
| organization_id | UUID | NO | FK->organizations | Org |
| store_branch_id | UUID | NO | FK->store_branches | Filial |
| name | TEXT | NO | | Nome |
| model | TEXT | YES | | Modelo |
| transport | TEXT | NO | | Transporte (esc/rede) |
| ip_address | TEXT | YES | | IP |
| port | INTEGER | NO | | Porta |
| status | TEXT | NO | | Status |
| role | TEXT | YES | | Funcao (cupom/cozinha) |
| category_id | UUID | YES | FK->categories | Categoria associada |
| is_default | BOOLEAN | NO | | Padrao? |
| version | INTEGER | NO | | Versao |
| last_seen_at | TIMESTAMPTZ | YES | | Ultimo contato |
| created_at | TIMESTAMPTZ | NO | | |
| updated_at | TIMESTAMPTZ | NO | | |

RLS: superadmin_all_printers[ALL], org_branch_insert_printers[INSERT], org_branch_update_printers[UPDATE], org_branch_delete_printers[DELETE], org_branch_select_printers[SELECT], printers_select_authenticated[SELECT]
Realtime: publicada - REPLICA: full

## Tabelas de Cardapio Digital / Mesas

### tables
Mesas fisicas (PDV / cardapio).

| Coluna | Tipo | Null | Key | Descricao |
|--------|------|------|-----|-----------|
| id | UUID | NO | PK | PK |
| organization_id | UUID | NO | FK->organizations | Org |
| store_branch_id | UUID | NO | FK->store_branches | Filial |
| name | TEXT | NO | | Nome |
| number | INTEGER | YES | | Numero |
| status | TEXT | NO | | Status (livre/ocupada) |
| qr_token | TEXT | NO | | Token do QR (cardapio) |
| created_at | TIMESTAMPTZ | YES | | |
| updated_at | TIMESTAMPTZ | YES | | |

RLS: superadmin_all_tables[ALL], org_branch_insert_tables[INSERT], org_branch_update_tables[UPDATE], org_branch_delete_tables[DELETE], org_branch_select_tables[SELECT], tables_select_authenticated[SELECT], tables_select_anon[SELECT] (USING true - excecao 0f, lookup por qr_token)
Realtime: publicada - REPLICA: full

### customer_sessions
Sessoes de cliente (cardapio digital / mesa).

| Coluna | Tipo | Null | Key | Descricao |
|--------|------|------|-----|-----------|
| id | UUID | NO | PK | PK |
| organization_id | UUID | NO | FK->organizations | Org |
| store_branch_id | UUID | NO | FK->store_branches | Filial |
| table_id | UUID | YES | FK->tables | Mesa |
| customer_name | TEXT | YES | | Nome do cliente |
| status | TEXT | NO | | Status |
| session_token | TEXT | NO | | Token da sessao |
| device_fingerprint | TEXT | YES | | Fingerprint do dispositivo |
| opened_at | TIMESTAMPTZ | YES | | Abertura |
| closed_at | TIMESTAMPTZ | YES | | Fechamento |
| created_at | TIMESTAMPTZ | YES | | |
| updated_at | TIMESTAMPTZ | YES | | |

RLS: superadmin_all_customer_sessions[ALL], org_branch_insert_customer_sessions[INSERT], org_branch_update_customer_sessions[UPDATE], org_branch_delete_customer_sessions[DELETE], org_branch_select_customer_sessions[SELECT], customer_sessions_select_authenticated[SELECT], customer_sessions_insert_anon[INSERT] (WITH CHECK true - 0f), customer_sessions_select_anon[SELECT] (escopo por x-branch-id - 0f), customer_sessions_update_anon[UPDATE] (USING true - [FLAG 1])
Realtime: publicada - REPLICA: full

### digital_menu_config
Configuracao do cardapio digital.

| Coluna | Tipo | Null | Key | Descricao |
|--------|------|------|-----|-----------|
| id | UUID | NO | PK | PK |
| organization_id | UUID | NO | FK->organizations | Org |
| store_branch_id | UUID | NO | FK->store_branches | Filial |
| title | TEXT | YES | | Titulo |
| subtitle | TEXT | YES | | Subtitulo |
| layout_mode | TEXT | YES | | Modo de layout |
| show_prices | BOOLEAN | YES | | Exibir precos? |
| logo_url | TEXT | YES | | Logo |
| banner_url | TEXT | YES | | Banner |
| updated_at | TIMESTAMPTZ | YES | | |

RLS: superadmin_all_digital_menu[ALL], org_branch_insert_digital_menu[INSERT], org_branch_update_digital_menu[UPDATE], org_branch_delete_digital_menu[DELETE], org_branch_select_digital_menu[SELECT], digital_menu_config_select_authenticated[SELECT], digital_menu_config_select_anon[SELECT] (escopo por x-branch-id - 0f)
Realtime: publicada - REPLICA: full

### branch_themes
Temas visuais da filial.

| Coluna | Tipo | Null | Key | Descricao |
|--------|------|------|-----|-----------|
| id | UUID | NO | PK | PK |
| organization_id | UUID | NO | FK->organizations | Org |
| store_branch_id | UUID | NO | FK->store_branches | Filial |
| primary_color | TEXT | YES | | Cor primaria |
| secondary_color | TEXT | YES | | Cor secundaria |
| accent_color | TEXT | YES | | Cor de acento |
| bg_color | TEXT | YES | | Cor de fundo |
| logo_url | TEXT | YES | | Logo |
| favicon_url | TEXT | YES | | Favicon |
| updated_at | TIMESTAMPTZ | YES | | |

RLS: superadmin_all_branch_themes[ALL], org_branch_insert_branch_themes[INSERT], org_branch_update_branch_themes[UPDATE], org_branch_delete_branch_themes[DELETE], org_branch_select_branch_themes[SELECT], branch_themes_select_authenticated[SELECT]
Realtime: publicada - REPLICA: full

## Tabelas de Pagamento / Integracao

### pix_config
Configuracao PIX (chave exibida manualmente - sem gateway automatico).

| Coluna | Tipo | Null | Key | Descricao |
|--------|------|------|-----|-----------|
| id | UUID | NO | PK | PK |
| organization_id | UUID | NO | FK->organizations | Org |
| store_branch_id | UUID | NO | FK->store_branches | Filial |
| nome_titular | TEXT | NO | | Nome do titular |
| tipo_chave | TEXT | NO | | Tipo de chave |
| chave_pix | TEXT | NO | | Chave PIX |
| cidade | TEXT | YES | | Cidade |
| ativo | BOOLEAN | YES | | Ativo? |
| created_at | TIMESTAMPTZ | YES | | |
| updated_at | TIMESTAMPTZ | YES | | |

RLS: superadmin_all_pix_config[ALL], user_insert_pix_config[INSERT], user_update_pix_config[UPDATE], user_delete_pix_config[DELETE], user_select_pix_config[SELECT]
Realtime: nao publicada - REPLICA: default

### api_keys
Chaves de API (integracoes - atualmente so localStorage no app, ver Pendencias).

| Coluna | Tipo | Null | Key | Descricao |
|--------|------|------|-----|-----------|
| id | UUID | NO | PK | PK |
| organization_id | UUID | NO | FK->organizations | Org |
| store_branch_id | UUID | NO | FK->store_branches | Filial |
| name | TEXT | NO | | Nome da chave |
| key_prefix | TEXT | NO | | Prefixo (nao o segredo) |
| key_hash | TEXT | NO | | Hash da chave |
| permissions | JSONB | YES | | Permissoes da chave |
| is_active | BOOLEAN | YES | | Ativa? |
| expires_at | TIMESTAMPTZ | YES | | Expiracao |
| last_used_at | TIMESTAMPTZ | YES | | Ultimo uso |
| created_at | TIMESTAMPTZ | YES | | |
| updated_at | TIMESTAMPTZ | YES | | |

RLS: superadmin_all_api_keys[ALL], org_branch_insert_api_keys[INSERT], org_branch_update_api_keys[UPDATE], org_branch_delete_api_keys[DELETE], org_branch_select_api_keys[SELECT], api_keys_select_authenticated[SELECT]
Realtime: publicada - REPLICA: full

### webhook_events
Eventos de webhook (ex.: confirmacao de pagamento de gateway).

| Coluna | Tipo | Null | Key | Descricao |
|--------|------|------|-----|-----------|
| id | UUID | NO | PK | PK |
| organization_id | UUID | NO | FK->organizations | Org |
| store_branch_id | UUID | YES | FK->store_branches | Filial |
| event_type | TEXT | NO | | Tipo do evento |
| payment_id | TEXT | YES | | ID do pagamento |
| payload | JSONB | NO | | Payload |
| processed | BOOLEAN | YES | | Processado? |
| error_message | TEXT | YES | | Erro |
| processed_at | TIMESTAMPTZ | YES | | Processado em |
| created_at | TIMESTAMPTZ | YES | | |

RLS: superadmin_all_webhook_events[ALL], org_branch_insert_webhook_events[INSERT], org_branch_update_webhook_events[UPDATE], org_branch_delete_webhook_events[DELETE], org_branch_select_webhook_events[SELECT]
Realtime: publicada - REPLICA: full

## Tabelas de Sincronizacao / Auditoria

### sync_queue
Fila de sincronizacao offline.

| Coluna | Tipo | Null | Key | Descricao |
|--------|------|------|-----|-----------|
| id | UUID | NO | PK | PK |
| organization_id | UUID | YES | FK->organizations | Org |
| store_branch_id | UUID | NO | FK->store_branches | Filial |
| table_name | TEXT | NO | | Tabela |
| operation_type | TEXT | NO | | INSERT/UPDATE/DELETE |
| payload | JSONB | NO | | Payload |
| status | TEXT | YES | | Status |
| retry_count | INTEGER | YES | | Tentativas |
| max_retries | INTEGER | YES | | Max. tentativas |
| last_retry_at | TIMESTAMPTZ | YES | | Ultima tentativa |
| processed_at | TIMESTAMPTZ | YES | | Processado em |
| error_message | TEXT | YES | | Erro |
| created_at | TIMESTAMPTZ | YES | | |
| updated_at | TIMESTAMPTZ | YES | | |

RLS: superadmin_all_sync_queue[ALL], org_branch_insert_sync_queue[INSERT], org_branch_update_sync_queue[UPDATE], org_branch_delete_sync_queue[DELETE], org_branch_select_sync_queue[SELECT]
Realtime: publicada - REPLICA: full

### movimentacoes_falhas
DLQ - movimentacoes que falharam (dead letter queue).

| Coluna | Tipo | Null | Key | Descricao |
|--------|------|------|-----|-----------|
| id | UUID | NO | PK | PK |
| organization_id | UUID | YES | FK->organizations | Org |
| store_branch_id | UUID | NO | FK->store_branches | Filial |
| operation_type | TEXT | NO | | Operacao |
| table_name | TEXT | NO | | Tabela |
| record_id | TEXT | YES | | ID do registro |
| payload | JSONB | NO | | Payload original |
| error_message | TEXT | NO | | Mensagem de erro |
| error_code | TEXT | YES | | Codigo |
| error_status | INTEGER | YES | | Status HTTP |
| stack_trace | TEXT | YES | | Stack trace |
| status | TEXT | YES | | Status |
| source | TEXT | YES | | Origem |
| browser_id | TEXT | YES | | Browser ID |
| user_email | TEXT | YES | | Email do usuario |
| retry_count | INTEGER | YES | | Tentativas |
| max_retries | INTEGER | YES | | Max. tentativas |
| next_retry_at | TIMESTAMPTZ | YES | | Proxima tentativa |
| last_retry_at | TIMESTAMPTZ | YES | | Ultima tentativa |
| resolved_by | TEXT | YES | | Resolvido por |
| resolved_at | TIMESTAMPTZ | YES | | Resolvido em |
| metadata | JSONB | YES | | Metadados |
| created_at | TIMESTAMPTZ | YES | | |
| updated_at | TIMESTAMPTZ | YES | | |

RLS: superadmin_all_movimentacoes_falhas[ALL], user_insert_movimentacoes_falhas[INSERT], user_select_movimentacoes_falhas[SELECT], user_update_movimentacoes_falhas[UPDATE], user_delete_movimentacoes_falhas[DELETE]
Realtime: nao publicada - REPLICA: default
Nota: nao publicada no realtime - o monitor de DLQ no frontend nao atualiza sozinho (possivel melhoria de UX).

### audit_log
Log de auditoria de acoes.

| Coluna | Tipo | Null | Key | Descricao |
|--------|------|------|-----|-----------|
| id | UUID | NO | PK | PK |
| organization_id | UUID | NO | FK->organizations | Org |
| store_branch_id | UUID | YES | FK->store_branches | Filial |
| user_id | UUID | NO | FK->system_users | Usuario |
| user_name | TEXT | NO | | Nome do usuario |
| user_email | TEXT | NO | | Email |
| user_agent | TEXT | YES | | User agent |
| ip_address | TEXT | YES | | IP |
| action | TEXT | NO | | Acao |
| entity_type | TEXT | NO | | Tipo de entidade |
| entity_id | TEXT | YES | | ID da entidade |
| entity_name | TEXT | YES | | Nome da entidade |
| old_value | JSONB | YES | | Valor anterior |
| new_value | JSONB | YES | | Novo valor |
| created_at | TIMESTAMPTZ | YES | | |

RLS: superadmin_all_audit_log[ALL], org_branch_insert_audit_log[INSERT], org_branch_update_audit_log[UPDATE], org_branch_delete_audit_log[DELETE], org_branch_select_audit_log[SELECT]
Realtime: publicada - REPLICA: full

### filial_backups
Backups de filial.

| Coluna | Tipo | Null | Key | Descricao |
|--------|------|------|-----|-----------|
| id | UUID | NO | PK | PK |
| organization_id | UUID | NO | FK->organizations | Org |
| store_branch_id | UUID | NO | FK->store_branches | Filial |
| backup_name | TEXT | NO | | Nome do backup |
| backup_data | JSONB | NO | | Dados |
| record_count | INTEGER | YES | | Nr de registros |
| data_size_bytes | INTEGER | YES | | Tamanho |
| is_automatic | BOOLEAN | YES | | Automatico? |
| created_by | UUID | YES | | Criado por |
| restored_by | UUID | YES | | Restaurado por |
| restored_at | TIMESTAMPTZ | YES | | Restaurado em |
| created_at | TIMESTAMPTZ | YES | | |

RLS: superadmin_all_filial_backups[ALL], user_insert_filial_backups[INSERT], user_select_filial_backups[SELECT], user_update_filial_backups[UPDATE], user_delete_filial_backups[DELETE]
Realtime: publicada - REPLICA: full

### sessions
Sessoes de token (escopo por filial; PK = session_id).

| Coluna | Tipo | Null | Key | Descricao |
|--------|------|------|-----|-----------|
| session_id | UUID | NO | PK | PK (nome real: session_id) |
| user_id | UUID | NO | FK->auth.users | Usuario |
| store_branch_id | UUID | NO | FK->store_branches | Filial |
| email | TEXT | NO | | Email |
| tag | TEXT | YES | | Etiqueta |
| created_at | TIMESTAMPTZ | NO | | Criacao |
| not_after | TIMESTAMPTZ | NO | | Expiracao |

RLS: superadmin_all_sessions[ALL], org_branch_insert_sessions[INSERT], org_branch_update_sessions[UPDATE], org_branch_delete_sessions[DELETE], org_branch_select_sessions[SELECT], user_insert_sessions[INSERT], user_select_sessions[SELECT], user_update_sessions[UPDATE], user_delete_sessions[DELETE]
Realtime: publicada - REPLICA: full

## Visibilidade de Modulos

### module_visibility
Visibilidade de modulos por filial.

| Coluna | Tipo | Null | Key | Descricao |
|--------|------|------|-----|-----------|
| id | UUID | NO | PK | PK |
| organization_id | UUID | NO | FK->organizations | Org |
| store_branch_id | UUID | NO | FK->store_branches | Filial (UNIQUE) |
| module_pdv | BOOLEAN | YES | | PDV |
| module_inventory | BOOLEAN | YES | | Estoque |
| module_fiado | BOOLEAN | YES | | Fiados |
| module_crm | BOOLEAN | YES | | CRM |
| module_dashboard | BOOLEAN | YES | | Dashboard |
| module_finance | BOOLEAN | YES | | Financeiro |
| module_kds | BOOLEAN | YES | | KDS/Cozinha |
| module_delivery | BOOLEAN | YES | | Delivery |
| module_cardapio_digital | BOOLEAN | YES | | Cardapio Digital |
| module_cardapio_preview | BOOLEAN | YES | | Preview Cardapio |
| module_comanda | BOOLEAN | NO | | Comandas |
| module_tv_showcase | BOOLEAN | YES | | TV Showcase |
| module_tv_connect | BOOLEAN | YES | | TV Connect |
| created_at | TIMESTAMPTZ | YES | | |
| updated_at | TIMESTAMPTZ | YES | | |

RLS: superadmin_all_module_visibility[ALL], org_branch_insert_module_visibility[INSERT], org_branch_update_module_visibility[UPDATE], org_branch_delete_module_visibility[DELETE], org_branch_select_module_visibility[SELECT], module_visibility_select_authenticated[SELECT]
Realtime: publicada - REPLICA: full
## Views

### vw_report_sale_items
Relatorio de itens de venda (join de sales + sale_items + products + customers + operador).

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| sale_id | UUID | Venda |
| item_id | UUID | Item |
| product_id | UUID | Produto |
| product_name | TEXT | Nome |
| category_name | TEXT | Categoria |
| quantity | INTEGER | Qtd |
| unit_price | NUMERIC | Preco unit. |
| item_total | NUMERIC | Total item |
| item_discount | NUMERIC | Desconto item |
| sale_total | NUMERIC | Total venda |
| sale_date | TIMESTAMPTZ | Data |
| sale_status | TEXT | Status |
| payment_method | TEXT | Metodo |
| customer_id | UUID | Cliente |
| customer_name | TEXT | Nome cliente |
| operator_id | UUID | Operador |
| operator_name | TEXT | Nome operador |
| operator_commission_rate | NUMERIC | Comissao |
| organization_id | UUID | Org |
| store_branch_id | UUID | Filial |

### vw_dlq_pendentes
DLQ pendente (movimentacoes_falhas nao resolvidas).

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | UUID | ID |
| organization_id | UUID | Org |
| store_branch_id | UUID | Filial |
| table_name | TEXT | Tabela |
| operation_type | TEXT | Operacao |
| record_id | TEXT | Registro |
| source | TEXT | Origem |
| user_email | TEXT | Email |
| error_message | TEXT | Erro |
| error_status | INTEGER | Status HTTP |
| retry_count | INTEGER | Tentativas |
| max_retries | INTEGER | Max. |
| next_retry_at | TIMESTAMPTZ | Proxima tentativa |
| created_at | TIMESTAMPTZ | Criacao |

### vw_dlq_resumo
Resumo de DLQ por filial/org.

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| organization_id | UUID | Org |
| store_branch_id | UUID | Filial |
| status | TEXT | Status |
| total | BIGINT | Total de falhas |
| tables_affected | BIGINT | Tabelas afetadas |
| oldest_failure | TIMESTAMPTZ | Falha mais antiga |
| newest_failure | TIMESTAMPTZ | Falha mais recente |

## Funcoes

### Helpers de RLS (usados nas policies)
- is_superadmin() -> boolean (DEFINER). Verifica superadmin = true.
- get_user_org_id() -> uuid (DEFINER). organization_id do auth.uid().
- get_user_branch_id() -> uuid (DEFINER). app.current_branch_id ou fallback system_users.
- get_user_role() -> text (DEFINER).
- cardapio_branch_from_header() -> uuid (INVOKER). Le x-branch-id do header. NOTA: as policies anon SELECT inlineiam current_setting('request.headers'...) em vez de chamar esta funcao (flag #6 - clareza de doc).

### RPCs de escrita (SECURITY DEFINER)
- ajustar_estoque(p_product_id, p_quantity, p_type, p_reason, p_operator_name, p_organization_id, p_store_branch_id) -> json. Ajuste de estoque. Grants: authenticated + service_role (NAO anon - regra 9).
- process_sale_transaction(p_sale_id, ...) -> TABLE(success, message). Cardapio anon. Grants: anon + authenticated + service_role (excecao 0f).
- process_sale_atomic(p_sale_data, p_items, p_payments, p_session_id) -> jsonb. Server-only. Grants: service_role.
- cancel_sale_atomic(p_sale_id, p_session_id) -> jsonb. Server-only. Grants: service_role.
- create_customer_session(...) -> jsonb. Server-only. Grants: service_role.
- close_cash_session(p_session_id, p_final_balance, p_notes) -> jsonb. Server-only. Grants: service_role.
- create_filial_backup(...) -> uuid. Grants: authenticated + service_role.
- fn_insserir_dlq(...) -> uuid. DLQ. Grants: anon + authenticated + service_role (excecao 0f).
- transfer_table_session(p_session_id, p_new_table_id) -> jsonb. Server-only. Grants: service_role.
- gerar_token_e_criar_sessao(p_user_id, p_email) -> text. Server-only. Grants: service_role.
- debug_auth() -> jsonb. Server-only. Grants: service_role.
- reprocessar_movimentacoes_falhas() -> TABLE. Server-only. Grants: service_role.
- admin_add_user(...), admin_create_organization(...), admin_fetch_users(...), admin_fetch_branches(...), admin_fetch_organizations(...), admin_delete_organization(...). Grants: authenticated + service_role (admin_delete_organization apenas service_role).

## Triggers

Event trigger: rls_auto_enable (DEFINER) - auto-habilita RLS em novas tabelas (garante regra 0).

Por tabela (funcao -> trigger):
- fn_update_updated_at: ai_insights, cash_sessions, customers, delivery_*, financial_transactions, footer_messages, media_devices, module_visibility, movimentacoes_falhas, pix_config, printers, products, sale_items, sales, scanned_boletos, stock_*, store_branches, suppliers, sync_queue, system_settings, system_users, user_permissions, filial_backups.
- fn_validate_store_branch_id (BEFORE INSERT/UPDATE): cash_sessions, categories, credit_payments, customers, financial_transactions, footer_messages, media_devices, nf_records, printers, products, sale_items, sales, scanned_boletos, stock_movements, suppliers, system_users.
- fn_ensure_system_user_org (BEFORE INSERT/UPDATE): system_users.
- fn_ensure_cash_session_org (BEFORE INSERT/UPDATE): cash_sessions.
- fn_bump_version (BEFORE UPDATE): footer_messages, media_devices, printers, system_settings.
- fn_prevent_negative_stock (BEFORE UPDATE OF stock_quantity, WHEN new < 0): products. [FLAG 4]
- fn_sync_product_name (AFTER UPDATE OF name): products. [FLAG 4]
- handle_new_user (trigger em auth.users): insere em profiles (NAO em system_users).

## Migracoes

Tabela storage.migrations contem APENAS as migracoes internas do storage do Supabase (ids 0-64: storage-schema, buckets, objects, search, s3-multipart, iceberg, etc.). NENHUMA migration de projeto esta registrada la.

O schema de negocio (45 tabelas + RLS + funcoes + triggers) foi construido via SQL Editor, nao via sistema de migrations. **Limpeza de 2026-08-23:** scripts de diagnostico/verificacao one-shot e limpeza ja aplicada foram removidos; os `FIX_*` e variantes superadas de RLS foram movidos para `supabase/legacy-sql/` (arquivo); a pasta `migrations/` da raiz foi consolidada em `supabase/migrations/` (agora unica pasta canonica de migrations).

Localizacao atual dos .sql de projeto:
- `supabase/migrations/` : migrations de schema propriamente ditas (20260726 a 20260822, incluindo as 2 que estavam na raiz: `20260821_add_module_comanda.sql`, `20260822_system_users_permissions.sql`).
- `supabase/legacy-sql/` : scripts antigos/diagnosticos/FIX_* (arquivo historico, nao ativos).
- `supabase/RLS_FIXES.sql`, `supabase/ATOMIC_RPCS.sql` : referencias canonicas de RLS/RPCs (mantidas na raiz de `supabase/`).

Principais migracoes recentes de projeto (por data):
- 20260822_system_users_permissions.sql (permissions em system_users)
- 20260821_add_module_comanda.sql / 20260821_scope_anon_select_rls.sql
- 20260816_fix_product_lots_rls.sql
- 20260815_* (cardapio anon, printers role, tv/impressora, align org)
- 20260814_add_product_lots.sql / organization_active_flag.sql
- 20260813_* (composite, rls using-true, admin delete org, branch rpc, expiration)
- 20260812_* (realtime publication, backup/restore)
- 20260811_wholesale_options.sql
- 20260810_* (dezendas de RLS, delivery, webhook_events, payroll, recorrencias, payments_json)
- 20260809_* (fixes de RLS/finance/recorrencia)
- anteriores: 20260726_create_ai_insights ate 20260808 (base do schema, RLS fase 1/2, usuarios auth).

[FLAG 7] Nenhuma migration de projeto registrada em storage.migrations -> db reset / ambiente limpo reconstrÃ³i so o storage-schema e perde as 45 tabelas de negocio. Decidir processo de migrations (CLI Supabase ou ledger manual) fora do escopo desta edicao de doc, mas documentado aqui.

## Pendencias Conhecidas

| # | Sev | Item | Regra |
|---|-----|------|------|
| 1 | Media | customer_sessions_update_anon e USING true em UPDATE anon - fora das excecoes 0f (store_branches_select_anon, tables_select_anon). Anon poderia atualizar qualquer sessao. | 0b/0f |
| 2 | Media | financial_transactions_insert_own sem store_branch_id no WITH CHECK. | BUG-RLS-002 |
| 3 | Media | admin_insert_org_users sem store_branch_id no WITH CHECK. | BUG-RLS-002 |
| 4 | Baixa | Triggers fn_prevent_negative_stock + fn_sync_product_name em products. AGENTS.md regra 8 proibe triggers de estoque no banco. | 8 |
| 5 | - | (Resolvido) 3 RPCs de venda: so process_sale_transaction e anon; process_sale_atomic / cancel_sale_atomic sao server-only. Sem violacao. | 0f |
| 6 | Doc | cardapio_branch_from_header() existe mas policies anon inlineiam current_setting. | 0f (clareza) |
| 7 | Alta (processo) | Nenhuma migration de projeto em storage.migrations (so storage-schema). Risco de DR / ambiente limpo. | - |

Notas de integracao (fora deescopo de correcao nesta audite): IntegrationsView so coleta chaves em localStorage; webhook em server.ts e dev-only; sales.payment_id nunca setado; PIX e exibicao manual. Ver relatorio de auditoria de pagamentos (Fase 1/2) para arquitetura multi-filial proposta (payment_integrations -> payment_terminals -> payment_transactions -> webhook_events, via Cloudflare Functions).
## System Schemas (Supabase-managed)

> NOTA: estes schemas sao gerenciados pelo proprio Supabase (nao sao tabelas de negocio do HD-System). O app nao cria, altera nem droppa estas tabelas. A estrutura abaixo reflete o padrao de um projeto Supabase (pode variar por versao/regiao). Listadas para referencia de integracao (auth.users, storage.buckets/objects, cron.job).
> COLUNAS-CHAVE baseadas no schema padrao do Supabase e NAO verificadas contra esta instancia nesta sessao. Para exatidao total, rode: SELECT table_schema, table_name, column_name, data_type FROM information_schema.columns WHERE table_schema IN ('auth','storage','cron','realtime','vault') ORDER BY 1,2,3 e cole o resultado.
> SEGURANCA: vault.secrets NAO tem colunas listadas (armazena segredos cifrados). Nao inclua valores de segredos neste arquivo versionado.

### auth (autenticacao)
Tabela central de contas. system_users.id e profiles.id DEVEM ser iguais a auth.users.id (BUG-033).

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | UUID | PK; = system_users.id / profiles.id |
| email | TEXT | Email de login |
| encrypted_password | TEXT | Hash da senha |
| email_confirmed_at | TIMESTAMPTZ | Confirmacao |
| last_sign_in_at | TIMESTAMPTZ | Ultimo login |
| raw_app_meta_data | JSONB | Metadados do app |
| raw_user_meta_data | JSONB | Metadados do usuario |
| created_at | TIMESTAMPTZ | Criacao |
| updated_at | TIMESTAMPTZ | Atualizacao |

Outras tabelas de auth: identities (logins OAuth/provider), sessions (sessoes de auth - nao confundir com public.sessions), refresh_tokens, instances (interno), mfa_factors / mfa_challenges / mfa_amr_claims (MFA), one_time_tokens (OTP), flow_state (fluxo OAuth), saml_providers / saml_relay_states / sso_providers / sso_domains (SSO/SAML), oauth_authorizations / oauth_clients / oauth_client_states / oauth_consents (OAuth server), webauthn_credentials / webauthn_challenges (passkeys), audit_log_entries (auditoria), schema_migrations (migrations de auth).

### storage (arquivos)
Backend de arquivos (imagens de produto, anexos).

| Tabela | Colunas-chave | Descricao |
|--------|---------------|-----------|
| buckets | id, name, owner, public (bool), created_at, updated_at | Containers de arquivos |
| objects | id, bucket_id (FK->buckets), name, owner, metadata (jsonb), created_at, updated_at, last_accessed_at, path_tokens | Arquivos |

Internas: buckets_analytics, buckets_vectors, vector_indexes, s3_multipart_uploads, s3_multipart_uploads_parts, migrations (ledger de migrations do storage - ver Flag 7).

### realtime (tempo real)
Plumbing interno do Realtime. messages_AAAA_MM_DD sao particoes diarias automaticas de messages (ex.: 2026-08-20 a 2026-08-26) - nao documentar individualmente.
- messages - log de mensagens
- messages_2026_08_20 ... messages_2026_08_26 - particoes diarias
- subscription - inscricoes de realtime
- schema_migrations - migrations do realtime

### cron (agendamentos - pg_cron)
| Tabela | Colunas-chave | Descricao |
|--------|---------------|-----------|
| job | jobid, schedule, command, database, username, active (bool), secret | Jobs agendados |
| job_run_details | jobid, runid, status, return_message, start_time, end_time | Historico de execucoes |

### vault (segredos)
- secrets - armazena segredos cifrados (chaves de API, credenciais). [NAO documentado por seguranca - nao listar colunas nem valores.]
