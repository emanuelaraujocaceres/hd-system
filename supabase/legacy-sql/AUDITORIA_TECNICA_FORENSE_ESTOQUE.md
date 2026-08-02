# 🔍 AUDITORIA TECNICA FORENSE — Modulo de Estoque (HD-System)

**Data:** 2026-07-28
**Auditor:** Staff Software Engineer Sênior (Backend & Data Infrastructure)
**Escopo:** Frontend (React/Next.js), Supabase (PostgreSQL), Realtime, Sincronizacao de Estado
**Classificacao:** CONFIDENCIAL — Uso Interno

---

## Sumario Executivo

| Severidade | Qtd | Status |
|-----------|-----|--------|
| 🔴 CRITICA | 6 | Acao imediata obrigatoria |
| 🟠 ALTA | 5 | Resolver antes da proxima release |
| 🟡 MEDIA | 4 | Planejar para proximo ciclo |
| 🔵 BAIXA | 2 | Tech debt — incluir no backlog |

---

## 1. ARVORE DE FALHAS (Fault Tree Analysis)

```
┌─────────────────────────────────────────────────────────────────────┐
│                  PERDA DE INTEGRIDADE DO ESTOQUE                    │
│                    (Evento Raiz: Perda de Dados)                    │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
          ┌─────────────────────┼──────────────────────┐
          │                     │                      │
   ┌──────▼──────┐      ┌──────▼──────┐      ┌───────▼──────┐
   │  RACE       │      │  AUSÊNCIA   │      │  SINCRONIZA- │
   │  CONDITIONS │      │  DE TRX     │      │  CAO FORCADA │
   │  (Frontend) │      │  (Backend)  │      │  (Rede)      │
   └──────┬──────┘      └──────┬──────┘      └───────┬──────┘
          │                     │                      │
    ┌─────┴─────┐         ┌────┴────┐          ┌──────┴──────┐
    │           │         │         │          │             │
┌───▼───┐ ┌────▼──┐ ┌────▼──┐ ┌────▼───┐ ┌───▼────┐  ┌─────▼────┐
│ Last  │ │ Opti- │ │ No    │ │ No    │ │ No    │  │ No DLQ   │
│Writer │ │mistic │ │SELECT │ │BEGIN/ │ │Abort- │  │Operacoes │
│Wins   │ │Lock   │ │FOR    │ │COMMIT │ │Ctrl   │  │perdidas  │
│Bias   │ │Missa- │ │UPDATE │ │SERIAL │ │em     │  │em        │
│       │ │do     │ │       │ │       │ │fetch  │  │localStorage│
└───────┘ └───────┘ └───────┘ └───────┘ └───────┘  └──────────┘
```

### Sub-Arvore 1: Race Conditions no Frontend

```
┌────────────────────────────────────────────────┐
│         RACE CONDITION: ESTOQUE DUPLAMENTE     │
│              BAIXADO PELO MESMO PRODUTO         │
└───────────────────────┬────────────────────────┘
                        │
         ┌──────────────┼──────────────┐
         │              │              │
   ┌─────▼─────┐  ┌─────▼─────┐  ┌────▼──────┐
   │ Dispositivo│  │ Dispositivo│  │ Realtime  │
   │ A: Venda   │  │ B: Venda   │  │: Resposta │
   │ simultanea │  │ simultanea │  │ atrasada  │
   └─────┬─────┘  └─────┬─────┘  └────┬──────┘
         │              │              │
   ┌─────▼─────┐  ┌─────▼─────┐  ┌────▼──────┐
   │ updateStock│  │ updateStock│  │updateProduct│
   │ (localStorage)│ │(localStorage)│ │FromRemote│
   │ prev: 10   │  │ prev: 10   │  │sobrescreve│
   │ new: 7     │  │ new: 7     │  │valor local│
   └─────┬─────┘  └─────┬─────┘  └────┬──────┘
         │              │              │
         ▼              ▼              ▼
   ┌─────────────────────────────────────────┐
   │ ERRO: Estoque real = 7, mas deveria ser │
   │ 4 (ou negativo). Perda de 3 unidades.   │
   └─────────────────────────────────────────┘
```

### Sub-Arvore 2: Ausencia de Transacoes no Backend

