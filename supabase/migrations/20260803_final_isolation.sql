-- ==============================================================================
-- FINAL: Isolamento multi-tenant + limpeza Plantão da Cerveja
-- ==============================================================================
-- 1. Limpa dados órfãos da Plantão da Cerveja (deixa só estrutura)
-- 2. Reforça get_auth_user_org_id() com superadmin bypass
-- 3. Garante que as policies RLS estão ativas em todas as tabelas
-- ==============================================================================

-- ═══════════════════════════════════════════════════════════════════════════════
-- PASSO 1: Deletar todos os dados da Plantão da Cerveja (organization_id = '361fb95a-3e9f-43be-a43c-0dc91f851f31')
-- Mantém apenas a organização em si e seu registro em organizations
-- ═══════════════════════════════════════════════════════════════════════════════
DO $$ DECLARE
  v_org_id UUID := '361fb95a-3e9f-43be-a43c-0dc91f851f31';
BEGIN
  -- Ordem correta para respeitar FKs
  DELETE FROM sale_items WHERE sale_id IN (SELECT id FROM sales WHERE organization_id = v_org_id);
  DELETE FROM sales WHERE organization_id = v_org_id;
  DELETE FROM stock_movements WHERE organization_id = v_org_id;
  DELETE FROM cash_sessions WHERE organization_id = v_org_id;
  DELETE FROM financial_transactions WHERE organization_id = v_org_id;
  DELETE FROM products WHERE organization_id = v_org_id;
  DELETE FROM categories WHERE organization_id = v_org_id;
  DELETE FROM customers WHERE organization_id = v_org_id;
  DELETE FROM suppliers WHERE organization_id = v_org_id;
  DELETE FROM system_settings WHERE organization_id = v_org_id;
  DELETE FROM system_users WHERE organization_id = v_org_id;
  DELETE FROM store_branches WHERE organization_id = v_org_id;
  -- Mantém organizations (a org em si) — só deleta se quiser remover a org inteira
  -- DELETE FROM organizations WHERE id = v_org_id;
  RAISE NOTICE '✅ Dados da Plantão da Cerveja limpos com sucesso';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PASSO 2: get_auth_user_org_id() robusta com superadmin bypass
-- ═══════════════════════════════════════════════════════════════════════════════
-- Superadmins têm acesso a todas as organizações. A função retorna NULL para
-- que as policies de superadmin possam ser tratadas separadamente.
-- Para usuários comuns, faz fallback: profiles → system_users(id)
CREATE OR REPLACE FUNCTION public.get_auth_user_org_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (SELECT organization_id FROM profiles WHERE id = auth.uid()),
    (SELECT organization_id FROM system_users WHERE id = auth.uid())
  );
$$;
GRANT EXECUTE ON FUNCTION public.get_auth_user_org_id TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_auth_user_org_id TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PASSO 3: Função auxiliar para verificar superadmin
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM system_users
    WHERE id = auth.uid() AND superadmin = TRUE
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_superadmin TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PASSO 4: Reaplicar RLS policies com superadmin bypass
-- ═══════════════════════════════════════════════════════════════════════════════
-- Regra: superadmin vê TUDO, usuário comum vê apenas sua organização
-- A política de SELECT permite tudo para superadmin, e filtra por org para os demais

-- Helper: já existe? Se não, cria com superadmin bypass.
-- Nota: POLICIES já existentes com organization_id = get_auth_user_org_id()
-- funcionam porque superadmin vê NULL → NULL = get_auth_user_org_id() → nenhum row match
-- Então superadmin PRECISA de uma política extra.

-- Para cada tabela com organization_id, adicionar política de superadmin
-- (se já não existir)

DO $$ DECLARE
  rec RECORD;
BEGIN
  FOR rec IN (
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename IN (
        'organizations', 'store_branches', 'products', 'categories',
        'customers', 'suppliers', 'sales', 'sale_items',
        'financial_transactions', 'cash_sessions', 'stock_movements',
        'system_users', 'system_settings'
      )
  ) LOOP
    -- Só cria política de superadmin se não existir
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = rec.tablename
        AND policyname = 'RLS_' || rec.tablename || '_superadmin'
    ) THEN
      EXECUTE format(
        'CREATE POLICY "RLS_%s_superadmin" ON %s
           FOR ALL
           USING (public.is_superadmin())
           WITH CHECK (public.is_superadmin());',
        rec.tablename, rec.tablename
      );
      RAISE NOTICE '✅ Política superadmin criada para %', rec.tablename;
    END IF;
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PASSO 5: Garantir superadmin
-- ═══════════════════════════════════════════════════════════════════════════════
UPDATE system_users SET superadmin = TRUE WHERE email = 'emanuel@gmail.com';

-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO
-- ═══════════════════════════════════════════════════════════════════════════════
-- SELECT public.get_auth_user_org_id(); -- deve retornar a org do usuário logado
-- SELECT public.is_superadmin(); -- true para emanuel, false para outros
