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
9. **RPC SECURITY DEFINER NUNCA com GRANT PUBLIC/anon.** Funções de escrita (ajustar_estoque, process_sale_transaction, fn_insserir_dlq, backups, admin_*, etc.) só para `authenticated` + `service_role` — e SEMPRE com validação de org+branch no corpo (ou guard de superadmin/service_role) para quem não é superadmin. Funções exclusivas de servidor (gerar_token_e_criar_sessao, reprocessar_movimentacoes_falhas, debug_auth) ficam SÓ com service_role. Tratar funções de trigger corretamente: fechar PUBLIC/anon mas manter EXECUTE para authenticated/service_role (o DDL/DML que dispara o trigger roda como quem executou). Em REVOKE/GRANT com funções overloaded, SEMPRE especificar a assinatura (ex.: `public.ajustar_estoque(uuid, integer, text, text, text, uuid, uuid)`), senão erro 42725. NUNCA usar segredo hardcoded em funções que assinam JWT — usar `current_setting('app.jwt_secret', true)` e falhar fechado.

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

### BUG-028: Console spam + module visibility + hydration loops + table duplication (2026-08-16)
**Sintoma:** Console inundado de logs "getCurrentOrgId()", module visibility não atualizava Sidebar, hidratação rodava 2x, mesas duplicadas no banco
**Causas:**
1. `getCurrentOrgId()` re-parsava localStorage a cada chamada (amplificado por notify())
2. `saveModuleVisibility()` não chamava `this.notify()` — Sidebar não re-renderizava
3. `runHydration()` chamado no mount + session restore sem guard anti-duplicação
4. `resubscribeRealtime()` chamado múltiplas vezes sem dedup de org/branch
5. `saveTable()` deduplicava apenas por `id`, não por `name` — UI criava novos IDs a cada chamada
**Regas ( padrões defensivos obrigatórios):**
```typescript
// ✅ PADRÃO: Cache para operações custosas chamadas frequentemente
private _cache: { key: string; value: any } | null = null;
getCurrentExpensiveOp() {
  const raw = localStorage.getItem('key');
  if (this._cache && this._cache.key === raw) return this._cache.value;
  const result = /* cálculo */;
  this._cache = { key: raw, value: result };
  return result;
}
// Invalidar em: saveUserProfile(), logout(), superadminSetViewingOrg()

// ✅ PADRÃO: Toda escrita em localStorage DEVE chamar notify()
saveX(x: X) {
  this.set(KEY, data);
  this.notify();  // ← OBRIGATÓRIO senão UI não atualiza
  syncService.upsertRow(...);
}

// ✅ PADRÃO: Guard anti-duplicação para operações async
const hydrationDoneRef = useRef<boolean>(false);
const runOp = useCallback(async (force = false) => {
  if (hydrationDoneRef.current && !force) return;
  // ... operação
  hydrationDoneRef.current = true;
}, []);
// Chamadas que precisam forçar: login, branch switch, org switch

// ✅ PADRÃO: Guard anti-resubscribe para conexões
const lastSubscribedRef = useRef<{ a?: string; b?: string } | null>(null);
if (!lastSubscribedRef.current || lastSubscribedRef.current.a !== a) {
  subscribe(a, b);
  lastSubscribedRef.current = { a, b };
}

// ✅ PADRÃO: Dedup por nome em entidades que o UI cria com IDs novos
getEntities(): Entity[] {
  const raw = this.get<Entity[]>(KEY, []);
  const seen = new Map<string, number>();
  for (let i = 0; i < raw.length; i++) {
    const key = (raw[i].name || '').trim().toLowerCase();
    if (seen.has(key)) { /* manter mais recente */ }
    else seen.set(key, i);
  }
  return this.filterByBranch(this.filterByOrg(raw));
}
```
**Local:** `storageService.ts`, `syncService.ts`, `App.tsx` (corrigido — commit d121573)


### BUG-029: costPrice/salePrice ReferenceError no InventoryView (2026-08-17)
**Sintoma:** `ReferenceError: costPrice is not defined` ao salvar produto no Estoque
**Causa:** Shorthand properties `{costPrice, salePrice}` em objeto `newProd` referenciavam variáveis não declaradas no escopo
**Regra:** Shorthand properties referenciam variáveis, não propriedades de estado. SEMPRE declarar variável antes de usar shorthand.
**Local:** `InventoryView.tsx:457-458` (corrigido — `const costPrice = parseBrlToNumber(...)`)

### BUG-030: salePrice: price ReferenceError no QuickProductModal (2026-08-17)
**Sintoma:** `ReferenceError: price is not defined` ao cadastrar produto rápido no PDV
**Causa:** `salePrice: price` — variável `price` não existe; o state é `salePrice` (useState)
**Regra:** Ao usar variável de state como valor de propriedade, usar a variável correta ou converter com fallback.
**Local:** `QuickProductModal.tsx:82` (corrigido — `parseFloat(salePrice.replace(',', '.')) || 0`)

