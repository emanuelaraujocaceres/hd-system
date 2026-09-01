/**
 * Testes unitários de printerRouting.ts
 *
 * Funções testadas:
 *  - getItemType: detecção food/drink/other por sectors da categoria ou heurística de nome
 *  - findPrinterForItemType: prioridade category_id > role > caixa > primeira não-OS
 *  - findCaixaPrinter: prioridade role=caixa > não-OS > primeira
 *  - routeItemsToPrinters: roteamento completo multi-itens → Map<Printer, items>
 */
import { describe, it, expect } from 'vitest';
import {
  getItemType,
  findPrinterForItemType,
  findCaixaPrinter,
  routeItemsToPrinters,
} from './printerRouting';
import type { Printer, Product, Category } from '../types';

// ─── helpers ────────────────────────────────────────────────────

const mkPrinter = (overrides: Partial<Printer> & { id: string }): Printer => ({
  name: overrides.id,
  transport: 'webusb',
  isDefault: false,
  ...overrides,
});

const mkProduct = (id: string, category: string): Product => ({
  id,
  barcode: `BAR-${id}`,
  name: `Produto ${id}`,
  category,
  unit: 'un',
  costPrice: 10,
  salePrice: 15,
  currentStock: 100,
  minStock: 10,
  maxStock: 200,
  imageUrl: '',
  active: true,
  updatedAt: '2026-01-01',
});

const mkSaleItem = (productId: string, quantity = 1) => ({
  productId,
  productName: `Item ${productId}`,
  unitPrice: 15,
  quantity,
  total: 15 * quantity,
});

const mkCategory = (name: string, sectors?: string[]): Category => ({
  id: `cat-${name}`,
  name,
  sectors,
});

// ─── getItemType ────────────────────────────────────────────────

describe('getItemType', () => {
  describe('por sectors da categoria', () => {
    it('retorna "food" quando sectors inclui "cozinha"', () => {
      const cats = [mkCategory('Lanches Executivos', ['cozinha'])];
      expect(getItemType('Lanches Executivos', cats)).toBe('food');
    });

    it('retorna "drink" quando sectors inclui "bar"', () => {
      const cats = [mkCategory('Drinks Especiais', ['bar'])];
      expect(getItemType('Drinks Especiais', cats)).toBe('drink');
    });

    it('retorna "other" quando sectors não é nem cozinha nem bar', () => {
      const cats = [mkCategory('Utensílios', ['caixa'])];
      expect(getItemType('Utensílios', cats)).toBe('other');
    });

    it('retorna "other" quando sectors é array vazio', () => {
      const cats = [mkCategory('Sem Setor', [])];
      expect(getItemType('Sem Setor', cats)).toBe('other');
    });
  });

  describe('por heurística de nome (fallback)', () => {
    // FOOD_CATEGORIES = ['pratos', 'lanches', 'pizzas', 'saladas', 'carnes', 'massas', 'entradas', 'sobremesas', 'burger', 'hambúrguer']
    it('retorna "food" para "Pratos"', () => {
      expect(getItemType('Pratos')).toBe('food');
    });

    it('retorna "food" para "Lanches"', () => {
      expect(getItemType('Lanches')).toBe('food');
    });

    it('retorna "food" para "Pizzas"', () => {
      expect(getItemType('Pizzas')).toBe('food');
    });

    it('retorna "food" para "Hambúrgueres" (contém "hambúrguer")', () => {
      expect(getItemType('Hambúrgueres')).toBe('food');
    });

    it('retorna "food" para "Burgers" (contém "burger")', () => {
      expect(getItemType('Burgers')).toBe('food');
    });

    // DRINK_CATEGORIES = ['bebidas', 'cervezas', 'cervejas', 'sucos', 'vinhos', 'coquetéis', 'coquetel', 'cafés', 'café', 'drinks']
    it('retorna "drink" para "Bebidas"', () => {
      expect(getItemType('Bebidas')).toBe('drink');
    });

    it('retorna "drink" para "Cervejas"', () => {
      expect(getItemType('Cervejas')).toBe('drink');
    });

    it('retorna "drink" para "Drinks"', () => {
      expect(getItemType('Drinks')).toBe('drink');
    });

    it('retorna "drink" para "Sucos Naturais"', () => {
      expect(getItemType('Sucos Naturais')).toBe('drink');
    });

    it('retorna "other" para categoria desconhecida', () => {
      expect(getItemType('Limpeza')).toBe('other');
    });

    it('retorna "other" para string vazia', () => {
      expect(getItemType('')).toBe('other');
    });
  });

  describe('prioridade: sectors > nome', () => {
    it('sector "cozinha" prevalece mesmo que nome sugira drink', () => {
      const cats = [mkCategory('Bebidas Quentes', ['cozinha'])];
      expect(getItemType('Bebidas Quentes', cats)).toBe('food');
    });
  });

  describe('categoria não encontrada na lista de categories', () => {
    it('caí no fallback de nome quando category não existe no array', () => {
      const cats = [mkCategory('Outra Coisa', ['cozinha'])];
      expect(getItemType('Pizzas', cats)).toBe('food'); // nome faz match
    });
  });
});

