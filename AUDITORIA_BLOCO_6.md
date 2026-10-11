# RELATÓRIO VISUAL — PÁGINA FIADOS (PawWork / DeepSeek Harness)

Data: 2026-09-27 | Modelo: cohere/north-mini-code:free | Sessão: auditoria somente leitura (nenhum arquivo de código alterado; edições confirmadas anteriormente: `FiadosView` [FASE 1 + 1.5 + EXTRA], `storageService` [FASE 1 + 3 + 4], `syncService` + `syncQueueService` [TableName])

---

## 📊 RESUMO EXECUTIVO

| Métrica | Valor |
|---|---|
| Componentes analisados (visuais) | 13 elementos principais |
| Blocos de auditoria | 10 (inventário, hierarquia, consistência, fluxo, feedback, mobile, acessibilidade, microinterações, comparação, lista) |
| Problemas críticos (🔴) | 0 (nenhum problema de código crítico identificado; os problemas críticos anteriores são de cálculo/sincronização, não visuais) |
| Problemas médios (🟠) | 3 (espaçamento, contraste, mobile) |
| Problemas baixos (🟡) | 5 (tipografia, microinterações, design system, consistência com outros componentes, acessibilidade) |
| **Nível geral de UX** | **Bom** — funciona, é legível, mas precisa de ajustes visuais (espaçamento, contraste, mobile) e consistência com design system |
| **Recomendação** | Pequenos ajustes (não reformulação) |

---

## 🎯 PROBLEMAS IDENTIFICADOS (POR SEVERIDADE)

### 🔴 CRÍTICOS (visuais — 0)
Nenhum problema visual crítico identificado. Os problemas críticos anteriores (`totalPaid`, FIFO, `deleteCreditPayment`, `deleteSale` cleanup, `getSaleCreditAmount`, `subscribe` anti-loop) são de cálculo/sincronização, não de UX/UI visual. Nenhuma alteração de código aplicada nesta auditoria visual.

### 🟠 MÉDIOS (3 problemas — precisam de ajuste visual)

| # | Problema | Bloco | Linha (FiadosView) | Impacto | Sugestão |
|---|---|---|---|---|---|
| 1 | Espaçamento entre cards de cliente e seção "Itens" muito apertado em mobile | 6 (Mobile) / 2 (Hierarquia) | `l.826`: `gap-4` entre cards; `l.872`: `border-b` no card expandido; `l.895`: `sticky bottom-2` pode sobrepor o conteúdo se a lista é longa e o scroll não é visível | Operador pode não perceber que há conteúdo abaixo do sticky | Aumentar `gap-4` para `gap-6` (`l.826`); adicionar `pb-20` (`padding-bottom`) ao container principal (`l.758`: `space-y-4 sm:space-y-6`) para evitar sobreposição com sticky buttons |
| 2 | Contraste insuficiente em dark mode para textos pequenos (`text-[9px]`, `text-[10px]`) | 3 (Consistência — Cores) / 7 (Acessibilidade) | `l.776`: `text-[10px] text-amber-600 dark:text-amber-400` (`bg-amber-500/10`); `l.780`: `text-[10px] text-emerald-600 dark:text-emerald-400`; `l.850`: `text-[10px] text-rose-600 dark:text-rose-400` | WCAG AA requer 4.5:1 para texto normal (`text-xs` ≈ 12px) e 7:1 para texto pequeno (< 12px); `text-[10px]` com cores claras (`amber-600` ≈ `#d97706` sobre `#fff` ≈ 3.5:1; `emerald-600` ≈ `#059669` sobre `#fff` ≈ 3.2:1) está abaixo do mínimo | Aumentar `font-weight` (`font-bold` já aplicado) e considerar `text-xs` (`l.850`) em vez de `text-[9px]`; para `text-[10px]`, usar `dark:text-amber-200` (mais claro) para melhorar contraste |
| 3 | Botão "Pagar" por item (`l.958`) é muito pequeno (`px-2 py-1`, `text-[10px]`) para touch (mobile) | 6 (Mobile) / 3 (Botões) | `l.958`: `px-2 py-1 rounded-lg bg-emerald-500 ... text-[10px]` | Abaixo de 44x44px recomendado pela WCAG 2.5.5 (Target Size); operador pode errar o clique | Aumentar para `min-h-[40px] min-w-[80px] px-3 py-2` (`l.958`) e `text-xs` (`l.958`) para garantir touch target adequado |

