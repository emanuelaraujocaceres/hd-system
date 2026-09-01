/**
 * Regressão das correções de contexto de organização do superadmin:
 *  - Opção 1: auto-seleção de org ativa no login (primeira da lista ou última usada).
 *  - Opção 2: bloqueio de gravações do superadmin enquanto nenhuma org estiver selecionada.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StorageService } from './storageService';
import { syncService } from './syncService';

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

  describe('syncSystemUser — superadmin sem filial (regressão Meu Perfil)', () => {
    it('superadmin SEM filial selecionada AINDA sincroniza perfil (chama upsertRow, não baila)', () => {
      svc.superadminSetViewingOrg('org-1'); // org ativa, porém sem branch
      const spy = vi.spyOn(syncService, 'upsertRow').mockResolvedValue(undefined as any);
      (svc as any).syncSystemUser({
        id: 'usr-sa', name: 'SA', email: 'sa@x.com', role: 'admin',
        organizationId: '', storeBranchId: '', permissions: {}, active: true, superadmin: true,
      });
      expect(spy).toHaveBeenCalledWith('system_users', expect.objectContaining({ id: 'usr-sa', store_branch_id: null }));
      spy.mockRestore();
    });

    it('não-superadmin SEM filial NÃO sincroniza (mantém bloqueio anterior)', () => {
      const spy = vi.spyOn(syncService, 'upsertRow').mockResolvedValue(undefined as any);
      (svc as any).syncSystemUser({
        id: 'usr-1', name: 'U', email: 'u@x.com', role: 'admin',
        organizationId: 'org-x', storeBranchId: '', permissions: {}, active: true, superadmin: false,
      });
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe('getSelectedBranchId — fallback de filial do superadmin (Problema 1)', () => {
    const branchA = { id: 'br-org1-a', name: 'Filial A', code: 'A-01', organizationId: 'org-1', city: 'SP', state: 'SP', cnpj: '', phone: '', active: true, isHeadquarters: true };
    const branchB = { id: 'br-org1-b', name: 'Filial B', code: 'B-01', organizationId: 'org-1', city: 'SP', state: 'SP', cnpj: '', phone: '', active: true, isHeadquarters: false };

    const seedBranches = (branches: typeof branchA[]) => {
      localStorage.setItem('hd_system_branches', JSON.stringify(branches));
    };

    const seedProduct = (id: string, storeBranchId: string) => {
      const existing = JSON.parse(localStorage.getItem('hd_system_products') || '[]');
      existing.push({
        id, name: `Produto ${id}`, category: 'Geral', unit: 'un', costPrice: 5, salePrice: 10,
        currentStock: 1, minStock: 5, maxStock: 100, barcode: '', active: true,
        updatedAt: new Date().toISOString(), storeBranchId, organizationId: 'org-1',
      });
      localStorage.setItem('hd_system_products', JSON.stringify(existing));
    };

    it('superadmin com org em foco e SEM filial salva → resolve para a primeira filial da org (leitura)', () => {
      svc.superadminSetViewingOrg('org-1'); // branches ainda não hidratadas -> setter não persiste filial
      seedBranches([branchA, branchB]);     // hidratação chega depois
      seedProduct('p-a', 'br-org1-a');
      seedProduct('p-b', 'br-org1-b');
      expect(svc.getSelectedBranchId()).toBe('br-org1-a');
      // Item da segunda filial da MESMA org NÃO vaza (isolamento intra-org)
      expect(svc.getProducts().map((p) => p.id)).toEqual(['p-a']);
    });

    it('superadmin com org em foco e filial salva de OUTRA org → primeira filial da org em foco', () => {
      svc.superadminSetViewingOrg('org-1');
      seedBranches([branchA, branchB]);
      localStorage.setItem('hd_system_selected_branch_id', 'br-org2-a'); // valor legado de outra org
      expect(svc.getSelectedBranchId()).toBe('br-org1-a');
    });

    it('superadmin GLOBAL (sem org em foco) → comportamento inalterado (vê tudo)', () => {
      seedBranches([branchA, branchB]);
      seedProduct('p-a', 'br-org1-a');
      seedProduct('p-b', 'br-org1-b');
      expect(svc.getSuperadminViewingOrg()).toBeNull();
      expect(svc.getSelectedBranchId()).toBe(''); // sem filial salva e sem org em foco
      expect(svc.getProducts().map((p) => p.id)).toEqual(['p-a', 'p-b']);
    });

    it('não-superadmin com branch vazia → continua retornando [] (inalterado)', () => {
      localStorage.setItem(
        'hd_system_user_profile',
        JSON.stringify({ superadmin: false, email: 'u@x.com', organizationId: 'org-1' }),
      );
      seedBranches([branchA, branchB]);
      seedProduct('p-a', 'br-org1-a');
      seedProduct('p-b', 'br-org1-b');
      expect(svc.getSelectedBranchId()).toBe('');
      expect(svc.getProducts()).toEqual([]);
    });

    it('saveProduct de superadmin com org em foco (sem filial) → NÃO lança e grava na primeira filial da org', () => {
      svc.superadminSetViewingOrg('org-1');
      seedBranches([branchA, branchB]); // hidratação chega sem persistir filial
      const spy = vi.spyOn(syncService, 'upsertRow').mockResolvedValue(undefined as any);
      expect(() =>
        svc.saveProduct({
          id: 'p-novo', name: 'Produto Novo', category: 'Geral', unit: 'un',
          costPrice: 5, salePrice: 10, currentStock: 1, minStock: 5, maxStock: 100,
          barcode: '', active: true, updatedAt: new Date().toISOString(),
        } as any),
      ).not.toThrow();
      expect(svc.getProducts()[0].storeBranchId).toBe('br-org1-a');
      spy.mockRestore();
    });

    it('janela de boot: branches vazias + UUID salvo válido → confia no UUID salvo (inalterado)', () => {
      const uuid = '11111111-1111-4111-8111-111111111111';
      localStorage.setItem('hd_system_selected_branch_id', uuid);
      expect(svc.getSelectedBranchId()).toBe(uuid);
    });

    it('superadminSetViewingOrg reconcilia a filial salva quando as branches da org estão hidratadas', () => {
      seedBranches([branchA, branchB]);
      // filial de outra org -> persiste a primeira filial da org em foco
      localStorage.setItem('hd_system_selected_branch_id', 'br-org2-a');
      svc.superadminSetViewingOrg('org-1');
      expect(localStorage.getItem('hd_system_selected_branch_id')).toBe('br-org1-a');
      // filial JÁ da org em foco -> não altera
      localStorage.setItem('hd_system_selected_branch_id', 'br-org1-b');
      svc.superadminSetViewingOrg('org-1');
      expect(localStorage.getItem('hd_system_selected_branch_id')).toBe('br-org1-b');
    });

    it('superadminSetViewingOrg com branches ainda vazias (boot) → NÃO zera a filial salva', () => {
      const uuid = '11111111-1111-4111-8111-111111111111';
      localStorage.setItem('hd_system_selected_branch_id', uuid);
      svc.superadminSetViewingOrg('org-1'); // sem branches hidratadas -> guard preserva o UUID
      expect(localStorage.getItem('hd_system_selected_branch_id')).toBe(uuid);
    });
  });
});
