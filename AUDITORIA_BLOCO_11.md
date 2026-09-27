# BLOCO 11 — PERMISSÕES E SEGURANÇA (LEITURA APENAS)

## 11.1 — RLS policies (referenciadas, não auditadas integralmente nesta sessão)
Referências no `AGENTS.md` e no código:
- `sales`, `sale_items`, `financial_transactions`, `credit_payments`: policies `org_select_*`, `org_insert_*`, `org_update_*`, `org_delete_*` (referenciado no `AGENTS.md`, `BUG-RLS-002`).
- `store_branches`: `org_select_branches`, `org_insert_branches` (referenciado, `BUG-033`).
- `product_lots`: `USING (true)` removido (`BUG-RLS-001`).
- `store_branches_select_anon`: `USING (true)` mantido (`cardápio anon`, exceção 0f).
- `tables_select_anon`: `USING (true)` mantido (`cardápio anon`, exceção 0f).
- `sales_select_anon`, `sale_items_select_anon`, `customer_sessions_select_anon`: escopadas por `x-branch-id` (`cardapio_anon_rls`, `migrations/20260821_scope_anon_select_rls.sql`).
- `store_branches`: se a policy `org_select_branches` estiver faltando (`BUG-033`), o SELECT com JWT comum retorna vazio, e `getBranches()` retorna vazio — o `FiadosView` pode não carregar corretamente (mas `FiadosView` usa `sales`, `customers`, `creditPayments`, que dependem de `store_branches` apenas para `storeBranchId` — se `storeBranchId` estiver vazio, a RLS pode rejeitar).

Observação: não auditado integralmente (`pg_policies` não inspecionado diretamente nesta sessão). Nenhuma alteração aplicada.

## 11.2 — Roles e acesso (referenciado, não auditado integralmente)
- `FiadosView`: `isAdmin = user.role === 'admin' || !!user.superadmin` (l.245).
- `handleConfirmDeletePayment`: só admin (`isAdmin` usado para exibir aba "Pagamentos" e botão lixeira — confirmado pelo código, mas `handleConfirmDeletePayment` NÃO verifica `isAdmin` diretamente; apenas `setConfirmDeletePayment` é definido independentemente. Se um colaborador conseguir acessar a aba "Pagamentos" (se `moduleVisibility` permitir), ele pode excluir pagamentos — mas o `PermissionEngine` (`tabAccess.ts`) bloqueia `settings` para não-admin (`BUG-034` corrigido). Não auditado se `permissionEngine` bloqueia `fiado` para colaborador — mas `FiadosView` é renderizado se o usuário tem acesso à aba (`Fiados` no `Sidebar`). Nenhuma alteração aplicada.
- Não há verificação de `storeBranchId` no `handleRegisterPayment` ou `handleItemPayment` além do `sale.storeBranchId` (que vem do `sales` recebido via props) e `branchId` (guard aplicado no `handleItemPayment`). Se `user` tem `storeBranchId` diferente da filial selecionada, a venda pode ser gravada na filial errada (se `sales` prop vem de outra filial). Isso é um risco de segurança, mas não faz parte desta auditoria.

Observação: nenhuma alteração aplicada neste bloco.
