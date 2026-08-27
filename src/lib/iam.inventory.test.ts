import { describe, it, expect } from 'vitest';
import { PermissionEngine } from './iam';
import { UserProfile } from '../types';

const base = (over: Record<string, unknown> = {}): UserProfile =>
  ({
    id: 'x',
    name: 'x',
    email: 'x@x.com',
    role: 'collaborator',
    organizationId: 'org1',
    storeBranchId: 'b1',
    ...over,
  } as UserProfile);

describe('PermissionEngine — inventário (gate de colaborador)', () => {
  it('colaborador com inventory:true PODE cadastrar/editar produtos', () => {
    const eng = new PermissionEngine(
      base({
        permissions: {
          pdv: true,
          inventory: true,
          crm: true,
          finance: false,
          dashboard: false,
          settings: false,
          comanda: false,
          kds: false,
          delivery: false,
          cardapioDigital: false,
        },
      }),
    );
    expect(eng.hasPermission('inventory', 'create')).toBe(true);
  });

  it('colaborador com inventory:false NÃO pode cadastrar produtos', () => {
    const eng = new PermissionEngine(base({ permissions: { pdv: true, inventory: false, crm: true } }));
    expect(eng.hasPermission('inventory', 'create')).toBe(false);
  });

  it('admin sempre pode cadastrar produtos no inventário', () => {
    const eng = new PermissionEngine(base({ role: 'admin' }));
    expect(eng.hasPermission('inventory', 'create')).toBe(true);
  });

  it('superadmin sempre pode cadastrar produtos no inventário', () => {
    const eng = new PermissionEngine(base({ superadmin: true, role: 'admin' }));
    expect(eng.hasPermission('inventory', 'create')).toBe(true);
  });
});
