# HD-System: Runbook de Troubleshooting

> Guia rápido para resolver problemas comuns. Cada seção tem: Sintoma → Causa → Solução → Prevenção.

---

## 🔴 ERROS DE BANCO DE DADOS

### Erro 23503: foreign key constraint violates

**Sintoma:** `update or delete on table "X" violates foreign key constraint "Y_fkey" on table "Z"`

**Causa:** Tentando deletar uma tabela que é referenciada por outra tabela via FK.

**Solução:**
```sql
-- 1. Descobrir qual tabela referencia
SELECT tc.table_name, kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND ccu.table_name = 'tabela_que_vou_deletar';

-- 2. Reatribuir ou deletar os registros referenciados PRIMEIRO
UPDATE tabela_dependente SET fk_column = NULL WHERE fk_column = 'id_da_tabela';
-- ou
DELETE FROM tabela_dependente WHERE fk_column = 'id_da_tabela';

-- 3. Agora sim deletar a tabela original
DELETE FROM tabela_original WHERE id = 'id';
```

**Prevenção:** SEMPRE verificar FKs antes de escrever scripts de cleanup (ver `AGENTS.md`).

---

### Erro 23505: unique constraint violates

**Sintoma:** `duplicate key value violates unique constraint "nome_constraint"`

**Causa:** Tentando inserir um registro que viola uma constraint UNIQUE.

**Solução:**
```sql
-- 1. Ver qual constraint está sendo violada
SELECT conname, contype, pg_get_constraintdef(oid)
FROM pg_constraint WHERE conrelid = 'tabela'::regclass;

-- 2. Verificar registros existentes que conflitam
SELECT coluna, COUNT(*) FROM tabela GROUP BY coluna HAVING COUNT(*) > 1;

-- 3. Decidir: atualizar existente ou deletar duplicata
UPDATE tabela SET coluna = 'novo_valor' WHERE id = 'id_conflitante';
-- ou
DELETE FROM tabela WHERE id = 'id_duplicado';
```

**Prevenção:** Usar `UPSERT` (INSERT ... ON CONFLICT) em vez de INSERT puro.

---

### Erro 42P01: relation does not exist

**Sintoma:** `relation "tabela" does not exist`

**Causa:** Tabela não existe no schema ou foi deletada.

**Solução:**
```sql
-- Verificar se a tabela existe
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables 
  WHERE table_name = 'tabela' AND table_schema = 'public'
);
```

**Prevenção:** Verificar schema ANTES de escrever SQL (ver `AGENTS.md` Seção "Padrões Defensivos").

---

### Erro 42703: column does not exist

**Sintoma:** `column "coluna" does not exist`

**Causa:** Coluna não existe na tabela (nunca foi criada ou foi renomeada).

**Solução:**
```sql
-- Verificar colunas da tabela
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'tabela';
```

**Prevenção:** Verificar schema ANTES de escrever SQL.

---

## 🔴 ERROS DE SINCRONIZAÇÃO

### Realtime não recebe eventos

**Sintoma:** Vendas de outros dispositivos não aparecem. Console mostra "Realtime disconnected".

**Causa:** Canal Realtime morto (após 10 tentativas de reconexão falharam).

**Solução:**
1. **F5** para recarregar a página (reseta tudo)
2. Se persistir, verificar no Supabase Dashboard → Realtime → se a tabela está na publicação
3. Verificar se `REPLICA IDENTITY FULL` está configurado:
```sql
ALTER TABLE tabela REPLICA IDENTITY FULL;
```

**Prevenção:** O app tem `resubscribeIfDead()` que resuscita o canal automaticamente. Se não funcionar, pode ser problema de rede.

---

### Dados de outra filial aparecendo

**Sintoma:** Vendas, produtos ou clientes de outra filial aparecem na lista.

**Causa:** Falha no filtro de branch (RLS ou client-side).

**Solução:**
1. Verificar se a filial correta está selecionada no header
2. Verificar RLS:
```sql
SELECT policyname, cmd, qual 
FROM pg_policies 
WHERE tablename = 'tabela_problema';
```
3. Verificar `store_branch_id` no registro:
```sql
SELECT id, name, store_branch_id FROM tabela WHERE store_branch_id != 'branch_esperado';
```

**Prevenção:** Todo handler `update*FromRemote` DEVE ter `isRemoteFromCurrentBranch()` check.

