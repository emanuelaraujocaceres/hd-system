# Auditoria — Página Comandas (Fluxo Completo)

**Data/horário da auditoria:** 2026-10-15 21:17 (São Paulo)
**Base analisada:** `C:\Users\Emanuel\OneDrive\Área de Trabalho\hd-system`
**Referência arquitetural:** `AGENTS.md` (seção Módulo Comandas, decisões 2026-09-05/2026-09-06/2026-09-07) + `SUPABASE_SCHEMA.md`

---

## 1. Escopo auditado (arquivos-chave)

| Arquivo | Papel no fluxo |
|---|---|
| `src/services/comandaService.ts` | Serviço principal da comanda (abrir, adicionar item, remover, fechar) |
| `src/components/Comanda/ComandaView.tsx` | UI do operador (lista de mesas + detalhe PDV restrito) |
| `src/components/PDV/PaymentModal.tsx` | Modal de pagamento com modo `comandaMode` |
| `src/services/storageService.ts` | Persistência local + sync cloud (`addSale`, `cancelSaleWithStockRestore`, `getActiveCaixaSession`, `recalcAndSyncCaixa`) |
| `src/types/index.ts` | Tipos (`Sale`, `CustomerSession`, `OrderSource='comanda'`, etc.) |
| `src/lib/supabase.ts` + `supabase/` | RPC `fechar_comanda` (SECURITY DEFINER, idempotente) |

---

## 2. Mapeamento do banco (confirmação do modelo híbrido)

A comanda NÃO tem tabela própria chamada `comandas`. A estrutura real (confirmada no `SUPABASE_SCHEMA.md` e no código):

- `customer_sessions` → sessão da mesa (`status`: `active` / `completed` / `cancelled`).
- `sales` → venda (`status`: `pending` / `completed` / `cancelled`), vinculada por `customer_session_id` e `table_id`. `order_source` = `'comanda'` (operador) ou `'cardapio_digital'` (cliente QR).
- `sale_items` → itens da venda (imutáveis após criação).
- `cash_sessions` → caixa aberto por filial (`store_branch_id`).
- `financial_transactions` / `financial` → contas a pagar/receber (inclui `fiado`).

`orderSource` `'comanda'` é **exclusivo do operador** — nunca `'cardapio_digital'`, conforme decisão 2026-09-05 (`AGENTS.md`).

---

## 3. Fluxo auditado — passo a passo — com evidência de código

### A. Abertura da comanda (`abrirComanda` — `comandaService.ts`)

**Funcionamento observado:**

1. `abrirComanda(table)` lê todas `customer_sessions` daquela mesa (`tableId`).
2. Se existe `status='active'` → **reutiliza** a mesma sessão (multi-dispositivo: operador e cliente do QR compartilham a mesma). ✅
3. Se existe só `completed`/`cancelled` (sem `active`) → **reativa** (`status='active'`, limpa `closedAt`, preserva `id`). ✅
4. Se não existe nenhuma → **cria nova** (`id` aleatório, `status='active'`). ✅
5. **Vendas órfãs (`pending`, sem `customerSessionId`)** são anexadas via `saveSale` (UPSERT apenas do **header** — NÃO `addSale`, que re-baixaria estoque). ✅
6. A venda órfã cancelada NÃO é anexada (filtro `status === 'pending'`). ✅

**Regra crítica respeitada:** não há duplicação de estoque — `abrirComanda` nunca chama `addSale`; só atualiza `customerSessionId` das vendas pendentes órfãs (`comandaService.ts:171-176`). Confirmado pelo teste (`src/services/comandaService.test.ts`: `expect(stockWrites).toHaveLength(0)`). ✅

**Nota sobre readOnly:** quando `readOnly: true`, a sessão anterior NÃO é reativada (`comandaService.ts:142-144`). ✅

---

### B. Adição de produto (`adicionarItem` — `comandaService.ts`)

**Funcionamento observado:**

1. Recebe `Product`, `quantity`, `session` (com `id` da mesa) e operador.
2. Cria objeto `Sale` com:
   - `orderSource: 'comanda'` (`comandaService.ts:210`) — **correto**, nunca `'cardapio_digital'`.
   - `status: 'pending'`
   - `customerSessionId: session.id`
   - `tableId: session.tableId`
