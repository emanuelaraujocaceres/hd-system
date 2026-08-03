/**
 * IAM — Identity & Access Management
 *
 * Arquitetura de permissões de 3 níveis para o HD-System:
 *
 * Nível 0 — DESENVOLVEDOR (superadmin)
 *   Acesso TOTAL e IRRESTRITO a todas as organizações, filiais, e tabelas.
 *   Não pode ser bloqueado por nenhuma política RLS.
 *
 * Nível 1 — ADMINISTRADOR DE ORGANIZAÇÃO
 *   Acesso total dentro da SUA organização (todas as filiais).
 *   Gerencia usuários, configurações, relatórios da organização.
 *   NÃO pode ver outras organizações.
 *
 * Nível 2 — COLABORADOR
 *   Acesso APENAS à filial onde trabalha.
 *   PDV, consulta de produtos/clientes, visualização de estoque.
 *   NÃO pode gerenciar usuários, relatórios, ou configurações.
 *
 * Hierarquia: DESENVOLVEDOR > ADMINISTRADOR > COLABORADOR
 */

import { UserProfile } from '../types';

// ─── ACCESS LEVELS ─────────────────────────────────────────────

/** Access level hierarchy: lower number = higher privilege */
export enum AccessLevel {
  DEVELOPER = 0,   // Superadmin — full access to everything
  ADMIN = 1,       // Organization admin — full access within org
  COLLABORATOR = 2, // Branch-level user — limited to their branch
}

// ─── MODULE PERMISSIONS ────────────────────────────────────────

/** Available modules in the system */
export type Module =
  | 'pdv'          // Point of Sale
  | 'inventory'    // Product & stock management
  | 'crm'          // Customer management (FiadosView)
  | 'finance'      // Financial accounts & reports
  | 'dashboard'    // Dashboard & analytics
  | 'settings'     // System settings
  | 'users'        // User management
  | 'branches'     // Branch management
  | 'organizations' // Organization management (superadmin only)
  | 'audit';       // Audit logs & DLQ (superadmin only)

/** Actions that can be performed on a module */
export type PermissionAction = 'view' | 'create' | 'edit' | 'delete';

/** Permission descriptor */
export interface Permission {
  module: Module;
  action: PermissionAction;
}

// ─── ROLE → PERMISSION MATRIX ──────────────────────────────────

/**
 * Default permissions for each role.
 * Developers bypass this entirely (they have access to everything).
 * Admins have full access within their org.
 * Collaborators have limited access scoped to their branch.
 */
const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  // Admin: everything except superadmin-only modules
  admin: [
    { module: 'pdv', action: 'view' },
    { module: 'pdv', action: 'create' },
    { module: 'pdv', action: 'edit' },
    { module: 'pdv', action: 'delete' },
    { module: 'inventory', action: 'view' },
    { module: 'inventory', action: 'create' },
    { module: 'inventory', action: 'edit' },
    { module: 'inventory', action: 'delete' },
    { module: 'crm', action: 'view' },
    { module: 'crm', action: 'create' },
    { module: 'crm', action: 'edit' },
    { module: 'crm', action: 'delete' },
    { module: 'finance', action: 'view' },
    { module: 'finance', action: 'create' },
    { module: 'finance', action: 'edit' },
    { module: 'finance', action: 'delete' },
    { module: 'dashboard', action: 'view' },
    { module: 'settings', action: 'view' },
    { module: 'settings', action: 'edit' },
    { module: 'users', action: 'view' },
    { module: 'users', action: 'create' },
    { module: 'users', action: 'edit' },
    { module: 'users', action: 'delete' },
    { module: 'branches', action: 'view' },
    { module: 'branches', action: 'create' },
    { module: 'branches', action: 'edit' },
    { module: 'branches', action: 'delete' },
  ],
  // Collaborator: PDV + read-only inventory/CRM, no settings/users/finance
  collaborator: [
    { module: 'pdv', action: 'view' },
    { module: 'pdv', action: 'create' },
    { module: 'inventory', action: 'view' },
    { module: 'crm', action: 'view' },
    { module: 'crm', action: 'create' },
    { module: 'crm', action: 'edit' },
    { module: 'dashboard', action: 'view' },
  ],
  // Manager: same as admin (legacy role)
  manager: [
    { module: 'pdv', action: 'view' },
    { module: 'pdv', action: 'create' },
    { module: 'pdv', action: 'edit' },
    { module: 'pdv', action: 'delete' },
    { module: 'inventory', action: 'view' },
    { module: 'inventory', action: 'create' },
    { module: 'inventory', action: 'edit' },
    { module: 'inventory', action: 'delete' },
    { module: 'crm', action: 'view' },
    { module: 'crm', action: 'create' },
    { module: 'crm', action: 'edit' },
    { module: 'crm', action: 'delete' },
    { module: 'finance', action: 'view' },
    { module: 'finance', action: 'create' },
    { module: 'finance', action: 'edit' },
    { module: 'finance', action: 'delete' },
    { module: 'dashboard', action: 'view' },
    { module: 'settings', action: 'view' },
    { module: 'settings', action: 'edit' },
    { module: 'users', action: 'view' },
    { module: 'users', action: 'create' },
    { module: 'users', action: 'edit' },
    { module: 'users', action: 'delete' },
    { module: 'branches', action: 'view' },
    { module: 'branches', action: 'create' },
    { module: 'branches', action: 'edit' },
    { module: 'branches', action: 'delete' },
  ],
  // Cashier: minimal — PDV only
  cashier: [
    { module: 'pdv', action: 'view' },
    { module: 'pdv', action: 'create' },
  ],
};