```
┌────────────────────────────────────────────────────────┐
│       OPERACAO addSale() — 5 PASSOS NAO-ATOMICOS      │
└────────────────────────┬───────────────────────────────┘
                         │
   ┌─────────────────────┼──────────────────┐
   │                     │                  │
┌──▼──────────┐   ┌──────▼──────┐   ┌──────▼──────┐
│1. Salvar    │   │3. updateStock│   │5. Atualizar │
│  venda (LS) │   │  (cada item  │   │  sessao     │
│             │   │   separado)  │   │  caixa      │
└──┬──────────┘   └──────┬──────┘   └──────┬──────┘
   │                     │                  │
   │   ┌─────────────────┤                  │
   │   │                 │                  │
┌──▼───▼───┐   ┌────────▼────────┐  ┌──────▼──────┐
│2. Sync    │   │4. Criar         │  │6. Adicionar │
│  venda →  │   │  movimentacao   │  │  pontos     │
│  Supabase │   │  (cada item)    │  │  fidelidade │
│  (async)  │   │                 │  │             │
└───────────┘   └─────────────────┘  └─────────────┘

  RISCO: Se passo 3 falha no item 2 de 5, estoque fica
  parcialmente atualizado. Nao existe rollback.
```

### Sub-Arvore 3: Sincronizacao com Perda

```
┌─────────────────────────────────────────────┐
│    SYNCQUEUE: OPERACAO FALHA -> 3 TENTATIVAS│
└─────────────────────┬───────────────────────┘
                      │
         ┌────────────┼────────────┐
         │            │            │
   ┌─────▼─────┐ ┌───▼────┐ ┌────▼──────┐
   │ Tentativa │ │Tentat.2│ │ Tentat.3  │
   │ 1: timeout│ │ 2: 429 │ │ 3: 500    │
   │ (1s backoff)│(2s)   │ │ (4s)      │
   └─────┬─────┘ └───┬────┘ └────┬──────┘
         │            │            │
         ▼            ▼            ▼
   ┌─────────────────────────────────────┐
   │ status: 'failed'                    │
   │ Armazenado APENAS no localStorage   │
   │ Se usuario limpar cache = PERDA     │
   │ TOTAL da operacao                   │
   └─────────────────────────────────────┘
```

---

## 2. ANALISE ESTATICA DE CODIGO (Frontend / Estoque)

### 2.1 Memory Leaks nos useEffect

| Componente | Realtime? | Leak? | Detalhes |
|-----------|-----------|-------|----------|
| `App.tsx` (L210-341) | ✅ | ✅ Limpo | `cleanup` remove listener e `clearInterval` |
| `syncService.ts` (L44-48) | Constructor | ⚠️ | Registra `online`/`offline` listeners SEM cleanup. Singleton = aceitavel, mas anti-pattern. |
| `PDVView.tsx` (L570-575) | Scanner | ✅ Limpo | `stream.getTracks().forEach(stop)` + `clearInterval` |
| `InventoryView.tsx` | N/A | ⚠️ Parcial | `handleAutoSearchImage` (L267-274) usa `setTimeout` sem cleanup no unmount |

**Veredito:** Sem memory leaks criticos. O `setTimeout` no `handleAutoSearchImage` e uma fragilidade menor (o componente e lazy-loaded e raramente desmonta com timeout pendente).

### 2.2 AbortController / abortSignal

**Resultado: ZERO uso em todo o codebase.**

| Localizacao | Risco | Impacto |
|------------|-------|---------|
| `syncService.fetchRows()` (L291-308) | Baixo | Request pendente nao cancelado, mas SPA nao desmonta |
| `storageService.hydrateFromCloud()` (L587) | Baixo | `Promise.all` com 12 fetches — se 1 travar, todos esperam |
| `updateSaleFromRemote()` (L340-395) | 🟠 MEDIO | Fetch async de `sale_items` (L385-394) SEM await — possibility of state update after unmount |

**Achado Critico (L385-394 de storageService.ts):**
```typescript
// fetchItems() retorna Promise, `.then()` pode executar apos unmount
fetchItems().then((items) => {
  if (items.length > 0) {
    const updated = this.getSales();
    const found = updated.find((s) => s.id === row.id);
    if (found) {
      found.items = items;
      this.set(KEYS.SALES, updated);  // ← Pode causar "setState on unmounted"
    }
  }
});
```

Embora isso写入localStorage (nao React state), e uma pratica fragil.

### 2.3 Optimistic UI e Gerenciamento de Estado

**Arquitetura:** localStorage como Source of Truth + pub/sub via `storageService.subscribe()`

**Problemas identificados:**

1. **Last-Writer-Wins com Bias** (`updateProductFromRemote`, L283-289):
```typescript
// Preserva local se cloud mandar 0 — MASCARA dados reais
if (local.salePrice > 0 && mapped.salePrice <= 0) {
  mapped.salePrice = local.salePrice;
}
if (local.currentStock > 0 && mapped.currentStock <= 0) {
  mapped.currentStock = local.currentStock;
}
```
   **Risco:** Se um usuario de outra filial zera o estoque intencionalmente, o device local ignora a mudanca.

