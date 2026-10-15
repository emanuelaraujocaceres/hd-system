SELECT policyname, cmd, permissive, roles, qual AS check_expr FROM pg_policies WHERE schemaname='public' AND tablename='sale_item_payments' ORDER BY cmd, policyname;
