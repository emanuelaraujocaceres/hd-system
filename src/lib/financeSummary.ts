import type { Product, Sale } from '../types';

export type FinancePeriod = 'day' | 'week' | 'month';

/** Range de datas opcional (datetime-local). Quando fornecido, sobrepõe `period`. */
export interface DateRange {
  from: string; // "YYYY-MM-DDTHH:mm" ou ""
  to: string;
}

export interface ProductProfitLine {
  productId: string;
  productName: string;
  quantity: number;
  revenue: number;      // faturamento = preço de venda × quantidade
  cost: number;         // custo = custo do produto × quantidade
  profit: number;       // lucro/prejuízo da linha = revenue - cost
}

export interface FinanceSummary {
  salesCount: number;
  total: number;
  cash: number;
  pix: number;
  creditCard: number;
  debitCard: number;
  costOfGoodsSold: number;
  productProfit: number;
  byProduct: ProductProfitLine[]; // detalhamento por produto (ordenado: maior prejuízo primeiro)
}

const startOfPeriod = (period: FinancePeriod, reference: Date) => {
  const start = new Date(reference);
  start.setHours(0, 0, 0, 0);
  if (period === 'week') start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  if (period === 'month') start.setDate(1);
  return start;
};

export function calculateFinanceSummary(
  sales: Sale[],
  products: Product[],
  branchId: string,
  period: FinancePeriod = 'day',
  reference = new Date(),
  dateRange?: DateRange,
): FinanceSummary {
  let start: Date;
  let end: Date;
  if (dateRange) {
    // dateRange fornecido: usa os limites diretamente (comparação por instante,
    // robusta a fuso — datetime-local vs ISO UTC).
    // Limite vazio = aberto: from vazio → sem piso; to vazio → sem teto.
    start = dateRange.from ? new Date(dateRange.from) : new Date(0);
    end = dateRange.to ? new Date(dateRange.to) : new Date('2099-12-31T23:59:59');
  } else {
    start = startOfPeriod(period, reference);
    end = new Date(reference);
    end.setHours(23, 59, 59, 999);
  }
  const productsById = new Map(products.map((product) => [product.id, product]));
  const result: FinanceSummary = {
    salesCount: 0, total: 0, cash: 0, pix: 0, creditCard: 0, debitCard: 0,
    costOfGoodsSold: 0, productProfit: 0, byProduct: [],
  };
  const byProduct = new Map<string, ProductProfitLine>();

  for (const sale of sales) {
    const date = new Date(sale.date);
    if (sale.status !== 'completed' || sale.storeBranchId !== branchId || Number.isNaN(date.getTime()) || date < start || date > end) continue;
    const total = sale.total > 0 ? sale.total : (sale.items || []).reduce((sum, item) => sum + (item.total || 0), 0);
    result.salesCount += 1;
    result.total += total;
    for (const payment of sale.payments || []) {
      if (payment.method === 'cash') result.cash += payment.amount;
      if (payment.method === 'pix') result.pix += payment.amount;
      if (payment.method === 'credit_card') result.creditCard += payment.amount;
      if (payment.method === 'debit_card') result.debitCard += payment.amount;
    }
    for (const item of sale.items || []) {
      const product = productsById.get(item.productId);
      const unitCost = product ? product.costPrice : item.unitPrice * 0.6;
      const itemRevenue = (item.unitPrice || 0) * item.quantity;
      const itemCost = unitCost * item.quantity;
      result.costOfGoodsSold += itemCost;
      const line = byProduct.get(item.productId);
      if (line) {
        line.quantity += item.quantity;
        line.revenue += itemRevenue;
        line.cost += itemCost;
        line.profit += itemRevenue - itemCost;
      } else {
        byProduct.set(item.productId, {
          productId: item.productId,
          productName: item.productName || product?.name || item.productId,
          quantity: item.quantity,
          revenue: itemRevenue,
          cost: itemCost,
          profit: itemRevenue - itemCost,
        });
      }
    }
  }
  result.productProfit = result.total - result.costOfGoodsSold;
  // Ordena do MAIOR prejuízo (lucro mais negativo) para o maior lucro.
  result.byProduct = Array.from(byProduct.values()).sort((a, b) => a.profit - b.profit);
  return result;
}