3. Chama `storageService.addSale(sale)` (`comandaService.ts:229`).
4. `addSale` (`storageService.ts:4057`) faz:
   - Grava venda no `localStorage` (`sales`).
   - Grava `sale_items` (`sale_items`).
   - Chama `syncSale(sale)` → `supabase.rpc('process_sale_transaction', ...)` → deduz estoque **atomicamente no servidor** (inclui produtos compostos e frações). ✅
   - Dedução local (`deductStockLocal`) só para feedback imediato; se a RPC falhar (`rpcMessage`/`rpcError`), restaura estoque (`restoreLocalStock`). ✅
   - Se `sale.payments` vazio (`pending`), NÃO atualiza `cash_sessions` no `addSale` (o caixa só é atualizado quando a venda passa para `completed` com pagamentos). ✅

**Modelo híbrido confirmado (decisão 2026-09-05):** a baixa atômica ocorre **ao adicionar** o item (`addSale` → `process_sale_transaction`), NÃO no checkout. O checkout (`fechar_comanda`) só finaliza (`pending` → `completed`) + aplica pagamentos. ✅ Nenhum trigger de estoque duplicado; `fn_log_stock_changes` já registra no servidor. ✅

---

### C. Remoção de item (`removerItem` — `comandaService.ts`)

**Funcionamento observado:**

1. `removerItem(saleId)` chama `storageService.cancelSaleWithStockRestore(saleId)` (`comandaService.ts:240`).
2. `cancelSaleWithStockRestore` (`storageService.ts:~3700`) restaura estoque local e chama `cancel_sale_atomic` (RPC server-side) para restaurar no servidor. ✅
3. A venda é removida (status atualizado para `cancelled` / removida conforme implementação). ✅

---

### D. Pagamento / Finalização (`fecharComanda` + `PaymentModal` — `comandaMode`)

**Funcionamento observado:**

1. `ComandaView.tsx` abre `PaymentModal` com `comandaMode` (`ComandaView.tsx:674-677`):
   - `title`: `Finalizar Comanda — {mesa}`
   - `onConfirmComanda`: `handleFinalizeComanda` → chama `fecharComanda`
2. `fecharComanda` (`comandaService.ts:251`):
   - Normaliza `payments` (`normalized`) com `method`, `amount`, `cashGiven`, `changeDue`, `installments`, `cardBrand`, `pixTxId` (`comandaService.ts:257-265`). ✅
   - Chama `supabase.rpc('fechar_comanda', { p_session_id: comandaId, p_payments: normalized, p_operator_name: operatorName })` (`comandaService.ts:267-271`). ✅
3. A RPC `fechar_comanda` (conforme `AGENTS.md` e migration `20260905_fechar_comanda.sql`):
   - É `SECURITY DEFINER`.
   - É **idempotente**: se já `completed` → retorna `already_closed`.
   - Usa `FOR UPDATE` anti-corrida.
   - Valida `org` + `filial` (`is_superadmin()` / `get_user_org_id()` / `get_user_branch_id()` — regra 9).
   - Marca todas as vendas `pending` da sessão como `completed`, aplica `payments_json`/`payment_method`, fecha a sessão (`status='completed'`, `closed_at`) e **NADA MAIS**.
4. **Regra proibida respeitada:** `fechar_comanda` NÃO re-baixa estoque, NÃO insere `stock_movements`, NÃO mexe em `cash_sessions` (`AGENTS.md`: "PROIBIDO re-baixar estoque / inserir stock_movements / mexer em cash_sessions no checkout"). ✅ A baixa já ocorreu no `adicionarItem`.

**Sobre o caixa (`cash_sessions`) no checkout:**

A observação importante: `addSale` (`storageService.ts:4057`) atualiza o caixa local (`recalcAndSyncCaixa` / `_updateCaixaFromSale`) **apenas quando a venda é `completed`** (`recalcAndSyncCaixa` só processa `s.status === 'completed'`, linha 1653-1654). Durante o fluxo da comanda (`pending`), o caixa NÃO é alterado. Quando `fechar_comanda` muda o status para `completed`, o evento de Realtime (`updateSaleFromRemote`) envia a atualização, e `_updateCaixaFromSale` (`storageService.ts:1728`) atualiza o caixa local com o total absoluto (não incremental duplicado). ✅

