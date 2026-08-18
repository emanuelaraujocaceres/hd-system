# SUPABASE SCHEMA — Referência Completa do Banco de Dados

> **Última atualização:** 2026-08-13 (MIGRATIONS CONFIRMADAS NO SUPABASE ✅)
> **Projeto:** `tixwhmgzibvazkqbqoev` (https://tixwhmgzibvazkqbqoev.supabase.co)
> **Migrations:** 78 arquivos em `supabase/migrations/`
> **Total tabelas na realtime:** 32

## Regra de Manutenção

> **AGENTS.md R-SCHEMA:** Este arquivo DEVE ser atualizado a cada migration aplicada.
> Antes de criar/modificar qualquer tabela, verifique a estrutura atual aqui.
> Se encontrar divergência entre este arquivo e o banco real, corrija este arquivo.

---

## Visão Geral

- **Arquitetura:** Multi-tenant com `organization_id` + `store_branch_id`
- **Chaves primárias:** UUID em todas as tabelas
- **Realtime:** ~20 tabelas na publicação `supabase_realtime` com `REPLICA IDENTITY FULL`
- **RLS:** Obrigatório em todas as tabelas (exceto views com `security_invoker`)
- **Estoque:** Gerenciado pelo frontend (sem trigger no banco)

---

## Tabelas Principais

### organizations
Organização (tenant). O sistema HD-System tem org_id = `00000000-0000-0000-0000-000000000001`.

| Coluna | Tipo | Default | Descrição |
|--------|------|---------|-----------|
| id | UUID PK | `'00000000-...'` | PK |
| name | TEXT NOT NULL | `'HD-System'` | Nome da organização |
| active | BOOLEAN NOT NULL | `TRUE` | Ativa? (adicionado em 20260814) |
| subscription_expires_at | TIMESTAMPTZ | NULL | Validade da assinatura |
| created_at | TIMESTAMPTZ | `now()` | Data de criação |

### profiles
Perfis de usuários (vinculado a auth.users).

| Coluna | Tipo | Default | Descrição |
|--------|------|---------|-----------|
| id | UUID PK | | FK → auth.users (CASCADE) |
| organization_id | UUID | | FK → organizations (CASCADE) |
| name | TEXT NOT NULL | | Nome do usuário |
| email | TEXT | | Email |
| role | TEXT | `'admin'` | 'admin' ou 'collaborator' |
| avatar_url | TEXT | | URL do avatar |
| created_at | TIMESTAMPTZ | `now()` | |
| updated_at | TIMESTAMPTZ | `now()` | |

### store_branches
Filiais do estabelecimento.

| Coluna | Tipo | Default | Descrição |
|--------|------|---------|-----------|
| id | UUID PK | | PK |
| organization_id | UUID NOT NULL | | FK → organizations |
| name | TEXT NOT NULL | | Nome da filial |
| address | TEXT | | Endereço |
| phone | TEXT | | Telefone |
| is_active | BOOLEAN | `true` | Filial ativa? |
| full_address | TEXT | | Endereço completo (delivery) |
| whatsapp_phone | TEXT | | WhatsApp para pedidos |
| latitude | DECIMAL(10,8) | | Latitude |
| longitude | DECIMAL(11,8) | | Longitude |
| delivery_enabled | BOOLEAN | `false` | Delivery habilitado? |
| pickup_enabled | BOOLEAN | `true` | Retirada habilitada? |
| created_at | TIMESTAMPTZ | `now()` | |
| updated_at | TIMESTAMPTZ | `now()` | |

### products
Produtos do estoque. **NÃO tem trigger de estoque — o desconto é feito pelo frontend.**

| Coluna | Tipo | Default | Descrição |
|--------|------|---------|-----------|
| id | UUID PK | | PK |
| organization_id | UUID NOT NULL | | FK → organizations |
| store_branch_id | UUID | | FK → store_branches |
| name | TEXT NOT NULL | | Nome do produto |
| barcode | TEXT | | EAN-13 |
| cost_price | NUMERIC(12,2) | | Preço de custo |
| sale_price | NUMERIC(12,2) | | Preço de venda unitário |
| stock_quantity | INTEGER | `0` | Estoque atual (frontend-managed!) |
| category | TEXT | | Nome da categoria |
| category_id | UUID | | FK → categories |
| description | TEXT | | Descrição |
| is_active | BOOLEAN | `true` | Produto ativo? |
| unit | TEXT | `'un'` | un, kg, cx, lit, m |
| wholesale_options | JSONB | | Opções de atacado (array de {id, boxQuantity, salePrice}) |
| show_on_cardapio | BOOLEAN | `false` | Exibir no cardápio digital |
| expiration_date | DATE | | Data de validade (alertas no Dashboard) |
| is_composite | BOOLEAN | `false` | Produto composto (desconta ingredientes) |
| use_lots | BOOLEAN | `false` | Controle por lote (FEFO) — produtos com useLots=True usam product_lots |
| created_at | TIMESTAMPTZ | `now()` | |
| updated_at | TIMESTAMPTZ | `now()` | |

**⚠️ COLUNAS RECÉM ADICIONADAS (2026-08-13/14):**
- `expiration_date DATE` — Data de validade do produto (para produtos sem lote)
- `is_composite BOOLEAN` — Produto composto (usa product_recipes)
- `image_url TEXT` — URL da imagem (mapeado como `imageUrl` no frontend)
- `use_lots BOOLEAN` — Habilita rastreamento por lote (FEFO)

### categories
Categorias de produtos.

| Coluna | Tipo | Default | Descrição |
|--------|------|---------|-----------|
| id | UUID PK | | PK |
| organization_id | UUID NOT NULL | | FK → organizations |
| store_branch_id | UUID | | FK → store_branches |
| name | TEXT NOT NULL | | Nome da categoria |
| created_at | TIMESTAMPTZ | `now()` | |
| updated_at | TIMESTAMPTZ | `now()` | |

### product_lots
Lotes de produto para rastreamento por validade (FEFO). Cada lote representa uma remessa de compra com sua própria data de validade e quantidade.

| Coluna | Tipo | Default | Descrição |
|--------|------|---------|-----------|
| id | UUID PK | `gen_random_uuid()` | PK |
| organization_id | UUID NOT NULL | | FK → organizations (CASCADE) |
| store_branch_id | UUID NOT NULL | | FK → store_branches (CASCADE) |
| product_id | UUID NOT NULL | | FK → products (CASCADE) |
| lot_number | TEXT NOT NULL | | Código do lote do fornecedor |
| expiration_date | DATE NOT NULL | | Data de validade do lote |
| quantity | INTEGER NOT NULL | `0` | Quantidade em estoque deste lote |
| cost_price | NUMERIC(12,2) | | Custo específico deste lote |
| status | TEXT NOT NULL | `'active'` | `active`, `expired`, `disposed` |
| supplier_id | UUID | | FK → suppliers |
| received_at | TIMESTAMPTZ | `now()` | Data de recebimento |
| created_at | TIMESTAMPTZ | `now()` | |
| updated_at | TIMESTAMPTZ | `now()` | |
| UNIQUE(product_id, lot_number) | | | Lote único por produto |

**Notas:**
- Índices: `product_lots_fefo` (product_id, status, expiration_date) para FEFO
- RLS: branch-scoped via `create_branch_policy()`
- Realtime: habilitado com REPLICA IDENTITY FULL

### stock_loss_log
Registro de perdas de estoque (validade, avaria, etc.).

| Coluna | Tipo | Default | Descrição |
|--------|------|---------|-----------|
| id | UUID PK | `gen_random_uuid()` | PK |
| organization_id | UUID NOT NULL | | FK → organizations (CASCADE) |
| store_branch_id | UUID NOT NULL | | FK → store_branches (CASCADE) |
| product_id | UUID NOT NULL | | FK → products (CASCADE) |
| lot_id | UUID | | FK → product_lots (SET NULL) |
| quantity | INTEGER NOT NULL | | Quantidade perdida |
| reason | TEXT NOT NULL | | `expired`, `damaged`, `other` |
| operator_name | TEXT | | Nome do operador |
| notes | TEXT | | Observações |
| created_at | TIMESTAMPTZ | `now()` | |

**Notas:**
- RLS: branch-scoped via `create_branch_policy()`
- Realtime: habilitado com REPLICA IDENTITY FULL

### product_recipes
Receitas de produtos compostos (Bill of Materials). Cada ingrediente é um produto do estoque.

| Coluna | Tipo | Default | Descrição |
|--------|------|---------|-----------|
| id | UUID PK | `gen_random_uuid()` | PK |
| organization_id | UUID NOT NULL | | FK → organizations (CASCADE) |
| store_branch_id | UUID | | FK → store_branches (SET NULL) |
| composite_product_id | UUID NOT NULL | | FK → products (CASCADE) — o produto composto |
| ingredient_product_id | UUID NOT NULL | | FK → products (CASCADE) — o ingrediente |
| ingredient_name | TEXT | | Nome do ingrediente (denormalizado) |
| quantity | NUMERIC(12,4) NOT NULL | `1` | Qtd do ingrediente por 1 unidade do composto |
| unit | TEXT | `'un'` | unidade: un, lit, kg |
| created_at | TIMESTAMPTZ | `now()` | |
| updated_at | TIMESTAMPTZ | `now()` | |
| UNIQUE(composite_product_id, ingredient_product_id) | | | Impede ingrediente duplicado |

**Exemplo: "Copão" composto por:**
- 0.25L de Vodka (1 dose de garrafa 1L)
- 0.5L de Energético (1 dose de garrafa 2L)
- 1 gelo de sabor

**Ao vender 1 "Copão":** desconta 0.25 do produto "Vodka", 0.5 do "Energético" e 1 do "Gelo de Sabor".

### customers
Clientes (walk-in e delivery).

| Coluna | Tipo | Default | Descrição |
|--------|------|---------|-----------|
| id | UUID PK | | PK |
| organization_id | UUID NOT NULL | | FK → organizations |
| store_branch_id | UUID | | FK → store_branches |
| name | TEXT NOT NULL | | Nome do cliente |
| cpf_cnpj | TEXT | | CPF ou CNPJ |
| phone | TEXT | | Telefone |
| email | TEXT | | Email |
| address | TEXT | | Endereço (legacy) |
| credit_limit | NUMERIC(12,2) | | Limite de crédito |
| notes | TEXT | | Observações |
| birth_date | DATE | | Data de nascimento |
| whatsapp | TEXT | `''` | WhatsApp |
| address_street | TEXT | `''` | Rua |
| address_number | TEXT | `''` | Número |
| address_complement | TEXT | `''` | Complemento |
| address_neighborhood | TEXT | `''` | Bairro |
| address_city | TEXT | `''` | Cidade |
| address_state | TEXT | `''` | Estado |
| address_zip | TEXT | `''` | CEP |
| google_id | TEXT | | ID Google OAuth |
| password_hash | TEXT | | Senha hash |
| customer_type | TEXT | `'walkin'` | 'walkin', 'delivery', 'both' |
| created_at | TIMESTAMPTZ | `now()` | |
| updated_at | TIMESTAMPTZ | `now()` | |

> ⚠️ **NOTA:** `customers` NÃO tem coluna `is_active`. O schema doc anterior estava incorreto.

### suppliers
Fornecedores.

| Coluna | Tipo | Default | Descrição |
|--------|------|---------|-----------|
| id | UUID PK | | PK |
| organization_id | UUID NOT NULL | | FK → organizations |
| name | TEXT NOT NULL | | Nome / Razão Social |
| cnpj | TEXT | | CNPJ |
| phone | TEXT | | Telefone |
| email | TEXT | | Email |
| address | TEXT | | Endereço |
| contact_person | TEXT | | Pessoa de contato |
| notes | TEXT | | Observações |
| is_active | BOOLEAN | `true` | Fornecedor ativo? |
| created_at | TIMESTAMPTZ | `now()` | |
| updated_at | TIMESTAMPTZ | `now()` | |

### sales
Vendas realizadas.

| Coluna | Tipo | Default | Descrição |
|--------|------|---------|-----------|
| id | UUID PK | | PK |
| organization_id | UUID NOT NULL | | FK → organizations |
| store_branch_id | UUID | | FK → store_branches |
| code | TEXT | | Código da venda (ex: VEN-10492) |
| customer_id | UUID | | FK → customers |
| customer_name | TEXT | | Nome do cliente |
| user_id | UUID | | FK → system_users |
| operator_name | TEXT | | Nome do operador |
| status | TEXT | `'completed'` | 'completed', 'cancelled', 'pending' |
| total | NUMERIC(12,2) | | Valor total |
| discount | NUMERIC(12,2) | | Desconto |
| payment_method | TEXT | | Método único (legacy) |
| payments_json | JSONB | `'[]'` | Array de pagamentos [{method, amount}] |
| notes | TEXT | | Observações |
| created_at | TIMESTAMPTZ | `now()` | |
| updated_at | TIMESTAMPTZ | `now()` | |

### sale_items
Itens de cada venda.

| Coluna | Tipo | Default | Descrição |
|--------|------|---------|-----------|
| id | UUID PK | | PK |
| sale_id | UUID NOT NULL | | FK → sales (CASCADE) |
| product_id | UUID | | FK → products (RESTRICT) |
| product_name | TEXT | | Nome do produto |
| quantity | INTEGER | | Quantidade |
| unit_price | NUMERIC(12,2) | | Preço unitário |
| total_price | NUMERIC(12,2) | | Total do item |
| store_branch_id | UUID | | FK → store_branches |
| created_at | TIMESTAMPTZ | `now()` | |

### cash_sessions
Sessões de caixa.

| Coluna | Tipo | Default | Descrição |
|--------|------|---------|-----------|
| id | UUID PK | | PK |
| organization_id | UUID NOT NULL | | FK → organizations |
| store_branch_id | UUID | | FK → store_branches |
| user_id | UUID | | FK → system_users |
| status | TEXT | | 'open', 'closed' |
| opening_balance | NUMERIC(12,2) | | Saldo inicial |
| closing_balance | NUMERIC(12,2) | | Saldo final |
| expected_balance | NUMERIC(12,2) | | Saldo esperado |
| total_sales_cash | NUMERIC(12,2) | | Total vendas dinheiro |
| total_sales_pix | NUMERIC(12,2) | | Total vendas PIX |
| total_sales_card | NUMERIC(12,2) | | Total vendas cartão |
| total_sales_credit_account | NUMERIC(12,2) | | Total vendas fiado |
| suprimentos | NUMERIC(12,2) | | Suprimentos (add) |
| sangrias | NUMERIC(12,2) | | Sangrias (remove) |
| opened_at | TIMESTAMPTZ | | Abertura |
| closed_at | TIMESTAMPTZ | | Fechamento |
| created_at | TIMESTAMPTZ | `now()` | |
| updated_at | TIMESTAMPTZ | `now()` | |

### stock_movements
Movimentações de estoque (log).

| Coluna | Tipo | Default | Descrição |
|--------|------|---------|-----------|
| id | UUID PK | | PK |
| organization_id | UUID NOT NULL | | FK → organizations |
| product_id | UUID | | FK → products |
| product_name | TEXT | | Nome do produto |
| type | TEXT | | 'in', 'out', 'adjustment', 'loss' |
| quantity | INTEGER | | Quantidade |
| previous_stock | INTEGER | | Estoque anterior |
| new_stock | INTEGER | | Estoque novo |
| reason | TEXT | | Motivo |
| operator_name | TEXT | | Operador |
| created_at | TIMESTAMPTZ | `now()` | |

### financial_transactions
Contas a pagar / receber.

| Coluna | Tipo | Default | Descrição |
|--------|------|---------|-----------|
| id | UUID PK | | PK |
| organization_id | UUID NOT NULL | | FK → organizations |
| store_branch_id | UUID | | FK → store_branches |
| description | TEXT | | Descrição / Título |
| amount | NUMERIC(12,2) | | Valor |
| type | TEXT | | 'income' ou 'expense' |
| category | TEXT | | Categoria |
| status | TEXT | | 'pending', 'paid', 'overdue', 'cancelled' |
| due_date | DATE | | Data de vencimento |
| payment_date | DATE | | Data de pagamento |
| notes | TEXT | | Observações |
| is_recurring | BOOLEAN | `false` | Conta recorrente? |
| is_installment | BOOLEAN | `false` | Conta parcelada? |
| recurrence_type | TEXT | | 'monthly', 'weekly', 'biweekly' |
| recurrence_count | INTEGER | | Nº de parcelas/repetições |
| recurrences_json | JSONB | `'[]'` | Ocorrências recorrentes |
| installments_json | JSONB | `'[]'` | Parcelas |
| created_at | TIMESTAMPTZ | `now()` | |
| updated_at | TIMESTAMPTZ | `now()` | |

### system_users
Colaboradores (não confundir com auth.users).

| Coluna | Tipo | Default | Descrição |
|--------|------|---------|-----------|
| id | UUID PK | | PK |
| organization_id | UUID NOT NULL | | FK → organizations |
| name | TEXT NOT NULL | | Nome |
| email | TEXT | | Email |
| role | TEXT | | 'admin', 'collaborator' |
| pin | TEXT | | PIN de acesso |
| is_active | BOOLEAN | `true` | Ativo? |
| store_branch_id | UUID | | Filial |
| commission_rate | NUMERIC(5,2) | `0` | Taxa de comissão (%) |
| created_at | TIMESTAMPTZ | `now()` | |
| updated_at | TIMESTAMPTZ | `now()` | |

### system_settings
Configurações do sistema (key-value por filial).

| Coluna | Tipo | Default | Descrição |
|--------|------|---------|-----------|
| id | UUID PK | | PK |
| organization_id | UUID NOT NULL | | FK → organizations |
| store_branch_id | UUID | | FK → store_branches |
| key | TEXT | | Chave da config |
| value | JSONB | | Valor (JSON) |
| version | BIGINT | `0` | Versão (concorrência otimista) |
| created_at | TIMESTAMPTZ | `now()` | |
| updated_at | TIMESTAMPTZ | `now()` | |

---

## Tabelas de Delivery

### delivery_settings
Configurações de delivery por filial.

| Coluna | Tipo | Default | Descrição |
|--------|------|---------|-----------|
| id | UUID PK | | PK |
| organization_id | UUID NOT NULL | | FK → organizations |
| store_branch_id | UUID NOT NULL UNIQUE | | FK → store_branches |
| is_active | BOOLEAN | `true` | Delivery ativo? |
| delivery_enabled | BOOLEAN | `true` | Delivery habilitado? |
| pickup_enabled | BOOLEAN | `true` | Retirada habilitada? |
| operating_hours | JSONB | `'{}'` | Horários de funcionamento |
| fee_calculation_type | TEXT | `'free'` | 'fixed', 'neighborhood', 'distance', 'free' |
| fixed_fee | DECIMAL(10,2) | `0` | Taxa fixa |
| minimum_order_value | DECIMAL(10,2) | `0` | Pedido mínimo |
| estimated_delivery_time | INTEGER | `45` | Tempo estimado (min) |
| max_delivery_distance_km | INTEGER | `15` | Distância máxima (km) |
| branch_latitude | DECIMAL(10,8) | | Latitude |
| branch_longitude | DECIMAL(11,8) | | Longitude |
| whatsapp_phone | TEXT | | WhatsApp |
| full_address | TEXT | | Endereço completo |
| created_at | TIMESTAMPTZ | `now()` | |
| updated_at | TIMESTAMPTZ | `now()` | |

### delivery_neighborhoods
Bairros com taxa de entrega.

| Coluna | Tipo | Default | Descrição |
|--------|------|---------|-----------|
| id | UUID PK | | PK |
| organization_id | UUID NOT NULL | | FK → organizations |
| store_branch_id | UUID NOT NULL | | FK → store_branches |
| neighborhood | TEXT NOT NULL | | Bairro |
| fee | DECIMAL(10,2) | `0` | Taxa |
| estimated_time_minutes | INTEGER | `45` | Tempo estimado |
| is_active | BOOLEAN | `true` | Ativo? |
| created_at | TIMESTAMPTZ | `now()` | |
| updated_at | TIMESTAMPTZ | `now()` | |
| UNIQUE(store_branch_id, neighborhood) | | | |

### delivery_distance_rates
Faixas de distância com taxa.

| Coluna | Tipo | Default | Descrição |
|--------|------|---------|-----------|
| id | UUID PK | | PK |
| organization_id | UUID NOT NULL | | FK → organizations |
| store_branch_id | UUID NOT NULL | | FK → store_branches |
| min_km | DECIMAL(6,2) | `0` | Distância mínima |
| max_km | DECIMAL(6,2) | NOT NULL | Distância máxima |
| fee | DECIMAL(10,2) | `0` | Taxa |
| estimated_time_minutes | INTEGER | `45` | Tempo estimado |
| is_active | BOOLEAN | `true` | Ativo? |
| created_at | TIMESTAMPTZ | `now()` | |
| updated_at | TIMESTAMPTZ | `now()` | |
| UNIQUE(store_branch_id, min_km, max_km) | | | |

### delivery_orders
Pedidos de delivery.

| Coluna | Tipo | Default | Descrição |
|--------|------|---------|-----------|
| id | UUID PK | | PK |
| organization_id | UUID NOT NULL | | FK → organizations |
| store_branch_id | UUID NOT NULL | | FK → store_branches |
| customer_id | UUID | | FK → customers |
| order_number | SERIAL | | Número do pedido |
| order_type | TEXT NOT NULL | | 'delivery', 'pickup' |
| status | TEXT NOT NULL | `'pending'` | 'pending'...'cancelled' |
| items_json | JSONB NOT NULL | | Itens do pedido |
| subtotal | DECIMAL(10,2) | `0` | Subtotal |
| delivery_fee | DECIMAL(10,2) | `0` | Taxa de entrega |
| discount | DECIMAL(10,2) | `0` | Desconto |
| total | DECIMAL(10,2) | `0` | Total |
| payment_method | TEXT | | Forma de pagamento |
| change_amount | DECIMAL(10,2) | | Troco |
| delivery_address | JSONB | | Endereço de entrega |
| customer_name | TEXT NOT NULL | | Nome do cliente |
| customer_whatsapp | TEXT | | WhatsApp |
| customer_email | TEXT | | Email |
| notes | TEXT | | Observações |
| estimated_delivery_time | INTEGER | | Tempo estimado |
| confirmed_at | TIMESTAMPTZ | | Confirmado em |
| preparing_at | TIMESTAMPTZ | | Preparando em |
| ready_at | TIMESTAMPTZ | | Pronto em |
| out_for_delivery_at | TIMESTAMPTZ | | Saiu para entrega em |
| delivered_at | TIMESTAMPTZ | | Entregue em |
| cancelled_at | TIMESTAMPTZ | | Cancelado em |
| cancelled_reason | TEXT | | Motivo do cancelamento |
| whatsapp_sent | BOOLEAN | `false` | WhatsApp enviado? |
| whatsapp_sent_at | TIMESTAMPTZ | | Quando enviado |
| delivered_by | UUID | | Quem entregou |
| created_at | TIMESTAMPTZ | `now()` | |
| updated_at | TIMESTAMPTZ | `now()` | |

---

## Tabelas de TV / Impressora

### footer_messages
Mensagens do rodapé da vitrine TV.

| Coluna | Tipo | Default | Descrição |
|--------|------|---------|-----------|
| id | UUID PK | | PK |
| organization_id | UUID NOT NULL | | FK → organizations |
| store_branch_id | UUID NOT NULL | | FK → store_branches |
| message | TEXT NOT NULL | | Mensagem |
| sort_order | INTEGER | `0` | Ordem |
| active | BOOLEAN | `TRUE` | Ativa? |
| version | INTEGER | `0` | Versão |
| created_at | TIMESTAMPTZ | `NOW()` | |
| updated_at | TIMESTAMPTZ | `NOW()` | |

### media_devices
Dispositivos de TV/vitrine pareados.

| Coluna | Tipo | Default | Descrição |
|--------|------|---------|-----------|
| id | UUID PK | | PK |
| organization_id | UUID NOT NULL | | FK → organizations |
| store_branch_id | UUID NOT NULL | | FK → store_branches |
| name | TEXT NOT NULL | | Nome do dispositivo |
| device_type | TEXT NOT NULL | `'tv'` | 'tv', 'vitrine' |
| address | TEXT | | Endereço |
| pairing_code | TEXT NOT NULL | | Código de pareamento |
| is_active | BOOLEAN | `TRUE` | Ativo? |
| last_seen_at | TIMESTAMPTZ | | Último heartbeat |
| version | INTEGER | `0` | Versão |
| created_at | TIMESTAMPTZ | `NOW()` | |
| updated_at | TIMESTAMPTZ | `NOW()` | |

### printers
Impressoras configuradas.

| Coluna | Tipo | Default | Descrição |
|--------|------|---------|-----------|
| id | UUID PK | | PK |
| organization_id | UUID NOT NULL | | FK → organizations |
| store_branch_id | UUID NOT NULL | | FK → store_branches |
| name | TEXT NOT NULL | | Nome |
| model | TEXT | | Modelo |
| transport | TEXT NOT NULL | `'network'` | 'webusb','serial','network','os' |
| ip_address | TEXT | | IP |
| port | INTEGER | | Porta |
| is_default | BOOLEAN | `FALSE` | Padrão? (UNIQUE per branch) |
| role | TEXT | `'caixa'` | Roteamento: caixa/bar/cozinha/outro |
| category_id | UUID | | Categoria específica (opcional) p/ roteamento |
| status | TEXT | `'offline'` | Status |
| last_seen_at | TIMESTAMPTZ | | Último heartbeat |
| version | INTEGER | `0` | Versão |
| created_at | TIMESTAMPTZ | `NOW()` | |
| updated_at | TIMESTAMPTZ | `NOW()` | |

---

## Outras Tabelas

### module_visibility
Visibilidade de módulos por filial.

| Coluna | Tipo | Default | Descrição |
|--------|------|---------|-----------|
| id | UUID PK | | PK |
| organization_id | UUID NOT NULL | | FK → organizations |
| store_branch_id | UUID NOT NULL UNIQUE | | FK → store_branches |
| module_pdv | BOOLEAN | `true` | PDV |
| module_inventory | BOOLEAN | `true` | Estoque |
| module_fiado | BOOLEAN | `false` | Fiados |
| module_crm | BOOLEAN | `false` | CRM |
| module_dashboard | BOOLEAN | `true` | Dashboard |
| module_finance | BOOLEAN | `false` | Financeiro |
| module_kds | BOOLEAN | `false` | KDS/Cozinha |
| module_delivery | BOOLEAN | `false` | Delivery |
| module_cardapio_digital | BOOLEAN | `false` | Cardápio Digital |
| module_cardapio_preview | BOOLEAN | `false` | Preview Cardápio |
| module_tv_showcase | BOOLEAN | `false` | TV Showcase |
| module_tv_connect | BOOLEAN | `false` | TV Connect |
| created_at | TIMESTAMPTZ | `now()` | |
| updated_at | TIMESTAMPTZ | `now()` | |

### filial_backups
Backups de filial.

| Coluna | Tipo | Default | Descrição |
|--------|------|---------|-----------|
| id | UUID PK | | PK |
| organization_id | UUID NOT NULL | | FK → organizations |
| store_branch_id | UUID NOT NULL | | FK → store_branches |
| backup_name | TEXT NOT NULL | | Nome do backup |
| backup_data | JSONB NOT NULL | | Dados completos |
| data_size_bytes | INTEGER | `0` | Tamanho em bytes |
| record_count | INTEGER | `0` | Nº de registros |
| created_by | UUID | | Admin criador |
| created_at | TIMESTAMPTZ | `now()` | |
| updated_at | TIMESTAMPTZ | `now()` | |
| is_automatic | BOOLEAN | `false` | Backup automático? |
| restored_at | TIMESTAMPTZ | | Quando restaurado |
| restored_by | UUID | | Quem restaurou |

### ai_insights
Insights diários de IA.

| Coluna | Tipo | Default | Descrição |
|--------|------|---------|-----------|
| id | TEXT PK | | ex: "daily-2026-07-26" |
| insights | JSONB NOT NULL | `'[]'` | Insights |
| generated_at | TIMESTAMPTZ NOT NULL | `NOW()` | Quando gerado |
| today_revenue | NUMERIC(10,2) | `0` | Receita do dia |
| total_sales | INTEGER | `0` | Total de vendas |
| ticket_medio | NUMERIC(10,2) | `0` | Ticket médio |
| created_at | TIMESTAMPTZ NOT NULL | `NOW()` | |

### sync_queue
Fila de sincronização offline → online.

| Coluna | Tipo | Default | Descrição |
|--------|------|---------|-----------|
| id | UUID PK | | PK |
| organization_id | UUID | | FK → organizations |
| table_name | TEXT | | Tabela alvo |
| record_id | TEXT | | ID do registro |
| operation | TEXT | | 'insert', 'update', 'delete' |
| payload | JSONB | | Dados |
| status | TEXT | `'pending'` | Status |
| created_at | TIMESTAMPTZ | `now()` | |
| processed_at | TIMESTAMPTZ | | Quando processado |

### movimentacoes_falhas
Dead Letter Queue — registros que falharam na sincronização.

| Coluna | Tipo | Default | Descrição |
|--------|------|---------|-----------|
| id | UUID PK | | PK |
| organization_id | UUID | | FK → organizations |
| operation_type | TEXT | | Tipo de operação |
| table_name | TEXT | | Tabela alvo |
| record_id | TEXT | | ID do registro |
| payload | JSONB | | Dados |
| error_message | TEXT | | Mensagem de erro |
| error_code | TEXT | | Código de erro |
| error_status | INTEGER | | Status HTTP |
| stack_trace | TEXT | | Stack trace |
| source | TEXT | `'sync_queue'` | Origem |
| browser_id | TEXT | | ID do browser |
| user_email | TEXT | | Email do usuário |
| retry_count | INTEGER | `0` | Tentativas |
| max_retries | INTEGER | `3` | Máximo de tentativas |
| next_retry_at | TIMESTAMPTZ | | Próxima tentativa |
| status | TEXT | `'pending'` | Status |
| created_at | TIMESTAMPTZ | `now()` | |
| last_retry_at | TIMESTAMPTZ | | Última tentativa |
| resolved_at | TIMESTAMPTZ | | Quando resolvido |
| resolved_by | TEXT | | Quem resolveu |
| resolution_notes | TEXT | | Notas |

### stock_change_log
Log de alterações de estoque (trigger).

| Coluna | Tipo | Default | Descrição |
|--------|------|---------|-----------|
| id | UUID PK | | PK |
| product_id | UUID | | FK → products (CASCADE) |
| field_name | TEXT | | Campo alterado |
| old_value | TEXT | | Valor antigo |
| new_value | TEXT | | Valor novo |
| changed_at | TIMESTAMPTZ | `now()` | Quando |
| changed_by | TEXT | | Quem |

### scanned_boletos
Boletos escaneados.

| Coluna | Tipo | Default | Descrição |
|--------|------|---------|-----------|
| id | UUID PK | | PK |
| linha_digitavel | TEXT | | Linha digitável |
| barcode | TEXT | | Código de barras |
| amount | NUMERIC | | Valor |
| due_date | DATE | | Vencimento |
| payer | TEXT | | Pagador |
| scan_date | TEXT | | Data do scan |
| financial_account_id | UUID | | FK → financial_transactions |
| status | TEXT | | Status |
| store_branch_id | UUID | | Filial |
| organization_id | UUID | | Organização |

### credit_payments
Pagamentos de fiado (dívidas).

| Coluna | Tipo | Default | Descrição |
|--------|------|---------|-----------|
| id | UUID PK | | PK |
| sale_id | UUID | | FK → sales |
| customer_id | UUID | | FK → customers |
| customer_name | TEXT | | Nome do cliente |
| amount | NUMERIC | | Valor pago |
| date | TEXT | | Data ISO |
| payment_method | TEXT | | Forma de pagamento |
| store_branch_id | UUID | | Filial |
| organization_id | UUID | | Organização |

### nf_records
Notas fiscais importadas.

| Coluna | Tipo | Default | Descrição |
|--------|------|---------|-----------|
| id | UUID PK | | PK |
| scan_date | TEXT | | Data do scan |
| supplier_name | TEXT | | Nome do fornecedor |
| items | JSONB | | Itens [{productName, quantity, unitPrice}] |
| total_value | NUMERIC | | Valor total |
| note | TEXT | | Observação |
| store_branch_id | UUID | | Filial |
| organization_id | UUID | | Organização |

---

## Tabelas de Cardápio Digital / Mesas

### tables
Mesas do estabelecimento.

| Coluna | Tipo | Default | Descrição |
|--------|------|---------|-----------|
| id | UUID PK | | PK |
| name | TEXT | | Nome da mesa |
| number | INTEGER | | Número |
| qr_token | TEXT | | Token para QR code |
| status | TEXT | | 'active', 'inactive' |
| store_branch_id | UUID NOT NULL | | FK → store_branches |
| organization_id | UUID NOT NULL | | FK → organizations |
| created_at | TIMESTAMPTZ | `now()` | |
| updated_at | TIMESTAMPTZ | `now()` | |

### customer_sessions
Sessões de cliente por mesa.

| Coluna | Tipo | Default | Descrição |
|--------|------|---------|-----------|
| id | UUID PK | | PK |
| table_id | UUID | | FK → tables |
| session_token | TEXT | | Token da sessão |
| status | TEXT | | 'active', 'completed', 'cancelled' |
| opened_at | TIMESTAMPTZ | | Abertura |
| closed_at | TIMESTAMPTZ | | Fechamento |
| device_fingerprint | TEXT | | Fingerprint do device |
| customer_name | TEXT | | Nome do cliente |
| store_branch_id | UUID NOT NULL | | FK → store_branches |
| organization_id | UUID NOT NULL | | FK → organizations |
| created_at | TIMESTAMPTZ | `now()` | |
| updated_at | TIMESTAMPTZ | `now()` | |

### digital_menu_config
Configuração do cardápio digital por filial.

| Coluna | Tipo | Default | Descrição |
|--------|------|---------|-----------|
| id | UUID PK | | PK |
| title | TEXT | | Título do cardápio |
| subtitle | TEXT | | Subtítulo |
| logo_url | TEXT | | URL do logo |
| banner_url | TEXT | | URL do banner |
| layout_mode | TEXT | | 'grid', 'list' |
| show_prices | BOOLEAN | | Mostrar preços? |
| store_branch_id | UUID NOT NULL | | FK → store_branches |
| organization_id | UUID NOT NULL | | FK → organizations |
| updated_at | TIMESTAMPTZ | `now()` | |

### branch_themes
Paleta de cores por filial.

| Coluna | Tipo | Default | Descrição |
|--------|------|---------|-----------|
| id | UUID PK | | PK |
| primary_color | TEXT | | Cor primária |
| secondary_color | TEXT | | Cor secundária |
| accent_color | TEXT | | Cor de destaque |
| bg_color | TEXT | | Cor de fundo |
| logo_url | TEXT | | URL do logo |
| favicon_url | TEXT | | URL do favicon |
| store_branch_id | UUID NOT NULL | | FK → store_branches |
| organization_id | UUID NOT NULL | | FK → organizations |
| updated_at | TIMESTAMPTZ | `now()` | |

### api_keys
Chaves de API para integrações externas.

| Coluna | Tipo | Default | Descrição |
|--------|------|---------|-----------|
| id | UUID PK | | PK |
| name | TEXT | | Nome da chave |
| key_hash | TEXT | | Hash da chave |
| key_prefix | TEXT | | Primeiros 8 chars |
| permissions | TEXT[] | | Permissões |
| is_active | BOOLEAN | | Ativa? |
| last_used_at | TIMESTAMPTZ | | Último uso |
| expires_at | TIMESTAMPTZ | | Expiração |
| created_at | TIMESTAMPTZ | `now()` | |
| updated_at | TIMESTAMPTZ | `now()` | |
| store_branch_id | UUID NOT NULL | | FK → store_branches |
| organization_id | UUID NOT NULL | | FK → organizations |

### delivery_worker_earnings
Ganhos do colaborador do delivery.

| Coluna | Tipo | Default | Descrição |
|--------|------|---------|-----------|
| id | UUID PK | | PK |
| organization_id | UUID NOT NULL | | FK → organizations |
| store_branch_id | UUID NOT NULL | | FK → store_branches |
| worker_id | UUID | | FK → system_users |
| delivery_order_id | UUID | | FK → delivery_orders |
| delivery_fee | DECIMAL(10,2) | | Taxa de entrega |
| worker_amount | DECIMAL(10,2) | | Valor do colaborador |
| company_amount | DECIMAL(10,2) | | Valor da empresa |
| pay_type | TEXT | | 'salary', 'daily' |
| paid | BOOLEAN | `false` | Pago? |
| paid_at | TIMESTAMPTZ | | Quando pago |
| created_at | TIMESTAMPTZ | `now()` | |

---

## Tabelas auxiliares (referenciadas em RLS mas sem migration dedicada)

- `user_permissions` — Permissões por usuário (user_id scoped)
- `pix_config` — Configurações PIX (org-scoped)

---

## Views

### vw_report_sale_items
View para relatórios (join de sales + sale_items + products + system_users).

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| sale_id | UUID | ID da venda |
| organization_id | UUID | Org |
| store_branch_id | UUID | Filial |
| sale_date | TIMESTAMPTZ | Data da venda |
| sale_status | TEXT | Status |
| payment_method | TEXT | Método de pagamento |
| operator_id | UUID | ID do operador |
| operator_name | TEXT | Nome do operador |
| customer_id | UUID | ID do cliente |
| customer_name | TEXT | Nome do cliente |
| sale_total | NUMERIC | Total da venda |
| item_id | UUID | ID do item |
| product_id | UUID | ID do produto |
| product_name | TEXT | Nome do produto |
| quantity | INTEGER | Quantidade |
| unit_price | NUMERIC | Preço unitário |
| item_total | NUMERIC | Total do item |
| item_discount | NUMERIC | Desconto do item |
| category_name | TEXT | Categoria |
| operator_commission_rate | NUMERIC | Taxa de comissão |

`security_invoker = true` (respects caller's RLS)

---

## RPCs Principais

| RPC | Descrição |
|-----|-----------|
| `ajustar_estoque(...)` | Ajuste manual de estoque |
| `process_sale_transaction(...)` | Processar venda e descontar estoque (atomic) |
| `check_stock_consistency(...)` | Verificar consistência estoque vs movimentações |
| `fn_insserir_dlq(...)` | Inserir na Dead Letter Queue |
| `admin_delete_organization(p_org_id)` | Deletar organização (cascade) |
| `admin_fetch_organizations()` | Listar orgs (superadmin) |
| `heartbeat_media_device(p_device_id)` | Heartbeat TV (throttle 15s) |
| `create_filial_backup(...)` | Criar backup de filial |

---

## Realtime Publication

Tabelas na publicação `supabase_realtime`:
- products, categories, customers, suppliers
- sales, sale_items
- cash_sessions, stock_movements
- financial_transactions
- delivery_orders, delivery_settings
- system_users, system_settings
- footer_messages, media_devices, printers
- module_visibility, branch_themes
- scanned_boletos, credit_payments
- tables, customer_sessions
- sync_queue, movimentacoes_falhas

Todas com `REPLICA IDENTITY FULL` para payload completo de UPDATE/DELETE.

---

## Migrações Recentes (últimas 10)

| Data | Arquivo | Descrição |
|------|---------|-----------|
| 2026-08-11 | `20260811_wholesale_options.sql` | Opções de atacado (JSONB) em products |
| 2026-08-12 | `20260812_backup_restore.sql` | Tabela filial_backups + RPC |
| 2026-08-12 | `20260812_fix_realtime_publication.sql` | Fix publication realtime |
| 2026-08-13 | `20260813_admin_delete_organization.sql` | RPC delete org cascade |
| 2026-08-14 | `20260814_organization_active_flag.sql` | Coluna active em organizations |
| 2026-08-15 | `20260815_frentes_tv_impressora.sql` | footer_messages, media_devices, printers |
| 2026-08-15 | `20260815_*` | View vw_report_sale_items, commission_rate |

---

## Pendências Conhecidas

1. **`suppliers`** — Colunas `company_name`, `trade_name`, `contact_name` mapeadas como `name`, `contact_person` no banco
2. **Sistema de produtos compostos** — ✅ Migration EXECUTADA e CONFIRMADA (tabela `product_recipes` + coluna `is_composite`)
   - **Pendente frontend:** UI de edição de receitas no InventoryView (modal para adicionar/remover ingredientes)
   - **Pendente frontend:** Lógica de desconto automático no PDV ao vender produto composto
   - **Pendente frontend:** Sub-itens no recibo térmico para produtos compostos
