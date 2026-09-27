# BLOCO 2 — ESTADO E DADOS (LEITURA APENAS, NENHUMA CORREÇÃO APENAS DOCUMENTADA)

## 2.1 — useState (FiadosView.tsx, linha 248-270, evidência literal)
- `searchTerm`: string, inicial '', l.248
- `creditPayments`: CreditPayment[], inicial `getCreditPayments()`, l.249
- `itemPaymentTarget`: {customerId, customer, item} | null, l.251
- `paymentModalSaleId`: string | null, l.256
- `paymentAmount`: string, '', l.257
- `paymentMethod`: enum, 'cash', l.258
- `registeringPayment`: boolean, false, l.259
- `expandedCustomerId`: string | null, null, l.260
- `expandedTab`: FiadoDetailTab, 'itens', l.262
- `showAllPayments`: boolean, false, l.263
- `debtModalCustomerId`: string | null, null, l.266
- `debtCustomerPick`: string, '', l.267
- `debtAmount`: string, '', l.268
- `debtReason`: string, '', l.269
- `registeringDebt`: boolean, false, l.270

## 2.2 — useMemo (FiadosView.tsx)
- `customerDebts`: l.281, dep [sales, customers, creditPayments], calcula dívida por cliente
- `filteredDebts`: l.372, dep [customerDebts, searchTerm], filtra por `remaining > 0.01`
- `grandTotalDebt`: l.378, dep [customerDebts], soma `remaining`
- `grandTotalPaid`: l.379, dep [customerDebts], soma `totalPaid`

## 2.3 — useEffect (FiadosView.tsx)
- Listener de `subscribe`: l.273-278, dep [], atualiza `creditPayments` via `getCreditPayments()`
- Nenhum cleanup além de `unsub()`

## 2.4 — useCallback (FiadosView.tsx)
- `handleRegisterPayment`: l.382, dep [paymentAmount, paymentMethod, creditPayments, customerDebts, sales, addToast, isCaixaOpen]
- `handleItemPayment`: l.510, dep [user.name, addToast]
- `handleConfirmDeletePayment`: l.559, dep [confirmDeletePayment, creditPayments, addToast]
- `handleConfirmDeleteDebt`: l.577, dep [confirmDeleteDebtSaleId, sales, creditPayments, addToast]
- `handleRegisterDebt`: l.609, dep [debtAmount, debtReason, debtCustomerPick, debtModalCustomerId, customerDebts, customers, user, addToast]
- `openDebtModal`: l.601, dep []
- `filterOpenDebts`: função pura, l.73
- `getSaleCreditAmount`: função pura, l.87
- `getSaleDebtItems`: função pura, l.109
- `buildManualDebtSale`: função pura, l.174
- `canDeleteManualDebtSale`: função pura, l.207
- `getPaymentsPreview`: função pura, l.216

## Estado crítico documentado (sem alteração)
- `customerDebts` usa `creditPayments.filter(cp => cp.customerId === customerId && !cp.isItemPayment)` (l.323 — CORRIGIDO NA FASE 1 pelo usuário; antes ignorava `isItemPayment`).
- `totalPaid` (l.325) agora inclui todos os pagamentos (após correção Fase 1).
- `getSaleItemPayments()` (l.5063) lê `localStorage` (`KEYS.SALE_ITEM_PAYMENTS`).
- `saveSaleItemPayment` (l.5017) agora sincroniza com Supabase (`upsertRow`) — edição aplicada anteriormente.
