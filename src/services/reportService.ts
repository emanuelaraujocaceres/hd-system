import { supabase } from '../lib/supabase';
import { storageService } from './storageService';
import { PaymentDetails } from '../types';

/**
 * reportService — Relatório Gerencial (Frente 5).
 *
 * Fonte: view `vw_report_sale_items` (sale_items + sales + products +
 * system_users), consultada com o JWT do usuário autenticado (security_invoker
 * + RLS escopam por organização/filial).
 *
 * Saídas:
 *  - PDF  → HTML A4 estilizado em janela nova + window.print() (o navegador
 *           renderiza o PDF com qualidade máxima — mesmo padrão dos rótulos).
 *  - CSV  → detalhamento bruto com BOM UTF-8 e separador ';' (Excel pt-BR).
 *
 * Tudo client-side: sem Pages Function, sem deploy.
 */

export interface ReportFilters {
  /**
   * Limite inicial do filtro. Aceita "YYYY-MM-DD" (apenas data, inclusive) ou
   * "YYYY-MM-DDTHH:mm" (datetime local, do input datetime-local) — com hora, o
   * relatório passa a filtrar por instante exato (ex.: de 14h até 18h).
   */
  startDate: string;
  /** Limite final — mesmo formato de startDate (com hora, usa o instante da hora). */
  endDate: string;
  paymentMethod: string; // '' = todas
  operatorId: string; // '' = todos
  includeCancelled: boolean;
}

export interface ReportRow {
  saleId: string;
  saleDate: string; // ISO timestamp
  saleStatus: string;
  paymentMethod: string; // método legado (1º pagamento) — p/ compatibilidade
  payments: PaymentDetails[];
  operatorId: string;
  operatorName: string;
  customerId: string | null;
  customerName: string | null;
  saleTotal: number;
  itemId: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  itemTotal: number;
  itemDiscount: number;
  categoryName: string | null;
  productCost: number; // custo unitário do produto (atual) — p/ cálculo de lucro
  itemCost: number; // productCost * quantity
}

export interface ReportSale {
  id: string;
  date: string;
  status: string;
  paymentMethod: string;
  operatorName: string;
  customerName: string | null;
  total: number;
  itemCount: number;
}

export interface PaymentSummary {
  method: string;
  label: string;
  count: number;
  total: number;
}

export interface OperatorSummary {
  name: string;
  count: number;
  total: number;
}

export interface CategorySummary {
  name: string;
  count: number;
  items: number;
  total: number;
}

export interface ProductSummary {
  name: string;
  category: string | null;
  quantity: number;
  total: number;
  discount: number;
}

export interface ReportModel {
  rows: ReportRow[];
  sales: ReportSale[];
  dayGranularity: 'dia' | 'semana';
  kpis: {
    revenue: number;
    saleCount: number;
    itemsSold: number;
    discountTotal: number;
    costTotal: number; // custo dos produtos vendidos (productCost * quantity)
    netProfit: number; // lucro líquido = revenue − costTotal
  };
  byDay: { label: string; total: number }[];
  byPayment: PaymentSummary[];
  byOperator: OperatorSummary[];
  byCategory: CategorySummary[];
  productRanking: ProductSummary[];
}

export interface ReportMeta {
  companyName: string;
  branchName: string;
  branchCity: string;
  branchState: string;
  startDate: string;
  endDate: string;
  generatedAt: string;
  generatedBy: string;
  filters: { paymentMethod: string; operatorName: string; includeCancelled: boolean };
}

// ── Formatação pt-BR ────────────────────────────────────────────────────────
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const num = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Dinheiro',
  pix: 'PIX',
  credit_card: 'Cartão de Crédito',
  debit_card: 'Cartão de Débito',
  credit_account: 'Fiado / Crédito',
};

export function paymentLabel(method: string): string {
  return PAYMENT_LABELS[method] || method || '—';
}

// Extrai o array de pagamentos da venda a partir do payments_json (coluna da
// view) ou do payment_method legado. Suporta vendas com pagamento dividido
// (split) em vários métodos — essencial para o breakdown por forma de pagamento.
function parsePayments(raw: any): PaymentDetails[] {
  if (Array.isArray(raw)) return raw.filter((p) => p && p.amount != null);
  if (typeof raw === 'string') {
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr.filter((p) => p && p.amount != null);
    } catch {
      /* ignora payload inválido */
    }
  }
  return [];
}

