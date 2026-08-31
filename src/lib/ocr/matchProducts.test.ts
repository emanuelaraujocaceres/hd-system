import { describe, it, expect } from 'vitest';
import { nameSimilarity, matchItemToProducts } from './matchProducts';
import type { Product } from '../../types';

function p(id: string, name: string, active = true): Product {
  return {
    id,
    name,
    barcode: '',
    category: 'Geral',
    unit: 'un',
    costPrice: 0,
    salePrice: 0,
    currentStock: 10,
    minStock: 0,
    maxStock: 0,
    imageUrl: '',
    active,
    updatedAt: new Date().toISOString(),
  };
}

const catalog = [p('a', 'Cerveja Pilsen 600ml'), p('b', 'Refrigerante Cola 2L'), p('c', 'Água Mineral 500ml'), p('d', 'Cerveja Original 600ml')];

describe('matchProducts — nameSimilarity', () => {
  it('returns 1 for identical token sets', () => {
    expect(nameSimilarity('Cerveja Pilsen 600ml', 'Cerveja Pilsen 600ml')).toBe(1);
  });
  it('returns >0 for partial token overlap', () => {
    expect(nameSimilarity('Cerveja Pilsen', 'Cerveja Original 600ml')).toBeGreaterThan(0);
  });
  it('returns 0 for empty input', () => {
    expect(nameSimilarity('', 'Cerveja')).toBe(0);
  });
});

describe('matchProducts — matchItemToProducts (cenário feliz)', () => {
  it('finds exact normalized match and returns fuzzy=false', () => {
    const res = matchItemToProducts('  cerveja  pilsen   600ml ', catalog);
    expect(res.fuzzy).toBe(false);
    expect(res.product?.id).toBe('a');
    expect(res.candidates).toEqual([]);
  });

  it('finds fuzzy match for similar (non-identical) name', () => {
    const res = matchItemToProducts('Cerveja 600ml', catalog);
    const best = res.product;
    expect(best).toBeTruthy();
    // nome não-idêntico → fuzzy
    expect(res.fuzzy).toBe(true);
    // candidatos incluem outras cervejas (Original) que só casam por tokens parciais
    expect(res.candidates.some((c) => c.id === 'd')).toBe(true);
  });
});

describe('matchProducts — matchItemToProducts (cenário de falha)', () => {
  it('returns null fuzzy=false for unrelated name', () => {
    const res = matchItemToProducts('Cadeira de Plástico', catalog);
    expect(res.product).toBeNull();
    expect(res.candidates).toEqual([]);
    expect(res.fuzzy).toBe(false);
  });

  it('returns null for empty name', () => {
    expect(matchItemToProducts('', catalog).product).toBeNull();
  });

  it('ignores inactive products', () => {
    const activeOnly = [p('a', 'Cerveja Pilsen 600ml'), p('x', 'Suco de Laranja', false)];
    const res = matchItemToProducts('Suco de Laranja', activeOnly);
    expect(res.product).toBeNull();
  });
});
