# AUDITORIA FINAL — Problema confirmado: item permanece `pending` após pagamento

Data: 2026-10-14 | Base: imagem (`ComandaView`: 2 mesas com "1 pedido(s) pendente(s)") + console (sem `403`, `customer_session` atualizado, `sales` não atualizado) + audit SQL (`GRANT` corrigido, `INSERT` policy corrigida, `REPLICA IDENTITY` não verificado) + código lido (`ComandaView`, `comandaService`, `PaymentModal`, `FinanceView`, `storageService`, `syncService`)
Estado: ZERO alteração aplicada em código fonte (`.tsx`/`.ts` intactos); ZERO alteração em migrations (`migrations/` intactas); ZERO alteração em `RLS_FIXES.sql` (`supabase/RLS_FIXES.sql` intacto); `GRANT` e `INSERT` policy corrigidos no banco (`sql_block_grants.sql` + `sql_block_insert_policies.sql` executados — confirmados pelo usuário); `audit_final_check_policies.sql` confirma `check_expr` corrigido (`null` → `store_branch_id` + `organization_id`); `audit_check_existing.sql` confirma `sale_item_payments` (11 colunas, RLS ON, 6 policies — incluindo `anon_insert` corrigida).

---

## A. EVIDÊNCIA DO PROBLEMA (imagem + console + banco + código)

### A.1 Imagem (`image.png` — `ComandaView` — fornecida pelo usuário)
```
[mesa 1] meninos pousada  — R$ 1.00 — 1 pedido(s) pendente(s) · toque para reabrir — Abrir Comanda
[mesa 2] menino gktb morena — R$ 1.00 — 1 pedido(s) pendente(s) · toque para reabrir — Abrir Comanda
```
**Observação:** ambas as mesas ainda exibem `1 pedido(s) pendente(s)`. Se a `sale` tivesse sido atualizada para `completed` (`fechar_comanda` funcionando), `buscarItens()` (`line 61-101`) não retornaria o item (`filter` por `status === 'pending'`), e o texto seria `Nenhuma comanda aberta` ou `0 pedido(s)`.

### A.2 Console (`vendor-BoLrpt32.js` — após `GRANT` corrigido, sem `403`)
```
[HD-Sync] Remote UPDATE on customer_sessions: b64b9a6f-e653-43bb-9647-72e85a028d58
```
**Observação:** `customer_session` foi atualizado (`fechar_comanda` funcionou — `status='completed'`). Mas **não há** `Remote UPDATE on sales` para o `sale.id` associado a essa `customer_session`.

### A.3 Resultado do audit SQL (`SELECT sales` — `check_sale_status_banco.sql` — executado pelo usuário)
```
| id                                   | status  | store_branch_id                      | customer_session_id                  | order_source | code              | sessao_status | table_id                             |
| ------------------------------------ | ------- | ------------------------------------ | ------------------------------------ | ------------ | ----------------- | ------------- | ------------------------------------ |
| 1ce08228-db93-4597-bcd7-e8a8c3e5b9b7 | pending | 160e38a2-a896-4d6b-a6ea-52d4362abf55 | b64b9a6f-e653-43bb-9647-72e85a028d58 | comanda      | VEN-MV8VCG81-FVV8 | completed     | f8a99b49-668f-4694-a898-0d704d72f9b7 |
| c6dc7f90-7690-48e5-98a1-09376895269a | pending | 160e38a2-a896-4d6b-a6ea-52d4362abf55 | 1cc846cf-ceed-41e7-9de5-f0328954ada3 | comanda      | VEN-MV8S0CWD-2CZE | completed     | 0ef92b30-d6c7-4de3-94ee-1a13a3ee7fe0 |
```
**Observação crítica:** `sales.status = 'pending'` + `customer_sessions.status = 'completed'` + `sales.customer_session_id = customer_session.id`. A `fechar_comanda` (RPC `line 105-125` da migration `20260905_fechar_comanda.sql`) atualiza `sales` com `WHERE customer_session_id = p_session_id AND status = 'pending'`. Se a `sales` ainda está `pending`, a `UPDATE` não ocorreu no banco — ou a `sale` não tem `customer_session_id` correto (mas o audit confirma que tem), ou a `store_branch_id`/`organization_id` da `sale` não corresponde à `session` (`fechar_comanda` filtra `AND store_branch_id = v_session.store_branch_id AND organization_id = v_session.organization_id` — `line 112`).
Se `store_branch_id` ou `organization_id` da `sale` for diferente do `session`, a `fechar_comanda` não encontra a venda (`FOR v_sale IN SELECT ... FROM sales WHERE customer_session_id = p_session_id AND status = 'pending' AND store_branch_id = v_session.store_branch_id AND organization_id = v_session.organization_id` retorna `0` linhas), mas ainda fecha a `session` (`UPDATE customer_sessions` — `line 128-132`). Isso explica a imagem (`pending` ainda visível) + o console (`customer_session` atualizado, `sales` não atualizado).

