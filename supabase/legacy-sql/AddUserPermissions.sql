-- ==============================================================================
-- FIX ROWS: User_permissions table + RLS policies
-- ==============================================================================
-- 1. Criar tabela user_permissions
-- 2. Adicionar políticas RLS para todas as tabelas (superadmin + permissions)
-- 3. Inserir admin com todas as permissões
-- ==============================================================================

-- ═══════════════════════════════════════════════════════════════════════════════
-- PASSO 1: Criar tabela user_permissions
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.user_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    table_name TEXT NOT NULL, -- products, customers, sales, etc.
    can_read BOOLEAN DEFAULT FALSE,
    can_write BOOLEAN DEFAULT FALSE,
    can_delete BOOLEAN DEFAULT FALSE,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, table_name, organization_id)
);

-- Enable RLS on the new table
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

-- Policy: usuários veem suas próprias permissões
CREATE POLICY "RLS_user_permissions_self_read" ON public.user_permissions
    FOR SELECT USING (user_id = auth.uid());

-- ═══════════════════════════════════════════════════════════════════════════════
-- PASSO 2: Função auxiliar para verificar acesso por permissão
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.has_permission(
    requested_table TEXT,
    requested_action TEXT -- 'read', 'write', or 'delete'
)
RETURNS BOOLEAN AS $$
BEGIN
    -- Superadmins têm tudo
    IF public.is_superadmin() THEN
        RETURN TRUE;
    END IF;

    -- Usuários com permissão específica para esta tabela e ação
    RETURN EXISTS (
        SELECT 1
        FROM public.user_permissions up
        WHERE up.user_id = auth.uid()
          AND up.table_name = requested_table
          AND (
              (requested_action = 'read' AND up.can_read)
            OR (requested_action = 'write' AND up.can_write)
            OR (requested_action = 'delete' AND up.can_delete)
          )
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.has_permission TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_permission TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PASSO 3: RLS policies para todas as tabelas afetadas (superadmin + permissions)
-- ═══════════════════════════════════════════════════════════════

DO $$
DECLARE
    target_tables TEXT[] := ARRAY[
        'products', 'customers', 'sales', 'stock_movements', 'categories',
        'suppliers', 'store_branches', 'financial_transactions', 'cash_sessions', 'sale_items'
    ];
    table_name TEXT;
BEGIN
    FOREACH table_name IN ARRAY target_tables
    LOOP
        -- Política SELECT: superadmin OU permissão de leitura
        EXECUTE format(
            'CREATE POLICY "RLS_%s_select_permission" ON public.%s
             FOR SELECT USING (public.is_superadmin() OR public.has_permission(%L, ''read''));',
            table_name, table_name, table_name
        );
        
        -- Política INSERT: superadmin OU permissão de escrita
        EXECUTE format(
            'CREATE POLICY "RLS_%s_insert_permission" ON public.%s
             FOR INSERT WITH CHECK (public.is_superadmin() OR public.has_permission(%L, ''write''));',
            table_name, table_name, table_name
        );
        
        -- Política UPDATE: superadmin OU permissão de escrita
        EXECUTE format(
            'CREATE POLICY "RLS_%s_update_permission" ON public.%s
             FOR UPDATE USING (public.is_superadmin() OR public.has_permission(%L, ''write''));',
            table_name, table_name, table_name
        );
        
        -- Política DELETE: superadmin OU permissão de exclusão
        EXECUTE format(
            'CREATE POLICY "RLS_%s_delete_permission" ON public.%s
             FOR DELETE USING (public.is_superadmin() OR public.has_permission(%L, ''delete''));',
            table_name, table_name, table_name
        );
        
        RAISE NOTICE '✅ Políticas RLS criadas para %', table_name;
    END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PASSO 4: Conceder permissão total para o admin (emanuel@gmail.com) em todas as tabelas
-- ═══════════════════════════════════════════════════════════════

DO $$
DECLARE
    target_tables TEXT[] := ARRAY[
        'products', 'customers', 'sales', 'stock_movements', 'categories',
        'suppliers', 'store_branches', 'financial_transactions', 'cash_sessions', 'sale_items'
    ];
    admin_email TEXT := 'emanuel@gmail.com';
    target_table TEXT;
    admin_user_id UUID;
    admin_org_id UUID;
BEGIN
    -- Encontrar o admin no system_users
    SELECT id, organization_id INTO admin_user_id, admin_org_id
    FROM public.system_users
    WHERE email = admin_email;
    
    IF admin_user_id IS NULL THEN
        RAISE EXCEPTION 'Admin emmanuel@gmail.com não encontrado no system_users';
    END IF;
    
    FOREACH target_table IN ARRAY target_tables
    LOOP
        -- Inserir permissões completas para o admin
        INSERT INTO public.user_permissions (
            user_id, table_name, organization_id,
            can_read, can_write, can_delete
        ) VALUES (
            admin_user_id,
            target_table,
            admin_org_id,
            TRUE, -- can_read
            TRUE, -- can_write
            TRUE  -- can_delete
        )
        ON CONFLICT (user_id, table_name, organization_id) DO UPDATE
        SET can_read = TRUE,
            can_write = TRUE,
            can_delete = TRUE,
            updated_at = CURRENT_TIMESTAMP;
        
        RAISE NOTICE '✅ Permissões máximas concedidas a % para %', admin_email, target_table;
    END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO
-- ═══════════════════════════════════════════════════════════════

-- Listar permissões do admin
SELECT email, up.table_name, up.can_read, up.can_write, up.can_delete
FROM public.user_permissions up
JOIN public.system_users su ON up.user_id = su.id
WHERE su.email = 'emanuel@gmail.com'
ORDER BY up.table_name;

-- Testar função para diferentes usuários
-- SELECT 
--   auth.uid() as user_id,
--   public.is_superadmin() as is_superadmin,
--   public.has_permission('products', 'write') as can_write_products,
--   public.has_permission('sales', 'read') as can_read_sales;