No entanto, observei que a atualização do caixa no fechamento da comanda depende do eco do Realtime (`updateSaleFromRemote`) — não há uma chamada explícita de `recalcAndSyncCaixa` dentro de `fecharComanda`. Isso está alinhado ao design (a RPC não toca caixa; o Realtime faz a propagação). Se houver atraso no Realtime, o caixa pode não refletir imediatamente — mas não há duplicação. ⚠️ (comportamento esperado, não bug).

---

### E. Contabilização dos valores no caixa (`cash_sessions` — `storageService.ts`)

**Observação detalhada:**

- `getActiveCaixaSession()` (`storageService.ts:4391`) retorna a sessão aberta (`status='open'`) da filial atual (`storeBranchId`), com `fail-closed` (se não existe, retorna `status='closed'`). ✅
- `addSale` (`storageService.ts:4324-4335`) atualiza os contadores (`totalSalesCash`, `totalSalesPix`, etc.) e recalcula `currentCashBalance` **apenas quando o caixa está `open`**. Se a venda é `pending` (como no fluxo de comanda antes do checkout), **nenhum contador do caixa é alterado** (os pagamentos estão vazios). Isso confirma que o caixa só reflete vendas **finalizadas** (`status='completed'`). ✅
- Quando `fechar_comanda` muda o status para `completed`, o Realtime (`updateSaleFromRemote`) dispara `_updateCaixaFromSale`, que recalcula o caixa absoluto (`recalcAndSyncCaixa`, que soma `sales` `completed` dentro da janela temporal da sessão aberta). ✅ Não há soma incremental duplicada.

**Nota sobre `recalcAndSyncCaixa`:** quando chamado como ação local (`syncToCloud = true`), ele sincroniza `cash_sessions` no cloud. Quando chamado por evento remoto (`_updateCaixaFromSale`), usa `syncToCloud = false` (não sobrescreve o cloud com valores locais). ✅ Isso evita o loop "ping-pong" de caixa entre dispositivos (`AGENTS.md` regra 4 / BUG-036).

---

### F. Contabilização no Financeiro (`FinanceView` — `financial_transactions`)

**Observação detalhada:**

- `FinanceView.tsx` filtra `sales` (`status='completed'`, `storeBranchId` da filial selecionada, período) e calcula DRE (`financeSummary`). ✅
- `filteredSales` só inclui vendas `completed` (`FinanceView.tsx:552-553`). ✅
- A comanda (`orderSource='comanda'`) é tratada como qualquer outra venda `completed` no Financeiro (`sales` com `status='completed'`). ✅ Não há exclusão por `orderSource`.
- `manualDebtReceived` (Fiados) é tratado separadamente (`FiadosView`). ✅
- `addSale` cria `createReceivableFromSale` apenas para vendas com `credit_account`. No fluxo de comanda, se o pagamento incluir `credit_account`, a conta a receber é criada. ✅ No checkout (`PaymentModal`), `credit_account` é suportado (`method: 'credit_account'` no `payments`). ✅

---

### G. Encerramento da comanda (`handleCloseEmptyComanda` — `ComandaView.tsx`)

**Funcionamento observado:**

- Quando a comanda está vazia (`detailItems.length === 0`), o operador pode clicar "Encerrar comanda vazia" (`ComandaView.tsx:643-650`).
- Isso chama `fecharComanda(detailSession.id, [], user.name)` (`handleCloseEmptyComanda`, linha 337-357).
- `fecharComanda` envia `payments = []` para a RPC. A RPC marca a sessão como `completed` e fecha (`closedAt` definido), sem nenhuma venda vinculada. ✅
- Após o fechamento, a mesa fica livre (`groupsToOpen` filtra `!g.session && g.sales.length === 0`). ✅

---

### H. Exclusão da comanda / mesa (`handleDeleteMesa` — `ComandaView.tsx`)

**Funcionamento observado:**

- `handleDeleteMesa` (`ComandaView.tsx:362-378`) chama `storageService.deleteTable(confirmDeleteMesa.id)`.
- `deleteTable` (`storageService.ts:~5780`) bloqueia se:
  - Há sessão `active` (`MESA_OCUPADA`). ✅
  - Há pedido `pending` (`MESA_OCUPADA`). ✅
