import { describe, expect, it } from 'vitest';
import { buildBillsSection, emptyBillsSection } from './reportService';

const range = { from: '2026-09-01T00:00', to: '2026-09-30T23:59', includeBills: true };

const paid = (over = {}) => ({
  id: 'b1', title: 'Energia', type: 'payable', category: 'conta_pagar',
  amount: 1100, dueDate: '2026-09-04', status: 'paid', paidDate: '2026-09-12',
  recipientOrPayer: 'Electro', paymentMethod: 'cash', includeInReport: true,
  ...over,
});

describe('buildBillsSection — contas no relatório (separado das vendas)', () => {
  it('soma pagas e recebidas por método no período', () => {
    const bills = buildBillsSection(
      [paid(), paid({ id: 'b2', title: 'Klebinho', type: 'receivable', category: 'conta_receber', amount: 130, paymentMethod: 'pix', paidDate: '2026-09-13' })],
      range,
    );
    expect(bills.paidTotal).toBe(1100);
    expect(bills.receivedTotal).toBe(130);
    expect(bills.paidByMethod).toEqual([{ method: 'cash', label: 'Dinheiro', count: 1, total: 1100 }]);
    expect(bills.receivedByMethod).toEqual([{ method: 'pix', label: 'PIX', count: 1, total: 130 }]);
    expect(bills.rows).toHaveLength(2);
  });

  it('exclui fiado (fluxo próprio), pendentes, fora do período e opt-out', () => {
    const bills = buildBillsSection(
      [
        paid({ id: 'f', category: 'fiado', title: 'Fiado X' }),
        paid({ id: 'p', status: 'pending', paidDate: undefined }),
        paid({ id: 'o', paidDate: '2026-08-01' }),
        paid({ id: 'n', includeInReport: false }),
      ],
      range,
    );
    expect(bills.rows).toHaveLength(0);
    expect(bills.paidTotal).toBe(0);
  });

  it('ocorrências contam individualmente (método/flag próprios)', () => {
    const bills = buildBillsSection(
      [{
        ...paid({ id: 'r', status: 'pending', paidDate: undefined }),
        isRecurring: true,
        recurrences: [
          { id: 'r-1', number: 1, dueDate: '2026-09-04', status: 'paid', paidDate: '2026-09-05', paymentMethod: 'pix', includeInReport: true },
          { id: 'r-2', number: 2, dueDate: '2026-10-04', status: 'pending' },
        ],
      }],
      range,
    );
    expect(bills.paidTotal).toBe(1100);
    expect(bills.rows).toHaveLength(1);
    expect(bills.rows[0].paymentMethod).toBe('pix');
  });

  it('includeBills false zera a seção', () => {
    expect(buildBillsSection([paid()], { ...range, includeBills: false })).toEqual(emptyBillsSection());
  });
});
