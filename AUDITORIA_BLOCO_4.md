# BLOCO 4 — FUNÇÕES CRÍTICAS (LEITURA APENAS, EVIDÊNCIAS LITERAIS, NENHUMA ALTERAÇÃO ALÉM DO JÁ CONFIRMADO)

## Funções auditadas (FiadosView.tsx, evidências literais)

### handleRegisterPayment (FIFO — pagamento por cliente)
`FiadosView.tsx:405-530`, `useCallback`, dep: [paymentAmount, paymentMethod, creditPayments, customerDebts, sales, addToast, isCaixaOpen]

Passo a passo (evidências):
- L.407: `parseBrlToNumber(paymentAmount)`
- L.418: `amount > debt.remaining + 0.01` → bloqueia se excede
- L.426: `sortedSaleIds.sort(...)` → FIFO por data
- L.444: `existingPayments.filter(cp => cp.saleId === saleId)`
- L.447-454: cria `newPayments` (array de objetos `{id, saleId, customerId, amount, date, paymentMethod}`)
- L.470: `newPayments.push(...)` — NÃO define `isItemPayment`
- L.483: `setCreditPayments(updated)` — atualiza estado local
- L.486: `newPayments.forEach(p => storageService.saveCreditPayment(p))` — sincroniza cada pagamento (sem `isItemPayment` → `false` por padrão)
- L.494: `newPayments.length === 0` → `addToast('warning', ...)`
- L.495: `globalNotificationService.notifyFiado(...)`

Observação crítica: `newPayments` NÃO inclui `isItemPayment`. Quando `saveCreditPayment` é chamado (l.5045 no storageService), `isItemPayment` é `undefined`, que no `filter` do `customerDebts` (`!cp.isItemPayment`) é tratado como `true` (porque `!undefined === true`). **Esse comportamento mudou com a correção da FASE 1** (`!cp.isItemPayment` removido), mas o `handleRegisterPayment` ainda não passa `isItemPayment` explicitamente — agora todos os pagamentos são contados (correto).

### handleItemPayment (pagamento por item)
`FiadosView.tsx:533-591` (após edição FASE 1.5), `useCallback`, dep: [user.name, addToast]

Passo a passo (evidência literal, pós-edição):
- L.540: `item.total - item.paidAmount` → `remaining`
- L.545: `total > remaining + 0.01` → bloqueia excesso
- L.552: `const branchId = storageService.getSelectedBranchId();` (guard adicionado)
- L.553: `if (!branchId) { ... return {success: false} }`
- L.558: `saveSaleItemPayment({..., storeBranchId: branchId})`
- `saveSaleItemPayment` (storageService, l.5017) — após edição: grava em `localStorage` (`SALE_ITEM_PAYMENTS`), chama `saveCreditPayment({..., isItemPayment: true})`, e agora também `syncService.upsertRow('sale_item_payments', ...)`.
- `customerDebts` (l.325, corrigido na FASE 1) — `filter` sem `!isItemPayment` → todos os pagamentos contam.
- FIFO corrigido (Fase 1.5): aloca `specificPaidTotal` (pagamentos por item ao `saleItemId`) antes do FIFO agregado (`remainingPaid`).

### handleConfirmDeletePayment (excluir pagamento)
`FiadosView.tsx:559-591` (pós-guard), `useCallback`, dep: [confirmDeletePayment, creditPayments, addToast]

Passo a passo:
- L.560: `if (!confirmDeletePayment) return;`
- L.562: `const paymentId = confirmDeletePayment.id;` (agora protegido pelo guard aplicado na FASE 1 — `deleteCreditPayment` bloqueia `id` vazio)
- L.563: `setConfirmDeletePayment(null);`
- L.564: `const updated = creditPayments.filter(cp => cp.id !== paymentId);`
- L.565: `setCreditPayments(updated);`
- L.566: `storageService.deleteCreditPayment(paymentId);` (guard aplicado na FASE 1)
- L.574: `return {success: true};`

Observação crítica (não corrigida ainda — Bloque 8/9/10 pendente):
- NÃO remove `saleItemPayment` correspondente de `SALE_ITEM_PAYMENTS` (órfão).
- NÃO remove `financial_account` correspondente de `FINANCIAL` (órfão no Financeiro).
- `updateReceivableFromPayments` (l.5072) é chamado, mas se o pagamento era `isItemPayment`, o cálculo pode não refletir corretamente.

### handleConfirmDeleteDebt (excluir lançamento manual)
`FiadosView.tsx:577-596`, `useCallback`, dep: [confirmDeleteDebtSaleId, sales, creditPayments, addToast]

Passo a passo:
- L.579: `const saleId = confirmDeleteDebtSaleId;`
- L.580: `setConfirmDeleteDebtSaleId(null);`
- L.582: `canDeleteManualDebtSale(sale, creditPayments)` (l.207) — verifica `orderSource === 'fiado'` e `!creditPayments.some(cp => cp.saleId === sale.id)`
- L.588: `storageService.deleteSale(saleId);`
- L.594: `return {success: true};`