---

## B. FLUXO COMANDA → PAGAMENTO → FINANCEIRO (correto — documentado no código)

### B.1 Onde a venda nasce (`ComandaView` → `adicionarItem`)
Arquivo: [`src/services/comandaService.ts`](src/services/comandaService.ts) (`line 196-227`)
```typescript
storeBranchId: input.session.storeBranchId || storageService.getSelectedBranchId(),
organizationId: input.session.organizationId,
customerSessionId: input.session.id,
status: 'pending',
orderSource: 'comanda',
```
Se `input.session.storeBranchId` ou `input.session.organizationId` for vazio (`''`/`null`), `addSale()` (`line 4065-4104` do `storageService`) usa `getSelectedBranchId()` como fallback. Se `getBranches()` tiver `1` linha (`store_branches` — audit confirma `1` row), `storeBranchId` é resolvido para o UUID correto (`160e38a2...`) — então `storeBranchId` não é vazio nessa venda (o audit confirma `store_branch_id = 160e38a2...`).

### B.2 Onde o pagamento acontece (`PaymentModal` com `comandaMode`)
Arquivo: [`src/components/PDV/PaymentModal.tsx`](src/components/PDV/PaymentModal.tsx) (`line 292-304`)
```typescript
if (comandaMode) {
  const comandaResult = await comandaMode.onConfirmComanda(payments, totalAmount);
  if (comandaResult && comandaResult.success === false) {
    setPaymentError(comandaResult.message || ...);
    return;
  }
  ...
  onClose();
  return;  // NÃO cria newSale — só finaliza a comanda
}
```
`comandaMode.onConfirmComanda` é `handleFinalizeComanda` (`ComandaView.tsx` `line 457`), que chama `fecharComanda()` (`comandaService.ts` `line 251`).

### B.3 Onde a comanda fecha (`fecharComanda` — RPC `fechar_comanda`)
Arquivo: [`supabase/migrations/20260905_fechar_comanda.sql`](supabase/migrations/20260905_fechar_comanda.sql) (`line 105-125`)
A RPC faz:
```sql
FOR v_sale IN SELECT id, total FROM sales WHERE customer_session_id = p_session_id AND status = 'pending' AND deleted_at IS NULL AND organization_id = v_session.organization_id AND store_branch_id = v_session.store_branch_id FOR UPDATE LOOP
  UPDATE sales SET status = 'completed', payments_json = p_payments, ... WHERE id = v_sale.id;
END LOOP;
UPDATE customer_sessions SET status = 'completed', closed_at = now(), ... WHERE id = p_session_id;
```
Se `store_branch_id` da `sale` corresponde à `session`, a `UPDATE` ocorre. Se não corresponde, `v_sale` retorna `0` linhas, e a `sales` permanece `pending`.

---

## C. CAUSA DO PROBLEMA (confirmado pelo código + audit + console)

**A `sale` (`pending`) não está sendo atualizada para `completed` (`sales.status` ainda `pending` no banco — audit SQL confirma).**

Possíveis causas (sem criar código fonte ainda — apenas análise):

