# CHECKLIST DE INVESTIGAÇÃO — Comandas → Financeiro (antes de qualquer alteração)

Data: 2026-10-14 | Base: audit SQL real (tabela=11 colunas, policies=5 PERMISSIVE, grants incompletos) + console real + código fonte lido
Estado: ZERO alteração aplicada ainda (apenas SELECTs no banco; arquivos SQL criados mas não executados)

---

## 1. ESTADO DO BANCO (`sale_item_payments`) — CONFIRMADO NO AUDIT

- [x] Tabela existe (`existe = true`, `11` colunas) — NÃO precisa criar
- [x] RLS habilitado (`rls_on = true`)
- [x] `GRANT` incompleto: `authenticated` só tem `TRUNCATE`, `REFERENCES`, `TRIGGER` (falta `SELECT/INSERT/UPDATE/DELETE`) — CONFIRMADO (`table_privileges`)
- [x] `GRANT` incompleto: `service_role` só tem `TRUNCATE`, `REFERENCES`, `TRIGGER`
- [x] `GRANT` incompleto: `anon` só tem `TRUNCATE`, `REFERENCES`, `TRIGGER`
- [x] Policies: `5` existentes — TODAS `PERMISSIVE` (`{public}`) — precisa ser substituída por `USING (org_id/branch_id) + WITH CHECK`
- [x] `sale_items`: `9` policies (`sale_items_insert_anon` e `sale_items_select_anon` são exceções intencionais — Regra 0f)
- [ ] `REPLICA IDENTITY FULL`: não verificado (`42703` no `pg_class`) — precisa ser aplicado (`fix_sale_item_payments_grants.sql` já inclui)

**Ação necessária (sem criar/alterar código fonte ainda):**
- [ ] Rodar `sql_block_grants.sql` (GRANT `SELECT/INSERT/UPDATE/DELETE` para `authenticated`/`anon`/`service_role`)
- [ ] Rodar `sql_block_insert_policies.sql` (`CREATE POLICY ... INSERT WITH CHECK` — sem `USING`)
- [ ] Confirmar se `sale_items` também precisa de `GRANT` (`sql_block_check_sale_items.sql` ainda não rodado no audit final)
- [ ] Aplicar `REPLICA IDENTITY FULL` (`ALTER TABLE public.sale_item_payments REPLICA IDENTITY FULL`)

---

## 2. FLUXO COMANDA → PAGAMENTO → FINANCEIRO (código lido — sem alteração)

### 2.1 Onde a venda nasce (`ComandaView`)
Arquivo: [`src/components/Comanda/ComandaView.tsx`](src/components/Comanda/ComandaView.tsx)
- `adicionarItem()` (`line 393`) → `adicionarItem()` (`comandaService.ts:188`)
- `comandaService.ts` (`line 196-227`): cria `Sale` com:
  - `status: 'pending'`
  - `orderSource: 'comanda'`
  - `customerSessionId: input.session.id`
  - `storeBranchId: input.session.storeBranchId || storageService.getSelectedBranchId()`
  - `items: [{productId, productName, quantity, unitPrice, total}]`
  - `payments: []`
- `storageService.addSale()` (`line 229` de `comandaService.ts`) → `addSale()` (`storageService.ts:4057`)
  - `addSale()` chama `process_sale_transaction` (RPC) para baixar estoque e criar `sale_items`
  - Grava `Sale` em `localStorage` (`KEYS.SALES`) e sincroniza (`syncSale`)
  - Se `storeBranchId` vazio (`''`), `getSales()` (`line 4033`) filtra (`branchIds.has('')` = `false`) → venda "some"
  - Se `storeBranchId` não é UUID válido, `resolveBranchId()` tenta resolver; se falhar, usa `firstBranch` da lista (`line 4093-4102`) — se `branches` vazio (`length=0`), retorna erro (`success: false`)

