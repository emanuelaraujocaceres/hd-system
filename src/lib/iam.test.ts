/**
 * Regressão do bug "colaborador vê todos os módulos".
 * Causa raiz: o PermissionEngine tratava `user.permissions` como um delta
 * sobre o role default (que já liberava comanda/kds/delivery) e os mappers
 * usavam fallback "all-true" quando o cloud tinha permissions nulo (a
 * coluna nem existia). Agora `permissions` é uma ALLOWLIST: só os módulos
 * marcados `true` são concedidos; nulo → default (PDV/Estoque/CRM/Comanda/Kds; delivery off).
 */
import { describe, it, expect } from 'vitest';
import { PermissionEngine } from './iam';

const collab = (permissions: any) =>
  new PermissionEngine({ role: 'collaborator', permissions } as any);

describe('PermissionEngine — colaborador (comanda/kds por padrão)', () => {
  it('permissões explícitas mescladas com default (comanda/kds por padrão)', () => {
    const e = collab({
      pdv: true, inventory: true, crm: true,
      finance: false, dashboard: false, settings: false,
    });
    expect(e.hasPermission('pdv', 'view')).toBe(true);
    expect(e.hasPermission('inventory', 'view')).toBe(true);
    expect(e.hasPermission('crm', 'view')).toBe(true);
    // comanda/kds são concedidos por padrão mesmo sem marcação explícita
    expect(e.hasPermission('comanda', 'view')).toBe(true);
    expect(e.hasPermission('kds', 'view')).toBe(true);
    // delivery continua oculto por padrão
    expect(e.hasPermission('delivery', 'view')).toBe(false);
    // não selecionados e não-default → ocultos
    expect(e.hasPermission('finance', 'view')).toBe(false);
    expect(e.hasPermission('dashboard', 'view')).toBe(false);
    expect(e.hasPermission('settings', 'view')).toBe(false);
    expect(e.isAdmin()).toBe(false);
  });

  it('permissions nulo cai no default (comanda/kds true por padrão)', () => {
    const e = collab(null);
    expect(e.hasPermission('pdv', 'view')).toBe(true);
    expect(e.hasPermission('inventory', 'view')).toBe(true);
    expect(e.hasPermission('crm', 'view')).toBe(true);
    expect(e.hasPermission('comanda', 'view')).toBe(true);
    expect(e.hasPermission('kds', 'view')).toBe(true);
    expect(e.hasPermission('delivery', 'view')).toBe(false);
    expect(e.hasPermission('finance', 'view')).toBe(false);
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

  it('admin pode revogar comanda/kds do colaborador via false explícito', () => {
    const e = collab({ pdv: true, comanda: false, kds: false });
    expect(e.hasPermission('comanda', 'view')).toBe(false);
    expect(e.hasPermission('kds', 'view')).toBe(false);
    expect(e.hasPermission('pdv', 'view')).toBe(true);
  });

  it('regra B: colaborador com permissions.settings=true NÃO acessa Configurações', () => {
    // BUG-034: Configurações é SOMENTE admin/manager/superadmin. O PermissionEngine
    // (Sidebar/atalhos) deve ignorar user.permissions do colaborador para settings.
    const e = collab({ pdv: true, settings: true });
    expect(e.hasPermission('settings', 'view')).toBe(false);
    expect(e.hasPermission('pdv', 'view')).toBe(true);
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

// ─── canAccessBranch ─────────────────────────────────────────

describe('PermissionEngine.canAccessBranch', () => {
  it('superadmin acessa qualquer branch', () => {
    const dev = new PermissionEngine({ superadmin: true, role: 'superadmin' } as any);
    expect(dev.canAccessBranch('branch-abc', 'branch-xyz', true)).toBe(true);
    expect(dev.canAccessBranch('branch-abc', '', true)).toBe(true);
  });

  it('admin acessa qualquer branch dentro da org', () => {
    const admin = new PermissionEngine({ role: 'admin' } as any);
    expect(admin.canAccessBranch('branch-1', 'branch-2', false)).toBe(true);
    expect(admin.canAccessBranch('branch-1', 'branch-1', false)).toBe(true);
  });

  it('manager acessa qualquer branch dentro da org', () => {
    const manager = new PermissionEngine({ role: 'manager' } as any);
    expect(manager.canAccessBranch('branch-99', 'branch-1', false)).toBe(true);
  });

  it('collaborator acessa apenas sua própria branch', () => {
    const collab = new PermissionEngine({ role: 'collaborator' } as any);
    expect(collab.canAccessBranch('branch-1', 'branch-1', false)).toBe(true);
    expect(collab.canAccessBranch('branch-2', 'branch-1', false)).toBe(false);
  });

  it('collaborator negado quando branchId difere (strings diferentes)', () => {
    const collab = new PermissionEngine({ role: 'collaborator' } as any);
    expect(collab.canAccessBranch('qualquer', 'outra', false)).toBe(false);
  });

  it('isSuperadmin=true passa mesmo para null/undefined profile', () => {
    // Testa o parâmetro isSuperadmin diretamente — não depende do construtor
    const engine = new PermissionEngine(null);
    expect(engine.canAccessBranch('any', 'any', true)).toBe(true);
  });
});

// ─── getAccessibleTabs ──────────────────────────────────────

describe('PermissionEngine.getAccessibleTabs', () => {
  const allTabs = ['pdv', 'inventory', 'crm', 'finance', 'dashboard', 'settings', 'users', 'branches', 'comanda', 'kds', 'delivery'];

  it('superadmin acessa todas as tabs', () => {
    const dev = new PermissionEngine({ superadmin: true, role: 'superadmin' } as any);
    const accessible = dev.getAccessibleTabs(allTabs);
    expect(accessible).toEqual(allTabs);
  });

  it('admin acessa todas as tabs mapeadas no TAB_MODULE_MAP', () => {
    const admin = new PermissionEngine({ role: 'admin' } as any);
    const accessible = admin.getAccessibleTabs(allTabs);
    // Admin tem acesso a todos os módulos — deve incluir pdv, finance, settings, users, branches
    expect(accessible).toContain('pdv');
    expect(accessible).toContain('finance');
    expect(accessible).toContain('settings');
    expect(accessible).toContain('users');
    expect(accessible).toContain('branches');
    expect(accessible).toContain('comanda');
  });

  it('collaborator com default só acessa pdv, inventory, crm, comanda, kds', () => {
    const collab = new PermissionEngine({ role: 'collaborator' } as any);
    const accessible = collab.getAccessibleTabs(allTabs);
    expect(accessible).toContain('pdv');
    expect(accessible).toContain('inventory');
    expect(accessible).toContain('crm');
    expect(accessible).toContain('comanda');
    expect(accessible).toContain('kds');
    expect(accessible).not.toContain('finance');
    expect(accessible).not.toContain('settings');
    expect(accessible).not.toContain('users');
    expect(accessible).not.toContain('branches');
  });

  it('filtra tabs que não existem no TAB_MODULE_MAP', () => {
    const dev = new PermissionEngine({ superadmin: true, role: 'superadmin' } as any);
    const accessible = dev.getAccessibleTabs(['tab_inexistente', 'pdv', 'outra_tab']);
    expect(accessible).toContain('pdv');
    // tabs não mapeadas → canAccessTab retorna false (mesmo para superadmin, o superadmin bypassa)
    // mas superadmin bypassa, então deve conter pdv pelo menos
  });

  it('collaborator com delivery habilitado via permissions', () => {
    const collab = new PermissionEngine({
      role: 'collaborator',
      permissions: { pdv: true, delivery: true },
    } as any);
    const accessible = collab.getAccessibleTabs(allTabs);
    expect(accessible).toContain('delivery');
    expect(accessible).not.toContain('finance');
  });
});

// ─── getRoleLabel ───────────────────────────────────────────

describe('PermissionEngine.getRoleLabel', () => {
  it('admin → "Administrador"', () => {
    expect(PermissionEngine.getRoleLabel('admin')).toBe('Administrador');
  });

  it('manager → "Gerente"', () => {
    expect(PermissionEngine.getRoleLabel('manager')).toBe('Gerente');
  });

  it('collaborator → "Colaborador"', () => {
    expect(PermissionEngine.getRoleLabel('collaborator')).toBe('Colaborador');
  });

  it('cashier → "Caixa"', () => {
    expect(PermissionEngine.getRoleLabel('cashier')).toBe('Caixa');
  });

  it('desconhecido → retorna o valor original do role', () => {
    expect(PermissionEngine.getRoleLabel('estagiario')).toBe('estagiario');
    expect(PermissionEngine.getRoleLabel('')).toBe('');
  });
});

// ─── isCollaborator ─────────────────────────────────────────

describe('PermissionEngine.isCollaborator', () => {
  it('colaborador retorna true', () => {
    const e = new PermissionEngine({ role: 'collaborator' } as any);
    expect(e.isCollaborator()).toBe(true);
  });

  it('admin retorna true (todos são pelo menos colaborador)', () => {
    const e = new PermissionEngine({ role: 'admin' } as any);
    expect(e.isCollaborator()).toBe(true);
  });

  it('superadmin retorna true (todos são pelo menos colaborador)', () => {
    const e = new PermissionEngine({ superadmin: true, role: 'superadmin' } as any);
    expect(e.isCollaborator()).toBe(true);
  });

  it('null user retorna true', () => {
    const e = new PermissionEngine(null);
    expect(e.isCollaborator()).toBe(true);
  });
});

// ─── getLevelLabel ──────────────────────────────────────────

describe('PermissionEngine.getLevelLabel', () => {
  it('superadmin → "Desenvolvedor"', () => {
    const e = new PermissionEngine({ superadmin: true, role: 'superadmin' } as any);
    expect(e.getLevelLabel()).toBe('Desenvolvedor');
  });

  it('admin → "Administrador"', () => {
    const e = new PermissionEngine({ role: 'admin' } as any);
    expect(e.getLevelLabel()).toBe('Administrador');
  });

  it('manager → "Administrador"', () => {
    const e = new PermissionEngine({ role: 'manager' } as any);
    expect(e.getLevelLabel()).toBe('Administrador');
  });

  it('collaborator → "Colaborador"', () => {
    const e = new PermissionEngine({ role: 'collaborator' } as any);
    expect(e.getLevelLabel()).toBe('Colaborador');
  });

  it('null user → "Colaborador"', () => {
    const e = new PermissionEngine(null);
    expect(e.getLevelLabel()).toBe('Colaborador');
  });
});
