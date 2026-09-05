/**
 * comandaService — regressão do fluxo do OPERADOR na comanda.
 *
 * Blindagem da regra (2026-09-05): item adicionado pelo operador usa
 * orderSource='comanda' (NÃO 'cardapio_digital') para não vazar para o
 * KDS/Pedidos (que só mostra 'cardapio_digital'/'delivery').
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { adicionarItem, buscarItens, getTotalComanda, removerItem, ItemComanda } from './comandaService';
import { CustomerSession, Product, Sale } from '../types';

const { storageServiceMock, supabaseMock } = vi.hoisted(() => ({
  storageServiceMock: {
    getSales: vi.fn(),
    addSale: vi.fn(),
    cancelSaleWithStockRestore: vi.fn(),
    getSelectedBranchId: vi.fn(() => 'branch-1'),
    getCustomerSessions: vi.fn(),
    saveCustomerSession: vi.fn(),
  },
  supabaseMock: { rpc: vi.fn() },
}));

vi.mock('./storageService', () => ({ storageService: storageServiceMock }));
vi.mock('../lib/supabase', () => ({ supabase: supabaseMock }));

const mkProduct = (overrides: Partial<Product> = {}): Product =>
  ({
    id: 'p1',
    name: 'Cerveja',
    salePrice: 8.5,
    costPrice: 4,
    stockQuantity: 10,
    categoryId: 'c1',
    storeBranchId: 'b1',
    organizationId: 'o1',
    ...overrides,
  } as Product);

const mkSession = (overrides: Partial<CustomerSession> = {}): CustomerSession =>
  ({
    id: 'cs1',
    tableId: 't1',
    customerName: 'Mesa 1',
    status: 'active',
    storeBranchId: 'b1',
    organizationId: 'o1',
    openedAt: new Date().toISOString(),
    ...overrides,
  } as CustomerSession);

const mkPendingSale = (id: string, sessionId: string, items: any[], productId: string): Sale =>
  ({
    id,
    customerSessionId: sessionId,
    tableId: 't1',
    status: 'pending',
    orderSource: 'comanda',
    kitchenStatus: 'pending',
    items,
    total: items.reduce((a: number, i: any) => a + (i.total || 0), 0),
    date: '2026-09-05T10:00:00Z',
  } as Sale);

describe('adicionarItem — fluxo do operador', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cria venda pending com orderSource="comanda" (não vai pro KDS) e baixa via addSale', async () => {
    storageServiceMock.addSale.mockResolvedValue({ success: true });

    const res = await adicionarItem({ product: mkProduct(), quantity: 2, session: mkSession(), operatorName: 'Juninho', operatorId: 'op-1' });

    expect(res.success).toBe(true);
    expect(storageServiceMock.addSale).toHaveBeenCalledTimes(1);
    const sale = storageServiceMock.addSale.mock.calls[0][0] as Sale;
    expect(sale.orderSource).toBe('comanda');
    expect(sale.orderSource).not.toBe('cardapio_digital'); // sai do KDS/Pedidos e do celular do cliente
    expect(sale.customerSessionId).toBe('cs1');
    expect(sale.status).toBe('pending');
    expect(sale.kitchenStatus).toBe('pending');
    expect(sale.total).toBe(17);
    expect(sale.items[0].productId).toBe('p1');
    expect(sale.items[0].quantity).toBe(2);
  });

  it('recusa quantidade inválida sem chamar addSale', async () => {
    const res = await adicionarItem({ product: mkProduct(), quantity: 0, session: mkSession(), operatorName: 'Juninho', operatorId: 'op-1' });
    expect(res.success).toBe(false);
    expect(storageServiceMock.addSale).not.toHaveBeenCalled();
  });

  it('recusa produto sem id sem chamar addSale', async () => {
    const res = await adicionarItem({ product: mkProduct({ id: '' }), quantity: 1, session: mkSession(), operatorName: 'Juninho', operatorId: 'op-1' });
    expect(res.success).toBe(false);
    expect(storageServiceMock.addSale).not.toHaveBeenCalled();
  });
});

describe('buscarItens / getTotalComanda', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('consolida somente vendas pending da sessão', () => {
    const sale1 = mkPendingSale('s1', 'cs1', [{ productId: 'p1', productName: 'Cerveja', unitPrice: 8.5, quantity: 2, total: 17 }], 'p1');
    const sale2 = mkPendingSale('s2', 'cs1', [{ productId: 'p2', productName: 'Petisco', unitPrice: 5, quantity: 1, total: 5 }], 'p2');
    const completed = { ...mkPendingSale('s3', 'cs1', [{ productId: 'p9', productName: 'X', unitPrice: 1, quantity: 1, total: 1 }], 'p9'), status: 'completed' };
    const otherSession = mkPendingSale('s4', 'cs-999', [{ productId: 'p7', productName: 'Y', unitPrice: 1, quantity: 1, total: 1 }], 'p7');
    storageServiceMock.getSales.mockReturnValue([sale1, sale2, completed, otherSession]);

    const items: ItemComanda[] = buscarItens('cs1');
    expect(items).toHaveLength(2);
    expect(items[0].productId).toBe('p1');
    expect(items[1].productId).toBe('p2');
    expect(getTotalComanda('cs1')).toBe(22);
  });

  it('retorna total 0 quando a sessão não tem vendas pending', () => {
    storageServiceMock.getSales.mockReturnValue([]);
    expect(getTotalComanda('cs1')).toBe(0);
    expect(buscarItens('cs1')).toHaveLength(0);
  });
});

describe('removerItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageServiceMock.cancelSaleWithStockRestore.mockResolvedValue({ success: true });
  });

  it('restaura estoque via cancelSaleWithStockRestore para venda válida', async () => {
    const res = await removerItem('s1');
    expect(res.success).toBe(true);
    expect(storageServiceMock.cancelSaleWithStockRestore).toHaveBeenCalledWith('s1');
  });

  it('recusa saleId vazio sem tocar no estoque', async () => {
    const res = await removerItem('');
    expect(res.success).toBe(false);
    expect(storageServiceMock.cancelSaleWithStockRestore).not.toHaveBeenCalled();
  });
});