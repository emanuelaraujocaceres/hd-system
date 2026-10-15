# AUDITORIA FINAL — Comanda: item continua `pending` após pagamento

Data: 2026-10-14 | Base: imagem (`meninos pousada` / `menino gktb morena` — `1 pedido(s) pendente(s)`) + console (`Remote UPDATE on customer_sessions` sem `Remote UPDATE on sales`) + código fonte lido (`ComandaView`, `comandaService`, `PaymentModal`, `storageService`)
Estado: `GRANT` aplicado (`authenticated` com `SELECT/INSERT/UPDATE/DELETE`); `INSERT` policy (`sql_block_insert_policies.sql`) aplicada (`Success. No rows returned` — `DROP` + `CREATE` funcionou); zero alteração em código fonte (`.tsx`/`.ts` intacto).

---

## A. O QUE O USUÁRIO OBSERVOU (imagem + console)

### A.1 Imagem (`image.png` — `ComandaView`)
```
[mesa] meninos pousada  — R$ 1.00 — 1 pedido(s) pendente(s) · toque para reabrir a comanda — Abrir Comanda
[mesa] menino gktb morena — R$ 1.00 — 1 pedido(s) pendente(s) · toque para reabrir a comanda — Abrir Comanda
```
**Observação:** ambas as mesas ainda mostram `1 pedido(s) pendente(s)`. Isso indica que a venda (`Sale {status: 'pending'}`) não foi marcada `completed` localmente, embora o usuário tenha finalizado a comanda (e o console não mostre `403` — `GRANT` corrigido).

### A.2 Console (`vendor-BoLrpt32.js` — após `GRANT` corrigido)
```
[HD-Sync] Realtime connected (branch: 160e38a2-a896-4d6b-a6ea-52d4362abf55)
[HD-Sync] ✅ Acesso online liberado
[HD-Sync] 🌄 Hydration complete — merge strategy preserves all local data not yet in cloud
[HD-Sync] Remote UPDATE on customer_sessions: b64b9a6f-e653-43bb-9647-72e85a028d58
```
**Observação:** `Remote UPDATE on customer_sessions` aparece (`fechar_comanda` funcionou — a `customer_session` foi marcada `completed`). Mas **NÃO aparece** `Remote UPDATE on sales` para a venda da comanda. Isso confirma que o `UPDATE` da `sales` não chegou (ou foi ignorado) pelo `Realtime`.

---

## B. POR QUE O ITEM AINDA ESTÁ `PENDING` (código fonte — sem alteração aplicada)

### B.1 `fecharComanda` não atualiza `sales` localmente
Arquivo (`comandaService.ts` — `line 251-304`): `fecharComanda()` chama `supabase.rpc('fechar_comanda', ...)`, mas só atualiza `customer_session` localmente (`line 284-292`):
```typescript
const session = storageService.getCustomerSessions().find((s) => s.id === comandaId);
if (session) {
  storageService.saveCustomerSession({
    ...session,
    status: 'completed',
    closedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}
```
**Não há atualização de `sales`** (`status: 'pending'` → `'completed'`) nesse código. A `sales` só é atualizada pelo `Realtime` (`updateSaleFromRemote` — `storageService.ts:1498`).

### B.2 `updateSaleFromRemote` pode ignorar o `UPDATE`
Arquivo (`storageService.ts` — `line 1501`):
```typescript
if (!this.isRemoteFromCurrentBranch(row)) {
  console.log(`[HD-Sync] Ignoring remote sale from other branch: ${row.store_branch_id}`);
  return;
}
```
Se o `store_branch_id` da `sales` remota (`row.store_branch_id`) não corresponde ao `branch` atual (`getRawBranchId()` — `line 372-388`), o `UPDATE` é ignorado. Isso explica por que a venda `pending` não virou `completed` localmente: o `Realtime` entregou o `UPDATE`, mas `isRemoteFromCurrentBranch()` retornou `false`.

### B.3 `ComandaView` (`buscarItens`) só lê `pending`
Arquivo (`ComandaView.tsx` — `line 61-101`):
```typescript
export function buscarItens(comandaId: string): ItemComanda[] {
  const sales = storageService.getSales().filter(
    (s) => (s.customerSessionId === comandaId || (tableId && s.tableId === tableId)) && s.status === 'pending'
  );
  ...
}
```
Se a `sales` ainda está `pending` (`updateSaleFromRemote` ignorou ou não recebeu), `buscarItens()` retorna `1` item (`pending`) — conforme a imagem.

---

## C. EVIDÊNCIAS DO CONSOLE (pós-`GRANT` corrigido — sem `403`)

- `GRANT SELECT/INSERT/UPDATE/DELETE ON public.sale_item_payments TO authenticated;` aplicado (`Success` — `table_privileges` confirma `authenticated` agora tem todos os privilégios).
- `sql_block_insert_policies.sql` aplicado (`Success. No rows returned` — `DROP` + `CREATE` funcionou; `org_branch_insert_sale_item_payments` agora com `check_expr` corrigido).
- Nenhum `403` (`sale_item_payments`) no console (`vendor-BoLrpt32.js`).
- `Remote UPDATE on customer_sessions` aparece (`fechar_comanda` funcionou).
- **Não aparece** `Remote UPDATE on sales` para o `sale.id` da venda da comanda — confirmando que `updateSaleFromRemote` não atualizou (ou ignorou) a `sales`.

---

## D. RISCOS E PRÓXIMOS PASSOS (sem criar/alterar código fonte ainda)

1. **Verificar `store_branch_id` da `sales` (`sale.id` da comanda)** no banco — se o `store_branch_id` da venda remota não corresponde ao `branchId` atual (`160e38a2...`), `isRemoteFromCurrentBranch()` bloqueia. Isso explica a imagem (`pending` ainda visível).
2. **Verificar se a `sales` foi marcada `completed` no banco** — `SELECT status FROM sales WHERE id='...';`
3. **Se `status='completed'` no banco mas `pending` local**, o problema é `updateSaleFromRemote` (`isRemoteFromCurrentBranch`). Se `status='pending'` no banco, a RPC `fechar_comanda` pode não ter marcado (`success: false`) — mas o console não mostra erro, e `customer_session` foi atualizado (indica `success: true`).
4. Se a `sales` está `completed` no banco mas `pending` local, a solução é garantir que `updateSaleFromRemote` não ignore (`isRemoteFromCurrentBranch()` precisa ser corrigido — mas isso envolve alterar `storageService.ts`, que é uma alteração no código fonte).

Nenhuma alteração no código fonte (`.tsx`/`.ts`) feita até agora. Nenhuma migration (`migrations/`) alterada. Nenhum arquivo alterado além dos arquivos de auditoria (`AUDITORIA_COMPLETA...`, `INVESTIGACAO...`) e blocos SQL criados (`sql_block_*.sql`, `audit_*.sql`).

Se você confirmar (via `SELECT` no banco ou console) que `sale.status = 'pending'` ainda no banco (não `completed`), o problema é que `fechar_comanda` (RPC) não está marcando `sales` como `completed` — o que seria um problema no SQL (`fechar_comanda` RPC) e não no frontend. Se `sale.status = 'completed'` no banco mas `pending` no local, o problema é `isRemoteFromCurrentBranch()` (`updateSaleFromRemote`) — o que exige alteração no `storageService.ts` (`line 1501`).
