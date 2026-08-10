import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Skeleton, TableSkeleton } from '../shared/Skeleton';
import {
  ShoppingCart,
  AlertTriangle,
  Package,
  ArrowUpRight,
  Trash2,
  ChevronDown,
  ChevronUp,
  Users,
  TrendingUp,
  PieChart,
  CreditCard,
  Calendar,
  Clock,
  Flame,
} from 'lucide-react';
import { Product, Sale, UserProfile, FinancialAccount, CashRegisterSession, Category } from '../../types';
import { storageService } from '../../services/storageService';
import { CollaboratorPerformance } from './CollaboratorPerformance';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { useToast } from '../shared/Toast';
import { undoManager } from '../../lib/undoManager';
import { posAudio } from '../../services/audioService';
import { friendlyErrorMessage } from '../../lib/friendlyError';

type PeriodFilter = 'today' | 'week' | 'month';

interface DashboardViewProps {
  sales: Sale[];
  products: Product[];
  categories: Category[];
  user: UserProfile;
  financialAccounts: FinancialAccount[];
  caixaSession: CashRegisterSession;
  onNavigateTab: (tab: string) => void;
  onOpenCaixaModal: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  sales,
  products,
  categories,
  user,
  financialAccounts,
  caixaSession,
  onNavigateTab,
  onOpenCaixaModal,
}) => {
  const isAdmin = user.role === 'admin';
  const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodFilter>('today');
  const [confirmDeleteSale, setConfirmDeleteSale] = useState<Sale | null>(null);
  const { addToast } = useToast();

  // Calculate today vs yesterday sales for Day Summary
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayStart = new Date(todayStr);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  const todaySales = sales.filter((s) => s.date.slice(0, 10) === todayStr);

  const getSaleTotal = (s: Sale) => {
    if (s.total > 0) return s.total;
    const itemsTotal = s.items?.reduce((sum, item) => sum + (item.total || 0), 0) || 0;
    return itemsTotal;
  };

  const todayRevenue = todaySales.reduce((acc, s) => acc + getSaleTotal(s), 0);
  const totalSalesCount = todaySales.length;
  const ticketMedio = totalSalesCount > 0 ? todayRevenue / totalSalesCount : 0;

  // Período do caixa aberto: enquanto o caixa está aberto, os cards de
  // faturamento/transações refletem as vendas desde a abertura (até fechar);
  // com o caixa fechado, volta a usar o dia de hoje como período.
  const caixaIsOpen = caixaSession?.status === 'open';
  const periodStart = caixaIsOpen && caixaSession?.openedAt ? new Date(caixaSession.openedAt) : todayStart;
  const caixaPeriodSales = caixaIsOpen
    ? sales.filter((s) => new Date(s.date) >= periodStart)
    : todaySales;
  const caixaPeriodRevenue = caixaPeriodSales.reduce((acc, s) => acc + getSaleTotal(s), 0);
  const caixaPeriodCount = caixaPeriodSales.length;
  const caixaPeriodTicket = caixaPeriodCount > 0 ? caixaPeriodRevenue / caixaPeriodCount : 0;

  const lowStockCount = products.filter((p) => p.currentStock <= p.minStock).length;

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

  // ── PERÍODO DE FILTRO (dia/semana/mês) ──────────────────────────
  const periodRange = useMemo(() => {
    const now = new Date();
    let start: Date;
    if (period === 'today') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (period === 'week') {
      start = new Date(now);
      start.setDate(now.getDate() - 7);
    } else {
      start = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    }
    return { start, end: now };
  }, [period]);

  const periodSales = useMemo(() => {
    return sales.filter((s) => {
      if (s.status !== 'completed') return false;
      const d = new Date(s.date);
      return d >= periodRange.start && d <= periodRange.end;
    });
  }, [sales, periodRange]);

  const periodRevenue = periodSales.reduce((acc, s) => acc + getSaleTotal(s), 0);
  const periodTicket = periodSales.length > 0 ? periodRevenue / periodSales.length : 0;

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
  const handleConfirmDeleteSale = () => {
    const sale = confirmDeleteSale;
    if (!sale) return;
    setConfirmDeleteSale(null);
    try {
      storageService.deleteSale(sale.id);
      setExpandedSaleId(null);
      posAudio.click();
      const action = undoManager.peek();
      addToast(
        'success',
        `Venda ${sale.code || ''} excluída.`,
        6000,
        action ? 'Desfazer' : undefined,
        action ? () => undoManager.undo() : undefined
      );
    } catch (err: any) {
      addToast('error', friendlyErrorMessage(err, 'Não foi possível excluir a venda. Tente novamente.'));
      posAudio.error();
    }
  };

  // Day Summary calculations
  const yesterdaySales = sales.filter((s) => {
    const d = new Date(s.date);
    return d >= yesterdayStart && d < todayStart;
  });

  const yesterdayRevenue = yesterdaySales.reduce((acc, s) => acc + getSaleTotal(s), 0);
  const revenueChange = yesterdayRevenue > 0 ? ((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100 : 0;

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
          {/* Seletor de período BI */}
          <div className="flex items-center bg-[#27272a] rounded-full border border-[#3f3f46] overflow-hidden">
            {([['today', 'Hoje'], ['week', 'Semana'], ['month', 'Mês']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setPeriod(key)}
                className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                  period === key ? 'bg-white text-black' : 'text-[#a1a1aa] hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={() => onNavigateTab('pdv')}
            className="px-4 py-2 bg-white text-black text-xs font-bold rounded-full hover:bg-slate-200 transition-colors shadow-md flex items-center gap-2"
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            <span>ABRIR PDV</span>
          </button>
          <button
            onClick={() => onNavigateTab('inventory')}
            className="px-4 py-2 bg-[#27272a] text-white hover:bg-[#3f3f46] font-semibold text-xs rounded-full border border-[#3f3f46] transition-colors flex items-center gap-2"
          >
            <Package className="w-3.5 h-3.5" />
            <span>ESTOQUE</span>
          </button>
        </div>
      </div>

      {/* KPI METRIC CARDS GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
        {/* Card 1: Faturamento do período selecionado */}
        <button onClick={() => onNavigateTab('finance')} className="p-4 sm:p-6 rounded-2xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] shadow-sm transition-all hover:border-slate-300 dark:hover:border-[#3f3f46] cursor-pointer hover:shadow-md hover:scale-[1.01] text-left w-full">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-[#71717a] font-bold flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {period === 'today' ? 'Faturamento Hoje' : period === 'week' ? 'Faturamento Semana' : 'Faturamento Mês'}
          </p>
          <p className="text-2xl sm:text-3xl font-light mt-2 tracking-tighter text-slate-900 dark:text-white">
            R$ {periodRevenue.toFixed(2)}
          </p>
          <div className="mt-3 sm:mt-4 text-xs text-emerald-500 flex items-center gap-1 font-medium">
            {periodRevenue > 0 ? <span className="text-emerald-500">✓ </span> : <span className="text-slate-400">—</span>}
            <span className="text-slate-400 dark:text-[#71717a]">
              {periodSales.length} transações no período
            </span>
          </div>
        </button>

        {/* Card 2: Ticket médio do período */}
        <button onClick={() => onNavigateTab('finance')} className="p-4 sm:p-6 rounded-2xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] shadow-sm transition-all hover:border-slate-300 dark:hover:border-[#3f3f46] cursor-pointer hover:shadow-md hover:scale-[1.01] text-left w-full">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-[#71717a] font-bold flex items-center gap-1">
            <TrendingUp className="w-3 h-3" />
            Ticket Médio
          </p>
          <p className="text-2xl sm:text-3xl font-light mt-2 tracking-tighter text-slate-900 dark:text-white">
            R$ {periodTicket.toFixed(2)}
          </p>
          <div className="mt-3 sm:mt-4 text-xs text-emerald-500 flex items-center gap-1 font-medium">
            <span className="text-slate-400 dark:text-[#71717a]">
              {period === 'today' ? 'dia' : period === 'week' ? 'última semana' : 'último mês'}
            </span>
          </div>
        </button>

        {/* Card 3: Faturamento do Caixa aberto (se aberto) */}
        {caixaIsOpen && (
          <button onClick={() => onNavigateTab('finance')} className="p-4 sm:p-6 rounded-2xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] shadow-sm transition-all hover:border-slate-300 dark:hover:border-[#3f3f46] cursor-pointer hover:shadow-md hover:scale-[1.01] text-left w-full">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-[#71717a] font-bold">Faturamento do Caixa</p>
            <p className="text-2xl sm:text-3xl font-light mt-2 tracking-tighter text-slate-900 dark:text-white">
              R$ {caixaPeriodRevenue.toFixed(2)}
            </p>
            <div className="mt-3 sm:mt-4 text-xs text-emerald-500 flex items-center gap-1 font-medium">
              <span className="text-slate-400 dark:text-[#71717a]">vendas desde a abertura</span>
            </div>
          </button>
        )}

        {/* Card 3: Alerta de Estoque Baixo */}
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
      </div>

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
