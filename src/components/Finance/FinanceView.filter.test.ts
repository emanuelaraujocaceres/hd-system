import { describe, expect, it } from 'vitest';
import { filterFinanceAccounts, buildAccountSettlement, settleOccurrence } from './FinanceView';
import { FinancialAccount } from '../../types';

const acc = (over: Partial<FinancialAccount>): FinancialAccount =>
  ({
    id: 'a1',
    title: 'Conta',
    type: 'payable',
    amount: 100,
    dueDate: '2026-09-12',
    status: 'pending',
    recipientOrPayer: 'Fornecedor',
    ...over,
  } as FinancialAccount);

const range = { dateFrom: '2026-09-01T00:00', dateTo: '2026-09-30T23:59' };

describe('filterFinanceAccounts — lista Contas Pagar/Receber', () => {
  it('exibe recebível avulso (regressão Klebinho R$130 invisível)', () => {
    const klebinho = acc({ id: 'k1', title: 'Cliente Klebinho', type: 'receivable', category: 'conta_receber', amount: 130, dueDate: '2026-09-20' });
    expect(filterFinanceAccounts([klebinho], { ...range, filterType: 'all' })).toHaveLength(1);
    expect(filterFinanceAccounts([klebinho], { ...range, filterType: 'receivable' })).toHaveLength(1);
    expect(filterFinanceAccounts([klebinho], { ...range, filterType: 'payable' })).toHaveLength(0);
  });

  it('fiado e pagamento de fiado NUNCA aparecem (são do Fiados)', () => {
    const fiado = acc({ id: 'f1', type: 'receivable', category: 'fiado' });
    const pago = acc({ id: 'f2', type: 'receivable', category: 'fiado_payment', status: 'paid' });
    expect(filterFinanceAccounts([fiado, pago], { ...range, filterType: 'all' })).toHaveLength(0);
    expect(filterFinanceAccounts([fiado, pago], { ...range, filterType: 'receivable' })).toHaveLength(0);
  });

  it('respeita vencimento fora do período e busca sem match', () => {
    const fora = acc({ id: 'x', dueDate: '2026-10-05' });
    expect(filterFinanceAccounts([fora], range)).toHaveLength(0);
    const dentro = acc({ id: 'y', title: 'Ambev', dueDate: '2026-09-12' });
    expect(filterFinanceAccounts([dentro], { ...range, searchTerm: 'xyz' })).toHaveLength(0);
    expect(filterFinanceAccounts([dentro], { ...range, searchTerm: 'ambev' })).toHaveLength(1);
  });

  it('ignoreDateRange: avulsa aparece independente do Período do topo', () => {
    const klebinho = acc({ id: 'k1', title: 'Cliente Klebinho', type: 'receivable', category: 'conta_receber', amount: 130, dueDate: '2026-09-20' });
    const tight = { dateFrom: '2026-09-12T00:00', dateTo: '2026-09-12T23:59' };
    expect(filterFinanceAccounts([klebinho], { ...tight, filterType: 'all' })).toHaveLength(0);
    expect(filterFinanceAccounts([klebinho], { ...tight, filterType: 'all', ignoreDateRange: true })).toHaveLength(1);
  });
});

describe('buildAccountSettlement — baixa via checkout (sem caixa)', () => {
  const rec = (over = {}) =>
    ({
      id: 'k1', title: 'Cliente Klebinho', type: 'receivable', category: 'conta_receber',
      amount: 130, dueDate: '2026-09-20', status: 'pending', recipientOrPayer: 'Cliente',
      ...over,
    } as FinancialAccount);

  it('recebível em dinheiro: paid + método + flag, sem mexer no caixa', () => {
    const { updated, primaryMethod } = buildAccountSettlement(rec(), [{ method: 'cash', amount: 130 }], true);
    expect(updated.status).toBe('paid');
    expect(updated.paidDate).toBeTruthy();
    expect(updated.paymentMethod).toBe('cash');
    expect(updated.includeInReport).toBe(true);
    expect(primaryMethod).toBe('cash');
    expect(updated).not.toHaveProperty('cashIn');
  });

  it('a pagar dividido: quita, método = maior parte, flag respeitada', () => {
    const { updated, primaryMethod } = buildAccountSettlement(
      rec({ type: 'payable' }),
      [{ method: 'cash', amount: 30 }, { method: 'pix', amount: 100 }],
      false,
    );
    expect(updated.status).toBe('paid');
    expect(updated.paymentMethod).toBe('pix');
    expect(updated.includeInReport).toBe(false);
    expect(primaryMethod).toBe('pix');
  });

  it('sem partes válidas: quita sem método', () => {
    const { updated } = buildAccountSettlement(rec(), []);
    expect(updated.status).toBe('paid');
    expect(updated.paymentMethod).toBeUndefined();
  });
});

describe('settleOccurrence — baixa de ocorrência/parcela via checkout', () => {
  const acc = {
    id: 'r1', title: 'Energia', type: 'payable', category: 'conta_pagar',
    amount: 1100, dueDate: '2026-09-04', status: 'pending', recipientOrPayer: 'Electro',
    isRecurring: true, recurrenceType: 'monthly', recurrenceCount: 2,
    recurrences: [
      { id: 'r1-r1', number: 1, dueDate: '2026-09-04', status: 'pending' },
      { id: 'r1-r2', number: 2, dueDate: '2026-10-04', status: 'pending' },
    ],
  } as FinancialAccount;

  it('quita só a ocorrência (conta segue pendente) com método e flag', () => {
    const updated = settleOccurrence(acc, 'r1-r1', 'recurrence', [{ method: 'pix', amount: 1100 }], true)!;
    expect(updated.recurrences![0].status).toBe('paid');
    expect(updated.recurrences![0].paymentMethod).toBe('pix');
    expect(updated.recurrences![0].includeInReport).toBe(true);
    expect(updated.recurrences![1].status).toBe('pending');
    expect(updated.status).toBe('pending');
  });

  it('última pendente quita a conta junto', () => {
    const almost = { ...acc, recurrences: [{ ...acc.recurrences![0], status: 'paid' as const, paidDate: '2026-09-04' }, acc.recurrences![1]] } as FinancialAccount;
    const updated = settleOccurrence(almost, 'r1-r2', 'recurrence', [{ method: 'cash', amount: 1100 }], false)!;
    expect(updated.status).toBe('paid');
    expect(updated.includeInReport).toBe(false);
  });

  it('id inexistente ou tipo errado retorna null', () => {
    expect(settleOccurrence(acc, 'nope', 'recurrence', [{ method: 'cash', amount: 1 }], true)).toBeNull();
    expect(settleOccurrence(acc, 'r1-r1', 'installment', [{ method: 'cash', amount: 1 }], true)).toBeNull();
  });
});
