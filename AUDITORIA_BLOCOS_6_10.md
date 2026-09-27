# BLOCO 6 — Auditoria de Cálculos

## 6.1 — Cálculo do paidAmount por item (evidência literal)
`FiadosView.tsx:338-351`:
```typescript
      let remainingPaid = totalPaid;
      const sortedItems = [...allItems].sort((a, b) => a.total - b.total);
      for (const item of sortedItems) {
        if (remainingPaid <= 0) break;
        const apply = Math.min(remainingPaid, item.total);
        item.paidAmount = Math.round(apply * 100) / 100;
        remainingPaid = Math.round((remainingPaid - apply) * 100) / 100;
      }
      allItems.sort((a, b) => b.total - a.total);
```
`allItems` vem de `getSaleDebtItems(sale)` (l.109-154). `paidAmount` é atribuído ao item no array `allItems`. `sale_item_payments` NÃO é lido para calcular `paidAmount` — apenas `creditPayments` (via `totalPaid`) alimenta o FIFO.

## 6.2 — FIFO (evidência literal)
`FiadosView.tsx:338`: "FIFO allocation of payments across items (oldest sale first, cheapest item first)".
O FIFO ordena itens por `a.total - b.total` (cheapest first). Não considera `saleId` para ordenação de itens dentro do mesmo cliente — o loop externo é por `custSales.sort(...)` (oldest first, l.319), e o loop interno é por item (cheapest first, l.341). Se um pagamento é feito por item (`isItemPayment: true`), ele NÃO entra no `remainingPaid` (excluído pelo filtro `!cp.isItemPayment`, l.323), então o FIFO NÃO distribui esse pagamento — o item fica com `paidAmount = 0`.

## 6.3 — Consistência matemática (evidências literais)
`customerDebts` (l.355-363):
```typescript
        totalDebt: Math.round(totalDebt * 100) / 100,
        totalPaid: Math.round(actualPaid * 100) / 100,
        remaining: Math.round((totalDebt - actualPaid) * 100) / 100,
```
`actualPaid = Math.min(totalPaid, totalDebt)` (l.353).
`totalPaid` (l.325) = `customerPayments` (sem `isItemPayment`).
Portanto, se existe `isItemPayment`, `totalPaid` é subestimado, `actualPaid` também, e `remaining` fica maior que o real. A equação `totalDebt = totalPaid + remaining` quebra quando `isItemPayment` existe.
`paidAmount` dos itens = distribuição do `totalPaid` (FIFO). Se `totalPaid` está errado, `paidAmount` também fica errado.

## 6.4 — Cenário de teste (simulado com código)
Venda: itens R$60 + R$40 = totalDebt R$100.
Pagamento por item: `saveSaleItemPayment({saleItemId: 'prod-60', ..., amount: 50})` → `creditPayments` recebe `{..., isItemPayment: true, amount: 50, saleId: 'venda-id'}`.
No `customerDebts`: `customerPayments.filter(!isItemPayment)` → retorna `[]` (ou apenas outros FIFO, sem o 50 do item).
`totalPaid` = 0 (ou valor sem o 50).
`remainingPaid` = 0.
`paidAmount` para item R$60 = 0 (não 50).
`remaining` = R$100 (não R$50).
`isItemPaid` = false para todos os itens.
**Resultado: valor "sumiu" — o pagamento não é refletido no card.**

# BLOCO 7 — Auditoria de Concorrência e Realtime

## 7.1 — useEffect listener (evidência literal)
`FiadosView.tsx:273-278`:
```typescript
  useEffect(() => {
    const unsub = storageService.subscribe(() => {
      setCreditPayments(storageService.getCreditPayments());
    });
    return () => { unsub(); };
  }, []);
```
Sempre substitui `creditPayments` pelo retorno de `getCreditPayments()`. Sem guard anti-duplicação — se `notify()` dispara 2x, `setCreditPayments` roda 2x (mesmo valor, sem duplicação de array).

## 7.2 — Análise de duplicação
- `subscribe` (storageService) chama todos os listeners. Se o `notify()` é chamado pelo `saveCreditPayment` (l.5009 no storageService — `this.set` + `this.notify()`), o listener atualiza.
- Se o Realtime entrega o INSERT (`updateCreditPaymentFromRemote` no storageService), ele atualiza `localStorage` e chama `notify()` também. O listener roda de novo com o mesmo valor — sem duplicação de registros no array.
- Se o `saleId` não estiver em `validSaleIds` (`getCreditPayments`, l.3995), o pagamento é filtrado — pode "sumir" se a venda for removida.

## 7.3 — Filtro `getCreditPayments` (evidência literal)
`storageService.ts:3989-3996`:
```typescript
  getCreditPayments(): CreditPayment[] {
    const all = this.get<CreditPayment[]>(KEYS.CREDIT_PAYMENTS, []);
    const sales = this.getSales();
    const validSaleIds = new Set(sales.map(s => s.id));
    return all.filter(p => validSaleIds.has(p.saleId));
  }
```
Se `p.saleId` aponta para uma venda removida (`deleteSale`), o pagamento é filtrado — "sumiço" de pagamentos legítimos. Se `saleId` é `undefined` (ex.: pagamento sem venda vinculada, ou `isItemPayment` com `saleId` vazio), `validSaleIds.has(undefined)` retorna `false` — o pagamento também some.

# BLOCO 8 — Inconsistências Específicas (SIM/NÃO com evidência)

## 8.1 — Pagamento por cliente (FIFO)
- totalPaid conta FIFO? SIM (`filter(!isItemPayment)`, mas se só há FIFO, conta corretamente)
- remaining recalcula? SIM (`remaining = totalDebt - actualPaid`)
- Se recarregar a página, valor é o mesmo? SIM (se o cloud sincronizou; se não, diverge)

