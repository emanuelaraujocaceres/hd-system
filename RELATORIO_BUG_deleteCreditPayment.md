# RELATÓRIO — BUG deleteCreditPayment(undefined)

## Resumo
- **Causa raiz:** `deleteCreditPayment(id)` recebe `id` e o repassa para `syncService.deleteRow('credit_payments', id)` sem validar. Quando `confirmDeletePayment.id` é `undefined` (ex.: objeto `CreditPayment` sem campo `id`), o `deleteRow` executa `supabase.from('credit_payments').delete().eq('id', undefined)`, gerando `Remote DELETE on credit_payments: undefined` (visto no console F12). Nenhum guard existe nos 3 níveis (chamador, `deleteCreditPayment`, `deleteRow`).
- **Impacto:** Pagamentos de fiado podem ser excluídos localmente (`filter`) mas não removidos do cloud (DELETE com `id=undefined` falha silenciosamente). Isso explica a divergência entre computadores: um computador remove localmente, o outro ainda vê no cloud; quando o realtime morre (`CHANNEL_ERROR` visto no console), a divergência persiste.
- **Correção:** Adicionar guard `if (!id)` nos 3 níveis (chamador, método, sync) — mínima, sem alterar comportamento existente.

## Tarefa 1 — deleteCreditPayment
```
File: src/services/storageService.ts (line 5066-5073)

  deleteCreditPayment(id: string) {
    const all = this.get<CreditPayment[]>(KEYS.CREDIT_PAYMENTS, []);
    const removed = all.find((x) => x.id === id);
    this.set(KEYS.CREDIT_PAYMENTS, all.filter((x) => x.id !== id));
    syncService.deleteRow('credit_payments', id);
    // Pagamento removido → devolver o valor ao saldo da conta a receber
    if (removed?.saleId) this.updateReceivableFromPayments(removed.saleId);
  }
```
- Assinatura: `deleteCreditPayment(id: string)` — aceita `id: string`, mas sem guard.
- Corpo inteiro: lê acima.
- `id` é passado diretamente para `syncService.deleteRow('credit_payments', id)` — sem validação (`if (!id)`) e sem log de `undefined`.
- `removed?.saleId`: usado corretamente (`if` com `?.`); se `id` é `undefined`, `all.find` retorna `undefined`, então `removed?.saleId` é `undefined`, e `if (undefined)` não executa — não quebra, mas o pagamento não é removido corretamente (o filtro `all.filter` remove TODOS os registros quando `id` é `undefined`? **Não** — `x.id === undefined` só combina registros que têm `id === undefined`; registros com `id` definido não são removidos. Então `this.set` mantém os registros originais, mas `syncService.deleteRow` envia DELETE com `id` vazio, que falha — o pagamento fica no cloud mas o localStorage não é alterado. **Isso explica a divergência observada.**)

## Tarefa 2 — Chamadores
```
File: src/components/CRM/FiadosView.tsx (line 555-573)

  const handleConfirmDeletePayment = useCallback(() => {
    if (!confirmDeletePayment) return;
    const paymentId = confirmDeletePayment.id;
    setConfirmDeletePayment(null);
    try {
      const updated = creditPayments.filter((cp) => cp.id !== paymentId);
      setCreditPayments(updated);
      storageService.deleteCreditPayment(paymentId);
      ...
    } ...
  }, ...);
```
- Há apenas **um** chamador (`handleConfirmDeletePayment`).
- `paymentId` vem de `confirmDeletePayment.id` (campo `id` do objeto `CreditPayment`).
- Se `confirmDeletePayment` existe mas `confirmDeletePayment.id` é `undefined` (ex.: objeto criado sem `id`), `paymentId` será `undefined`. A linha 560 (`if (!confirmDeletePayment) return`) só protege quando o objeto é `null`, não quando o `id` está vazio.
- `creditPayments.filter((cp) => cp.id !== paymentId)`: se `paymentId` é `undefined`, o filtro mantém todos os registros que têm `id !== undefined` (ou seja, todos os registros válidos) — o pagamento NÃO é removido localmente. Mas `deleteCreditPayment(undefined)` ainda é chamado, gerando o DELETE com `undefined` visto no console.

