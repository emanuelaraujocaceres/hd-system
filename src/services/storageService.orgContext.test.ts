/**
 * Regressão das correções de contexto de organização do superadmin:
 *  - Opção 1: auto-seleção de org ativa no login (primeira da lista ou última usada).
 *  - Opção 2: bloqueio de gravações do superadmin enquanto nenhuma org estiver selecionada.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StorageService } from './storageService';

describe('storageService — contexto de organização do superadmin (Opção 1 e 2)', () => {
  let svc: StorageService;

  beforeEach(() => {
    localStorage.clear();
    svc = new StorageService();
    // Simula superadmin logado (organization_id = NULL, por design).
    localStorage.setItem(
      'hd_system_user_profile',
      JSON.stringify({ superadmin: true, email: 'admin@x.com', organizationId: '' }),
    );
  });

  describe('ensureSuperadminViewingOrg (Opção 1)', () => {
    it('auto-seleciona a primeira organização quando não há seleção nem histórico', () => {
      svc.ensureSuperadminViewingOrg([{ id: 'org-2' }, { id: 'org-1' }]);
      expect(svc.getSuperadminViewingOrg()).toBe('org-2');
    });

    it('prioriza a última organização utilizada quando ainda está na lista', () => {
      localStorage.setItem('hd_system_last_viewing_org', 'org-1');
      svc.ensureSuperadminViewingOrg([{ id: 'org-2' }, { id: 'org-1' }]);
      expect(svc.getSuperadminViewingOrg()).toBe('org-1');
    });

    it('cai na primeira quando a última utilizada não está mais na lista', () => {
      localStorage.setItem('hd_system_last_viewing_org', 'org-zzz');
      svc.ensureSuperadminViewingOrg([{ id: 'org-2' }, { id: 'org-1' }]);
      expect(svc.getSuperadminViewingOrg()).toBe('org-2');
    });

    it('NÃO sobrescreve uma seleção já existente', () => {
      svc.superadminSetViewingOrg('org-1');
      svc.ensureSuperadminViewingOrg([{ id: 'org-2' }]);
      expect(svc.getSuperadminViewingOrg()).toBe('org-1');
    });

    it('é no-op para não-superadmin', () => {
      localStorage.setItem(
        'hd_system_user_profile',
        JSON.stringify({ superadmin: false, email: 'u@x.com', organizationId: 'org-x' }),
      );
      svc.ensureSuperadminViewingOrg([{ id: 'org-2' }]);
      expect(svc.getSuperadminViewingOrg()).toBeNull();
    });
  });

  describe('bloqueio de gravação do superadmin (Opção 2)', () => {
    const sampleUser = {
      id: 'usr-1',
      email: 'usr1@x.com',
      name: 'U',
      role: 'admin' as const,
      organizationId: '',
      storeBranchId: '',
      permissions: { pdv: true, inventory: true, crm: true, finance: true, dashboard: true, settings: true },
      active: true,
    };

    it('saveUser sem org ativa LANÇA para superadmin', () => {
      expect(() => svc.saveUser({ ...sampleUser })).toThrow(/organiza[cç][aã]o/i);
      expect(svc.getSuperadminViewingOrg()).toBeNull();
    });

    it('saveUser COM org ativa NÃO lança para superadmin', () => {
      const spy = vi.spyOn(svc as any, 'syncSystemUser').mockImplementation(() => {});
      svc.superadminSetViewingOrg('org-1');
      expect(() => svc.saveUser({ ...sampleUser })).not.toThrow();
      spy.mockRestore();
    });

    it('saveUser NÃO lança para não-superadmin (mesmo sem org de viewing)', () => {
      localStorage.setItem(
        'hd_system_user_profile',
        JSON.stringify({ superadmin: false, email: 'u@x.com', organizationId: 'org-x' }),
      );
      const spy = vi.spyOn(svc as any, 'syncSystemUser').mockImplementation(() => {});
      expect(() => svc.saveUser({ ...sampleUser })).not.toThrow();
      spy.mockRestore();
    });
  });
});
