import { describe, it, expect } from 'vitest';
import { filterOpenDebts, CustomerDebt } from './FiadosView';
import { Customer } from '../../types';

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
