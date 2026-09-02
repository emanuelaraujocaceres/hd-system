# HD-System Agents Reference

## Workflow
- Sempre executar `git push` ao final de cada alteração (commit, arquivo novo, mudança de config, etc.)
- Restore point de referência (sincronização tempo real + offline/online OK): tag `restore-point-realtime-ok`
- **Referência do Supabase:** O arquivo `SUPABASE_SCHEMA.md` na raiz do projeto contém a estrutura completa do banco (tabelas, colunas, tipos, RPCs, views). DEVE ser atualizado a cada migration aplicada. Antes de criar/modificar qualquer tabela, consultar este arquivo primeiro.
- **Sem IA neste aplicativo:** Decisão do usuário (2026-08-22). Não usar LLMs/visão computacional (Gemini, OpenAI, etc.) nem features de reconhecimento de produto por imagem. A função `functions/api/ai/scan-product.ts` (Gemini) foi removida intencionalmente — não reintroduzir. Busca de imagens por termo (Wikimedia Commons) no cadastro de produtos NÃO é IA e pode permanecer.
- **OCR determinístico (Tesseract.js) é permitido:** O escaneamento de documento/NF (`src/services/ocrService.ts` + `src/lib/ocr/*`) usa Tesseract.js, um motor OCR determinístico local (não é LLM/IA generativa), então NÃO viola a regra acima. Não usar APIs de visão (Gemini/OpenAI) para isso.

- **Scanner de documento A4 (`NFMultiCaptureModal`):** workflow completo — câmera fullscreen com overlay proporcional a A4, detecção de bordas + auto-capture (no `canvasRef`, polling ~30fps), correção de perspectiva/contraste via `enhanceCapturedImage`, OCR via `ocrService.ts`, revisão editável e `onCaptured(pages, templateId, accessKey?, ocrResult?)`. O `NFAddModal` auto-preenche o formulário a partir do `ocrResult`. Padrões relevantes: `detectDocumentEdges()` (sampling de brilho, sem bibliotecas externas), `enhanceCapturedImage()` (crop + contraste).

- **Câmera do Estoque é dual-mode (`StockCameraScannerModal`):** o botão "Entrada por Câmera / NF" abre um seletor — **Código de Barras** (fluxo original) ou **Documento A4 / NF do Fornecedor** (`StockDocScannerModal`). O modo A4 captura o papel (reusa os helpers compartilhados de `src/lib/ocr/capture.ts`: `detectDocumentEdges`/`enhanceCapturedImage`), roda OCR, mostra revisão editável (fornecedor, CNPJ, itens), faz **match de fornecedor** (cria em Clientes/Fornecedores/CRM via `storageService.saveSupplier` se não existir) e **match de produtos por nome exato + fuzzy** (`src/lib/ocr/matchProducts.ts` → `matchItemToProducts`), com confirmação e ajuste de quantidades antes de gravar (produto existente → `updateStock`; novo → `saveProduct`).
- **Helpers de imagem compartilhados:** `detectDocumentEdges`, `enhanceCapturedImage` e o tipo `DetectedDoc` vivem em `src/lib/ocr/capture.ts` (NÃO duplicar). `matchItemToProducts` (exato + fuzzy por tokens, testável) vive em `src/lib/ocr/matchProducts.ts`. Qualquer novo scanner deve reusar esses helpers, nunca recriá-los.

## 🛡️ Princípio SRE — "Primeiro, não cause danos" (Site Reliability Engineering)

Regra de ouro para **TODAS as alterações futuras**: antes de corrigir o problema o mais rápido possível, garantir que a correção **não introduza novos problemas** em nenhuma outra parte do sistema. Este é um app **multi-tenant rigoroso** com 3 perfis — **Superadmin** (acesso global a todas as organizações/filiais), **Administrador de Organização** (todas as filiais da sua org) e **Colaborador de Filial** (apenas sua filial) — e sincronização **local-first** sobre Supabase Auth / RLS / Realtime + Cloudflare Workers. Qualquer alteração pode afetar autenticação, isolamento de dados, tempo real e telas de PDV / Estoque / Financeiro / Relatórios.

Antes de escrever uma linha, siga o checklist obrigatório abaixo.

