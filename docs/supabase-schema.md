# HD-System: Supabase Schema & Architecture Reference

> **Este arquivo é referência duradoura para futuros agentes.**
> Atualizado em: 2026-08-16 (Auditoria completa RLS + frontend + correções de isolamento)

---

## Visão Geral da Arquitetura

O HD-System é um sistema **multi-tenant, multi-branch** com:

- **Organizações** → cada organização é um tenant isolado
- **Filiais** → cada organização pode ter N filiais
- **Usuários** → vinculados a uma organização + filial (admin ou colaborador)
- **Superadmin** → `emanuel@gmail.com` — acesso total a todas as orgs/filiais

### Camadas de Isolamento

| Camada | Mecanismo | Arquivo |
|--------|-----------|---------|
| **Server-side** | Supabase Realtime filters: `organization_id=eq.X,store_branch_id=eq.Y` | `syncService.ts:296-309` |
| **Client-side** | `handleRemoteChange` rejeita eventos cross-org/branch | `App.tsx:445-471` |
| **Handler-level** | `isRemoteFromCurrentBranch()` em cada `*FromRemote()` | `storageService.ts:285-301` |
| **DELETE-level** | `isLocalItemInCurrentBranch()` antes de cada `remove*FromRemote()` | `storageService.ts:310-330` |
| **Getter-level** | `filterByOrg()` + `filterBySelectedBranch()` em cada getter | `storageService.ts:253-278` |
| **Storage-key** | Chaves particionadas por org: `hd_system_products_{orgId}` | `storageService.ts:2774-2779` |

---

## Tabelas Principais

### Tabelas Org-Scoped (sem branch isolation)

| Tabela | Descrição | Colunas-chave |
|--------|-----------|---------------|
| `organizations` | Organizações (tenants) | `id, name, active, created_at` |
| `store_branches` | Filiais da organização | `id, name, code, organization_id, is_headquarters, city, state, active` |
| `system_users` | Usuários do sistema | `id, name, email, role, organization_id, store_branch_id, permissions, active` |

### Tabelas Branch-Scoped (isoladas por filial)

| Tabela | Descrição | Colunas-chave | Foreign Keys |
|--------|-----------|---------------|--------------|
| `products` | Produtos | `id, name, price, stock_quantity, organization_id, store_branch_id` | — |
| `categories` | Categorias | `id, name, color, organization_id, store_branch_id` | — |
| `sales` | Vendas | `id, total, payment_method, organization_id, store_branch_id, table_id, customer_session_id` | `table_id → tables.id`, `customer_session_id → customer_sessions.id` |
| `sale_items` | Itens da venda | `id, sale_id, product_id, quantity, price` | `sale_id → sales.id` |
| `customer_sessions` | Comandas/Mesas | `id, table_id, session_token, status, opened_at, closed_at, customer_name, organization_id, store_branch_id` | `table_id → tables.id` |
| `customers` | Clientes | `id, name, phone, organization_id, store_branch_id` | — |
| `delivery_orders` | Pedidos delivery | `id, order_number, status, total, organization_id, store_branch_id` | — |
| `credit_payments` | Pagamentos fiado | `id, sale_id, amount, organization_id, store_branch_id` | `sale_id → sales.id` |
| `financial_transactions` | Transações financeiras | `id, description, amount, type, organization_id, store_branch_id` | — |
| `tables` | Mesas | `id, name, number, qr_token, status, organization_id, store_branch_id` | — |
| `printers` | Impressoras | `id, name, role, category, transport, organization_id, store_branch_id` | — |
| `api_keys` | Chaves API | `id, name, key_hash, organization_id, store_branch_id` | — |
| `footer_messages` | Mensagens rodapé TV | `id, text, organization_id, store_branch_id` | — |
| `media_devices` | TVs/vitrines pareadas | `id, name, pairing_code, organization_id, store_branch_id` | — |
| `nf_records` | Notas fiscais | `id, chave_acesso, organization_id, store_branch_id` | — |
| `scanned_boletos` | Boletos escaneados | `id, linha_digitavel, organization_id, store_branch_id` | — |
| `movements` | Movimentações estoque | `id, type, quantity, organization_id, store_branch_id` | — |
| `delivery_neighborhoods` | Bairros delivery | `id, name, fee, organization_id, store_branch_id` | — |
| `delivery_distance_rates` | Taxas distância | `id, km, fee, organization_id, store_branch_id` | — |
| `digital_menu_config` | Config cardápio digital | `id, title, layout_mode, organization_id, store_branch_id` | — |
| `branch_themes` | Tema por filial | `id, primary_color, organization_id, store_branch_id` | — |
| `module_visibility` | Visibilidade módulos | `id, module_pdv, module_inventory, organization_id, store_branch_id` | — |
| `product_lots` | Lotes de produto | `id, lot_number, quantity, organization_id, store_branch_id` | — |
| `stock_loss_log` | Log perdas estoque | `id, quantity, reason, organization_id, store_branch_id` | — |

