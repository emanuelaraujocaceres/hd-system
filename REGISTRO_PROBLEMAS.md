# REGISTRO DE PROBLEMAS — Sincronização, Comandas e Financeiro

Referência: AGENTS.md, SUPABASE_SCHEMA.md, RELATORIO_BUG_deleteCreditPayment.md
Atualizado em: 2026-10-11 (sessão atual)

---

## Problema identificado no log (BUG-037 + dados corrompidos + fila travada)

### Sintomas (console navegador, `vendor-BoLrpt32.js`):
- `[HD-Sync] 🚫 Upsert products bloqueado — sem sessão Supabase válida (não grava como anon)` → 303+ itens na fila (`SyncQueue` até 303).
- `Upsert products failed: null value in column "name" of relation "products" violates not-null constraint` (row `2fe0edd6-...`).
- `Upsert product_lots failed: null value in column "product_id"`.
- `Upsert categories failed: null value in column "name"`.
- `Upsert customers failed: null value in column "name"`.
- `Upsert stock_loss_log failed: null value in column "product_id"`.
- `Upsert open_containers failed: null value in column "product_id"`.
- `Upsert product_recipes failed: null value in column "composite_product_id"`.
- `Upsert nf_records failed: Could not find the 'nf_number' column of 'nf_records' in the schema cache`.
- `Upsert delivery_orders failed: Could not find the 'sale_id' column of 'delivery_orders' in the schema cache`.
- `Upsert branch_themes failed: Could not find the 'button_bg' column of 'branch_themes' in the schema cache`.
- `Upsert tables failed: new row for relation "tables" violates check constraint "tables_status_check"`.
- `Upsert customer_sessions failed: new row for relation "customer_sessions" violates check constraint "chk_cs_status"`.
- `Upsert printers failed: null value in column "port"`.
- `Upsert payment_terminals failed: invalid input syntax for type uuid: ""`.
- `Upsert api_keys failed: duplicate key value violates unique constraint "api_keys_key_hash_key"`.
- `Upsert delivery_neighborhoods failed: duplicate key value violates unique constraint ...`.
- `Upsert delivery_distance_rates failed: duplicate key value violates unique constraint ...`.
- `[HD-Sync] 📊 Sales hydration: local=710, cloud=809` → vendas locais não sobem ao cloud.
- `[HD-Sync] 📊 Financial hydration: local=154, cloud=185` → contas financeiras locais não sobem.
- `[HD-Sync] Realtime connected (branch: 160e38a2-...)` mas `Upsert` bloqueado por falta de sessão válida (`BUG-037` corrigido no `syncService`, mas a fila ainda presa por dados corrompidos).

---

## Causa raiz (confirmada no código):

1. `syncService.ensureSession()` (linha 1077) valida via `get_my_profile` — correto para `BUG-037` (não usa SELECT em `products` com header `x-branch-id` que dá falso positivo).
2. `tryUpsert` (linha 522) rejeita se `guardSessionForWrite` retorna `false` — correto para `BUG-037`.
3. `tryUpsert` não tinha validação dos dados do payload (`name` vazio, `status` vazio, colunas inexistentes no banco) — a fila (`SyncQueue`) ficava presa em retry infinito para registros corrompidos.
4. `storageService.getProducts()` / `getCategories()` / `getCustomers()` / `getCustomerSessions()` / `getTables()` não filtravam registros corrompidos — expunham na UI e enviavam novamente para a fila.
5. `App.tsx` não limpava registros corrompidos ao montar — após F5, os registros ruins permaneciam no `localStorage` e a fila continuava presa.

---

## Correções aplicadas nesta sessão (evidência no arquivo):

