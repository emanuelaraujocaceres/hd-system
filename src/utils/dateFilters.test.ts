import { describe, it, expect } from 'vitest';
import { isSaleInRange, isAccountInDateRange } from './dateFilters';

// Timestamps UTC explícitos tornam o teste determinístico, independente do
// fuso em que a suíte roda (new Date("...Z") é inequívoco).
describe('isSaleInRange — vendas dentro do intervalo de data/hora', () => {
  it('retorna true para venda exatamente no limite inicial (inclusivo)', () => {
    expect(isSaleInRange('2026-09-04T14:00:00.000Z', '2026-09-04T14:00:00.000Z', '2026-09-04T18:00:00.000Z')).toBe(true);
  });

  it('retorna true para venda exatamente no limite final (inclusivo)', () => {
    expect(isSaleInRange('2026-09-04T18:00:00.000Z', '2026-09-04T14:00:00.000Z', '2026-09-04T18:00:00.000Z')).toBe(true);
  });

  it('retorna true para venda no meio do intervalo', () => {
    expect(isSaleInRange('2026-09-04T16:30:00.000Z', '2026-09-04T14:00:00.000Z', '2026-09-04T18:00:00.000Z')).toBe(true);
  });

  it('retorna false para venda antes do limite inicial', () => {
    expect(isSaleInRange('2026-09-04T13:59:00.000Z', '2026-09-04T14:00:00.000Z', '2026-09-04T18:00:00.000Z')).toBe(false);
  });

  it('retorna false para venda depois do limite final', () => {
    expect(isSaleInRange('2026-09-04T18:01:00.000Z', '2026-09-04T14:00:00.000Z', '2026-09-04T18:00:00.000Z')).toBe(false);
  });

  it('limite inicial vazio => sem piso (venda antiga aceita)', () => {
    expect(isSaleInRange('2026-09-01T10:00:00.000Z', '', '2026-09-04T18:00:00.000Z')).toBe(true);
  });

  it('limite final vazio => sem teto (venda futura aceita)', () => {
    expect(isSaleInRange('2026-09-10T10:00:00.000Z', '2026-09-04T00:00:00.000Z', '')).toBe(true);
  });

  it('ambos vazios => aceita qualquer venda', () => {
    expect(isSaleInRange('2026-01-01T00:00:00.000Z', '', '')).toBe(true);
  });

  it('saleDate vazio => fora do intervalo', () => {
    expect(isSaleInRange('', '2026-09-04T14:00:00.000Z', '2026-09-04T18:00:00.000Z')).toBe(false);
  });

  it('saleDate inválido => fora do intervalo', () => {
    expect(isSaleInRange('não-é-data', '2026-09-04T14:00:00.000Z', '')).toBe(false);
  });

  it('limite inválido é ignorado no lado correspondente', () => {
    // from inválido => tratado como sem piso
    expect(isSaleInRange('2026-09-04T16:00:00.000Z', 'inválido', '2026-09-04T18:00:00.000Z')).toBe(true);
  });
});

describe('isAccountInDateRange — contas financeiras dentro do intervalo', () => {
  const base = { id: '1', title: 'Aluguel', type: 'payable' as const, amount: 1000, dueDate: '2026-09-15', status: 'pending' as const, recipientOrPayer: 'Proprietário' };

  it('conta simples dentro do intervalo', () => {
    expect(isAccountInDateRange(base, '2026-09-01T00:00', '2026-09-30T23:59')).toBe(true);
  });

  it('conta simples fora do intervalo (antes)', () => {
    expect(isAccountInDateRange(base, '2026-10-01T00:00', '2026-10-31T23:59')).toBe(false);
  });

  it('conta simples fora do intervalo (depois)', () => {
    expect(isAccountInDateRange(base, '2026-08-01T00:00', '2026-08-31T23:59')).toBe(false);
  });

  it('conta parcelada: true se qualquer parcela está no intervalo', () => {
    const acc = {
      ...base,
      isInstallment: true,
      installments: [
        { id: 'p1', number: 1, amount: 500, dueDate: '2026-09-10', status: 'pending' as const },
        { id: 'p2', number: 2, amount: 500, dueDate: '2026-10-10', status: 'pending' as const },
      ],
    };
    expect(isAccountInDateRange(acc, '2026-09-01T00:00', '2026-09-30T23:59')).toBe(true);
  });

  it('conta parcelada: false se nenhuma parcela está no intervalo', () => {
    const acc = {
      ...base,
      isInstallment: true,
      installments: [
        { id: 'p1', number: 1, amount: 500, dueDate: '2026-11-10', status: 'pending' as const },
        { id: 'p2', number: 2, amount: 500, dueDate: '2026-12-10', status: 'pending' as const },
      ],
    };
    expect(isAccountInDateRange(acc, '2026-09-01T00:00', '2026-09-30T23:59')).toBe(false);
  });

  it('conta recorrente: true se qualquer ocorrência está no intervalo', () => {
    const acc = {
      ...base,
      isRecurring: true,
      recurrences: [
        { id: 'r1', number: 1, dueDate: '2026-08-15', status: 'paid' as const },
        { id: 'r2', number: 2, dueDate: '2026-09-15', status: 'pending' as const },
      ],
    };
    expect(isAccountInDateRange(acc, '2026-09-01T00:00', '2026-09-30T23:59')).toBe(true);
  });

  it('from vazio => sem piso (conta antiga aceita)', () => {
    expect(isAccountInDateRange({ ...base, dueDate: '2025-01-01' }, '', '2026-09-30T23:59')).toBe(true);
  });

  it('to vazio => sem teto (conta futura aceita)', () => {
    expect(isAccountInDateRange({ ...base, dueDate: '2099-12-31' }, '2026-09-01T00:00', '')).toBe(true);
  });

  it('ambos vazios => aceita qualquer conta', () => {
    expect(isAccountInDateRange(base, '', '')).toBe(true);
  });

  it('extrai YYYY-MM-DD de datetime-local (ignora hora)', () => {
    // dueDate 2026-09-15 deve ser aceito mesmo se from/to têm hora
    expect(isAccountInDateRange(base, '2026-09-15T08:00', '2026-09-15T10:00')).toBe(true);
  });
});
