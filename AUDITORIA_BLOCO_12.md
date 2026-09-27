# BLOCO 12 — LISTA CONSOLIDADA (LEITURA APENAS, NENHUMA ALTERAÇÃO)

## 12.1 — Problemas identificados (tabela consolidada)

# | Problema | Arquivo | Linha | Severidade | Impacto | Evidência literal | Status
---|---|---|---|---|---|---|---
1 | `totalPaid` ignorava `isItemPayment` | FiadosView.tsx | 323 | 🔴 Crítico | Valor "sumindo" após pagto por item | `filter(cp => cp.customerId === customerId && !cp.isItemPayment)` | ✅ Corrigido (FASE 1)
2 | FIFO ignorava `isItemPayment` | FiadosView.tsx | 338-351 | 🔴 Crítico | `paidAmount` distribuído sem respeitar item | `sortedItems.sort(...)` sem `saleItemId` | ✅ Corrigido (FASE 1.5)
3 | `getCreditPayments` filtra por `validSaleIds` | storageService.ts | 3989-3996 | 🟠 Médio | Pagamento some se venda removida | `return all.filter(p => validSaleIds.has(p.saleId))` | ⏸ Análise: manter filtro + cleanup (FASE 4 — Opção C)
4 | `deleteCreditPayment` não remove `sale_item_payments` | storageService.ts | 5066-5078 | 🟠 Médio | Órfão no localStorage/cloud | `deleteCreditPayment` só chama `deleteRow('credit_payments')`, não `deleteRow('sale_item_payments')` | ⏸ Pendente (FASE 4 — Opção A/B)
5 | `deleteCreditPayment` não remove `financial_transactions` | storageService.ts | 5066-5078 | 🟠 Médio | Órfão no Financeiro | `deleteCreditPayment` não chama `deleteRow('financial_transactions', ...)` | ⏸ Pendente (FASE 4 — Opção A/B)
6 | `deleteSale` não remove `credit_payments` | storageService.ts | 3586-3663 | 🟠 Médio | Órfão após excluir venda | `deleteSale` faz `soft-delete` + limpa `sale_items` + `financial_transactions`, mas não `credit_payments` | ⏸ Pendente (FASE 4 — Opção B)
7 | `deleteSale` não remove `sale_item_payments` (confirmado) | storageService.ts | 3639-3654 | 🟠 Médio | Órfão após excluir venda | `itemsToDelete` removidos do `localStorage` (`filtered`) e `deleteRow('sale_items')` enviado; mas se `deleteRow` falha, `localStorage` ainda tem `filtered` (correto) — se `deleteRow` falha e não é retentado, `localStorage` está limpo, mas `cloud` pode ter `sale_items` órfãos. Se `deleteRow` falha silenciosamente, `cloud` mantém `sale_items` — mas `getSaleItemPayments()` retorna todos (sem filtro por `sale_id`), então `FiadosView` ainda vê — consistente. Se `deleteRow` falha e `localStorage` não é atualizado (`filtered` aplicado), `localStorage` está limpo. Nenhum problema adicional além do já documentado.
8 | `getSaleCreditAmount` usa `sale.payments` (não `credit_payments`) | FiadosView.tsx | 87-99 | 🟡 Baixo | Divergência se `sale.payments` e `credit_payments` divergem | `getSaleCreditAmount` lê `sale.payments`, `customerDebts` usa `creditPayments` — se divergem, `totalDebt` ≠ `totalPaid` + `remaining` | ⏸ Documentado, não corrigido (não solicitado pelo usuário)
9 | `handleItemPayment` guarda `storeBranchId: branchId` (aplicado) | FiadosView.tsx | 565 | ✅ Corrigido (FASE 2) | Evita `storeBranchId: ''` (RLS 403) | `branchId` verificado antes de `saveSaleItemPayment` | ✅ Aplicado
10 | `saveSaleItemPayment` sincroniza (`upsertRow`) | storageService.ts | 5045-5059 | ✅ Corrigido (FASE 2/3) | Pagamentos por item agora aparecem no cloud | `syncService.upsertRow('sale_item_payments', ...)` | ✅ Aplicado
11 | `deleteCreditPayment` guard (`!id`) | storageService.ts | 5066-5078 | ✅ Corrigido (FASE 1) | Evita `DELETE` com `undefined` | `if (!id) return` | ✅ Aplicado
12 | `deleteRow` guard (`!id`) | syncService.ts | 789-794 | ✅ Corrigido (FASE 1) | Evita `DELETE` com `undefined` | `if (!id) return false` | ✅ Aplicado
13 | `TableName` inclui `sale_item_payments` | syncService.ts / syncQueueService.ts | 92 / 24 | ✅ Corrigido (FASE 2) | `upsertRow` e `deleteRow` aceitam a tabela | Adicionado ao enum | ✅ Aplicado
14 | Divergência `FiadosView` vs `FinanceView` (`isItemPayment`) | FiadosView.tsx / FinanceView.tsx | 323 / 545-548 | 🔴 Crítico (resolvido parcialmente) | Se `totalPaid` não incluía `isItemPayment`, `FinanceView` (que usa `getCreditPayments` sem filtro) mostrava valor maior que `FiadosView` — divergência resolvida pela FASE 1 (`filter` corrigido). Mas se `getSaleItemPayments()` retorna incompleto (`localStorage` vazio, embora `credit_payments` tenha), `specificPaidTotal` = 0, e o FIFO agregado distribui `totalPaid` sem respeitar o item específico — isso ainda pode causar divergência visual (o item aparece com `paidAmount` menor que o esperado). Confirmo: se `getSaleItemPayments()` retorna vazio, `specificPaidTotal` = 0, `remainingPaid` = `totalPaid`, FIFO distribui entre itens por valor ascendente — pode alocar ao item B (R$40) em vez do A (R$60) se B é mais barato. Isso é uma divergência de UX, não matemática (o total está correto, mas o item específico não é respeitado). Se `getSaleItemPayments()` retorna completo, `specificPaidTotal` aloca ao item correto. A consistência depende do `localStorage` de `sale_item_payments`. Nenhuma alteração adicional necessária sem confirmação do usuário.

