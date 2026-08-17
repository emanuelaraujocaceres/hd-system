/**
 * Audit Service — HD-System
 *
 * Logs admin actions for security and compliance.
 * Writes to the audit_log table in Supabase.
 *
 * Usage:
 *   import { auditLog } from '../services/auditService';
 *   await auditLog.userCreated('John', 'john@example.com', userId);
 *   await auditLog.productUpdated('Product X', productId, oldData, newData);
 */

import { supabase } from '../lib/supabase';
import { storageService } from './storageService';

type AuditAction = 'create' | 'update' | 'delete' | 'login' | 'logout' | 'config_change';

interface AuditEntry {
  organization_id: string;
  store_branch_id?: string;
  user_id: string;
  user_name: string;
  user_email: string;
  action: AuditAction;
  entity_type: string;
  entity_id?: string;
  entity_name?: string;
  old_value?: Record<string, unknown>;
  new_value?: Record<string, unknown>;
  ip_address?: string;
  user_agent?: string;
}

async function writeAudit(entry: Omit<AuditEntry, 'ip_address' | 'user_agent'>) {
  try {
    const user = storageService.getUserProfile();
    if (!user) return; // No user context

    const fullEntry: AuditEntry = {
      ...entry,
      user_agent: navigator.userAgent,
    };

    const { error } = await supabase.from('audit_log').insert(fullEntry);
    if (error) {
      console.error('[AuditLog] Failed to write:', error);
    }
  } catch (err) {
    console.error('[AuditLog] Error:', err);
  }
}

function getCurrentUser() {
  const user = storageService.getUserProfile();
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    orgId: storageService.getCurrentOrgId(),
    branchId: storageService.getSelectedBranchId() || undefined,
  };
}

export const auditLog = {
  // ─── User Actions ────────────────────────────────────────
  async userCreated(name: string, email: string, userId: string) {
    const user = getCurrentUser();
    if (!user) return;
    await writeAudit({
      organization_id: user.orgId,
      store_branch_id: user.branchId,
      user_id: user.id,
      user_name: user.name,
      user_email: user.email,
      action: 'create',
      entity_type: 'user',
      entity_id: userId,
      entity_name: name,
      new_value: { name, email },
    });
  },

  async userUpdated(name: string, userId: string, oldData: Record<string, unknown>, newData: Record<string, unknown>) {
    const user = getCurrentUser();
    if (!user) return;
    await writeAudit({
      organization_id: user.orgId,
      store_branch_id: user.branchId,
      user_id: user.id,
      user_name: user.name,
      user_email: user.email,
      action: 'update',
      entity_type: 'user',
      entity_id: userId,
      entity_name: name,
      old_value: oldData,
      new_value: newData,
    });
  },

  async userDeleted(name: string, userId: string) {
    const user = getCurrentUser();
    if (!user) return;
    await writeAudit({
      organization_id: user.orgId,
      store_branch_id: user.branchId,
      user_id: user.id,
      user_name: user.name,
      user_email: user.email,
      action: 'delete',
      entity_type: 'user',
      entity_id: userId,
      entity_name: name,
    });
  },

  // ─── Product Actions ─────────────────────────────────────
  async productCreated(name: string, productId: string) {
    const user = getCurrentUser();
    if (!user) return;
    await writeAudit({
      organization_id: user.orgId,
      store_branch_id: user.branchId,
      user_id: user.id,
      user_name: user.name,
      user_email: user.email,
      action: 'create',
      entity_type: 'product',
      entity_id: productId,
      entity_name: name,
    });
  },

  async productUpdated(name: string, productId: string, oldData: Record<string, unknown>, newData: Record<string, unknown>) {
    const user = getCurrentUser();
    if (!user) return;
    await writeAudit({
      organization_id: user.orgId,
      store_branch_id: user.branchId,
      user_id: user.id,
      user_name: user.name,
      user_email: user.email,
      action: 'update',
      entity_type: 'product',
      entity_id: productId,
      entity_name: name,
      old_value: oldData,
      new_value: newData,
    });
  },

  async productDeleted(name: string, productId: string) {
    const user = getCurrentUser();
    if (!user) return;
    await writeAudit({
      organization_id: user.orgId,
      store_branch_id: user.branchId,
      user_id: user.id,
      user_name: user.name,
      user_email: user.email,
      action: 'delete',
      entity_type: 'product',
      entity_id: productId,
      entity_name: name,
    });
  },

  // ─── Customer Actions ────────────────────────────────────
  async customerCreated(name: string, customerId: string) {
    const user = getCurrentUser();
    if (!user) return;
    await writeAudit({
      organization_id: user.orgId,
      store_branch_id: user.branchId,
      user_id: user.id,
      user_name: user.name,
      user_email: user.email,
      action: 'create',
      entity_type: 'customer',
      entity_id: customerId,
      entity_name: name,
    });
  },

  async customerUpdated(name: string, customerId: string, oldData: Record<string, unknown>, newData: Record<string, unknown>) {
    const user = getCurrentUser();
    if (!user) return;
    await writeAudit({
      organization_id: user.orgId,
      store_branch_id: user.branchId,
      user_id: user.id,
      user_name: user.name,
      user_email: user.email,
      action: 'update',
      entity_type: 'customer',
      entity_id: customerId,
      entity_name: name,
      old_value: oldData,
      new_value: newData,
    });
  },

  // ─── Supplier Actions ────────────────────────────────────
  async supplierCreated(name: string, supplierId: string) {
    const user = getCurrentUser();
    if (!user) return;
    await writeAudit({
      organization_id: user.orgId,
      store_branch_id: user.branchId,
      user_id: user.id,
      user_name: user.name,
      user_email: user.email,
      action: 'create',
      entity_type: 'supplier',
      entity_id: supplierId,
      entity_name: name,
    });
  },

  // ─── Config Changes ──────────────────────────────────────
  async configChanged(setting: string, oldValue: unknown, newValue: unknown) {
    const user = getCurrentUser();
    if (!user) return;
    await writeAudit({
      organization_id: user.orgId,
      store_branch_id: user.branchId,
      user_id: user.id,
      user_name: user.name,
      user_email: user.email,
      action: 'config_change',
      entity_type: 'settings',
      entity_name: setting,
      old_value: { value: oldValue },
      new_value: { value: newValue },
    });
  },

  // ─── Auth Actions ────────────────────────────────────────
  async login(email: string, userId: string) {
    const user = getCurrentUser();
    if (!user) return;
    await writeAudit({
      organization_id: user.orgId,
      store_branch_id: user.branchId,
      user_id: userId,
      user_name: user.name,
      user_email: email,
      action: 'login',
      entity_type: 'auth',
      entity_id: userId,
    });
  },

  async logout() {
    const user = getCurrentUser();
    if (!user) return;
    await writeAudit({
      organization_id: user.orgId,
      store_branch_id: user.branchId,
      user_id: user.id,
      user_name: user.name,
      user_email: user.email,
      action: 'logout',
      entity_type: 'auth',
      entity_id: user.id,
    });
  },

  // ─── Generic ─────────────────────────────────────────────
  async custom(action: AuditAction, entityType: string, entityId?: string, entityName?: string, data?: { old?: Record<string, unknown>; new?: Record<string, unknown> }) {
    const user = getCurrentUser();
    if (!user) return;
    await writeAudit({
      organization_id: user.orgId,
      store_branch_id: user.branchId,
      user_id: user.id,
      user_name: user.name,
      user_email: user.email,
      action,
      entity_type: entityType,
      entity_id: entityId,
      entity_name: entityName,
      old_value: data?.old,
      new_value: data?.new,
    });
  },
};
