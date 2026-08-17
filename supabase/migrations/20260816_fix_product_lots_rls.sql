-- ============================================================
-- Fix: Replace JWT-claims-based RLS policy with helper functions
-- Product lots table uses organization_id + store_branch_id
-- Should use branch-scoped policy like other branch tables
-- ============================================================

-- 1. Remover policy antiga que usa JWT claims (provavelmente está causando 403)
DROP POLICY IF EXISTS "product_lots_auth_users" ON product_lots;
DROP POLICY IF EXISTS "product_lots_superadmin" ON product_lots;

-- 2. Aplicar policy branch-scoped usando as helper functions existentes
--    Isso garante que o usuário só veja lotis da sua organização E da sua filial
SELECT public.create_branch_policy('product_lots');

-- 3. Revogar acesso anonimo (anon shouldn't have business data access)
REVOKE ALL ON public.product_lots FROM anon;

RAISE NOTICE '✅ product_lots RLS policy fixed - using branch-scoped policy via create_branch_policy()';