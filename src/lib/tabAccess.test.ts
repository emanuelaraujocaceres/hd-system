/**
 * Regressão do BUG-034: admin/manager bloqueados em Financeiro/Dashboard/
 * Configurações/Usuários/Filiais pelo guard de página (hasAccessToTab), embora
 * a Sidebar os mostrasse. A fonte única de verdade é src/lib/tabAccess.ts.
 */
import { describe, it, expect } from 'vitest';
import { canAccessTab } from './tabAccess';
import type { UserProfile } from '../types';

const base = (over: Partial<UserProfile>): UserProfile => ({
  id: 'u1',
  name: 'Test',
  email: 't@t.co',
  role: 'collaborator',
  organizationId: 'org',
  storeBranchId: 'br',
  permissions: {
    pdv: true, inventory: true, crm: true,
    finance: false, dashboard: false, settings: false,
  },
  active: true,
  ...over,
});

const allVisible = {
  modulePdv: true, moduleDashboard: true, moduleInventory: true, moduleFinance: true,
  moduleCrm: true, moduleFiado: true, moduleComanda: true, moduleKds: true,
  moduleDelivery: true, moduleCardapioPreview: true, moduleTvShowcase: true, moduleTvConnect: true,
};

describe('canAccessTab — admin/manager (BUG-034)', () => {
  it('admin com permissions nulo TEM acesso total (ignora user.permissions)', () => {
    const admin = base({ role: 'admin', permissions: null as any });
    for (const tab of ['finance', 'dashboard', 'settings', 'users', 'branches', 'crm', 'comanda', 'kds']) {
      expect(canAccessTab(admin, allVisible, tab)).toBe(true);
    }
  });

  it('manager também tem acesso total', () => {
    const mgr = base({ role: 'manager', permissions: null as any });
    expect(canAccessTab(mgr, allVisible, 'finance')).toBe(true);
    expect(canAccessTab(mgr, allVisible, 'settings')).toBe(true);
  });

  it('admin respeita module_visibility desligado (mesmo tendo role admin)', () => {
    const admin = base({ role: 'admin', permissions: null as any });
    const visibility = { ...allVisible, moduleFinance: false };
    expect(canAccessTab(admin, visibility, 'finance')).toBe(false);
    // demais módulos continuam acessíveis
    expect(canAccessTab(admin, visibility, 'dashboard')).toBe(true);
  });

  it('admin NUNCA acessa organizations (superadmin only)', () => {
    const admin = base({ role: 'admin' });
    expect(canAccessTab(admin, allVisible, 'organizations')).toBe(false);
  });
});

describe('canAccessTab — superadmin', () => {
  it('superadmin acessa tudo, inclusive organizations', () => {
    const sa = base({ superadmin: true });
    expect(canAccessTab(sa, allVisible, 'organizations')).toBe(true);
    expect(canAccessTab(sa, { moduleFinance: false }, 'finance')).toBe(true);
  });
});

describe('canAccessTab — colaborador (sem regressão)', () => {
  it('colaborador com permissions nulo segue default restrito', () => {
    const collab = base({ role: 'collaborator', permissions: null as any });
    expect(canAccessTab(collab, allVisible, 'pdv')).toBe(true);
    expect(canAccessTab(collab, allVisible, 'inventory')).toBe(true);
    expect(canAccessTab(collab, allVisible, 'crm')).toBe(true);
    expect(canAccessTab(collab, allVisible, 'comanda')).toBe(true);
    expect(canAccessTab(collab, allVisible, 'kds')).toBe(true);
    // bloqueados por default
    expect(canAccessTab(collab, allVisible, 'finance')).toBe(false);
    expect(canAccessTab(collab, allVisible, 'dashboard')).toBe(false);
    expect(canAccessTab(collab, allVisible, 'settings')).toBe(false);
    expect(canAccessTab(collab, allVisible, 'users')).toBe(false);
    expect(canAccessTab(collab, allVisible, 'branches')).toBe(false);
  });

  it('colaborador respeita module_visibility desligado', () => {
    const collab = base({ role: 'collaborator' });
    const visibility = { ...allVisible, moduleComanda: false };
    expect(canAccessTab(collab, visibility, 'comanda')).toBe(false);
    expect(canAccessTab(collab, visibility, 'kds')).toBe(true);
  });

  it('colaborador pode receber módulos via allowlist explícita', () => {
    const collab = base({ role: 'collaborator', permissions: { pdv: true, finance: true } as any });
    expect(canAccessTab(collab, allVisible, 'finance')).toBe(true);
  });

  it('regra B: colaborador com permissions.settings=true NÃO acessa Configurações', () => {
    const collab = base({ role: 'collaborator', permissions: { pdv: true, settings: true } as any });
    // Configurações é SOMENTE admin/manager/superadmin — user.permissions é ignorado
    expect(canAccessTab(collab, allVisible, 'settings')).toBe(false);
    // demais módulos concedidos continuam funcionando
    expect(canAccessTab(collab, allVisible, 'pdv')).toBe(true);
  });
});

describe('canAccessTab — usuário nulo', () => {
  it('retorna false quando não há usuário', () => {
    expect(canAccessTab(null, allVisible, 'pdv')).toBe(false);
  });
});
