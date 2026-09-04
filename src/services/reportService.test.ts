import { describe, it, expect } from 'vitest';
import { paymentLabel, hasTime, parseISODate, toUtcBoundary, fmtBoundary } from './reportService';

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

describe('hasTime (filtro com hora)', () => {
  it('retorna false para data pura', () => {
    expect(hasTime('2026-09-01')).toBe(false);
  });

  it('retorna true para datetime local', () => {
    expect(hasTime('2026-09-01T14:30')).toBe(true);
  });

  it('retorna true quando há espaço (compat. formato)', () => {
    expect(hasTime('2026-09-01 14:30')).toBe(true);
  });
});

describe('parseISODate', () => {
  it('aceita data pura', () => {
    expect(parseISODate('2026-09-01')).not.toBeNull();
  });

  it('aceita datetime local', () => {
    expect(parseISODate('2026-09-01T14:30')).not.toBeNull();
  });

  it('retorna null para valor inválido', () => {
    expect(parseISODate('lixo')).toBeNull();
  });
});

describe('toUtcBoundary (limite com hora → UTC)', () => {
  it('ponto inicial de data pura vira começo do dia (no fuso local)', () => {
    // O valor exato depende do fuso da máquina; checamos que é um ISO UTC válido
    // e que o instante corresponde a 00:00:00 local do dia.
    const iso = toUtcBoundary('2026-09-01', false);
    const d = new Date(iso);
    expect(new Date(iso).toISOString()).toBe(iso);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(8); // setembro (0-based)
    expect(d.getDate()).toBe(1);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
  });

  it('ponto final de data pura vira fim do dia local', () => {
    const d = new Date(toUtcBoundary('2026-09-01', true));
    expect(new Date(d).getDate()).toBe(1);
  });

  it('datetime local vira instante UTC comparável', () => {
    const iso = toUtcBoundary('2026-09-01T14:30', false);
    expect(new Date(iso).toISOString()).toBe(iso); // formato UTC válido
  });
});

describe('fmtBoundary (exibição do período)', () => {
  it('data pura exibe só a data (pt-BR)', () => {
    expect(fmtBoundary('2026-09-01')).toBe('01/09/2026');
  });
});
