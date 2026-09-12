import { describe, expect, it } from 'vitest';
import { filterFinanceAccounts, buildAccountSettlement } from './FinanceView';
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

describe('buildAccountSettlement — baixa via checkout', () => {
  const rec = (over = {}) =>
    ({
      id: 'k1', title: 'Cliente Klebinho', type: 'receivable', category: 'conta_receber',
      amount: 130, dueDate: '2026-09-20', status: 'pending', recipientOrPayer: 'Cliente',
      ...over,
    } as FinancialAccount);

  it('recebível em dinheiro: paid + método + suprimento', () => {
    const { updated, cashIn, cashOut, primaryMethod } = buildAccountSettlement(rec(), [{ method: 'cash', amount: 130 }]);
    expect(updated.status).toBe('paid');
    expect(updated.paidDate).toBeTruthy();
    expect(updated.paymentMethod).toBe('cash');
    expect(primaryMethod).toBe('cash');
    expect(cashIn).toBe(130);
    expect(cashOut).toBe(0);
  });

  it('a pagar dividido: só o dinheiro vira sangria, método = maior parte', () => {
    const { updated, cashIn, cashOut, primaryMethod } = buildAccountSettlement(
      rec({ type: 'payable' }),
      [{ method: 'cash', amount: 30 }, { method: 'pix', amount: 100 }],
    );
    expect(updated.status).toBe('paid');
    expect(updated.paymentMethod).toBe('pix');
    expect(primaryMethod).toBe('pix');
    expect(cashIn).toBe(0);
    expect(cashOut).toBe(30);
  });

  it('sem partes válidas: quita sem movimentar caixa', () => {
    const { updated, cashIn, cashOut } = buildAccountSettlement(rec(), []);
    expect(updated.status).toBe('paid');
    expect(cashIn).toBe(0);
    expect(cashOut).toBe(0);
  });
});