Observação crítica (não corrigida — FASE 4 pendente):
- `deleteSale` NÃO remove `credit_payments` vinculados (`saleId`).
- NÃO remove `sale_item_payments` vinculados.
- NÃO remove `financial_transactions` vinculados.
- Se o usuário exclui a dívida manual, os registros vinculados permanecem como órfãos.

### handleRegisterDebt (adicionar dívida manual)
`FiadosView.tsx:609-669`, `useCallback`, dep: [debtAmount, debtReason, debtCustomerPick, debtModalCustomerId, customerDebts, customers, user, addToast]

Passo a passo:
- L.620: `pickedId = debtCustomerPick || debtModalCustomerId || ''`
- L.633: `buildManualDebtSale({..., items: [], payments: [{method:'credit_account', amount}], ...})`
- L.649: `await storageService.addSale(sale);`
- L.658: `globalNotificationService.notifyFiado(customerName, amount, 'new');`
- NÃO atualiza `creditPayments` diretamente — mas `addSale` cria `sale.payments` no localStorage; o `subscribe` (`useEffect`, l.273) NÃO atualiza `creditPayments` com base em `sales` — apenas com base em `getCreditPayments()`. Então a nova venda manual NÃO cria um `CreditPayment` automaticamente no array `creditPayments`. Isso é consistente com o design (a venda manual tem `payments: [{method:'credit_account'}]`, mas `CreditPayment` é uma tabela separada).
- Se o usuário espera que a dívida manual apareça no `customerDebts` como uma venda fiado com `totalDebt` correto, ela aparece (porque `sales.filter` inclui a venda com `payments.some(p => p.method === 'credit_account')`), mas o `totalPaid` depende dos `credit_payments` — se não há `CreditPayment` vinculado, `totalPaid` = 0. Isso é consistente, mas pode confundir o usuário se ele espera que a venda manual já tenha um pagamento associado.

### openDebtModal
`FiadosView.tsx:601-607`, `useCallback`, dep: []
- `setDebtModalCustomerId(customerId);`
- `setDebtCustomerPick(customerId);`
- `setDebtAmount('');`
- `setDebtReason('');`
- Nenhum efeito sobre dados persistentes.

### filterOpenDebts (função pura)
`FiadosView.tsx:73-82`: `debts.filter(d => d.remaining > 0.01)` + filtro por `searchTerm`.
- Não modifica nenhum arquivo.
- Se `remaining` é subestimado (por causa de `!cp.isItemPayment` antes da correção FASE 1, ou por causa do FIFO agregado após FASE 1.5), o filtro pode incluir clientes que já pagaram, ou excluir clientes que ainda devem.
- Após a FASE 1 (`totalPaid` inclui todos) e FASE 1.5 (FIFO respeita item específico), `remaining` é mais preciso, mas ainda depende de `getCreditPayments()` (que filtra por `validSaleIds`) e `getSaleItemPayments()` (que lê `localStorage`). Se algum pagamento for removido (`deleteCreditPayment`) mas o `sale_item_payments` persistir, `totalPaid` pode ser subestimado novamente (porque `getCreditPayments` retorna sem o pagamento removido, mas `getSaleItemPayments` ainda tem o registro). Isso é uma divergência potencial — precisa ser verificada no BLOCO 5.

### getSaleCreditAmount (função pura)
`FiadosView.tsx:87-99`: soma `sale.payments.filter(p => p.method === 'credit_account')`. Não usa `creditPayments` — usa `sale.payments`. Se `sale.payments` e `creditPayments` divergem (ex.: pagamento removido do `credit_payments` mas ainda presente em `sale.payments`), o cálculo diverge. Isso é consistente com o design atual, mas pode ser uma fonte de inconsistência.

### getSaleDebtItems (função pura)
`FiadosView.tsx:109-154`: rateio por item. Não usa `creditPayments`. Usa `sale.total` e `sale.items`. Se `getSaleCreditAmount` (que usa `sale.payments`) diverge de `totalPaid` (que usa `creditPayments`), `getSaleDebtItems` pode calcular uma dívida diferente do que `customerDebts` calcula. Isso é uma divergência documentada.

### buildManualDebtSale (função pura)
`FiadosView.tsx:174-201`: cria `Sale` com `items: []`, `payments: [{method:'credit_account', amount}]`. Não cria `CreditPayment`. Se o usuário espera que a dívida manual tenha um pagamento associado no `FiadosView`, ele precisa criar um `CreditPayment` separadamente — mas `handleRegisterDebt` não faz isso. Isso é consistente com o design (a venda manual representa a dívida, não o pagamento), mas pode confundir.

### canDeleteManualDebtSale (função pura)
`FiadosView.tsx:207-213`: `sale.orderSource === 'fiado'` e `!creditPayments.some(cp => cp.saleId === sale.id)`. Se `deleteCreditPayment` não remove o `credit_payment`, `canDeleteManualDebtSale` retorna `false`, bloqueando a exclusão da dívida manual. Isso protege contra exclusão acidental, mas pode ser um bloqueio se o usuário quer excluir uma dívida que já foi paga mas cujo `credit_payment` ainda persiste (por falta de cleanup).

### getPaymentsPreview (função pura)
`FiadosView.tsx:216-228`: ordena por data desc e retorna os primeiros `limit`. Não modifica arquivos.