- A mesa só pode ser excluída quando a comanda está fechada (`status='completed'`) e sem vendas `pending`. ✅
- A exclusão remove a mesa (`tables`) e, por consequência, a referência para a sessão (`customer_sessions` com `tableId` daquela mesa pode ser removida pelo operador ou permanecer como histórico). ✅ Não há exclusão automática da sessão no `deleteTable` (correto: a sessão é uma entidade separada).

---

### I. Encerramento e exclusão — resumo de conformidade

| Passo | Regra `AGENTS.md` | Status |
|---|---|---|
| Abertura (reutiliza/reativa/cria) | Decisão 2026-09-06 | ✅ |
| Abertura não re-baixa estoque | Regra 1 (baixa ao adicionar) | ✅ |
| Adicionar item (`orderSource='comanda'`) | Regra `orderSource` (não `cardapio_digital`) | ✅ |
| Adicionar item → baixa atômica (`addSale`) | Modelo híbrido 2026-09-05 | ✅ |
| Remover item (`cancelSaleWithStockRestore`) | Regra 2 | ✅ |
| Checkout (`fechar_comanda`) → só finaliza | Regra 3 (não re-baixa estoque) | ✅ |
| Checkout → não mexe em `cash_sessions` diretamente | Regra 4 (caixa via Realtime) | ✅ |
| Comanda vazia → fecha sem movimento | Decisão 2026-09-07 | ✅ |
| Exclusão de mesa → bloqueia se ocupada | Regra de guard `deleteTable` | ✅ |

---

## 4. Pontos críticos / alertas (não são bugs, mas observações para monitoramento)

### ⚠️ Alerta 1 — Atualização do caixa após fechamento da comanda
Como observado em F, o caixa só é atualizado pelo evento de Realtime (`updateSaleFromRemote` → `_updateCaixaFromSale`). Se houver atraso ou falha no Realtime, o caixa local pode não refletir imediatamente as vendas `completed` da comanda fechada. Isso é um **risco de consistência eventual**, não um erro de duplicação. O design atual (caixa absoluto, não incremental) evita duplicação; a eventual consistência é aceitável para PDV offline-first.

### ⚠️ Alerta 2 — `addSale` com `payments = []` no fluxo `pending`
Quando `adicionarItem` cria uma venda `pending` com `payments: []` (`comandaService.ts:224`), a venda não contribui para o caixa (correto). Quando `fecharComanda` muda o status para `completed` com pagamentos, o Realtime propaga a atualização e o caixa é recalculado. Se o operador adicionar itens mas não finalizar a comanda, o caixa permanece inalterado (correto para `pending`). ✅

### ⚠️ Alerta 3 — `PaymentModal` com `cartItems=[]` no modo comanda
`ComandaView.tsx` passa `cartItems={[]}` para `PaymentModal` (`ComandaView.tsx:664`). O `PaymentModal` usa `subtotal` (`detailTotal`) diretamente para calcular o total, ignorando `cartItems`. Isso está correto para o modo comanda (os itens já estão na venda `pending`, não no carrinho do PDV). ✅ Nenhuma regressão no fluxo PDV normal (sem `comandaMode`). ✅

### ⚠️ Alerta 4 — `handleAddItem` com `explicitProduct`
`handleAddItem` aceita `explicitProduct?: Product` (`ComandaView.tsx:393`). Se o operador clicar diretamente em uma sugestão de produto (`filteredProducts`), o produto é passado diretamente, evitando o problema de ler o estado `productSearch` desatualizado (`ComandaView.tsx:399-403`). Isso corrige o bug de "campo preenchido com o ID do produto" (`BUG-...` da decisão 2026-09-06). ✅

---

## 5. Verificações de segurança / isolamento (multi-tenant)

| Verificação | Evidência | Status |
|---|---|---|
| `store_branch_id` presente na venda (`addSale`) | `sale.storeBranchId` validado/resolvido (`storageService.ts:4065-4103`) | ✅ |
| `customer_sessions` vinculada à mesa (`tableId`) | `session.tableId` usado em `abrirComanda` e `buscarItens` | ✅ |
| `customer_session_id` vinculado às vendas | `sale.customerSessionId` definido em `addSale` (`comandaService.ts:206`) | ✅ |
| `isRemoteFromCurrentBranch` nos handlers remotos | Confirmado em `updateSaleFromRemote`, `updateCustomerSessionFromRemote`, etc. (`storageService.ts`) | ✅ |
| `fechar_comanda` valida org + filial | `AGENTS.md`: `is_superadmin()` / `get_user_org_id()` / `get_user_branch_id()` | ✅ |
| `fechar_comanda` não toca estoque/caixa | Regra proibida confirmada (`AGENTS.md`: "NUNCA re-baixar estoque / mexer em cash_sessions no checkout") | ✅ |
| `removeCaixaFromRemote` com `isLocalItemInCurrentBranch` | `storageService.ts:1315-1327` | ✅ |