// Soma o total recebido em cada forma de pagamento a partir dos payment details
// (pagamentos completos da venda). Difere do payment_method legado, que só
// guarda UM método por venda.
function paymentMethodTotals(payments: PaymentDetails[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const p of payments) {
    const method = p.method || 'cash';
    totals.set(method, (totals.get(method) || 0) + (Number(p.amount) || 0));
  }
  return totals;
}

function toISODate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

function nextDay(iso: string): string {
  return addDays(iso, 1);
}

function fmtDate(iso: string): string {
  const d = iso.length === 10 ? new Date(`${iso}T12:00:00`) : new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('pt-BR');
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

// True quando o valor carrega hora (datetime local "YYYY-MM-DDTHH:mm"), não só data.
export function hasTime(value: string): boolean {
  return value.includes('T') || value.includes(' ');
}

// Converte "YYYY-MM-DD" (apenas data) ou "YYYY-MM-DDTHH:mm[:ss]" (datetime local)
// em um Date — para datetime, o navegador interpreta como hora LOCAL.
export function parseISODate(value: string): Date | null {
  const d = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return isNaN(d.getTime()) ? null : d;
}

// Converte um limite (data pura ou datetime local) em timestamp UTC comparável
// com sale_date (timestamptz guardado em UTC). Data pura é tratada como começo
// (00:00:00) ou fim (23:59:59.999) do dia local. Datetime local SEM segundos
// ("YYYY-MM-DDTHH:mm") no limite FINAL inclui o minuto inteiro (ex.: "até 23:59"
// deve alcançar vendas às 23:59:30) — senão venda no último minuto com segundos
// > 0 escapava do período.
export function toUtcBoundary(value: string, isEnd: boolean): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const d = new Date(isEnd ? `${value}T23:59:59.999` : `${value}T00:00:00`);
    return d.toISOString();
  }
  let v = value;
  if (isEnd && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    v = `${value}:59.999`;
  }
  const d = new Date(v);
  return d.toISOString();
}

