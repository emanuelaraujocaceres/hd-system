import { describe, it, expect } from 'vitest';
import { normalizeText, normalizeForMatch } from './capture';

describe('capture.ts — normalizeText / normalizeForMatch', () => {
  it('normalizeText trims, lowercases and collapses spaces', () => {
    expect(normalizeText('  Cerveja   Pilsen  ')).toBe('cerveja pilsen');
    expect(normalizeText('REFRI COLA')).toBe('refri cola');
  });

  it('normalizeForMatch removes accents for tolerant matching', () => {
    expect(normalizeForMatch('Café Expresso')).toBe('cafe expresso');
    expect(normalizeForMatch('COMPANHIA DE BEBIDAS DAS AMÉRICAS')).toBe(
      'companhia de bebidas das americas',
    );
  });

  it('normalizeForMatch handles empty/undefined gracefully', () => {
    expect(normalizeForMatch('')).toBe('');
    expect(normalizeForMatch('   ')).toBe('');
  });
});