### BUG-031: Toasts invisíveis — 100+ call sites com assinatura errada (2026-08-17)
**Sintoma:** Toasts não aparecem em nenhum lugar do app
**Causa:** `addToast` esperava objeto `{type, msg}` mas 100+ chamadas passavam `addToast('error', 'msg')`. Toasts renderizavam como caixas vazias.
**Regra:** Toasts usam react-hot-toast. Usar métodos nomeados (`success()`, `error()`, etc.) ou `addToast('type', 'msg')` (posicional). NUNCA `addToast({type, msg})`.
**Local:** `Toast.tsx` (corrigido — migrado para react-hot-toast, aceita AMBAS as assinaturas)

### BUG-032: SettingsView usa addToast sem importar useToast (2026-08-17)
**Sintoma:** `ReferenceError: addToast is not defined` ao salvar holerite ou copiar URL
**Causa:** 3 call sites de `addToast` sem `import { useToast }` nem destructuring
**Regra:** Toda função que usa `addToast` DEVE ter `const { addToast } = useToast()` no corpo do componente.
**Local:** `SettingsView.tsx:476,481,3279` (corrigido — import + destructuring adicionados)

---

## Padrões Defensivos Obrigatórios

### SQL: Verificar schema ANTES de escrever
**Regra:** NUNCA assumir que uma coluna/tabela/constraint existe. Sempre verificar:
```sql
-- 1. Verificar se tabela existe
SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'minha_tabela');

-- 2. Verificar colunas
SELECT column_name, data_type, is_nullable
FROM information_schema.columns WHERE table_name = 'minha_tabela';

-- 3. Verificar constraints (FK, UNIQUE, etc.)
SELECT conname, contype, pg_get_constraintdef(oid)
FROM pg_constraint WHERE conrelid = 'minha_tabela'::regclass;

-- 4. Verificar policies RLS
SELECT policyname, cmd, qual, with_check
FROM pg_policies WHERE tablename = 'minha_tabela';
```

### SQL: Cleanup scripts devem respeitar dependências
**Regra:** Antes de DELETE, verificar FKs que referenciam a tabela:
```sql
-- Verificar o que referencia esta tabela
SELECT
  tc.table_name AS referencing_table,
  kcu.column_name AS referencing_column,
  ccu.table_name AS referenced_table
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND ccu.table_name = 'tabela_que_vou_deletar';
```

### Frontend: Padrões anti-loop
**Regra:** Toda operação async que pode ser chamada múltiplas vezes DEVE ter guard:
1. `useRef<boolean>` para marcar conclusão
2. Parâmetro `force = false` para chamadas que precisam re-executar
3. Verificar se já está no estado desejado antes de executar

### Frontend: Toda escrita local DEVE notificar
**Regra:** Qualquer `this.set(KEY, data)` em `storageService.ts` DEVE ser seguido de `this.notify()` — senão hooks React não re-renderizam.

### Frontend: Toasts — usar react-hot-toast via useToast()
**Regra:** O sistema de toasts usa react-hot-toast. O hook `useToast()` retorna `{ success, error, warning, info, addToast }`. Usar SEMPRE os métodos nomeados:
```typescript
// ✅ CORRETO
const { success, error, warning, info } = useToast();
success('Produto salvo!');
error('Erro ao salvar');

// ✅ TAMBÉM FUNCIONA (compatibilidade legada)
const { addToast } = useToast();
addToast('error', 'mensagem');
addToast('success', 'mensagem');

// ❌ ERRADO — objeto não é aceito pelos métodos nomeados
toastInfo({ type: 'info', message: 'msg' });
```

### Frontend: Variáveis shorthand devem existir no escopo
**Regra:** Ao usar shorthand `{costPrice}` em objeto, SEMPRE verificar que a variável `costPrice` foi declarada no escopo. Não confundir com propriedade de estado (`const [salePrice, setSalePrice]`) — shorthand referencia variável, não estado.
```typescript
// ❌ ERRADO — salePrice é useState, não variável solta
const [salePrice, setSalePrice] = useState('');
const obj = { salePrice }; // ReferenceError!

// ✅ CORRETO — declarar variável no escopo
const salePrice = parseBrlToNumber(formSalePrice);
const obj = { salePrice }; // OK
```

### Frontend: Audio usa Web Audio API (não <audio> tags)
**Regra:** O sistema de áudio (`src/services/audioService.ts`) usa oscillators Web Audio API. NÃO existem arquivos .mp3/.wav. Se o som não toca, verificar: (1) `posAudio.enabled` no header, (2) interação do usuário (autoplay policy), (3) `posAudio.unlock()` foi chamado.

---

*Este documento é orientação duradoura para o projeto, não um scratchpad.*