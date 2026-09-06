import { describe, expect, it } from 'vitest';
import type { Product } from '../types';
import {
  getProductsNeedingImageResync,
  imageUrlIsPlaceholder,
  REMOTE_DEFAULT_FALLBACK,
  SAVE_DEFAULT_FALLBACK,
} from './productImageSync';

const base = (over: Partial<Product>): Product => ({
  id: 'p1',
  barcode: '123',
  name: 'Produto',
  category: 'Geral',
  unit: 'un',
  costPrice: 10,
  salePrice: 15,
  currentStock: 5,
  minStock: 0,
  maxStock: 0,
  imageUrl: '',
  active: true,
  updatedAt: '2026-09-06T00:00:00.000Z',
  storeBranchId: '160e38a2-a896-4d6b-a6ea-52d4362abf55',
  organizationId: '9bfef532-5a39-4a92-b422-15f16b6c96b2',
  showOnTV: false,
  showOnCardapio: true,
  ...over,
});

describe('imageUrlIsPlaceholder', () => {
  it('happy: URL real (Amazon/ML/Wikimedia) não é placeholder', () => {
    expect(imageUrlIsPlaceholder('https://m.media-amazon.com/images/I/61Xuuup3M7L.jpg')).toBe(false);
    expect(imageUrlIsPlaceholder('https://upload.wikimedia.org/wikipedia/commons/a/a9/Askov.jpg')).toBe(false);
  });

  it('falha: vazio é placeholder', () => {
    expect(imageUrlIsPlaceholder('')).toBe(true);
    expect(imageUrlIsPlaceholder(null)).toBe(true);
    expect(imageUrlIsPlaceholder(undefined)).toBe(true);
  });

  it('falha: base64 local (upload falhou) é placeholder e nunca vai ao cloud', () => {
    expect(imageUrlIsPlaceholder('data:image/jpeg;base64,/9j/4AAQSkZJRg==')).toBe(true);
  });

  it('falha: fallbacks genéricos do app são placeholders', () => {
    expect(imageUrlIsPlaceholder(`${SAVE_DEFAULT_FALLBACK}?w=300&auto=format&fit=crop&q=80`)).toBe(true);
    expect(imageUrlIsPlaceholder(`${REMOTE_DEFAULT_FALLBACK}?w=300`)).toBe(true);
  });
});

describe('getProductsNeedingImageResync', () => {
  it('happy: inclui produtos com imagem real e sem tombstone', () => {
    const products = [
      base({ id: 'a', imageUrl: 'https://m.media-amazon.com/images/I/61Xuuup3M7L.jpg' }),
      base({ id: 'b', imageUrl: `https://http2.mlstatic.com/D_NQ_NP_685624-MLB84818326818_052025-O-coko-original-01.jpg` }),
    ];
    const targets = getProductsNeedingImageResync(products);
    expect(targets.map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('falha: exclui fallback genérico, vazio, base64 e tombstoned', () => {
    const products = [
      base({ id: 'fallback', imageUrl: `${SAVE_DEFAULT_FALLBACK}?w=300&auto=format&fit=crop&q=80` }),
      base({ id: 'empty', imageUrl: '' }),
      base({ id: 'base64', imageUrl: 'data:image/png;base64,iVBORw0KGgo=' }),
      base({ id: 'deleted', imageUrl: 'https://m.media-amazon.com/images/I/61Xuuup3M7L.jpg', deletedAt: '2026-09-06T00:00:00.000Z' }),
    ];
    expect(getProductsNeedingImageResync(products)).toHaveLength(0);
  });

  it('falha: lista vazia retorna vazia (botão sem efeito colateral)', () => {
    expect(getProductsNeedingImageResync([])).toHaveLength(0);
  });
});