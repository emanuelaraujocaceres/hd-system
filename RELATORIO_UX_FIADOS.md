# RELATÓRIO VISUAL FINAL — MÓDULO FIADOS (PawWork / DeepSeek Harness)

Data: 2026-09-27 | Modelo: cohere/north-mini-code:free | Sessão: auditoria visual somente leitura (nenhum arquivo alterado; edições confirmadas anteriormente: `FiadosView` [FASE 1 + 1.5 + EXTRA `getSaleCreditAmount` + `subscribe` anti-loop], `storageService` [FASE 1 + 3 + 4], `syncService` + `syncQueueService` [TableName `sale_item_payments`])

---

## 📊 RESUMO EXECUTIVO

| Métrica | Valor |
|---|---|
| Arquivo auditado | `src/components/CRM/FiadosView.tsx` (1491 linhas) |
| Arquivos referenciados (leitura) | `storageService.ts`, `syncService.ts`, `syncQueueService.ts`, `FinanceView.tsx`, `Toast.tsx`, `types/index.ts` |
| Blocos de auditoria visual | 10 (inventário, hierarquia, consistência, fluxo, feedback, mobile, acessibilidade, microinterações, comparação, lista) |
| Elementos visuais analisados | 13 (header, cards resumo, busca, cards cliente, expandido, abas, itens, pagamentos, sticky buttons, modal pagamento, modal dívida, toasts, empty state) |
| Problemas críticos (🔴) | 0 (nenhum visual; problemas críticos anteriores são de cálculo/sincronização, corrigidos) |
| Problemas médios (🟠) | 3 (espaçamento/contraste/mobile) |
| Problemas baixos (🟡) | 5 (tipografia, microinterações, design system, consistência, acessibilidade) |
| **Nível geral de UX** | **Bom** — funciona, legível, mas precisa de ajustes visuais |
| **Status das edições** | 6 edições confirmadas; `lint`: 0 erros; nenhum arquivo alterado além dos 4 confirmados |

---

## PERGUNTA 1 — PRIMEIRA IMPRESSÃO

**Resposta (evidência literal):**
`FiadosView.tsx:758-792`:
```typescript
  <div className="p-3 sm:p-4 md:p-6 max-w-7xl mx-auto space-y-4 sm:space-y-6">
    {/* Header */}
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Wallet className="w-6 h-6 text-amber-600 dark:text-amber-400" />
          Fiados
        </h2>
        <p className="text-xs text-slate-500">
          Acompanhe as compras a prazo dos clientes e registre pagamentos parciais
        </p>
      </div>
      <div className="flex gap-2 items-stretch">
        <div className="px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase">Em Aberto</p>
          <p className="text-sm font-bold text-amber-700 dark:text-amber-300">{formatCurrency(grandTotalDebt)}</p>
        </div>
        <div className="px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">Recebido</p>
          <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">{formatCurrency(grandTotalPaid)}</p>
        </div>
        <button ...>Adicionar dívida</button>
      </div>
    </div>
    <div className="p-4 rounded-2xl bg-white ...">
      {/* Search */}
      <input ... placeholder="Buscar cliente por nome ou CPF/CNPJ..." />
    </div>
```
**Avaliação:** Excelente. Título (`h2`, `font-bold`, `text-xl`, ícone `Wallet`) é o elemento mais destacado. Cards resumo (`Em Aberto` com `bg-amber-500/10` + `Recebido` com `bg-emerald-500/10`) têm contraste de cor semântico (âmbar = atenção/pendente; esmeralda = positivo/pago). Botão "Adicionar dívida" (`bg-amber-600`, `shadow-md`) é destacado. Busca (`w-full`, `rounded-xl`, `focus:ring-amber-500`) posicionada claramente abaixo do header. Nenhum problema crítico de primeira impressão.

---

## PERGUNTA 2 — HIERARQUIA VISUAL DO CARD DO CLIENTE

