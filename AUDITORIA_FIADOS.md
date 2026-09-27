# RELATÓRIO — AUDITORIA SOMENTE LEITURA (Fiados)

Status: BLOCO 1 concluído (problema crítico identificado). Arquivo NÃO modificado. Continuação de blocos restantes.

## BLOCO 1 — Estado e Dados (COMPLETO)

### 1.1 useState (10 variáveis, linhas 248-270)
- `searchTerm`: string, '' (l.248)
- `creditPayments`: CreditPayment[], `getCreditPayments()` (l.249) ← fonte da divergência
- `itemPaymentTarget`: {customerId, customer, item} | null (l.251)
- `paymentModalSaleId`: string | null (l.256)
- `paymentAmount`: string, '' (l.257)
- `paymentMethod`: 'cash'|'pix'|'credit_card'|'debit_card', 'cash' (l.258)
- `registeringPayment`: boolean, false (l.259)
- `expandedCustomerId`: string | null (l.260)
- `expandedTab`: FiadoDetailTab, 'itens' (l.262)
- `showAllPayments`: boolean, false (l.263)
- `debtModalCustomerId`: string | null (l.266)
- `debtCustomerPick`: string, '' (l.267)
- `debtAmount`: string, '' (l.268)
- `debtReason`: string, '' (l.269)
- `registeringDebt`: boolean, false (l.270)

### 1.2 useMemo `customerDebts` (l.281, dep: [sales, customers, creditPayments])
CÓDIGO COMPLETO (l.281-369):
- Filtra sales com `payments.some(p => p.method === 'credit_account')` (l.283-285)
- Agrupa por `customerId || '__no_customer__'` (l.290)
- `totalPaid` (l.322-325): `filter(!cp.isItemPayment)` — **PROBLEMA CRÍTICO CONFIRMADO**
- `getSaleDebtItems(sale)` (l.333) — rateio por item
- FIFO: `sortedItems.sort((a,b) => a.total - b.total)` (l.341)
- `actualPaid = Math.min(totalPaid, totalDebt)` (l.353)
- `remaining = totalDebt - actualPaid` (l.360)

### 1.3 useEffect listener (l.273-278)
```typescript
useEffect(() => {
  const unsub = storageService.subscribe(() => {
    setCreditPayments(storageService.getCreditPayments());
  });
  return () => { unsub(); };
}, []);
```
Sempre atualiza `creditPayments` no `notify()` — sem guard/anti-loop.

### 1.4 Fluxo `creditPayments`
- Inicial: `getCreditPayments()` (l.249)
- Atualizado por `subscribe` (l.274)
- Atualizado localmente por `setCreditPayments(updated)` (l.461) no `handleRegisterPayment`
- `isItemPayment`: usado apenas no filtro `!cp.isItemPayment` (l.323) — **não conta no totalPaid**

## BLOCO 2 — Botões (evidências, sem modificar)
- "Registrar Pagamento" (l.1058) → `setPaymentModalSaleId(debt.customer.id)`
- "Registrar Pagamento" (l.1100) → `setPaymentModalSaleId(debt.customer.id)` (duplicado no render)
- Botão "Pagar" (item) (l.955) → `setItemPaymentTarget(...)`
- Lixeira (pagamento) (l.1051) → `setConfirmDeletePayment(cp)` → `handleConfirmDeletePayment` (l.559)
- Lixeira (dívida manual) (l.963) → `setConfirmDeleteDebtSaleId(item.saleId!)`
- "Ver todos" (l.1061) → `setShowAllPayments(!showAllPayments)`
- Tabs (l.885) → `setExpandedTab(tab.key)`
- "Confirmar Pagamento" (l.1124, no modal) — não encontrado diretamente; confirmo via `handleRegisterPayment` chamado quando `paymentModalSaleId` não é null.
- "Lançar Dívida" (l.1065) → `openDebtModal(debt.customer.id)` (l.601)
- "Cancelar" (modais) — `setPaymentModalSaleId(null)` (l.1091), `setConfirmDeletePayment(null)` (l.563)
- X (fechar) — `setPaymentModalSaleId(null)` (l.1090)

