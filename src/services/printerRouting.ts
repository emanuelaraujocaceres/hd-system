import { Sale, Printer, Product, Table, Category } from '../types';

// Categorias consideradas comida (cozinha) vs bebida (bar)
const FOOD_CATEGORIES = ['pratos', 'lanches', 'pizzas', 'saladas', 'carnes', 'massas', 'entradas', 'sobremesas', 'burger', 'hambúrguer'];
const DRINK_CATEGORIES = ['bebidas', 'cervezas', 'cervejas', 'sucos', 'vinhos', 'coquetéis', 'coquetel', 'cafés', 'café', 'drinks'];

export type PrinterRoute = 'cozinha' | 'bar' | 'caixa';

/**
 * Determina o tipo de um item baseado na categoria do produto.
 * Usa os sectors da categoria se disponíveis, senão usa o nome.
 */
export function getItemType(categoryName: string, categories?: Category[]): 'food' | 'drink' | 'other' {
  // Primeiro, verificar se a categoria tem sectors definidos
  if (categories && categories.length > 0) {
    const cat = categories.find((c) => c.name === categoryName);
    if (cat?.sectors && cat.sectors.length > 0) {
      // Se tem sector definido, usar o primeiro
      const sector = cat.sectors[0];
      if (sector === 'cozinha') return 'food';
      if (sector === 'bar') return 'drink';
      return 'other';
    }
  }

  // Fallback: usar o nome da categoria
  const cat = categoryName.toLowerCase();
  if (FOOD_CATEGORIES.some((c) => cat.includes(c))) return 'food';
  if (DRINK_CATEGORIES.some((c) => cat.includes(c))) return 'drink';
  return 'other';
}

/**
 * Encontra a impressora apropriada para um tipo de item.
 * Prioridade:
 * 1. Impressora com category_id exato (categoria específica configurada)
 * 2. Impressora com role correspondente (cozinha/bar)
 * 3. Impressora com role "caixa" (fallback padrão)
 * 4. Primeira impressora disponível (último fallback)
 */
export function findPrinterForItemType(
  printers: Printer[],
  itemType: 'food' | 'drink' | 'other',
  products: Sale['items'],
  allProducts: Product[]
): Printer | null {
  if (printers.length === 0) return null;

  // Mapear items para suas categorias
  const itemCategories = products.map((item) => {
    const product = allProducts.find((p) => p.id === item.productId);
    return product?.category || 'Geral';
  });

  // 1. Tentar encontrar impressora com category_id específico
  for (const category of itemCategories) {
    const categoryPrinter = printers.find((p) => p.categoryId && p.categoryId === category);
    if (categoryPrinter) return categoryPrinter;
  }

  // 2. Determinar role necessário baseado no tipo do item
  const roleNeeded: PrinterRoute = itemType === 'drink' ? 'bar' : itemType === 'food' ? 'cozinha' : 'caixa';

  // 3. Buscar impressora com role correspondente
  const rolePrinter = printers.find((p) => p.role === roleNeeded);
  if (rolePrinter) return rolePrinter;

  // 4. Fallback: impressora do caixa
  const caixaPrinter = printers.find((p) => p.role === 'caixa');
  if (caixaPrinter) return caixaPrinter;

  // 5. Último fallback: primeira impressora que não seja 'os' (janela)
  const printablePrinters = printers.filter((p) => p.transport !== 'os');
  if (printablePrinters.length > 0) return printablePrinters[0];

  return printers[0] || null;
}

/**
 * Encontra a impressora do caixa para impressão de comprovante de fechamento.
 */
export function findCaixaPrinter(printers: Printer[]): Printer | null {
  if (printers.length === 0) return null;

  // Prioridade: role=caixa > primeira que não seja 'os' > primeira disponível
  const caixaPrinter = printers.find((p) => p.role === 'caixa');
  if (caixaPrinter) return caixaPrinter;

  const printablePrinters = printers.filter((p) => p.transport !== 'os');
  if (printablePrinters.length > 0) return printablePrinters[0];

  return printers[0] || null;
}

/**
 * Agrupa items do pedido por destino (cozinha/bar/caixa).
 * Retorna um mapa de impressora -> items.
 */
export function routeItemsToPrinters(
  items: Sale['items'],
  printers: Printer[],
  allProducts: Product[],
  categories?: Category[]
): Map<Printer, Sale['items']> {
  const routing = new Map<Printer, Sale['items']>();

  // Agrupar items por tipo
  const foodItems: Sale['items'] = [];
  const drinkItems: Sale['items'] = [];
  const otherItems: Sale['items'] = [];

  for (const item of items) {
    const product = allProducts.find((p) => p.id === item.productId);
    const type = getItemType(product?.category || '', categories);
    if (type === 'food') foodItems.push(item);
    else if (type === 'drink') drinkItems.push(item);
    else otherItems.push(item);
  }

  // Encontrar impressora para comida (cozinha)
  if (foodItems.length > 0) {
    const foodPrinter = findPrinterForItemType(printers, 'food', foodItems, allProducts);
    if (foodPrinter) {
      const existing = routing.get(foodPrinter) || [];
      routing.set(foodPrinter, [...existing, ...foodItems]);
    }
  }

  // Encontrar impressora para bebida (bar)
  if (drinkItems.length > 0) {
    const drinkPrinter = findPrinterForItemType(printers, 'drink', drinkItems, allProducts);
    if (drinkPrinter) {
      const existing = routing.get(drinkPrinter) || [];
      routing.set(drinkPrinter, [...existing, ...drinkItems]);
    }
  }

  // Itens 'other' vão para o caixa
  if (otherItems.length > 0) {
    const caixaPrinter = findCaixaPrinter(printers);
    if (caixaPrinter) {
      const existing = routing.get(caixaPrinter) || [];
      routing.set(caixaPrinter, [...existing, ...otherItems]);
    }
  }

  return routing;
}