## 8.2 — Pagamento por item
- totalPaid conta? **NÃO** (`!cp.isItemPayment`, l.323) — **PROBLEMA CRÍTICO**
- paidAmount do item conta? SIM (visualmente no card, via FIFO no `allItems`)
- remaining recalcula? **ERRADO** (porque `totalPaid` está subestimado)
- Se recarregar, valor é o mesmo? **DEPENDE** — se o cloud tem o `credit_payment` e a venda, `getCreditPayments` retorna; se `saleId` não existe (ex.: venda removida), o pagamento some.

## 8.3 — Exclusão de pagamento
- credit_payment removido do cloud? SIM (`deleteRow`, l.789, agora com guard)
- sale_item_payment removido? **PROVAVELMENTE NÃO** — `deleteCreditPayment` não chama `deleteSaleItemPayment`
- financial_account removido? **PROVAVELMENTE NÃO** — `deleteCreditPayment` não remove `financial_account`
- Se recarregar, órfãos ficam? SIM — `sale_item_payments` e `financial_transactions` permanecem

## 8.4 — Exclusão de dívida manual
- credit_payment vinculado removido? **PROVAVELMENTE NÃO** — `deleteSale` (l.3685) não remove `credit_payments`
- financial_account removido? **PROVAVELMENTE NÃO** — `deleteSale` não remove `financial_transactions`
- Se recarregar, órfãos ficam? SIM

## 8.5 — Filtro `getCreditPayments`
- Se `saleId` não existe, pagamento é filtrado? SIM (`validSaleIds.has(p.saleId)` retorna false)
- Isso pode causar "sumiço" de pagamentos legítimos? SIM — se a venda é removida (`deleteSale`) mas o pagamento persiste no `localStorage` ou cloud

# BLOCO 9 — Auditoria Cruzada com Financeiro

## 9.1 — Financeiro vê pagamentos por item?
`FinanceView.tsx:545-548`: usa `getCreditPayments()` (sem filtro `isItemPayment`). `manualCreditPayments` é passado para `calculateFinanceSummary` (l.548). Os pagamentos por item (`isItemPayment: true`) são incluídos no cálculo do Financeiro (não há filtro contrário). Se `saveFinancialAccount` é chamado no `handleItemPayment` (edição 3 aplicada), o `financial_account` é criado com `category: 'fiado_payment'`. Se `deleteCreditPayment` é chamado mas `deleteFinancialAccount` NÃO é chamado, o registro no Financeiro fica órfão.

## 9.2 — Consistência Financeiro vs Fiados
- Se pagamento é feito por item: aparece no Financeiro? SIM (se `saveFinancialAccount` funciona)
- Se pagamento é excluído: desaparece do Financeiro? **PROVAVELMENTE NÃO** — `deleteCreditPayment` não remove `financial_account`
- Divergência: `FiadosView` mostra `remaining` maior (porque `totalPaid` ignora `isItemPayment`), enquanto `FinanceView` pode contar o pagamento (se `manualCreditPayments` inclui `isItemPayment`). Isso cria divergência entre os dois módulos para o mesmo cliente.

# BLOCO 10 — Resumo Consolidado

| # | Problema | Arquivo | Linha | Severidade | Impacto |
|---|---|---|---|---|---|
| 1 | `totalPaid` ignora `isItemPayment` | FiadosView.tsx | 323 | 🔴 Crítico | Valor "sumindo" após pagamento por item |
| 2 | `paidAmount` FIFO não considera `isItemPayment` | FiadosView.tsx | 338-351 | 🔴 Crítico | Distribuição incorreta |
| 3 | `getCreditPayments` filtra por `validSaleIds` | storageService.ts | 3989-3996 | 🟠 Médio | Pagamento "some" se venda removida |
| 4 | `sale_item_payments` órfão ao excluir pagamento | storageService.ts | ~5066 | 🟠 Médio | Lixo acumula |
| 5 | `financial_account` órfão ao excluir pagamento | storageService.ts | ~5066 | 🟠 Médio | Lixo acumula |
| 6 | `credit_payments` órfão ao excluir dívida | storageService.ts | ~deleteSale | 🟠 Médio | Lixo acumula |
| 7 | `subscribe` sem anti-loop (sem duplicação, mas sem guard) | FiadosView.tsx | 273-278 | 🟡 Baixo | Flicker, não perda |
| 8 | Divergência `FiadosView` vs `FinanceView` para `isItemPayment` | FiadosView.tsx / FinanceView.tsx | 323 / 545 | 🔴 Crítico | Valores diferentes para mesmo cliente |

## Recomendação de ordem de correção
1. **Crítico**: Corrigir `customerPayments.filter` para incluir `isItemPayment` (ou criar cálculo separado) — resolver o valor "sumindo".
2. **Crítico**: Garantir que `paidAmount` do FIFO reflita pagamentos por item corretamente.
3. **Médio**: Limpar `sale_item_payments` e `financial_transactions` ao excluir pagamentos/dívidas.
4. **Médio**: Verificar se `getCreditPayments` precisa de guard quando `saleId` não existe.
5. **Baixo**: Adicionar anti-loop no `subscribe` se necessário.

## Perguntas para o usuário
- Deseja que eu corrija o cálculo do `totalPaid` para incluir `isItemPayment`?
- Deseja que o `sale_item_payments` seja removido ao excluir o pagamento correspondente?
- Deseja que o `financial_account` seja removido ao excluir o pagamento?
- Confirmo que a auditoria NÃO modificou nenhum arquivo (apenas `AUDITORIA_FIADOS.md` criado).
