import { describe, it, expect } from 'vitest';
import { canManageUser } from './userManagement';

type Viewer = {
  superadmin?: boolean;
  role?: 'admin' | 'collaborator' | 'manager';
  organizationId?: string;
  storeBranchId?: string;
};

type Target = {
  role?: 'admin' | 'collaborator' | 'manager';
  organizationId?: string;
  storeBranchId?: string;
};

const viewer = (over: Viewer = {}): Viewer => ({
  role: 'admin',
  organizationId: 'org1',
  storeBranchId: 'b1',
  ...over,
});

const target = (over: Target = {}): Target => ({
  role: 'collaborator',
  organizationId: 'org1',
  storeBranchId: 'b1',
  ...over,
});

describe('canManageUser', () => {
  it('superadmin gerencia qualquer usuário (inclusive admin de outra org/filial)', () => {
    const sup = viewer({ superadmin: true, role: 'admin', organizationId: 'orgA', storeBranchId: 'bB' });
    const other = target({ role: 'admin', organizationId: 'orgB', storeBranchId: 'b2' });
    expect(canManageUser(sup, other, 'bX')).toBe(true);
  });

  it('admin gerencia colaborador da própria filial', () => {
    expect(canManageUser(viewer(), target(), 'b1')).toBe(true);
  });

  it('manager também gerencia colaborador da própria filial', () => {
    expect(canManageUser(viewer({ role: 'manager' }), target(), 'b1')).toBe(true);
  });

  it('admin NÃO gerencia colaborador de outra filial', () => {
    expect(canManageUser(viewer(), target({ storeBranchId: 'b2' }), 'b1')).toBe(false);
  });

  it('admin NÃO gerencia colaborador de outra organização', () => {
    expect(canManageUser(viewer(), target({ organizationId: 'org2' }), 'b1')).toBe(false);
  });

  it('admin NÃO gerencia outro administrador', () => {
    expect(canManageUser(viewer(), target({ role: 'admin' }), 'b1')).toBe(false);
  });

  it('admin NÃO gerencia superadmin (role != colaborador)', () => {
    expect(canManageUser(viewer(), target({ role: 'admin', organizationId: 'org1', storeBranchId: 'b1' }), 'b1')).toBe(false);
  });

  it('colaborador não gerencia ninguém', () => {
    expect(canManageUser(viewer({ role: 'collaborator' }), target(), 'b1')).toBe(false);
  });
});
