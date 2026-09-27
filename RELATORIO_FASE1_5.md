# RELATÓRIO — FASE 1.5 (FIFO Respeita Item Específico)

## Tarefa 1 — SaleItemPayment (evidência literal)
`src/types/index.ts:427`: `isItemPayment?: boolean;`
`CreditPayment` (l.417-428): `saleItemId` NÃO existe; `saleId`, `customerId`, `amount`, `date`, etc.
`SaleItemPaymentStatus` (l.43): `saleId?: string`, `isManual?: boolean`, `paidAmount`, `total`.
Não existe interface `SaleItemPayment` separada — o `record` criado em `saveSaleItemPayment` (l.5028-5040) é armazenado como `any[]` no `KEYS.SALE_ITEM_PAYMENTS`.

## Tarefa 2 — getSaleItemPayments
`storageService.ts:5063-5064`:
```typescript
  getSaleItemPayments(): any[] {
    return this.get<any[]>(KEYS.SALE_ITEM_PAYMENTS, []);
  }
```
Retorna todos os registros (incluindo `isItemPayment` via `record` que tem `saleItemId`, `saleId`, etc.).

## Tarefa 3 — customerDebts corrigido
- **Antes:** (`FiadosView.tsx:338-351`)
```typescript
      let remainingPaid = totalPaid;
      const sortedItems = [...allItems].sort((a, b) => a.total - b.total);
      for (const item of sortedItems) {
        if (remainingPaid <= 0) break;
        const apply = Math.min(remainingPaid, item.total);
        item.paidAmount = Math.round(apply * 100) / 100;
        remainingPaid = Math.round((remainingPaid - apply) * 100) / 100;
      }
      allItems.sort((a, b) => b.total - a.total);
```
- **Depois:** (`FiadosView.tsx:338-371` — edit aplicado)
```typescript
      const saleItemPayments = storageService.getSaleItemPayments();
      const customerItemPayments = saleItemPayments.filter(
        (p) => p.customerId === customerId
      );
      let specificPaidTotal = 0;
      for (const item of allItems) {
        const specific = customerItemPayments.filter(
          (p) => p.saleItemId === item.productId && p.saleId === item.saleId
        );
        const specificSum = specific.reduce((sum, p) => sum + (p.amount || 0), 0);
        if (specificSum > 0) {
          item.paidAmount = Math.min(specificSum, item.total);
          specificPaidTotal += item.paidAmount;
        }
      }
      let remainingPaid = Math.round((totalPaid - specificPaidTotal) * 100) / 100;
      const sortedItems = [...allItems].sort((a, b) => a.total - b.total);
      for (const item of sortedItems) {
        if (remainingPaid <= 0) break;
        const itemRemaining = Math.round((item.total - item.paidAmount) * 100) / 100;
        if (itemRemaining <= 0) continue;
        const apply = Math.min(remainingPaid, itemRemaining);
        item.paidAmount = Math.round((item.paidAmount + apply) * 100) / 100;
        remainingPaid = Math.round((remainingPaid - apply) * 100) / 100;
      }
      allItems.sort((a, b) => b.total - a.total);
```
- **Status:** ✅ Aplicado

## Tarefa 4 — Listener (análise, NÃO MODIFICADO)
- `subscribe` (l.273): `setCreditPayments(getCreditPayments())` — atualiza `creditPayments`.
- `getSaleItemPayments()` (l.5063): lê `localStorage` (`KEYS.SALE_ITEM_PAYMENTS`).
- `saveSaleItemPayment` (l.5042-5043): `this.set(KEYS.SALE_ITEM_PAYMENTS, [...existing, record])` — atualiza `localStorage`.
- **Não precisa de listener extra:** `useMemo` (`customerDebts`) lê `getSaleItemPayments()` diretamente no momento do cálculo. Quando `subscribe` atualiza `creditPayments`, o `useMemo` recalcula `customerDebts`, que por sua vez lê o `getSaleItemPayments()` atualizado. Sem duplicação.
- `notify()`: `saveCreditPayment` (chamado por `saveSaleItemPayment`, l.5045) chama `this.notify()` (l.5009). `subscribe` dispara. `getCreditPayments()` retorna atualizado. `customerDebts` recalcula.

## Tarefa 5 — npm run lint
```
> react-example@0.0.0 lint
> tsc --noEmit
```
- **Status:** ✅ Zero erros

## Resumo
- Correções aplicadas: 2 (`totalPaid` inclui `isItemPayment`; FIFO respeita item específico via `getSaleItemPayments`)
- Arquivo modificado: `src/components/CRM/FiadosView.tsx`
- Erros de lint: 0
- Divergência resolvida: pagamentos por item agora contam no `totalPaid` e são alocados ao item específico (`saleItemId`) antes do FIFO agregado.
- Próximos passos: testar no navegador com o caso do usuário (Dionathan GORDAO) para confirmar que o valor não mais "some" após pagamento por item.
