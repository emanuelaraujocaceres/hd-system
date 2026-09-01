import { describe, it, expect } from 'vitest';
import { parseBrlToNumber, formatNumberToBrl } from './MoneyInput';

// ── parseBrlToNumber ─────────────────────────────────────────────────

describe('parseBrlToNumber', () => {
  it('converte "1.234,56" (milhar + decimal)', () => {
    expect(parseBrlToNumber('1.234,56')).toBeCloseTo(1234.56, 2);
  });

  it('converte "5,90" (decimal simples)', () => {
    expect(parseBrlToNumber('5,90')).toBeCloseTo(5.9, 2);
  });

  it('converte "0,00"', () => {
    expect(parseBrlToNumber('0,00')).toBe(0);
  });

  it('retorna 0 para string vazia', () => {
    expect(parseBrlToNumber('')).toBe(0);
  });

  it('retorna 0 para string inválida/não numérica', () => {
    expect(parseBrlToNumber('abc')).toBe(0);
    expect(parseBrlToNumber('!!')).toBe(0);
  });

  it('remove TODOS os pontos (treated como thousand separators) — ponto decimal vira vírgula perdida', () => {
    // parseBrlToNumber remove TODOS os pontos primeiro (/\./g, ''),
    // depois substitui vírgula por ponto. Portanto "1234.56" (ponto decimal)
    // perde o ponto → "123456" → 123456. Este é o comportamento observado.
    expect(parseBrlToNumber('1234.56')).toBe(123456);
  });

  it('trata corretamente valor com vários pontos de milhar', () => {
    expect(parseBrlToNumber('1.234.567,89')).toBeCloseTo(1234567.89, 2);
  });
});

// ── formatNumberToBrl ────────────────────────────────────────────────

describe('formatNumberToBrl', () => {
  it('formata "1234.5" como "1.234,50"', () => {
    expect(formatNumberToBrl(1234.5)).toBe('1.234,50');
  });

  it('formata "5.9" como "5,90"', () => {
    expect(formatNumberToBrl(5.9)).toBe('5,90');
  });

  it('formata "0" como "0,00"', () => {
    expect(formatNumberToBrl(0)).toBe('0,00');
  });

  it('formata número grande corretamente', () => {
    expect(formatNumberToBrl(1234567.89)).toBe('1.234.567,89');
  });

  it('arredonda para 2 casas decimais', () => {
    expect(formatNumberToBrl(1.999)).toBe('2,00');
    expect(formatNumberToBrl(1.235)).toBe('1,24');
  });

  it('retorna string vazia para NaN', () => {
    expect(formatNumberToBrl(NaN)).toBe('');
  });

  it('formata negativos', () => {
    expect(formatNumberToBrl(-1234.5)).toBe('-1.234,50');
  });
});
