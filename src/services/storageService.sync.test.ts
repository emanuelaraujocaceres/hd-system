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

  // ─── REGRESSÃO: open_containers (garrafas abertas / doses) ───
  it('updateOpenContainerFromRemote mapeia linha do cloud (produto/quantidade/status/filiais)', () => {
    (svc as any).isRemoteFromCurrentBranch = () => true;
    const setSpy = vi.spyOn(svc as any, 'set');
    const row = {
      id: 'oc-1',
      organization_id: 'o1',
      store_branch_id: 'b1',
      product_id: 'p1',
      remaining_quantity: '12',
      opened_at: '2026-01-01T00:00:00Z',
      status: 'open',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    (svc as any).updateOpenContainerFromRemote(row);
    const storedArg = setSpy.mock.calls.find((c: any[]) => c[0] === 'hd_system_open_containers')?.[1] as any[];
    const rec = storedArg?.find((a: any) => a.id === 'oc-1');
    expect(rec).toBeTruthy();
    expect(rec.productId).toBe('p1');
    expect(rec.remainingQuantity).toBe(12); // string do cloud -> number
    expect(rec.status).toBe('open');
    expect(rec.storeBranchId).toBe('b1');
    expect(rec.organizationId).toBe('o1');
  });

  it('updateOpenContainerFromRemote ignora linha de outra filial (isolamento)', () => {
    (svc as any).isRemoteFromCurrentBranch = () => false;
    const setSpy = vi.spyOn(svc as any, 'set');
    const row = {
      id: 'oc-2',
      store_branch_id: 'b-other',
      product_id: 'p1',
      remaining_quantity: '5',
      status: 'open',
    };
    (svc as any).updateOpenContainerFromRemote(row);
    const storedArg = setSpy.mock.calls.find((c: any[]) => c[0] === 'hd_system_open_containers')?.[1] as any[];
    expect(storedArg).toBeUndefined();
  });

  it('deleteOpenContainerFromRemote remove item da filial atual (cenário feliz)', () => {
    // Branch atual = b1; item local da MESMA filial deve ser removido
    (svc as any).getRawBranchId = () => 'b1';
    localStorage.setItem('hd_system_open_containers', JSON.stringify([
      { id: 'oc-del-1', productId: 'p1', remainingQuantity: 3, storeBranchId: 'b1' },
    ]));
    const setSpy = vi.spyOn(svc as any, 'set');
    (svc as any).deleteOpenContainerFromRemote('oc-del-1');
    const storedArg = setSpy.mock.calls.find((c: any[]) => c[0] === 'hd_system_open_containers')?.[1] as any[];
    expect(storedArg?.find((a: any) => a.id === 'oc-del-1')).toBeUndefined();
  });

  it('deleteOpenContainerFromRemote NÃO remove item de outra filial (isolamento/BUG-025)', () => {
    // Branch atual = b1; item local de OUTRA filial não pode ser removido
    (svc as any).getRawBranchId = () => 'b1';
    localStorage.setItem('hd_system_open_containers', JSON.stringify([
      { id: 'oc-del-2', productId: 'p1', remainingQuantity: 3, storeBranchId: 'b-other' },
    ]));
    const setSpy = vi.spyOn(svc as any, 'set');
    (svc as any).deleteOpenContainerFromRemote('oc-del-2');
    const storedArg = setSpy.mock.calls.find((c: any[]) => c[0] === 'hd_system_open_containers')?.[1] as any[];
    expect(storedArg).toBeUndefined(); // set não deve ser chamado (delete bloqueado)
  });

  // ─── REGRESSÃO: product_recipes (receita de compostos) ───
  it('updateProductRecipeFromRemote mapeia linha do cloud (composite/ingredient/quantidade/filiais)', () => {
    (svc as any).isRemoteFromCurrentBranch = () => true;
    const setSpy = vi.spyOn(svc as any, 'set');
    const row = {
      id: 'rec-1',
      composite_product_id: 'p-comp',
      ingredient_product_id: 'p-ing',
      ingredient_name: 'Vodka',
      quantity: '0.25',
      unit: 'lit',
      store_branch_id: 'b1',
      organization_id: 'o1',
    };
    (svc as any).updateProductRecipeFromRemote(row);
    const storedArg = setSpy.mock.calls.find((c: any[]) => c[0] === 'hd_system_product_recipes')?.[1] as any[];
    const rec = storedArg?.find((a: any) => a.id === 'rec-1');
    expect(rec).toBeTruthy();
    expect(rec.compositeProductId).toBe('p-comp');
    expect(rec.ingredientProductId).toBe('p-ing');
    expect(rec.quantity).toBe(0.25); // string -> number
    expect(rec.unit).toBe('lit');
    expect(rec.storeBranchId).toBe('b1');
    expect(rec.organizationId).toBe('o1');
  });

  it('updateProductRecipeFromRemote ignora linha de outra filial (isolamento)', () => {
    (svc as any).isRemoteFromCurrentBranch = () => false;
    const setSpy = vi.spyOn(svc as any, 'set');
    const row = { id: 'rec-2', composite_product_id: 'c', ingredient_product_id: 'i', store_branch_id: 'b-other' };
    (svc as any).updateProductRecipeFromRemote(row);
    const storedArg = setSpy.mock.calls.find((c: any[]) => c[0] === 'hd_system_product_recipes')?.[1] as any[];
    expect(storedArg).toBeUndefined();
  });

  // ─── REGRESSÃO: vendas NÃO criam movimentação no frontend (RPC é a fonte) ───
  it('deductStockLocal decrementa estoque local mas NAO cria/sincroniza StockMovement', () => {
    const spyMov = vi.spyOn(svc as any, 'syncStockMovement');
    (svc as any).set('hd_system_products', [{ id: 'p-x', name: 'X', currentStock: 10, storeBranchId: 'b1', organizationId: 'o1' }]);
    (svc as any).deductStockLocal('p-x', -3, 'Venda PDV #1', 'op');
    const products = (svc as any).get('hd_system_products', []);
    const p = products.find((x: any) => x.id === 'p-x');
    expect(p.currentStock).toBe(7); // decrementou localmente
    expect(spyMov).not.toHaveBeenCalled(); // movimentação é do RPC, não do frontend
    const movements = (svc as any).get('hd_system_movements', []);
    expect(movements.find((m: any) => m.productId === 'p-x')).toBeUndefined();
  });

  // ─── FASE 3: compostos/frações não bloqueiam carrinho por estoque zerado ───
  describe('isCompositeOrFractionProduct (Fase 3)', () => {
    it('identifica composto e fração; nega produto comum e fragmentável em si', () => {
      (svc as any).set('hd_system_products', [
        { id: 'p-comp', name: 'Caipirinha', isComposite: true, currentStock: 0 },
        { id: 'p-bottle', name: 'Vodka 1L', is_fragmentable: true, fraction_product_id: 'p-dose', currentStock: 5 },
        { id: 'p-dose', name: 'Dose Vodka', currentStock: 0 },
        { id: 'p-normal', name: 'Refri', currentStock: 10 },
      ]);
      expect(svc.isCompositeOrFractionProduct('p-comp')).toBe(true);   // composto
      expect(svc.isCompositeOrFractionProduct('p-dose')).toBe(true);   // fração (referenciada)
      expect(svc.isCompositeOrFractionProduct('p-normal')).toBe(false); // comum
      expect(svc.isCompositeOrFractionProduct('p-bottle')).toBe(false); // fragmentável não é fração
    });

    it('não bloqueia adição ao carrinho por estoque zerado de composto/fração', () => {
      (svc as any).set('hd_system_products', [
        { id: 'p-comp', name: 'Caipirinha', isComposite: true, currentStock: 0 },
        { id: 'p-dose', name: 'Dose Vodka', currentStock: 0 },
        { id: 'p-bottle', name: 'Vodka 1L', is_fragmentable: true, fraction_product_id: 'p-dose', currentStock: 5 },
        { id: 'p-normal', name: 'Refri', currentStock: 10 },
      ]);
      // Mesma guarda usada em PDVView.handleAddToCart:
      //   blocked = realStock <= 0 && !isCompositeOrFraction
      const blocked = (realStock: number, isSpecial: boolean) => realStock <= 0 && !isSpecial;
      expect(blocked(0, svc.isCompositeOrFractionProduct('p-comp'))).toBe(false); // composto não bloqueia
      expect(blocked(0, svc.isCompositeOrFractionProduct('p-dose'))).toBe(false); // fração não bloqueia
      expect(blocked(0, svc.isCompositeOrFractionProduct('p-normal'))).toBe(true); // comum bloqueia
    });
  });

  // ─── REGRESSÃO: payment_terminals (maquininhas de pagamento) ───
  it('updatePaymentTerminalFromRemote mapeia linha do cloud (user/provider/config/padrão/filiais)', () => {
    (svc as any).isRemoteFromCurrentBranch = () => true;
    const setSpy = vi.spyOn(svc as any, 'set');
    const row = {
      id: 'pt-1',
      organization_id: 'o1',
      store_branch_id: 'b1',
      user_id: 'u1',
      provider: 'infinitepay',
      name: 'Maquininha A',
      config: { handle: 'dofulano' },
      is_default: true,
      enabled: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    (svc as any).updatePaymentTerminalFromRemote(row);
    const storedArg = setSpy.mock.calls.find((c: any[]) => c[0] === 'hd_system_payment_terminals')?.[1] as any[];
    const rec = storedArg?.find((a: any) => a.id === 'pt-1');
    expect(rec).toBeTruthy();
    expect(rec.userId).toBe('u1');
    expect(rec.provider).toBe('infinitepay');
    expect(rec.name).toBe('Maquininha A');
    expect(rec.config.handle).toBe('dofulano');
    expect(rec.isDefault).toBe(true);
    expect(rec.enabled).toBe(true);
    expect(rec.storeBranchId).toBe('b1');
    expect(rec.organizationId).toBe('o1');
  });

  it('updatePaymentTerminalFromRemote ignora linha de outra filial (isolamento)', () => {
    (svc as any).isRemoteFromCurrentBranch = () => false;
    const setSpy = vi.spyOn(svc as any, 'set');
    const row = { id: 'pt-2', user_id: 'u1', provider: 'infinitepay', name: 'X', store_branch_id: 'b-other' };
    (svc as any).updatePaymentTerminalFromRemote(row);
    const storedArg = setSpy.mock.calls.find((c: any[]) => c[0] === 'hd_system_payment_terminals')?.[1] as any[];
    expect(storedArg).toBeUndefined();
  });

  it('deletePaymentTerminalFromRemote remove terminal da filial atual (cenário feliz)', () => {
    (svc as any).getRawBranchId = () => 'b1';
    localStorage.setItem('hd_system_payment_terminals', JSON.stringify([
      { id: 'pt-del-1', name: 'A', storeBranchId: 'b1', provider: 'infinitepay' },
    ]));
    const setSpy = vi.spyOn(svc as any, 'set');
    (svc as any).deletePaymentTerminalFromRemote('pt-del-1');
    const storedArg = setSpy.mock.calls.find((c: any[]) => c[0] === 'hd_system_payment_terminals')?.[1] as any[];
    expect(storedArg?.find((a: any) => a.id === 'pt-del-1')).toBeUndefined();
  });

  it('deletePaymentTerminalFromRemote NÃO remove terminal de outra filial (isolamento)', () => {
    (svc as any).getRawBranchId = () => 'b1';
    localStorage.setItem('hd_system_payment_terminals', JSON.stringify([
      { id: 'pt-del-2', name: 'A', storeBranchId: 'b-other', provider: 'infinitepay' },
    ]));
    const setSpy = vi.spyOn(svc as any, 'set');
    (svc as any).deletePaymentTerminalFromRemote('pt-del-2');
    const storedArg = setSpy.mock.calls.find((c: any[]) => c[0] === 'hd_system_payment_terminals')?.[1] as any[];
    expect(storedArg).toBeUndefined(); // set não deve ser chamado (delete bloqueado)
  });
});