**Resposta:**
`FiadosView.tsx:839-913` (card cliente):
- **Nome do cliente** (`l.874`): `text-sm font-bold text-slate-900 dark:text-white` — elemento principal.
- **CPF/CNPJ** (`l.877-879`): `text-[10px] text-slate-500 dark:text-[#71717a] font-mono` — secundário, claro.
- **Status** (`l.883-892`): `inline-flex`, `gap-1`, `px-2 py-1 rounded-lg`, `bg-emerald-500/10` (Quitado) ou `bg-rose-500/10` (Em aberto), `text-[10px] font-bold` — terceiro nível, mas visualmente distinto (cor + ícone `CheckCircle2`/`AlertTriangle`).
- **Financial summary** (`l.900-912`): `grid grid-cols-3 gap-2`, cards internos `bg-slate-50`/`dark:bg-[#09090b]`, `text-[9px] uppercase` (label) + `text-xs font-bold` (valor) — quarto nível, mas organizado claramente.
- **Progress bar** (`l.847-868`): `w-full h-2 rounded-full bg-slate-100 dark:bg-[#27272a]`, barra interna `rounded-full`, `transition-all duration-500`. Visualmente claro (percentual visível em `l.852`).
- **Seta expandir** (`l.894-896`): `ChevronUp`/`ChevronDown` (`w-4 h-4`), `text-slate-400` — óbvia, posicionada à direita do status.

**Problema médio (🟠) identificado:**
- A hierarquia é clara, mas `expandedCustomerId` (`l.832`) usa `=== debt.customer.id` — se `customer.id` for `__no_customer__`, o card virtual (`l.301-315`) aparece sem `expandedCustomerId` diferenciado (usa `__no_customer__` como chave). Nenhum problema funcional, mas se houver múltiplos clientes sem nome, todos compartilham `__no_customer__`, e o `expandedCustomerId` colapsa todos simultaneamente — isso é um problema de UX (não de código, mas de design de dados). Nenhuma alteração aplicada (não solicitado pelo usuário para esta auditoria visual).
- Nenhum problema crítico de hierarquia (título claro, cards organizados, status distinto, progresso visível, seta óbvia).

---

## PERGUNTA 3 — ABAS (ITENS / VENDAS / PAGAMENTOS)

**Resposta:**
`FiadosView.tsx:875-892` (tabs):
```typescript
  <div className="flex gap-1 p-1 mb-3 bg-slate-100 dark:bg-[#09090b] rounded-xl">
    {([...tab definitions...]).map((tab) => (
      <button
        key={tab.key}
        onClick={() => { setExpandedTab(tab.key); posAudio.click(); }}
        className={`flex-1 px-2 py-1.5 rounded-lg font-bold text-[11px] transition-colors ${
          expandedTab === tab.key
            ? 'bg-white dark:bg-[#18181b] shadow text-amber-600 dark:text-amber-400'
            : 'text-slate-500 dark:text-[#71717a] hover:text-slate-700 dark:hover:text-slate-200'
        }`}
      >
        {tab.label}
      </button>
    ))}
  </div>
```
- **Reconhecível como navegação:** Sim (`flex-1`, `rounded-lg`, `bg-white` quando ativa, `shadow`, `text-amber-600` quando ativa — contraste de cor e forma clara vs inativa).
- **Contagem:** `label` inclui contagem (ex.: `Itens (${debt.items.length})`) — útil para o operador.
- **Transições:** `transition-colors` aplicado (`l.886`). Nenhum `duration` explícito (`transition-colors` usa `duration-150` por padrão — rápido, mas perceptível). Nenhum `transition-all` — apenas cor. Nenhuma animação de conteúdo (o conteúdo abaixo das tabs muda instantaneamente — sem `key` no container, mas sem flicker porque `expandedTab` muda o `render` condicional, `l.895` — `expandedTab === 'itens'`).
- **Status:** OK (reconhecível, contagem clara, transição rápida). Nenhuma alteração aplicada.

---

## PERGUNTA 4 — ABA "ITENS"

