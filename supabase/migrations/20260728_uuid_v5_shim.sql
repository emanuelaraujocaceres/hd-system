-- ==============================================================================
-- SHIM: uuid_generate_v5 para o ambiente local
-- Causa: a extensão uuid-ossp do Supabase local (PG 15) não fornece
--        uuid_generate_v5. A produção tem a função (provavelmente de uma
--        versão diferente da extensão ou build customizado).
-- Solução: definir a função em SQL puro, determinística (via md5), para
--          permitir o replay da migration 20260729 sem editá-la.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.uuid_generate_v5(namespace uuid, name uuid)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (
    substr(md5(namespace::text || name::text), 1, 8) || '-' ||
    substr(md5(namespace::text || name::text), 9, 4) || '-5' ||
    substr(md5(namespace::text || name::text), 13, 3) || '-' ||
    substr(md5(namespace::text || name::text), 17, 4) || '-' ||
    substr(md5(namespace::text || name::text), 21, 12)
  )::uuid;
$$;
