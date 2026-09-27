# BLOCO 8 — CONCORRÊNCIA E REALTIME (LEITURA APENAS, EVIDÊNCIAS LITERAIS)

## 8.1 — subscribe / notify (evidência literal)
`FiadosView.tsx:273-278`:
```typescript
  useEffect(() => {
    const unsub = storageService.subscribe(() => {
      setCreditPayments(storageService.getCreditPayments());
    });
    return () => { unsub(); };
  }, []);
```
`storageService.ts:273` (subscribe): retorna `unsubscribe`. `notify()` (l.551): fila debounced, dispara todos os listeners com `getCreditPayments()`.
- Sem anti-loop — se `notify()` dispara 2x rapidamente, `subscribe` chama `getCreditPayments()` 2x; `setCreditPayments` substitui o array (não soma), sem duplicação de valores, mas pode causar flicker.
- Se `getCreditPayments()` retorna vazio (por `validSaleIds` vazio — ex.: `getSales()` retorna vazio após `localStorage.clear()`), `creditPayments` fica vazio, e `customerDebts` calcula `totalPaid` = 0, `remaining` = `totalDebt` — todos os clientes aparecem como não pagos. Isso explica o sintoma do usuário: valores que "desaparecem" após algum evento (limpeza de localStorage, troca de filial, sessão expirada que impede `getSales()` de carregar).

## 8.2 — Realtime (evidência literal, não auditado integralmente)
`App.tsx`: `resubscribeIfDead` mencionado no documento `AGENTS.md` (referência `BUG-028`). `syncService.ts`: `subscribeRealtime()` (não auditado integralmente, mas confirmado como existente). `syncService.ts`: `handleRealtimeEvent` (não lido integralmente, mas confirmado pelo grep `realtime` no arquivo).
- Se o canal Realtime morre (`CHANNEL_ERROR`), `App.tsx` tenta reconectar (`resubscribeIfDead`). Se falhar, o `subscribe` no `FiadosView` só atualiza via `notify()` do `localStorage`, não via Realtime — valores de outros dispositivos não aparecem até reconexão.
- Se `notify()` é chamado mas `subscribe` está morto (porque `unsub()` foi chamado, ex.: componente desmontado), não há efeito.

## 8.3 — Cenários de concorrência (simulados, sem alteração)

**Cenário: dois dispositivos, pagamento simultâneo**
- Disp. A: clique "Pagar" → `handleItemPayment` → `saveSaleItemPayment` → `this.set` (localStorage A) + `notify()` (A) + `upsertRow` (Supabase). Se `upsertRow` retorna `ok`, `subscribe` no A atualiza. Se `upsertRow` falha (`403`/`409`), `syncQueue` enfileira (`enqueue`), `notify()` ainda dispara, `subscribe` atualiza o localStorage com o valor local (não o cloud). Se o cloud tem o valor antigo (porque `upsertRow` falhou), `getCreditPayments()` retorna o valor local (que pode ser mais recente que o cloud, mas se o cloud nunca recebeu, não há conflito — apenas divergência se outro dispositivo fez o pagamento antes).
- Disp. B: se o pagamento já existe no cloud (porque A conseguiu sincronizar), `upsertRow` com `onConflict: 'id'` atualiza (não duplica). `getCreditPayments()` retorna com o pagamento atualizado (mesmo `id`, `amount` pode ser o mesmo). `customerDebts` calcula `totalPaid` com o valor atualizado — sem duplicação.
- Se `upsertRow` falha silenciosamente (ex.: `storeBranchId` vazio, RLS bloqueia), `syncQueue` guarda, mas `notify()` dispara com o valor local. `FiadosView` mostra o pagamento, mas o cloud não tem. Quando B carrega, `getCreditPayments()` retorna sem o pagamento (se `validSaleIds` ainda contém a venda) ou com o pagamento antigo (se A conseguiu sincronizar). Se A nunca sincronizou, B não vê o pagamento — divergência.

**Cenário: pagamento enquanto venda é removida em outro dispositivo**
- Se `deleteSale` (Fase 4 pendente) remove a venda mas NÃO o `credit_payment`, `getCreditPayments()` ainda retorna o pagamento (se `validSaleIds` ainda contém o `saleId` — mas `deleteSale` faz `soft-delete`, então `getSales()` ainda retorna a venda? Se sim, `validSaleIds` ainda contém, e o pagamento persiste — sem "sumiço". Se `getSales()` filtra `deleted_at`, o pagamento some — "sumiço". Isso depende de como `getSales()` funciona, que não foi auditado integralmente nesta sessão).
- Se `deleteSale` remove a venda (hard delete — não é o caso, é soft-delete) e NÃO limpa `credit_payments`, `validSaleIds` fica vazio para aquele `saleId`, e `getCreditPayments()` filtra o pagamento — "sumiço". Se `deleteSale` também limpa `credit_payments` (Fase 4 Opção B), não há "sumiço".

**Observação:** nenhuma alteração aplicada neste bloco.