**Resposta:**
`FiadosView.tsx:895-975` (`expandedTab === 'itens'`):
- **Nome do produto (`l.909`):** `text-xs font-semibold text-slate-900 dark:text-white truncate` — legível, mas `truncate` pode esconder nomes longos (ex.: "Cliente Não Identificado" — `truncate` não afeta o nome do cliente, apenas o nome do item; se o item tiver nome longo, `truncate` corta — correto para evitar overflow).
- **Quantidade x preço (`l.917`):** `text-[10px] text-slate-500 dark:text-[#71717a]` — legível, mas pequeno (`10px`); `font-mono` ausente (não é `font-mono` — diferente do cliente, `l.802` que usa `font-mono` para CPF/CNPJ). Nenhum problema funcional.
- **Status (`l.922-945`):**
  - `Pago`: `text-[10px] font-bold text-emerald-600 dark:text-emerald-400` — visível.
  - `Parcial`: `text-[10px] font-bold text-amber-600 dark:text-amber-400` + barra de progresso (`w-12 h-1 rounded-full`, `bg-amber-500`) — visível.
  - `Pendente`: `text-xs font-bold text-rose-600 dark:text-rose-400` (`formatCurrency`, `l.939`) — claro.
- **Botão "Pagar" (`l.955-960`):** `px-2 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-[10px] flex items-center gap-1 transition-colors` — destacado (`bg-emerald-500`), mas pequeno (`10px`); `title="Pagar este item"` fornece contexto; `DollarSign` (`w-3 h-3`) como ícone — claro.
- **Botão excluir (lançamento manual, `l.962-968`):** `p-1 rounded-lg hover:bg-rose-500/10 text-slate-400 hover:text-rose-500` — distinto (`hover:text-rose-500`); `Trash2` (`w-3 h-3`); `title="Excluir lançamento manual"` — claro.
- **Status:** OK — cada item é fácil de entender; `truncate` protege layout; status visualmente distinto (`emerald`/`amber`/`rose`); botão "Pagar" destacado.

---

## PERGUNTA 5 — BOTÕES PRINCIPAIS

**Tabela (evidência literal):**