// ─── findPrinterForItemType ─────────────────────────────────────

describe('findPrinterForItemType', () => {
  const pCozinha = mkPrinter({ id: 'p-coz', role: 'cozinha' });
  const pBar = mkPrinter({ id: 'p-bar', role: 'bar' });
  const pCaixa = mkPrinter({ id: 'p-caixa', role: 'caixa' });

  it('retorna null quando não há impressoras', () => {
    const result = findPrinterForItemType([], 'food', [], []);
    expect(result).toBeNull();
  });

  describe('prioridade 1: category_id específico', () => {
    const pCatPizza = mkPrinter({ id: 'p-pizza', role: 'cozinha', categoryId: 'Pizzas' });
    const products: Product[] = [mkProduct('p1', 'Pizzas')];
    const items = [mkSaleItem('p1')];

    it('encontra impressora com categoryId que bate com categoria do produto', () => {
      const result = findPrinterForItemType([pCozinha, pCatPizza], 'food', items, products);
      expect(result?.id).toBe('p-pizza');
    });
  });

  describe('prioridade 2: role correspondente', () => {
    it('food → cozinha', () => {
      const products: Product[] = [mkProduct('p1', 'Geral')];
      const items = [mkSaleItem('p1')];
      const result = findPrinterForItemType([pCozinha, pBar], 'food', items, products);
      expect(result?.id).toBe('p-coz');
    });

    it('drink → bar', () => {
      const products: Product[] = [mkProduct('p1', 'Geral')];
      const items = [mkSaleItem('p1')];
      const result = findPrinterForItemType([pCozinha, pBar], 'drink', items, products);
      expect(result?.id).toBe('p-bar');
    });

    it('other → caixa', () => {
      const products: Product[] = [mkProduct('p1', 'Geral')];
      const items = [mkSaleItem('p1')];
      const result = findPrinterForItemType([pCozinha, pCaixa], 'other', items, products);
      expect(result?.id).toBe('p-caixa');
    });
  });

  describe('prioridade 3: fallback para impressora caixa', () => {
    it('quando não existe role bar, usa caixa para drink', () => {
      const products: Product[] = [mkProduct('p1', 'Geral')];
      const items = [mkSaleItem('p1')];
      const result = findPrinterForItemType([pCozinha, pCaixa], 'drink', items, products);
      expect(result?.id).toBe('p-caixa');
    });
  });

  describe('prioridade 4: primeira impressora não-OS', () => {
    it('quando nenhuma role bate, usa primeira não-OS', () => {
      const pOs = mkPrinter({ id: 'p-os', transport: 'os' });
      const pAny = mkPrinter({ id: 'p-any', role: 'outro' });
      const products: Product[] = [mkProduct('p1', 'Geral')];
      const items = [mkSaleItem('p1')];
      const result = findPrinterForItemType([pOs, pAny], 'food', items, products);
      expect(result?.id).toBe('p-any');
    });
  });

  describe('prioridade 5: última fallback — primeira da lista', () => {
    it('quando todas são OS, retorna a primeira mesmo OS', () => {
      const pOs1 = mkPrinter({ id: 'p-os1', transport: 'os' });
      const pOs2 = mkPrinter({ id: 'p-os2', transport: 'os' });
      const products: Product[] = [mkProduct('p1', 'Geral')];
      const items = [mkSaleItem('p1')];
      const result = findPrinterForItemType([pOs1, pOs2], 'food', items, products);
      expect(result?.id).toBe('p-os1');
    });
  });

  it('produto não encontrado em allProducts usa categoria "Geral" como fallback', () => {
    const products: Product[] = [];
    const items = [mkSaleItem('id-inexistente')];
    const result = findPrinterForItemType([pCaixa], 'other', items, products);
    expect(result?.id).toBe('p-caixa');
  });
});

// ─── findCaixaPrinter ──────────────────────────────────────────

