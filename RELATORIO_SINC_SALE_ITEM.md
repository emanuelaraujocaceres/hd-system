# RELATÓRIO — Sincronização sale_item_payments + FIFO corrigido

## Tarefa 1 — saveSaleItemPayment (antes)
`src/services/storageService.ts:5017-5061`:
```typescript
  saveSaleItemPayment(data: {...}): ... {
    ...
    const existing = this.get<any[]>(KEYS.SALE_ITEM_PAYMENTS, []);
    this.set(KEYS.SALE_ITEM_PAYMENTS, [...existing, record]);
    this.saveCreditPayment({... isItemPayment: true ...});
    return { success: true };
  }
```
- **Antes:** só gravava em `localStorage` (`SALE_ITEM_PAYMENTS`) + `credit_payments`. Nenhum `syncService.upsertRow('sale_item_payments', ...)`.

## Tarefa 2 — saveSaleItemPayment (depois)
`storageService.ts:5045-5059` (adicionado):
```typescript
      const orgId = this.orgIdForBranch(data.storeBranchId, data.organizationId);
      syncService.upsertRow('sale_item_payments', {
        id: record.id,
        organization_id: orgId,
        store_branch_id: data.storeBranchId || null,
        sale_id: data.saleId || null,
        sale_item_id: data.saleItemId || null,
        customer_id: data.customerId || null,
        amount: data.amount,
        payment_method: data.paymentMethod || null,
        operator_name: data.operatorName || null,
        paid_at: record.paidAt,
        created_at: record.createdAt,
      });
```
- `TableName` atualizado em `syncService.ts` (+ `sale_item_payments`) e `syncQueueService.ts`.
- **Status:** ✅ Aplicado

## Tarefa 3 — handleItemPayment (antes/depois)
`FiadosView.tsx:549-567`:
```typescript
        const branchId = storageService.getSelectedBranchId();
        if (!branchId) {
          addToast('error', 'Nenhuma filial selecionada.');
          ...
        }
        const result = storageService.saveSaleItemPayment({
          ...
          storeBranchId: branchId,
          ...
        });
```
- **Guard de branch:** `branchId` verificado antes da chamada (evita `storeBranchId: ''` que quebrava RLS).
- **Status:** ✅ Aplicado

## Tarefa 4 — Listener (análise, NÃO modificado)
`useEffect` (l.273-278): `subscribe` atualiza `creditPayments`. `customerDebts` (`useMemo`) lê `getSaleItemPayments()` diretamente — não precisa de listener separado para `sale_item_payments`. Quando `saveSaleItemPayment` grava no `localStorage`, o `useMemo` lê o valor atualizado no próximo ciclo (via `getSaleItemPayments`). Sem duplicação.

## Tarefa 5 — npm run lint
```
> react-example@0.0.0 lint
> tsc --noEmit
```
- **Status:** ✅ 0 erros

## Resumo
- `sale_item_payments`: sincronizado com Supabase (`upsertRow`) ✅
- `TableName`: atualizado (`syncService.ts` + `syncQueueService.ts`) ✅
- `handleItemPayment`: guard de `branchId` + `storeBranchId: branchId` ✅
- FIFO (`totalPaid`): corrigido para incluir `isItemPayment` (edição anterior) ✅
- `lint`: 0 erros ✅
- Nenhum arquivo alterado além de `storageService.ts`, `FiadosView.tsx`, `syncService.ts`, `syncQueueService.ts`.
- Próximo passo: confirmar com o usuário se precisa de teste com o caso Dionathan GORDAO.
