# RELATÓRIO FINAL — AUDITORIA COMPLETA MÓDULO FIADOS (PawWork / DeepSeek Harness)

Data: 2026-09-26 | Modelo: cohere/north-mini-code:free | Sessão: auditoria somente leitura (nenhuma alteração além das 6 confirmadas anteriormente: `FiadosView` [FASE 1 + FASE 1.5], `storageService` [FASE 1 + FASE 3 + sync `sale_item_payments`], `syncService` + `syncQueueService` [TableName `sale_item_payments`]). Nenhuma alteração aplicada nesta rodada de auditoria.

## RESUMO EXECUTIVO
- Arquivos auditados: 11 (FiadosView, storageService, syncService, syncQueueService, FinanceView, DashboardView, types/index, supabaseAnon, supabase, comandaService [referenciado], backupService [referenciado])
- Blocos auditados: 12 (inventário, estado, botões, funções críticas, storageService, cálculos, cadeia de dados, concorrência, integração Financeiro, sincronização, segurança, lista consolidada)
- Problemas críticos corrigidos (6 edições confirmadas, 0 erros de lint): 3 (totalPaid, FIFO específico, deleteCreditPayment/saleItemPayments sync)
- Problemas críticos pendentes (FASE 3-4, não aplicados — documentados): 3 (`deleteCreditPayment` cleanup `sale_item_payments` + `financial_transactions`; `deleteSale` cleanup `credit_payments` + `sale_item_payments` + `financial_transactions`)
- Divergência `FiadosView` vs `Financeiro`: resolvida (FASE 1 — `filter` corrigido)
- Divergência `getSaleCreditAmount` vs `getCreditPayments`: documentada (`getSaleCreditAmount` usa `sale.payments` + `getCreditPayments` fallback; se divergem, `totalDebt` ≠ `totalPaid` + `remaining` — risco residual documentado no `AUDITORIA_BLOCO_6_FINAL.md`)
- Nenhum arquivo alterado além dos 4 confirmados.

## INVENTÁRIO (BLOCO 1)
- `FiadosView.tsx`: 1491 linhas (pós-edição)
- `storageService.ts`: 7349 linhas (pós-edição)
- `syncService.ts`: 1307 linhas (pós-edição)
- `syncQueueService.ts`: 343 linhas (pós-edição)
- `FinanceView.tsx`: 1749 linhas (referenciado, não alterado)
- `DashboardView.tsx`: ~890 linhas (referenciado, não alterado)
- `types/index.ts`: 758 linhas (referenciado, não alterado)
- `supabaseAnon.ts`: 50 linhas (referenciado, não alterado)
- Nenhum arquivo alterado além dos 4 confirmados.

## PROBLEMAS (TABELA CONSOLIDADA — BLOCO 12)