> ⚠️ **Constraints importantes:**
> - `customer_sessions`: constraint `one_active_session_per_table` — apenas 1 session `status='active'` por `table_id`
> - `tables`: constraint única em `(LOWER(name), store_branch_id)` — previne mesas duplicadas por nome+filial
> - `customer_sessions.table_id` → `tables.id` — FK com ON DELETE RESTRICT (não pode deletar mesa com sessions)
> - `sales.table_id` → `tables.id`, `sales.customer_session_id` → `customer_sessions.id`

---

## Policies RLS (Row-Level Security)

### ⚠️ Achados da Inspeção SQL (2026-08-16)

**Problemas encontrados:**

1. **product_lots** — Policy "Allow read for authenticated" com `USING (true)` → **VULNERABILIDADE CRÍTICA** — qualquer usuário autenticado lê todos os product_lots de todas as orgs
2. **INSERT policies incompletas** — Muitas tabelas têm INSERT policy que verifica apenas `organization_id`, sem `store_branch_id` → permite inserts cross-branch dentro da mesma org
3. **Muitas tabelas SEM policies** — products, categories, customers, sales, etc. não tinham RLS habilitado ou policies definidas

**Correções aplicadas:**

1. **RLS_FIXES.sql** — Script completo com:
   - DROP da policy permissiva em `product_lots`
   - Habilitar RLS em todas as 31 tabelas
   - Policies para 27 tabelas branch-scoped (superadmin + org+branch)
   - Policies para 4 tabelas org-scoped (organizations, store_branches, system_users, system_settings)
   - Policies especiais para system_users (admin vê org, colaborador vê só a si)
   - Índices em organization_id + store_branch_id para performance

2. **INSPECTION_SQL.sql** — Corrigido:
   - financial_accounts → financial_transactions (tabela real)
   - force_rls usando pg_class.relrowsecurity (mais confiável)
   - UUID comparisons: removido `= ''` (inválido para UUID, agora usa `IS NULL`)

### Modelo de Policies (RLS_FIXES.sql)

```sql
-- Branch-scoped: superadmin vê tudo, membros veem pela sua org+filial
CREATE POLICY "superadmin_all_<table>" ON <table>
  FOR ALL USING (is_superadmin());

CREATE POLICY "org_branch_select_<table>" ON <table>
  FOR SELECT USING (
    (organization_id = get_user_org_id())
    AND (store_branch_id = get_user_branch_id())
  );
-- + INSERT, UPDATE, DELETE com mesmo padrão

-- Org-scoped: sem store_branch_id
CREATE POLICY "org_select_<table>" ON <table>
  FOR SELECT USING (
    (organization_id = get_user_org_id())
    AND (NOT is_superadmin())
  );

-- system_users: admin vê todos da org, colaborador vê só a si
CREATE POLICY "admin_select_org_users" ON system_users
  FOR SELECT USING (
    (organization_id = get_user_org_id())
    AND (get_user_role() = 'admin')
  );
CREATE POLICY "collaborator_select_self" ON system_users
  FOR SELECT USING (
    (id = auth.uid())
    AND (get_user_role() = 'collaborator')
  );

-- sale_items: isolamento via junction com sales
CREATE POLICY "org_branch_select_sale_items" ON sale_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM sales s
      WHERE s.id = sale_items.sale_id
        AND s.organization_id = get_user_org_id()
        AND s.store_branch_id = get_user_branch_id()
    )
  );
```

### Funções Auxiliares Confirmadas

| Função | Retorno | Descrição |
|--------|---------|-----------|
| `is_superadmin()` | `boolean` | Retorna true se auth.uid() é superadmin (superadmin=true AND organization_id IS NULL) |
| `get_user_org_id()` | `uuid` | Retorna organization_id do usuário logado |
| `get_user_branch_id()` | `uuid` | Retorna store_branch_id do usuário logado |
| `get_user_role()` | `text` | Retorna 'admin' ou 'collaborator' |

