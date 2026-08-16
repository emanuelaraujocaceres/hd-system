# HD-System Agents Reference

## Workflow
- Sempre executar `git push` ao final de cada alteração (commit, arquivo novo, mudança de config, etc.)
- Restore point de referência (sincronização tempo real + offline/online OK): tag `restore-point-realtime-ok`
- **Referência do Supabase:** O arquivo `SUPABASE_SCHEMA.md` na raiz do projeto contém a estrutura completa do banco (tabelas, colunas, tipos, RPCs, views). DEVE ser atualizado a cada migration aplicada. Antes de criar/modificar qualquer tabela, consultar este arquivo primeiro.

## Regras de sincronização (nunca quebrar)

0. **RLS obrigatório em todas as tabelas.** Sempre habilitar RLS (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`) e criar policies. Nunca deixar tabelas sem policies — acesso anônimo (sem auth.uid()) deve ser BLOQUEADO.
0b. **Policies permissivas (`USING (true)`) são PROIBIDAS em produção.** Elas permitem acesso cross-org/cross-branch. Se precisar de policies permissivas para migração, use transação e DROP imediato após.
0c. **Helper functions para RLS** (criar uma vez e reusar):
     - `is_superadmin()` → user com organization_id NULL
     - `get_user_org_id()` → organization_id do auth.uid()
     - `get_user_branch_id()` → store_branch_id do auth.uid()
     - `get_user_role()` → 'admin' | 'collaborator'

1. **Cloud é a fonte da verdade.** Nunca sobrescrever contadores do cloud com valores locais stale (ex.: `Math.max` entre local e cloud). Sempre adotar os totais do cloud (`updateCaixaFromRemote`, hidratação).
2. **Toda tabela nova no banco DEVE entrar na publicação `supabase_realtime`** (senão o canal inteiro é rejeitado com `CHANNEL_ERROR` em loop e o tempo real morre). Também aplicar `REPLICA IDENTITY FULL` para payload completo de UPDATE/DELETE.
3. **Toda tabela nova usada pelo frontend DEVE ser registrada em 3 lugares**: lista `tables` do canal em `syncService.ts` (~linha 185), `BRANCH_REQUIRED_TABLES` se for escopada por filial, e `hydrateFromCloud` em `storageService.ts`.
4. **Nunca recalcular caixa somando vendas e escrever de volta no cloud.** `syncCaixaSession` grava totais ABSOLUTOS da sessão; somar incrementalmente aplica a venda 2x. `_updateCaixaFromSale` (realtime) atualiza só o display local, nunca o cloud.
5. **Reset de dados exige limpar localStorage dos dispositivos ANTES de apagar no banco.** O merge de hidratação reenvia registros locais que o cloud não tem — se limpar só o banco, o dado ressuscita.
6. **Nunca remover a ressuscitação do Realtime** (`resubscribeIfDead` no health check do `App.tsx` + `resubscribeRealtime` no `syncService.ts`). Sem isso, canal morto (10 tentativas esgotadas) só volta com F5.
7. **Isolamento de filial**: manter filtros server-side (`organization_id`, `store_branch_id`) e client-side (`isRemoteFromCurrentBranch`) ao tocar em qualquer handler de sincronização.
0d. **Testar SQL incrementalmente no Supabase SQL Editor** — aplicar migrations em blocos pequenos e verificar `RAISE NOTICE` antes de rodar tudo de uma vez. Erros de nome de coluna (`pg_policy.polname` vs `pg_policies.policyname`) quebram migrations inteiras. Sempre validar colunas de catálogo (`pg_policy`, `pg_class`, `pg_namespace`) antes de usar em `JOIN`s.
0e. **SQL migrations devem ser idempotentes e testados** — usar `DROP POLICY IF EXISTS` + `CREATE POLICY` para evitar conflitos. Policies não podem ter nomes duplicados por tabela — dropar antes de recriar. Erros de DDL não fazem rollback automático.
8. **Estoque é responsabilidade do frontend.** `products.stock_quantity` NÃO tem trigger no banco — o desconto é feito pelo frontend ao processar a venda (update local + sync). Não criar trigger de estoque no banco nem recalcular estoque via SQL; isso gera dessincronização com o cloud.

## Bugs críticos corrigidos (NUNCA reintroduzir)

### BUG-001: Recursão infinita em handlers de tab
**Sintoma:** `Maximum call stack` ao navegar entre abas (SettingsView, etc.)
**Causa:** Handler que chama a si mesmo ao invés de chamar `setState`.
**Regra:** Funções handler devem SEMPRE chamar a função `setState` correspondente, nunca a si mesmas.
```typescript
// ❌ ERRADO — recursão infinita
const handleSetTab = (tab) => { handleSetTab(tab); setSessionStorage(...); };
// ✅ CORRETO
const handleSetTab = (tab) => { setActiveTab(tab); setSessionStorage(...); };
```
**Local:** `SettingsView.tsx:59-62`

### BUG-002: Categorias duplicadas no dropdown
**Sintoma:** Categorias aparecem duplicadas no Settings > Impressora > Categoria
**Causa:** `updateCategoryFromRemote` não mapeava `store_branch_id`; sem deduplicação por nome.
**Regra:** Sempre mapear `store_branch_id` em `*FromRemote()`. Usar deduplicação por nome em `getCategories()`.
**Local:** `storageService.ts:775-787` (updateCategoryFromRemote) + `getCategories()`

### BUG-003: Cálculo de fiado corrompido (múltiplos pagamentos)
**Sintoma:** FiadosView mostra valor total da venda (R$81,90) ao invés do fiado (R$61,90)
**Causa:** `updateReceivableFromPayments` usava `acc.amount` (já era o restante) como baseline, dobrando o pago.
**Regra:** Usar SEMPRE `getFiadoAmount(sale)` como valor original do fiado, nunca `acc.amount` (que já é o restante).
**Local:** `storageService.ts:3082-3097` (updateReceivableFromPayments)

### BUG-004: Payments perdidos na sincronização (payment_method vs payments_json)
**Sintoma:** Vendas com split (cash + credit_account) perdem o payment credit_account ao sincronizar
**Causa:** Coluna `payment_method` (text) no banco só armazena um método. `syncSale` enviava apenas `payments[0]?.method`.
**Regra:** Usar `payments_json` (JSONB) para armazenar array completo de payments. Mapear em `syncSale`, `updateSaleFromRemote` e hidratação.
**Local:** `storageService.ts:519-539` (syncSale), `storageService.ts:839-860` (updateSaleFromRemote), `storageService.ts:1532-1548` + `storageService.ts:1572-1591` (hidratação)
**Migration:** `20260809_fix_sales_payments_json.sql`

### BUG-005: Valor do FiadosView vs FinanceView diferente
**Sintoma:** FiadosView mostra R$81,90, FinanceView mostra R$61,90 (mesmo fiado)
**Causa:** `creditAmount` no FiadosView usava fallback `|| saleTotal` quando `payments.find()` retornava undefined.
**Regra:** Usar `reduce` para somar TODOS os pagamentos `credit_account` (suporta split payment). Fallback `|| saleTotal` só se nenhum pagamento credit existir.
**Local:** `FiadosView.tsx:136-141` + `FiadosView.tsx:266-271` (corrigido)

### BUG-006: getCreditPayments() sempre retorna array vazio
**Sintoma:** Barra de progresso de fiados sempre mostra 0%, pagamentos desaparecem do UI
**Causa:** `getCreditPayments()` filtrava por `p.sale_id` (snake_case) mas objetos CreditPayment usam `saleId` (camelCase).
**Regra:** `getCreditPayments()` deve filtrar por `p.saleId`. `getSaleItems()` pode usar `item.sale_id` (sale_items são armazenados com snake_case).
**Local:** `storageService.ts:2881-2887` (corrigido)

### BUG-022: fetchRows duplicados em hydrateFromCloud
**Sintoma:** moduleVisibility, productLots, stockLossLogs recebiam dados errados durante hidratação
**Causa:** 38 chamadas `fetchRows` no Promise.all mas apenas 29 variáveis no destructuring — linhas 1714-1735 eram duplicatas exatas (tables, customer_sessions, digital_menu_config, branch_themes, api_keys, delivery_*)
**Regra:** Manter 1:1 entre fetchRows e variáveis destructuradas. Contar cuidadosamente ao adicionar tabelas novas.
**Local:** `storageService.ts:1695-1730` (corrigido — removidas 9 linhas duplicadas)

### BUG-023: stock_loss_log usa variável indefinida no map
**Sintoma:** ReferenceError em runtime durante hidratação de stock_loss_log
**Causa:** Parâmetro do map é `r` mas o corpo usa `sll` (indefinido neste escopo)
**Regra:** Usar o nome do parâmetro declarado na arrow function. Não copiar de outro trecho sem renomear.
**Local:** `storageService.ts:1871-1877` (corrigido — `sll` → `r`)

### BUG-024: 18 update*FromRemote handlers sem isRemoteFromCurrentBranch
**Sintoma:** Dados de filial交叉chegavam via Realtime e eram escritos no localStorage local
**Causa:** 18 handlers não tinham check `isRemoteFromCurrentBranch()` — customers, suppliers, financial, scanned_boletos, credit_payments, nf_records, footer_messages, media_devices, printers, tables, customer_sessions, digital_menu_config, branch_themes, api_keys, delivery_neighborhoods, delivery_distance_rates, delivery_orders, module_visibility
**Regra:** Todo handler `update*FromRemote` para tabela branch-scoped DEVE ter `isRemoteFromCurrentBranch(row)` check após `setChangeSource('remote')`.
**Local:** `storageService.ts` (corrigido — 18 handlers)

### BUG-025: removeCaixaFromRemote e removeUserFromRemote sem branch check
**Sintoma:** DELETE de outra filial fechava caixa local ou removia usuário local
**Causa:** `removeCaixaFromRemote` só checava session.id, `removeUserFromRemote` não checava branch
**Regra:** Todo handler `remove*FromRemote` para tabela branch-scoped DEVE ter `isLocalItemInCurrentBranch()` check.
**Local:** `storageService.ts` (corrigido)

### BUG-026: is_superadmin() SQL verificava organization_id IS NULL
**Sintoma:** Superadmin com organization_id setado no DB não tinha RLS bypass
**Causa:** `is_superadmin()` checava `superadmin = true AND organization_id IS NULL`, mas o superadmin pode ter org setada
**Regra:** `is_superadmin()` deve checar apenas `superadmin = true` (alinhado com frontend `isSuperAdmin()`)
**Local:** `RLS_FIXES.sql` (corrigido)

### BUG-RLS-001: product_lots policy permissiva (VULNERABILIDADE)
**Sintoma:** Qualquer usuário autenticado lia todos product_lots de todas as organizações
**Causa:** Policy "Allow read for authenticated" com `USING (true)` — sem filtro de org/branch
**Regra:** NUNCA criar policies com `USING (true)` em produção. Sempre filtrar por `organization_id` e `store_branch_id`.
**Local:** Supabase `product_lots` table (fix: DROP policy + criar policies corretas via RLS_FIXES.sql)

### BUG-RLS-002: INSERT policies sem store_branch_id check
**Sintoma:** Usuário podia inserir dados em qualquer filial dentro da sua organização
**Causa:** INSERT policies verificavam apenas `organization_id = get_user_org_id()` sem branch check
**Regra:** INSERT policies devem incluir `AND (store_branch_id = get_user_branch_id())` no WITH CHECK. Exceção: sale_items usa subquery com junction.
**Local:** Todas as tabelas branch-scoped (fix: RLS_FIXES.sql)

---
*Este documento é orientação duradoura para o projeto, não um scratchpad.*