-- ============================================================
-- FIX: Modificar trigger para permitir superadmin com org NULL
-- O trigger fn_ensure_system_user_org() sobrescrevia organization_id
-- para NULL com o UUID padrão. Agora ele ignora superadmins.
-- Execute como um único bloco no SQL Editor.
-- ============================================================

-- 1. Atualizar a função do trigger
CREATE OR REPLACE FUNCTION fn_ensure_system_user_org()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Superadmin pode ter organization_id NULL (necessário para is_superadmin() retornar true)
  -- Usuários normais continuam recebendo a org padrão se não tiverem uma
  IF NEW.organization_id IS NULL AND NOT COALESCE(NEW.superadmin, false) THEN
    NEW.organization_id := '00000000-0000-0000-0000-000000000001';
  END IF;
  RETURN NEW;
END;
$$;

-- 2. Agora sim: definir organization_id = NULL para o superadmin
UPDATE public.system_users 
SET organization_id = NULL 
WHERE id = 'ac7e5faf-e279-413d-a4a1-95c85acf5fa8';

-- 3. Verificar resultado
SELECT id, email, organization_id, superadmin, role 
FROM public.system_users 
WHERE id = 'ac7e5faf-e279-413d-a4a1-95c85acf5fa8';

-- 4. Testar is_superadmin()
SELECT public.is_superadmin();  -- DEVE retornar true