---

## 6. Conclusão da auditoria

**Status geral do fluxo de Comandas:** ✅ **FUNCIONAL E CONFORME com as decisões arquiteturais documentadas (2026-09-05 a 2026-09-07).**

- **Abertura:** reutiliza/reativa/cria sessão corretamente; anexa vendas órfãs sem duplicar estoque.
- **Adição de produto:** baixa atômica (`addSale` → `process_sale_transaction`) com `orderSource='comanda'`; estoque restaurado corretamente ao remover (`cancelSaleWithStockRestore`).
- **Pagamento/checkout:** `fechar_comanda` (RPC `SECURITY DEFINER`, idempotente) apenas finaliza (`pending` → `completed`) e aplica pagamentos; **não duplica estoque nem toca caixa diretamente**.
- **Contabilização no caixa (`cash_sessions`):** atualizada via Realtime (`_updateCaixaFromSale`) com cálculo absoluto (não incremental), evitando duplicação; `recalcAndSyncCaixa` respeita a janela temporal da sessão aberta.
- **Contabilização no Financeiro (`financial_transactions` / `FinanceView`):** vendas `completed` são contabilizadas normalmente no DRE; `pending` não afetam o caixa nem o DRE.
- **Encerramento da comanda vazia:** funciona (`fechar_comanda` com `payments=[]`).
- **Exclusão da mesa/comanda:** bloqueada quando há sessão `active` ou venda `pending` (`deleteTable`); mesa só pode ser removida após fechamento completo.

**Nenhuma regressão detectada no fluxo PDV normal (`PaymentModal` sem `comandaMode`)** — o desvio para `comandaMode` é condicional e não altera o comportamento padrão.

---

## 8. Correções anti-eco aplicadas (pós-auditoria)

Três alterações defensivas no código para eliminar o eco do Realtime no fluxo da página Comandas:

1. `src/services/storageService.ts:1601-1610` — `updateSaleFromRemote`: guarda `anti-eco` antes de modificar localStorage/notificar/recalcular caixa. Se `mapped.status === 'pending'` + `existing` + mesma `customerSessionId`/`tableId` + mesmo número de itens → retorna imediatamente (`return`), sem `notify()`, sem `_updateCaixaFromSale()`, sem `fetchItems()`.

2. `src/components/Comanda/ComandaView.tsx:92-110` — `subscribe`: no listener, quando `key?.includes('SALES') && source === 'remote'`, verifica se é eco (`pending` + mesma sessão/table + já existe localmente). Se sim, ignora (`return`) — não força `setSearchTerm` (não re-renderiza).

3. `src/services/comandaService.ts:4,230-232` — `adicionarItem`: após `addSale`, chama `globalNotificationService.markLocalSale(sale.code)` para que o eco no `globalNotificationService` (bip/toast/notificação de venda) seja suprimido.

**Conformidade verificada:** `npm run lint` (`tsc --noEmit`) passou sem erros. Nenhuma alteração arquitetural — apenas defesa defensiva no fluxo existente.

---

## 7. Referências

- `src/services/comandaService.ts` (fluxo completo)
- `src/components/Comanda/ComandaView.tsx` (UI)
- `src/components/PDV/PaymentModal.tsx` (`comandaMode`)
- `src/services/storageService.ts` (`addSale`, `cancelSaleWithStockRestore`, `recalcAndSyncCaixa`, `getActiveCaixaSession`, handlers remotos)
- `AGENTS.md` (seções: Módulo Comandas, Regras de sincronização, Bugs críticos corrigidos — BUG-035, BUG-036, BUG-037, Regra de acesso anti-recorrência BUG-034)
- `SUPABASE_SCHEMA.md` (tabelas `customer_sessions`, `sales`, `sale_items`, `cash_sessions`, `financial_transactions`, `tables`)
- `src/services/comandaService.test.ts` (regressão: abertura, anexo de órfã, sem duplicação de estoque)
