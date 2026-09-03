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
});
