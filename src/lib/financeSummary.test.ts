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

  it('filtra por dateRange explícito (data+hora) em vez de period', () => {
    // Vendas em horários diferentes do mesmo dia
    const v1 = sale('2026-09-02T10:00:00', 'pix', 15);       // 10h — dentro
    const v2 = sale('2026-09-02T14:30:00', 'cash', 25);      // 14h30 — dentro
    const v3 = sale('2026-09-02T09:59:00', 'credit_card', 30); // 9h59 — FORA (antes do from 10:00)
    const v4 = sale('2026-09-02T18:01:00', 'pix', 10);       // 18h01 — FORA (depois do to 18:00)
    const summary = calculateFinanceSummary(
      [v1, v2, v3, v4], [product], branchId, undefined, undefined,
      { from: '2026-09-02T10:00', to: '2026-09-02T18:00' },
    );
    expect(summary.salesCount).toBe(2);
    expect(summary.total).toBe(40);
    expect(summary.pix).toBe(15);
    expect(summary.cash).toBe(25);
  });

  it('dateRange com from vazio => sem piso (aceita vendas antigas)', () => {
    const v1 = sale('2026-09-01T08:00:00', 'pix', 50);
    const summary = calculateFinanceSummary(
      [v1], [product], branchId, undefined, undefined,
      { from: '', to: '2026-09-02T23:59' },
    );
    expect(summary.salesCount).toBe(1);
    expect(summary.total).toBe(50);
  });

  it('dateRange com to vazio => sem teto (aceita vendas futuras)', () => {
    const v1 = sale('2026-09-10T10:00:00', 'pix', 50);
    const summary = calculateFinanceSummary(
      [v1], [product], branchId, undefined, undefined,
      { from: '2026-09-01T00:00', to: '' },
    );
    expect(summary.salesCount).toBe(1);
    expect(summary.total).toBe(50);
  });
});
