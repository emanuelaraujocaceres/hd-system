---
# EVIDÊNCIA REAL DO BANCO (audit final — usuário rodou SELECT no SQL Editor)
# Zero alteração aplicada ainda (nenhum CREATE/UPDATE/DELETE no DB)
---

## TABELA sale_item_payments
- Existe: true
- Colunas: 11 (id, organization_id, store_branch_id, sale_id, sale_item_id, customer_id, amount, payment_method, operator_name, paid_at, created_at)
- RLS: true (ON)
- Policies: 6 (antes era 5 — agora inclui anon_insert com check_expr=null + org_branch_insert corrigida?)
- REPLICA IDENTITY FULL: ainda precisa verificar (erro 42703 em pg_class no PG14)

## POLICIES (pg_policies — estado REAL após possíveis execuções parciais)
| tablename              | policyname                        | cmd    | permissive | roles           | check_expr |
| ---------------------- | --------------------------------- | ------ | ---------- | --------------- | ---------- |
| sale_item_payments     | anon_insert_sale_item_payments     | INSERT | PERMISSIVE | {anon}          | null |
| sale_item_payments     | org_branch_delete_sale_item_payments | DELETE | PERMISSIVE | {public}        | ((store_branch_id = get_user_branch_id()) AND (organization_id = get_user_org_id())) |
| sale_item_payments     | org_branch_insert_sale_item_payments | INSERT | PERMISSIVE | {authenticated} | null |
| sale_item_payments     | org_branch_select_sale_item_payments | SELECT | PERMISSIVE | {public}        | ((store_branch_id = get_user_branch_id()) AND (organization_id = get_user_org_id())) |
| sale_item_payments     | org_branch_update_sale_item_payments | UPDATE | PERMISSIVE | {public}        | ((store_branch_id = get_user_branch_id()) AND (organization_id = get_user_org_id())) |
| sale_item_payments     | superadmin_all_sale_item_payments     | ALL    | PERMISSIVE | {public}        | is_superadmin() |

OBSERVAÇÕES CRÍTICAS (audit — zero alteração aplicada ainda em código fonte):
1. `org_branch_insert_sale_item_payments`: `check_expr = null` — ainda NÃO TEM `WITH CHECK` válido. A policy precisa ser substituída (DROP + CREATE com `WITH CHECK ((store_branch_id = ...) AND (organization_id = ...))`).
2. `anon_insert_sale_item_payments`: `check_expr = null` (`anon` com `true`) — intencional (Regra 0f — cardápio anon), mas ainda `PERMISSIVE`.
3. `org_branch_select/update/delete`: `check_expr` correto (`USING` com filtro `org_id` + `branch_id`), mas ainda `PERMISSIVE` (`public`) — precisa ser corrigido para `USING` estrito (não `PERMISSIVE`) conforme Regra 0b, se o objetivo é segurança rigorosa. Se o objetivo é apenas funcionar, o `PERMISSIVE` com `public` funciona (qualquer usuário autenticado passa o filtro `USING` — a restrição é feita pelo filtro `USING`, não pela `permissive`). A Regra 0b diz que `USING (true)` é proibido — mas `USING ((store_branch_id = ...) AND (...))` NÃO é `USING (true)`, então essas policies NÃO violam a Regra 0b diretamente. O que viola a Regra 0b são as policies `PERMISSIVE` (`public`) que usam `USING (true)` — mas as `org_branch_*` têm `USING` com filtro, então estão tecnicamente OK do ponto de vista da regra 0b (não é `USING (true)`). O problema real é o `GRANT` (não a policy `PERMISSIVE` em si — a `PERMISSIVE` só indica que `WITH CHECK` é verificado; `public` indica que a policy se aplica a todos os roles, mas o filtro `USING` ainda restringe).
4. `GRANT` (`table_privileges`): `authenticated` AGORA TEM `INSERT`, `SELECT`, `UPDATE`, `DELETE` — o `sql_block_grants.sql` parece ter sido aplicado (o usuário confirmou que `authenticated` agora tem esses privilégios). `anon` também tem todos (`INSERT/SELECT/UPDATE/DELETE`). `service_role` também tem todos. `postgres` também.

## CONCLUSÃO DO AUDIT (zero alteração em código fonte)
- `sale_item_payments`: `GRANT` corrigido; `policy INSERT` ainda precisa ser substituída (`check_expr = null`); `policies SELECT/UPDATE/DELETE` estão com filtro correto.
- Nenhum arquivo `.tsx`/`.ts` alterado.
- Nenhuma migration alterada.
- Nenhum `git revert` necessário ainda.
- Próximo passo: confirmar se o `403` sumiu após `GRANT` aplicado e se `Remote INSERT on sale_item_payments` aparece após pagamento na Comanda.