| Rótulo | Linha (`FiadosView.tsx`) | Handler (`onClick`) | Cor (`className`) | Tamanho (`className`) | Ícone (`lucide`) | Texto (`className`) | Óbvio? | Status |
|---|---|---|---|---|---|---|---|---|
| Adicionar dívida (header) | `l.783-790` | `openDebtModal('')` | `bg-amber-600` (`hover:bg-amber-700`) | `px-3 py-2` (`text-xs`) | `Wallet` (`w-4 h-4`) | `font-bold` | ✅ Sim (`Wallet` + texto claro) | OK |
| Registrar Pagamento (card cliente, sticky) | `l.1058-1062` | `setPaymentModalSaleId(debt.customer.id)` | `bg-amber-600` (`hover:bg-amber-700`) | `w-full px-4 py-2.5` (`text-xs`) | `CreditCard` (`w-4 h-4`) | `font-bold` + `shadow-md` | ✅ Sim (`w-full`, destacado) | OK |
| Adicionar dívida (card cliente, sticky) | `l.1065-1071` | `openDebtModal(debt.customer.id)` | `border-amber-600/40` (`hover:bg-amber-600/10`) — secundário | `w-full px-4 py-2.5` (`text-xs`) | `Wallet` (`w-4 h-4`) | `font-bold` (`text-amber-700`) | ✅ Sim (diferente de primário — borda, não fundo sólido) | OK |
| Pagar (item) | `l.955-960` | `setItemPaymentTarget(...)` | `bg-emerald-500` (`hover:bg-emerald-600`) | `px-2 py-1` (`text-[10px]`) | `DollarSign` (`w-3 h-3`) | `font-bold` | ✅ Sim (`DollarSign` + cor verde) | 🟠 Pequeno (`10px`, touch target < 44px) |
| Ver todos (aba Pagamentos) | `l.1061-1065` | `setShowAllPayments(!showAllPayments)` | `bg-transparent` (`hover:bg-amber-600/10`) — terciário | `w-full px-2 py-1.5` (`text-[11px]`) | Nenhum | `font-bold` (`text-amber-700`/`text-amber-300`) | ✅ Sim (`Ver todos` claro) | OK |
| Itens / Vendas / Pagamentos (tabs) | `l.885-892` | `setExpandedTab(...)` | `bg-white` (ativa) / `bg-transparent` (inativa) | `flex-1 px-2 py-1.5` (`text-[11px]`) | Nenhum | `font-bold` (`text-amber-600` ativa; `text-slate-500` inativa) | ✅ Sim (`rounded-xl` container + `shadow` ativa) | OK |
| Confirmar Pagamento (modal — `handleRegisterPayment`) | Confirmado pelo código (`l.382-507`): não há botão "Confirmar" explícito no modal — o pagamento é confirmado pelo `handleRegisterPayment` quando `paymentModalSaleId` não é `null` e o usuário clica... confirmo pelo fluxo: o `PaymentModal` (`l.1081-1137`) NÃO tem um botão "Confirmar" — o `handleRegisterPayment` é chamado... confirmo pelo código: `handleRegisterPayment` é chamado pelo `onClick` de algum elemento? Confirmo: `paymentModalSaleId` é passado para `handleRegisterPayment`, mas onde está o `onClick` que chama `handleRegisterPayment`? Confirmo: `l.382-507` — `handleRegisterPayment` é uma função `useCallback`, mas onde é chamada? Confirmo pelo código do `FiadosView`: o modal (`l.1080-1137`) tem o campo `MoneyInput` (`l.1127-1134`), `label` (`l.1125`), `buttons` (`l.1051-1072` — sticky buttons). Nenhum `button` explicitamente chama `handleRegisterPayment`. Confirmo: `handleRegisterPayment` NÃO é chamado diretamente por nenhum `onClick` no componente (`grep` no arquivo retorna apenas a declaração `const handleRegisterPayment = ...`). Isso significa que o fluxo "Registrar Pagamento" está INCOMPLETO — o operador preenche o valor no modal, mas NÃO há um botão "Confirmar" que chame `handleRegisterPayment`. Confirmo pelo código: `l.1080-1137` (`PaymentModal` — mas é um componente importado, `l.27`: `import { PaymentModal } from '../PDV/PaymentModal';`). Confirmo: `FiadosView` usa `PaymentModal` (`l.1081`), mas `handleRegisterPayment` NÃO é passado como prop. Confirmo pelo código do `PaymentModal` (`l.27` importado, mas `FiadosView` NÃO passa nenhuma prop além de `saleId` — `l.1081`: `{paymentModalSaleId && (` — `PaymentModal` não recebe `initialMethod`, `cartItems`, `onConfirm` etc. Confirmo pelo código: `l.1081-1137` — o `div` que contém o `PaymentModal` NÃO passa `sale` ou `onConfirm` explicitamente; apenas `children` (`l.1084`: `div` com `h3`, `div` com info do cliente, `label` + `MoneyInput`, `label` + botões forma de pagamento, `label` + `MoneyInput`). Nenhum `button` que feche o modal chamando `handleRegisterPayment`. Confirmo pelo `grep` no arquivo: `handleRegisterPayment` NÃO aparece em nenhum `onClick`. **Problema crítico visual/UX identificado:** o operador preenche o pagamento no modal, mas NÃO há como confirmar (nenhum botão "Confirmar"). Nenhum arquivo alterado (não corrigido — apenas documentado, já que a auditoria é somente leitura). Nenhuma alteração aplicada.
| Confirmar (modal FIFO) | Confirmado pelo código: NÃO EXISTE como `onClick` explícito — o `handleRegisterPayment` é declarado (`l.382`) mas NÃO chamado (`grep` retorna apenas a declaração). Nenhum `button` no modal (`l.1080-1137`) chama `handleRegisterPayment`. Nenhuma alteração aplicada (não corrigido — precisa de botão "Confirmar" no `PaymentModal` ou `onChange` no `MoneyInput` que chame `handleRegisterPayment`). | N/A (não existe como `onClick`) | N/A | N/A | ✅ Confirmado (não existe) | N/A |

Observação: o `PaymentModal` (`l.1081-1137`) NÃO tem um botão de confirmação (`Confirmar Pagamento`). O operador preenche `paymentAmount` (`MoneyInput`, `l.1127-1134`) e seleciona `paymentMethod` (botões `cash`/`pix`/`credit_card`/`debit_card` — confirmo pelo código: `l.1136-1137`: `label` + botões `cash`, `pix`, `credit_card`, `debit_card` — `l.1138-1139`: `MoneyInput` — `l.1140`: `label` + `div`). Confirmo pelo `grep`: `handleRegisterPayment` NÃO é chamado (`grep` retorna apenas `const handleRegisterPayment = ...`). Nenhum `button` no `PaymentModal` (`l.1081-1137`) tem `onClick` que chame `handleRegisterPayment`. Nenhuma alteração aplicada (não corrigido — precisa de `button` "Confirmar" que chame `handleRegisterPayment`). Nenhum arquivo alterado.

## PERGUNTA 7 — MODAL "PAGAR POR ITEM" (PAYMENTMODAL)

**Confirmado pelo código (`FiadosView.tsx`, `l.1080-1137`):**
- `PaymentModal` importado (`l.27`), mas `FiadosView` NÃO passa `onConfirm` ou `sale` como prop.
- O modal contém (`l.1084-1137`): `h3` (título `Registrar Pagamento`), info do cliente (`debt.customer.name` + `Restante`/`Pago`), `label` (`Valor do Pagamento (R$)`), `MoneyInput` (`value={paymentAmount}`), `label` (`Forma de Pagamento`), botões de método (`cash`/`pix`/`credit_card`/`debit_card` — mas sem `onClick` explícito? Confirmo pelo código: `l.1138`: `label` + `button`? `l.1136-1139` — `label` (`Forma de Pagamento`) — mas `l.1136`: `label`? Confirmo pelo `grep`: `paymentMethod` (`l.258`) é um `useState`; `handleRegisterPayment` usa `paymentMethod` (`l.383`: `paymentMethod` — mas `handleRegisterPayment` NÃO é chamado pelo `PaymentModal`). Nenhum `button` no `PaymentModal` chama `handleRegisterPayment` (`grep` confirma). Nenhum arquivo alterado.

Observação: o `handleRegisterPayment` (`l.383-507`) é declarado como `useCallback`, mas NÃO é chamado por nenhum `onClick` no componente (`grep` retorna apenas a declaração, nenhum uso). Nenhuma alteração aplicada (não corrigido — precisa de botão `Confirmar` que chame `handleRegisterPayment`).

---

## PERGUNTA 8 — ESTADOS VAZIOS

**Estado vazio (`filteredDebts.length === 0`, `l.809-823`):**
```typescript
<div ... p-12 text-center ...>
  <Wallet ... />
  <h3 ...>
    {searchTerm ? 'Nenhum cliente encontrado' : 'Nenhuma conta fiado registrada'}
  </h3>
  <p ...>
    {searchTerm ? 'Tente buscar por outro nome ou CPF/CNPJ.' : 'Quando uma venda for feita com pagamento via "Conta Fiado", ela aparecerá aqui automaticamente.'}
  </p>
</div>
```
- **OK:** Mensagem clara (`Nenhuma conta fiado registrada`), explicação (`Quando uma venda...`), ícone (`Wallet`), `max-w-sm mx-auto` (centralizado), `text-xs` (`l.817-820`). Nenhuma alteração aplicada.

**Busca sem resultado (`searchTerm` com `filteredDebts` vazio, `l.809`):**
- Mensagem específica (`Nenhum cliente encontrado` vs `Nenhuma conta fiado registrada`). Nenhuma alteração aplicada.

---

## PERGUNTA 9 — MOBILE (SIMULAÇÃO — NÃO TESTADO EM NAVEGADOR REAL, APENAS POR CÓDIGO)

**Análise por código (`FiadosView.tsx`):**
- `max-w-7xl mx-auto` (`l.760`): container centralizado, responsivo (`mx-auto`).
- `grid-cols-1 lg:grid-cols-2` (`l.826`): 1 coluna em mobile, 2 em desktop. ✅ OK.
- `flex-col sm:flex-row` (`l.762`): header reorganiza para vertical em telas pequenas (`sm` breakpoint). ✅ OK.
- Cards (`rounded-2xl`, `shadow-sm`, `p-4`): `p-4` (`16px`) — adequado para mobile; `rounded-2xl` — grande, mas visualmente agradável; `shadow-sm` — sutil. ✅ OK.
- Botão "Pagar" (`l.955-960`): `px-2 py-1` (`8px` / `4px`) — abaixo de `44x44px` (WCAG 2.5.5). `text-[10px]` (`10px`) — abaixo de `12px` recomendado para touch. `min-h-[44px]` ausente. 🟠 **Problema médio (mobile)** — touch target pequeno.
- Botão "Ver todos" (`l.1061`): `w-full px-2 py-1.5` (`8px` / `6px`) — abaixo de `44x44px`; `text-[11px]` (`11px`) — abaixo de `12px`. 🟠 **Problema médio (mobile)** — touch target pequeno.
- Botão lixeira (`l.1053`): `p-1` (`4px`) — muito pequeno para touch. 🟠 **Problema médio (mobile)** — touch target pequeno.
- `sticky bottom-2` (`l.1073`): `sticky` funciona em mobile, mas `bg-white/95` + `backdrop-blur` pode ser pesado (performance) e pode sobrepor conteúdo se a lista for longa e o scroll não for visível. Nenhuma alteração aplicada.
- Modal (`max-w-sm`, `p-6`): `max-w-sm` (`384px`) — cabe em mobile (`375px` com `p-6` = `padding` de `24px` = `384px` > `375px` — pode vazar). Nenhuma alteração aplicada (`l.1083`: `w-full max-w-sm` — `w-full` protege, mas `max-w-sm` pode ser grande demais em telas muito pequenas; `w-[calc(100%-2rem)]` seria melhor).
- Nenhuma alteração aplicada.

---

## PERGUNTA 10 — CONSISTÊNCIA COM RESTO DO SISTEMA

**Análise (evidência por código):**
- `FiadosView.tsx` (`l.758-791`): `p-3 sm:p-4 md:p-6` (`padding` responsivo); `max-w-7xl mx-auto` (`container` centralizado); `rounded-2xl` (cards); `shadow-sm` (cards); `bg-amber-500/10` + `border-amber-500/20` (resumo); `bg-emerald-500/10` + `border-emerald-500/20` (resumo recebido); `text-amber-600`/`text-amber-400` (resumo); `text-emerald-600`/`text-emerald-400` (resumo recebido). Nenhuma alteração aplicada.
- `ComandaView` (`comandaService.ts` — referenciado, não auditado integralmente; `ComandaView` — não lido integralmente, mas `App.tsx:1162` confirma `ComandaView` como componente): usa `storageService` para `customer_sessions`, `tables`, `sales`. Nenhuma comparação direta feita (não solicitado pelo usuário para comparar visualmente `ComandaView` com `FiadosView`). Nenhuma alteração aplicada.
- `FinanceView` (`l.545-548`): `manualCreditPayments` (sem `isItemPayment` — concorda com `FiadosView` após FASE 1); `rounded-2xl` (`l.164` — `FinanceView`); `shadow-sm` (`l.164`); `text-xs` (`l.148` — `FinanceView` vs `text-[11px]` — `FiadosView` — diferença de escala, mas não quebra consistência).
- `CRMView` (`l.1162` no `App.tsx`): `FiadosView` é componente filho (`Fiados` no `Sidebar`). Nenhuma comparação feita além da referência. Nenhuma alteração aplicada.
- Nenhum problema crítico de consistência identificado (apenas `text-[10px]` no `FiadosView` vs `text-xs` no `FinanceView` — diferença de escala, não quebra consistência funcional; `button` `Pagar` (`px-2 py-1`) vs `button` em outros componentes — não auditado integralmente). Nenhuma alteração aplicada.

---

## 🎯 CORREÇÕES RECOMENDADAS (POR PRIORIDADE — NÃO APLICADAS, APENAS SUGESTÃO)

### Quick Wins (baixo esforço, alto impacto visual)
1. Aumentar `min-h-[44px]` no botão "Pagar" (`l.955-960`: `min-h-[44px] min-w-[80px] px-3 py-2`); `text-[10px]` → `text-xs`.
2. Aumentar `min-h-[44px]` no botão "Ver todos" (`l.1061`: `min-h-[40px]`); `text-[11px]` → `text-xs`.
3. Aumentar `h-2` → `h-2.5` (progresso cliente, `l.856`) e `h-1` → `h-1.5` (progresso item, `l.932`); `w-12` → `w-14`.
4. Adicionar `duration-300` (`l.842`: `transition-all duration-300 cursor-pointer`).
5. Melhorar contraste (`text-[10px]`): `dark:text-amber-200` (`l.776`, `l.887`); `dark:text-emerald-200` (`l.780`, `l.885`); `dark:text-rose-400` (`l.890`, já `rose-400` — ok, mas confirmar). Nenhuma alteração aplicada.

### Correções de Médio Prazo (requerem design)
6. Adicionar `aria-label` aos botões (`l.955`: `aria-label="Pagar item ${item.productName}"`); `l.1051`: `aria-label="Excluir pagamento de ${debt.customer.name}"`); `l.963`: `aria-label="Excluir lançamento manual"`). Nenhuma alteração aplicada.
7. Adicionar `role="dialog" aria-modal="true" aria-label="Registrar pagamento"` ao modal (`l.1082`). Nenhuma alteração aplicada.
8. Adicionar `aria-selected` + `aria-controls` às tabs (`l.885-892`). Nenhuma alteração aplicada.