---

## Publicações Realtime

### Publicação: `supabase_realtime` — 35 tabelas confirmadas

Todas as tabelas branch-scoped devem estar na publicação Realtime com `REPLICA IDENTITY FULL`:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE products;
ALTER PUBLICATION supabase_realtime ADD TABLE categories;
ALTER PUBLICATION supabase_realtime ADD TABLE sales;
-- ... (todas as tabelas branch-scoped)
```

### Tabelas na publicação (confirmado via inspeção SQL)

```
products, categories, customers, suppliers, sales, sale_items,
financial_transactions, cash_sessions, stock_movements,
store_branches, system_users, system_settings,
scanned_boletos, credit_payments, nf_records,
footer_messages, media_devices, printers,
tables, customer_sessions, digital_menu_config,
branch_themes, api_keys,
delivery_settings, delivery_neighborhoods, delivery_distance_rates, delivery_orders,
module_visibility, product_lots, stock_loss_log,
branches (pode ser alias de store_branches),
organizations
```

### Filtros de Canal Realtime (client-side)

O canal `hd-system-realtime` usa filtros por tabela:

```
Para cada tabela branch-scoped:
  filter: organization_id=eq.{orgId},store_branch_id=eq.{branchId}

Para system_settings:
  filter: organization_id=eq.{orgId}  (sem branch filter — org-scoped)

Para store_branches:
  filter: organization_id=eq.{orgId}  (sem branch filter — org-scoped)