// Exibição do limite: "dd/mm/aaaa" (só data) ou "dd/mm/aaaa hh:mm" (com hora).
export function fmtBoundary(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return fmtDate(value);
  const d = parseISODate(value);
  if (!d) return value;
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

// ── Consulta + agregação ────────────────────────────────────────────────────
export async function fetchReport(filters: ReportFilters): Promise<{ model: ReportModel; meta: ReportMeta }> {
  const orgId = storageService.getCurrentOrgId();
  const branchId = storageService.getSelectedBranchId();
  if (!orgId || !branchId) {
    throw new Error('Selecione uma filial antes de gerar o relatório.');
  }
  const settings = storageService.getSettings();
  const branch = storageService.getSelectedBranch();

  let query = supabase
    .from('vw_report_sale_items')
    .select('*')
    .eq('organization_id', orgId)
    .eq('store_branch_id', branchId);

  // Sem hora informada → mantém o comportamento anterior (apenas datas, com
  // próximo dia exclusivo). Com hora em qualquer dos limites → usa o instante
  // exato (datetime local→UTC), permitindo filtrar por faixa horária.
  if (!hasTime(filters.startDate) && !hasTime(filters.endDate)) {
    query = query
      .gte('sale_date', filters.startDate)
      .lt('sale_date', nextDay(filters.endDate));
  } else {
    query = query
      .gte('sale_date', toUtcBoundary(filters.startDate, false))
      .lte('sale_date', toUtcBoundary(filters.endDate, true));
  }
  query = query.order('sale_date', { ascending: true });

  const { data, error } = await query;

  if (error) throw new Error(`Falha ao buscar dados do relatório: ${error.message}`);

  const raw = (data || []) as any[];

  // Mapeia primeiro (custo e payments são derivados das colunas novas da view),
  // depois aplica os filtros client-side — incluindo pagamento com suporte a
  // split (uma venda pode ter dinheiro + débito + crédito juntos).
  let rows: ReportRow[] = raw
    .map((r) => {
      const payments = parsePayments(r.payments_json);
      const quantity = Number(r.quantity) || 0;
      const productCost = Number(r.product_cost) || 0;
      return {
        saleId: r.sale_id,
        saleDate: r.sale_date,
        saleStatus: r.sale_status,
        paymentMethod: r.payment_method || payments[0]?.method || 'cash',
        payments,
        operatorId: r.operator_id || '',
        operatorName: r.operator_name || '—',
        customerId: r.customer_id || null,
        customerName: r.customer_name || null,
        saleTotal: Number(r.sale_total) || 0,
        itemId: r.item_id,
        productId: r.product_id || '',
        productName: r.product_name || '—',
        quantity,
        unitPrice: Number(r.unit_price) || 0,
        itemTotal: Number(r.item_total) || 0,
        itemDiscount: Number(r.item_discount) || 0,
        categoryName: r.category_name || null,
        productCost,
        itemCost: productCost * quantity,
      };
    })
    .filter((r) => {
      if (!filters.includeCancelled && r.saleStatus === 'cancelled') return false;
      if (r.saleStatus === 'pending') return false;
      if (filters.paymentMethod && !r.payments.some((p) => p.method === filters.paymentMethod)) return false;
      if (filters.operatorId && r.operatorId !== filters.operatorId) return false;
      return true;
    });

  // Vendas únicas (sale_total repete por item).
  const salesById = new Map<string, ReportSale>();
  for (const r of rows) {
    const existing = salesById.get(r.saleId);
    if (existing) {
      existing.itemCount += r.quantity;
    } else {
      salesById.set(r.saleId, {
        id: r.saleId,
        date: r.saleDate,
        status: r.saleStatus,
        paymentMethod: r.paymentMethod,
        operatorName: r.operatorName,
        customerName: r.customerName,
        total: r.saleTotal,
        itemCount: r.quantity,
      });
    }
  }
  const sales = Array.from(salesById.values());

  const completed = sales.filter((s) => s.status === 'completed');
  const revenue = completed.reduce((acc, s) => acc + s.total, 0);
  const saleCount = completed.length;
  const itemsSold = rows.reduce((acc, r) => acc + r.quantity, 0);
  const discountTotal = rows.reduce((acc, r) => acc + r.itemDiscount, 0);
  // Custo dos produtos vendidos e lucro líquido (faturamento − custo).
  const costTotal = rows.reduce((acc, r) => acc + r.itemCost, 0);
  const netProfit = revenue - costTotal;
  // Pagamentos por venda (uma venda pode ter várias formas — split).
  const salePayments = new Map<string, PaymentDetails[]>();
  for (const r of rows) {
    if (!salePayments.has(r.saleId)) salePayments.set(r.saleId, r.payments);
  }

  // Vendas por dia (ou por semana quando o período passa de 31 dias).
  const startCal = parseISODate(filters.startDate);
  const endCal = parseISODate(filters.endDate);
  const days = Math.max(1, Math.round(((endCal ? endCal.getTime() : Date.now()) - (startCal ? startCal.getTime() : Date.now())) / 86400000) + 1);
  const byDay: { label: string; total: number }[] = [];
  if (days <= 31) {
    const dayMap = new Map<string, number>();
    for (const s of completed) {
      const key = toISODate(new Date(s.date));
      dayMap.set(key, (dayMap.get(key) || 0) + s.total);
    }
    for (let i = 0; i < days; i++) {
      const key = addDays(filters.startDate, i);
      byDay.push({ label: fmtDate(key), total: dayMap.get(key) || 0 });
    }
  } else {
    // Semanas (segunda a domingo) — bucket pela data do início de cada semana.
    const weekMap = new Map<string, number>();
    for (const s of completed) {
      const d = new Date(s.date);
      const day = (d.getDay() + 6) % 7; // segunda = 0
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - day);
      const key = toISODate(weekStart);
      weekMap.set(key, (weekMap.get(key) || 0) + s.total);
    }
    const sortedKeys = Array.from(weekMap.keys()).sort();
    for (const key of sortedKeys) {
      const end = addDays(key, 6);
      byDay.push({ label: `${fmtDate(key)}–${fmtDate(end)}`, total: weekMap.get(key) || 0 });
    }
  }

  // Formas de pagamento (suporta venda com split em vários métodos).
  const payMap = new Map<string, PaymentSummary>();
  for (const s of completed) {
    const pays = salePayments.get(s.id) || [];
    const totals = paymentMethodTotals(pays);
    if (totals.size === 0) {
      // Venda sem payments_json → usa o método legado com o total da venda.
      const m = s.paymentMethod || 'cash';
      const cur = payMap.get(m) || { method: m, label: paymentLabel(m), count: 0, total: 0 };
      cur.count += 1;
      cur.total += s.total;
      payMap.set(m, cur);
      continue;
    }
    for (const [m, amount] of totals) {
      const cur = payMap.get(m) || { method: m, label: paymentLabel(m), count: 0, total: 0 };
      cur.count += 1;
      cur.total += amount;
      payMap.set(m, cur);
    }
  }
  const byPayment = Array.from(payMap.values()).sort((a, b) => b.total - a.total);

  // Operadores.
  const opMap = new Map<string, OperatorSummary>();
  for (const s of completed) {
    const cur = opMap.get(s.operatorName) || { name: s.operatorName, count: 0, total: 0 };
    cur.count += 1;
    cur.total += s.total;
    opMap.set(s.operatorName, cur);
  }
  const byOperator = Array.from(opMap.values()).sort((a, b) => b.total - a.total);

  // Categorias.
  const catMap = new Map<string, CategorySummary>();
  for (const r of rows) {
    const name = r.categoryName || 'Sem categoria';
    const cur = catMap.get(name) || { name, count: 0, items: 0, total: 0 };
    cur.count += 1;
    cur.items += r.quantity;
    cur.total += r.itemTotal;
    catMap.set(name, cur);
  }
  const byCategory = Array.from(catMap.values()).sort((a, b) => b.total - a.total);

  // Ranking de produtos.
  const prodMap = new Map<string, ProductSummary>();
  for (const r of rows) {
    const cur = prodMap.get(r.productId) || { name: r.productName, category: r.categoryName, quantity: 0, total: 0, discount: 0 };
    cur.quantity += r.quantity;
    cur.total += r.itemTotal;
    cur.discount += r.itemDiscount;
    prodMap.set(r.productId, cur);
  }
  const productRanking = Array.from(prodMap.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  const model: ReportModel = {
    rows,
    sales,
    dayGranularity: days <= 31 ? 'dia' : 'semana',
    kpis: { revenue, saleCount, itemsSold, discountTotal, costTotal, netProfit },
    byDay,
    byPayment,
    byOperator,
    byCategory,
    productRanking,
  };

  const meta: ReportMeta = {
    companyName: settings.companyName || 'HD-System',
    branchName: branch.name,
    branchCity: branch.city,
    branchState: branch.state,
    startDate: fmtBoundary(filters.startDate),
    endDate: fmtBoundary(filters.endDate),
    generatedAt: fmtDateTime(new Date().toISOString()),
    generatedBy: storageService.getUserProfile()?.email || '',
    filters: {
      paymentMethod: filters.paymentMethod ? paymentLabel(filters.paymentMethod) : 'Todas',
      operatorName: '',
      includeCancelled: filters.includeCancelled,
    },
  };

  return { model, meta };
}

// ── CSV ─────────────────────────────────────────────────────────────────────
function csvCell(value: string | number | null): string {
  if (value === null || value === undefined) return '';
  // Números em formato pt-BR ("86,80") — com separador ';' e BOM, o Excel
  // pt-BR interpreta as células como NÚMERO. Decimal com ponto vira texto.
  const s = typeof value === 'number' ? num.format(value) : String(value);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadCsv(model: ReportModel, meta: ReportMeta): void {
  const header = [
    'Data', 'Hora', 'Status', 'Pagamento', 'Operador', 'Cliente', 'Produto', 'Categoria',
    'Quantidade', 'Preço Venda Unit.', 'Total Item', 'Custo Unit.', 'Custo Item', 'Lucro Item', 'Desconto', 'Total Venda',
  ];
  const lines = [header.join(';')];
  for (const r of model.rows) {
    const d = new Date(r.saleDate);
    lines.push([
      d.toLocaleDateString('pt-BR'),
      d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      r.saleStatus === 'cancelled' ? 'Cancelada' : 'Concluída',
      paymentLabel(r.paymentMethod),
      r.operatorName,
      r.customerName || '',
      r.productName,
      r.categoryName || '',
      r.quantity,
      r.unitPrice,
      r.itemTotal,
      r.productCost,
      r.itemCost,
      r.itemTotal - r.itemCost,
      r.itemDiscount,
      r.saleTotal,
    ].map(csvCell).join(';'));
  }

  const bom = '\uFEFF';
  const blob = new Blob([bom + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  // Sanitiza o nome (garante validade no Windows, onde ':' e espaços são inválidos).
  const safeName = (s: string) => s.replace(/[/:\s]/g, '-');
  a.download = `relatorio-gerencial-${safeName(meta.startDate)}-a-${safeName(meta.endDate)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── PDF (HTML A4 + window.print) ────────────────────────────────────────────
const esc = (s: string | null | undefined): string =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function pct(part: number, total: number): string {
  return total > 0 ? `${((part / total) * 100).toFixed(1)}%` : '0%';
}

function buildHtml(model: ReportModel, meta: ReportMeta): string {
  const { kpis, byDay, byPayment, byOperator, byCategory, productRanking, sales } = model;

  // Gráfico de barras: altura proporcional ao maior dia.
  const maxDay = Math.max(1, ...byDay.map((b) => b.total));
  const bars = byDay
    .map((b) => {
      const h = Math.max(2, Math.round((b.total / maxDay) * 160));
      return `
      <div class="bar-col">
        <div class="bar-val">${b.total > 0 ? brl.format(b.total) : ''}</div>
        <div class="bar" style="height:${h}px;${b.total === 0 ? 'background:#e4e4e7;' : ''}"></div>
        <div class="bar-label">${esc(b.label)}</div>
      </div>`;
    })
    .join('');

  const maxPay = Math.max(1, ...byPayment.map((p) => p.total));
  const payments = byPayment
    .map((p) => {
      const w = Math.round((p.total / maxPay) * 100);
      return `
      <tr>
        <td class="pname">${esc(p.label)}</td>
        <td class="pbar-cell"><div class="pbar-track"><div class="pbar" style="width:${Math.max(2, w)}%"></div></div></td>
        <td class="pnum">${p.count} venda${p.count === 1 ? '' : 's'}</td>
        <td class="pnum strong">${brl.format(p.total)}</td>
        <td class="pnum muted">${pct(p.total, kpis.revenue)}</td>
      </tr>`;
    })
    .join('');

  const operators = byOperator
    .map((o) => `
      <tr>
        <td>${esc(o.name)}</td>
        <td class="num">${o.count}</td>
        <td class="num">${brl.format(o.total)}</td>
      </tr>`)
    .join('');

  const categories = byCategory
    .map((c) => `
      <tr>
        <td>${esc(c.name)}</td>
        <td class="num">${c.items}</td>
        <td class="num">${brl.format(c.total)}</td>
        <td class="num muted">${pct(c.total, kpis.revenue)}</td>
      </tr>`)
    .join('');

  const ranking = productRanking
    .map((p, i) => `
      <tr>
        <td class="num rank">${i + 1}º</td>
        <td>${esc(p.name)}</td>
        <td class="muted">${esc(p.category || '—')}</td>
        <td class="num">${p.quantity}</td>
        <td class="num">${brl.format(p.total)}</td>
        <td class="num muted">${p.discount > 0 ? brl.format(p.discount) : '—'}</td>
      </tr>`)
    .join('');

  const saleRows = sales
    .map((s) => `
      <tr class="${s.status === 'cancelled' ? 'cancelled' : ''}">
        <td class="num">${fmtDateTime(s.date)}</td>
        <td>${esc(s.operatorName)}</td>
        <td class="muted">${esc(s.customerName || '—')}</td>
        <td>${esc(paymentLabel(s.paymentMethod))}</td>
        <td class="num">${s.itemCount}</td>
        <td class="num">${brl.format(s.total)}</td>
        <td class="muted">${s.status === 'cancelled' ? 'CANCELADA' : ''}</td>
      </tr>`)
    .join('');

  const filterLine = [
    `Período: <strong>${esc(meta.startDate)} a ${esc(meta.endDate)}</strong>`,
    `Pagamento: <strong>${esc(meta.filters.paymentMethod)}</strong>`,
    meta.filters.includeCancelled ? 'Inclui canceladas' : 'Sem canceladas',
  ].join(' &nbsp;•&nbsp; ');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<title>Relatório Gerencial — ${esc(meta.companyName)}</title>
<style>
  @page { size: A4; margin: 12mm 10mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #18181b; margin: 0; font-size: 10px; }
  .page { max-width: 190mm; margin: 0 auto; }
  header.report { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 10px; border-bottom: 3px solid #4f46e5; margin-bottom: 14px; }
  .brand { display: flex; align-items: center; gap: 10px; }
  .brand img { width: 40px; height: 40px; border-radius: 10px; }
  .brand h1 { font-size: 17px; margin: 0; letter-spacing: -0.3px; }
  .brand p { margin: 1px 0 0; font-size: 10px; color: #52525b; font-weight: 600; }
  .meta { text-align: right; font-size: 9.5px; color: #52525b; line-height: 1.55; }
  .meta strong { color: #18181b; }
  .chip { display: inline-block; background: #eef2ff; color: #4338ca; font-weight: 700; padding: 2px 8px; border-radius: 999px; font-size: 9px; }
  .filters { font-size: 9.5px; color: #52525b; margin: -6px 0 14px; }
  .kpis { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; margin-bottom: 16px; }
  .kpi { border: 1px solid #e4e4e7; border-radius: 10px; padding: 8px 10px; }
  .kpi .label { font-size: 8px; text-transform: uppercase; letter-spacing: 0.6px; color: #71717a; font-weight: 700; }
  .kpi .value { font-size: 13.5px; font-weight: 800; margin-top: 3px; }
  .kpi .sub { font-size: 8px; color: #a1a1aa; margin-top: 2px; }
  h2.sec { font-size: 11px; margin: 16px 0 8px; display: flex; align-items: center; gap: 6px; color: #1e1b4b; }
  h2.sec::after { content: ''; flex: 1; height: 1px; background: #e4e4e7; }
  .chart { display: flex; align-items: flex-end; gap: 3px; height: 200px; padding: 6px 2px 0; border-bottom: 1px solid #e4e4e7; }
  .bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; }
  .bar-val { font-size: 7.5px; color: #71717a; transform: rotate(-45deg); transform-origin: bottom right; white-space: nowrap; margin-bottom: 2px; max-width: 30px; overflow: hidden; }
  .bar { width: 70%; max-width: 22px; background: linear-gradient(180deg, #6366f1, #4f46e5); border-radius: 3px 3px 0 0; }
  .bar-label { font-size: 7px; color: #71717a; margin-top: 3px; white-space: nowrap; transform: rotate(-45deg); transform-origin: top left; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
  th { font-size: 8px; text-transform: uppercase; letter-spacing: 0.5px; color: #71717a; text-align: left; padding: 5px 6px; border-bottom: 1.5px solid #d4d4d8; }
  td { padding: 4.5px 6px; border-bottom: 1px solid #f4f4f5; font-size: 9.5px; }
  tr:nth-child(even) td { background: #fafafa; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .strong { font-weight: 700; }
  .muted { color: #71717a; }
  .rank { color: #4f46e5; font-weight: 800; }
  .cancelled td { color: #9ca3af; text-decoration: line-through; }
  .pbar-track { background: #f4f4f5; border-radius: 999px; height: 10px; width: 100%; }
  .pbar { height: 10px; border-radius: 999px; background: linear-gradient(90deg, #6366f1, #8b5cf6); }
  .pbar-cell { width: 40%; }
  .pname { font-weight: 600; white-space: nowrap; }
  .pnum { text-align: right; white-space: nowrap; }
  footer.report { margin-top: 22px; padding-top: 8px; border-top: 1px solid #e4e4e7; display: flex; justify-content: space-between; font-size: 8.5px; color: #a1a1aa; }
  .no-print { position: fixed; top: 10px; right: 10px; z-index: 99; }
  .no-print button { background: #4f46e5; color: #fff; border: 0; border-radius: 8px; padding: 10px 16px; font-weight: 700; cursor: pointer; font-size: 12px; }
  @media print { .no-print { display: none; } }
</style>
</head>
<body>
  <div class="no-print"><button onclick="window.print()">🖨️ Imprimir / Salvar PDF</button></div>
  <div class="page">
    <header class="report">
      <div class="brand">
        <img src="/logo-hd-system/android-chrome-192x192.png" alt="" />
        <div>
          <h1>${esc(meta.companyName)}</h1>
          <p>HD-System — Relatório Gerencial de Vendas</p>
          <p><span class="chip">${esc(meta.branchName)} · ${esc(meta.branchCity)}-${esc(meta.branchState)}</span></p>
        </div>
      </div>
      <div class="meta">
        <div><strong>${esc(meta.startDate)} a ${esc(meta.endDate)}</strong></div>
        <div>Gerado em ${esc(meta.generatedAt)}</div>
        <div>Por ${esc(meta.generatedBy)}</div>
      </div>
    </header>

    <p class="filters">${filterLine}</p>

    <section class="kpis">
      <div class="kpi"><div class="label">Faturamento</div><div class="value" style="color:#059669">${brl.format(kpis.revenue)}</div><div class="sub">Vendas concluídas</div></div>
      <div class="kpi"><div class="label">Vendas</div><div class="value">${kpis.saleCount}</div><div class="sub">No período</div></div>
      <div class="kpi"><div class="label">Itens Vendidos</div><div class="value">${kpis.itemsSold}</div><div class="sub">Unidades no período</div></div>
      <div class="kpi"><div class="label">Descontos</div><div class="value" style="color:#d97706">${brl.format(kpis.discountTotal)}</div><div class="sub">Concedidos no período</div></div>
      <div class="kpi"><div class="label">Custo dos Produtos</div><div class="value" style="color:#b45309">${brl.format(kpis.costTotal)}</div><div class="sub">Custo de compra dos vendidos</div></div>
      <div class="kpi"><div class="label">Lucro Líquido</div><div class="value" style="color:${kpis.netProfit >= 0 ? '#059669' : '#dc2626'}">${brl.format(kpis.netProfit)}</div><div class="sub">Faturamento − custo dos produtos</div></div>
    </section>

    <h2 class="sec">📈 Vendas por ${model.dayGranularity === 'semana' ? 'Semana' : 'Dia'}</h2>
    <div class="chart">${bars}</div>

    <h2 class="sec">💳 Formas de Pagamento</h2>
    <table>
      <tr><th>Forma</th><th>Participação</th><th style="text-align:right">Vendas</th><th style="text-align:right">Valor</th><th style="text-align:right">% do total</th></tr>
      ${payments || '<tr><td colspan="5" class="muted">Sem vendas no período.</td></tr>'}
    </table>

    <h2 class="sec">👤 Desempenho por Operador</h2>
    <table>
      <tr><th>Operador</th><th style="text-align:right">Vendas</th><th style="text-align:right">Faturamento</th></tr>
      ${operators || '<tr><td colspan="3" class="muted">Sem vendas no período.</td></tr>'}
    </table>

    <h2 class="sec">📦 Vendas por Categoria</h2>
    <table>
      <tr><th>Categoria</th><th style="text-align:right">Itens</th><th style="text-align:right">Valor</th><th style="text-align:right">% do total</th></tr>
      ${categories || '<tr><td colspan="4" class="muted">Sem itens no período.</td></tr>'}
    </table>

    <h2 class="sec">🏆 Top 10 Produtos</h2>
    <table>
      <tr><th>#</th><th>Produto</th><th>Categoria</th><th style="text-align:right">Qtd</th><th style="text-align:right">Valor</th><th style="text-align:right">Desconto</th></tr>
      ${ranking || '<tr><td colspan="6" class="muted">Sem produtos no período.</td></tr>'}
    </table>

    <h2 class="sec">🧾 Detalhamento de Vendas</h2>
    <table>
      <tr><th>Data/Hora</th><th>Operador</th><th>Cliente</th><th>Pagamento</th><th style="text-align:right">Itens</th><th style="text-align:right">Total</th><th></th></tr>
      ${saleRows || '<tr><td colspan="7" class="muted">Sem vendas no período.</td></tr>'}
    </table>

    <footer class="report">
      <div>Gerado pelo HD-System · ${esc(meta.generatedAt)} · Por ${esc(meta.generatedBy)}</div>
      <div>Fonte: vw_report_sale_items · Filial ${esc(meta.branchName)}</div>
    </footer>
  </div>
</body>
</html>`;
}

export function openPrintReport(model: ReportModel, meta: ReportMeta): void {
  const w = window.open('', '_blank', 'width=1100,height=820');
  if (!w) {
    throw new Error('Seu navegador bloqueou a janela do relatório. Permita pop-ups para este site e tente novamente.');
  }
  w.document.open();
  w.document.write(buildHtml(model, meta));
  w.document.close();
  w.focus();
  // Aguarda o render das fontes/imagens antes de abrir a impressão.
  setTimeout(() => {
    try { w.print(); } catch { /* usuário imprime pelo botão na própria página */ }
  }, 450);
}
