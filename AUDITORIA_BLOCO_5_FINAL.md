# BLOCO 5 — FUNÇÕES DO STORAGE SERVICE (AUDITORIA COMPLETA — NENHUMA ALTERAÇÃO NESTA RODADA)
- `getCreditPayments` (l.3989-3996): filtro `validSaleIds` mantido; `getSales()` não auditado integralmente (não encontrado se filtra `deleted_at`)
- `saveCreditPayment` (l.5001-5014): `notify()` via `this.set` + `this.syncCreditPayment` + `updateReceivableFromPayments`
- `deleteCreditPayment` (l.5083-5176): guard `!id` + cleanup `sale_item_payments` + `financial_transactions` + `updateReceivableFromPayments` + `notify()`
- `saveSaleItemPayment` (l.5017-5119): `localStorage` + `syncService.upsertRow('sale_item_payments', ...)` + `saveCreditPayment({isItemPayment: true})`
- `getSaleItemPayments` (l.5121-5123): retorna todos (sem filtro `customerId` no retorno)
- `saveFinancialAccount`: existe (`l.4903`); `deleteFinancialAccount` existe (`l.4903-4924`); `deleteCreditPayment` NÃO chama `deleteFinancialAccount` (limpo via `filter` no `deleteCreditPayment` — `linkedAccounts` com `category === 'fiado_payment'`)
- Status: concluído (correções aplicadas confirmadas; nenhuma alteração nova).
