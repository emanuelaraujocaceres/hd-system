# HD-System: Supabase Schema & Architecture Reference

> **Este arquivo é referência duradoura para futuros agentes.**
> Atualizado em: 2026-08-16 (Auditoria de isolamento por filial)

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

| Tabela | Descrição | Colunas-chave |
|--------|-----------|---------------|
| `products` | Produtos | `id, name, price, stock_quantity, organization_id, store_branch_id` |
| `categories` | Categorias | `id, name, color, organization_id, store_branch_id` |
| `sales` | Vendas | `id, total, payment_method, organization_id, store_branch_id` |
| `sale_items` | Itens da venda | `id, sale_id, product_id, quantity, price` |
| `customer_sessions` | Comandas/Mesas | `id, table_number, status, organization_id, store_branch_id` |
| `customers` | Clientes | `id, name, phone, organization_id, store_branch_id` |
| `delivery_orders` | Pedidos delivery | `id, order_number, status, total, organization_id, store_branch_id` |
| `credit_payments` | Pagamentos fiado | `id, sale_id, amount, organization_id, store_branch_id` |
| `financial_accounts` | Contas financeiras | `id, title, amount, type, organization_id, store_branch_id` |
| `tables` | Mesas | `id, name, number, status, organization_id, store_branch_id` |
| `printers` | Impressoras | `id, name, role, organization_id, store_branch_id` |
| `api_keys` | Chaves API | `id, name, key_hash, organization_id, store_branch_id` |
| `footer_messages` | Mensagens rodapé TV | `id, text, organization_id, store_branch_id` |
| `media_devices` | TVs/vitrines pareadas | `id, name, pairing_code, organization_id, store_branch_id` |
| `nf_records` | Notas fiscais | `id, chave_acesso, organization_id, store_branch_id` |
| `scanned_boletos` | Boletos escaneados | `id, linha_digitavel, organization_id, store_branch_id` |
| `movements` | Movimentações estoque | `id, type, quantity, organization_id, store_branch_id` |
| `delivery_neighborhoods` | Bairros delivery | `id, name, fee, organization_id, store_branch_id` |
| `delivery_distance_rates` | Taxas distância | `id, km, fee, organization_id, store_branch_id` |
| `digital_menu_config` | Config cardápio digital | `id, title, layout_mode, organization_id, store_branch_id` |
| `branch_themes` | Tema por filial | `id, primary_color, organization_id, store_branch_id` |
| `module_visibility` | Visibilidade módulos | `id, module, enabled, organization_id, store_branch_id` |
| `product_lots` | Lotes de produto | `id, lot_number, quantity, organization_id, store_branch_id` |
| `stock_loss_log` | Log perdas estoque | `id, quantity, reason, organization_id, store_branch_id` |

---

## Policies RLS (Row-Level Security)

> **ATENÇÃO:** Este é o modelo esperado. Execute `INSPECTION_SQL.sql` para verificar o estado real.

### Modelo de Policies

```sql
-- Superadmin vê tudo
CREATE POLICY "superadmin_all" ON <table>
  FOR ALL
  USING (is_superadmin());

-- Membros da org veem dados da sua organização
CREATE POLICY "org_isolation" ON <table>
  FOR ALL
  USING (organization_id = get_user_org_id());
```

### Funções Auxiliares Esperadas

| Função | Retorno | Descrição |
|--------|---------|-----------|
| `is_superadmin()` | `boolean` | Retorna true se auth.uid() é o superadmin |
| `get_user_org_id()` | `uuid` | Retorna organization_id do usuário logado |
| `get_user_branch_id()` | `uuid` | Retorna store_branch_id do usuário logado |
| `get_user_role()` | `text` | Retorna 'admin' ou 'collaborator' |

---

## Publicações Realtime

### Publicação esperada: `supabase_realtime`

Todas as tabelas branch-scoped devem estar na publicação Realtime com `REPLICA IDENTITY FULL`:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE products;
ALTER PUBLICATION supabase_realtime ADD TABLE categories;
ALTER PUBLICATION supabase_realtime ADD TABLE sales;
-- ... (todas as tabelas branch-scoped)
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
