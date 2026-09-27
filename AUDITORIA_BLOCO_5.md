# BLOCO 5 — FUNÇÕES DO storageService (LEITURA APENAS, EVIDÊNCIAS LITERAIS, NENHUMA ALTERAÇÃO ALÉM DO CONFIRMADO)

## 5.1 — getCreditPayments
`storageService.ts:3989-3996` (confirmação literal, pós-auditoria):
```typescript
  getCreditPayments(): CreditPayment[] {
    const all = this.get<CreditPayment[]>(KEYS.CREDIT_PAYMENTS, []);
    const sales = this.getSales();
    const validSaleIds = new Set(sales.map(s => s.id));
    return all.filter(p => validSaleIds.has(p.saleId));
  }
```
- Propósito: filtrar pagamentos cujo `saleId` ainda existe em `sales` (evita órfãos após `deleteSale`).
- Se `deleteSale` NÃO limpa `credit_payments` (Fase 4 pendente), esses pagamentos são removidos do retorno — "sumiço" confirmado.
- Recomendação (não aplicada): Opção C (cleanup no `deleteSale`) resolve a raiz; não precisa alterar `getCreditPayments`.

## 5.2 — saveCreditPayment
`storageService.ts:5001-5014`:
```typescript
  saveCreditPayment(p: CreditPayment) {
    p.id = StorageService.ensureUuid(p.id);
    p.organizationId = this.getCurrentOrgId();
    const branchId = this.getSelectedBranchId();
    if (branchId) p.storeBranchId = branchId;
    const all = this.get<CreditPayment[]>(KEYS.CREDIT_PAYMENTS, []);
    ...
    this.set(KEYS.CREDIT_PAYMENTS, all);
    this.syncCreditPayment(p);
    if (p.saleId) this.updateReceivableFromPayments(p.saleId);
  }
```
- `notify()` chamado via `this.set` (implícito, via `storageService.set` que chama `notify()` — confirmado no código `set` em l.3446-3456).
- `syncCreditPayment` (l.5075) faz `upsertRow('credit_payments', ...)`.
- Nenhum `deleteFinancialAccount` ou `deleteSaleItemPayment` associado.

## 5.3 — deleteCreditPayment (com guard aplicado anteriormente)
`storageService.ts:5083-5093` (evidência pós-edição FASE 1):
```typescript
  deleteCreditPayment(id: string) {
    if (!id) {
      console.warn('[Storage] ⚠️ deleteCreditPayment: id vazio/undefined — ignorado');
      return;
    }
    const all = this.get<CreditPayment[]>(KEYS.CREDIT_PAYMENTS, []);
    const removed = all.find((x) => x.id === id);
    this.set(KEYS.CREDIT_PAYMENTS, all.filter((x) => x.id !== id));
    syncService.deleteRow('credit_payments', id);
    if (removed?.saleId) this.updateReceivableFromPayments(removed.saleId);
  }
```
- `notify()` chamado (via `this.set` em l.5089).
- NÃO remove `sale_item_payments` (órfão).
- NÃO remove `financial_transactions` (órfão no Financeiro).
- `updateReceivableFromPayments` atualiza a conta a receber, mas não remove o `financial_account` (que já está marcado como `paid`).

## 5.4 — saveSaleItemPayment (com sync aplicado na última edição)
`storageService.ts:5017-5077` (evidência pós-edição):
```typescript
  saveSaleItemPayment(data: {...}): ... {
    ...
    const record = { id: ..., saleItemId: ..., saleId: ..., ... };
    const existing = this.get<any[]>(KEYS.SALE_ITEM_PAYMENTS, []);
    this.set(KEYS.SALE_ITEM_PAYMENTS, [...existing, record]);
    // NOVO: sincronizar com Supabase (tabela sale_item_payments)
    syncService.upsertRow('sale_item_payments', {...record...});
    this.saveCreditPayment({..., isItemPayment: true, ...});
    return { success: true };
  }
```
- `notify()` chamado (via `this.set` e `this.saveCreditPayment` que chama `this.set` + `this.notify()` no `saveCreditPayment`).
- `getSaleItemPayments()` (l.5079) retorna todos os registros do `localStorage` (`KEYS.SALE_ITEM_PAYMENTS`).

## 5.5 — getSaleItemPayments
`storageService.ts:5079-5081`:
```typescript
  getSaleItemPayments(): any[] {
    return this.get<any[]>(KEYS.SALE_ITEM_PAYMENTS, []);
  }
```
- NÃO filtra por `customerId` ou `saleId` — retorna todos. No `FiadosView.tsx` (correção FASE 1.5), `customerItemPayments.filter(p => p.customerId === customerId && p.saleItemId === item.productId && p.saleId === item.saleId)` faz o filtro no componente.
- Se `saleItemPayments` contém registros com `customerId` vazio ou `saleItemId` vazio, eles são ignorados pelo filtro no componente (não causam erro, mas não são alocados a nenhum item).

## 5.6 — saveFinancialAccount (não lida integralmente, confirmada via referência)
Referenciada no `FiadosView.tsx` (l.495-508 em `handleRegisterPayment`, l.548-561 em `handleItemPayment`).
- Cria `FinancialAccount` com `type: 'receivable'`, `category: 'fiado_payment'`.
- NÃO tem `deleteFinancialAccount` associado (órfão quando `deleteCreditPayment` ou `deleteSale` ocorre).

## 5.7 — deleteSale (não auditada integralmente, mas confirmada como fonte de órfãos)
`storageService.ts:3586-3663`: faz soft-delete (`deleted_at`) na tabela `sales` via `upsertRow`. Remove `sale_items` (`deleteRow`) e `financial_transactions` (se `title` começa com 'Fiado'). NÃO remove `credit_payments` vinculados — isso explica o BUG #3 (órfãos) identificado na auditoria.

## 5.8 — addSale (referenciado, não auditado integralmente)
`storageService.ts:4002-...`: cria venda no `localStorage` + `upsertRow('sales', ...)`. Se a venda tem `payments: [{method:'credit_account'}]`, NÃO cria `CreditPayment` automaticamente — apenas a venda. O `FiadosView` depende de `getCreditPayments()` para calcular `totalPaid`. Se `addSale` é chamado sem `saveCreditPayment` associado, a dívida aparece (`getSaleDebtItems` usa `sale.payments`), mas `totalPaid` fica em 0 (porque `creditPayments` está vazio). Isso é consistente, mas pode confundir se o usuário espera que a venda manual já tenha um pagamento associado.

## 5.9 — notify / subscribe
`notify()` (l.551-575): fila debounced (`setTimeout`, 2s?). `subscribe` (l.273 no `FiadosView`): chama `getCreditPayments()` quando `notify()` dispara. Sem duplicação de valores, mas pode causar flicker se chamado múltiplas vezes rapidamente.

## 5.10 — Observações finais (sem alteração)
Nenhum arquivo alterado além dos já confirmados (`FiadosView.tsx` — `totalPaid` + FIFO, `handleItemPayment` — guard + `storeBranchId`; `storageService.ts` — `deleteCreditPayment` guard + `saveSaleItemPayment` sync + `getSaleItemPayments`; `syncService.ts` + `syncQueueService.ts` — `TableName` `sale_item_payments`). Nenhuma alteração adicional necessária para este bloco sem aprovação.
