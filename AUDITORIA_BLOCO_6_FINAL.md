# BLOCO 6 — CÁLCULOS (LEITURA APENAS, EVIDÊNCIAS CONSOLIDADAS)

## 6.1 — totalPaid (evidência literal pós-correção FASE 1)
`FiadosView.tsx:321-325`:
```typescript
      const customerPayments = creditPayments.filter(
        (cp) => cp.customerId === customerId
      );
      const totalPaid = customerPayments.reduce((acc, cp) => acc + cp.amount, 0);
```
- Após a correção FASE 1 (`!cp.isItemPayment` removido), `totalPaid` inclui todos os pagamentos (FIFO + por item).
- Se `deleteCreditPayment` é chamado mas `deleteSale` NÃO remove o pagamento (BUG #3 — `deleteSale` não limpa `credit_payments`), `getCreditPayments()` (l.3989) filtra o pagamento removido (`validSaleIds` — se a venda ainda existe, o pagamento é removido corretamente; se a venda também foi removida, o pagamento já está removido pelo filtro, evitando duplicação de exclusão).
- Se `deleteSale` remove a venda (`soft-delete` com `deleted_at`) mas NÃO remove `credit_payments`, `getCreditPayments()` ainda retorna o pagamento se `saleId` ainda está em `sales` (porque o `soft-delete` atualiza a venda, não a remove — `sales.filter(s => s.id !== id)` remove localmente; mas `getSales()` pode incluir vendas com `deleted_at`? Confirmo: `getSales()` filtra por `deleted_at`? Não auditado integralmente — se incluir vendas com `deleted_at`, `validSaleIds` ainda contém o `saleId`, e o pagamento persiste no retorno. Se `getSales()` excluir `deleted_at`, o pagamento some. Isso explica inconsistência.

## 6.2 — paidAmount por item (FIFO, pós-FASE 1.5)
`FiadosView.tsx:338-371` (correção FASE 1.5 aplicada):
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
```
- Se operador paga R$50 no item A (R$60): `specificSum` = 50, `paidAmount` item A = 50, `specificPaidTotal` = 50.
- `remainingPaid` = `totalPaid` (ex.: 50) - 50 = 0 → FIFO agregado não distribui nada.
- Se operador paga R$50 no item A mas `totalPaid` = 100 (outro FIFO de 50), `remainingPaid` = 50 → FIFO distribui ao item B (R$40) → `paidAmount` item B = 40, `remainingPaid` = 10 → item A (R$60) já pago (50), mas `remainingPaid` ainda 10 — se há outro item C (R$10), ele recebe 10.
- Se operador paga R$120 (excesso): `handleItemPayment` bloqueia (`total > remaining + 0.01`, l.545-548) — não ocorre.
- Se `getSaleItemPayments()` retorna vazio (`saleItemPayments` no `localStorage` vazio, embora `credit_payments` tenha `isItemPayment`), `specificPaidTotal` = 0, e o FIFO distribui `totalPaid` normalmente (como antes da correção FASE 1.5, mas com `totalPaid` corrigido pela FASE 1). Isso é consistente, mas se `getSaleItemPayments()` não sincroniza corretamente, `specificPaidTotal` fica em 0 e o pagamento por item aparece como FIFO — divergência visual.

## 6.3 — remaining do cliente
`FiadosView.tsx:353-360` (pós-correção FASE 1):
```typescript
      const actualPaid = Math.min(totalPaid, totalDebt);
      ...
        remaining: Math.round((totalDebt - actualPaid) * 100) / 100,
```
- Se `totalPaid` (agora incluindo `isItemPayment`) = `totalDebt`: `remaining` = 0 → cliente quitado.
- Se `totalPaid` > `totalDebt`: `actualPaid` = `totalDebt`, `remaining` = 0 (não negativo — `Math.min` protege).
- Se `totalPaid` < `totalDebt`: `remaining` positivo — correto.

## 6.4 — totalDebt
`FiadosView.tsx:327-336`:
```typescript
      for (const sale of custSales) {
        const contrib = getSaleDebtItems(sale);
        totalDebt += contrib.debt;
        allItems.push(...contrib.items);
      }
```
- `getSaleDebtItems` (l.109) usa `getSaleCreditAmount` (l.87) que lê `sale.payments` (não `creditPayments`).
- Se `sale.payments` e `creditPayments` divergem (ex.: pagamento removido de `credit_payments` mas ainda em `sale.payments`), `totalDebt` usa `sale.payments`, enquanto `totalPaid` usa `creditPayments`. Isso pode fazer `totalPaid` ≠ `getSaleCreditAmount`, gerando `remaining` inconsistente.
- Se `getSaleCreditAmount` retorna `saleTotal` quando não há `credit_account` (fallback `|| saleTotal`, l.92-98), mas a venda tem `payments` com `method='credit_account'`, o cálculo é correto. Se a venda não tem `payments` mas tem `credit_payments` vinculados (por algum motivo), `getSaleCreditAmount` retorna `saleTotal` (porque `sale.payments` está vazio), mas `totalPaid` conta o `credit_payments` — `remaining` fica negativo (corrigido pelo `Math.min`, mas ainda estranho).

## 6.5 — Consistência matemática (resposta consolidada)
- `totalDebt` = `totalPaid` + `remaining`? SIM, por definição (`actualPaid = Math.min(totalPaid, totalDebt)`, `remaining = totalDebt - actualPaid`).
- Se `totalPaid` > `totalDebt`: `remaining` = 0 (não negativo — protegido).
- Soma dos `paidAmount` dos itens = `totalPaid`? NÃO necessariamente — `paidAmount` é distribuído pelo FIFO agregado (`remainingPaid`) e pelo específico (`specificPaidTotal`). Se `specificPaidTotal` é subestimado (porque `getSaleItemPayments` retorna vazio ou incompleto), `paidAmount` dos itens pode ser menor que `totalPaid`, fazendo a soma dos `paidAmount` < `totalPaid`. Isso é uma divergência entre o nível de item (`allItems.paidAmount`) e o nível agregado (`totalPaid`).
- Soma dos `total` dos itens = `totalDebt`? SIM (`getSaleDebtItems` retorna `debt` que é a contribuição de cada item ao `totalDebt`).
- Divergência confirmada: se `getSaleItemPayments()` não retorna todos os pagamentos por item, `specificPaidTotal` fica subestimado, `paidAmount` do item fica menor, e `remaining` fica maior. Se o usuário vê o item como "Pago" visualmente (porque `paidAmount` é calculado pelo FIFO agregado, que inclui todos), mas o `specificPaidTotal` está subestimado, o `remaining` pode ser incorreto.

Observação: nenhuma alteração aplicada neste bloco — apenas documentação.
