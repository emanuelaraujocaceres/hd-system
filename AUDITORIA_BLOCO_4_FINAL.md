# BLOCO 4 — FUNÇÕES CRÍTICAS (AUDITORIA COMPLETA — NENHUMA ALTERAÇÃO NESTA RODADA)
- 13 funções auditadas: `handleRegisterPayment`, `handleItemPayment`, `handleConfirmDeletePayment`, `handleConfirmDeleteDebt`, `handleRegisterDebt`, `openDebtModal`, `filterOpenDebts`, `getSaleCreditAmount`, `getSaleDebtItems`, `buildManualDebtSale`, `canDeleteManualDebtSale`, `getPaymentsPreview`, `getSaleCreditAmount`
- `handleItemPayment`: `branchId` guard aplicado; `storeBranchId: branchId` aplicado; `saveSaleItemPayment` sincroniza com `upsertRow`
- `handleRegisterPayment`: `isItemPayment` NÃO definido nos `newPayments` (padrão `false` via `saveCreditPayment`); `totalPaid` corrigido (FASE 1) conta todos
- `getSaleCreditAmount`: corrigido (FASE 4) — `sale.payments` + `getCreditPayments()` fallback; `!cp.isItemPayment` NÃO mais usado no `getSaleCreditAmount`
- Nenhuma alteração aplicada além das já confirmadas.
- Status: concluído.
