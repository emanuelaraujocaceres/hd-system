import { UserProfile } from '../types';

/**
 * Decide se o usuário logado (viewer) pode gerenciar (editar, holerite, excluir)
 * o usuário-alvo (target) na filial atualmente selecionada.
 *
 * Regra multi-tenant:
 * - Superadmin: gerencia QUALQUER usuário (acesso global).
 * - Admin/Manager da organização: gerencia SOMENTE colaboradores da filial
 *   selecionada (currentBranchId) e da mesma organização. Não gerencia outros
 *   admins, superadmins, nem colaboradores de outra filial/org.
 * - Demais perfis: não gerenciam ninguém.
 *
 * Esta função substitui o bug anterior em SettingsView onde o gate usava o
 * cargo do PRÓPRIO usuário da linha (isAdmin = u.role === 'admin') em vez do
 * permissão do viewer, fazendo com que só aparecessem ações para admins.
 */
export function canManageUser(
  viewer: { superadmin?: boolean; role?: UserProfile['role']; organizationId?: string; storeBranchId?: string },
  target: { role?: UserProfile['role']; organizationId?: string; storeBranchId?: string },
  currentBranchId?: string,
): boolean {
  if (viewer.superadmin) return true;

  if (viewer.role === 'admin' || viewer.role === 'manager') {
    return (
      target.role === 'collaborator' &&
      target.organizationId === viewer.organizationId &&
      target.storeBranchId === currentBranchId
    );
  }

  return false;
}
