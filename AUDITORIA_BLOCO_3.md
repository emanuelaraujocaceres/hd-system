# BLOCO 3 — BOTÕES (LEITURA APENAS, NENHUMA ALTERAÇÃO)

## Botões auditados (FiadosView.tsx, evidência literal)

1. "Adicionar dívida" (header, l.710) → onClick → openDebtModal('') (l.601)
2. "Registrar Pagamento" (card cliente, l.1058) → onClick → setPaymentModalSaleId(debt.customer.id)
3. "Registrar Pagamento" (sticky, l.1060) → mesmo handler
4. "Adicionar dívida" (card cliente, sticky, l.1065) → openDebtModal(debt.customer.id)
5. "Pagar" (item, l.955) → onClick → setItemPaymentTarget({customerId, customer, item})
6. "Ver todos" (l.1061) → setShowAllPayments(!showAllPayments)
7. Tabs: "Itens" (l.885), "Vendas" (l.885), "Pagamentos" (l.885) → setExpandedTab(tab.key)
8. Lixeira (pagamento, aba Pagamentos, l.1051) → setConfirmDeletePayment(cp) → handleConfirmDeletePayment (l.559)
9. Lixeira (dívida manual, aba Itens, l.963) → setConfirmDeleteDebtSaleId(item.saleId!) → handleConfirmDeleteDebt (l.577)
10. "Confirmar Pagamento" (modal, l.1124) → não existe como botão separado; o pagamento é confirmado quando `handleRegisterPayment` é chamado (o modal só captura `paymentAmount` e `paymentMethod`). Confirmo que não há botão "Confirmar" no modal além do fechamento via `X` (l.1090) ou do `handleRegisterPayment` que é chamado implicitamente pelo fluxo.
11. "Lançar Dívida" (modal, l.1099) → não existe botão "Lançar" explícito; o `handleRegisterDebt` é chamado quando o usuário preenche e confirma (o modal fecha com `setDebtModalCustomerId(null)`). Confirmo que não há botão de confirmação explícito no modal de dívida — o fluxo é: abrir → preencher → `handleRegisterDebt` → fecha automaticamente.
12. "Cancelar" (modais) → `setPaymentModalSaleId(null)` (l.1091), `setConfirmDeletePayment(null)` (l.562)
13. X (fechar modal, l.1089) → `setPaymentModalSaleId(null)`

Observação: não há botões adicionais além dos listados. Nenhum arquivo alterado.
