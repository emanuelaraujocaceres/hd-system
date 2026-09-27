# BLOCO 10 — SINCRONIZAÇÃO SUPABASE (LEITURA APENAS, EVIDÊNCIAS LITERAIS, NENHUMA ALTERAÇÃO)

## 10.1 — Tabelas envolvidas (evidências consolidadas)
- `credit_payments`: sincronizada (`syncCreditPayment`, l.5075; `upsertRow`, `deleteRow` — guard aplicado)
- `sale_item_payments`: sincronizada (`saveSaleItemPayment` — `upsertRow` adicionado; `TableName` atualizado em `syncService` e `syncQueueService`)
- `sales`: sincronizada (`addSale`, `deleteSale` — soft-delete `deleted_at`)
- `sale_items`: sincronizada (`syncSale` — `upsertRow` para cada item)
- `financial_transactions`: sincronizada (`saveFinancialAccount` — `upsertRow`)
- `customer_sessions`: sincronizada (`Comandas` / cardápio)
- `tables`: sincronizada
- `digital_menu_config`: sincronizada
- `delivery_*`: sincronizadas

## 10.2 — syncService.upsertRow (funcionamento, confirmada pela leitura)
`syncService.ts:684-718`:
- Recebe `table: TableName`, `row: Record<string, any>`.
- Sanitiza `__no_table__` e IDs inválidos.
- Verifica `store_branch_id` válido (`validBranchId`).
- Se `navigator.onLine` false ou `!isOrgOnlineAllowed()`: `enqueue` (`syncQueue`).
- Se `auth.uid()` inválido: `relogin` + tenta novamente.
- Se `error` de conexão/auth/transient: `enqueue` novamente.

Observação: `sale_item_payments` agora está no `TableName` (edição aplicada). Se `storeBranchId` for vazio (`''`), `validBranchId('')` retorna `undefined`, e `upsertRow` retorna `false` (não enfileira, apenas loga `⚠️ Skipping`). Isso explica possíveis `403`/falhas se `storeBranchId` não for resolvido (já corrigido no `handleItemPayment` com guard `branchId`).

## 10.3 — Erros nos logs do usuário (evidências consolidadas)
- `409` (`sales`): conflito `onConflict: 'id'` — pode ser duplicação de `id` (se `crypto.randomUUID()` gerar duplicata, improvável) ou `store_branch_id` inválido (`UUID_RE` rejeita `''`). A correção do guard `branchId` no `handleItemPayment` e `deleteSale` reduz esse risco.
- `403` (`sale_items`): RLS (`USING`/`WITH CHECK`) rejeita — pode ser `store_branch_id` vazio ou `organization_id` vazio, ou `anon` tentando escrever sem header `x-branch-id`. Confirmo pelo documento `AGENTS.md`: `sale_items_insert_anon` usa `WITH CHECK (true)`, mas `sales_insert_anon` também usa `true`. Se o `storeBranchId` está vazio, a RLS pode rejeitar (`store_branch_id = get_user_branch_id()` retorna `null` para anon, e a policy pode exigir não-null).
- `Remote DELETE on credit_payments: undefined`: resolvido pelo guard aplicado (`if (!id) return false`), que bloqueia `deleteRow('credit_payments', undefined)`.
- `channel error`: Realtime (`subscribeRealtime`, `resubscribeIfDead`). Não corrigido diretamente (não faz parte desta missão), mas documentado (`BUG-028` no `AGENTS.md`).

Observação: nenhuma alteração aplicada neste bloco — apenas documentação.
