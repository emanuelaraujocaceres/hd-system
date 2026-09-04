import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Skeleton, TableSkeleton } from '../shared/Skeleton';
import {
  AlertTriangle,
  Package,
  ArrowUpRight,
  Trash2,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  PieChart,
  CreditCard,
  Calendar,
  Clock,
  Flame,
} from 'lucide-react';
import { Product, ProductLot, Sale, UserProfile, FinancialAccount } from '../../types';
import { storageService } from '../../services/storageService';
import { CollaboratorPerformance } from './CollaboratorPerformance';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { DateTimeRangeFilter } from '../shared/DateTimeRangeFilter';
import { useToast } from '../shared/Toast';

import { posAudio } from '../../services/audioService';
import { friendlyErrorMessage } from '../../lib/friendlyError';
import { printSaleReceipt } from '../../services/printService';

async function reprintSaleReceipt(sale: Sale) {
  try {
    const printers = storageService.getPrinters();
    const settings = storageService.getSettings();
    await printSaleReceipt(sale, settings, printers, { type: 'venda' });
  } catch { /* silencioso */ }
}

interface DashboardViewProps {
  sales: Sale[];
  products: Product[];
  user: UserProfile;
  financialAccounts: FinancialAccount[];
  onNavigateTab: (tab: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  sales,
  products,
  user,
  financialAccounts,
  onNavigateTab,
}) => {
  const isAdmin = user.role === 'admin' || !!user.superadmin;
  const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const todayStr = new Date().toISOString().slice(0, 10);
  // Filtro temporal de faturamento: Data/Hora Inicial e Final escolhidas pelo
  // usuário. Padrão = hoje (00:00 → 23:59 local), como no histórico de vendas.
  const todayStart = `${todayStr}T00:00`;
  const todayEnd = `${todayStr}T23:59`;
  const [dateFrom, setDateFrom] = useState<string>(todayStart);
  const [dateTo, setDateTo] = useState<string>(todayEnd);
  const [confirmDeleteSale, setConfirmDeleteSale] = useState<Sale | null>(null);
  const { addToast } = useToast();

  const getSaleTotal = (s: Sale) => {
    if (s.total > 0) return s.total;
    const itemsTotal = s.items?.reduce((sum, item) => sum + (item.total || 0), 0) || 0;
    return itemsTotal;
  };

  const lowStockCount = products.filter((p) => p.currentStock <= p.minStock).length;

  // ── ALERTAS DE VALIDADE ──────────────────────────────────────
  // Produtos sem lote: usa expirationDate do produto
  // Produtos com useLots=true: usa expirationDate dos lotes ativos
  const today = new Date();
  const thirtyDaysFromNow = new Date(today);
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

  // Lotes ativos de todos os produtos
  const allActiveLots = useMemo(() => {
    return storageService.getProductLots().filter(l => l.status === 'active');
  }, []);

  // Produtos com lote controlado
  const useLotsProductIds = useMemo(() =>
    products.filter(p => p.useLots).map(p => p.id),
    [products]
  );

  // Lotes vencidos (expirationDate < hoje)
  const expiredLots = useMemo(() =>
    allActiveLots.filter(l => {
      if (!l.expirationDate) return false;
      return new Date(l.expirationDate + 'T23:59:59') < today;
    }),
    [allActiveLots]
  );

  // Lotes próximos ao vencimento (30 dias)
  const expiringLots = useMemo(() =>
    allActiveLots.filter(l => {
      if (!l.expirationDate) return false;
      const d = new Date(l.expirationDate + 'T23:59:59');
      return d >= today && d <= thirtyDaysFromNow;
    }).sort((a, b) => (a.expirationDate || '').localeCompare(b.expirationDate || '')),
    [allActiveLots]
  );

  // Produtos SEM lote controlado — vencidos
  const expiredProducts = useMemo(() =>
    products.filter((p) => {
      if (p.useLots || !p.expirationDate || !p.active) return false;
      const expDate = new Date(p.expirationDate + 'T23:59:59');
      return expDate < today;
    }),
    [products]
  );

  // Produtos SEM lote controlado — próximos ao vencimento
  const expiringProducts = useMemo(() =>
    products.filter((p) => {
      if (p.useLots || !p.expirationDate || !p.active) return false;
      const expDate = new Date(p.expirationDate + 'T23:59:59');
      return expDate >= today && expDate <= thirtyDaysFromNow;
    }).sort((a, b) => new Date(a.expirationDate!).getTime() - new Date(b.expirationDate!).getTime()),
    [products]
  );

  // Resumo de lotes para KPI
  const lotSummary = useMemo(() => {
    const activeLots = allActiveLots.filter(l => l.quantity > 0);
    return {
      totalActive: activeLots.length,
      expired: expiredLots.length,
      expiring: expiringLots.length,
      disposed: storageService.getProductLots().filter(l => l.status === 'disposed').length,
    };
  }, [allActiveLots, expiredLots, expiringLots]);

  // Helper: buscar nome do produto pelo ID
  const getProductName = (id: string) => products.find(p => p.id === id)?.name || id;

  // ── TOP SELLING PRODUCTS THIS MONTH ────────────────────────────
  // Agrega itens de vendas do mês atual, agrupa por produto, soma
  // quantidades e retorna os TOP 3 mais vendidos.
  const topSellingProducts = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    // Filtrar vendas do mês atual (apenas completadas)
    const monthSales = sales.filter((s) => {
      if (s.status !== 'completed') return false;
      const d = new Date(s.date);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });
    // Agregar quantidades por productId
    const qtyByProduct = new Map<string, { name: string; qty: number }>();
    for (const sale of monthSales) {
      for (const item of sale.items || []) {
        const existing = qtyByProduct.get(item.productId);
        if (existing) {
          existing.qty += item.quantity;
        } else {
          qtyByProduct.set(item.productId, { name: item.productName, qty: item.quantity });
        }
      }
    }
    // Ordenar por quantidade desc e pegar TOP 3
    return Array.from(qtyByProduct.values())
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 3);
  }, [sales]);

  // ── Filtro temporal de faturamento (Data Inicial/Final) ─────────
  // Considera apenas vendas COMPLETADAS dentro do intervalo escolhido.
  const periodSales = useMemo(() => {
    return sales.filter((s) => {
      if (s.status !== 'completed') return false;
      const saleTs = new Date(s.date).getTime();
      if (dateFrom) {
        const fromTs = new Date(dateFrom).getTime();
        if (!Number.isNaN(fromTs) && saleTs < fromTs) return false;
      }
      if (dateTo) {
        const toTs = new Date(dateTo).getTime();
        if (!Number.isNaN(toTs) && saleTs > toTs) return false;
      }
      return true;
    });
  }, [sales, dateFrom, dateTo]);

  const periodRevenue = periodSales.reduce((acc, s) => acc + getSaleTotal(s), 0);

  // ── LUCRO POR FORMA DE PAGAMENTO ────────────────────────────────
  // Para cada venda completada no intervalo, o custo dos itens vendidos é
  // rateado entre as formas de pagamento na mesma proporção dos valores
  // pagos (suporta split). Lucro por forma = valor pago − custo rateado.
  const productsById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const profitByPayment = useMemo(() => {
    const methods = [
      { key: 'cash', label: 'Dinheiro' },
      { key: 'pix', label: 'PIX' },
      { key: 'debit_card', label: 'Cartão de Débito' },
      { key: 'credit_card', label: 'Cartão de Crédito' },
    ];
    const totals: Record<string, { revenue: number; cost: number }> = {
      cash: { revenue: 0, cost: 0 },
      pix: { revenue: 0, cost: 0 },
      debit_card: { revenue: 0, cost: 0 },
      credit_card: { revenue: 0, cost: 0 },
    };
    for (const sale of periodSales) {
      const saleTotal = getSaleTotal(sale);
      if (saleTotal <= 0) continue;
      let costOfSale = 0;
      for (const item of sale.items || []) {
        const product = productsById.get(item.productId);
        const unitCost = product ? product.costPrice : (item.unitPrice || 0) * 0.6;
        costOfSale += (unitCost || 0) * (item.quantity || 0);
      }
      const payments = (sale.payments && sale.payments.length > 0)
        ? sale.payments
        : [{ method: 'cash', amount: saleTotal }];
      for (const payment of payments) {
        const amount = payment.amount || 0;
        if (!(payment.method in totals)) continue;
        const ratio = saleTotal > 0 ? amount / saleTotal : 0;
        totals[payment.method].revenue += amount;
        totals[payment.method].cost += costOfSale * ratio;
      }
    }
    return methods.map((m) => {
      const t = totals[m.key];
      return { ...m, revenue: t.revenue, cost: t.cost, profit: t.revenue - t.cost };
    });
  }, [periodSales, productsById]);

  // ── VENDAS POR CATEGORIA (receita) ──────────────────────────────
  const revenueByCategory = useMemo(() => {
    const catMap = new Map<string, number>();
    for (const sale of periodSales) {
      for (const item of sale.items || []) {
        // Encontrar a categoria do produto pelo ID
        const product = products.find((p) => p.id === item.productId);
        const catName = product?.category || 'Sem Categoria';
        catMap.set(catName, (catMap.get(catName) || 0) + item.total);
      }
    }
    const total = Array.from(catMap.values()).reduce((a, b) => a + b, 0) || 1;
    return Array.from(catMap.entries())
      .map(([name, value]) => ({ name, value, pct: (value / total) * 100 }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [periodSales, products]);

  // ── FORMAS DE PAGAMENTO (distribuição percentual) ───────────────
  const paymentDistribution = useMemo(() => {
    const payMap = new Map<string, number>();
    for (const sale of periodSales) {
      for (const pay of sale.payments || []) {
        const labels: Record<string, string> = {
          cash: 'Dinheiro', pix: 'PIX', credit_card: 'Crédito',
          debit_card: 'Débito', credit_account: 'Fiado',
        };
        const label = labels[pay.method] || pay.method;
        payMap.set(label, (payMap.get(label) || 0) + (pay.amount || getSaleTotal(sale)));
      }
    }
    const total = Array.from(payMap.values()).reduce((a, b) => a + b, 0) || 1;
    return Array.from(payMap.entries())
      .map(([name, value]) => ({ name, value, pct: (value / total) * 100 }))
      .sort((a, b) => b.value - a.value);
  }, [periodSales]);

  // ── CURVA ABC (produtos por RECEITA, não só quantidade) ─────────
  const abcByRevenue = useMemo(() => {
    const revMap = new Map<string, { name: string; revenue: number; qty: number }>();
    for (const sale of periodSales) {
      for (const item of sale.items || []) {
        const existing = revMap.get(item.productId);
        if (existing) {
          existing.revenue += item.total;
          existing.qty += item.quantity;
        } else {
          revMap.set(item.productId, { name: item.productName, revenue: item.total, qty: item.quantity });
        }
      }
    }
    const total = Array.from(revMap.values()).reduce((a, b) => a + b.revenue, 0) || 1;
    let cumulative = 0;
    return Array.from(revMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8)
      .map((item) => {
        cumulative += (item.revenue / total) * 100;
        return { ...item, pct: (item.revenue / total) * 100, cumulative };
      });
  }, [periodSales]);

  // ── CARDÁPIO DIGITAL: Produtos mais pedidos + Horários de pico ────
  const cardapioStats = useMemo(() => {
    const cardapioSales = sales.filter((s) => s.orderSource === 'cardapio_digital');
    // Produtos mais pedidos
    const productCount = new Map<string, { name: string; qty: number; revenue: number }>();
    const hourCount = new Array(24).fill(0);

    for (const sale of cardapioSales) {
      const hour = new Date(sale.date).getHours();
      hourCount[hour]++;
      for (const item of sale.items || []) {
        const existing = productCount.get(item.productName);
        if (existing) {
          existing.qty += item.quantity;
          existing.revenue += item.total;
        } else {
          productCount.set(item.productName, { name: item.productName, qty: item.quantity, revenue: item.total });
        }
      }
    }

    const topProducts = Array.from(productCount.values())
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);

    // Horários de pico (top 3)
    const peakHours = hourCount
      .map((count, hour) => ({ hour, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    return { topProducts, peakHours, totalOrders: cardapioSales.length };
  }, [sales]);

  // Delete venda — handler único (usado no desktop e no mobile), com
  // confirmação, tratamento de erro amigável e botão "Desfazer" no toast.
  const handleConfirmDeleteSale = async () => {
    const sale = confirmDeleteSale;
    if (!sale) return;
    setConfirmDeleteSale(null);
    try {
      const res = await storageService.cancelSaleWithStockRestore(sale.id);
      if (!res.success) {
        addToast('error', res.message || 'Não foi possível cancelar a venda. Tente novamente.');
        posAudio.error();
        return;
      }
      setExpandedSaleId(null);
      posAudio.click();
      addToast('success', `Venda ${sale.code || ''} cancelada — estoque restaurado.`, 6000);
    } catch (err: any) {
      addToast('error', friendlyErrorMessage(err, 'Não foi possível excluir a venda. Tente novamente.'));
      posAudio.error();
    }
  };

  // Initial loading simulation
  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 600);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="p-3 sm:p-4 md:p-6 lg:p-8 space-y-4 sm:space-y-6 max-w-7xl mx-auto">
      {/* Top Banner & Quick Action Buttons */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 p-4 sm:p-6 rounded-2xl bg-[#18181b] border border-[#27272a] text-white shadow-xl">
        <div>
          <h2 className="font-serif-italic text-2xl font-light tracking-tight flex items-center gap-3">
            Visão Geral
            <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 font-sans font-bold uppercase tracking-wider">
              ONLINE
            </span>
          </h2>
          <p className="text-xs text-[#a1a1aa] mt-1">
            Consolidado de faturamento, fluxo de vendas e indicadores em tempo real.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Filtro temporal de faturamento — Data/Hora Inicial / Final */}
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[#a1a1aa]" />
            <DateTimeRangeFilter
              startDate={dateFrom}
              endDate={dateTo}
              onStartChange={setDateFrom}
              onEndChange={setDateTo}
              labelStart="De"
              labelEnd="Até"
              inputClassName="px-3 py-2 rounded-xl bg-[#27272a] border border-[#3f3f46] text-xs font-medium text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>
      </div>

      {/* KPI METRIC CARDS GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
        {/* Card 1: Faturamento no período selecionado */}
        <button onClick={() => onNavigateTab('finance')} className="p-4 sm:p-6 rounded-2xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] shadow-sm transition-all hover:border-slate-300 dark:hover:border-[#3f3f46] cursor-pointer hover:shadow-md hover:scale-[1.01] text-left w-full">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-[#71717a] font-bold flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            Faturamento
          </p>
          <p className="text-2xl sm:text-3xl font-light mt-2 tracking-tighter text-slate-900 dark:text-white">
            R$ {periodRevenue.toFixed(2)}
          </p>
          <div className="mt-3 sm:mt-4 text-xs text-emerald-500 flex items-center gap-1 font-medium">
            {periodRevenue > 0 ? <span className="text-emerald-500">✓ </span> : <span className="text-slate-400">—</span>}
            <span className="text-slate-400 dark:text-[#71717a]">
              {periodSales.length} transação{periodSales.length !== 1 ? 's' : ''} no período
            </span>
          </div>
        </button>

        {/* Card 2: Alerta de Estoque Baixo */}
        <button onClick={() => onNavigateTab('inventory')} className="p-4 sm:p-6 rounded-2xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] shadow-sm transition-all hover:border-slate-300 dark:hover:border-[#3f3f46] cursor-pointer hover:shadow-md hover:scale-[1.01] text-left w-full">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-[#71717a] font-bold">Itens em Baixa</p>
          <p className="text-2xl sm:text-3xl font-light mt-2 tracking-tighter text-slate-900 dark:text-white">
            {lowStockCount < 10 ? `0${lowStockCount}` : lowStockCount}
          </p>
          <div className="mt-3 sm:mt-4 text-xs text-amber-500 flex items-center gap-1 font-medium">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>! Alerta</span> <span className="text-slate-400 dark:text-[#71717a]">Reposição necessária</span>
          </div>
        </button>

        {/* Card 3: Resumo de Lotes */}
        {useLotsProductIds.length > 0 && (
          <button onClick={() => onNavigateTab('inventory')} className="p-4 sm:p-6 rounded-2xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] shadow-sm transition-all hover:border-slate-300 dark:hover:border-[#3f3f46] cursor-pointer hover:shadow-md hover:scale-[1.01] text-left w-full">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-[#71717a] font-bold flex items-center gap-1">
              <Package className="w-3 h-3" />
              Lotes Ativos
            </p>
            <p className="text-2xl sm:text-3xl font-light mt-2 tracking-tighter text-slate-900 dark:text-white">
              {lotSummary.totalActive}
            </p>
            <div className="mt-3 sm:mt-4 text-xs flex items-center gap-2 font-medium">
              {lotSummary.expired > 0 && (
                <span className="text-rose-500 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> {lotSummary.expired} vencido{lotSummary.expired > 1 ? 's' : ''}
                </span>
              )}
              {lotSummary.expiring > 0 && (
                <span className="text-amber-500 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {lotSummary.expiring} próximo{lotSummary.expiring > 1 ? 's' : ''}
                </span>
              )}
              {lotSummary.expired === 0 && lotSummary.expiring === 0 && (
                <span className="text-emerald-500">✓ Todos ok</span>
              )}
            </div>
          </button>
        )}
      </div>

      {/* ── LUCRO POR FORMA DE PAGAMENTO ────────────── */}
      {periodSales.length > 0 && (
        <div className="p-4 sm:p-6 bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-2xl shadow-sm">
          <h3 className="text-xs uppercase tracking-widest font-bold text-slate-500 dark:text-[#71717a] mb-4 flex items-center gap-2">
            <TrendingUp className="w-3.5 h-3.5" />
            Lucro por Forma de Pagamento
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {profitByPayment.map((pay) => {
              const isPix = pay.key === 'pix';
              const isDebit = pay.key === 'debit_card';
              const isCredit = pay.key === 'credit_card';
              const isCash = pay.key === 'cash';
              const barColor = isPix ? 'bg-emerald-500' : isDebit ? 'bg-amber-500' : isCredit ? 'bg-indigo-500' : 'bg-slate-400';
              const labelColor = isPix ? 'text-emerald-600' : isDebit ? 'text-amber-600' : isCredit ? 'text-indigo-600' : 'text-slate-600';
              const maxProfit = Math.max(...profitByPayment.map(p => p.profit), 1);
              const barWidth = pay.profit > 0 ? Math.max((pay.profit / maxProfit) * 100, 8) : 0;
              return (
                <div key={pay.key} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] uppercase tracking-wider font-bold ${labelColor}`}>
                      {pay.label}
                    </span>
                    <span className={`text-xs font-bold ${pay.profit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                      R$ {pay.profit.toFixed(2)}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 dark:bg-[#27272a] rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${barWidth}%` }} />
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>Fatur: R$ {pay.revenue.toFixed(2)}</span>
                    <span>Custo: R$ {pay.cost.toFixed(2)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── ALERTAS DE VALIDADE (produtos + lotes) ────────────── */}
      {(expiredProducts.length > 0 || expiringProducts.length > 0 || expiredLots.length > 0 || expiringLots.length > 0) && (
        <div className="bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-2xl overflow-hidden shadow-sm">
          <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-200 dark:border-[#27272a] flex items-center gap-2 flex-wrap">
            <Calendar className="w-4 h-4 text-amber-500" />
            <h3 className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white">Alertas de Validade</h3>
            {expiredProducts.length + expiredLots.length > 0 && (
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 border border-rose-500/20">
                {expiredProducts.length + expiredLots.length} vencido{(expiredProducts.length + expiredLots.length) > 1 ? 's' : ''}
              </span>
            )}
            {expiringProducts.length + expiringLots.length > 0 && (
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20">
                {expiringProducts.length + expiringLots.length} próximo{(expiringProducts.length + expiringLots.length) > 1 ? 's' : ''} ao vencimento
              </span>
            )}
          </div>
          <div className="p-4 space-y-3">
            {/* VENCIDOS */}
            {(expiredProducts.length > 0 || expiredLots.length > 0) && (
              <div>
                <p className="text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Vencidos
                </p>
                <div className="space-y-1.5">
                  {/* Produtos sem lote vencidos */}
                  {expiredProducts.slice(0, 5).map((p) => (
                    <div key={`prod-${p.id}`} className="flex items-center justify-between p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/40 text-xs">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-rose-900 dark:text-rose-200 truncate">{p.name}</p>
                        <p className="text-[10px] text-rose-600 dark:text-rose-400">
                          Validade: {new Date(p.expirationDate + 'T12:00:00').toLocaleDateString('pt-BR')} • Estoque: {p.currentStock} {p.unit}
                        </p>
                      </div>
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 shrink-0 ml-2">
                        VENCIDO
                      </span>
                    </div>
                  ))}
                  {/* Lotes vencidos */}
                  {expiredLots.slice(0, 5).map((lot) => {
                    const productName = getProductName(lot.productId);
                    return (
                      <div key={`lot-${lot.id}`} className="flex items-center justify-between p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/40 text-xs">
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-rose-900 dark:text-rose-200 truncate">{productName}</p>
                          <p className="text-[10px] text-rose-600 dark:text-rose-400">
                            Lote {lot.lotNumber} • Validade: {new Date(lot.expirationDate + 'T12:00:00').toLocaleDateString('pt-BR')} • Qtd: {lot.quantity}
                          </p>
                        </div>
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 shrink-0 ml-2">
                          VENCIDO
                        </span>
                      </div>
                    );
                  })}
                  {(expiredProducts.length + expiredLots.length) > 5 && (
                    <p className="text-[10px] text-slate-400 dark:text-[#71717a] text-center">
                      + {(expiredProducts.length + expiredLots.length) - 5} outros vencidos
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* PRÓXIMOS AO VENCIMENTO (30 dias) */}
            {(expiringProducts.length > 0 || expiringLots.length > 0) && (
              <div>
                <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Próximos ao Vencimento (30 dias)
                </p>
                <div className="space-y-1.5">
                  {/* Produtos sem lote próximos */}
                  {expiringProducts.slice(0, 5).map((p) => {
                    const expDate = new Date(p.expirationDate + 'T12:00:00');
                    const daysUntil = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                    return (
                      <div key={`prod-${p.id}`} className="flex items-center justify-between p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 text-xs">
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-amber-900 dark:text-amber-200 truncate">{p.name}</p>
                          <p className="text-[10px] text-amber-600 dark:text-amber-400">
                            Validade: {expDate.toLocaleDateString('pt-BR')} • Estoque: {p.currentStock} {p.unit}
                          </p>
                        </div>
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0 ml-2 ${
                          daysUntil <= 7 ? 'bg-rose-500/10 text-rose-600' :
                          daysUntil <= 14 ? 'bg-amber-500/10 text-amber-600' :
                          'bg-yellow-500/10 text-yellow-600'
                        }`}>
                          {daysUntil} dia{daysUntil > 1 ? 's' : ''}
                        </span>
                      </div>
                    );
                  })}
                  {/* Lotes próximos ao vencimento */}
                  {expiringLots.slice(0, 5).map((lot) => {
                    const expDate = new Date(lot.expirationDate + 'T12:00:00');
                    const daysUntil = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                    const productName = getProductName(lot.productId);
                    return (
                      <div key={`lot-${lot.id}`} className="flex items-center justify-between p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 text-xs">
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-amber-900 dark:text-amber-200 truncate">{productName}</p>
                          <p className="text-[10px] text-amber-600 dark:text-amber-400">
                            Lote {lot.lotNumber} • Validade: {expDate.toLocaleDateString('pt-BR')} • Qtd: {lot.quantity}
                          </p>
                        </div>
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0 ml-2 ${
                          daysUntil <= 7 ? 'bg-rose-500/10 text-rose-600' :
                          daysUntil <= 14 ? 'bg-amber-500/10 text-amber-600' :
                          'bg-yellow-500/10 text-yellow-600'
                        }`}>
                          {daysUntil} dia{daysUntil > 1 ? 's' : ''}
                        </span>
                      </div>
                    );
                  })}
                  {(expiringProducts.length + expiringLots.length) > 5 && (
                    <p className="text-[10px] text-slate-400 dark:text-[#71717a] text-center">
                      + {(expiringProducts.length + expiringLots.length) - 5} outros próximos ao vencimento
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CHARTS & TABLES GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
        {/* Recent Activity Table */}
        <div className="lg:col-span-8 bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-2xl overflow-hidden shadow-sm">
          <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-200 dark:border-[#27272a] flex justify-between items-center">
            <h3 className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white">Vendas Recentes</h3>
            <button
              onClick={() => onNavigateTab('finance')}
              className="text-[10px] text-slate-500 dark:text-[#a1a1aa] hover:text-slate-900 dark:hover:text-white underline tracking-widest uppercase font-bold"
            >
              Ver Todas
            </button>
          </div>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] text-slate-500 dark:text-[#71717a] uppercase border-b border-slate-200 dark:border-[#27272a] bg-slate-50 dark:bg-[#09090b]/50">
                <th className="px-3 sm:px-6 py-3 font-bold">ID</th>
                <th className="px-3 sm:px-6 py-3 font-bold">Data/Hora</th>
                <th className="px-3 sm:px-6 py-3 font-bold">Cliente</th>
                <th className="px-3 sm:px-6 py-3 font-bold">Operador</th>
                <th className="px-3 sm:px-6 py-3 font-bold">Status</th>
                <th className="px-3 sm:px-6 py-3 text-right font-bold">Valor</th>
              </tr>
            </thead>
            <tbody className="text-xs divide-y divide-slate-100 dark:divide-[#27272a] text-slate-800 dark:text-slate-200">
              {sales.slice(0, 5).map((sale) => {
                const isExpanded = expandedSaleId === sale.id;
                return (
                  <React.Fragment key={sale.id}>
                    <tr
                      onClick={() => setExpandedSaleId(isExpanded ? null : sale.id)}
                      className="hover:bg-slate-50 dark:hover:bg-[#27272a]/30 transition-colors cursor-pointer"
                    >
                      <td className="px-3 sm:px-6 py-3 sm:py-4 font-mono text-slate-500 dark:text-[#a1a1aa]">
                        <span className="flex items-center gap-1.5">
                          #{sale.code || sale.id.slice(-4)}
                          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </span>
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-slate-500 dark:text-[#a1a1aa] text-[11px] whitespace-nowrap">
                        {new Date(sale.date).toLocaleString('pt-BR')}
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 font-medium">{sale.customerName || 'Cliente Consumidor'}</td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-slate-500 dark:text-[#a1a1aa] text-[11px]">{sale.operatorName}</td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4">
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-[9px] font-bold uppercase tracking-wider">
                          CONCLUÍDO
                        </span>
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-right font-semibold">R$ {getSaleTotal(sale).toFixed(2)}</td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={6} className="px-3 sm:px-6 py-4 bg-slate-50 dark:bg-[#09090b]/50 border-b border-slate-200 dark:border-[#27272a]">
                          <div className="space-y-3">
                            <div>
                              <p className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-[#71717a] font-bold mb-2">Itens Comprados</p>
                              <div className="space-y-1">
                                {(sale.items || []).map((item, idx) => (
                                  <div key={idx} className="flex items-center justify-between gap-2 text-[11px] px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#18181b] border border-slate-100 dark:border-[#27272a]">
                                    <span className="font-medium text-slate-900 dark:text-white truncate min-w-0">{item.productName}</span>
                                    <span className="text-slate-500 dark:text-[#a1a1aa] shrink-0">{item.quantity}x R$ {item.unitPrice.toFixed(2)} = R$ {item.total.toFixed(2)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3 text-[11px]">
                              <div>
                                <span className="text-slate-500 dark:text-[#71717a] font-bold">Pagamento: </span>
                                <span className="text-slate-900 dark:text-white font-medium">
                                  {sale.payments.map((p) => {
                                    const labels: Record<string, string> = { cash: 'Dinheiro', pix: 'PIX', credit_card: 'Cartão Crédito', debit_card: 'Cartão Débito', credit_account: 'Conta Fiado' };
                                    return labels[p.method] || p.method;
                                  }).join(', ')}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-500 dark:text-[#71717a] font-bold">Operador: </span>
                                <span className="text-slate-900 dark:text-white font-medium">{sale.operatorName}</span>
                              </div>
                            </div>
                            <div className="pt-2 border-t border-slate-200 dark:border-[#27272a]">
                              <button
                                onClick={(e) => { e.stopPropagation(); reprintSaleReceipt(sale); }}
                                className="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-[#27272a] text-slate-600 dark:text-slate-300 text-[10px] font-bold"
                              >
                                Imprimir Cupom
                              </button>
                            </div>
                            {isAdmin && (
                              <div className="pt-2 border-t border-slate-200 dark:border-[#27272a]">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setConfirmDeleteSale(sale);
                                  }}
                                  className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-[10px] font-bold transition-colors flex items-center gap-1.5"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  Excluir Venda
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {sales.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 dark:text-[#52525b] text-xs">
                    Nenhuma venda registrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>

          {/* Mobile card layout */}
          <div className="block md:hidden p-3 space-y-3">
            {sales.slice(0, 5).map((sale) => {
              const isExpanded = expandedSaleId === sale.id;
              return (
                <div
                  key={sale.id}
                  onClick={() => setExpandedSaleId(isExpanded ? null : sale.id)}
                  className="p-3 rounded-xl bg-slate-50 dark:bg-[#09090b]/50 border border-slate-200 dark:border-[#27272a] cursor-pointer active:bg-slate-100 dark:active:bg-[#27272a]/30 transition-colors"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-mono text-[11px] text-slate-500 dark:text-[#a1a1aa] font-bold">
                      #{sale.code || sale.id.slice(-4)}
                    </span>
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
                  </div>
                  <p className="text-xs font-medium text-slate-900 dark:text-white mb-0.5">
                    {sale.customerName || 'Cliente Consumidor'}
                  </p>
                  <p className="text-[10px] text-slate-400 dark:text-[#71717a] mb-1.5">
                    {new Date(sale.date).toLocaleString('pt-BR')} • {sale.operatorName}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-[9px] font-bold uppercase tracking-wider">
                      CONCLUÍDO
                    </span>
                    <span className="text-sm font-bold text-slate-900 dark:text-white">R$ {getSaleTotal(sale).toFixed(2)}</span>
                  </div>

                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-slate-200 dark:border-[#27272a] space-y-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-[#71717a] font-bold mb-2">Itens Comprados</p>
                        <div className="space-y-1">
                          {(sale.items || []).map((item, idx) => (
                            <div key={idx} className="flex items-center justify-between gap-2 text-[11px] px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#18181b] border border-slate-100 dark:border-[#27272a]">
                              <span className="font-medium text-slate-900 dark:text-white truncate min-w-0">{item.productName}</span>
                              <span className="text-slate-500 dark:text-[#a1a1aa] shrink-0">{item.quantity}x R$ {item.unitPrice.toFixed(2)} = R$ {item.total.toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div>
                          <span className="text-slate-500 dark:text-[#71717a] font-bold">Pagamento: </span>
                          <span className="text-slate-900 dark:text-white font-medium">
                            {sale.payments.map((p) => {
                              const labels: Record<string, string> = { cash: 'Dinheiro', pix: 'PIX', credit_card: 'Cartão Crédito', debit_card: 'Cartão Débito', credit_account: 'Conta Fiado' };
                              return labels[p.method] || p.method;
                            }).join(', ')}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 dark:text-[#71717a] font-bold">Operador: </span>
                          <span className="text-slate-900 dark:text-white font-medium">{sale.operatorName}</span>
                        </div>
                      </div>
                      {isAdmin && (
                        <div className="pt-2 border-t border-slate-200 dark:border-[#27272a]">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDeleteSale(sale);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-[10px] font-bold transition-colors flex items-center gap-1.5"
                          >
                            <Trash2 className="w-3 h-3" />
                            Excluir Venda
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {sales.length === 0 && (
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#09090b]/50 border border-slate-200 dark:border-[#27272a] text-center text-xs text-slate-400">
                Nenhuma venda registrada hoje.
              </div>
            )}
          </div>
        </div>

        {/* Right Column Widgets */}
        <div className="lg:col-span-4 space-y-4 sm:space-y-6">
          {/* Upcoming Payments Widget - Dados reais do Financeiro */}
          <button onClick={() => onNavigateTab('finance')} className="p-4 sm:p-6 bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-2xl shadow-sm cursor-pointer hover:shadow-md hover:border-slate-300 dark:hover:border-[#3f3f46] transition-all text-left w-full">
            <h3 className="text-xs uppercase tracking-widest font-bold text-slate-500 dark:text-[#71717a] mb-4">Próximos Pagamentos</h3>
            <div className="space-y-4">
              {(() => {
                const pending = financialAccounts
                  .filter(a => a.type === 'payable' && a.status === 'pending')
                  .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
                  .slice(0, 3);
                const total = pending.reduce((s, a) => s + a.amount, 0);
                if (pending.length === 0) {
                  return <p className="text-xs text-slate-400 dark:text-[#71717a]">Nenhum pagamento pendente</p>;
                }
                return (
                  <>
                    {pending.map(acc => (
                      <div key={acc.id} className="flex items-center justify-between text-xs">
                        <span className="text-slate-600 dark:text-[#a1a1aa] truncate max-w-[70%]">{acc.title}</span>
                        <span className="font-medium text-rose-500">R$ {acc.amount.toFixed(2).replace('.', ',')}</span>
                      </div>
                    ))}
                    <div className="h-px bg-slate-200 dark:bg-[#27272a] my-2"></div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-900 dark:text-white font-bold">Total Pendente</span>
                      <span className="font-bold text-slate-900 dark:text-white">R$ {total.toFixed(2).replace('.', ',')}</span>
                    </div>
                  </>
                );
              })()}
            </div>
          </button>

          {/* Highlight Product Widget */}
          <button onClick={() => onNavigateTab('inventory')} className="p-4 sm:p-6 bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-2xl shadow-sm cursor-pointer hover:shadow-md hover:border-slate-300 dark:hover:border-[#3f3f46] transition-all text-left w-full">
            <h3 className="text-xs uppercase tracking-widest font-bold text-slate-500 dark:text-[#71717a] mb-4">Destaque do Mês</h3>
            {topSellingProducts.length > 0 ? (
              <div className="space-y-3">
                {topSellingProducts.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-sm font-bold text-indigo-600 dark:text-indigo-400 shrink-0">
                      {idx + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{item.name}</p>
                      <p className="text-[10px] text-slate-500 dark:text-[#71717a]">{item.qty} unidades vendidas</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-xl shrink-0">📦</div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900 dark:text-white">Nenhum produto vendido</p>
                  <p className="text-[10px] text-slate-500 dark:text-[#71717a]">este mês</p>
                </div>
              </div>
            )}
          </button>

          {/* BI: Vendas por Categoria (período selecionado) */}
          <div className="p-4 sm:p-6 bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-2xl shadow-sm">
            <h3 className="text-xs uppercase tracking-widest font-bold text-slate-500 dark:text-[#71717a] mb-4 flex items-center gap-2">
              <PieChart className="w-3.5 h-3.5" />
              Vendas por Categoria
            </h3>
            {revenueByCategory.length > 0 ? (
              <div className="space-y-2.5">
                {revenueByCategory.map((cat, idx) => (
                  <div key={idx}>
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="font-medium text-slate-700 dark:text-slate-300 truncate">{cat.name}</span>
                      <span className="font-bold text-slate-900 dark:text-white">R$ {cat.value.toFixed(2)}</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 dark:bg-[#27272a] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full transition-all"
                        style={{ width: `${Math.min(cat.pct, 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 dark:text-[#71717a]">Sem vendas no período</p>
            )}
          </div>

          {/* BI: Formas de Pagamento (distribuição) */}
          <div className="p-4 sm:p-6 bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-2xl shadow-sm">
            <h3 className="text-xs uppercase tracking-widest font-bold text-slate-500 dark:text-[#71717a] mb-4 flex items-center gap-2">
              <CreditCard className="w-3.5 h-3.5" />
              Formas de Pagamento
            </h3>
            {paymentDistribution.length > 0 ? (
              <div className="space-y-2.5">
                {paymentDistribution.map((pay, idx) => (
                  <div key={idx} className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-indigo-500" />
                      <span className="font-medium text-slate-700 dark:text-slate-300">{pay.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 dark:text-white">R$ {pay.value.toFixed(2)}</span>
                      <span className="text-[10px] text-slate-400 dark:text-[#71717a]">({pay.pct.toFixed(0)}%)</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 dark:text-[#71717a]">Sem vendas no período</p>
            )}
          </div>

          {/* BI: Curva ABC (produtos por receita) */}
          <div className="p-4 sm:p-6 bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-2xl shadow-sm">
            <h3 className="text-xs uppercase tracking-widest font-bold text-slate-500 dark:text-[#71717a] mb-4 flex items-center gap-2">
              <TrendingUp className="w-3.5 h-3.5" />
              Curva ABC (Receita)
            </h3>
            {abcByRevenue.length > 0 ? (
              <div className="space-y-2">
                {abcByRevenue.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-[11px]">
                    <span className={`w-5 h-5 rounded text-[9px] font-bold flex items-center justify-center shrink-0 ${
                      item.cumulative <= 80 ? 'bg-emerald-500/10 text-emerald-600' :
                      item.cumulative <= 95 ? 'bg-amber-500/10 text-amber-600' :
                      'bg-rose-500/10 text-rose-600'
                    }`}>
                      {idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-700 dark:text-slate-300 truncate">{item.name}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-slate-900 dark:text-white">R$ {item.revenue.toFixed(2)}</p>
                      <p className="text-[9px] text-slate-400">{item.cumulative.toFixed(0)}% acum.</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 dark:text-[#71717a]">Sem vendas no período</p>
            )}
          </div>
        </div>
      </div>

      {/* BI: Cardápio Digital (produtos mais pedidos + horários de pico) */}
      <div className="p-4 sm:p-6 bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-2xl shadow-sm">
        <h3 className="text-xs uppercase tracking-widest font-bold text-slate-500 dark:text-[#71717a] mb-4 flex items-center gap-2">
          <TrendingUp className="w-3.5 h-3.5" />
          Cardápio Digital
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-teal-500/10 text-teal-600 border border-teal-500/20 ml-auto">
            {cardapioStats.totalOrders} pedido(s)
          </span>
        </h3>
        {cardapioStats.totalOrders > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Produtos mais pedidos */}
            <div>
              <p className="text-[10px] font-bold text-slate-500 dark:text-[#71717a] mb-2 flex items-center gap-1">
                <Flame className="w-3 h-3 text-orange-500" />
                Produtos Mais Pedidos
              </p>
              <div className="space-y-1.5">
                {cardapioStats.topProducts.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-[11px]">
                    <span className={`w-5 h-5 rounded text-[9px] font-bold flex items-center justify-center shrink-0 ${
                      idx === 0 ? 'bg-amber-500/10 text-amber-600' :
                      idx === 1 ? 'bg-slate-500/10 text-slate-600' :
                      'bg-orange-500/10 text-orange-600'
                    }`}>
                      {idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-700 dark:text-slate-300 truncate">{item.name}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-slate-900 dark:text-white">{item.qty}x</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Horários de pico */}
            <div>
              <p className="text-[10px] font-bold text-slate-500 dark:text-[#71717a] mb-2 flex items-center gap-1">
                <Clock className="w-3 h-3 text-blue-500" />
                Horários de Pico
              </p>
              <div className="space-y-1.5">
                {cardapioStats.peakHours.map((peak, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-[11px]">
                    <span className={`w-5 h-5 rounded text-[9px] font-bold flex items-center justify-center shrink-0 ${
                      idx === 0 ? 'bg-blue-500/10 text-blue-600' :
                      idx === 1 ? 'bg-indigo-500/10 text-indigo-600' :
                      'bg-slate-500/10 text-slate-600'
                    }`}>
                      {idx + 1}
                    </span>
                    <div className="flex-1">
                      <p className="font-medium text-slate-700 dark:text-slate-300">
                        {String(peak.hour).padStart(2, '0')}:00 - {String(peak.hour + 1).padStart(2, '0')}:00
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-slate-900 dark:text-white">{peak.count} ped.</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-400 dark:text-[#71717a]">Sem pedidos do cardápio digital no período</p>
        )}
      </div>

      {/* COLLABORATOR PERFORMANCE — admin only */}
      {isAdmin && (
        <CollaboratorPerformance sales={sales} />
      )}

      {/* Confirm: excluir venda */}
      <ConfirmDialog
        isOpen={confirmDeleteSale !== null}
        title="Excluir venda?"
        message="A venda será removida do relatório e do financeiro. Você poderá desfazer logo em seguida."
        itemName={confirmDeleteSale ? `Venda ${confirmDeleteSale.code || confirmDeleteSale.id}` : undefined}
        confirmLabel="Excluir"
        onConfirm={handleConfirmDeleteSale}
        onCancel={() => setConfirmDeleteSale(null)}
      />
    </div>
  );
};
