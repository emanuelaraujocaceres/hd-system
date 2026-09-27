# BLOCO 7 — CADEIA DE DADOS (AUDITORIA COMPLETA — NENHUMA ALTERAÇÃO NESTA RODADA)
- Fluxo A (FIFO): documentado (`handleRegisterPayment` → `setCreditPayments` → `saveCreditPayment` → `notify` → `subscribe` → `customerDebts` recalc)
- Fluxo B (Item): `handleItemPayment` → `saveSaleItemPayment` (`localStorage` + `upsertRow` + `notify`) → `subscribe` → `customerDebts` recalc; `getSaleItemPayments()` retorna todos (sem filtro por `customerId` no retorno — filtro feito no componente)
- Fluxo C (Delete): `handleConfirmDeletePayment` → `deleteCreditPayment` (guard + cleanup `sale_item_payments` + `financial_transactions` + `updateReceivableFromPayments`) → `notify` → `subscribe`
- Fluxo D (Debt manual): `handleRegisterDebt` → `buildManualDebtSale` → `addSale` (`soft-delete` na venda se `deleteSale`); `deleteSale` (FASE 4) limpa `credit_payments` + `sale_item_payments` + `financial_transactions`
- Nenhuma alteração aplicada.
- Status: concluído.