### 1. Mapeamento de Dependências (Leitura Obrigatória)
Antes de alterar qualquer função/classe, liste **todas** as chamadas a ela:
```bash
grep -rn "nomeDaFuncao" src/                 # chamadas em TS/TSX
grep -rn "saveProduct\|getBranches" src/     # exemplo real
```
Classifique cada chamada em:
- **Telas de leitura** (listar produtos, clientes, filiais…)
- **Telas de gravação** (criar/editar usuários, produtos, vendas…)
- **Sincronização em tempo real** (handlers `*FromRemote`, Realtime, WebSocket)
- **Testes automatizados** existentes (`*.test.ts`)

Se a função for usada em Realtime, qualquer mudança de assinatura/comportamento pode quebrar a hidratação ou o canal — trate como de **alto risco**.

### 2. Análise de Impacto por Perfil (Multi-tenant)
Responda por escrito **antes** de codar:
- *"Quem será afetado?"* (Superadmin? Admin? Colaborador? Todas as filiais?)
- *"A mudança quebra o isolamento de dados entre organizações ou filiais?"* → Se quebrar, a alteração está **PROIBIDA**.
- *"Qual o pior cenário se a alteração falhar?"* (ex.: vazamento de dados de outra org, canal Realtime em `CHANNEL_ERROR` em loop, vendas duplicadas).

Sempre valide contra as **Regras de sincronização** (RLS obrigatório, `isRemoteFromCurrentBranch`, publicação `supabase_realtime`, `REPLICA IDENTITY FULL`, ressuscitação do Realtime) deste arquivo.

### 3. Escopo Mínimo (Navalha de Occam)
- **Nunca** refatore ou "melhore" código fora do problema.
- **Nunca** altere arquivos que não são estritamente necessários.
- Se a correção exige 5 arquivos, altere **apenas** esses 5. Não "aproveite" para organizar imports, renomear variáveis ou mexer em lint cosmético.

### 4. Proibições Absolutas (Segurança em Primeiro Lugar)
- ❌ **Não altere RLS, migrations ou funções SQL** sem autorização explícita + backup prévio do banco.
- ❌ **Não execute SQL de escrita** (`UPDATE/DELETE/ALTER/DROP`) em produção sem transação e script de rollback planejado.
- ❌ **Não ignore** erros de console, `lint` ou testes "só para testar rápido".
- ❌ **Não proponha mudanças arquiteturais** (ex.: trocar localStorage→IndexedDB, Context→Redux) para resolver um bug pontual.

### 5. Testes Automatizados (Não Negociável)
Cada nova lógica precisa de **pelo menos**:
- 1 teste de cenário feliz (funciona como esperado)
- 1 teste de cenário de falha (dados faltando, permissão negada, branch errada)

E **execute** antes de finalizar:
```bash
npm run lint     # tsc --noEmit (typecheck)
npm test         # vitest run
```
Se algum falhar, **a correção não pode ser entregue** (mesmo que "pareça funcionar"). Use `src/services/storageService.*.test.ts` como base de regressão (blindagem de mappers de sync).

### 6. Backward Compatibility
- A mudança não pode quebrar o comportamento esperado para **nenhum** perfil existente.
- Teste mental: *"O que acontece se um admin comum fizer isso? E um colaborador?"*
- **Nunca** remova campos/parâmetros antigos; adicione novos com **defaults seguros**. Prefira logs/silencioso a `throw` quando possível — mas `throw` é aceito para **bloquear escrita ilegal**, desde que o caller tenha `try/catch` com mensagem amigável ao usuário.

### 7. Estratégia de Rollback
Sempre documente a reversão rápida:
- **Frontend:** `git revert <commit-hash>` (cria commit de reversão, sem `--force`).
- **SQL:** prepare o script `ROLLBACK`/revert antes de aplicar; rode em transação.
- **Realtime/Cloudflare:** mantenha a versão anterior deployada; prefira recompor versão a hotfix em produção.

### 8. Relatório de Risco e Conformidade (Entregável Obrigatório)
Antes de marcar a tarefa como concluída, gere um relatório contendo:
1. **Arquivos alterados** (lista completa).
2. **Justificativa** de por que cada alteração foi necessária.
3. **Riscos identificados** (ex.: "afeta Estoque porque `X` é usada lá"; impacto em Realtime/hidratação).
4. **Evidências** de que `npm run lint` e `npm test` passaram (logs).
5. **Estratégia de rollback** detalhada.