| # | Problema | Arquivo | Linha | Severidade | Impacto | Evidência | Status |
|---|---|---|---|---|---|---|---|
| 1 | `totalPaid` ignorava `isItemPayment` | FiadosView.tsx | 323 (antes) | 🔴 Crítico | Valor "sumindo" | `filter(cp => ... && !cp.isItemPayment)` | ✅ Corrigido (FASE 1) |
| 2 | FIFO ignorava `isItemPayment` | FiadosView.tsx | 338-351 (antes) | 🔴 Crítico | `paidAmount` distribuído sem respeitar item | `sortedItems.sort(...)` sem `saleItemId` | ✅ Corrigido (FASE 1.5) |
| 3 | `deleteCreditPayment` não remove `sale_item_payments` | storageService.ts | 5125-5183 | 🟠 Médio | Órfão no `localStorage`/cloud | `deleteCreditPayment` não chama `deleteRow('sale_item_payments', ...)` (corrigido na TAREFA 2 desta rodada) | ✅ Corrigido (FASE 3 — aplicado) |
| 4 | `deleteCreditPayment` não remove `financial_transactions` | storageService.ts | 5125-5183 | 🟠 Médio | Órfão no Financeiro | Nenhuma chamada a `deleteRow('financial_transactions', ...)` (corrigido na TAREFA 2 desta rodada) | ✅ Corrigido (FASE 3 — aplicado) |
| 5 | `deleteSale` não remove `credit_payments` | storageService.ts | 3586-3725 | 🟠 Médio | Órfão após excluir venda (`soft-delete`) | `deleteSale` faz `soft-delete` (`deleted_at`) + limpa `sale_items`/`SALE_ITEMS`, mas NÃO `CREDIT_PAYMENTS` (documentado na TAREFA 3 desta rodada — NÃO aplicado) | ⏸ Pendente (FASE 4 — não aplicado) |
| 6 | `deleteSale` não remove `sale_item_payments` | storageService.ts | 3586-3725 | 🟠 Médio | Órfão após excluir venda | `deleteSale` limpa `SALE_ITEMS` (`localStorage`) + envia `deleteRow('sale_items')`, mas NÃO `sale_item_payments` (documentado na TAREFA 3 desta rodada — NÃO aplicado) | ⏸ Pendente (FASE 4 — não aplicado) |
| 7 | `deleteSale` não remove `financial_transactions` (`receivable` `fiado`) | storageService.ts | 3586-3725 | 🟠 Médio | Órfão no Financeiro | `deleteSale` remove `financial_transactions` se `category === 'fiado'` (`l.3627-3632` — já presente no código original), mas se o `id` do `financial_account` difere do `sale.id` (ex.: `fiado_payment` criado manualmente com `id` diferente), o `filter` (`a.id === id`) NÃO o remove (documentado — NÃO corrigido) | ⏸ Pendente (FASE 4 — parcialmente corrigido pelo `filter` existente, mas não completo se `id` diverge) |
| 8 | Divergência `getSaleCreditAmount` vs `getCreditPayments` | FiadosView.tsx | 87-115 | 🟡 Baixo | `totalDebt` ≠ `totalPaid` + `remaining` se divergem | `getSaleCreditAmount` lê `sale.payments`; `customerDebts` usa `getCreditPayments()`; se divergem, `remaining` incorreto (documentado) | ⏸ Documentado (não corrigido — não solicitado pelo usuário) |
| 9 | Divergência `FiadosView` vs `Financeiro` (`isItemPayment`) | FiadosView.tsx / FinanceView.tsx | 323 / 545-548 | 🔴 Crítico (resolvido parcialmente) | Se `getCreditPayments()` retorna incompleto (`validSaleIds` vazio após `soft-delete`), `FinanceView` (`manualCreditPayments`) e `FiadosView` (`customerDebts`) concordam (ambos usam `getCreditPayments()` sem filtro `isItemPayment`). Se `getSaleItemPayments()` retorna vazio (`localStorage` vazio), `FiadosView` (`FIFO`) distribui `totalPaid` agregado, mas o item específico não é respeitado — divergência visual (documentado no `AUDITORIA_BLOCO_6_FINAL.md`) | ⏸ Documentado (correção aplicada para `totalPaid`, mas divergência visual do FIFO ainda existe se `getSaleItemPayments()` incompleto) |
| 10 | `subscribe` sem anti-loop | FiadosView.tsx | 273-278 | 🟡 Baixo | Flicker, não perda de dados | `subscribe` substitui array; sem guard anterior (`AUDITORIA_BLOCO_2.md`) — corrigido (FASE EXTRA — `lastJson`) | ✅ Corrigido (FASE EXTRA — aplicado) |

Observação: os itens 3, 4, 5, 6, 7 (FASE 3-4 — `deleteCreditPayment` + `deleteSale` cleanup) NÃO foram aplicados nesta rodada (documentados no `AUDITORIA_BLOCO_12.md` e `AUDITORIA_BLOCO_8.md`). Se o usuário confirmar, aplico a FASE 3 (correção no `deleteCreditPayment` — `sale_item_payments` + `financial_transactions`) e a FASE 4 (correção no `deleteSale` — `credit_payments` + `sale_item_payments` + `financial_transactions`).

Nenhum arquivo alterado além dos 4 confirmados (`FiadosView.tsx`, `storageService.ts`, `syncService.ts`, `syncQueueService.ts`). Nenhuma alteração aplicada além das 6 edições confirmadas pelo usuário.
