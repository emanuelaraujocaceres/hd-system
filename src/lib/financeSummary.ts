import type { Product, Sale } from '../types';

export type FinancePeriod = 'day' | 'week' | 'month';

export interface FinanceSummary {
  salesCount: number;
  total: number;
  cash: number;
  pix: number;
  creditCard: number;
  debitCard: number;
  costOfGoodsSold: number;
  productProfit: number;
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
  period: FinancePeriod,
  reference = new Date(),
): FinanceSummary {
  const start = startOfPeriod(period, reference);
  const end = new Date(reference);
  end.setHours(23, 59, 59, 999);
  const productsById = new Map(products.map((product) => [product.id, product]));
  const result: FinanceSummary = {
    salesCount: 0, total: 0, cash: 0, pix: 0, creditCard: 0, debitCard: 0,
    costOfGoodsSold: 0, productProfit: 0,
  };

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
      result.costOfGoodsSold += (product ? product.costPrice : item.unitPrice * 0.6) * item.quantity;
    }
  }
  result.productProfit = result.total - result.costOfGoodsSold;
  return result;
}