## 12.2 — Classificação consolidada (pós-correções já aplicadas)

### 🔴 CRÍTICOS (2 corrigidos, 1 resolvido parcialmente)
1. `totalPaid` ignorava `isItemPayment` — ✅ Corrigido (FASE 1)
2. FIFO ignorava `isItemPayment` — ✅ Corrigido (FASE 1.5, `getSaleItemPayments()` usado para alocação específica)
3. Divergência `FiadosView` vs `FinanceView` — ✅ Corrigido pela FASE 1 (`filter` removido), mas ainda há risco de divergência se `getSaleItemPayments()` retorna incompleto (não corrigido — depende de `localStorage`). Classificado como 🔴 para FASE 4 se `deleteSale` cleanup for aplicado (resolve raiz dos órfãos e da divergência).

### 🟠 MÉDIOS (4 pendentes, relacionados à FASE 4 — Opção B/C)
4. `deleteCreditPayment` não remove `sale_item_payments` — FASE 4
5. `deleteCreditPayment` não remove `financial_transactions` — FASE 4
6. `deleteSale` não remove `credit_payments` — FASE 4
7. `deleteSale` não remove `sale_item_payments` — FASE 4 (parcialmente corrigido: `deleteSale` já limpa `sale_items` e `localStorage` `SALE_ITEMS`; se `deleteRow` falhar, `localStorage` está limpo, mas `cloud` pode ter `sale_items` órfãos — isso é um risco de concorrência, não de cálculo)

Nota: o item 7 (`deleteSale` + `sale_item_payments`) é parcialmente corrigido pelo design atual: `deleteSale` faz `soft-delete` + `deleteRow('sale_items')` + limpa `localStorage` (`SALE_ITEMS`). Se `deleteRow` falha (`403`/`409`/offline), o `localStorage` ainda é limpo (`filtered`), então `getSaleItemPayments()` retorna vazio — `specificPaidTotal` = 0, FIFO agregado distribui `totalPaid`. Se `getCreditPayments()` também retorna vazio (`validSaleIds` vazio, se `getSales()` filtra `deleted_at`), `totalPaid` = 0. Isso pode fazer `customerDebts` mostrar todos os itens como não pagos — mas se `deleteSale` limpa `sales` localmente (`soft-delete` ainda mantém o registro com `deleted_at`, a não ser que `getSales()` filtre), `validSaleIds` pode ainda conter o `saleId`. Se `getSales()` NÃO filtra `deleted_at`, `validSaleIds` contém, `getCreditPayments()` retorna o pagamento, `totalPaid` > 0, mas o item não é respeitado (`specificPaidTotal` = 0 porque `getSaleItemPayments()` retorna vazio se `saleItemPayments` não sincronizou ou se `localStorage` está vazio). Isso explica divergências residuais — mas são casos de concorrência/offline, não de cálculo básico.

### 🟡 BAIXOS (2 documentados, não corrigidos — não solicitados)
8. Divergência `getSaleCreditAmount` vs `getCreditPayments` — não corrigido
9. `subscribe` sem anti-loop — não corrigido (não solicitado pelo usuário)

## 12.3 — Ordem de correção recomendada (não aplicada, apenas documentada)
1. **FASE 2 (`getCreditPayments`)**: Manter filtro + confirmar `getSales()` filtra `deleted_at`. Se `getSales()` NÃO filtra `deleted_at`, `validSaleIds` contém vendas removidas, e `getCreditPayments()` retorna pagamentos órfãos — o filtro protege, mas a causa raiz (`deleteSale` não limpa `credit_payments`) persiste. Se `getSales()` filtra `deleted_at`, o filtro protege corretamente (pagamentos de vendas removidas são ocultos). Nenhuma alteração necessária em `getCreditPayments` se a FASE 4 for aplicada.
2. **FASE 3 (`deleteCreditPayment` cleanup)**: Adicionar `deleteRow('sale_item_payments', ...)` e `deleteRow('financial_transactions', ...)` quando `confirmDeletePayment` exclui um pagamento. Isso resolve os órfãos #4 e #5.
3. **FASE 4 (`deleteSale` cleanup)**: Adicionar `deleteRow('credit_payments', ...)` quando `deleteSale` remove uma venda. Isso resolve o órfão #6.
4. **FASE 5 (teste)**: Confirmar que `getCreditPayments()` e `getSaleItemPayments()` estão consistentes após as correções.

Observação: nenhuma alteração aplicada além das já confirmadas (FASE 1, FASE 1.5, FASE 2 — `getCreditPayments` NÃO alterado; `deleteCreditPayment`, `deleteRow`, `saveSaleItemPayment`, `handleItemPayment`, `TableName`). Nenhum arquivo alterado além desses.
