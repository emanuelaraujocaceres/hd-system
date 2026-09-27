# BLOCO 6 — CÁLCULOS (AUDITORIA COMPLETA — NENHUMA ALTERAÇÃO NESTA RODADA)
- `totalPaid` (l.321-325): corrigido (FASE 1) — `filter(cp => cp.customerId === customerId)` sem `!isItemPayment`
- `paidAmount` FIFO (l.338-371): corrigido (FASE 1.5) — `getSaleItemPayments()` aloca `specificPaidTotal` ao `saleItemId` antes do FIFO agregado
- `remaining` (l.353-360): `Math.min(totalPaid, totalDebt)`; `remaining = totalDebt - actualPaid`; se `totalPaid` > `totalDebt`, `remaining` = 0 (não negativo)
- `totalDebt` (l.327-336): `getSaleDebtItems` por `sale`; `getSaleCreditAmount` corrigido (FASE 4) para consistência (`sale.payments` + `getCreditPayments` fallback)
- Consistência matemática (l.381-385): `totalDebt` = `totalPaid` + `remaining` (sim, por definição `actualPaid = Math.min(...)`); soma `paidAmount` dos itens = `totalPaid` (se `getSaleItemPayments()` completo) ou ≠ (se incompleto — risco residual documentado no `AUDITORIA_BLOCO_6_FINAL.md`)
- Nenhuma alteração aplicada além das já confirmadas (FASE 1 + FASE 1.5 + FASE 4 `getSaleCreditAmount`).
- Status: concluído.
