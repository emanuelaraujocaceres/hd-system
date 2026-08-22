/**
 * Regressão do bug "colaborador vê todos os módulos".
 * Causa raiz: o PermissionEngine tratava `user.permissions` como um delta
 * sobre o role default (que já liberava comanda/kds/delivery) e os mappers
 * usavam fallback "all-true" quando o cloud tinha permissions nulo (a
 * coluna nem existia). Agora `permissions` é uma ALLOWLIST: só os módulos
 * marcados `true` são concedidos; nulo → default RESTRITO (PDV/Estoque/CRM).
 */
import { describe, it, expect } from 'vitest';
import { PermissionEngine } from './iam';

const collab = (permissions: any) =>
  new PermissionEngine({ role: 'collaborator', permissions } as any);

describe('PermissionEngine — colaborador (fechamento de módulos)', () => {
  it('permissões explícitas = allowlist exata (apenas os marcados true)', () => {
    const e = collab({
      pdv: true, inventory: true, crm: true,
      finance: false, dashboard: false, settings: false,
    });
    expect(e.hasPermission('pdv', 'view')).toBe(true);
    expect(e.hasPermission('inventory', 'view')).toBe(true);
    expect(e.hasPermission('crm', 'view')).toBe(true);
    // não selecionados → ocultos, inclusive os que o role costumava liberar
    expect(e.hasPermission('finance', 'view')).toBe(false);
    expect(e.hasPermission('dashboard', 'view')).toBe(false);
    expect(e.hasPermission('comanda', 'view')).toBe(false);
    expect(e.hasPermission('kds', 'view')).toBe(false);
    expect(e.hasPermission('delivery', 'view')).toBe(false);
    expect(e.hasPermission('settings', 'view')).toBe(false);
    expect(e.isAdmin()).toBe(false);
  });

  it('permissions nulo cai no default RESTRITO (NUNCA all-true)', () => {
    const e = collab(null);
    expect(e.hasPermission('pdv', 'view')).toBe(true);
    expect(e.hasPermission('inventory', 'view')).toBe(true);
    expect(e.hasPermission('crm', 'view')).toBe(true);
    expect(e.hasPermission('finance', 'view')).toBe(false);
    expect(e.hasPermission('comanda', 'view')).toBe(false);
    expect(e.hasPermission('kds', 'view')).toBe(false);
    expect(e.hasPermission('settings', 'view')).toBe(false);
  });

  it('colaborador pode receber comanda/kds explicitamente via allowlist', () => {
    const e = collab({
      pdv: true, inventory: true, crm: true,
      comanda: true, kds: true,
    });
    expect(e.hasPermission('comanda', 'view')).toBe(true);
    expect(e.hasPermission('kds', 'view')).toBe(true);
    expect(e.hasPermission('delivery', 'view')).toBe(false);
  });
});

describe('PermissionEngine — admin', () => {
  it('admin tem acesso total (ignora mapa custom)', () => {
    const admin = new PermissionEngine({ role: 'admin', permissions: null } as any);
    expect(admin.hasPermission('finance', 'view')).toBe(true);
    expect(admin.hasPermission('settings', 'view')).toBe(true);
    expect(admin.hasPermission('comanda', 'view')).toBe(true);
    expect(admin.isAdmin()).toBe(true);
  });
});