### 2.2 Onde o pagamento acontece (`PaymentModal`)
Arquivo: [`src/components/PDV/PaymentModal.tsx`](src/components/PDV/PaymentModal.tsx)
- `PaymentModal` (`line 87-104`): aceita `comandaMode?: {title?, onConfirmComanda, notifySuccess?, confirmLabel?, reportCheckbox?}`
- `ComandaView.tsx:661`: passa `comandaMode={title: 'Finalizar Comanda — ...', onConfirmComanda: handleFinalizeComanda}`
  - `cartItems={[]}` (vazio — não passa os itens da comanda para o modal; o modal só recebe `subtotal={detailTotal}`)
  - `customers={customers}` (lista de clientes — para selecionar no `credit_account`)
- `PaymentModal.handleFinalize()` (`line 230-368`):
  - Se `comandaMode` presente (`line 292`): chama `await comandaMode.onConfirmComanda(payments, totalAmount)`
  - Não cria `newSale` (o `newSale` só é criado quando `!comandaMode` — `line 308`)
  - `payments` é montado a partir do `method` selecionado (`cash`, `pix`, etc.) (`line 245-287`)
  - Se `onConfirmComanda` retorna `{success: false, message: ...}` (`line 293-298`): exibe erro no `PaymentModal` (`setPaymentError`)
  - Se `success: true`: toca `posAudio.chime()` (`line 299`) e fecha (`onClose()` — `line 303`)

### 2.3 Onde a comanda fecha (`ComandaView` — `handleFinalizeComanda`)
Arquivo: [`src/components/Comanda/ComandaView.tsx`](src/components/Comanda/ComandaView.tsx)
- `handleFinalizeComanda()` (`line 457-470`):
  ```typescript
  const res = await fecharComanda(detailSession.id, payments, user.name);
  if (res.success) {
    addToast('success', `Comanda ... fechada ...`);
    goBackToList();
    return res;
  } else {
    addToast('error', res.message || ...);
    return res;
  }
  ```
- `fecharComanda()` (`comandaService.ts:251-304`):
  - Normaliza `payments` (`line 257-265`)
  - Chama `supabase.rpc('fechar_comanda', {p_session_id: comandaId, p_payments: normalized, p_operator_name: operatorName})`
  - Se `error` (`line 273`): retorna `{success: false, message: error.message}`
  - Se `res.success === false` (`line 278`): retorna `{success: false, message: res.message || 'Não foi possível fechar...'}`
  - Se `success`: atualiza `customer_session` local (`status='completed'`, `closedAt`) (`line 284-292`)
  - Retorna `{success: true, saleId, alreadyClosed, total, message}`

**Observação do console real (`vendor-BoLrpt32.js`):**
- Não aparece `fechar_comanda` retornando erro — o `customer_session` foi atualizado (`Remote UPDATE on customer_sessions`), indicando que a RPC funcionou.
- Mas `saveSaleItemPayment()` (`storageService.ts`) falhou (`403`) — isso indica que o `PaymentModal` tentou gravar `sale_item_payments` (provavelmente porque o `PaymentModal` está chamando `saveSaleItemPayment` — ver abaixo).

---

## 3. ONDE ESTÁ A QUEBRA REAL (com base no console + código)

### 3.1 `sale_item_payments`: falha de sincronização (`403` / `42501`)
**Evidência (console real):**
```
POST .../sale_item_payments?on_conflict=id 403 (Forbidden)
❌ Upsert sale_item_payments failed: permission denied for table sale_item_payments (42501)
DB DETAILS: ... code: 42501 | hint: Grant the required privileges...
```
**Causa:** `GRANT` incompleto (`authenticated` sem `SELECT/INSERT`) + policies `PERMISSIVE` (`public` sem filtro).
**Consequência:** o pagamento por item (`sale_item_payments`) não é gravado no banco — a fila (`SyncQueue`) tenta retentar (`1 enqueued`), mas se a sessão não voltar (ou se o `GRANT` não for corrigido), o registro fica na fila. No audit final (`AUDITORIA_COMPLETA...`), a fila recuperou `credit_payments` e `financial_transactions` (`3 ok`), mas `sale_item_payments` **não aparece** nos resultados — confirmando que esse registro permanece bloqueado.