> Exemplo de como pensar: *"Vou alterar `getBranches()`. Ela é usada em `Dashboard`, `Relatórios` e `handleLoginSuccess`. Minha mudança só adiciona um `if` para o contexto do superadmin; o fluxo do admin/colaborador fica igual. Escrevo teste simulando login de superadmin (só filiais da org selecionada) e de admin (sem regressão). Rolo back via `git revert` se quebrar."*

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
    **EXCEÇÃO ÚNICA DOCUMENTADA — Cardápio anon:** o cardápio digital/delivery roda SEM sessão autenticada no celular do cliente (chave anon). `process_sale_transaction` e `fn_insserir_dlq` MANTÊM `GRANT EXECUTE TO anon` — são as únicas vias de escrita atômica/estoque do fluxo do cardápio (o front anon não tem UPDATE em products; a RPC deduz estoque via SECURITY DEFINER). Ao endurecer RPCs, NUNCA revogar anon dessas duas. Referência: `migrations/20260815_cardapio_anon_rls.sql` + `supabase/legacy-sql/FIX_20260819_cardapio_anon_restore.sql`.

0f. **Cardápio anon — escopo de leitura por header `x-branch-id` (NÃO escopar escrita anon).** As LEITURAS anon do cardápio (`PublicMenuView.tsx`: produtos, `digital_menu_config`, filial-por-id) enviam o header `x-branch-id` = `store_branch_id` resolvido da rota (`#/delivery/<id>` / `#/mesa`). As policies `*_select_anon` (products, categories, customer_sessions, digital_menu_config, sale_items, sales) são escopadas por `store_branch_id = public.cardapio_branch_from_header()` — função que lê `current_setting('request.headers', true)::json->>'x-branch-id'`. Isso fecha o vazamento de leitura entre filiais. REFERÊNCIA: `migrations/20260821_scope_anon_select_rls.sql`.
    **GOTCHA CRÍTICO — NUNCA escopar os INSERT anon do cardápio por header:** as ESCRITAS do cardápio (venda, item, sessão, estoque) usam o Supabase JS client (`syncService.upsertRow`), que **NÃO envia** o header `x-branch-id` — a filial vai no PAYLOAD (`store_branch_id`), não no header. Por isso as policies `sales_insert_anon`, `sale_items_insert_anon`, `customer_sessions_insert_anon`, `stock_movements_insert_anon` DEVEM permanecer `WITH CHECK (true)`. Escopar o `WITH CHECK` do INSERT por `x-branch-id` QUEBRA o pedido do cliente anon (RLS nega o INSERT). Se no futuro o cliente JS passar a enviar o header nas escritas, estas policies podem ser escopadas — até lá, manter permissivas.
    **EXCEÇÃO PERMISSIVA (USING true) DOCUMENTADA:** `store_branches_select_anon` e `tables_select_anon` permanecem `USING (true)` por necessidade do fluxo — o fallback legado lista TODAS as filiais sem header (quando `filialId` está vazio) e o lookup de mesa é por `qr_token` ANTES de se conhecer a filial. NÃO escopar essas duas ou o cardápio quebra. (Isto relaxa a regra 0b para estes dois casos específicos e intencionais.)

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

### BUG-033: Filiais invisíveis para usuário autenticado (2026-08-19)
**Sintoma:** Usuária logada (org não-default) não vê NENHUMA filial; org default "funciona" normalmente
**Causas:**
1. Policy org-scoped de `store_branches` (`org_select_branches`) SUMIU do banco — restavam só `store_branches_select_anon` (anon, cardápio) e `superadmin_all_branches`. SELECT com JWT de usuário comum → 0 linhas → hidratação sem filiais → lista vazia.
2. A org default (Adega) mascarava o problema: quando `fetchRows('store_branches')` volta vazio, o prune da hidratação é PULADO e os `INITIAL_BRANCHES` locais sobrevivem — orgs não-default caem com lista zerada.
3. Usuários criados pelo fluxo SQL antigo tinham `system_users.id ≠ auth.users.id` (UUID aleatório sem conta Auth) → `auth.uid()` não acha a linha → `get_user_org_id()` NULL → login Supabase falha fechado (`get_my_profile`).
**Regras:**
- `store_branches` DEVE ter SEMPRE as policies org-scoped (`org_select/insert/update/delete_branches`, `TO authenticated`, condição `organization_id = get_user_org_id()`) — verificar em `pg_policies` antes de qualquer alteração de RLS nessa tabela.
- NUNCA criar usuário/usuario sem criar a conta no Supabase Auth com o MESMO UUID (`system_users.id` = `auth.users.id`). Criação de org/usuário é via Cloudflare Function `/api/admin/create-organization` e `/api/admin/create-user` (IDs consistentes) — NÃO usar o RPC SQL antigo `admin_create_organization`/`admin_add_user` que gera UUID aleatório.
- Hidratação/prune de branches depende de RLS: `fetchRows` vazio pode mascarar policies faltando em orgs default — validar as policies em `pg_policies` antes de qualquer alteração de RLS em `store_branches`.
**Local:** `supabase/RLS_FIXES.sql:1179-1214` (policies originais), `supabase/legacy-sql/FIX_20260819_store_branches_policies.sql` (recreated), `functions/api/admin/create-organization.ts` + `create-user.ts` (fluxo correto)

