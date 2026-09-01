import { describe, it, expect } from 'vitest';
import { paymentLabel } from './reportService';

describe('paymentLabel', () => {
  it('retorna label correta para "cash"', () => {
    expect(paymentLabel('cash')).toBe('Dinheiro');
  });

  it('retorna label correta para "pix"', () => {
    expect(paymentLabel('pix')).toBe('PIX');
  });

  it('retorna label correta para "credit_card"', () => {
    expect(paymentLabel('credit_card')).toBe('Cartão de Crédito');
  });

  it('retorna label correta para "debit_card"', () => {
    expect(paymentLabel('debit_card')).toBe('Cartão de Débito');
  });

  it('retorna label correta para "credit_account"', () => {
    expect(paymentLabel('credit_account')).toBe('Fiado / Crédito');
  });

  it('retorna o próprio method como fallback para método desconhecido', () => {
    expect(paymentLabel('bitcoin')).toBe('bitcoin');
  });

  it('retorna "—" para string vazia', () => {
    expect(paymentLabel('')).toBe('—');
  });
});
