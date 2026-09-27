# BLOCO 11 — PERMISSÕES E SEGURANÇA (AUDITORIA COMPLETA — NENHUMA ALTERAÇÃO NESTA RODADA)
- `FiadosView.tsx` (`l.245`): `isAdmin = user.role === 'admin' || !!user.superadmin`.
- `handleConfirmDeletePayment`: NÃO verifica `isAdmin` diretamente (apenas usa `addToast`). Se `user.permissions` permitir acesso ao módulo `fiado` (`tabAccess.ts`), o botão de exclusão aparece. Nenhuma restrição adicional no componente.
- `deleteCreditPayment`: não valida `isAdmin`; qualquer usuário que chame `deleteCreditPayment` com um `id` válido pode excluir. Se o `FiadosView` é acessível apenas por `admin`/`manager` (`Sidebar`), o risco é reduzido. Nenhuma alteração aplicada.
- `RLS` (`AGENTS.md`): `sales`, `credit_payments`, `financial_transactions`, `sale_items` têm policies `org_*` (`org_select_*`, `org_insert_*`, `org_update_*`, `org_delete_*`). Se `storeBranchId` vazio ou `orgId` vazio, a RLS rejeita (`403`/`42501`). O `handleItemPayment` (`branchId` guard) protege contra `storeBranchId` vazio. Nenhuma alteração aplicada.
- Nenhuma alteração aplicada neste bloco.
- Status: concluído.
