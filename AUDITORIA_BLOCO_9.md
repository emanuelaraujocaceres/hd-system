# BLOCO 9 — INTEGRAÇÃO COM FINANCEIRO (LEITURA APENAS, EVIDÊNCIAS LITERAIS, NENHUMA ALTERAÇÃO)

## 9.1 — Financeiro lê os pagamentos (evidência literal)
`FinanceView.tsx:543-548`:
```typescript
  const manualCreditPayments = storageService.getCreditPayments();
  const manualDebtReceived = sumManualDebtReceived(sales, manualCreditPayments, selectedBranchId, (iso) => isSaleInRange(iso, dateFrom, dateTo));
  const financeSummary = calculateFinanceSummary(sales, products, selectedBranchId, undefined, undefined, { from: dateFrom, to: dateTo }, manualCreditPayments);
```
- `manualCreditPayments` = todos os `CreditPayment` (inclui `isItemPayment` — sem filtro contrário).
- `sumManualDebtReceived` (não auditado integralmente, mas confirmado como existente no arquivo `lib/financeSummary.ts`) — usa `manualCreditPayments`. Se `isItemPayment` está incluído, o Financeiro conta o pagamento por item no `manualDebtReceived`.
- `calculateFinanceSummary` (l.92, `financeSummary.ts`) — recebe `manualCreditPayments`. Confirmo pelo grep (`financeSummary.test.ts`) que a função aceita `manualCreditPayments`. Não auditado integralmente, mas confirmado pelo uso no `FinanceView`.

## 9.2 — Consistência Financeiro vs Fiados (evidências consolidadas)
- `FiadosView` (`customerDebts`): `totalPaid` = `creditPayments.filter(cp => cp.customerId === customerId)` (sem `!isItemPayment` após FASE 1). `getSaleItemPayments()` (l.5063) retorna todos os registros do `localStorage`.
- `FinanceView`: `manualCreditPayments` = `getCreditPayments()` (sem filtro). Se `getCreditPayments()` retorna todos (sem `validSaleIds` — se `deleteSale` remove a venda mas NÃO o pagamento, `validSaleIds` ainda contém se a venda tem `deleted_at` — depende de `getSales()` que não foi auditado integralmente), `FiadosView` e `FinanceView` concordam. Se `getSales()` filtra `deleted_at` (provavelmente sim, pelo design `soft-delete`), `getCreditPayments()` retorna sem o pagamento (porque `saleId` não está em `validSaleIds`), mas `FinanceView` ainda conta se `manualCreditPayments` inclui esse pagamento? Confirmo: `getCreditPayments()` filtra por `validSaleIds` (l.3995). Se `validSaleIds` não contém `saleId`, o pagamento NÃO aparece no `FinanceView` nem no `FiadosView`. Isso é consistente — se a venda é removida (soft-delete), o pagamento também some de ambos (se `deleteSale` não limpa `credit_payments`, mas `getCreditPayments()` filtra, o pagamento some — mas ainda existe no `localStorage` e no cloud como órfão).
- Divergência potencial: se `deleteCreditPayment` é chamado (pagamento removido) mas `deleteSaleItemPayment` NÃO é chamado (`sale_item_payments` persiste), `FiadosView` não vê o pagamento (porque `getCreditPayments()` retorna sem ele), mas `FinanceView` NÃO vê nenhum `sale_item_payment` no cálculo (porque `manualCreditPayments` usa `CreditPayment`, não `SaleItemPayment`). Se `deleteSale` NÃO remove `credit_payments`, mas `getCreditPayments()` filtra pelo `saleId` existente (venda ainda existe, `soft-delete`), o pagamento ainda aparece — consistente. Se `getSales()` inclui `deleted_at`, `validSaleIds` contém o `saleId`, e `getCreditPayments()` retorna o pagamento — consistente com `soft-delete`. Se `getSales()` NÃO inclui `deleted_at`, `validSaleIds` não contém, e o pagamento some — inconsistente com `soft-delete` (a venda ainda existe no cloud, mas o pagamento some).
- **Conclusão:** a divergência entre `FiadosView` e `FinanceView` para `isItemPayment` é resolvida pela FASE 1 (`totalPaid` inclui todos). A divergência remanescente é a dos órfãos (`credit_payments` persistindo após `deleteSale` ou após `deleteCreditPayment` sem cleanup de `sale_item_payments` / `financial_transactions`). A FASE 4 (`deleteSale` cleanup) e o `deleteCreditPayment` cleanup são necessários para resolver completamente.

Observação: nenhuma alteração aplicada neste bloco.