### 3.2 Divergência `FiadosView` vs `FinanceView`
**Documentado no `BUG-035` (`AGENTS.md`) e `AUDITORIA_BLOCO_12.md`:**
- `FiadosView` usa `getSaleItemPayments()` (`storageService.ts:5100`) para calcular `specificPaidTotal` (pagamento específico do item).
- Se `getSaleItemPayments()` retorna vazio (porque `localStorage` `SALE_ITEM_PAYMENTS` está vazio, embora `credit_payments` tenha registros), `specificPaidTotal` = `0`, e o FIFO agregado (`getCreditPayments`) distribui `totalPaid` entre os itens por ordem ascendente de valor — o que pode fazer o item `A` aparecer como não pago, embora o cliente esteja quitado.
- `FinanceView` (`filteredSales`) só lê `sales` (`status='completed'`) — não lê `sale_item_payments` diretamente para o DRE. Mas o `FiadosView` depende de `sale_item_payments` para a alocação precisa.

### 3.3 `storeBranchId` vazio: venda some de todas as telas
**Documentado no `BUG-028` e `addSale` (`console.warn`):**
```typescript
if (!sale.storeBranchId) {
  const firstBranch = this.getBranches()[0];
  if (firstBranch) sale.storeBranchId = firstBranch.id;
  else return {success: false, message: 'Nenhuma filial disponível...'};
}
```
Se `getBranches()` retorna vazio (`branches.length = 0` — não confirmado no audit, mas `store_branches` tem `1` row no audit inicial), a venda é bloqueada (`success: false`). Se `storeBranchId` é resolvido para uma filial que não corresponde ao usuário atual, `getSales()` (`line 4027`) filtra por `branchIds.has(s.storeBranchId)` — se a filial resolvida não pertence à `org_id` atual, a venda some (`getSales()` retorna `[]` para essa venda).

### 3.4 `saveSaleItemPayment` (`storageService.ts`)
Arquivo: [`src/services/storageService.ts`](src/services/storageService.ts) (`line 5072-5132`)
- Cria registro em `localStorage` (`KEYS.SALE_ITEM_PAYMENTS`) com `storeBranchId: data.storeBranchId`, `organizationId: data.organizationId`.
- Sincroniza com `syncService.upsertRow('sale_item_payments', {...})` (`line 5102`).
- Se `storeBranchId` vazio (`''`), `validBranchId('')` (`syncService.ts`) retorna `undefined`, e `upsertRow` retorna `false` (`line 542` — `REQUIRED_FIELDS` inclui `sale_item_id` para `sale_item_payments`). Se `storeBranchId` não é UUID válido, `resolveBranchId()` tenta resolver; se falha, cai para `firstBranch`.
- Se `upsertRow` falha (`403`/`42501`), o registro fica no `localStorage` mas não sobe para o cloud. A fila (`SyncQueue`) tenta retentar quando a sessão volta — mas se `GRANT` não for corrigido, o retentativo também falha.

---

## 4. O QUE PRECISAMOS VERIFICAR AGORA (sem criar/alterar código fonte ainda)

Baseado no audit (`AUDITORIA_COMPLETA...`), no console real e no código lido (`ComandaView`, `comandaService`, `PaymentModal`, `FinanceView`, `storageService`, `syncService`), os pontos críticos são:

1. **Executar os blocos SQL de fix (`sql_block_grants.sql`, `sql_block_insert_policies.sql`)** — confirmar se o `403` some no console.
2. **Confirmar `REPLICA IDENTITY FULL` (`fix_sale_item_payments_grants.sql`)** — se ainda não aplicado.
3. **Confirmar `sale_items` (`sql_block_check_sale_items.sql`)** — se também precisa de `GRANT`/policies corrigidas.
4. **Reexecutar o pagamento na Comanda** (`ComandaView`) — observar se `Remote INSERT on sale_item_payments` aparece no console (indicando que a sincronização funcionou) e se `Remote UPDATE on sales` ainda ocorre (`fechar_comanda` funcionando).
5. **Verificar `FinanceView` (`filteredSales`)** — após finalizar a comanda, confirmar se a venda `completed` aparece no DRE e no resumo (`Vendas Realizadas` — `FinanceView.tsx:1016`).

Nenhum arquivo fonte (`.tsx`/`.ts`) alterado. Nenhuma migration alterada. Nenhum `git revert` necessário ainda.

---

## 5. ROLLBACK DOCUMENTADO (se os blocos SQL quebrarem algo)

Se `sql_block_grants.sql` ou `sql_block_insert_policies.sql` causarem problema (ex.: `GRANT` bloqueia outra aplicação; `CREATE POLICY` quebra acesso anon):

```sql
-- Reverter grants:
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.sale_item_payments FROM authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.sale_item_payments FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.sale_item_payments FROM service_role;

-- Reverter policies (se precisar restaurar as antigas):
DROP POLICY IF EXISTS "org_branch_insert_sale_item_payments" ON public.sale_item_payments;
DROP POLICY IF EXISTS "anon_insert_sale_item_payments" ON public.sale_item_payments;
-- (restaurar as originais via git revert dos arquivos .sql, se necessário)
```

Se o `ALTER PUBLICATION supabase_realtime ADD TABLE` (`fix_sale_item_payments_grants.sql`) quebrar algo:
```sql
-- Remover do canal (se necessário):
ALTER PUBLICATION supabase_realtime DROP TABLE public.sale_item_payments;
```

Nenhuma alteração no `RLS_FIXES.sql` (`supabase/RLS_FIXES.sql`) feita até agora — ele permanece intacto.

---

## 6. REFERÊNCIAS DO CÓDIGO (sem alteração — apenas leitura)

- `ComandaView.tsx` (`line 661`: `PaymentModal` com `comandaMode`); `line 457`: `handleFinalizeComanda` (`fecharComanda`)
- `ComandaView.tsx` (`line 393`: `handleAddItem` → `adicionarItem`)
- `comandaService.ts` (`line 188`: `adicionarItem` → `Sale {pending, comanda}`; `line 251`: `fecharComanda` → `supabase.rpc('fechar_comanda')`)
- `PaymentModal.tsx` (`line 292`: `comandaMode` → `onConfirmComanda`)
- `FinanceView.tsx` (`line 552`: `filteredSales` — `status === 'completed'`)
- `storageService.ts` (`line 4057`: `addSale` → `process_sale_transaction`; `line 5100`: `saveSaleItemPayment` → `upsertRow('sale_item_payments')`; `line 4010`: `getSales` → filtro `storeBranchId`)
- `syncService.ts` (`line 133`: `TableName` inclui `sale_item_payments` — edição confirmada nos relatórios de auditoria)
- `AUDITORIA_COMPLETA_COMANDAS_FINANCEIRO.md` (`line 60`: `GRANT` incompleto; `line 82`: divergência `FiadosView`/`FinanceView`)
- `AGENTS.md` (`BUG-035`, `BUG-003`, `BUG-004`, `BUG-036`, `Regra 0f` — `sale_item_payments` não removido; `sale_items` `anon` policies; `process_sale_transaction`)
- `AUDITORIA_BLOCO_12.md` (divergência `FiadosView` vs `FinanceView` para `isItemPayment`)

---

Quando o usuário confirmar que executou os blocos SQL (`sql_block_grants.sql`, `sql_block_insert_policies.sql`) e que o `403` sumiu (ou que ainda persiste), esta checklist será atualizada com o bloco final de verificação — incluindo o rollback (se necessário) e a confirmação do `Remote INSERT on sale_item_payments` no console após o pagamento.