2. **Refresh Nuclear** (`App.tsx` L111-123): Toda mudanca no localStorage causa refresh de TODOS os 12 estados do App — ineficiente e causa "piscar" na tela.

3. **Sem versionamento**: Nenhum campo `version` ou `updated_at` e usado para detectar conflitos. E sempre "ultimo writer vence".

---

## 3. ANALISE DE INTEGRIDADE REFERENCIAL E TRANSAÇÕES

### 3.1 Transacoes BEGIN/COMMIT com SERIALIZABLE

**Resultado: NENHUMA transcacao explicita em todo o codebase.**

O Supabase JS Client encapsula cada operacao individual em sua propria transcacao implicita, mas:
- **Nao existem transacoes multi-operacao** (ex: venda + baixa estoque + movimentacao)
- Nao existe nivel de isolamento configuravel pelo cliente JS
- O unico ponto onde seria necessario e `addSale()` em `storageService.ts`

**Risco Concreto:**
```
T1: Venda A — Produto X, qtd 5, estoque 10
T2: Venda B — Produto X, qtd 8, estoque 10
T1 e T2 executam simultaneamente:
  - T1 le estoque = 10 → novo = 5
  - T2 le estoque = 10 → novo = 2
  - Resultado final: estoque = 2 (PERDA de 3 unidades)
  - Com SERIALIZABLE: T2 faria ROLLBACK por conflito
```

### 3.2 SELECT ... FOR UPDATE (Pessimistic Locking)

**Resultado: ZERO uso.** Nenhuma query usa `FOR UPDATE`, `FOR SHARE`, ou `FOR NO KEY UPDATE`.

A tabela `products` e a mais vulneravel — duas vendas simultaneas do mesmo produto nao tem protecao.

### 3.3 Triggers de Atualizacao de Estoque

**Resultado: ZERO triggers existem no banco.**

Os scripts SQL (`supabase-setup.sql`, `schema.sql`, `supabase-fix-missing-columns.sql`) nao definem nenhuma trigger. A logica de estoque e 100% client-side, o que significa:
- Qualquer usuario com acesso ao Supabase pode alterar estoque diretamente
- Nao ha validacao server-side de estoque negativo
- Nao ha audit log server-side de movimentacoes

### 3.4 Seguranca: RLS Desabilitado

**ACHADO CRITICO** (`supabase-setup.sql` L240-252):
```sql
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE categories DISABLE ROW LEVEL SECURITY;
-- ... (todas as tabelas)
```

Com a `anon key` exposta no codigo-fonte (`supabase.ts` L5), qualquer pessoa pode:
- Ler todos os dados de todas as organizacoes
- Modificar/deletar qualquer registro
- Explorar a API REST do Supabase diretamente

### 3.5 pg_cron

**Resultado: NAO UTILIZADO.** Nenhuma referencia a `pg_cron` ou jobs agendados no banco. Nao ha conflitos potenciais.

---

## 4. DIAGNOSTICO DE ERROS EM TEMPO REAL

### 4.1 Configuracao do Cliente Supabase

```typescript
// supabase.ts — SEM debug mode habilitado
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
  // FALTA: log: { level: 'all' }  para debug
});
```

**Recomendacao:** Habilitar `log.level` em desenvolvimento:
```typescript
createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true },
  global: {
    headers: { 'x-my-custom-header': 'hd-system' },
  },
});
// No console: supabase.realtime.logLevel = 'info';
```

### 4.2 Classificacao de Erros por Status

| Status | Risco no HD-System | Tratamento Atual |
|--------|-------------------|------------------|
| **500** (Server Error) | Queue retry com backoff | ⚠️ Enfileira 3x, depois marca `failed` sem alerta ao usuario |
| **429** (Rate Limit) | Realtime pode desconectar | ⚠️ Sem tratamento especifico — cai no retry generico |
| **409** (Conflict/ETag) | Conflito de versao entre devices | ❌ NAO TRATADO — upsert silenciosamente sobrescreve |

### 4.3 WebSocket / Realtime TTL

O `syncService` (L131-142) monitora o status do canal:
```typescript
this.channel.subscribe((status) => {
  if (status === 'SUBSCRIBED') { this._connected = true; }
  else if (status === 'CHANNEL_ERROR') { /* warn, retry */ }
  else if (status === 'TIMED_OUT') { /* warn, retry */ }
});
```

**FALTA:** Nao existe tracking de:
- TTL das mensagens (latencia entre INSERT no DB e recepcao no client)
- Heartbeat monitoring
- Reconexao automatica com exponential backoff (usa retry do Supabase)

