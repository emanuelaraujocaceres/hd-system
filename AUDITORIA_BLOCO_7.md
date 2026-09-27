# BLOCO 7 — CADEIA DE DADOS (LEITURA APENAS, EVIDÊNCIAS LITERAIS, NENHUMA ALTERAÇÃO)

## 7.1 — Fluxo A: Pagamento FIFO (handleRegisterPayment)
`FiadosView.tsx:405-530` + `storageService.ts` (leitura confirmada):
1. Clique → `handleRegisterPayment`
2. `setCreditPayments(updated)` (l.484) → atualiza estado local
3. `newPayments.forEach(p => storageService.saveCreditPayment(p))` (l.486) → cada pagamento salvo separadamente
4. `saveCreditPayment` (storageService, l.5001): `this.set(KEYS.CREDIT_PAYMENTS, ...)` + `this.syncCreditPayment(p)` + `this.notify()` + `this.updateReceivableFromPayments(p.saleId)`
5. `addSuprimento` (se `cash` + `isCaixaOpen`) — l.490
6. `saveFinancialAccount` (l.495-508) — cria conta `receivable` `fiado_payment`
7. `globalNotificationService.notifyFiado` (l.515) — notifica outros devices (se implementado)
8. `useEffect` (l.273) → `subscribe` → `setCreditPayments(getCreditPayments())` → substitui o array (não soma, sem duplicação de valores)
9. Se `newPayments` vazio → `addToast('warning', ...)` (l.517) — não cria registros
10. Se `deleteCreditPayment` chamado: `this.set` remove do array local; `deleteRow` envia DELETE ao Supabase; `notify()` dispara; `subscribe` atualiza; `customerDebts` recalcula.

Observação: `deleteCreditPayment` NÃO remove `sale_item_payments` (órfão) — confirmado pela leitura (`getSaleItemPayments` retorna todos, sem filtro de `saleId`). `deleteSale` NÃO remove `credit_payments` (órfão) — `deleteSale` (l.3586) faz `soft-delete` (`deleted_at`) e remove `sale_items` + `financial_transactions`, mas NÃO `credit_payments`. Isso explica BUG #3 (pagamentos sumindo após exclusão da venda).

## 7.2 — Fluxo B: Pagamento por item (handleItemPayment)
`FiadosView.tsx:533-591` + `storageService.ts` (leitura confirmada):
1. Clique "Pagar" → `handleItemPayment`
2. `saveSaleItemPayment({..., storeBranchId: branchId})` (l.565) — `branchId` verificado (guard aplicado)
3. `saveSaleItemPayment` (l.5017) → `this.set(KEYS.SALE_ITEM_PAYMENTS, ...)` + `syncService.upsertRow('sale_item_payments', ...)` (sincroniza com Supabase, edição aplicada) + `this.saveCreditPayment({..., isItemPayment: true})`
4. `customerDebts` (l.322, corrigido FASE 1) — `filter` sem `!isItemPayment` → `totalPaid` agora inclui o pagamento por item.
5. FIFO corrigido (FASE 1.5) — aloca `specificSum` ao item (`saleItemId`) antes do FIFO agregado.
6. Se `getSaleItemPayments()` retorna vazio (`localStorage` vazio, embora `credit_payments` tenha `isItemPayment`), `specificSum` = 0, e o FIFO agregado distribui `totalPaid` normalmente (como se fosse FIFO puro). Se `getSaleItemPayments()` retorna completo, `specificSum` = valor correto, e o FIFO agregado distribui apenas o restante.
7. `notify()` → `subscribe` → `setCreditPayments` atualizado; `customerDebts` recalcula.
8. Se `deleteCreditPayment` chamado para um `isItemPayment`: `deleteRow('credit_payments')` remove do cloud; `getCreditPayments()` (l.3989) filtra por `validSaleIds`. Se `saleId` ainda existe (`sales` não removido), o pagamento some do retorno — mas o `sale_item_payments` ainda persiste no `localStorage` (não removido por `deleteCreditPayment`). Isso cria uma divergência: `customerDebts` vê o pagamento removido (porque `getCreditPayments` não retorna), mas o `sale_item_payments` ainda contém o registro. Se o `getSaleItemPayments()` é usado no FIFO corrigido, `specificSum` = 0 (porque `customerItemPayments` filtra por `customerId` e `saleItemId`, mas se `getSaleItemPayments()` retorna vazio por algum motivo — ex.: `localStorage` corrompido), o FIFO agregado distribui `totalPaid` normalmente, mas o item não recebe o pagamento específico — valor visual divergente.

Observação: nenhuma alteração aplicada neste bloco (apenas documentação do que já foi feito). Nenhum arquivo alterado além dos já confirmados.