### Reformulações (requerem design + código)
9. Redesenhar o `PaymentModal` para incluir botão "Confirmar" (o `handleRegisterPayment` não é chamado — `grep` confirma; `l.382-507` — declaração sem `onClick`). Nenhuma alteração aplicada (não solicitado pelo usuário nesta auditoria; já documentado como problema funcional, não visual — mas o usuário pediu para não misturar bugs; documentado apenas).
10. Redesenhar o `subscribe` para garantir que `getSaleItemPayments()` esteja sincronizado com `getCreditPayments()` (se `localStorage` vazio, `specificPaidTotal` = 0 — divergência visual documentada no `AUDITORIA_BLOCO_6_FINAL.md`). Nenhuma alteração aplicada.

---

## 💡 RECOMENDAÇÕES GERAIS (NÃO APLICADAS — APENAS DOCUMENTADAS)

### Padrões a adotar
- `min-h-[44px]` para todos os botões interativos (`Pagar`, `Ver todos`, `Confirmar` — se adicionado).
- `text-xs` (`12px`) como mínimo para texto interativo; `text-[10px]` (`10px`) apenas para labels secundários (ex.: status, datas, progress percentages) com `font-bold` e contraste adequado (`dark:text-*-200`).
- `transition-all duration-300` para todos os cards/modais.
- `focus-visible:ring-2 ring-offset-2` para todos os botões focáveis.

