-- ============================================================
-- DIAGNÓSTICO: Por que o UPDATE não funciona?
-- Execute cada linha separadamente no SQL Editor.
-- ============================================================

-- 1. Verificar quantas linhas o WHERE encontra
SELECT id, email, organization_id, superadmin, role 
FROM public.system_users 
WHERE email = 'emanuel@gmail.com' AND superadmin = true;

-- 2. Tentar UPDATE com WHERE por ID (mais preciso)
UPDATE public.system_users 
SET organization_id = NULL 
WHERE id = 'ac7e5faf-e279-413d-a4a1-95c85acf5fa8';

-- 3. Verificar se mudou
SELECT id, email, organization_id 
FROM public.system_users 
WHERE id = 'ac7e5faf-e279-413d-a4a1-95c85acf5fa8';

-- 4. Se ainda não mudou, verificar se existe trigger
SELECT trigger_name, event_manipulation, action_statement
FROM information_schema.triggers
WHERE event_object_table = 'system_users'
  AND event_object_schema = 'public';

-- 5. Forçar com valor explícito e depois NULL
UPDATE public.system_users 
SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE id = 'ac7e5faf-e279-413d-a4a1-95c85acf5fa8';

UPDATE public.system_users 
SET organization_id = NULL
WHERE id = 'ac7e5faf-e279-413d-a4a1-95c85acf5fa8';

-- 6. Verificar resultado final
SELECT id, email, organization_id, superadmin 
FROM public.system_users 
WHERE id = 'ac7e5faf-e279-413d-a4a1-95c85acf5fa8';

-- 7. Testar is_superadmin
SELECT public.is_superadmin();
