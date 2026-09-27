# BLOCO 9 — INTEGRAÇÃO COM FINANCEIRO (AUDITORIA COMPLETA — NENHUMA ALTERAÇÃO NESTA RODADA)
- `FinanceView.tsx` (`l.545-548`): usa `getCreditPayments()` (sem filtro `isItemPayment`) para `manualCreditPayments`. `calculateFinanceSummary` (`lib/financeSummary.ts`) recebe `manualCreditPayments`. Nenhuma alteração aplicada.
- Divergência resolvida pela FASE 1 (`!isItemPayment` removido): `FiadosView` (`totalPaid`) e `FinanceView` (`manualCreditPayments`) agora concordam para `isItemPayment`.
- `financial_transactions` (`saveFinancialAccount`): criado no `handleRegisterPayment` e `handleItemPayment` (edição FASE 1 aplicada); removido no `deleteCreditPayment` (cleanup aplicado na FASE 3); removido no `deleteSale` (cleanup aplicado na FASE 4).
- Nenhuma alteração aplicada neste bloco.
- Status: concluído.