### 1. `src/services/syncService.ts` (linha 539-548)
- Adicionada validação `REQUIRED_FIELDS`: rejeita `products` sem `name`, `categories` sem `name`, `customers` sem `name`, `sales` sem `status`, `customer_sessions` sem `table_id`/`status`, `tables` sem `name`/`status`, `printers` sem `port`, `nf_records` sem `nf_number`, `delivery_orders` sem `sale_id`, etc.
- Retorna `{ ok: false, error: { message: 'Campos obrigatórios vazios: ...', code: 'REQUIRED_FIELD_MISSING' } }` — não envia ao banco, não aumenta a fila.

### 2. `src/services/storageService.ts`
- `getProducts()` (3493): `.filter(p => (p.name || '').trim() !== '')`
- `getCategories()` (3891): `.filter(c => (c.name || '').trim() !== '')` antes da deduplicação
- `getCustomers()` (3935): `.filter(c => (c.name || '').trim() !== '')`
- `getCustomerSessions()` (5929): `.filter(s => ['active','completed','cancelled'].includes(s.status))`
- `getTables()` (5751): `.filter(t => ['active','inactive'].includes(t.status))` após dedup

### 3. `src/App.tsx` (linha 948-999)
- Adicionado `useEffect` de limpeza ao montar: remove registros sem `name` de `products`, `categories`, `customers`; remove sessões com `status` inválido; remove mesas com `status` inválido — com logs no console (`[App-Cleanup]`).

---

## Verificação feita:
- `npx tsc --noEmit`: sem erros nos arquivos editados (`syncService.ts`, `storageService.ts`, `App.tsx`).
- Nenhuma alteração em RLS, migrations SQL, `SUPABASE_SCHEMA.md` (não modificada — o problema era de dados/sincronização, não de schema).

---

## Próximos passos (não concluídos nesta rodada):
- Verificar no navegador/app (`http://127.0.0.1:50641`) se o console mostra `[App-Cleanup]` confirmando remoção dos registros corrompidos.
- Confirmar que a fila drena completamente apos `npm run build` + deploy no app real (`http://127.0.0.1:50641` ou URL de producao) + login (restaurar `hd_system_logged_in_email` nao `LOGGED_OUT`).
- Confirmar no `Financeiro` (`FinanceView.tsx`) que as vendas `completed` das comandas (`status='completed'`, `storeBranchId` correto) aparecem no DRE (`sales` filtradas por `completed` e `branchId`).
- **EVIDENCIA F5 (2026-10-11):** `Sales hydration: local=810, cloud=810` (antes 710 vs 809); `Financial hydration: local=185, cloud=185` (antes 154 vs 185); fila processa 101 ops e rejeita permanentemente (`failed permanently after 3 retries`) registros com `name` vazio, `status` invalido, colunas inexistentes (`button_bg`, `nf_number`, `sale_id`) — nao mais loop infinito. `Upsert bloqueado — sem sessao valida` ainda aparece, indicando que `localStorage.getItem('hd_system_logged_in_email')` pode estar como `LOGGED_OUT` ou senha stale.
- Confirmar no `Financeiro` (`FinanceView.tsx`) que as vendas `completed` das comandas (`status='completed'`, `storeBranchId` correto) aparecem no DRE (`sales` filtradas por `completed` e `branchId`).
- Verificar se `RELATORIO_BUG_deleteCreditPayment.md` precisa ser atualizado com um registro adicional (ex.: adicionar a defesa `if (!id)` proposta no documento, se ainda não aplicada — o arquivo indica que a correção NÃO foi aplicada ainda).

---

## Referência para casos futuros:
Se o mesmo sintoma aparecer (`Upsert bloqueado`, `null value in column`, `violates not-null constraint`, `invalid input syntax for type uuid`, `violates check constraint`, fila crescente sem drenar):
1. Verificar `syncService.ts` → `REQUIRED_FIELDS` cobrindo a tabela.
2. Verificar `storageService.ts` → `get*()` filtrando registros corrompidos.
3. Verificar `App.tsx` → função de limpeza ao montar.
4. Verificar `SUPABASE_SCHEMA.md` se há colunas novas/inexistentes no banco (`PGRST204`).