---

### Hidratação não carrega dados

**Sintoma:** App abre mas listas estão vazias. Console mostra "Cloud hydration skipped".

**Causa:** `checkOrgAccess()` retornou false (organização desativada) ou erro de rede.

**Solução:**
1. Verificar se a organização está ativa:
```sql
SELECT id, name, active FROM organizations WHERE id = 'org_id';
```
2. Verificar conectividade com Supabase
3. Verificar se `set_current_branch` RPC foi chamado:
```sql
SELECT current_setting('app.current_branch_id', true);
```

**Prevenção:** O app tem fallback para modo offline. Dados locais permanecem disponíveis.

---

## 🟡 ERROS DE UI

### Sidebar não atualiza após salvar configurações

**Sintoma:** Mudo a visibilidade de módulos mas a sidebar não re-renderiza.

**Causa:** `saveModuleVisibility()` não chamou `notify()` (CORRIGIDO em d121573).

**Solução:**
1. Verificar se `storageService.notify()` está sendo chamado após a escrita
2. Se o problema persistir, verificar se `useModuleVisibility` hook está subscrito corretamente

**Prevenção:** Toda escrita em localStorage DEVE ser seguida de `notify()`.

---

### Console spam de logs

**Sintoma:** Console inundado de logs `[Storage] getCurrentOrgId()`.

**Causa:** `getCurrentOrgId()` re-parsava localStorage a cada chamada (CORRIGIDO em d121573 com cache).

**Solução:** Atualizar para versão com cache (`_orgIdCache`).

---

### Mesas duplicadas

**Sintoma:** Mesma mesa aparece 2+ vezes na lista.

**Causa:** `saveTable()` deduplicava apenas por `id`, não por `name` (CORRIGIDO em d121573).

**Solução:** Executar script `CLEANUP_TABLE_DUPLICATES.sql` no SQL Editor.

**Prevenção:** Índice único `idx_tables_unique_name_branch` previne futuras duplicatas.

---

## 🟡 ERROS DE PERFORMANCE

### App lento com muitos dados

**Sintoma:** Listas demoram para carregar, scroll engasga.

**Causa:** Sem paginação — todos os registros carregados do localStorage.

**Solução (curto prazo):**
- Limitar exibição a 100-200 itens por vez
- Usar virtualização (react-window) para listas longas

**Solução (longo prazo):**
- Implementar paginação com cursor
- Usar React Query para cache granular

---

### Bundle inicial grande (>800KB)

**Sintoma:** Build mostra `index-DkmGm7n8.js` com 814KB.

**Causa:** Muitas dependências no bundle principal.

**Solução:**
- Code splitting por rota (React.lazy já usado para InventoryView)
- Lazy loading de módulos não-críticos
- Analisar bundle com `rollup-plugin-visualizer`

---

## 🟡 ERROS DE SEGURANÇA

### Usuário vê dados de outra organização

**Sintoma:** Um usuário consegue ver/alterar registros de outra organização.

**Causa:** RLS policy permissiva ou `USING (true)`.

**Solução:**
```sql
-- Verificar policies permissivas
SELECT tablename, policyname, qual
FROM pg_policies 
WHERE qual = 'true' AND tablename != 'ai_insights';

-- Dropar policy permissiva
DROP POLICY "policy_permissiva" ON tabela;

-- Criar policy correta
CREATE POLICY "org_branch_select_tabela" ON tabela
  FOR SELECT USING (
    organization_id = get_user_org_id() 
    AND store_branch_id = get_user_branch_id()
  );
```

**Prevenção:** NUNCA criar policies com `USING (true)` em produção.

---

## 📞 CONTATOS DE SUPORTE

| Problema | Contato |
|----------|---------|
| Supabase Down | https://status.supabase.com |
| Banco corrompido | Supabase Dashboard → SQL Editor |
| Dados perdidos | `filial_backups` table → restore via Settings |
| Bug no código | Criar issue no GitHub |

---

## 📋 CHECKLIST PÓS-INCIDENTE

1. ✅ Identificar causa raiz
2. ✅ Corrigir o bug
3. ✅ Atualizar AGENTS.md se for um novo padrão a evitar
4. ✅ Adicionar seção no RUNBOOK.md
5. ✅ Commit + push
6. ✅ Verificar se a correção funciona em produção
7. ✅ Documentar no AUDIT_REPORT.md