```

---

## Decisões de Arquitetura

### 1. Superadmin bypass

O superadmin (`emanuel@gmail.com`) tem bypass em:
- `filterByOrg()` → retorna todos os itens quando `isSuperAdmin() && !getSuperadminViewingOrg()`
- `filterBySelectedBranch()` → retorna todos os itens quando `isSuperAdmin() && !getSuperadminViewingOrg()`
- `isRemoteFromCurrentBranch()` → retorna true quando `!getRawBranchId()`
- `isLocalItemInCurrentBranch()` → retorna true quando `!getRawBranchId()`
- `handleRemoteChange` → pula checks de org/branch quando superadmin

### 2. Colaboradores NÃO podem trocar de filial

**Decisão:** Colaboradores são vinculados a uma única filial (`user.storeBranchId`) e não podem trocar. Apenas visualizam a filial vinculada no Sidebar e Header.

**Razão:** Colaboradores operam em uma única filial. A troca de filial é exclusiva de administradores.

### 3. store_branches e system_settings: org-scoped no Realtime

Essas tabelas NÃO têm filtro de branch no canal Realtime (apenas `organization_id`). Isso é correto porque:
- `store_branches`: a lista de filiais precisa ser visível para o seletor de filial
- `system_settings`: configurações são compartilhadas entre filiais da mesma org

### 4. Chaves de localStorage particionadas por org

```
hd_system_products_{orgId}
hd_system_sales_{orgId}
hd_system_categories_{orgId}
```

**NÃO** particionadas por branch. O isolamento por branch é feito via `filterBySelectedBranch()` nos getters.

### 5. Hydratação e mergeBy

Quando troca de filial, `hydrateFromCloud()`:
1. Busca dados SOMENTE da nova filial (via `fetchRows` com branch filter)
2. Faz merge com dados locais usando `mergeBy()`
3. `mergeBy` filtra itens locais com `storeBranchId` diferente da filial atual
4. Sobrescreve localStorage com o resultado

### 6. Fila de sincronização offline/online

A fila (`syncQueueService.ts`) NÃO tem metadata de org/branch. A corretude depende de:
- O payload conter `organization_id` e `store_branch_id` corretos
- O RLS do Supabase bloquear escritas cross-org

---

## Triggers

| Trigger | Tabela | Evento | Descrição |
|---------|--------|--------|-----------|
| `update_updated_at` | Todas as tabelas | BEFORE UPDATE | Atualiza coluna `updated_at` |

---

## Notas para Futuros Agentes

1. **Sempre rodar `INSPECTION_SQL.sql`** antes de criar/modificar tabelas
2. **RLS é obrigatório** em todas as tabelas — nunca deixar sem policies
3. **Toda tabela nova** deve entrar na publicação `supabase_realtime`
4. **Toda tabela branch-scoped** deve ter `organization_id` e `store_branch_id`
5. **Helper functions** (`is_superadmin`, `get_user_org_id`, etc.) devem existir antes das policies
6. **Nunca usar `USING (true)`** em policies — isso quebra o isolamento
7. **Migrations devem ser idempotentes** — usar `DROP POLICY IF EXISTS` antes de `CREATE POLICY`
8. **INSERT policies devem incluir `store_branch_id`** no WITH CHECK — só verificar `organization_id` permite cross-branch inserts
9. **`sale_items` não tem org_id/branch_id** — usar subquery com junction via `sales` table
10. **Nome real da tabela financeira é `financial_transactions`** — NÃO `financial_accounts`

## Bugs Corrigidos (NUNCA Reintroduzir)

### BUG-RLS-001: product_lots policy permissiva
- **Causa:** Policy "Allow read for authenticated" com `USING (true)`
- **Impacto:** Qualquer usuário autenticado lia todos product_lots de todas as orgs
- **Fix:** `DROP POLICY "Allow read for authenticated" ON product_lots;`

### BUG-RLS-002: INSERT policies sem branch check
- **Causa:** Muitas tabelas tinham INSERT policy verificando só `organization_id`
- **Impacto:** Usuário podia inserir dados em qualquer filial dentro da sua org
- **Fix:** Adicionar `AND (store_branch_id = get_user_branch_id())` no WITH CHECK

### BUG-022: fetchRows duplicados em hydrateFromCloud
- **Causa:** 38 chamadas fetchRows mas só 29 variáveis no destructuring (linhas 1714-1735 duplicadas)
- **Impacto:** moduleVisibility, productLots, stockLossLogs recebiam dados errados
- **Fix:** Remover 9 linhas duplicadas (tables, customer_sessions, digital_menu_config, branch_themes, api_keys, delivery_*)

### BUG-024: 18 update*FromRemote handlers sem isRemoteFromCurrentBranch
- **Causa:** Handlers não tinham check de isolamento por filial
- **Impacto:** Dados de outra filial eram escritos no localStorage local via Realtime
- **Fix:** Adicionar `isRemoteFromCurrentBranch(row)` em todos os 18 handlers

### BUG-025: removeCaixaFromRemote e removeUserFromRemote sem branch check
- **Causa:** DELETE de outra filial fechava caixa local ou removia usuário
- **Fix:** Adicionar `isLocalItemInCurrentBranch()` check

### BUG-026: is_superadmin() SQL verificava organization_id IS NULL
- **Causa:** Superadmin com organization_id setado não tinha RLS bypass no banco
- **Fix:** `is_superadmin()` agora checa apenas `superadmin = true`

---

## Pontos de Atenção e Riscos Remanescentes

### 1. sale_items: junction policy funciona mas não é atômica
- A venda é inserida com `await syncSale()` (garante que existe antes dos itens)
- sale_items são fire-and-forget (não awaited) — se falhar, não há retry automático
- **Risco:** Baixo — FIFO queue preserva ordem no offline; online, a venda sempre existe antes

### 2. Collaborator vê apenas a si mesmo em system_users
- RLS `collaborator_select_self` restringe SELECT a `id = auth.uid()`
- Se admin der `settings: true` ao colaborador, a tabela de usuários mostra dados incompletos
- **Mitigation:** UI bloqueia colaborador de Settings por padrão (`perms.settings: false`)

### 3. create-branch/create-user APIs agora permitem admin
- Antes: apenas superadmin podia criar filial/usuário via Pages Function
- Agora: admin também pode (na própria organização)
- **Verificar:** Testar fluxo de criação de filial/usuário como admin

### 4. is_superadmin() — alinhamento frontend/backend
- Frontend: `profile?.superadmin === true` (sem check de organization_id)
- Backend SQL: `superadmin = true` (sem check de organization_id)
- **Status:** Alinhados após FIX 26

### 5. Tabelas auxiliares podem não ter RLS
- `RLS_FIXES.sql` Seção 6 usa dynamic SQL para aplicar RLS defensivo
- Tabelas como sync_queue, product_recipes, etc. podem não existir — o bloco é idempotente
- **Próximo:** Rodar `INSPECTION_SQL.sql` Bloco 21 para listar todas as tabelas reais