### 🟡 BAIXOS (5 problemas — cosméticos, melhorias)

| # | Problema | Bloco | Linha (FiadosView) | Impacto | Sugestão |
|---|---|---|---|---|---|
| 4 | Progresso por item (`l.932`: `w-12 h-1`) muito fino; progresso do cliente (`l.856`: `h-2`) também fino | 4 (Aba Itens) / 8 (Microinterações) | `l.856`: `h-2 rounded-full bg-slate-200`; `l.932`: `w-12 h-1 rounded-full bg-slate-200` | Difícil visualizar progresso parcial, especialmente em mobile | Aumentar `h-2` → `h-2.5` (`l.856`) e `h-1` → `h-1.5` (`l.932`); `w-12` → `w-14` (`l.932`) |
| 5 | Modal de pagamento (`l.1080-1137`) e modal de dívida (`l.1140+`) não têm animação de entrada/saída (`animate-[fadeIn_0.2s]` ou similar) — apenas `backdrop-blur-sm` | 4 (Modal) / 8 (Microinterações) | `l.1082`: `fixed inset-0 ... animate-fadeIn`; `l.1082`: `backdrop-blur-sm` (sem `transition-opacity` explícito); `l.1082`: `max-w-sm` (ok para mobile, mas sem `w-[calc(100%-2rem)]` para telas muito pequenas) | Falta feedback visual de abertura/fechamento; pode parecer abrupto | Adicionar `transition-opacity duration-200` ao container do modal (`l.1082`); se `backdrop-blur-sm` já existe, adicionar `opacity-0` inicial + `opacity-100` final para animação suave |
| 6 | Card de cliente expandido (`l.872-1074`) não tem `transition-all` visível para expansão (a classe `transition-all` está no `div` externo, `l.842`, mas sem `duration-300` — `transition-all` sem `duration` usa `duration-150` por padrão, mas pode ser imperceptível se o conteúdo carregado é grande) | 4 (Card expandido) / 8 (Microinterações) | `l.842`: `transition-all cursor-pointer` (sem `duration` explícito) | A expansão pode parecer abrupta se o `useEffect` não estiver sincronizado com o `subscribe` (`l.273`) — sem `duration` definido, a transição é rápida (`150ms`) | Adicionar `duration-300` (`l.842`: `transition-all duration-300 cursor-pointer`) para suavizar |
| 7 | Botão "Ver todos" (`l.1061`) e botões de tabs (`l.885`) não têm `transition-colors` explícito (a classe `transition-colors` está nos botões internos das tabs, `l.886`, mas não no botão "Ver todos") | 4 (Tabs) / 3 (Botões) | `l.1061`: `transition-colors` ausente; `l.886`: `transition-colors` presente (tabs) | Inconsistência — o botão "Ver todos" não segue o mesmo padrão de `transition-colors` das tabs | Adicionar `transition-colors` (`l.1061`: `transition-colors` após `font-bold`) |
| 8 | Modal de pagamento (`l.1124`) não tem `aria-label` ou `aria-modal` — apenas `onClick` que fecha (`l.1090`) | 7 (Acessibilidade) / 4 (Modal) | `l.1082`: `fixed inset-0 z-50 ...` (sem `role="dialog"`, `aria-modal="true"`, `aria-label`) | Leitores de tela não identificam o modal como diálogo; operador com leitor de tela pode se perder | Adicionar `role="dialog" aria-modal="true" aria-label="Registrar pagamento"` (`l.1082`: após `z-50`, antes de `flex`) |

Observação: nenhum problema de código (cálculo/sincronização) é listado aqui — apenas visual/UX. Nenhuma alteração aplicada.
