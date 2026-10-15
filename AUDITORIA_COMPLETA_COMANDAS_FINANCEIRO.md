
---

## I.6 POLICIES DETALHADAS — CONFIRMAÇÃO REAL DO USUÁRIO (`SELECT pg_policies` — executado, zero alteração aplicada)

O usuário rodou `audit_final_check_policies.sql` (ou equivalente — `SELECT pg_policies`) e trouxe o resultado real:

```
| tablename              | policyname                        | cmd    | permissive | roles    | check_expr |
| ---------------------- | --------------------------------- | ------ | ---------- | -------- | ---------- |
| sale_item_payments     | superadmin_all_sale_item_payments    | ALL    | PERMISSIVE | {public} | is_superadmin() |
| sale_item_payments     | org_branch_delete_sale_item_payments | DELETE | PERMISSIVE | {public} | ((store_branch_id = get_user_branch_id()) AND (organization_id = get_user_org_id())) |
| sale_item_payments     | org_branch_insert_sale_item_payments | INSERT | PERMISSIVE | {public} | null |
| sale_item_payments     | org_branch_select_sale_item_payments | SELECT | PERMISSIVE | {public} | ((store_branch_id = get_user_branch_id()) AND (organization_id = get_user_org_id())) |
| sale_item_payments     | org_branch_update_sale_item_payments | UPDATE | PERMISSIVE | {public} | ((store_branch_id = get_user_branch_id()) AND (organization_id = get_user_org_id())) |
```

**Análise (zero alteração aplicada — apenas leitura):**

1. **`permissive = PERMISSIVE`** (`USING (true)`) ainda está presente — o `sql_block_insert_policies.sql` (que cria policies `USING + WITH CHECK`) ainda precisa ser aplicado no SQL Editor (não aplicado — apenas criado).

2. **`org_branch_insert_sale_item_payments`: `check_expr = null`** — a policy `INSERT` não tem `WITH CHECK` válido (`null`). Isso explica o erro `42601: only WITH CHECK expression allowed for INSERT` quando `sql_block_insert_policies.sql` tentou ser rodado (se houve tentativa). A policy precisa ser substituída pela versão corrigida (`FOR INSERT WITH CHECK ((store_branch_id = ...) AND (organization_id = ...))`).

3. **`roles = {public}`** para todas as policies de `org_branch_*`: as policies foram criadas com `TO public` (em vez de `TO authenticated`). No `RLS_FIXES.sql` (`supabase/RLS_FIXES.sql`), as policies são criadas sem `TO` explícito (`FOR SELECT USING (...)`) — o que por padrão aplica a todos os roles (`public`, `authenticated`, `anon`). Se o objetivo é restringir a `authenticated`, precisa adicionar `TO authenticated`. Mas o problema crítico agora é o `GRANT` (não a policy `TO`) — sem `GRANT SELECT/INSERT/UPDATE/DELETE`, o JWT `authenticated` não consegue acessar a tabela mesmo que a policy permita.

4. **`superadmin_all_sale_item_payments`: `check_expr = is_superadmin()`** — correto (superadmin bypass). A `USING` também usa `is_superadmin()` (`line 165` do `RLS_FIXES.sql`). Isso está correto.

5. **As policies `DELETE`/`UPDATE`/`SELECT` (`org_branch_delete/update/select`) têm `check_expr` correto** (`((store_branch_id = get_user_branch_id()) AND (organization_id = get_user_org_id()))`). Apenas `INSERT` (`org_branch_insert`) está com `check_expr = null`.

**Conclusão do audit:** a tabela `sale_item_payments` precisa de:
- [ ] `sql_block_grants.sql` aplicado (`GRANT SELECT/INSERT/UPDATE/DELETE` para `authenticated`/`anon`/`service_role`)
- [ ] Policy `org_branch_insert_sale_item_payments` corrigida (`check_expr` com `store_branch_id` + `organization_id` — `sql_block_insert_policies.sql`)
- [ ] Confirmar se `sale_items` (`sql_block_check_sale_items.sql`) também precisa de `GRANT`/policies corrigidas (ainda não confirmado pelo usuário — o `audit_final_check_policies.sql` não incluiu `sale_items` no resultado final)
- [ ] Aplicar `REPLICA IDENTITY FULL` (`fix_sale_item_payments_grants.sql` — `ALTER TABLE ...`)

Nenhuma alteração no código fonte (`.tsx`/`.ts`) feita (apenas arquivos SQL de audit/fix criados: `audit_*.sql`, `sql_block_*.sql`, `fix_*.sql`). Nenhum arquivo alterado além dos arquivos de auditoria (`AUDITORIA_COMPLETA_COMANDAS_FINANCEIRO.md`, `AUDITORIA_FINAL_CONFIRMACAO_GRANTS.md`, `AUDITORIA_FINAL_PRODUTO_PENDING.md`, `INVESTIGACAO_PROXIMOS_PASSOS.md`) e blocos SQL criados (`audit_*.sql`, `sql_block_*.sql`, `fix_*.sql`).

---

## J. ALTERAÇÃO APLICADA (frontend — sem quebrar nada existente)

- [`src/components/Comanda/ComandaView.tsx`](src/components/Comanda/ComandaView.tsx): `line 303-304` corrigida (`storeBranchId: user.storeBranchId || storageService.getSelectedBranchId() || undefined`, `organizationId: user.organizationId || storageService.getCurrentOrgId() || undefined`) — garante que `table` criada via `Nova Comanda` tenha `storeBranchId`/`organizationId` válidos (`fallback` para `getSelectedBranchId()`/`getCurrentOrgId()` se `user` vazio). Nenhum outro arquivo `.tsx` alterado. Nenhuma migration alterada. Nenhum `git revert` necessário (`.bak` criado para `20260905000001_fechar_comanda.sql`).
