import type { CreditPayment, Product, Sale } from '../types';

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
  /** Recebido de dívidas manuais pré-sistema no período (regime de caixa). */
  manualDebtReceived: number;
}

const startOfPeriod = (period: FinancePeriod, reference: Date) => {
  const start = new Date(reference);
  start.setHours(0, 0, 0, 0);
  if (period === 'week') start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  if (period === 'month') start.setDate(1);
  return start;
};

/**
 * Dívida manual pré-sistema (botão "Adicionar dívida" do Fiados): venda fiado
 * sem itens, marcada com `orderSource === 'fiado'` (valor antes sem uso).
 * Regime de CAIXA: NÃO entra no faturamento no lançamento (só em Contas a
 * Receber); o valor sobe para o faturamento quando o cliente PAGA
 * (via sumManualDebtReceived). Venda fiado normal do PDV (orderSource
 * 'pdv'/indefinido) continua em competência — sem dupla contagem.
 */
export function isManualDebtSale(sale: Sale): boolean {
  return !!sale && sale.orderSource === 'fiado';
}

/**
 * Soma recebimentos de dívidas manuais no escopo (filial + período).
 * Agrupa pagamentos por venda e limita cada venda ao próprio fiado
 * (espelha o teto actualPaid do Fiados — dado anômalo não infla o total).
 * `isInScope` recebe a data ISO do pagamento e diz se entra no período.
 */
export function sumManualDebtReceived(
  sales: Sale[],
  creditPayments: CreditPayment[],
  branchId: string,
  isInScope: (isoDate: string) => boolean,
): number {
  const manualById = new Map<string, Sale>();
  for (const s of sales || []) {
    if (isManualDebtSale(s) && s.status === 'completed' && s.storeBranchId === branchId) {
      manualById.set(s.id, s);
    }
  }
  if (manualById.size === 0) return 0;
  const paidBySale = new Map<string, number>();
  for (const cp of creditPayments || []) {
    const sale = manualById.get(cp.saleId);
    if (!sale) continue;
    if (cp.storeBranchId && cp.storeBranchId !== branchId) continue;
    if (!cp.date || !isInScope(cp.date)) continue;
    paidBySale.set(cp.saleId, (paidBySale.get(cp.saleId) || 0) + (cp.amount || 0));
  }
  let received = 0;
  for (const [saleId, paid] of paidBySale) {
    const sale = manualById.get(saleId)!;
    const fiado = (sale.payments || [])
      .filter((p) => p.method === 'credit_account')
      .reduce((sum, p) => sum + (p.amount || 0), 0);
    received += Math.min(Math.max(0, Math.round(paid * 100) / 100), Math.max(0, Math.round(fiado * 100) / 100));
  }
  return Math.round(received * 100) / 100;
}

export function calculateFinanceSummary(
  sales: Sale[],
  products: Product[],
  branchId: string,
  period: FinancePeriod = 'day',
  reference = new Date(),
  dateRange?: DateRange,
  creditPayments: CreditPayment[] = [],
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
    costOfGoodsSold: 0, productProfit: 0, byProduct: [], manualDebtReceived: 0,
  };
  const byProduct = new Map<string, ProductProfitLine>();

  for (const sale of sales) {
    const date = new Date(sale.date);
    if (isManualDebtSale(sale)) continue; // caixa: só conta quando receber
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
  // Recebimento de dívidas manuais no mesmo período (regime de caixa).
  // Venda fiado normal conta no lançamento (competência) e seu pagamento NÃO
  // entra aqui (só vendas orderSource 'fiado') — sem dupla contagem.
  const manualDebtReceived = sumManualDebtReceived(
    sales, creditPayments, branchId,
    (iso) => {
      const t = new Date(iso).getTime();
      return !Number.isNaN(t) && t >= start.getTime() && t <= end.getTime();
    },
  );
  result.manualDebtReceived = manualDebtReceived;
  result.total = Math.round((result.total + manualDebtReceived) * 100) / 100;
  result.productProfit = result.total - result.costOfGoodsSold;
  // Ordena do MAIOR prejuízo (lucro mais negativo) para o maior lucro.
  result.byProduct = Array.from(byProduct.values()).sort((a, b) => a.profit - b.profit);
  return result;
}