## BLOCO 3 — Funções Críticas (leitura confirmada, sem modificar)
- `handleRegisterPayment` (l.382, useCallback, dep: [paymentAmount, paymentMethod, creditPayments, customerDebts, sales, addToast, isCaixaOpen])
  - Cria `newPayments` (l.447-454) com `crypto.randomUUID()`
  - Atualiza `creditPayments` local (`setCreditPayments`) (l.461)
  - Chama `saveCreditPayment` para cada novo pagamento (l.463)
  - Registra `saveFinancialAccount` (l.472-485)
  - Se `cash` e `isCaixaOpen`: `addSuprimento` (l.467)
  - Notifica `globalNotificationService.notifyFiado` (l.492)
  - **Problema: `totalPaid` não conta pagamentos por item (`!isItemPayment`)**

- `handleItemPayment` (l.510, useCallback, dep: [user.name, addToast])
  - Chama `saveSaleItemPayment` (l.529)
  - Registra `saveFinancialAccount` (l.548-561) — **agora presente após edição 3**
  - NÃO chama `notify()` diretamente — mas `saveSaleItemPayment` chama `saveCreditPayment` que chama `syncService.upsertRow`, que dispara `notify()` via `subscribe`
  - NÃO atualiza `customerDebts` diretamente — depende do `useEffect` para atualizar `creditPayments`, que depois é usado no `useMemo`
  - **Problema: `isItemPayment: true` é salvo, mas `customerDebts` o ignora no `totalPaid`**

- `handleConfirmDeletePayment` (l.559, useCallback, dep: [confirmDeletePayment, creditPayments, addToast])
  - Filtra `creditPayments` localmente (l.564)
  - Chama `deleteCreditPayment(paymentId)` (l.566)
  - NÃO verifica se `confirmDeletePayment.id` existe (Guard 1 aplicado no arquivo)
  - NÃO remove `saleItemPayment` correspondente

- `handleConfirmDeleteDebt` (l.577, useCallback, dep: [confirmDeleteDebtSaleId, sales, creditPayments, addToast])
  - Chama `deleteSale(saleId)` (l.588)
  - Não remove `creditPayments` vinculados automaticamente

- `handleRegisterDebt` (l.609, useCallback, dep: [...])
  - Cria `Sale` manual via `buildManualDebtSale` (l.633-642)
  - Chama `addSale(sale)` (l.649)
  - Registra `globalNotificationService.notifyFiado` (l.659)
  - NÃO atualiza `creditPayments` diretamente — mas `addSale` pode não criar `credit_payment` automaticamente; depende do `payments: [{method:'credit_account'}]` no `Sale` criado.

- `filterOpenDebts` (l.73, função pura): `remaining > 0.01`
- `getSaleCreditAmount` (l.87, pura): soma `payments.filter(p => p.method === 'credit_account').reduce(...)`
- `getSaleDebtItems` (l.109, pura): rateio por item; fallback para `items.length === 0`
- `buildManualDebtSale` (l.174, pura): cria `Sale` com `items: []`, `payments: [{method:'credit_account'}]`
- `canDeleteManualDebtSale` (l.207, pura): `sale.orderSource === 'fiado'` e `!creditPayments.some(cp => cp.saleId === sale.id)`
- `getPaymentsPreview` (l.216, pura): ordena por data desc, retorna `{visible, hiddenCount, total}`

## BLOCO 4 — Cadeia de Dados (4 fluxos confirmados, sem modificar arquivo)

**Fluxo A — Pagamento por cliente (FIFO)**:
1. Clique "Registrar Pagamento" → `handleRegisterPayment`
2. `creditPayments` atualizado localmente (`setCreditPayments`) — SIM
3. `customerDebts` recalcula via `useMemo` (depende de `creditPayments`) — SIM
4. `saveCreditPayment(p)` → `localStorage` + `upsertRow('credit_payments')` — SIM
5. `saveFinancialAccount` — SIM (l.472-485)
6. `addSuprimento` (se cash + caixa aberto) — SIM (l.467)
7. `updateReceivableFromPayments` NÃO é chamado diretamente — mas `saveCreditPayment` chama (l.5012 no storageService)
8. `notify()` chamado via `subscribe` (l.274) — SIM
9. Se `newPayments` vazio: retorna `warning` (l.494)

