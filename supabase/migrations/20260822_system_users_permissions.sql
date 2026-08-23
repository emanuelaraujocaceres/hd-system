-- Migração: adiciona coluna de permissões por módulo em system_users.
-- O frontend (PermissionEngine) armazena um mapa Record<module, boolean>
-- (ex.: {"pdv":true,"inventory":true,"crm":true,"finance":false,...}).
-- Sem esta coluna, as permissões NUNCA persistiam no cloud e o fallback
-- "all-true" liberava TODOS os módulos para colaboradores.
--
-- Idempotente: pode ser rodado múltiplas vezes sem erro.

ALTER TABLE system_users ADD COLUMN IF NOT EXISTS permissions jsonb;

COMMENT ON COLUMN system_users.permissions IS
  'Permissões por módulo (Record<module, boolean>). Null = default restrito do frontend (apenas PDV/Estoque/CRM). Nunca "all-true".';