### BUG-034: Admin/Manager bloqueado em Financeiro/Dashboard/Configurações/Usuários/Filiais (2026-08-27)
**Sintoma:** Admin (e manager) consegue ver as abas no Sidebar, mas ao clicar recebe "Acesso Restrito" (página bloqueada). Colaborador normal.
**Causa:** O guard de página `hasAccessToTab` em `App.tsx` só fazia bypass de `superadmin`. Para `admin`/`manager` ele caía no default restrito de colaborador (`DEFAULT_COLLABORATOR_PERMISSIONS` + `user.permissions`) e retornava `false` para finance/dashboard/settings/users/branches. A Sidebar usa `PermissionEngine` (que dá acesso total ao admin) → inconsistência "menu aparece, página bloqueia".
**Regra (NUNCA reintroduzir):**
- A decisão de acesso por aba é feita EM ÚNICO lugar: `src/lib/tabAccess.ts` (`canAccessTab`). `App.tsx` apenas chama `canAccessTab(user, getEffectiveModuleVisibility(), tab)`.
- Admin/Manager têm acesso total na org. A FONTE É O ROLE (`user.role`), **NUNCA** `user.permissions` (que pode ser `null` ou o default de colaborador persistido no login). `PermissionEngine` já ignora `user.permissions` para admin — o guard de página agora também.
- Module visibility por filial (`module_visibility`) é respeitada por TODOS os não-superadmin, inclusive admin/manager (módulo desligado na filial some para todos — comportamento intencional).
- NUNCA ler `user.permissions` para decidir acesso de admin/manager no frontend.
- **Configurações (`settings`) é exceção explícita (regra B): SOMENTE admin/manager/superadmin.** O colaborador NUNCA acessa Configurações, independente de `user.permissions` (o órfão `adminjuninho` tinha `system_users.permissions.settings=true` e mesmo assim não pode ver). Tanto `tabAccess.canAccessTab` (guard de página, retorna `false` no switch do colaborador) quanto `PermissionEngine` (força `permsMap.settings = false` no branch do colaborador) negam settings para não-admin — manter os dois em acordo.
**Local:** `src/lib/tabAccess.ts` (novo), `src/App.tsx` (guard usa `canAccessTab`), `src/lib/tabAccess.test.ts` (regressão: 9 testes), `src/lib/iam.ts` (PermissionEngine força settings=false p/ não-admin). Commit posterior a 5de88fd.

