import { describe, expect, it } from 'vitest';
import { computeEan13 } from './BarcodeLabelModal';

describe('computeEan13', () => {
  it('calcula o dígito verificador correto para um EAN-13 completo (cenário feliz)', () => {
    expect(computeEan13('789123456789')).toBe('7891234567895');
    expect(computeEan13('400638133393')).toBe('4006381333931');
  });

  it('completa códigos curtos com zeros até 12 dígitos', () => {
    // 12 dígitos só de zeros → check digit 0
    expect(computeEan13('')).toBe('0000000000000');
    expect(computeEan13('123')).toBe('1230000000000');
  });

  it('remove caracteres não-numéricos antes de codificar', () => {
    expect(computeEan13('78 9123-4567 89')).toBe('7891234567895');
  });

  it('trunca códigos com mais de 12 dígitos', () => {
    expect(computeEan13('123456789012345678')).toBe('1234567890128');
  });
});