### 4.4 Diagnostico Disponivel

O arquivo `syncDiagnostic.ts` oferece ferramentas para o console do navegador:
```javascript
// No console do navegador (F12):
(await import('./services/syncDiagnostic')).syncDiagnostic.runAll()
```
Gera relatorio completo de todas as 12 tabelas com status de sync.

---

## 5. SCRIPT SQL IDEMPOTENTE — RECALCULO DE ESTOQUE (Event Sourcing)

O script completo esta disponivel em: **`recalcular_estoque_event_sourcing.sql`**

Resumo do que ele faz:
1. Cria a funcao `fn_recalcular_estoque_produto()` — recalcula estoque de 1 produto
2. Cria a funcao `fn_recalcular_estoque_geral()` — recalcula TODOS os produtos
3. Cria a tabela `reconciliation_log` para auditoria
4. Pode ser executado multiplas vezes sem efeitos colaterais (idempotente)
5. Gera relatorio de divergencias entre estoque declarado e calculado

---

## 6. DEAD LETTER QUEUE (DLQ) — `movimentacoes_falhas`

O script completo esta disponivel em: **`dlq_movimentacoes_falhas.sql`**

Inclui:
1. Tabela `movimentacoes_falhas` com:
   - `operation_type` (INSERT/UPDATE/DELETE)
   - `table_name` (products/stock_movements/etc)
   - `payload` (JSONB do registro que falhou)
   - `error_message` + `error_code`
   - `stack_trace` (para erros JS)
   - `retry_count` + `max_retries`
   - `status` (pending/retrying/resolved/discarded)
   - `resolved_by` + `resolved_at`

2. Funcao `fn_processar_dlq()` para retry manual via SQL
3. Funcao `fn_liberar_dlq_resolvida()` para limpar registros processados
4. View `vw_dlq_resumo` com dashboard de falhas
5. RLS policies para isolamento por organizacao

---

## 7. PARECER TECNICO CONCLUSIVO

### Classificacao Geral: 🟠 RISCO ELEVADO

O sistema HD-System apresenta uma arquitetura **funcional para uso single-tenant/single-device**, mas com **vulnerabilidades criticas** quando operado em ambiente multi-dispositivo com concorrencia real.

### Top 3 Riscos Imediatos

1. **🔴 Perda de Estoque por Concorrencia:** Duas vendas simultaneas do mesmo produto podem resultar em estoque negativo sem deteccao. Nao existe protecao no nivel de banco de dados (sem SERIALIZABLE, sem FOR UPDATE, sem triggers).

2. **🔴 Seguranca Comprometida:** RLS desabilitado em todas as tabelas + anon key no frontend = qualquer pessoa com a URL do Supabase pode acessar/modificar todos os dados de todas as organizacoes.

3. **🟠 Operacoes Silenciosamente Perdidas:** A SyncQueue armazena operacoes falhas APENAS no localStorage. Se o usuario limpar cache do navegador, todas as operacoes pendentes sao permanentemente perdidas sem registro.

### Acoes Recomendadas (Prioridade)

| Prioridade | Acao | Esforco |
|-----------|------|---------|
| P0 (Imediato) | Habilitar RLS com policies de multi-tenant | 2-4h |
| P0 (Imediato) | Adicionar transaction wrapper em `addSale()` via Edge Function | 4-8h |
| P1 (Esta semana) | Implementar `SELECT ... FOR UPDATE` na tabela products | 2h |
| P1 (Esta semana) | Deploy da DLQ `movimentacoes_falhas` no Supabase | 1h |
| P2 (Proximo ciclo) | Implementar optimistic locking com campo `version` | 4h |
| P2 (Proximo ciclo) | Migrar logica de estoque para PostgreSQL functions (server-side) | 8-16h |
| P3 (Backlog) | Adicionar AbortController em todas as chamadas async | 2h |
| P3 (Backlog) | Habilitar Supabase debug mode em dev | 30min |

### Veredito Final

> O HD-System demonstra competencia na camada de **sincronizacao offline-first** e **UI/UX**, com uma arquitetura de sync robusta para o cenario de uso pretendido (PDV local com sync eventual). Porem, a ausencia total de protecao no nivel de banco de dados (transacoes, locks, triggers) representa um risco aceitavel apenas para operacoes single-user. Para escalar para multi-dispositivo com vendas concorrentes, as acoes P0 e P1 sao obrigatorias antes de qualquer campanha de adocao em escala.

---

*Relatorio gerado em 2026-07-28. Auditoria baseada em analise estatica de todo o codebase disponivel.*
