# RELATÓRIO — FASE 2 (getCreditPayments — Análise, NÃO Aplicada)

## Tarefa 2.1 — getCreditPayments (trecho literal)
`src/services/storageService.ts:3989-3996`:
```typescript
  getCreditPayments(): CreditPayment[] {
    const all = this.get<CreditPayment[]>(KEYS.CREDIT_PAYMENTS, []);
    // Filtra por vendas que pertencem à org atual
    // CreditPayment usa camelCase (saleId), não snake_case (sale_id)
    const sales = this.getSales();
    const validSaleIds = new Set(sales.map(s => s.id));
    return all.filter(p => validSaleIds.has(p.saleId));
  }
```
- **Propósito original:** evitar mostrar pagamentos de vendas removidas (órfãos) — filtro defensivo.
- **Problema (BUG-005/BUG-035):** se uma venda é removida (`deleteSale`) mas o `credit_payment` persiste (por falta de cleanup no `deleteSale`), o pagamento some do `FiadosView`. Se o usuário recarrega, o pagamento parece "desaparecer" — mas ele ainda existe no `localStorage` e no cloud.

## Tarefa 2.2 — Análise de impacto (sem modificar)

**Uso de getCreditPayments:**
- `FiadosView.tsx:249` — `useState` inicial
- `FiadosView.tsx:275` — `subscribe` listener
- `FinanceView.tsx:546` — `manualCreditPayments` (para `calculateFinanceSummary`)
- `DashboardView.tsx:189` — `sumManualDebtReceived`

**Se o filtro for removido:**
- Pagamentos órfãos (vinculados a vendas removidas) apareceriam no `FiadosView` e no `FinanceView`.
- `FiadosView`: `customerDebts` agrupa por `customerId`; se `saleId` não existe, `custSales` (do `sales.filter`) não incluiria a venda, mas `creditPayments` ainda teria o pagamento — `totalPaid` seria maior que `totalDebt` para aquele cliente (se não houver outras vendas), gerando `remaining` negativo (corrigido pelo `Math.min` em l.353, mas ainda estranho).
- `FinanceView`: `manualCreditPayments` seria usado no cálculo; pagamentos órfãos aumentariam `manualDebtReceived` sem venda correspondente — divergência.

**Se o filtro for mantido mas com cleanup automático (Opção C):**
- Quando `deleteSale` é chamado (Fase 4 pendente), `deleteSale` também removeria os `credit_payments` vinculados.
- Assim, o filtro `validSaleIds` nunca encontraria órfãos (porque eles seriam removidos), e não haveria "sumiço".
- Esta é a opção mais segura e alinhada com a decisão do usuário (Opção B para Fase 4 = cleanup completo).

## Tarefa 2.3 — Opções de correção (NÃO aplicada)

### Opção A — Remover o filtro (mais simples)
- **Prós:** pagamentos nunca somem; simples (1 linha removida).
- **Contras:** pagamentos órfãos aparecem; `FiadosView` pode mostrar `totalPaid > totalDebt` (se a venda foi removida mas o pagamento persiste); `FinanceView` conta pagamentos sem venda correspondente, criando divergência com vendas existentes.
- **Segurança:** BAIXA — pode introduzir novos problemas.

### Opção B — Manter filtro + marcar órfão (não modifica comportamento atual)
- **Prós:** não quebra nada; apenas documenta.
- **Contras:** não resolve o "sumiço"; se o usuário espera ver o pagamento após excluir a venda (ex.: venda cancelada mas ainda precisa registrar o pagamento), ele não aparece.
- **Segurança:** ALTA — nenhuma mudança funcional.

### Opção C — Manter filtro + cleanup automático no deleteSale (Fase 4)
- **Prós:** resolve a causa raiz; se a venda é removida, os pagamentos também são; nunca haverá órfãos; o filtro `validSaleIds` funciona corretamente sem "sumiço".
- **Contras:** requer alteração no `deleteSale` (Fase 4 pendente) — precisa ser feita com cuidado para não quebrar outros fluxos.
- **Segurança:** ALTA (se feita corretamente) — alinha com a decisão do usuário (Opção B para Fase 4).

## Tarefa 2.4 — Recomendação
**Recomendação: Opção C** — manter o filtro `validSaleIds` (não modificar `getCreditPayments`) e corrigir a causa raiz no `deleteSale` (Fase 4). Isso evita "sumiço" (porque não haverá órfãos após cleanup) e não introduz divergência no `FiadosView` ou `FinanceView`.

Se o usuário preferir uma solução imediata sem esperar a Fase 4: **Opção B** (não modificar `getCreditPayments` agora, apenas documentar que o filtro protege contra órfãos, mas a causa raiz é a falta de cleanup no `deleteSale`).

## Aguardando Aprovação
⏸️ NÃO modifiquei `getCreditPayments`. Aguardando: Opção A, B ou C?

Se a escolha for C: confirmo e prosseguimos para a Fase 4 (`deleteSale` + cleanup) sem alterar `getCreditPayments`.
Se a escolha for A: confirmo e removo o filtro.
Se a escolha for B: confirmo e deixo como está (filtro mantido, Fase 4 corrigirá a raiz).
