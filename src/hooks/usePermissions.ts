/**
 * usePermissions — React hook for IAM permission checking.
 *
 * Usage:
 *   const { canView, canCreate, canEdit, canDelete, isDeveloper, isAdmin, level } = usePermissions();
 *
 *   if (canView('inventory')) {
 *     // Show inventory tab
 *   }
 *
 *   if (canDelete('users')) {
 *     // Show delete button
 *   }
 */

import { useMemo } from 'react';
import { PermissionEngine, AccessLevel, Module, PermissionAction, TAB_MODULE_MAP } from '../lib/iam';
import { UserProfile } from '../types';

export interface PermissionHookResult {
  /** The underlying PermissionEngine instance */
  engine: PermissionEngine;

  /** Access level */
  level: AccessLevel;

  /** Role shortcuts */
  isDeveloper: boolean;
  isAdmin: boolean;
  isCollaborator: boolean;

  /** Check specific permission */
  canView: (module: Module) => boolean;
  canCreate: (module: Module) => boolean;
  canEdit: (module: Module) => boolean;
  canDelete: (module: Module) => boolean;

  /** Check tab access */
  canAccessTab: (tabId: string) => boolean;
  getAccessibleTabs: (allTabs: string[]) => string[];

  /** Get level label in Portuguese */
  levelLabel: string;

  /** Get role label for a user */
  getRoleLabel: (role: string) => string;
}

export function usePermissions(user: UserProfile | null): PermissionHookResult {
  const engine = useMemo(() => new PermissionEngine(user), [user?.id, user?.role, user?.superadmin]);

  return useMemo(() => ({
    engine,
    level: engine.getAccessLevel(),
    isDeveloper: engine.isDeveloper(),
    isAdmin: engine.isAdmin(),
    isCollaborator: engine.isCollaborator(),
    canView: (module: Module) => engine.hasPermission(module, 'view'),
    canCreate: (module: Module) => engine.hasPermission(module, 'create'),
    canEdit: (module: Module) => engine.hasPermission(module, 'edit'),
    canDelete: (module: Module) => engine.hasPermission(module, 'delete'),
    canAccessTab: (tabId: string) => engine.canAccessTab(tabId),
    getAccessibleTabs: (allTabs: string[]) => engine.getAccessibleTabs(allTabs),
    levelLabel: engine.getLevelLabel(),
    getRoleLabel: PermissionEngine.getRoleLabel,
  }), [engine]);
}

export { AccessLevel };
export type { Module, PermissionAction };
export { TAB_MODULE_MAP };
