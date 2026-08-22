/**
 * Regressão de "blindagem": garante que colunas NÃO sejam dropadas em nenhum
 * dos 3 caminhos de sync (upsert / update*FromRemote / hydrateFromCloud).
 *
 * Estes testes cobrem os bugs encontrados na auditoria de 2026-08-22:
 *  - SALES: hidratação dropava tableId/customerSessionId/orderSource/kitchenStatus/org
 *  - FINANCIAL: updateFinancialFromRemote dropava recurrences/installments
 *  - STOCK_LOSS_LOG: update*FromRemote e hydrate dropavam productId/lotId/branch/org
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StorageService } from './storageService';

describe('storageService — consistência de mappers de sync (blindagem)', () => {
  let svc: StorageService;

  beforeEach(() => {
    localStorage.clear();
    svc = new StorageService();
  });

  it('mapSaleFromCloud mapeia tableId/customerSessionId/orderSource/kitchenStatus/organizationId', () => {
    const row = {
      id: 'sale-1',
      code: '001',
      created_at: '2026-01-01T00:00:00Z',
      user_id: 'u1',
      operator_name: 'João',
      customer_id: 'c1',
      customer_name: 'Cliente',
      store_branch_id: 'b1',
      table_id: 't1',
      customer_session_id: 'cs1',
      payments_json: null,
      payment_method: 'cash',
      order_source: 'mesa',
      kitchen_status: 'ready',
      status: 'completed',
      organization_id: 'o1',
      subtotal: 10,
      total: 10,
      discount: 0,
    };
    const mapped = (svc as any).mapSaleFromCloud(row, []);
    expect(mapped.tableId).toBe('t1');
    expect(mapped.customerSessionId).toBe('cs1');
    expect(mapped.orderSource).toBe('mesa');
    expect(mapped.kitchenStatus).toBe('ready');
    expect(mapped.organizationId).toBe('o1');
  });

  it('updateFinancialFromRemote preserva recurrences/installments (não dropa arrays)', () => {
    const setSpy = vi.spyOn(svc as any, 'set');
    const row = {
      id: 'acc-1',
      description: 'Aluguel',
      type: 'payable',
      amount: 100,
      due_date: '2026-02-01',
      status: 'pending',
      notes: 'landlord',
      store_branch_id: 'b1',
      organization_id: 'o1',
      is_recurring: true,
      recurrence_type: 'monthly',
      recurrence_count: 3,
      recurrence_parent_id: null,
      installment_number: null,
      recurrences_json: JSON.stringify([{ id: 'r1', dueDate: '2026-02-01', amount: 100, status: 'pending' }]),
      installments_json: JSON.stringify([{ id: 'i1', number: 1, amount: 100, status: 'pending' }]),
    };
    (svc as any).updateFinancialFromRemote(row);
    expect(setSpy).toHaveBeenCalled();
    const storedArg = setSpy.mock.calls.find((c: any[]) => c[0] === 'hd_system_financial_accounts')?.[1] as any[];
    const acc = storedArg?.find((a: any) => a.id === 'acc-1');
    expect(acc).toBeTruthy();
    expect(acc.recurrences).toEqual([{ id: 'r1', dueDate: '2026-02-01', amount: 100, status: 'pending' }]);
    expect(acc.installments).toEqual([{ id: 'i1', number: 1, amount: 100, status: 'pending' }]);
  });

  it('updateStockLossLogFromRemote preserva productId/lotId/storeBranchId/organizationId', () => {
    const setSpy = vi.spyOn(svc as any, 'set');
    const row = {
      id: 'sll-1',
      reason: 'expired',
      quantity: 2,
      product_id: 'p1',
      lot_id: 'l1',
      store_branch_id: 'b1',
      organization_id: 'o1',
      operator_name: 'Op',
      notes: 'n',
      created_at: '2026-01-01T00:00:00Z',
    };
    (svc as any).updateStockLossLogFromRemote(row);
    const storedArg = setSpy.mock.calls.find((c: any[]) => c[0] === 'hd_system_stock_loss_log')?.[1] as any[];
    const rec = storedArg?.find((a: any) => a.id === 'sll-1');
    expect(rec).toBeTruthy();
    expect(rec.productId).toBe('p1');
    expect(rec.lotId).toBe('l1');
    expect(rec.storeBranchId).toBe('b1');
    expect(rec.organizationId).toBe('o1');
  });

  // ─── REGRESSÃO: duplicata de venda na hidratação (BUG comanda/KDS) ───
  // Venda de comanda (cardápio/delivery) existe no cloud E localmente com o
  // MESMO id e numa sessão de cliente ativa. Antes do fix, a checagem de
  // sessão-ativa vinha ANTES da checagem de cloud → a venda local era
  // re-adicionada → 2 cartões no KDS (um "Entregue", outro "Fechamento
  // Solicitado"). O merge deve produzir APENAS 1 venda (versão do cloud).
  function seedActiveSession(id: string) {
    const org = (svc as any).getCurrentOrgId?.() || '';
    localStorage.setItem('hd_system_customer_sessions', JSON.stringify([{ id, status: 'active', organizationId: org }]));
  }

  it('mergeSalesForHydration não duplica venda do cloud que está em sessão ativa', () => {
    seedActiveSession('cs-active');
    const cloudSale = { id: 'sale-dup', code: '1', date: '2026-01-01T00:00:00Z', total: 10, kitchenStatus: 'closing_request', customerSessionId: 'cs-active', storeBranchId: 'b1' } as any;
    const localSale = { id: 'sale-dup', code: '1', date: '2026-01-01T00:00:00Z', total: 10, kitchenStatus: 'delivered', customerSessionId: 'cs-active', storeBranchId: 'b1' } as any;
    const result = (svc as any).mergeSalesForHydration([localSale], [cloudSale], [{ id: 'sale-dup' }], 'b1');
    const dups = result.filter((s: any) => s.id === 'sale-dup');
    expect(dups.length).toBe(1);
    // A versão do cloud vem primeiro e vence (fonte da verdade).
    expect(result.find((s: any) => s.id === 'sale-dup').kitchenStatus).toBe('closing_request');
  });

  it('mergeSalesForHydration preserva venda local-only de sessão ativa ausente no cloud', () => {
    seedActiveSession('cs-local');
    const localOnly = { id: 'local-1', code: '2', date: '2026-01-01T00:00:00Z', total: 5, kitchenStatus: 'pending', customerSessionId: 'cs-local', storeBranchId: 'b1' } as any;
    const result = (svc as any).mergeSalesForHydration([localOnly], [], [], 'b1');
    expect(result.find((s: any) => s.id === 'local-1')).toBeTruthy();
  });
});
