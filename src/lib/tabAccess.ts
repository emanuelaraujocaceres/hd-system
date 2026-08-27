/**
 * tabAccess — Fonte única de verdade para o bloqueio de página por aba.
 *
 * BUG-034: o guard de página em App.tsx (`hasAccessToTab`) só fazia bypass de
 * superadmin. admin/manager caíam no default restrito de colaborador e eram
 * bloqueados em Financeiro/Dashboard/Configurações/Usuários/Filiais — enquanto
 * a Sidebar (PermissionEngine) os mostrava. Inconsistência "menu aparece, página
 * bloqueia".
 *
 * Regras (espelham PermissionEngine em iam.ts):
 *  - Superadmin: acesso total.
 *  - Admin/Manager: acesso total DENTRO da org. A fonte é o ROLE, NUNCA
 *    user.permissions (que pode ser null / default de colaborador). Respeitam
 *    SOMENTE a module_visibility por filial (módulo desligado some para todos).
 *  - Colaborador: allowlist mesclada sobre DEFAULT_COLLABORATOR_PERMISSIONS.
 *    Comportamento idêntico ao anterior — sem regressão.
 *
 * NUNCA duplicar esta lógica em App.tsx / LoginModal. Mantenha aqui.
 */

import type { UserProfile } from '../types';
import { DEFAULT_COLLABORATOR_PERMISSIONS } from './iam';

/** Mapa tab -> chave de module_visibility (storageService.getEffectiveModuleVisibility). */
const TAB_VISIBILITY_KEY: Record<string, string> = {
  pdv: 'modulePdv',
  dashboard: 'moduleDashboard',
  inventory: 'moduleInventory',
  'nf-history': 'moduleInventory',
  finance: 'moduleFinance',
  'sales-history': 'moduleFinance',
  crm: 'moduleCrm',
  fiados: 'moduleFiado',
  comanda: 'moduleComanda',
  kds: 'moduleKds',
  delivery: 'moduleDelivery',
  cardapio_preview: 'moduleCardapioPreview',
  tv_showcase: 'moduleTvShowcase',
  connect_tv: 'moduleTvConnect',
};

export type ModuleVisibility = Record<string, boolean> | null | undefined;

export function canAccessTab(
  user: UserProfile | null,
  moduleVisibility: ModuleVisibility,
  tab: string,
): boolean {
  if (!user) return false;
  if (user.superadmin) return true;
  // Organizations: somente superadmin
  if (tab === 'organizations') return false;

  // Module visibility por filial — aplica a TODOS os não-superadmin,
  // inclusive admin/manager (design intencional: módulo desligado oculta p/ todos).
  if (moduleVisibility) {
    const key = TAB_VISIBILITY_KEY[tab];
    if (key && moduleVisibility[key] === false) return false;
  }

  // Admin/Manager: acesso total na org. Fonte = role (ignora user.permissions).
  if (user.role === 'admin' || user.role === 'manager') return true;

  // Colaborador: allowlist mesclada sobre o default restrito.
  const perms: Record<string, boolean> = {
    ...DEFAULT_COLLABORATOR_PERMISSIONS,
    tvShowcase: false,
    ...((user.permissions as unknown as Record<string, boolean> | undefined) || {}),
  };

  switch (tab) {
    case 'settings': return !!perms.settings;
    case 'pdv': return !!perms.pdv;
    case 'dashboard': return !!perms.dashboard;
    case 'inventory':
    case 'nf-history': return !!perms.inventory;
    case 'finance':
    case 'sales-history': return !!perms.finance;
    case 'crm': return !!perms.crm;
    case 'fiados': return !!perms.crm;
    case 'comanda': return !!perms.comanda;
    case 'kds': return !!perms.kds;
    case 'delivery': return !!perms.delivery;
    case 'cardapio_preview': return !!perms.cardapioDigital;
    case 'tv-showcase':
    case 'connect-tv': return perms.tvShowcase !== false;
    default: return false; // users, branches, organizations (não-superadmin)
  }
}