describe('findCaixaPrinter', () => {
  it('retorna null quando vazio', () => {
    expect(findCaixaPrinter([])).toBeNull();
  });

  it('prioriza impressora com role "caixa"', () => {
    const pCaixa = mkPrinter({ id: 'p-caixa', role: 'caixa' });
    const pBar = mkPrinter({ id: 'p-bar', role: 'bar' });
    expect(findCaixaPrinter([pBar, pCaixa])?.id).toBe('p-caixa');
  });

  it('retorna primeira não-OS quando não há caixa', () => {
    const pOs = mkPrinter({ id: 'p-os', transport: 'os' });
    const pWeb = mkPrinter({ id: 'p-web', transport: 'webusb' });
    expect(findCaixaPrinter([pOs, pWeb])?.id).toBe('p-web');
  });

  it('retorna primeira da lista quando todas são OS', () => {
    const pOs1 = mkPrinter({ id: 'p-os1', transport: 'os' });
    const pOs2 = mkPrinter({ id: 'p-os2', transport: 'os' });
    expect(findCaixaPrinter([pOs1, pOs2])?.id).toBe('p-os1');
  });
});

// ─── routeItemsToPrinters ──────────────────────────────────────

describe('routeItemsToPrinters', () => {
  const pCozinha = mkPrinter({ id: 'p-coz', role: 'cozinha' });
  const pBar = mkPrinter({ id: 'p-bar', role: 'bar' });
  const pCaixa = mkPrinter({ id: 'p-caixa', role: 'caixa' });

  const foodProd = mkProduct('f1', 'Pratos');
  const drinkProd = mkProduct('d1', 'Bebidas');
  const otherProd = mkProduct('o1', 'Limpeza');

  it('retorna Map vazio quando items vazio', () => {
    const result = routeItemsToPrinters([], [pCozinha, pBar], []);
    expect(result.size).toBe(0);
  });

  it('roteia food para impressora de cozinha', () => {
    const items = [mkSaleItem('f1')];
    const result = routeItemsToPrinters(items, [pCozinha], [foodProd]);
    expect(result.size).toBe(1);
    expect(result.has(pCozinha)).toBe(true);
    expect(result.get(pCozinha)).toHaveLength(1);
    expect(result.get(pCozinha)?.[0].productId).toBe('f1');
  });

  it('roteia drink para impressora de bar', () => {
    const items = [mkSaleItem('d1')];
    const result = routeItemsToPrinters(items, [pBar], [drinkProd]);
    expect(result.size).toBe(1);
    expect(result.has(pBar)).toBe(true);
  });

  it('roteia other para impressora de caixa', () => {
    const items = [mkSaleItem('o1')];
    const result = routeItemsToPrinters(items, [pCaixa], [otherProd]);
    expect(result.size).toBe(1);
    expect(result.has(pCaixa)).toBe(true);
  });

  it('agrupa food + drink em impressoras diferentes', () => {
    const items = [mkSaleItem('f1'), mkSaleItem('d1')];
    const products = [foodProd, drinkProd];
    const result = routeItemsToPrinters(items, [pCozinha, pBar], products);
    expect(result.size).toBe(2);
    expect(result.get(pCozinha)).toHaveLength(1);
    expect(result.get(pBar)).toHaveLength(1);
  });

  it('agrupa food + drink + other em 3 impressoras', () => {
    const items = [mkSaleItem('f1'), mkSaleItem('d1'), mkSaleItem('o1')];
    const products = [foodProd, drinkProd, otherProd];
    const result = routeItemsToPrinters(items, [pCozinha, pBar, pCaixa], products);
    expect(result.size).toBe(3);
  });

  it('múltiplos itens do mesmo tipo vão para mesma impressora', () => {
    const foodProd2 = mkProduct('f2', 'Lanches');
    const items = [mkSaleItem('f1'), mkSaleItem('f2')];
    const products = [foodProd, foodProd2];
    const result = routeItemsToPrinters(items, [pCozinha], products);
    expect(result.size).toBe(1);
    expect(result.get(pCozinha)).toHaveLength(2);
  });

  it('sem impressora disponível → Map vazio (items ficam sem roteamento)', () => {
    const items = [mkSaleItem('f1')];
    const result = routeItemsToPrinters(items, [], [foodProd]);
    expect(result.size).toBe(0);
  });

  it('produto não encontrado no allProducts usa categoria vazia → other → caixa', () => {
    const items = [mkSaleItem('id-ghost')];
    const result = routeItemsToPrinters(items, [pCaixa], []);
    // itemSem produto → getItemType('', categories) → 'other'
    expect(result.has(pCaixa)).toBe(true);
  });

  it('respeita categories via parâmetro opcional', () => {
    const catBebida = mkCategory('Cervejas Finas', ['bar']);
    const items = [mkSaleItem('d1')];
    const prodWithSector = mkProduct('d1', 'Cervejas Finas');
    const result = routeItemsToPrinters(items, [pBar], [prodWithSector], [catBebida]);
    expect(result.has(pBar)).toBe(true);
  });
});