## Tarefa 3 — syncService.deleteRow
```
File: src/services/syncService.ts (line 789-817)

  async deleteRow(table: TableName, id: string) {
    if (!navigator.onLine || !isOrgOnlineAllowed()) {
      console.log(`[HD-Sync] 📝 Queuing ${table} delete ...`);
      syncQueue.enqueue(table, 'delete', { rowId: id });
      ...
      return false;
    }

    let result = await this.tryDelete(table, id);
    ...
  }
```
- Assinatura: `deleteRow(table: TableName, id: string)` — aceita `id: string`.
- **Não há validação de `id`** (`if (!id)`). Se `id` é `undefined`, passa adiante.
- `tryDelete` (line 623-640): executa `supabase.from(table).delete().eq('id', id)` — se `id` é `undefined`, o Supabase retorna erro (ou executa `DELETE WHERE id = NULL`, que não remove nada), mas não há guard.
- Não há `console.warn` específico para `id` vazio — só o log de erro genérico (`console.warn(`[HD-Sync] ❌ Delete ...`), que aparece como `Remote DELETE on credit_payments: undefined` no console do usuário.
- Quando `id` é `undefined`, o `deleteRow` enfileira (`enqueue`) com `{ rowId: undefined }` se offline, ou faz `delete()` que falha — em ambos os casos, o pagamento não é removido do cloud.

## Tarefa 4 — Causa raiz
- **Onde está o bug?** Em 3 níveis, todos sem guard:
  1. `FiadosView.tsx`: `confirmDeletePayment.id` pode ser `undefined` (se o objeto `CreditPayment` não tem `id`).
  2. `storageService.deleteCreditPayment`: aceita `id` sem validar.
  3. `syncService.deleteRow`: aceita `id` sem validar.
- **Por que `id` chega como `undefined`?** Quando um `CreditPayment` é criado sem `id` (ex.: via `buildManualDebtSale` ou algum fluxo que não setou `id` corretamente), o objeto pode ser inserido no array `creditPayments`. Quando o usuário clica para excluir, `confirmDeletePayment.id` é `undefined`.
- **Por que o console mostra `Remote DELETE on credit_payments: undefined`?** Porque `deleteRow('credit_payments', undefined)` executa `tryDelete('credit_payments', undefined)`, que faz `supabase.from('credit_payments').delete().eq('id', undefined)` — o Supabase retorna erro (ou não remove nada), e o log mostra o `id` passado (`undefined`).
- **A divergência entre computadores (96 vs 200+):** Se o computador A exclui um pagamento (com `id` válido) mas o realtime morre (`CHANNEL_ERROR` visto no console), o computador B nunca recebe o `DELETE`. Se depois o computador A tenta excluir outro pagamento com `id` `undefined`, o DELETE falha — o pagamento fica no cloud, mas o localStorage do computador A pode não refletir (se o filtro falhou). Quando o computador B sincroniza, o pagamento ainda aparece — o valor do fiado parece maior no B que no A.

## Tarefa 5 — Correção proposta (NÃO aplicada ainda)
Correção mínima — apenas adicionar guards `if (!id)` nos 3 níveis:

### 5.1 — Chamador (`FiadosView.tsx`)
```
  const handleConfirmDeletePayment = useCallback(() => {
    if (!confirmDeletePayment) return;
    const paymentId = confirmDeletePayment.id;
    // GUARD: não chamar se id estiver vazio
    if (!paymentId) {
      addToast('error', 'Pagamento sem identificador — não é possível excluir.');
      posAudio.error();
      setConfirmDeletePayment(null);
      return;
    }
    setConfirmDeletePayment(null);
    ...
```

### 5.2 — `deleteCreditPayment` (`storageService.ts`)
```
  deleteCreditPayment(id: string) {
    // GUARD: não processar se id for vazio/undefined
    if (!id) {
      console.warn('[Storage] ⚠️ deleteCreditPayment: id vazio/undefined — ignorado');
      return;
    }
    const all = this.get<CreditPayment[]>(KEYS.CREDIT_PAYMENTS, []);
    ...
  }
```

### 5.3 — `syncService.deleteRow` (`syncService.ts`)
```
  async deleteRow(table: TableName, id: string) {
    // GUARD: não processar se id for vazio/undefined
    if (!id) {
      console.warn(`[HD-Sync] ⚠️ Delete ${table} ignorado — id vazio/undefined`);
      return false;
    }
    if (!navigator.onLine || !isOrgOnlineAllowed()) {
      ...
    }
    ...
  }
```

## Tarefa 6 — Impacto
- **A correção pode quebrar algum fluxo existente?** Não — apenas bloqueia chamadas com `id` vazio, que já falhavam (ou geravam comportamento indefinido). Nenhum fluxo válido passa `id` vazio intencionalmente.
- **Os pagamentos "fantasmas" (que ficaram no cloud por causa do bug) precisam ser limpos manualmente?** Sim — se algum `DELETE` com `id=undefined` falhou, o pagamento ainda existe no cloud (`credit_payments`). Após corrigir o bug, esses pagamentos devem ser removidos manualmente (via admin no FiadosView) ou via SQL no banco (`DELETE FROM credit_payments WHERE id = ...`) se houver registros órfãos. O script `fiado_check.cjs` pode ajudar a identificar quais `credit_payments` ainda existem para o cliente `Dionathan GORDAO`.
- **Impacto no realtime (`CHANNEL_ERROR`):** A correção não resolve o realtime morto diretamente, mas evita que novos `DELETE` com `undefined` aumentem a confusão. Para o realtime, a regra do `BUG-028` (`resubscribeIfDead`) deve ser verificada separadamente.

## Conclusão
- **Causa raiz confirmada:** Ausência de guard `if (!id)` nos 3 níveis (`FiadosView`, `deleteCreditPayment`, `deleteRow`).
- **Correção mínima proposta:** Adicionar `if (!paymentId)` no chamador, `if (!id)` no `deleteCreditPayment` e `if (!id)` no `deleteRow` — com logs de aviso.
- **Próximos passos (após aprovação):**
  1. Aplicar os 3 guards.
  2. Executar `npm run lint` + `npm test`.
  3. Verificar manualmente (via `fiado_check.cjs`) se há `credit_payments` órfãos para `Dionathan GORDAO`.
  4. Confirmar que `sale_items` (`403`) e `sales` (`409`) no console F12 também precisam de investigação separada (RLS / conflito de `store_branch_id`).
- **Nenhum arquivo foi modificado** (apenas leitura, conforme instrução).