// ─── TAB → MODULE MAPPING ──────────────────────────────────────

/**
 * Maps navigation tabs to the module permission required to view them.
 * Used by the Sidebar and App.tsx to show/hide tabs based on role.
 */
export const TAB_MODULE_MAP: Record<string, Module> = {
  pdv: 'pdv',
  inventory: 'inventory',
  crm: 'crm',
  finance: 'finance',
  dashboard: 'dashboard',
  settings: 'settings',
  users: 'users',
  branches: 'branches',
  organizations: 'organizations',
  tv: 'pdv', // TV showcase is part of PDV module
};

// ─── CORE PERMISSION ENGINE ────────────────────────────────────

export class PermissionEngine {
  private user: UserProfile | null;
  private level: AccessLevel;
  private effectivePermissions: Permission[];

  constructor(user: UserProfile | null) {
    this.user = user;
    this.level = this._computeLevel(user);
    this.effectivePermissions = this._computePermissions(user);
  }

  /** Compute the access level from user profile */
  private _computeLevel(user: UserProfile | null): AccessLevel {
    if (!user) return AccessLevel.COLLABORATOR;
    if (user.superadmin) return AccessLevel.DEVELOPER;
    if (user.role === 'admin' || user.role === 'manager') return AccessLevel.ADMIN;
    return AccessLevel.COLLABORATOR;
  }

  /** Compute effective permissions for a user */
  private _computePermissions(user: UserProfile | null): Permission[] {
    if (!user) return [];

    // Developer: bypass everything — has all permissions
    if (user.superadmin) {
      const allPermissions: Permission[] = [];
      const modules: Module[] = ['pdv', 'inventory', 'crm', 'finance', 'dashboard', 'settings', 'users', 'branches', 'organizations', 'audit'];
      const actions: PermissionAction[] = ['view', 'create', 'edit', 'delete'];
      for (const mod of modules) {
        for (const act of actions) {
          allPermissions.push({ module: mod, action: act });
        }
      }
      return allPermissions;
    }

    // Start with role-based defaults
    const rolePerms = [...(ROLE_PERMISSIONS[user.role] || ROLE_PERMISSIONS.collaborator)];

    // Merge with custom user permissions (from DB)
    if (user.permissions) {
      const customMap = user.permissions as unknown as Record<string, boolean>;
      // If a custom permission is explicitly set to false, remove it
      // If explicitly set to true, add it
      for (const mod of Object.keys(customMap)) {
        if (customMap[mod] === false) {
          // Remove all permissions for this module
          const idx = rolePerms.findIndex(p => p.module === mod);
          if (idx >= 0) rolePerms.splice(idx, rolePerms.length);
        } else if (customMap[mod] === true) {
          // Add view + create for this module if not already present
          if (!rolePerms.some(p => p.module === mod && p.action === 'view')) {
            rolePerms.push({ module: mod as Module, action: 'view' });
            rolePerms.push({ module: mod as Module, action: 'create' });
          }
        }
      }
    }

    return rolePerms;
  }

  // ─── PUBLIC API ───────────────────────────────────────────────

  /** Get the user's access level */
  getAccessLevel(): AccessLevel {
    return this.level;
  }

  /** Check if the user is a developer (superadmin) */
  isDeveloper(): boolean {
    return this.level === AccessLevel.DEVELOPER;
  }

  /** Check if the user is an admin (or higher) */
  isAdmin(): boolean {
    return this.level <= AccessLevel.ADMIN;
  }

  /** Check if the user is a collaborator (or higher — always true) */
  isCollaborator(): boolean {
    return true; // All authenticated users are at least collaborators
  }

  /**
   * Check if the user has a specific permission.
   * Developers always return true.
   */
  hasPermission(module: Module, action: PermissionAction = 'view'): boolean {
    // Developer bypasses all checks
    if (this.level === AccessLevel.DEVELOPER) return true;

    return this.effectivePermissions.some(
      p => p.module === module && p.action === action
    );
  }

  /**
   * Check if the user can access a navigation tab.
   * Developers can access all tabs.
   */
  canAccessTab(tabId: string): boolean {
    if (this.level === AccessLevel.DEVELOPER) return true;
    const module = TAB_MODULE_MAP[tabId];
    if (!module) return false;
    return this.hasPermission(module, 'view');
  }

  /**
   * Get all tabs the user can access.
   */
  getAccessibleTabs(allTabs: string[]): string[] {
    return allTabs.filter(tab => this.canAccessTab(tab));
  }

  /**
   * Check if the user can access data from a specific branch.
   * - Developer: yes (all branches)
   * - Admin: yes (all branches within their org)
   * - Collaborator: only their own branch
   */
  canAccessBranch(branchId: string, userBranchId: string, isSuperadmin: boolean): boolean {
    if (isSuperadmin) return true;
    if (this.level <= AccessLevel.ADMIN) return true; // Admin sees all branches in org
    return branchId === userBranchId; // Collaborator sees only their branch
  }

  /**
   * Get the level label in Portuguese.
   */
  getLevelLabel(): string {
    switch (this.level) {
      case AccessLevel.DEVELOPER: return 'Desenvolvedor';
      case AccessLevel.ADMIN: return 'Administrador';
      case AccessLevel.COLLABORATOR: return 'Colaborador';
    }
  }

  /**
   * Get the role label in Portuguese.
   */
  static getRoleLabel(role: string): string {
    switch (role) {
      case 'admin': return 'Administrador';
      case 'manager': return 'Gerente';
      case 'collaborator': return 'Colaborador';
      case 'cashier': return 'Caixa';
      default: return role;
    }
  }
}