### BUG-035: Fiado pago no FiadosView mas "Contas a Receber (Pendente)" mostra resíduo (ex.: R$4)
**Sintoma:** No Financeiro, o KPI "Contas a Receber (Pendente)" exibe um valor residual (ex.: R$4,00) mesmo sem fiado em aberto; o FiadosView mostra o cliente totalmente quitado.
**Causa:** Divergência de escopo entre os dois fluxos. O Financeiro soma as contas `financial` (type='receivable', status='pending', amount) — calculadas **por venda** (`getTotalPaidForSale(saleId)` = credit_payments com aquele MESMO saleId). O FiadosView quita no **nível do cliente** (agrega credit_payments por `customerId` e aloca FIFO entre todas as vendas do cliente). Quando um pagamento é taggeado no `saleId` vizinho (ou split), a conta a receber daquela venda ficava presa em `pending` com o resíduo, embora o cliente já estivesse quitado no FiadosView. `getFinancialAccounts()` filtra por filial → o resíduo é real da filial, não vazamento.
**Regra (NUNCA reintroduzir):** A baixa de conta a receber de fiado **DEVE reconciliar no nível do CLIENTE**, não só por `saleId`. Antes de marcar `remaining`, checar `isCustomerCreditSettled(sale)`: se o cliente tem `sum(credit_payments por customerId) >= sum(getFiadoAmount das vendas dele)`, zera `remaining` → `status='paid'`/`amount=0`. Aplicar em AMBOS `createReceivableFromSale` e `updateReceivableFromPayments` (assim `backfillReceivablesFromSales` na hidratação também não recria o resíduo). NUNCA zerar/paid quando o cliente está PARCIALMENTE quitado (preserva o resíduo real via per-sale).
**Local:** `src/services/storageService.ts`: novo `isCustomerCreditSettled(sale)` (~4387), `createReceivableFromSale` (~4411), `updateReceivableFromPayments` (~4489). Regressão: `src/services/storageService.branch.test.ts` (2 testes novos — cliente quitado vira paid / parcial continua pending).

---

## Regra de acesso (anti-recorrência BUG-034)
**Regra:** `canAccessTab` (guard de página) e `PermissionEngine.canAccessTab` (Sidebar/atalhos) DEVEM concordar. Se mudar um, mude o outro ou chame a mesma função. Para admin/manager, o critério é SEMPRE o `role`, não `permissions`. Qualquer novo módulo de navegação deve ser adicionado no `TAB_VISIBILITY_KEY` de `tabAccess.ts` e no `TAB_MODULE_MAP` de `iam.ts` (manter 1:1). **Configurações (`settings`) é exceção explícita: SOMENTE admin/manager/superadmin; ambos os lugares negam settings para colaborador (regra B), independente de `user.permissions`.**



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

## Blindagem / Prevenção de regressão

**Regra OBRIGATÓRIA — coluna nova em tabela sync deve entrar nos 3 caminhos:** qualquer coluna adicionada a uma tabela sincronizada (ex.: `module_visibility`, `sales`, `financial`, `stock_loss_log`, etc.) DEVE ser adicionada em TODOS estes pontos, senão ela é "dropada" silenciosamente e o dado some após reset/hidratação:
1. **Upsert payload** — `saveX()` / `syncX()` (o que vai pro `syncService.upsertRow`).
2. **Mapper remoto** — `update*FromRemote()` (realtime).
3. **Mapper de hidratação** — o bloco dentro de `hydrateFromCloud` (`mergeBy` ou o helper `mapSaleFromCloud`).
4. Quando aplicável: `DEFAULT_*`, `getEffective*`, e o tipo em `src/types/index.ts`.

**Checklist pré-deploy (rodar antes de subir):**
- `npm run lint` (tsc --noEmit) — typecheck.
- `npm test` (vitest run) — a suíte inclui `src/services/storageService.sync.test.ts` que trava o padrão acima.

**Bugs de "coluna dropada" já corrigidos (NUNCA reintroduzir):**
- `module_comanda` (Comandas): faltava no upsert, no `updateModuleVisibilityFromRemote` e no mapper de `hydrateFromCloud` — corrigido em `saveModuleVisibility`, `updateModuleVisibilityFromRemote` e no mapper de hidratação (commits afe4688 / 20f427c).
- `sales`: hidratação dropava `table_id`/`customer_session_id`/`order_source`/`kitchen_status`/`organization_id` → comanda/mesa perdia vínculo e KDS perdia status após reset. Corrigido extraindo `mapSaleFromCloud` (ponto único de mapeamento).
- `financial`: `updateFinancialFromRemote` dropava `recurrences`/`installments` (arrays de recorrência/parcelamento) → UPDATE remoto apagava esses dados. Corrigido.
- `stock_loss_log`: `updateStockLossLogFromRemote` e a hidratação dropavam `product_id`/`lot_id`/`store_branch_id`/`organization_id` → log perdia vínculo de produto e isolamento de filial. Tipo estendido em `src/types/index.ts` e mappers corrigidos.

**Guard de runtime:** `getEffectiveModuleVisibility()` emite `console.warn` se o registro gravado estiver sem alguma coluna do `DEFAULT_MODULE_VISIBILITY` (canário de drift de schema).

---

*Este documento é orientação duradoura para o projeto, não um scratchpad.*