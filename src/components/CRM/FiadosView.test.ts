import { describe, it, expect } from 'vitest';
import { filterOpenDebts, CustomerDebt, getSaleCreditAmount, getSaleDebtItems } from './FiadosView';
import { Customer, Sale } from '../../types';

const mkCustomer = (id: string, name: string): Customer =>
  ({
    id,
    name,
    cpfCnpj: '123',
    email: '',
    phone: '',
    creditLimit: 0,
    currentBalance: 0,
    loyaltyPoints: 0,
    city: '',
    state: '',
    createdAt: '',
  } as unknown as Customer);

const mkDebt = (id: string, name: string, remaining: number): CustomerDebt => ({
  customer: mkCustomer(id, name),
  sales: [],
  totalDebt: remaining,
  totalPaid: 0,
  remaining,
  purchaseCount: 0,
  items: [],
});

describe('FiadosView — filterOpenDebts', () => {
  it('esconde conta quitada (remaining <= 0.01)', () => {
    const debts = [mkDebt('1', 'Ana', 0), mkDebt('2', 'Beto', 50)];
    expect(filterOpenDebts(debts).map((d) => d.customer.id)).toEqual(['2']);
  });

  it('considera arredondamento: remaining 0.005 é quitado', () => {
    const debts = [mkDebt('1', 'Ana', 0.005), mkDebt('2', 'Beto', 10.5)];
    expect(filterOpenDebts(debts).map((d) => d.customer.id)).toEqual(['2']);
  });

  it('mantém conta com saldo pendente', () => {
    const debts = [mkDebt('1', 'Ana', 10.5), mkDebt('2', 'Beto', 0)];
    expect(filterOpenDebts(debts).map((d) => d.customer.id)).toEqual(['1']);
  });

  it('filtra por busca de nome', () => {
    const debts = [mkDebt('1', 'Ana', 10), mkDebt('2', 'Beto', 20)];
    expect(filterOpenDebts(debts, 'bet').map((d) => d.customer.id)).toEqual(['2']);
  });

  it('busca vazia retorna só em aberto', () => {
    const debts = [mkDebt('1', 'Ana', 10), mkDebt('2', 'Beto', 0)];
    expect(filterOpenDebts(debts, '   ').map((d) => d.customer.id)).toEqual(['1']);
  });
});

const mkSale = (over: Partial<Sale>): Sale =>
  ({
    id: 'sale-1',
    code: 'VEN-TEST',
    date: new Date().toISOString(),
    total: 0,
    items: [],
    payments: [],
    status: 'completed',
    ...over,
  } as unknown as Sale);

describe('FiadosView — getSaleCreditAmount', () => {
  it('soma todos os credit_account (split payment)', () => {
    const s = mkSale({
      total: 100,
      payments: [
        { method: 'credit_account', amount: 60 },
        { method: 'credit_account', amount: 5.5 },
      ],
    });
    expect(getSaleCreditAmount(s)).toBe(65.5);
  });

  it('sem credit_account usa saleTotal como fallback', () => {
    const s = mkSale({ total: 42.5, payments: [{ method: 'cash', amount: 42.5 }] });
    expect(getSaleCreditAmount(s)).toBe(42.5);
  });
});

describe('FiadosView — getSaleDebtItems (venda sem itens)', () => {
  it('venda fiado sem itens entra na dívida (regressão VEN-MTXM60OB-IE51)', () => {
    const s = mkSale({
      id: '1d97ec48-582f-4000-ac49-15b0ff8bc50a',
      code: 'VEN-MTXM60OB-IE51',
      total: 5.5,
      items: [],
      payments: [{ method: 'credit_account', amount: 5.5 }],
    });
    const { debt, items } = getSaleDebtItems(s);
    expect(debt).toBe(5.5);
    expect(items).toHaveLength(1);
    expect(items[0].total).toBe(5.5);
  });

  it('venda normal rateia o fiado pelos itens', () => {
    const s = mkSale({
      total: 60,
      items: [
        { productId: 'p1', productName: 'A', unitPrice: 40, quantity: 1, total: 40 },
        { productId: 'p2', productName: 'B', unitPrice: 20, quantity: 1, total: 20 },
      ],
      payments: [{ method: 'credit_account', amount: 60 }],
    });
    const { debt, items } = getSaleDebtItems(s);
    expect(debt).toBe(60);
    expect(items).toHaveLength(2);
  });

  it('venda zerada sem itens nem fiado contribui 0', () => {
    const s = mkSale({ total: 0, items: [], payments: [] });
    const { debt, items } = getSaleDebtItems(s);
    expect(debt).toBe(0);
    expect(items).toHaveLength(0);
  });
});
