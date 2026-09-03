import { describe, expect, it } from 'vitest';
import { calculateFinanceSummary } from './financeSummary';

const branchId = 'branch-1';
const product = { id: 'product-1', costPrice: 4 } as any;
const sale = (date: string, method: string, amount: number) => ({
  id: date, date, status: 'completed', storeBranchId: branchId, total: amount,
  payments: [{ method, amount }], items: [{ productId: 'product-1', unitPrice: amount, quantity: 1, total: amount }],
}) as any;

describe('calculateFinanceSummary', () => {
  it('separa pagamentos e calcula custo/lucro para o período escolhido', () => {
    const summary = calculateFinanceSummary([
      sale('2026-09-02T12:00:00', 'pix', 10),
      sale('2026-09-02T13:00:00', 'debit_card', 20),
      sale('2026-09-01T12:00:00', 'cash', 99),
    ], [product], branchId, 'day', new Date('2026-09-02T15:00:00'));
    expect(summary).toMatchObject({ salesCount: 2, total: 30, pix: 10, debitCard: 20, cash: 0, costOfGoodsSold: 8, productProfit: 22 });
  });

  it('ignora vendas canceladas, de outra filial e fora do período', () => {
    const ignored = { ...sale('2026-09-02T12:00:00', 'cash', 10), status: 'cancelled' };
    const otherBranch = { ...sale('2026-09-02T12:00:00', 'cash', 10), storeBranchId: 'branch-2' };
    const summary = calculateFinanceSummary([ignored, otherBranch], [product], branchId, 'day', new Date('2026-09-02T15:00:00'));
    expect(summary.total).toBe(0);
    expect(summary.salesCount).toBe(0);
  });

  it('detalha byProduct com lucro negativo quando custo > preço de venda', () => {
    // Produto vendido a R$ 10 mas com custo cadastrado de R$ 14 → prejuízo por unidade.
    const vendaCara = {
      id: 'v1', date: '2026-09-02T10:00:00', status: 'completed', storeBranchId: branchId, total: 10,
      payments: [{ method: 'cash', amount: 10 }],
      items: [{ productId: 'p-caro', productName: 'Produto Caro', unitPrice: 10, quantity: 1, total: 10 }],
    } as any;
    const vendaBoa = {
      id: 'v2', date: '2026-09-02T11:00:00', status: 'completed', storeBranchId: branchId, total: 20,
      payments: [{ method: 'cash', amount: 20 }],
      items: [{ productId: 'p-bom', productName: 'Produto Bom', unitPrice: 20, quantity: 1, total: 20 }],
    } as any;
    const summary = calculateFinanceSummary(
      [vendaCara, vendaBoa],
      [{ id: 'p-caro', costPrice: 14 } as any, { id: 'p-bom', costPrice: 4 } as any],
      branchId, 'day', new Date('2026-09-02T15:00:00'),
    );
    const linhaCara = summary.byProduct.find((l) => l.productId === 'p-caro');
    const linhaBoa = summary.byProduct.find((l) => l.productId === 'p-bom');
    expect(linhaCara).toMatchObject({ cost: 14, revenue: 10, profit: -4 });
    expect(linhaBoa).toMatchObject({ cost: 4, revenue: 20, profit: 16 });
    // Ordenação: maior prejuízo (mais negativo) primeiro.
    expect(summary.byProduct[0].productId).toBe('p-caro');
    expect(summary.productProfit).toBe(12); // (10+20) - (14+4)
  });
});