1. **`store_branch_id` ou `organization_id` da `sale` não corresponde à `session`** (`fechar_comanda` filtra por `store_branch_id` + `organization_id` — `line 112` da migration). Se `input.session.storeBranchId` é vazio (`''`) ou `input.session.organizationId` é vazio, `addSale()` (`line 203`) usa `getSelectedBranchId()` — mas se a `table` (`group.table`) foi criada sem `storeBranchId` (`ComandaView.tsx` `line 297-305`: `storeBranchId: user.storeBranchId` — se `user.storeBranchId` vazio, a `table` fica sem `storeBranchId`). Se `table.storeBranchId` é `undefined`, `newTable.storeBranchId` (`line 304`) usa `user.storeBranchId` — se vazio, a `table` fica sem `storeBranchId`. Quando `abrirComanda()` (`line 130`) cria `session` (`line 154-164`), usa `table.storeBranchId` (`line 160`). Se `table.storeBranchId` vazio, `session.storeBranchId` fica vazio. Quando `adicionarItem()` (`line 203`) usa `input.session.storeBranchId || getSelectedBranchId()`, `getSelectedBranchId()` retorna `160e38a2...` (o audit confirma `store_branches` tem `1` row). Então a `sale` tem `store_branch_id = 160e38a2...` (correto). A `session` também tem `storeBranchId = 160e38a2...` (se `table.storeBranchId` foi resolvido). Se `table.storeBranchId` é vazio, `session.storeBranchId` fica vazio, mas `addSale()` resolve para `160e38a2...`. Então `sale.storeBranchId = 160e38a2...` mas `session.storeBranchId` pode ser vazio (`''`) — nesse caso, `fechar_comanda` (`line 112`) compara `store_branch_id = v_session.store_branch_id` (`''` vs `160e38a2...`) → `false`. A `sale` não é encontrada (`v_count = 0`), mas a `session` ainda fecha. Isso explicaria `pending` local (`sale.status` não atualizado) + `completed` na `session`.

2. **A `sale` tem `deleted_at` definido** (`soft-delete` — `line 1509-1521` do `updateSaleFromRemote`). Se `sale` foi removida por `cancelSaleWithStockRestore()` (`removerItem` — `line 240` de `comandaService.ts`), `deleted_at` é definido, e `fechar_comanda` (`line 110`) filtra `deleted_at IS NULL` — a `sale` não é encontrada, mas a `session` fecha.

3. **A `sale` tem `status = 'pending'` no banco (`fechar_comanda` não fez `UPDATE`)** — mas `customer_session` está `completed`. Isso pode acontecer se a `fechar_comanda` falhou (`res.success = false`) — mas o `console` não mostra erro (`success: false`), e `customer_session` foi atualizada (indica `success: true`). Então a `RPC` funcionou (`success: true`), mas a `UPDATE` de `sales` não ocorreu — o que só acontece se `v_sale` retorna `0` (`store_branch_id`/`organization_id` mismatch ou `deleted_at` definido). Se `storeBranchId` está correto, `deleted_at` é a próxima hipótese.

---

## D. ESTRATÉGIA DE ROLLBACK (se necessário, após investigação)

Se a causa for `storeBranchId` vazio na `table`: corrigir `ComandaView.tsx` (`line 297-305`) para garantir `storeBranchId` e `organizationId` na `newTable` (usando `user.storeBranchId` e `user.organizationId`, mas com `fallback` para `getSelectedBranchId()` se vazio). Não envolve rollback no banco.

Se a causa for `deleted_at` definido: verificar se `removerItem()` (`line 238`) está sendo chamado (mas a imagem mostra `pending`, não `cancelled`). Se não, `deleted_at` não é a causa.

Se a causa for `fechar_comanda` (`RPC`) não atualizando (`v_sale` retorna `0` devido a `store_branch_id` mismatch): corrigir a `table` para ter `storeBranchId` correto (`ComandaView`), ou corrigir `fechar_comanda` (`line 112`) para aceitar `store_branch_id` vazio (`''` → `NULL`) quando a `session` também tem vazio. Isso envolve alterar `supabase/migrations/20260905_fechar_comanda.sql` (ou criar uma nova migration). Nenhuma alteração aplicada ainda.

Nenhuma alteração no `RLS_FIXES.sql` feita. Nenhuma alteração no `comandaService.ts`, `ComandaView.tsx`, `PaymentModal.tsx`, `FinanceView.tsx`, `storageService.ts` aplicada ainda. Nenhum `git revert` necessário ainda.

---

Quando você confirmar a causa exata (`SELECT status FROM sales WHERE id='...'` no banco — `pending` ou `completed` — e se `table.storeBranchId` corresponde ao `sale.storeBranchId`), atualizo esta auditoria com a solução (sem criar/alterar nada ainda — apenas documentando).