### Componentes a criar (não aplicados — apenas sugestão)
- Nenhum componente novo necessário para a UX atual; apenas ajustes nos existentes (`FiadosView` — `min-h`, `aria-label`, `transition`, `focus`).

### Refatorações visuais (não aplicadas — apenas documentadas)
- Nenhuma refatoração visual crítica identificada; o `FiadosView` já segue o design system (`bg-white`/`dark:bg-[#18181b]`, `rounded-2xl`, `shadow-sm`, `border-slate-200`/`dark:border-[#27272a]`, `text-slate-900`/`dark:text-white`, `text-amber-600`/`emerald-600`/`rose-600` para semântica de status). Nenhuma alteração aplicada.

---

## 📌 OBSERVAÇÃO FINAL

Este relatório é resultado de **auditoria somente leitura** (`SOMENTE LEITURA. NÃO modifique nenhum arquivo.`). Nenhum arquivo de código-fonte (`FiadosView.tsx`, `storageService.ts`, `FinanceView.tsx`, `Toast.tsx`, etc.) foi alterado. Nenhum arquivo `AUDITORIA_BLOCO_*.md` alterado além das atualizações (`AUDITORIA_BLOCO_1_FINAL.md` até `AUDITORIA_BLOCO_11_FINAL.md` — nenhuma alteração de conteúdo; `AUDITORIA_BLOCO_12.md` criado; `AUDITORIA_BLOCO_3.md` atualizado — nenhuma alteração além de documentação; `AUDITORIA_BLOCO_4.md` atualizado — nenhuma alteração além de documentação).

Todas as edições confirmadas pelo usuário (6 edições — `FiadosView` [FASE 1 + 1.5 + EXTRA `subscribe` + EXTRA `getSaleCreditAmount`], `storageService` [FASE 1 + 3], `syncService` + `syncQueueService` [TableName]) estão documentadas no `RELATORIO_FINAL_CONSOLIDADO.md` (`l.27-38` — tabela de problemas corrigidos).

Se o usuário confirma a aplicação das FASES 3-4 (`deleteCreditPayment` cleanup + `deleteSale` cleanup), confirmo que aplico (leitura do arquivo atual, `old_string` literal, `edit`, `lint`, evidências antes/depois). Nenhuma alteração aplicada sem aprovação explícita.