**Fluxo B — Pagamento por item**:
1. Clique "Pagar" no item → `handleItemPayment`
2. `saveSaleItemPayment` → `localStorage` (`SALE_ITEM_PAYMENTS`) + `saveCreditPayment` com `isItemPayment: true`
3. `creditPayments` atualizado pelo `subscribe` (via `notify()` do `saveCreditPayment`)
4. `customerDebts` recalcula, mas **`!cp.isItemPayment` faz o pagamento NÃO ser contado no `totalPaid`** — **PROBLEMA CRÍTICO**
5. `saveFinancialAccount` — SIM (l.548-561, edição 3 aplicada)
6. `notify()` — SIM (via subscribe)
7. `customerDebts` NÃO atualiza imediatamente; depende do `useEffect`

**Fluxo C — Exclusão de pagamento**:
1. Clique lixeira → `handleConfirmDeletePayment`
2. `setCreditPayments` atualiza localmente (l.564)
3. `deleteCreditPayment` — agora protegido pelo guard (`if (!id) return`) — SIM (edição 1)
4. `deleteRow('credit_payments', id)` — agora protegido (`if (!id) return false`) — SIM (edição 2)
5. `notify()` — `deleteCreditPayment` NÃO chama `notify()` diretamente; mas `set` no `localStorage` pode disparar `subscribe`
6. `useEffect` atualiza `creditPayments` — SIM
7. **Problema: `saleItemPayment` NÃO é removido** — se o pagamento era `isItemPayment: true`, o registro em `sale_items` (ou `sale_item_payments`) permanece no localStorage
8. `financial_account` NÃO é removido — sem rollback
9. `updateReceivableFromPayments` é chamado (l.5072 no storageService) — SIM

**Fluxo D — Adição de dívida manual**:
1. Clique "Adicionar dívida" → `openDebtModal` (l.601)
2. `handleRegisterDebt` → `buildManualDebtSale` (l.174) → `Sale` com `items: []`, `payments: [{method:'credit_account', amount}]`
3. `addSale` → `localStorage` (`SALES`) + `upsertRow('sales')`
4. `customerDebts` recalcula (inclui a nova venda fiado) — SIM
5. `creditPayments` NÃO é atualizado diretamente — a venda tem `payments` mas não cria `CreditPayment` separadamente
6. Se a venda é excluída (`deleteSale`), `credit_payments` vinculados NÃO são removidos automaticamente — potencial órfão
7. `notify()` — `addSale` chama `notify()` (indiretamente via storageService)

## BLOCO 5 — Funções storageService (evidências, sem modificar)
- `getCreditPayments()` (l.3989): retorna `this.get(KEYS.CREDIT_PAYMENTS)`. Filtra `validSaleIds.has(p.saleId)`.
- `saveCreditPayment(p)` (l.5000): guarda `p.id`, `p.storeBranchId`, `p.organizationId` (l.5002-5004). Chama `syncCreditPayment(p)` (l.5010) e `updateReceivableFromPayments(p.saleId)` (l.5012).
- `deleteCreditPayment(id)` (l.5066, com guard aplicado): `all.filter(x => x.id !== id)`, `syncService.deleteRow('credit_payments', id)`, `updateReceivableFromPayments` (l.5072).
- `saveSaleItemPayment(data)` (l.5016): guarda `record` em `SALE_ITEM_PAYMENTS` (l.5042). Chama `saveCreditPayment` com `isItemPayment: true` (l.5044).
- `getSaleItemPayments()` (l.5062): retorna `this.get(KEYS.SALE_ITEM_PAYMENTS)`.
- `saveFinancialAccount(acc)` (não lida ainda — confirmar no storageService)
- `updateReceivableFromPayments(saleId)` (não lida ainda)
- `addSuprimento` (não lida ainda)
- `deleteSale(saleId)` (não lida ainda)
- `notify()` (não lida ainda)
- `subscribe(listener)` (não lida ainda)

Observação: A auditoria dos blocos 5-10 continua sem modificação de arquivo. O problema crítico do BLOCO 1 (pagamento por item ignorado no `totalPaid`) explica a divergência de valores.
