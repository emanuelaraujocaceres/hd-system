# BLOCO 4 — AUDITORIA DO PRODUTO "FIADO" SEM NOME (LEITURA APENAS, EVIDÊNCIA LITERAL)

## Contexto (consolidado das auditorias anteriores)
O usuário reportou que no console F12 aparece `row.customer_name=dionathan GORDAO` e que o valor mudou de 200+ para 96. Não foi encontrado o ID `2fe0edd6-9da6-4f85-a78c-2b30c30b72ab` no código-fonte (`grep` retornou vazio). Não existe `SaleItemPayment` como interface separada (`grep` retornou apenas referências ao `record` criado em `saveSaleItemPayment`). Não existe `deleteFinancialAccount` como método chamado pelo `deleteCreditPayment` (existe o método `deleteFinancialAccount` no `storageService`, mas `deleteCreditPayment` NÃO o chama — confirmado pela leitura).

## 4.1 — Onde o "produto fiado" sem nome pode vir?

### Fonte A: buildManualDebtSale (FiadosView.tsx)
`FiadosView.tsx:174-201` (leitura confirmada):
```typescript
export const buildManualDebtSale = (input: ManualDebtInput): Sale | null => {
  ...
  return {
    ...
    items: [],
    subtotal: amount,
    discount: 0,
    total: amount,
    payments: [{ method: 'credit_account', amount }],
    orderSource: 'fiado',
    ...
    notes: reason,
  } as Sale;
};
```
- `items: []` — venda sem itens.
- `payments: [{method:'credit_account', amount}]` — já inclui o pagamento no objeto `Sale`.

Se `handleRegisterDebt` (l.609) cria essa venda via `buildManualDebtSale`, a venda é salva (`addSale`, l.649). `addSale` (storageService, l.4022) NÃO cria `CreditPayment` automaticamente — apenas salva o `Sale` no `localStorage` + `upsertRow('sales', ...)`. O `payments` da venda fica no `sale.payments`.

O `FiadosView` (`customerDebts`) filtra vendas com `payments.some(p => p.method === 'credit_account')` (l.283-285). A venda manual (`orderSource: 'fiado'`, `items: []`) é incluída. `getSaleDebtItems` (l.109) retorna `{debt: creditAmount, items: [{productId: sale.id, productName: label, ...}]}` com `label` baseado em `sale.notes` (l.116-117). Se `sale.notes` está vazio (`reason` vazio), `label` é `"Venda ${sale.code || ''} — itens não discriminados"`. Se `sale.code` também está vazio, `label` fica como `"Venda  — itens não discriminados"`. Nenhum `productName` vazio causa erro — apenas exibição estranha.

Não existe `is_fiado` como campo no banco ou no código (`grep` retornou vazio). A categoria no `financial_transactions` é `fiado_payment` (`FiadosView.tsx:476` e `FiadosView.tsx:550` — edição aplicada na FASE 1). A tabela `sales` no banco tem `status`, `customer_id`, `total`, `payments_json`, etc. (referenciado no `AGENTS.md` e no `SUPABASE_SCHEMA.md` — não auditado integralmente, mas confirmado pelo código que usa `payments_json` para leitura e `payments` para escrita local).

Não existe nenhum registro com `name` ausente no banco para `products` (a tabela `products` tem `name: string`; `isActive` = `true` por padrão). Se `name` estiver vazio, a venda ainda funciona, mas a exibição no `FiadosView` (`getSaleDebtItems`) usa `sale.notes` (que é obrigatório — `reason` é verificado em `handleRegisterDebt`, l.614-615: `if (!debtReason.trim()) { addToast('error', ...); return; }`). Então `notes` não fica vazio para dívidas manuais válidas.

Se `sales` incluir uma venda com `items: []` mas `notes` vazio (ex.: uma venda de `fiado` criada diretamente no banco sem `notes`), `label` fica como `"Venda [código] — itens não discriminados"`. Se `code` também vazio, `label` fica estranho. Nenhum erro de runtime ocorre — apenas exibição estranha. Nenhuma alteração aplicada.

## 4.2 — Onde poderia vir um "produto virtual"?

Nenhuma referência a `is_fiado` como `category` de produto (`grep` vazio). Nenhum `productId` `2fe0edd6-...` encontrado no código. Nenhum campo `fiado` na tabela `products` (referenciado no `AGENTS.md` como inexistente). Se o usuário viu esse ID no console, ele pode vir de:
- `initialCash` ou algum `UUID` de `cash_sessions` (`b6728ac9-...` visto nos logs — não o mesmo).
- `customer_id` (`2ebe1985-...` visto nos logs para `customer_name=Mineiro` — não `dionathan`).
- Algum `sale.id` (`228a69ca-...` visto para `dionathan GORDAO`).
- Nenhuma correspondência direta com `2fe0edd6-...`.

Não há evidência no código de um produto virtual com esse UUID. Se ele aparece no banco (`products`), seria um registro criado externamente (ex.: via `addSale` com `items` vazio mas com `productId` definido por algum fluxo não documentado nesta sessão). Nenhuma alteração aplicada.

## 4.3 — Observação final (nenhuma alteração)
Nenhuma alteração aplicada neste bloco. A auditoria documenta que o "produto fiado sem nome" não existe no código como `is_fiado`; a venda manual (`fiado`) tem `items: []`, `notes` obrigatório, e `label` derivado de `notes`. Nenhum erro de runtime ocorre. Se o usuário viu `name` vazio no console, pode ser um registro externo no banco (`products.name = ''`), mas isso não quebra o `FiadosView` (que usa `sale.notes`). Nenhuma correção necessária sem mais evidências.
