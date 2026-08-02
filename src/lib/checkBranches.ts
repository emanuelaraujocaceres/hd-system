/**
 * checkBranches — utilitário para verificar a filial atual de cada usuário.
 *
 * Uso: chame checkAllUsersBranch() de um botão temporário no painel admin
 * ou rode diretamente no console do navegador após o app carregar.
 *
 * Requer que o usuário atual tenha permissão de superadmin ou admin
 * para ler system_users e store_branches.
 */

import { supabase } from './supabase';

export interface UserBranchInfo {
  id: string;
  name: string;
  email: string;
  role: string;
  branchId: string | null;
  branchName: string | null;
  branchCity: string | null;
  branchState: string | null;
  isHeadquarters: boolean;
}

export async function checkAllUsersBranch(): Promise<UserBranchInfo[]> {
  // Buscar todas as filiais
  const { data: branches, error: branchesError } = await supabase
    .from('store_branches')
    .select('id, name, city, state, is_headquarters');

  if (branchesError) {
    console.error('[checkBranches] Erro ao buscar filiais:', branchesError.message);
    return [];
  }

  const branchMap = new Map(
    (branches ?? []).map((b) => [b.id, b])
  );

  // Buscar todos os usuários
  const { data: users, error: usersError } = await supabase
    .from('system_users')
    .select('id, name, email, role, store_branch_id');

  if (usersError) {
    console.error('[checkBranches] Erro ao buscar usuários:', usersError.message);
    return [];
  }

  return (users ?? []).map((user) => {
    const branch = user.store_branch_id ? branchMap.get(user.store_branch_id) : null;
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      branchId: user.store_branch_id ?? null,
      branchName: branch?.name ?? null,
      branchCity: branch?.city ?? null,
      branchState: branch?.state ?? null,
      isHeadquarters: branch?.is_headquarters ?? false,
    };
  });
}

/**
 * Imprime no console a filial atual de cada usuário.
 * Chame esta função no console do navegador ou de um botão temporário.
 */
export async function printUsersBranch(): Promise<void> {
  console.log('[checkBranches] Buscando filial de cada usuário...');
  const users = await checkAllUsersBranch();

  if (users.length === 0) {
    console.log('[checkBranches] Nenhum usuário encontrado.');
    return;
  }

  console.log('[checkBranches] === FILIAL ATUAL DE CADA USUÁRIO ===');
  users.forEach((u) => {
    const branchLabel = u.branchName
      ? `${u.branchName} (${u.branchCity} - ${u.branchState})${u.isHeadquarters ? ' [Matriz]' : ''}`
      : 'SEM FILIAL ATRIBUÍDA';
    console.log(`  ${u.name.padEnd(25)} | ${u.role.padEnd(10)} | ${branchLabel}`);
  });
  console.log('[checkBranches] === FIM ===');
}
